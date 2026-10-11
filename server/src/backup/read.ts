import type { Tx } from '../db.ts';
import { EXPORT_FORMAT } from './format.ts';

export interface TableDump {
	name: string;
	/** Quoted identifier, safe to splice into SQL. */
	ident: string;
	/** Primary key columns of alias `t`, for a deterministic order. */
	orderBy: string;
	/** JSON array text produced by Postgres. */
	rows: string;
	count: number;
}

export interface Snapshot {
	/** JSON text: array of applied migrations, or null when unknown. */
	migrations: string;
	/** JSON text: {"users": [...], "identities": [...]}. */
	auth: string;
	users: number;
	identities: number;
	tables: TableDump[];
}

/** Every table of app, discovered at each run: a new table is exported without code changes. */
export async function appTables(tx: Tx): Promise<{ name: string; ident: string; orderBy: string }[]> {
	const rows = await tx<{ name: string; ident: string; orderBy: string | null }[]>`
		select c.relname as name, quote_ident(c.relname) as ident,
			(select string_agg('t.' || quote_ident(a.attname), ', ' order by u.o)
				from unnest(k.conkey) with ordinality u(n, o)
				join pg_attribute a on a.attrelid = c.oid and a.attnum = u.n) as "orderBy"
		from pg_class c
		left join pg_constraint k on k.conrelid = c.oid and k.contype = 'p'
		where c.relnamespace = 'app'::regnamespace and c.relkind = 'r'
		order by c.relname collate "C"`;
	for (const row of rows) if (!row.orderBy) throw new Error(`app.${row.name} has no primary key`);
	return rows as { name: string; ident: string; orderBy: string }[];
}

/** Size of the document, computed in the database before any row reaches the Worker. */
export async function estimateExportBytes(tx: Tx): Promise<number> {
	await tx`set local time zone 'UTC'`;
	let total = 0;
	for (const table of await appTables(tx)) {
		const [{ bytes }] = await tx.unsafe<{ bytes: number }[]>(
			`select coalesce(sum(octet_length(row_to_json(t)::text) + 1), 2)::float8 as bytes from app.${table.ident} t`,
		);
		total += bytes + table.name.length + 8;
	}
	const [{ bytes }] = await tx<{ bytes: number }[]>`select octet_length(app.backup_auth_rows()::text)::float8 as bytes`;
	return total + bytes;
}

/** The whole database as JSON text, inside the caller's transaction (export or restore check). */
export async function readSnapshot(tx: Tx): Promise<Snapshot> {
	// Instants in UTC whatever the session: the restore does the same before comparing.
	await tx`set local time zone 'UTC'`;
	const tables: TableDump[] = [];
	for (const table of await appTables(tx)) {
		const [dump] = await tx.unsafe<{ rows: string; count: number }[]>(
			`select coalesce(json_agg(t order by ${table.orderBy}), '[]')::text as rows, count(*)::int as count from app.${table.ident} t`,
		);
		tables.push({ ...table, ...dump });
	}
	const [auth] = await tx<{ auth: string; users: number; identities: number }[]>`
		select r::text as auth, jsonb_array_length(r->'users') as users, jsonb_array_length(r->'identities') as identities
		from app.backup_auth_rows() r`;
	// CASE guarantees the order: the privilege checks would throw on a missing schema.
	const [{ readable }] = await tx<{ readable: boolean }[]>`
		select case when to_regclass('supabase_migrations.schema_migrations') is null then false
			else has_schema_privilege('supabase_migrations', 'USAGE')
				and has_table_privilege(to_regclass('supabase_migrations.schema_migrations'), 'SELECT') end as readable`;
	const migrations = readable
		? (await tx<{ list: string }[]>`select coalesce(json_agg(version order by version), '[]')::text as list from supabase_migrations.schema_migrations`)[0].list
		: 'null';
	return { migrations, ...auth, tables };
}

/** The export document as parts: rows are never parsed nor joined into one string in the Worker. */
export function exportParts(snapshot: Snapshot, createdAt: string, workerVersion: string): string[] {
	const parts = [
		`{"format":${JSON.stringify(EXPORT_FORMAT)},"createdAt":${JSON.stringify(createdAt)},"workerVersion":${JSON.stringify(workerVersion)},"migrations":${snapshot.migrations},"auth":${snapshot.auth},"tables":{`,
	];
	snapshot.tables.forEach((t, i) => parts.push(`${i > 0 ? ',' : ''}${JSON.stringify(`app.${t.name}`)}:`, t.rows));
	parts.push('}}');
	return parts;
}
