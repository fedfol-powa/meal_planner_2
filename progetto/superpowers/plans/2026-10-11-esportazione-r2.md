# Esportazione notturna in R2: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ogni notte il Worker esporta in R2, cifrati, i dati di `app` e gli utenti di Auth, conserva le ultime 7 esportazioni, e una CLI provata le ripristina in un database vuoto con le stesse migrazioni.

**Architecture:** un ruolo Postgres `app_backup` in sola lettura (BYPASSRLS) e una funzione `security definer` per gli utenti di Auth. Postgres produce il JSON di ogni tabella in una transazione `repeatable read`; il Worker lo concatena, lo comprime con gzip e lo cifra con AES-256-GCM (WebCrypto), poi lo scrive in R2 da un'espressione cron dedicata. Il ripristino carica il documento in una tabella temporanea jsonb, inserisce in modalità `replica` in ordine di chiavi esterne e confronta in SQL prima del commit.

**Tech Stack:** Cloudflare Workers (Cron Trigger, R2 binding), Postgres.js via Hyperdrive, WebCrypto e `CompressionStream`, Vitest, pgTAP, Node 26 per la CLI.

**Spec:** `progetto/superpowers/specs/2026-10-11-esportazione-r2.md` (leggila prima; subordinata a `progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`).

## Global Constraints

- Codice, identificatori, commenti, test e output della CLI in inglese; documenti e commit in italiano (`AGENTS.md`).
- Nessuna dipendenza nuova: WebCrypto, `CompressionStream`/`DecompressionStream`, Postgres.js già presente (`postgres` 3.4.9).
- `erasableSyntaxOnly`: niente parameter properties (`constructor(readonly x)`), niente `enum`; la CLI gira con Node senza build.
- Formato: `cosasimangia-export/1`; magia `CSM1`; versione binaria 1; IV 12 byte; chiave 32 byte; identificativo della chiave di default `k1`.
- Chiave R2: `exports/<YYYY-MM-DD>T<HH-MM>Z.json.gz.enc`; conservazione `KEEP_EXPORTS = 7`; soglia `LARGE_EXPORT_BYTES = 50 * 1024 * 1024`.
- Espressioni cron: `'0 * * * *'` (job, invariata) e `'30 2,4 * * *'` (esportazione).
- Bucket `cosasimangia-backups`, giurisdizione `eu`, binding `BACKUPS`; secret `BACKUP_ENCRYPTION_KEY`; var `BACKUP_KEY_ID` = `k1`.
- Log con soli campi scelti (`logEvent`), mai dati, chiavi o messaggi d'errore: eventi `backup_export_done`, `backup_export_skipped`, `backup_export_large`, `backup_export_failed`, `backup_export_not_configured`, `scheduled_unknown_cron`.
- Modifiche ai file condivisi minime e solo quelle elencate in «Cosa uso e cosa produco» della spec.
- Nessun comando sul progetto Supabase remoto o sull'account Cloudflare: i passi esterni li fa l'utente (spec, sezione 5).
- Commit piccoli in italiano, con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` in coda.

## Review Focus

- **Fuso della sessione diverso fra esportazione e destinazione:** il JSON dei `timestamptz` dipende dal `TimeZone` della sessione; esportazione e ripristino fissano `UTC`, altrimenti il confronto fallirebbe a torto. Test nel Task 6 (destinazione con `set local time zone 'Europe/Rome'` prima del ripristino).
- **Numeri oltre la precisione di JavaScript in colonne jsonb o numeric:** non devono passare da `JSON.parse`. Test nel Task 6 (`quantity_at_check` con `12345678901234567890.123456789`).
- **Tabella aggiunta da un'altra attività dopo questa PR:** deve finire nell'esportazione senza toccare il codice. Test nel Task 1 (`alter default privileges` verificato creando una tabella nel test pgTAP).
- **Pagine di `list` di R2 (più di una pagina):** la conservazione deve vedere tutte le chiavi. Il bucket finto del Task 4 ha pagine da 2 oggetti.
- **Esportazione riuscita ma pulizia fallita, o `put` fallito:** nessuna copia buona persa. Test nel Task 4.

---

## Mappa dei file

| File | Responsabilità |
|---|---|
| `supabase/migrations/20261012100000_backup.sql` (nuovo) | ruolo `app_backup`, permessi, `app.backup_auth_rows()` |
| `supabase/tests/backup_test.sql` (nuovo) | permessi e lettura di `app_backup`, chiavi primarie, niente sequenze |
| `supabase/tests/coverage_test.sql` | asserzione delle funzioni eseguibili da `app_backup` |
| `server/src/backup/format.ts` (nuovo) | chiavi, intestazione, gzip, AES-GCM; valido in Worker e Node |
| `server/src/backup/read.ts` (nuovo) | fotografia del database (`readSnapshot`), elenco delle tabelle, composizione del documento |
| `server/src/backup/export.ts` (nuovo) | esportazione notturna, salto, conservazione, log |
| `server/src/backup/restore.ts` (nuovo) | controlli, caricamento, verifiche del ripristino |
| `server/src/scheduled.ts` (nuovo) | smistamento delle espressioni cron |
| `scripts/backup/restore.ts` (nuovo) | CLI del ripristino |
| `server/src/db.ts` | `case 'backup'` |
| `server/src/env.ts` | `BACKUPS`, `BACKUP_ENCRYPTION_KEY`, `BACKUP_KEY_ID` |
| `server/src/index.ts` | `scheduled` delega a `dispatchScheduled` |
| `server/wrangler.jsonc` | cron notturno, binding R2, var `BACKUP_KEY_ID` |
| `server/.env.example`, `server/README.md`, `supabase/README.md` | chiave locale, prova del cron, ruolo e procedura |
| `server/test/support/r2.ts` (nuovo) | bucket R2 finto in memoria |
| `server/src/backup/format.test.ts`, `server/test/backup.test.ts`, `server/test/scheduled.test.ts` (nuovi) | test |

Comandi comuni (dalla radice del worktree, con il database locale avviato come in `supabase/README.md`):

```bash
export PATH=/opt/podman/bin:$HOME/.local/bin:$PATH
export TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres   # verifica la porta con `supabase status`
```

---

### Task 1: ruolo `app_backup` e funzione degli utenti di Auth

**Files:**
- Create: `supabase/migrations/20261012100000_backup.sql`
- Create: `supabase/tests/backup_test.sql`
- Modify: `supabase/tests/coverage_test.sql` (dopo l'asserzione «app_job executes only pure functions»)
- Modify: `supabase/README.md` (tabella dei ruoli e delle funzioni per ruolo)

**Interfaces:**
- Produces: ruolo `app_backup` (NOLOGIN, BYPASSRLS, membro di `app_server`); `app.backup_auth_rows() returns jsonb` = `{"users": [...], "identities": [...]}` ordinati per `id`; `select` su `supabase_migrations.schema_migrations` se la tabella esiste.

- [ ] **Step 1: scrivi il test pgTAP che fallisce**

`supabase/tests/backup_test.sql`:

```sql
begin;
\ir helpers/setup.psql
\ir helpers/fixtures.psql
select no_plan();

select ok((select rolbypassrls and not rolcanlogin from pg_roles where rolname = 'app_backup'), 'app_backup is NOLOGIN BYPASSRLS');
select ok(pg_has_role('app_server', 'app_backup', 'SET') and not pg_has_role('app_server', 'app_backup', 'USAGE'),
	'app_server switches to app_backup without inheriting it');
select is(
	array(select c.relname::text from pg_class c
		where c.relnamespace = 'app'::regnamespace and c.relkind = 'r' and not has_table_privilege('app_backup', c.oid, 'SELECT') order by 1),
	array[]::text[], 'app_backup reads every app table');
select is(
	array(select c.relname::text from pg_class c
		where c.relnamespace = 'app'::regnamespace and c.relkind in ('r', 'v')
			and has_table_privilege('app_backup', c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE') order by 1),
	array[]::text[], 'app_backup writes nothing');
select is(
	array(select r from unnest(array['authenticated', 'anon', 'app_job', 'app_server', 'public']) r
		where has_function_privilege(r, 'app.backup_auth_rows()', 'EXECUTE')),
	array[]::text[], 'only app_backup reads the users of Auth');
select is(
	array(select c.relname::text from pg_class c
		where c.relnamespace = 'app'::regnamespace and c.relkind = 'r'
			and not exists (select 1 from pg_constraint k where k.conrelid = c.oid and k.contype = 'p') order by 1),
	array[]::text[], 'every app table has a primary key (deterministic export order)');
select is(
	(select count(*) from pg_class where relnamespace = 'app'::regnamespace and relkind = 'S')
		+ (select count(*) from pg_attribute a join pg_class c on c.oid = a.attrelid
			where c.relnamespace = 'app'::regnamespace and a.attnum > 0 and a.attidentity <> ''),
	0::bigint, 'no sequences or identity columns in app: the restore does not realign them (spec 2026-10-11-esportazione-r2)');

-- A table created later by a migration is readable too.
create table app.backup_probe (id uuid primary key);
select ok(has_table_privilege('app_backup', 'app.backup_probe', 'SELECT'), 'default privileges cover new tables');
drop table app.backup_probe;

select set_config('tests.rossi', tests.family('Rossi')::text, true);
set local role app_backup;
select is((select count(*) from app.families where id = current_setting('tests.rossi')::uuid), 1::bigint,
	'RLS does not hide families from app_backup');
select ok(jsonb_array_length(app.backup_auth_rows()->'users') >= 1, 'app_backup reads the users through the function');
select ok(jsonb_typeof(app.backup_auth_rows()->'identities') = 'array', 'and the identities');
select throws_ok($$select count(*) from auth.users$$, '42501', null, 'but not the auth schema directly');
select throws_ok($$update app.families set name = 'x'$$, '42501', null, 'app_backup does not write');
reset role;

select * from finish();
rollback;
```

In `coverage_test.sql`, dopo l'asserzione di `app_job`:

```sql
select is(
	array(select p.proname::text collate "C" from pg_proc p
		where p.pronamespace = 'app'::regnamespace and has_function_privilege('app_backup', p.oid, 'EXECUTE') order by 1),
	array['backup_auth_rows'], 'app_backup executes only the export of the users');
```

- [ ] **Step 2: verifica che fallisca**

Run: `supabase test db`
Expected: FAIL in `backup_test.sql` (`role "app_backup" does not exist`) e in `coverage_test.sql`.

- [ ] **Step 3: scrivi la migrazione**

`supabase/migrations/20261012100000_backup.sql`:

```sql
-- Nightly export (spec section 8): a read-only role that sees every row of app and,
-- through one function, the users of Auth. Separate from app_job, which writes meals.

do $$
begin
	if not exists (select 1 from pg_roles where rolname = 'app_backup') then
		create role app_backup nologin bypassrls;
	end if;
end;
$$;

-- app_server is NOINHERIT: it reaches these rights only with `set local role app_backup`.
grant app_backup to app_server;
grant usage on schema app to app_backup;
grant select on all tables in schema app to app_backup;
-- Tables created by later migrations (run as postgres) are exported without changes here.
alter default privileges for role postgres in schema app grant select on tables to app_backup;

-- Applied migrations go in the export; the table exists when the Supabase CLI applies them.
do $$
begin
	if to_regclass('supabase_migrations.schema_migrations') is not null then
		grant usage on schema supabase_migrations to app_backup;
		grant select on supabase_migrations.schema_migrations to app_backup;
	end if;
end;
$$;

-- postgres cannot grant usage on the auth schema: a definer function reads the two tables
-- the restore needs (accounts and their sign-in identities), never sessions or tokens.
create function app.backup_auth_rows()
returns jsonb language sql stable security definer set search_path = '' as $$
	select jsonb_build_object(
		'users', coalesce((select jsonb_agg(to_jsonb(u) order by u.id) from auth.users u), '[]'::jsonb),
		'identities', coalesce((select jsonb_agg(to_jsonb(i) order by i.id) from auth.identities i), '[]'::jsonb));
$$;
revoke execute on function app.backup_auth_rows() from public;
grant execute on function app.backup_auth_rows() to app_backup;
```

- [ ] **Step 4: applica e verifica**

Run: `supabase db reset && supabase test db`
Expected: PASS di tutti i file, compresi `backup_test.sql` e `coverage_test.sql`.

- [ ] **Step 5: aggiorna `supabase/README.md`**

Nella tabella «Ruoli» aggiungi la riga:

```markdown
| `app_backup` | NOLOGIN, BYPASSRLS | legge tutte le tabelle di `app` (anche le future) e le migrazioni applicate; esegue solo `app.backup_auth_rows()`; non scrive nulla. Usato dall'esportazione notturna |
```

e nella tabella delle funzioni per ruolo la riga `| `app_backup` | `backup_auth_rows` |`.

- [ ] **Step 6: commit**

```bash
git add supabase/migrations/20261012100000_backup.sql supabase/tests/backup_test.sql supabase/tests/coverage_test.sql supabase/README.md
git commit -m "Esportazione: ruolo app_backup in sola lettura e funzione degli utenti di Auth"
```

---

### Task 2: formato, compressione e cifratura

**Files:**
- Create: `server/src/backup/format.ts`
- Test: `server/src/backup/format.test.ts`

**Interfaces:**
- Produces:
  - `EXPORT_FORMAT = 'cosasimangia-export/1'`
  - `type BackupKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>` (vale con i tipi di Workers e di Node)
  - `importKey(base64: string): Promise<BackupKey>` (rifiuta lunghezze diverse da 32 byte con `Error('backup key must be 32 bytes')`)
  - `parseKeyList(value: string): Promise<Record<string, BackupKey>>` (`k1=<b64>,k2=<b64>`; un valore senza `=` vale per `k1`)
  - `encodeExport(plain: Uint8Array, key: BackupKey, keyId: string): Promise<Uint8Array>`
  - `decodeExport(bytes: Uint8Array, keys: Readonly<Record<string, BackupKey>>): Promise<string>`
  - `class ExportFormatError extends Error { reason: 'magic' | 'version' | 'unknown_key' | 'corrupt' }`

- [ ] **Step 1: scrivi i test che falliscono**

`server/src/backup/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { decodeExport, encodeExport, ExportFormatError, importKey, parseKeyList } from './format.ts';

const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const randomKey = () => base64(crypto.getRandomValues(new Uint8Array(32)));
const text = (s: string) => new TextEncoder().encode(s);

describe('export format', () => {
	it('round-trips a document', async () => {
		const key = await importKey(randomKey());
		const json = JSON.stringify({ hello: 'mondo', n: '12345678901234567890.1' });
		const bytes = await encodeExport(text(json), key, 'k1');
		expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe('CSM1');
		await expect(decodeExport(bytes, { k1: key })).resolves.toBe(json);
	});

	it('uses a fresh IV every time', async () => {
		const key = await importKey(randomKey());
		const a = await encodeExport(text('{}'), key, 'k1');
		const b = await encodeExport(text('{}'), key, 'k1');
		expect(base64(a.subarray(8, 20))).not.toBe(base64(b.subarray(8, 20)));
	});

	it('rejects keys that are not 32 bytes', async () => {
		await expect(importKey(base64(new Uint8Array(16)))).rejects.toThrow('32 bytes');
	});

	it('parses a key list, a bare key meaning k1', async () => {
		expect(Object.keys(await parseKeyList(randomKey()))).toEqual(['k1']);
		expect(Object.keys(await parseKeyList(`k1=${randomKey()},k2=${randomKey()}`))).toEqual(['k1', 'k2']);
	});

	const reason = async (promise: Promise<unknown>) => {
		const error = await promise.then(() => null, (e: unknown) => e);
		expect(error).toBeInstanceOf(ExportFormatError);
		return (error as ExportFormatError).reason;
	};

	it('rejects a wrong key, an unknown key id, a bad magic or version, an altered header or body', async () => {
		const k1 = await importKey(randomKey());
		const k2 = await importKey(randomKey());
		const bytes = await encodeExport(text('{"a":1}'), k1, 'k1');
		expect(await reason(decodeExport(bytes, { k1: k2 }))).toBe('corrupt');
		expect(await reason(decodeExport(bytes, { k2 }))).toBe('unknown_key');
		const badMagic = bytes.slice(); badMagic[0] = 0x58;
		expect(await reason(decodeExport(badMagic, { k1 }))).toBe('magic');
		const badVersion = bytes.slice(); badVersion[4] = 9;
		expect(await reason(decodeExport(badVersion, { k1 }))).toBe('version');
		// Same length, other id: the header is authenticated, so k1 cannot open it as k2.
		const otherId = bytes.slice(); otherId[7] = '2'.charCodeAt(0);
		expect(await reason(decodeExport(otherId, { k2: k1 }))).toBe('corrupt');
		const badBody = bytes.slice(); badBody[bytes.length - 1] ^= 1;
		expect(await reason(decodeExport(badBody, { k1 }))).toBe('corrupt');
	});
});
```

- [ ] **Step 2: verifica che falliscano**

Run: `npx vitest run -c server/vitest.config.ts server/src/backup/format.test.ts`
Expected: FAIL (`Cannot find module './format.ts'`).

- [ ] **Step 3: implementa `format.ts`**

```ts
/**
 * Binary format of the nightly export (spec 2026-10-11-esportazione-r2, section 2):
 * "CSM1", format version, key id, IV, then AES-256-GCM of the gzipped JSON document.
 * The header is authenticated data. Pure: runs in the Worker and in Node.
 */
export const EXPORT_FORMAT = 'cosasimangia-export/1';
const MAGIC = new TextEncoder().encode('CSM1');
const BINARY_VERSION = 1;
const IV_BYTES = 12;

export type BackupKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

export class ExportFormatError extends Error {
	readonly reason: 'magic' | 'version' | 'unknown_key' | 'corrupt';
	constructor(reason: ExportFormatError['reason']) {
		super(`invalid export: ${reason}`);
		this.name = 'ExportFormatError';
		this.reason = reason;
	}
}

export async function importKey(base64: string): Promise<BackupKey> {
	const raw = Uint8Array.from(atob(base64.trim()), (c) => c.charCodeAt(0));
	if (raw.length !== 32) throw new Error('backup key must be 32 bytes');
	return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** `k1=<base64>,k2=<base64>`; a bare key is k1. */
export async function parseKeyList(value: string): Promise<Record<string, BackupKey>> {
	const keys: Record<string, BackupKey> = {};
	for (const part of value.split(',').map((p) => p.trim()).filter(Boolean)) {
		const at = part.indexOf('=');
		// Base64 may end with "=": a key id never starts the entry with base64 padding.
		const named = at > 0 && /^[A-Za-z0-9_-]+$/.test(part.slice(0, at)) && at < part.length - 2;
		keys[named ? part.slice(0, at) : 'k1'] = await importKey(named ? part.slice(at + 1) : part);
	}
	return keys;
}

function header(keyId: string): Uint8Array {
	const id = new TextEncoder().encode(keyId);
	if (id.length === 0 || id.length > 255) throw new Error('invalid key id');
	const out = new Uint8Array(MAGIC.length + 2 + id.length);
	out.set(MAGIC);
	out[4] = BINARY_VERSION;
	out[5] = id.length;
	out.set(id, 6);
	return out;
}

async function pipe(bytes: Uint8Array, transform: CompressionStream | DecompressionStream): Promise<Uint8Array> {
	const stream = new Blob([bytes]).stream().pipeThrough(transform);
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodeExport(plain: Uint8Array, key: BackupKey, keyId: string): Promise<Uint8Array> {
	const head = header(keyId);
	const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
	const gzipped = await pipe(plain, new CompressionStream('gzip'));
	const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: head }, key, gzipped));
	const out = new Uint8Array(head.length + IV_BYTES + sealed.length);
	out.set(head);
	out.set(iv, head.length);
	out.set(sealed, head.length + IV_BYTES);
	return out;
}

export async function decodeExport(bytes: Uint8Array, keys: Readonly<Record<string, BackupKey>>): Promise<string> {
	if (bytes.length < 6 || !MAGIC.every((b, i) => bytes[i] === b)) throw new ExportFormatError('magic');
	if (bytes[4] !== BINARY_VERSION) throw new ExportFormatError('version');
	const end = 6 + bytes[5];
	const key = keys[new TextDecoder().decode(bytes.subarray(6, end))];
	if (!key) throw new ExportFormatError('unknown_key');
	let gzipped: Uint8Array;
	try {
		gzipped = new Uint8Array(await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: bytes.subarray(end, end + IV_BYTES), additionalData: bytes.subarray(0, end) },
			key,
			bytes.subarray(end + IV_BYTES),
		));
	} catch {
		throw new ExportFormatError('corrupt');
	}
	return new TextDecoder().decode(await pipe(gzipped, new DecompressionStream('gzip')));
}
```

Se `tsc` segnala `Uint8Array<ArrayBufferLike>` non assegnabile a `BufferSource`, passa `bytes.slice(...)` al posto di `subarray(...)` nei punti segnalati (copia con `ArrayBuffer` proprio); non usare cast.

- [ ] **Step 4: verifica**

Run: `npx vitest run -c server/vitest.config.ts server/src/backup/format.test.ts && npm run typecheck`
Expected: PASS; typecheck pulito (anche quello della radice, che include `scripts/`).

- [ ] **Step 5: commit**

```bash
git add server/src/backup/format.ts server/src/backup/format.test.ts
git commit -m "Esportazione: formato binario con gzip e AES-256-GCM"
```

---

### Task 3: identità `backup` e lettura della fotografia

**Files:**
- Modify: `server/src/db.ts` (tipo `DbIdentity` e `switch` di `withDbOn`)
- Create: `server/src/backup/read.ts`
- Create: `server/test/backup.test.ts` (primo blocco)

**Interfaces:**
- Consumes: `EXPORT_FORMAT` (Task 2); `withDbOn`, `Tx` di `server/src/db.ts`.
- Produces:
  - `DbIdentity` con `{ kind: 'backup' }`
  - `interface TableDump { name: string; ident: string; orderBy: string; rows: string; count: number }`
  - `interface Snapshot { migrations: string; auth: string; users: number; identities: number; tables: TableDump[] }` (`migrations` è testo JSON: array o `null`)
  - `appTables(tx: Tx): Promise<{ name: string; ident: string; orderBy: string }[]>` (ordine `collate "C"`, `orderBy` come `t."col", t."col2"`; lancia se una tabella non ha chiave primaria)
  - `readSnapshot(tx: Tx): Promise<Snapshot>`
  - `composeExport(snapshot: Snapshot, createdAt: string, workerVersion: string): string`

- [ ] **Step 1: scrivi i test che falliscono**

`server/test/backup.test.ts`:

```ts
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withDbOn } from '../src/db.ts';
import { EXPORT_FORMAT } from '../src/backup/format.ts';
import { composeExport, readSnapshot } from '../src/backup/read.ts';
import { hasDatabase, setupDatabase, type TestDatabase } from './support/db.ts';
import { menuFixtures } from './support/menu.ts';

describe.skipIf(!hasDatabase)('nightly export', () => {
	let db: TestDatabase;
	let sql: postgres.Sql;
	let familyId: string;
	beforeAll(async () => {
		db = await setupDatabase();
		sql = postgres(db.appServerUrl, { max: 2, fetch_types: false });
		const fx = menuFixtures(db);
		const member = await fx.member();
		familyId = member.familyId;
		await fx.book();
		const recipeId = await fx.publishRecipe();
		await fx.publishVersion(recipeId, '2026-02-01T00:00:00Z');
		const weekId = await fx.insertWeek(familyId, '2026-10-12');
		await fx.insertSlot(weekId, { date: '2026-10-12', mealType: 'lunch', recipeId, updatedBy: member.userId });
		await db.admin`insert into app.ratings (user_id, recipe_id, stars) values (${member.userId}, ${recipeId}, 4)`;
		const [{ id: listId }] = await db.admin<{ id: string }[]>`
			insert into app.shopping_lists (family_id, week_id, updated_by) values (${familyId}, ${weekId}, ${member.userId}) returning id`;
		const [{ id: ingredientId }] = await db.admin<{ id: string }[]>`select id from app.ingredients limit 1`;
		// Beyond the precision of a JavaScript number: must survive export and restore.
		await db.admin.unsafe(`insert into app.shopping_list_checks (shopping_list_id, ingredient_id, quantity_at_check)
			values ('${listId}', '${ingredientId}', '{"mass_g": 12345678901234567890.123456789}')`);
		await db.admin`insert into auth.identities (provider_id, user_id, identity_data, provider)
			values (${member.userId}, ${member.userId}, ${db.admin.json({ sub: member.userId, email: `${member.userId}@test.local` })}, 'email')`;
	});
	afterAll(async () => {
		await sql?.end();
		await db?.close();
	});

	it('reads every app table, the users and the migrations in one read-only snapshot, bypassing RLS', async () => {
		const snapshot = await withDbOn(sql, { kind: 'backup' }, readSnapshot);
		const [{ tables }] = await db.admin<{ tables: number }[]>`
			select count(*)::int as tables from pg_class where relnamespace = 'app'::regnamespace and relkind = 'r'`;
		expect(snapshot.tables).toHaveLength(tables);
		for (const table of snapshot.tables) {
			const [{ count }] = await db.admin.unsafe<{ count: number }[]>(`select count(*)::int as count from app.${table.ident}`);
			expect(table.count, table.name).toBe(count);
		}
		expect(snapshot.tables.find((t) => t.name === 'families')!.rows).toContain(familyId);
		expect(snapshot.users).toBeGreaterThan(0);
		expect(snapshot.identities).toBeGreaterThan(0);
		expect(JSON.parse(snapshot.migrations)).toContain('20261012100000');
	});

	it('cannot write in the backup identity', async () => {
		await expect(withDbOn(sql, { kind: 'backup' }, (tx) => tx`update app.families set name = name`)).rejects.toMatchObject({ code: '25006' });
	});

	it('composes a valid document without parsing rows', async () => {
		const snapshot = await withDbOn(sql, { kind: 'backup' }, readSnapshot);
		const doc = JSON.parse(composeExport(snapshot, '2026-10-12T02:30:00.000Z', 'test'));
		expect(doc.format).toBe(EXPORT_FORMAT);
		expect(Object.keys(doc.tables)).toEqual(snapshot.tables.map((t) => `app.${t.name}`));
		expect(doc.auth.users.length).toBe(snapshot.users);
		expect(snapshot.tables.find((t) => t.name === 'shopping_list_checks')!.rows).toContain('12345678901234567890.123456789');
	});
});
```

- [ ] **Step 2: verifica che falliscano**

Run: `npm test -w server -- backup.test.ts`
Expected: FAIL (`Cannot find module '../src/backup/read.ts'`).

- [ ] **Step 3: aggiungi l'identità in `db.ts`**

```ts
export type DbIdentity = { kind: 'user'; claims: Claims } | { kind: 'anon' } | { kind: 'job' } | { kind: 'backup' };
```

e nel `switch` di `withDbOn`:

```ts
			case 'backup':
				// Nightly export: one consistent snapshot of every table, nothing written.
				await tx`set transaction isolation level repeatable read, read only`;
				await tx`set local role app_backup`;
				break;
```

- [ ] **Step 4: implementa `read.ts`**

```ts
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

/** The export document, by concatenation: rows are never parsed in the Worker. */
export function composeExport(snapshot: Snapshot, createdAt: string, workerVersion: string): string {
	const tables = snapshot.tables.map((t) => `${JSON.stringify(`app.${t.name}`)}:${t.rows}`).join(',');
	return `{"format":${JSON.stringify(EXPORT_FORMAT)},"createdAt":${JSON.stringify(createdAt)},"workerVersion":${JSON.stringify(workerVersion)},"migrations":${snapshot.migrations},"auth":${snapshot.auth},"tables":{${tables}}}`;
}
```

- [ ] **Step 5: verifica**

Run: `npm test -w server -- backup.test.ts db.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: commit**

```bash
git add server/src/db.ts server/src/backup/read.ts server/test/backup.test.ts
git commit -m "Esportazione: identità backup e fotografia del database in una transazione"
```

---

### Task 4: esportazione notturna in R2 con conservazione delle ultime 7

**Files:**
- Create: `server/test/support/r2.ts`
- Create: `server/src/backup/export.ts`
- Modify: `server/src/env.ts`
- Modify: `server/test/backup.test.ts` (nuovo `describe` nello stesso blocco con database)

**Interfaces:**
- Consumes: `encodeExport`, `importKey`, `BackupKey`, `EXPORT_FORMAT` (Task 2); `readSnapshot`, `composeExport` (Task 3); `withDbOn`; `logEvent`; `errorCode` di `server/src/menu/generation.ts`.
- Produces:
  - `KEEP_EXPORTS = 7`, `LARGE_EXPORT_BYTES = 50 * 1024 * 1024`, `EXPORT_PREFIX = 'exports/'`
  - `exportKey(scheduled: Date): string`
  - `interface ExportDeps { sql: postgres.Sql; bucket: R2Bucket; key: BackupKey; keyId: string; workerVersion: string }`
  - `type ExportOutcome = 'done' | 'skipped' | 'failed'`
  - `runNightlyExportOn(deps: ExportDeps, scheduled: Date): Promise<ExportOutcome>`
  - `runNightlyExport(env: Env, scheduled: Date): Promise<ExportOutcome>`
  - `Env` con `BACKUPS?: R2Bucket; BACKUP_ENCRYPTION_KEY?: string; BACKUP_KEY_ID?: string`
  - `class MemoryBucket` (test) con `objects`, `failPut`, `failDelete`, `asBucket()`

- [ ] **Step 1: bucket finto**

`server/test/support/r2.ts`:

```ts
/** The R2 calls of the export, in memory. Pages of two objects exercise the list cursor. */
export class MemoryBucket {
	objects = new Map<string, { body: Uint8Array; customMetadata: Record<string, string> }>();
	failPut = false;
	failDelete = false;
	pageSize = 2;

	async put(key: string, value: Uint8Array, options?: { customMetadata?: Record<string, string> }) {
		if (this.failPut) throw new Error('put failed');
		this.objects.set(key, { body: value.slice(), customMetadata: options?.customMetadata ?? {} });
		return { key };
	}

	async get(key: string) {
		const object = this.objects.get(key);
		return object ? { customMetadata: object.customMetadata, arrayBuffer: async () => object.body.slice().buffer } : null;
	}

	async list(options: { prefix?: string; cursor?: string; limit?: number } = {}) {
		const limit = Math.min(options.limit ?? this.pageSize, this.pageSize);
		const keys = [...this.objects.keys()].filter((k) => k.startsWith(options.prefix ?? '')).sort();
		const start = options.cursor ? Number(options.cursor) : 0;
		const truncated = start + limit < keys.length;
		return {
			objects: keys.slice(start, start + limit).map((key) => ({ key })),
			truncated,
			cursor: truncated ? String(start + limit) : undefined,
			delimitedPrefixes: [],
		};
	}

	async delete(keys: string | string[]) {
		if (this.failDelete) throw new Error('delete failed');
		for (const key of [keys].flat()) this.objects.delete(key);
	}

	asBucket(): R2Bucket {
		return this as unknown as R2Bucket;
	}
}
```

- [ ] **Step 2: scrivi i test che falliscono**

In `server/test/backup.test.ts` aggiungi gli import:

```ts
import { vi } from 'vitest';
import { decodeExport, importKey, type BackupKey } from '../src/backup/format.ts';
import { exportKey, runNightlyExport, runNightlyExportOn, type ExportDeps } from '../src/backup/export.ts';
import type { Env } from '../src/env.ts';
import { MemoryBucket } from './support/r2.ts';
```

e, dentro `describe.skipIf(!hasDatabase)('nightly export', ...)`:

```ts
	const keyB64 = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
	let key: BackupKey;
	beforeAll(async () => {
		key = await importKey(keyB64);
	});
	const deps = (bucket: MemoryBucket): ExportDeps => ({ sql, bucket: bucket.asBucket(), key, keyId: 'k1', workerVersion: 'test' });
	const night = (day: number, hour = 2) => new Date(Date.UTC(2026, 9, day, hour, 30));
	const logs = () => vi.spyOn(console, 'log').mockImplementation(() => {});
	const errors = () => vi.spyOn(console, 'error').mockImplementation(() => {});
	const events = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map(([line]) => JSON.parse(String(line)));

	it('names exports by the scheduled UTC minute', () => {
		expect(exportKey(night(12))).toBe('exports/2026-10-12T02-30Z.json.gz.enc');
	});

	it('writes an encrypted export with metadata, readable with the key', async () => {
		const bucket = new MemoryBucket();
		const info = logs();
		expect(await runNightlyExportOn(deps(bucket), night(12))).toBe('done');
		const stored = bucket.objects.get('exports/2026-10-12T02-30Z.json.gz.enc')!;
		expect(stored.customMetadata).toMatchObject({ format: 'cosasimangia-export/1', keyId: 'k1' });
		const doc = JSON.parse(await decodeExport(stored.body, { k1: key }));
		expect(Object.keys(doc.tables)).toContain('app.families');
		expect(events(info).find((e) => e.event === 'backup_export_done')).toMatchObject({ key: 'exports/2026-10-12T02-30Z.json.gz.enc' });
		info.mockRestore();
	});

	it('skips the 04:30 run when the night already has an export', async () => {
		const bucket = new MemoryBucket();
		const info = logs();
		await runNightlyExportOn(deps(bucket), night(12));
		expect(await runNightlyExportOn(deps(bucket), night(12, 4))).toBe('skipped');
		expect([...bucket.objects.keys()]).toEqual(['exports/2026-10-12T02-30Z.json.gz.enc']);
		info.mockRestore();
	});

	it('keeps the 7 most recent exports, across list pages', async () => {
		const bucket = new MemoryBucket();
		const info = logs();
		for (let day = 1; day <= 9; day++) await runNightlyExportOn(deps(bucket), night(day));
		expect([...bucket.objects.keys()].sort()).toEqual(
			[3, 4, 5, 6, 7, 8, 9].map((d) => `exports/2026-10-0${d}T02-30Z.json.gz.enc`),
		);
		info.mockRestore();
	});

	it('deletes nothing when the write fails', async () => {
		const bucket = new MemoryBucket();
		const info = logs();
		const fail = errors();
		for (let day = 1; day <= 7; day++) await runNightlyExportOn(deps(bucket), night(day));
		bucket.failPut = true;
		expect(await runNightlyExportOn(deps(bucket), night(8))).toBe('failed');
		expect(bucket.objects.size).toBe(7);
		expect(events(fail)).toContainEqual(expect.objectContaining({ event: 'backup_export_failed', phase: 'put' }));
		info.mockRestore();
		fail.mockRestore();
	});

	it('keeps a written export when pruning fails', async () => {
		const bucket = new MemoryBucket();
		const info = logs();
		const fail = errors();
		for (let day = 1; day <= 7; day++) await runNightlyExportOn(deps(bucket), night(day));
		bucket.failDelete = true;
		expect(await runNightlyExportOn(deps(bucket), night(8))).toBe('done');
		expect(bucket.objects.has('exports/2026-10-08T02-30Z.json.gz.enc')).toBe(true);
		expect(events(fail)).toContainEqual(expect.objectContaining({ event: 'backup_export_failed', phase: 'prune' }));
		info.mockRestore();
		fail.mockRestore();
	});

	it('logs and returns when the bucket or the key are missing', async () => {
		const fail = errors();
		const env = { HYPERDRIVE: { connectionString: db.appServerUrl }, BACKUP_ENCRYPTION_KEY: keyB64 } as unknown as Env;
		expect(await runNightlyExport(env, night(12))).toBe('failed');
		expect(await runNightlyExport({ ...env, BACKUPS: new MemoryBucket().asBucket(), BACKUP_ENCRYPTION_KEY: 'c2hvcnQ=' }, night(12))).toBe('failed');
		expect(events(fail).filter((e) => e.event === 'backup_export_not_configured')).toHaveLength(2);
		fail.mockRestore();
	});

	it('runs end to end from the Worker env', async () => {
		const bucket = new MemoryBucket();
		const info = logs();
		const env = { HYPERDRIVE: { connectionString: db.appServerUrl }, BACKUPS: bucket.asBucket(), BACKUP_ENCRYPTION_KEY: keyB64, BACKUP_KEY_ID: 'k1' } as unknown as Env;
		expect(await runNightlyExport(env, night(12))).toBe('done');
		expect(bucket.objects.size).toBe(1);
		info.mockRestore();
	});
```

- [ ] **Step 3: verifica che falliscano**

Run: `npm test -w server -- backup.test.ts`
Expected: FAIL (`Cannot find module '../src/backup/export.ts'`).

- [ ] **Step 4: aggiungi i campi a `env.ts`**

```ts
	/** Nightly export (spec 2026-10-11-esportazione-r2): private bucket, EU jurisdiction. */
	BACKUPS?: R2Bucket;
	/** Secret: base64 of 32 bytes; a copy lives in the owner's password manager. */
	BACKUP_ENCRYPTION_KEY?: string;
	BACKUP_KEY_ID?: string;
```

- [ ] **Step 5: implementa `export.ts`**

```ts
import postgres from 'postgres';
import { withDbOn } from '../db.ts';
import type { Env } from '../env.ts';
import { logEvent } from '../log.ts';
import { errorCode } from '../menu/generation.ts';
import { type BackupKey, EXPORT_FORMAT, encodeExport, importKey } from './format.ts';
import { composeExport, readSnapshot } from './read.ts';

export const KEEP_EXPORTS = 7;
/** Above this, move to a paged export (spec, «Dimensioni e tempi»). */
export const LARGE_EXPORT_BYTES = 50 * 1024 * 1024;
export const EXPORT_PREFIX = 'exports/';

export interface ExportDeps {
	sql: postgres.Sql;
	bucket: R2Bucket;
	key: BackupKey;
	keyId: string;
	workerVersion: string;
}

export type ExportOutcome = 'done' | 'skipped' | 'failed';

/** exports/2026-10-12T02-30Z.json.gz.enc: names sort in time order. */
export function exportKey(scheduled: Date): string {
	const iso = scheduled.toISOString();
	return `${EXPORT_PREFIX}${iso.slice(0, 10)}T${iso.slice(11, 13)}-${iso.slice(14, 16)}Z.json.gz.enc`;
}

async function listAll(bucket: R2Bucket, prefix: string): Promise<string[]> {
	const keys: string[] = [];
	let cursor: string | undefined;
	do {
		const page = await bucket.list({ prefix, cursor });
		keys.push(...page.objects.map((o) => o.key));
		cursor = page.truncated ? page.cursor : undefined;
	} while (cursor);
	return keys;
}

/** One night: skip if done, snapshot, encrypt, write, then keep the newest 7. Never throws. */
export async function runNightlyExportOn(deps: ExportDeps, scheduled: Date): Promise<ExportOutcome> {
	const started = Date.now();
	const key = exportKey(scheduled);
	let phase = 'list';
	let summary: Record<string, number>;
	try {
		const day = key.slice(0, EXPORT_PREFIX.length + 11); // exports/2026-10-12T
		const existing = await deps.bucket.list({ prefix: day, limit: 1 });
		if (existing.objects.length > 0) {
			logEvent('backup_export_skipped', { key: existing.objects[0].key });
			return 'skipped';
		}
		phase = 'read';
		const snapshot = await withDbOn(deps.sql, { kind: 'backup' }, readSnapshot);
		const plain = new TextEncoder().encode(composeExport(snapshot, new Date().toISOString(), deps.workerVersion));
		const rows = snapshot.tables.reduce((sum, t) => sum + t.count, 0);
		if (plain.length > LARGE_EXPORT_BYTES) logEvent('backup_export_large', { key, uncompressedBytes: plain.length }, 'error');
		phase = 'encode';
		const stored = await encodeExport(plain, deps.key, deps.keyId);
		phase = 'put';
		summary = { uncompressedBytes: plain.length, storedBytes: stored.length, tables: snapshot.tables.length, rows, users: snapshot.users };
		await deps.bucket.put(key, stored, {
			customMetadata: { format: EXPORT_FORMAT, keyId: deps.keyId, createdAt: new Date().toISOString(), ...Object.fromEntries(Object.entries(summary).map(([k, v]) => [k, String(v)])) },
		});
	} catch (error) {
		logEvent('backup_export_failed', { key, phase, code: errorCode(error) }, 'error');
		return 'failed';
	}
	// Only after a successful write: a failed night never costs a good copy.
	let pruned = 0;
	try {
		const keys = (await listAll(deps.bucket, EXPORT_PREFIX)).sort();
		const old = keys.slice(0, Math.max(0, keys.length - KEEP_EXPORTS));
		if (old.length > 0) await deps.bucket.delete(old);
		pruned = old.length;
	} catch (error) {
		logEvent('backup_export_failed', { key, phase: 'prune', code: errorCode(error) }, 'error');
	}
	logEvent('backup_export_done', { key, ...summary, pruned, ms: Date.now() - started });
	return 'done';
}

export async function runNightlyExport(env: Env, scheduled: Date): Promise<ExportOutcome> {
	let key: BackupKey;
	try {
		if (!env.BACKUPS || !env.BACKUP_ENCRYPTION_KEY) throw new Error('missing');
		key = await importKey(env.BACKUP_ENCRYPTION_KEY);
	} catch {
		logEvent('backup_export_not_configured', {}, 'error');
		return 'failed';
	}
	const sql = postgres(env.HYPERDRIVE.connectionString, { max: 1, fetch_types: false, connect_timeout: 10 });
	try {
		return await runNightlyExportOn(
			{ sql, bucket: env.BACKUPS, key, keyId: env.BACKUP_KEY_ID || 'k1', workerVersion: env.CF_VERSION_METADATA?.id ?? 'dev' },
			scheduled,
		);
	} finally {
		await sql.end().catch(() => {});
	}
}
```

Se TypeScript segnala `summary` usata prima dell'assegnazione, inizializzala a `{}`.

- [ ] **Step 6: verifica**

Run: `npm test -w server -- backup.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: commit**

```bash
git add server/src/env.ts server/src/backup/export.ts server/test/support/r2.ts server/test/backup.test.ts
git commit -m "Esportazione: scrittura notturna cifrata in R2 e conservazione delle ultime 7"
```

---

### Task 5: smistamento del cron e configurazione del Worker

**Files:**
- Create: `server/src/scheduled.ts`
- Modify: `server/src/index.ts` (handler `scheduled`)
- Modify: `server/wrangler.jsonc` (`triggers`, `vars`, `r2_buckets`)
- Modify: `server/.env.example`, `server/README.md`
- Test: `server/test/scheduled.test.ts`

**Interfaces:**
- Consumes: `runWeeklyJob(connectionString, now)` di `server/src/menu/job.ts`; `runNightlyExport(env, scheduled)` (Task 4).
- Produces: `HOURLY_CRON = '0 * * * *'`, `NIGHTLY_EXPORT_CRON = '30 2,4 * * *'`, `dispatchScheduled(cron: string, env: Env, time: Date): Promise<void>`.

- [ ] **Step 1: scrivi i test che falliscono**

`server/test/scheduled.test.ts`:

```ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/env.ts';

const runWeeklyJob = vi.hoisted(() => vi.fn(async () => ({ generated: 0, failed: 0, abandoned: 0 })));
const runNightlyExport = vi.hoisted(() => vi.fn(async () => 'done' as const));
vi.mock('../src/menu/job.ts', () => ({ runWeeklyJob }));
vi.mock('../src/backup/export.ts', () => ({ runNightlyExport }));

const { dispatchScheduled, HOURLY_CRON, NIGHTLY_EXPORT_CRON } = await import('../src/scheduled.ts');
const env = { HYPERDRIVE: { connectionString: 'postgres://unused' } } as unknown as Env;
const time = new Date('2026-10-12T02:30:00Z');

describe('scheduled dispatch', () => {
	afterEach(() => vi.clearAllMocks());

	it('matches the crons of wrangler.jsonc', async () => {
		const text = await readFile(join(import.meta.dirname, '..', 'wrangler.jsonc'), 'utf8');
		const config = JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
		expect(config.triggers.crons).toEqual([HOURLY_CRON, NIGHTLY_EXPORT_CRON]);
		expect(config.r2_buckets).toEqual([{ binding: 'BACKUPS', bucket_name: 'cosasimangia-backups', jurisdiction: 'eu' }]);
	});

	it('runs only the weekly job on the hourly cron', async () => {
		await dispatchScheduled(HOURLY_CRON, env, time);
		expect(runWeeklyJob).toHaveBeenCalledWith('postgres://unused', time);
		expect(runNightlyExport).not.toHaveBeenCalled();
	});

	it('runs only the export on the nightly cron', async () => {
		await dispatchScheduled(NIGHTLY_EXPORT_CRON, env, time);
		expect(runNightlyExport).toHaveBeenCalledWith(env, time);
		expect(runWeeklyJob).not.toHaveBeenCalled();
	});

	it('logs an unknown cron without throwing', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		await dispatchScheduled('* * * * *', env, time);
		expect(JSON.parse(String(spy.mock.calls[0][0]))).toEqual({ event: 'scheduled_unknown_cron', cron: '* * * * *' });
		expect(runWeeklyJob).not.toHaveBeenCalled();
		spy.mockRestore();
	});
});
```

- [ ] **Step 2: verifica che falliscano**

Run: `npm test -w server -- scheduled.test.ts`
Expected: FAIL (`Cannot find module '../src/scheduled.ts'`).

- [ ] **Step 3: implementa `scheduled.ts` e aggiorna `index.ts`**

`server/src/scheduled.ts`:

```ts
import { runNightlyExport } from './backup/export.ts';
import type { Env } from './env.ts';
import { logEvent } from './log.ts';
import { runWeeklyJob } from './menu/job.ts';

/** Must match `triggers.crons` of wrangler.jsonc character for character. */
export const HOURLY_CRON = '0 * * * *';
/** 02:30 UTC, and 04:30 UTC as a second attempt when the night has no export yet. */
export const NIGHTLY_EXPORT_CRON = '30 2,4 * * *';

/** Each cron gets its own invocation and limits: a slow export never delays the menus. */
export async function dispatchScheduled(cron: string, env: Env, time: Date): Promise<void> {
	switch (cron) {
		case HOURLY_CRON:
			await runWeeklyJob(env.HYPERDRIVE.connectionString, time);
			return;
		case NIGHTLY_EXPORT_CRON:
			await runNightlyExport(env, time);
			return;
		default:
			logEvent('scheduled_unknown_cron', { cron }, 'error');
	}
}
```

In `server/src/index.ts` sostituisci l'import di `runWeeklyJob` con `import { dispatchScheduled } from './scheduled.ts';` e il gestore con:

```ts
	// Cron Triggers: hourly weekly job (spec section 4) and nightly export (section 8).
	scheduled: (controller, env) => dispatchScheduled(controller.cron, env, new Date(controller.scheduledTime)),
```

- [ ] **Step 4: aggiorna `wrangler.jsonc`**

```jsonc
	// Hourly weekly job (spec section 4) and nightly export to R2 at 02:30 UTC, retried at 04:30 (section 8).
	"triggers": { "crons": ["0 * * * *", "30 2,4 * * *"] },
```

in `vars` aggiungi `"BACKUP_KEY_ID": "k1"` con il commento `// Id of BACKUP_ENCRYPTION_KEY (a Worker secret), written in each export header.`, e dopo `hyperdrive`:

```jsonc
	// Nightly exports: private bucket in the EU jurisdiction, created by the owner before deploying.
	"r2_buckets": [{ "binding": "BACKUPS", "bucket_name": "cosasimangia-backups", "jurisdiction": "eu" }]
```

In `server/.env.example` aggiungi:

```bash
# Nightly export key for local runs: `openssl rand -base64 32`. Production uses a Worker secret.
BACKUP_ENCRYPTION_KEY=
```

In `server/README.md`, dopo il paragrafo del job settimanale in locale:

```markdown
Esportazione notturna in locale (R2 simulato da Miniflare, chiave in `.env`):
`npm run dev -w server -- --test-scheduled`, poi
`curl "http://localhost:8787/cdn-cgi/local/scheduled?cron=30+2,4+*+*+*"`; l'oggetto si
scarica con `npx wrangler r2 object get cosasimangia-backups/exports/<chiave> --local --jurisdiction eu --file export.bin`
(la chiave è nel log `backup_export_done`). Procedura di ripristino in `supabase/README.md`.
```

- [ ] **Step 5: verifica**

Run: `npm test -w server && npm run typecheck`
Expected: PASS di tutta la suite del server (anche `asset-routing.test.ts`, che legge lo stesso `wrangler.jsonc`).

- [ ] **Step 6: commit**

```bash
git add server/src/scheduled.ts server/src/index.ts server/wrangler.jsonc server/.env.example server/README.md server/test/scheduled.test.ts
git commit -m "Esportazione: cron notturno smistato accanto al job orario e binding R2"
```

---

### Task 6: ripristino con verifiche e test di esportazione e ripristino

**Files:**
- Create: `server/src/backup/restore.ts`
- Modify: `server/test/backup.test.ts` (nuovo blocco di test)

**Interfaces:**
- Consumes: `appTables`, `readSnapshot` (Task 3); `EXPORT_FORMAT` (Task 2); `runNightlyExportOn`, `MemoryBucket`, `decodeExport` (Task 2 e 4).
- Produces:
  - `class RestoreError extends Error { reason: 'format' | 'unknown_migrations' | 'migrations' | 'tables' | 'not_empty' | 'columns' | 'orphans' | 'mismatch'; details: string[] }`
  - `interface RestoreOptions { acceptUnknownMigrations?: boolean }`
  - `interface RestoreResult { tables: number; rows: number; users: number; identities: number }`
  - `restoreExport(tx: postgres.TransactionSql, document: string, options?: RestoreOptions): Promise<RestoreResult>` (lavora nella transazione del chiamante; non fa commit né rollback)

- [ ] **Step 1: scrivi i test che falliscono**

In `server/test/backup.test.ts` aggiungi gli import:

```ts
import { RestoreError, restoreExport } from '../src/backup/restore.ts';
```

e nel blocco con database:

```ts
	class Rollback extends Error {}

	/** Decrypted document of a fresh export of the test database. */
	const freshExport = async () => {
		const bucket = new MemoryBucket();
		const info = logs();
		await runNightlyExportOn(deps(bucket), night(20));
		info.mockRestore();
		const [stored] = bucket.objects.values();
		return decodeExport(stored.body, { k1: key });
	};

	/** Empties app and the exported Auth tables, inside the caller's transaction. */
	const wipe = async (tx: postgres.TransactionSql) => {
		const tables = await tx<{ ident: string }[]>`
			select quote_ident(relname) as ident from pg_class where relnamespace = 'app'::regnamespace and relkind = 'r'`;
		await tx.unsafe(`truncate ${[...tables.map((t) => `app.${t.ident}`), 'auth.identities', 'auth.users'].join(', ')} cascade`);
	};

	/** Runs `fn` as the database owner, then rolls everything back: other test files keep their data. */
	const inRolledBack = async (fn: (tx: postgres.TransactionSql) => Promise<void>) => {
		await expect(db.admin.begin(async (tx) => {
			await fn(tx);
			throw new Rollback();
		})).rejects.toBeInstanceOf(Rollback);
	};

	const restoreReason = async (tx: postgres.TransactionSql, document: string) => {
		const error = await restoreExport(tx, document).then(() => null, (e: unknown) => e);
		expect(error).toBeInstanceOf(RestoreError);
		return (error as RestoreError).reason;
	};

	it('restores an export into an emptied database identically, without firing triggers', async () => {
		const document = await freshExport();
		const [before] = await db.admin<{ catalogue: string; families: string }[]>`
			select (select version::text from app.catalogue_state) as catalogue,
				(select string_agg(id || ':' || data_version, ',' order by id) from app.families) as families`;
		await inRolledBack(async (tx) => {
			await wipe(tx);
			// A session in another time zone must not change instants nor the comparison.
			await tx`set local time zone 'Europe/Rome'`;
			const result = await restoreExport(tx, document);
			const doc = JSON.parse(document);
			expect(result.tables).toBe(Object.keys(doc.tables).length);
			expect(result.users).toBe(doc.auth.users.length);
			const [after] = await tx<{ catalogue: string; families: string; mass: string }[]>`
				select (select version::text from app.catalogue_state) as catalogue,
					(select string_agg(id || ':' || data_version, ',' order by id) from app.families) as families,
					(select quantity_at_check->>'mass_g' from app.shopping_list_checks where quantity_at_check->>'mass_g' like '12345678901234567890%' limit 1) as mass`;
			expect(after.catalogue).toBe(before.catalogue);
			expect(after.families).toBe(before.families);
			expect(after.mass).toBe('12345678901234567890.123456789');
			// Re-reading the restored database gives back the same tables, byte for byte.
			const again = await readSnapshot(tx);
			for (const table of again.tables) expect(JSON.parse(table.rows), table.name).toEqual(doc.tables[`app.${table.name}`]);
		});
	});

	it('refuses a destination that is not empty', async () => {
		const document = await freshExport();
		await inRolledBack(async (tx) => {
			expect(await restoreReason(tx, document)).toBe('not_empty');
		});
	});

	it('refuses other migrations, other tables, unknown columns and another format', async () => {
		const document = await freshExport();
		const cases: [string, string][] = [
			[document.replace('"migrations":[', '"migrations":["19990101000000",'), 'migrations'],
			[document.replace('"app.books":', '"app.bookz":'), 'tables'],
			[document.replace('"app.books":[{', '"app.books":[{"ghost":1,'), 'columns'],
			[document.replace('cosasimangia-export/1', 'cosasimangia-export/9'), 'format'],
		];
		for (const [variant, reason] of cases) {
			expect(variant, reason).not.toBe(document);
			await inRolledBack(async (tx) => {
				await wipe(tx);
				expect(await restoreReason(tx, variant)).toBe(reason);
			});
		}
	});

	it('refuses an export with dangling references or content that does not survive the load', async () => {
		const document = await freshExport();
		const doc = JSON.parse(document);
		const rating = doc.tables['app.ratings'][0];
		const orphan = JSON.stringify({ ...rating, recipe_id: '00000000-0000-0000-0000-000000000000' });
		const withOrphan = document.replace('"app.ratings":[', `"app.ratings":[${orphan},`);
		// An instant written with another offset loads as the same moment but reads back differently.
		// After "auth": the first instant of the document is createdAt, which is not compared.
		const at = document.indexOf('"auth":');
		const shifted = document.slice(0, at) + document.slice(at).replace(/("\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?)\+00:00"/, '$1+02:00"');
		expect(shifted).not.toBe(document);
		await inRolledBack(async (tx) => {
			await wipe(tx);
			expect(await restoreReason(tx, withOrphan)).toBe('orphans');
		});
		await inRolledBack(async (tx) => {
			await wipe(tx);
			expect(await restoreReason(tx, shifted)).toBe('mismatch');
		});
	});
```

- [ ] **Step 2: verifica che falliscano**

Run: `npm test -w server -- backup.test.ts`
Expected: FAIL (`Cannot find module '../src/backup/restore.ts'`).

- [ ] **Step 3: implementa `restore.ts`**

```ts
import type postgres from 'postgres';
import { EXPORT_FORMAT } from './format.ts';
import { appTables } from './read.ts';

type Tx = postgres.TransactionSql;

export class RestoreError extends Error {
	readonly reason: 'format' | 'unknown_migrations' | 'migrations' | 'tables' | 'not_empty' | 'columns' | 'orphans' | 'mismatch';
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

const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;

interface Target {
	/** Qualified, quoted relation: app."families", auth.users. */
	rel: string;
	/** Path of the rows in the document. */
	path: string;
	/** Display name: app.families. */
	name: string;
}

/** Columns of `rel`: all, and those an insert may set (not generated). */
async function columns(tx: Tx, rel: string): Promise<{ all: string[]; insertable: string[] }> {
	const rows = await tx.unsafe<{ name: string; generated: boolean }[]>(
		`select attname as name, attgenerated <> '' as generated from pg_attribute
		where attrelid = ${literal(rel)}::regclass and attnum > 0 and not attisdropped order by attnum`,
	);
	return { all: rows.map((r) => r.name), insertable: rows.filter((r) => !r.generated).map((r) => r.name) };
}

const quoteIdent = (name: string) => `"${name.replaceAll('"', '""')}"`;

/** App tables in foreign-key order (parents first), alphabetical among peers; cycles appended. */
async function loadOrder(tx: Tx, names: string[]): Promise<string[]> {
	const edges = await tx<{ child: string; parent: string }[]>`
		select c.relname as child, p.relname as parent from pg_constraint k
		join pg_class c on c.oid = k.conrelid join pg_class p on p.oid = k.confrelid
		where k.contype = 'f' and c.relnamespace = 'app'::regnamespace and p.relnamespace = 'app'::regnamespace
			and c.oid <> p.oid`;
	const pending = new Set(names);
	const order: string[] = [];
	while (pending.size > 0) {
		const ready = [...pending].filter((n) => !edges.some((e) => e.child === n && pending.has(e.parent))).sort();
		const next = ready.length > 0 ? ready : [...pending].sort().slice(0, 1);
		for (const n of next) {
			order.push(n);
			pending.delete(n);
		}
	}
	return order;
}

/**
 * Loads a decrypted export into an empty database with the same migrations, inside the
 * caller's transaction, then checks foreign keys and contents (spec, section 4).
 * Rows go from the document to the tables in SQL only: numbers never pass through JavaScript.
 */
export async function restoreExport(tx: Tx, document: string, options: RestoreOptions = {}): Promise<RestoreResult> {
	await tx`set local time zone 'UTC'`;
	await tx`create temp table restore_document (doc jsonb) on commit drop`;
	await tx`insert into pg_temp.restore_document (doc) values (${document}::jsonb)`;

	// 1. Format
	const [{ format }] = await tx<{ format: string | null }[]>`select doc->>'format' as format from pg_temp.restore_document`;
	if (format !== EXPORT_FORMAT) throw new RestoreError('format', [String(format)]);

	// 2. Migrations
	const [{ exported, present }] = await tx<{ exported: string[] | null; present: boolean }[]>`
		select doc->'migrations' as exported, to_regclass('supabase_migrations.schema_migrations') is not null as present
		from pg_temp.restore_document`;
	if (!exported || !present) {
		if (!options.acceptUnknownMigrations) throw new RestoreError('unknown_migrations');
	} else {
		const target = (await tx<{ version: string }[]>`select version from supabase_migrations.schema_migrations`).map((r) => r.version);
		const missing = exported.filter((v) => !target.includes(v)).map((v) => `missing ${v}`);
		const extra = target.filter((v) => !exported.includes(v)).map((v) => `extra ${v}`);
		if (missing.length + extra.length > 0) throw new RestoreError('migrations', [...missing, ...extra]);
	}

	// 3. Same tables
	const tables = await appTables(tx);
	const exportedTables = (await tx<{ name: string }[]>`select jsonb_object_keys(doc->'tables') as name from pg_temp.restore_document`).map((r) => r.name);
	const targetNames = tables.map((t) => `app.${t.name}`);
	const tableDiff = [
		...exportedTables.filter((n) => !targetNames.includes(n)).map((n) => `unknown ${n}`),
		...targetNames.filter((n) => !exportedTables.includes(n)).map((n) => `missing ${n}`),
	];
	if (tableDiff.length > 0) throw new RestoreError('tables', tableDiff);

	const targets: Target[] = [
		{ rel: 'auth.users', path: `doc->'auth'->'users'`, name: 'auth.users' },
		{ rel: 'auth.identities', path: `doc->'auth'->'identities'`, name: 'auth.identities' },
		...(await loadOrder(tx, tables.map((t) => t.name))).map((name) => ({
			rel: `app.${quoteIdent(name)}`,
			path: `doc->'tables'->${literal(`app.${name}`)}`,
			name: `app.${name}`,
		})),
	];

	// 4. Empty destination
	const filled: string[] = [];
	for (const t of targets) {
		const [{ any }] = await tx.unsafe<{ any: boolean }[]>(`select exists (select 1 from ${t.rel}) as any`);
		if (any) filled.push(t.name);
	}
	if (filled.length > 0) throw new RestoreError('not_empty', filled);

	// 5. Every exported column exists; generated ones are not inserted
	const plans: { target: Target; cols: string[] }[] = [];
	const unknown: string[] = [];
	for (const t of targets) {
		const keys = (await tx.unsafe<{ key: string }[]>(
			`select distinct jsonb_object_keys(e) as key from pg_temp.restore_document, jsonb_array_elements(${t.path}) e`,
		)).map((r) => r.key);
		const { all, insertable } = await columns(tx, t.rel);
		unknown.push(...keys.filter((k) => !all.includes(k)).map((k) => `${t.name}.${k}`));
		plans.push({ target: t, cols: insertable.filter((c) => keys.includes(c)) });
	}
	if (unknown.length > 0) throw new RestoreError('columns', unknown);

	// 6. Load as exported: no counters, immutability checks or profile trigger
	await tx`set local session_replication_role = replica`;
	let rows = 0;
	for (const { target, cols } of plans) {
		if (cols.length === 0) continue;
		const list = cols.map(quoteIdent).join(', ');
		const inserted = await tx.unsafe(
			`insert into ${target.rel} (${list}) select ${list} from jsonb_populate_recordset(null::${target.rel},
				(select ${target.path} from pg_temp.restore_document))`,
		);
		if (target.rel.startsWith('app.')) rows += inserted.count;
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
		if (n > 0) orphans.push(`${fk.child}.${fk.name} (${n})`);
	}
	if (orphans.length > 0) throw new RestoreError('orphans', orphans);

	// 8. Same content as the document
	const different: string[] = [];
	for (const table of tables) {
		const [{ same }] = await tx.unsafe<{ same: boolean }[]>(
			`select (select coalesce(json_agg(t order by ${table.orderBy}), '[]')::jsonb from app.${table.ident} t)
				= (select doc->'tables'->${literal(`app.${table.name}`)} from pg_temp.restore_document) as same`,
		);
		if (!same) different.push(`app.${table.name}`);
	}
	for (const t of targets.slice(0, 2)) {
		// A newer Auth may add columns: compare the exported ones, row by row.
		const [{ same }] = await tx.unsafe<{ same: boolean }[]>(
			`select (select count(*) from ${t.rel}) = (select jsonb_array_length(${t.path}) from pg_temp.restore_document)
				and not exists (
					select 1 from pg_temp.restore_document, jsonb_array_elements(${t.path}) e
					where not exists (select 1 from ${t.rel} r where r.id = (e->>'id')::uuid and to_jsonb(r) @> e)
				) as same`,
		);
		if (!same) different.push(t.name);
	}
	if (different.length > 0) throw new RestoreError('mismatch', different);

	const [counts] = await tx<{ users: number; identities: number }[]>`
		select (select count(*)::int from auth.users) as users, (select count(*)::int from auth.identities) as identities`;
	return { tables: tables.length, rows, ...counts };
}
```

Se `truncate ... cascade` del test fallisce per un permesso su una tabella di `auth` collegata (codice `42501`), sostituisci `wipe` con: `set local session_replication_role = replica`, `delete from` di ogni tabella di `app`, di `auth.identities`, `auth.sessions` e `auth.users`, poi `set local session_replication_role = origin`.

- [ ] **Step 4: verifica**

Run: `npm test -w server -- backup.test.ts && npm run typecheck`
Expected: PASS di tutti i test del file.

- [ ] **Step 5: verifica che la suite completa resti verde** (il test svuota e ripristina dentro transazioni annullate)

Run: `npm test -w server`
Expected: PASS.

- [ ] **Step 6: commit**

```bash
git add server/src/backup/restore.ts server/test/backup.test.ts
git commit -m "Esportazione: ripristino in modalità replica con verifica di chiavi esterne e contenuti"
```

---

### Task 7: CLI di ripristino

**Files:**
- Create: `scripts/backup/restore.ts`
- Modify: `server/test/backup.test.ts` (test della CLI)

**Interfaces:**
- Consumes: `decodeExport`, `parseKeyList`, `ExportFormatError` (Task 2); `restoreExport`, `RestoreError` (Task 6).
- Produces: comando `node scripts/backup/restore.ts <file> [--dry-run] [--accept-unknown-migrations]` con `BACKUP_ENCRYPTION_KEY` e `DATABASE_URL`; codice di uscita 0 se riuscito, 1 se rifiutato, 2 se gli argomenti mancano.

- [ ] **Step 1: scrivi i test che falliscono**

In `server/test/backup.test.ts`:

```ts
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
```

```ts
	const cli = join(import.meta.dirname, '..', '..', 'scripts', 'backup', 'restore.ts');
	const runCli = async (args: string[], env: Record<string, string>) => {
		try {
			const { stdout, stderr } = await promisify(execFile)(process.execPath, [cli, ...args], { env: { ...process.env, ...env } });
			return { code: 0, stdout, stderr };
		} catch (error) {
			const e = error as { code: number; stdout: string; stderr: string };
			return { code: e.code, stdout: e.stdout, stderr: e.stderr };
		}
	};

	it('CLI: refuses a non-empty database, a wrong key and missing arguments, without writing', async () => {
		const bucket = new MemoryBucket();
		const info = logs();
		await runNightlyExportOn(deps(bucket), night(21));
		info.mockRestore();
		const dir = await mkdtemp(join(tmpdir(), 'export-'));
		const file = join(dir, 'export.bin');
		await writeFile(file, [...bucket.objects.values()][0].body);
		const url = process.env.TEST_DATABASE_URL!;
		try {
			const full = await runCli([file, '--dry-run'], { BACKUP_ENCRYPTION_KEY: keyB64, DATABASE_URL: url });
			expect(full.code).toBe(1);
			expect(full.stderr).toContain('not_empty');
			const otherKey = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
			const wrong = await runCli([file], { BACKUP_ENCRYPTION_KEY: otherKey, DATABASE_URL: url });
			expect(wrong.code).toBe(1);
			expect(wrong.stderr).toContain('corrupt');
			expect((await runCli([], { BACKUP_ENCRYPTION_KEY: keyB64, DATABASE_URL: url })).code).toBe(2);
		} finally {
			await rm(dir, { recursive: true });
		}
	});
```

- [ ] **Step 2: verifica che falliscano**

Run: `npm test -w server -- backup.test.ts -t CLI`
Expected: FAIL (file della CLI inesistente, codice d'uscita 1 con `Cannot find module`, quindi lo `stderr` non contiene `not_empty`).

- [ ] **Step 3: implementa la CLI**

`scripts/backup/restore.ts`:

```ts
/**
 * Restores a nightly export into an empty database with the same migrations
 * (procedure in supabase/README.md, spec 2026-10-11-esportazione-r2).
 *
 *   BACKUP_ENCRYPTION_KEY=<base64 | k1=...,k2=...> DATABASE_URL=postgresql://postgres:...@host:5432/postgres \
 *     node scripts/backup/restore.ts <file> [--dry-run] [--accept-unknown-migrations]
 */
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { decodeExport, ExportFormatError, parseKeyList } from '../../server/src/backup/format.ts';
import { RestoreError, type RestoreResult, restoreExport } from '../../server/src/backup/restore.ts';

class DryRun extends Error {}

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');
const acceptUnknownMigrations = args.includes('--accept-unknown-migrations');
const keyList = process.env.BACKUP_ENCRYPTION_KEY;
const url = process.env.DATABASE_URL;

if (!file || !keyList || !url) {
	console.error('usage: BACKUP_ENCRYPTION_KEY=... DATABASE_URL=... node scripts/backup/restore.ts <file> [--dry-run] [--accept-unknown-migrations]');
	process.exit(2);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
	const document = await decodeExport(new Uint8Array(await readFile(file)), await parseKeyList(keyList));
	let result: RestoreResult | undefined;
	try {
		await sql.begin(async (tx) => {
			result = await restoreExport(tx, document, { acceptUnknownMigrations });
			if (dryRun) throw new DryRun();
		});
	} catch (error) {
		if (!(error instanceof DryRun)) throw error;
	}
	if (acceptUnknownMigrations) console.warn('warning: migrations not compared (--accept-unknown-migrations)');
	console.log(`${dryRun ? 'dry run passed, nothing written' : 'restored'}: ${result!.tables} tables, ${result!.rows} rows, ${result!.users} users, ${result!.identities} identities`);
} catch (error) {
	console.error(error instanceof RestoreError || error instanceof ExportFormatError ? `refused: ${error.message}` : error);
	process.exitCode = 1;
} finally {
	await sql.end();
}
```

- [ ] **Step 4: verifica**

Run: `npm test -w server -- backup.test.ts && npm run typecheck`
Expected: PASS; il typecheck della radice compila `scripts/backup/restore.ts` e i moduli del server che importa.

- [ ] **Step 5: commit**

```bash
git add scripts/backup/restore.ts server/test/backup.test.ts
git commit -m "Esportazione: CLI di ripristino con prova a vuoto"
```

---

### Task 8: procedura scritta e prova nell'ambiente di verifica

**Files:**
- Modify: `supabase/README.md` (nuova sezione «Esportazione notturna e ripristino»)

**Interfaces:**
- Consumes: tutto quanto sopra.
- Produces: procedura per l'utente; esiti della prova manuale e misura della CPU per la descrizione della PR.

- [ ] **Step 1: scrivi la sezione in `supabase/README.md`**

```markdown
## Esportazione notturna e ripristino

Il Worker esporta ogni notte alle 02:30 UTC (secondo tentativo alle 04:30) i dati di
`app` e gli utenti di Auth (`auth.users`, `auth.identities`) nel bucket R2
`cosasimangia-backups` (giurisdizione UE), cifrati con la chiave del secret
`BACKUP_ENCRYPTION_KEY`, e conserva le ultime 7. Restano fuori sessioni, token e agenti
collegati. Spec: `progetto/superpowers/specs/2026-10-11-esportazione-r2.md`.

### Ripristino

1. **Scarica l'esportazione.** La chiave dell'oggetto si legge nel dashboard (R2 →
   `cosasimangia-backups` → `exports/`) o nel log `backup_export_done`:
   `npx wrangler r2 object get cosasimangia-backups/exports/<chiave> --remote --jurisdiction eu --file export.bin`
   (da `server/`).
2. **Prepara la destinazione**, vuota e con le migrazioni del commit in vigore la notte
   dell'esportazione (`git log --until=<data> -1 main`):
   - prova: un secondo stack locale (`supabase db reset --no-seed`);
   - produzione persa: un progetto Supabase nuovo, migrazioni applicate da quel commit,
     password di `app_server` impostata a mano, chiavi di firma asimmetriche attive.
3. **Prova a vuoto, poi ripristino**, con la chiave presa dal gestore di password:
   ```bash
   BACKUP_ENCRYPTION_KEY='<chiave>' DATABASE_URL='postgresql://postgres:<password>@<host>:5432/postgres' \
     node scripts/backup/restore.ts export.bin --dry-run
   # se riesce:
   BACKUP_ENCRYPTION_KEY='<chiave>' DATABASE_URL='...' node scripts/backup/restore.ts export.bin
   ```
   La CLI rifiuta una destinazione non vuota, migrazioni diverse, una chiave sbagliata o
   un file alterato; carica tutto in una transazione e fa il commit solo se chiavi
   esterne e contenuti coincidono con l'esportazione.
4. **Dopo un ripristino in produzione:** aggiorna l'origine di Hyperdrive se il progetto
   è nuovo; riconfigura a mano Auth (provider, SMTP di Resend, server OAuth 2.1, URL di
   redirect); avvisa che tutti rifanno l'accesso e ricollegano gli agenti.

Con più chiavi (dopo una rotazione) passa `BACKUP_ENCRYPTION_KEY='k1=<…>,k2=<…>'`.
```

- [ ] **Step 2: prova manuale dell'esportazione con `wrangler dev`**

```bash
cp server/.env.example server/.env   # se manca; compila connessione app_server, SUPABASE_URL e
echo "BACKUP_ENCRYPTION_KEY=$(openssl rand -base64 32)" >> server/.env   # una chiave locale
npm run build -w web
npm run dev -w server -- --test-scheduled
# in un altro terminale:
curl "http://localhost:8787/cdn-cgi/local/scheduled?cron=30+2,4+*+*+*"
```

Expected: nel terminale di `wrangler dev` un log `backup_export_done`. Annota `uncompressedBytes`, `storedBytes`, `ms` e la CPU (Wrangler la mostra in locale solo come durata: per la CPU vale la misura sul Worker pubblicato, da chiedere all'utente nella PR come verifica successiva). Una seconda chiamata deve dare `backup_export_skipped`.

- [ ] **Step 3: scarica l'esportazione locale e ripristinala in un secondo stack**

```bash
cd server && npx wrangler r2 object get cosasimangia-backups/exports/<chiave dal log> --local --jurisdiction eu --file ../export.bin && cd ..
```

Avvia un secondo stack Supabase locale da una copia della cartella `supabase/` (nello scratchpad della sessione) con `project_id` univoco in `config.toml` (per esempio `esportazione-verifica`) e porte libere (583xx), poi `supabase start --workdir <copia>` e `supabase db reset --no-seed --workdir <copia>`. Un project id mai avviato fallisce con Podman 5.7.1 («failed to copy secret file into container»): usa `PATH=$HOME/.cache/podwrap:$HOME/.local/bin:$PATH`, il wrapper che lo aggira. Più worktree usano stack e wrangler insieme: scegli anche `--port` e `--inspector-port` liberi per `wrangler dev` nello step 2. Quindi:

```bash
BACKUP_ENCRYPTION_KEY="$(grep BACKUP_ENCRYPTION_KEY server/.env | cut -d= -f2-)" \
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:<porta del secondo stack>/postgres \
  node scripts/backup/restore.ts export.bin --dry-run
# poi senza --dry-run
```

Expected: `dry run passed, nothing written: …`, poi `restored: …` con gli stessi conteggi del log. Fai il login nell'app web locale puntata al secondo stack con un utente ripristinato (password nota del seed o dei dati locali) e controlla che veda famiglia e menu. Ferma il secondo stack e cancella `export.bin`.

- [ ] **Step 4: verifica finale**

Run: `supabase test db && npm run typecheck && npm test`
Expected: tutto verde.

- [ ] **Step 5: commit**

```bash
git add supabase/README.md
git commit -m "Esportazione: procedura di ripristino e prova nell'ambiente di verifica"
```

Riporta nella descrizione della PR: esito della prova manuale, dimensioni, durata, file condivisi toccati, passi esterni della sezione 5 della spec da fare prima della prima pubblicazione.
