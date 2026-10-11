import type postgres from 'postgres';
import { EXPORT_FORMAT } from './format.ts';
import { appTables } from './read.ts';

type Tx = postgres.TransactionSql;

/**
 * Transaction ids are meaningless in another cluster, and one that coincides would stop
 * the next bump (spec, decision 7): never loaded, left NULL, excluded from the comparison.
 * A pgTAP test keeps this list equal to the xid8 columns of app.
 */
export const XID_MARKERS: Readonly<Record<string, readonly string[]>> = {
	families: ['data_version_xid'],
	catalogue_state: ['version_xid'],
};

/**
 * Rows the migrations themselves insert, recognised only while untouched: a destination
 * just prepared with the migrations holds them, a used one does not pass.
 */
export const MIGRATION_ROWS: Readonly<Record<string, string>> = {
	catalogue_state: 'id and version = 1 and version_xid is null',
};

export class RestoreError extends Error {
	readonly reason: 'format' | 'unknown_migrations' | 'migrations' | 'tables' | 'not_empty' | 'columns' | 'load_failed' | 'orphans' | 'mismatch';
	/** Structural only: table, column, constraint names, migration versions, SQLSTATE codes. */
	readonly details: string[];
	constructor(reason: RestoreError['reason'], details: string[] = []) {
		super(details.length > 0 ? `${reason}: ${details.join(', ')}` : reason);
		this.name = 'RestoreError';
		this.reason = reason;
		this.details = details;
	}
}

export interface RestoreOptions {
	/** The export or the destination has no migrations list (migrations applied by hand). */
	acceptUnknownMigrations?: boolean;
}

export interface RestoreResult {
	tables: number;
	rows: number;
	users: number;
	identities: number;
}

interface Target {
	/** Qualified, quoted relation. */
	rel: string;
	/** Path of the rows in `doc` (json). */
	path: string;
	/** Display name, e.g. app.families. */
	name: string;
	/** Table name inside app, null for Auth. */
	appName: string | null;
}

const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
const quoteIdent = (name: string) => `"${name.replaceAll('"', '""')}"`;
const sqlState = (error: unknown) =>
	error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code) ? error.code : 'unknown';

async function columns(tx: Tx, rel: string): Promise<{ all: string[]; insertable: string[] }> {
	const rows = await tx.unsafe<{ name: string; generated: boolean }[]>(
		`select attname as name, attgenerated <> '' as generated from pg_attribute
		where attrelid = ${literal(rel)}::regclass and attnum > 0 and not attisdropped order by attnum`,
	);
	return { all: rows.map((r) => r.name), insertable: rows.filter((r) => !r.generated).map((r) => r.name) };
}

/** App tables in foreign-key order (parents first), alphabetical among peers; cycles appended. */
async function loadOrder(tx: Tx, names: string[]): Promise<string[]> {
	const edges = await tx<{ child: string; parent: string }[]>`
		select c.relname as child, p.relname as parent from pg_constraint k
		join pg_class c on c.oid = k.conrelid join pg_class p on p.oid = k.confrelid
		where k.contype = 'f' and c.relnamespace = 'app'::regnamespace and p.relnamespace = 'app'::regnamespace and c.oid <> p.oid`;
	const pending = new Set(names);
	const order: string[] = [];
	while (pending.size > 0) {
		const ready = [...pending].filter((n) => !edges.some((e) => e.child === n && pending.has(e.parent))).sort();
		for (const n of ready.length > 0 ? ready : [...pending].sort().slice(0, 1)) {
			order.push(n);
			pending.delete(n);
		}
	}
	return order;
}

async function targetsOf(tx: Tx): Promise<{ targets: Target[]; tables: Awaited<ReturnType<typeof appTables>> }> {
	const tables = await appTables(tx);
	const targets: Target[] = [
		{ rel: 'auth.users', path: `doc->'auth'->'users'`, name: 'auth.users', appName: null },
		{ rel: 'auth.identities', path: `doc->'auth'->'identities'`, name: 'auth.identities', appName: null },
		...(await loadOrder(tx, tables.map((t) => t.name))).map((name) => ({
			rel: `app.${quoteIdent(name)}`,
			path: `doc->'tables'->${literal(`app.${name}`)}`,
			name: `app.${name}`,
			appName: name,
		})),
	];
	return { targets, tables };
}

/**
 * Loads a decrypted export into a destination just prepared with the migrations, inside the
 * caller's transaction, then checks foreign keys and contents (spec, section 4). Rows go from
 * the document to the tables in SQL only: numbers never pass through JavaScript.
 */
export async function restoreExport(tx: Tx, document: string, options: RestoreOptions = {}): Promise<RestoreResult> {
	await tx`set local time zone 'UTC'`;
	// json, not jsonb: keeps the exact text of every table for the comparison.
	await tx`create temp table restore_document (doc json) on commit drop`;
	// Typed text: a parameter typed json would be serialised again, as a JSON string.
	await tx`insert into pg_temp.restore_document (doc) values (${document}::text::json)`;

	// 1. Format: never echo the value, it comes from the file.
	const [{ format }] = await tx<{ format: string | null }[]>`select doc->>'format' as format from pg_temp.restore_document`;
	if (format !== EXPORT_FORMAT) throw new RestoreError('format');

	// 2. Migrations
	const [{ exported, present }] = await tx<{ exported: string[] | null; present: boolean }[]>`
		select (doc->'migrations')::jsonb as exported, to_regclass('supabase_migrations.schema_migrations') is not null as present
		from pg_temp.restore_document`;
	if (!exported || !present) {
		if (!options.acceptUnknownMigrations) throw new RestoreError('unknown_migrations');
	} else {
		const target = (await tx<{ version: string }[]>`select version from supabase_migrations.schema_migrations`).map((r) => r.version);
		const diff = [
			...exported.filter((v) => !target.includes(v)).map((v) => `missing ${v}`),
			...target.filter((v) => !exported.includes(v)).map((v) => `extra ${v}`),
		];
		if (diff.length > 0) throw new RestoreError('migrations', diff);
	}

	// 3. Same tables
	const { targets, tables } = await targetsOf(tx);
	const exportedTables = (await tx<{ name: string }[]>`select json_object_keys(doc->'tables') as name from pg_temp.restore_document`).map((r) => r.name);
	const targetNames = tables.map((t) => `app.${t.name}`);
	const tableDiff = [
		...exportedTables.filter((n) => !targetNames.includes(n)).map((n) => `unknown ${n}`),
		...targetNames.filter((n) => !exportedTables.includes(n)).map((n) => `missing ${n}`),
	];
	if (tableDiff.length > 0) throw new RestoreError('tables', tableDiff);

	// 4. Empty, apart from the untouched rows the migrations insert
	const filled: string[] = [];
	for (const t of targets) {
		const initial = t.appName ? MIGRATION_ROWS[t.appName] : undefined;
		const [{ other }] = await tx.unsafe<{ other: boolean }[]>(
			`select exists (select 1 from ${t.rel} where ${initial ? `not (${initial})` : 'true'}) as other`,
		);
		if (other) filled.push(t.name);
	}
	if (filled.length > 0) throw new RestoreError('not_empty', filled);

	// 5. Every exported column exists; generated columns and xid markers are not loaded
	const plans: { target: Target; cols: string[] }[] = [];
	const unknown: string[] = [];
	for (const t of targets) {
		const keys = (await tx.unsafe<{ key: string }[]>(
			`select distinct json_object_keys(e) as key from pg_temp.restore_document, json_array_elements(${t.path}) e`,
		)).map((r) => r.key);
		const { all, insertable } = await columns(tx, t.rel);
		const markers = t.appName ? (XID_MARKERS[t.appName] ?? []) : [];
		unknown.push(...keys.filter((k) => !all.includes(k)).map((k) => `${t.name}.${k}`));
		plans.push({ target: t, cols: insertable.filter((c) => keys.includes(c) && !markers.includes(c)) });
	}
	if (unknown.length > 0) throw new RestoreError('columns', unknown);

	// 6. Load as exported: no counters, immutability checks or profile trigger
	await tx`set local session_replication_role = replica`;
	for (const [table, predicate] of Object.entries(MIGRATION_ROWS)) await tx.unsafe(`delete from app.${quoteIdent(table)} where ${predicate}`);
	let rows = 0;
	for (const { target, cols } of plans) {
		if (cols.length === 0) continue;
		const list = cols.map(quoteIdent).join(', ');
		try {
			const inserted = await tx.unsafe(
				`insert into ${target.rel} (${list}) select ${list}
				from json_populate_recordset(null::${target.rel}, (select ${target.path} from pg_temp.restore_document))`,
			);
			if (target.appName) rows += inserted.count;
		} catch (error) {
			// Postgres messages and details may quote row values: keep only where and which code.
			throw new RestoreError('load_failed', [target.name, sqlState(error)]);
		}
	}
	await tx`set local session_replication_role = origin`;

	// 7. No dangling references
	const fks = await tx<{ name: string; child: string; parent: string; childCols: string; parentCols: string }[]>`
		select k.conname as name, k.conrelid::regclass::text as child, k.confrelid::regclass::text as parent,
			(select string_agg(quote_ident(a.attname), ',' order by u.o) from unnest(k.conkey) with ordinality u(n, o)
				join pg_attribute a on a.attrelid = k.conrelid and a.attnum = u.n) as "childCols",
			(select string_agg(quote_ident(a.attname), ',' order by u.o) from unnest(k.confkey) with ordinality u(n, o)
				join pg_attribute a on a.attrelid = k.confrelid and a.attnum = u.n) as "parentCols"
		from pg_constraint k join pg_class c on c.oid = k.conrelid
		where k.contype = 'f' and (c.relnamespace = 'app'::regnamespace or k.conrelid in ('auth.users'::regclass, 'auth.identities'::regclass))`;
	const orphans: string[] = [];
	for (const fk of fks) {
		const childCols = fk.childCols.split(',');
		const parentCols = fk.parentCols.split(',');
		const [{ n }] = await tx.unsafe<{ n: number }[]>(
			`select count(*)::int as n from ${fk.child} c
			where ${childCols.map((col) => `c.${col} is not null`).join(' and ')}
				and not exists (select 1 from ${fk.parent} p where ${childCols.map((col, i) => `p.${parentCols[i]} = c.${col}`).join(' and ')})`,
		);
		if (n > 0) orphans.push(`${fk.child}.${fk.name}`);
	}
	if (orphans.length > 0) throw new RestoreError('orphans', orphans);

	// 8. Same content as the document
	const different = await verifyRestored(tx);
	if (different.length > 0) throw new RestoreError('mismatch', different);

	const [counts] = await tx<{ users: number; identities: number }[]>`
		select (select count(*)::int from auth.users) as users, (select count(*)::int from auth.identities) as identities`;
	return { tables: tables.length, rows, ...counts };
}

/**
 * Differences between the database and pg_temp.restore_document (spec, section 4):
 * exact text for app tables, exact jsonb values without the xid markers (which must be
 * NULL), and for Auth exact jsonb values of the exported columns only (a newer Auth may
 * add columns). No containment anywhere.
 */
export async function verifyRestored(tx: Tx): Promise<string[]> {
	await tx`set local time zone 'UTC'`;
	const { targets, tables } = await targetsOf(tx);
	const different: string[] = [];
	for (const table of tables) {
		const path = `doc->'tables'->${literal(`app.${table.name}`)}`;
		const markers = XID_MARKERS[table.name] ?? [];
		const query = markers.length === 0
			? `select (select coalesce(json_agg(t order by ${table.orderBy}), '[]')::text from app.${table.ident} t)
				= (select (${path})::text from pg_temp.restore_document) as same`
			: `select (select coalesce(jsonb_agg(to_jsonb(t) - ${literal(markers[0])}${markers.slice(1).map((m) => ` - ${literal(m)}`).join('')} order by ${table.orderBy}), '[]') from app.${table.ident} t)
					= (select coalesce(jsonb_agg(e::jsonb - ${literal(markers[0])}${markers.slice(1).map((m) => ` - ${literal(m)}`).join('')}), '[]')
						from pg_temp.restore_document, json_array_elements(${path}) e)
				and not exists (select 1 from app.${table.ident} t where ${markers.map((m) => `t.${quoteIdent(m)} is not null`).join(' or ')}) as same`;
		const [{ same }] = await tx.unsafe<{ same: boolean }[]>(query);
		if (!same) different.push(`app.${table.name}`);
	}
	for (const t of targets.slice(0, 2)) {
		// Project the destination rows on the exported columns, then compare values exactly.
		const [{ same }] = await tx.unsafe<{ same: boolean }[]>(
			// Exported columns and rows in two independent subqueries (verified on the local
			// Postgres: equal rows, a changed nested array, both empty, one extra row).
			`with keys as (
				select coalesce(array_agg(distinct k), '{}') as list
				from pg_temp.restore_document, json_array_elements(${t.path}) e, json_object_keys(e) k
			)
			select coalesce(
				(select coalesce(jsonb_agg((select jsonb_object_agg(c, to_jsonb(r)->c) from unnest(keys.list) c) order by r.id), '[]')
					from ${t.rel} r, keys)
				= (select coalesce(jsonb_agg(e::jsonb order by e->>'id'), '[]')
					from pg_temp.restore_document, json_array_elements(${t.path}) e),
				false) as same`,
		);
		if (!same) different.push(t.name);
	}
	return different;
}
