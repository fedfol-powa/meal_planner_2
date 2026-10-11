# Esportazione notturna in R2: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ogni notte il Worker esporta in R2, cifrati, i dati di `app` e gli utenti di Auth, conserva le ultime 7 esportazioni, e una CLI provata in CI le ripristina in un database appena migrato.

**Architecture:** un ruolo Postgres `app_backup` in sola lettura (BYPASSRLS) e una funzione `security definer` per gli utenti di Auth. In una transazione `repeatable read` il database stima la dimensione e produce il JSON di ogni tabella; il Worker lo compone in un Blob, lo comprime con gzip e lo cifra con AES-256-GCM, poi lo scrive in R2 da un'espressione cron dedicata. Il ripristino carica il documento in una tabella temporanea `json`, inserisce in modalità `replica` in ordine di chiavi esterne senza i marcatori `xid8`, e confronta in SQL prima del commit.

**Tech Stack:** Cloudflare Workers (Cron Trigger, R2 binding), Postgres.js via Hyperdrive, WebCrypto, `CompressionStream`, Vitest, pgTAP, Node 26 per la CLI, Supabase CLI per la prova in CI.

**Spec:** `progetto/superpowers/specs/2026-10-11-esportazione-r2.md` (leggila prima; subordinata a `progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`). Review recepita: `progetto/coordinamento/revisioni/w5-esportazione-spec-piano.md`.

## Global Constraints

- Codice, identificatori, commenti, test e output della CLI in inglese; documenti e commit in italiano (`AGENTS.md`).
- Nessuna dipendenza nuova: WebCrypto, `CompressionStream`/`DecompressionStream`, `Blob`, Postgres.js già presente (`postgres` 3.4.9), `git` e Supabase CLI solo negli strumenti e nei test.
- `erasableSyntaxOnly`: niente parameter properties, niente `enum`; la CLI gira con Node senza build.
- Formato: `cosasimangia-export/1`; magia `CSM1`; versione binaria 1; IV 12 byte; chiave 32 byte; identificativo di default `k1`.
- Chiave R2: `exports/<YYYY-MM-DD>T<HH-MM>Z.json.gz.enc`; `KEEP_EXPORTS = 7`; `EXPORT_LIMIT_BYTES = 16 * 1024 * 1024` (valore iniziale, confermato o abbassato dal Task 9: picco misurato sotto 64 MB).
- Espressioni cron: `'0 * * * *'` (job, invariata) e `'30 2,4 * * *'` (esportazione).
- Bucket `cosasimangia-backups`, giurisdizione `eu`, binding `BACKUPS`; secret `BACKUP_ENCRYPTION_KEY`; var `BACKUP_KEY_ID` = `k1`.
- `XID_MARKERS = { families: ['data_version_xid'], catalogue_state: ['version_xid'] }`; `MIGRATION_ROWS = { catalogue_state: 'id and version = 1 and version_xid is null' }`.
- Log del Worker con soli campi scelti (`logEvent`), mai dati, chiavi o messaggi d'errore. La CLI stampa solo esito, motivo, nomi strutturali e codici: mai oggetti errore, messaggi, `detail`, query, parametri o valori.
- Chiavi e password nei comandi della procedura si leggono con `read -rs`, mai scritte in chiaro nella riga di comando.
- Modifiche ai file condivisi minime e solo quelle elencate in «Cosa uso e cosa produco» della spec.
- Nessun comando sul progetto Supabase remoto o sull'account Cloudflare.
- Il database locale di questo worktree non è condiviso: prima di ogni comando che lo azzera, verifica con `supabase status` che lo stack sia quello del worktree (vedi «Preparazione»).
- Commit piccoli in italiano, con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` in coda.

## Review Focus

- **Fuso della sessione diverso fra esportazione e destinazione:** lettura e ripristino fissano `UTC`. Test nel Task 6 (ripristino da una sessione `Europe/Rome`).
- **Numeri oltre la precisione di JavaScript:** non passano mai da `JSON.parse` nel percorso dei dati. Test nel Task 6 (mutazione di 1 rilevata) e nel Task 8 (numeri adiacenti identici dopo il ripristino reale).
- **Righe inserite da migrazioni future nella destinazione:** la prova in CI del Task 8 fallisce finché `MIGRATION_ROWS` non le elenca.
- **Archivio precedente all'ultima migrazione:** `inspect` trova il commit giusto (Task 7) e la CLI rifiuta una destinazione più nuova (Task 8).
- **Errore a metà caricamento con dati personali nel messaggio di Postgres:** nessun valore stampato, destinazione invariata (Task 8, sentinella).

---

## Preparazione (una volta, prima del Task 1)

Il `project_id` di `supabase/config.toml` (`meal_planner_2`) è lo stesso del checkout principale: il container `supabase_db_meal_planner_2` è condiviso e **non va azzerato**. Per questo worktree si usa una copia della cartella `supabase/` nello scratchpad con un `project_id` e porte propri; i comandi `supabase` di questo piano passano sempre `--workdir "$SB"`.

```bash
export PATH=$HOME/.cache/podwrap:/opt/podman/bin:$HOME/.local/bin:$PATH   # wrapper per i project id nuovi con Podman 5.7.1
export SB=<scratchpad>/sb-esportazione                                    # copia della cartella supabase del worktree
mkdir -p "$SB" && rsync -a --delete supabase/ "$SB/supabase/"
# in "$SB/supabase/config.toml": project_id = "w5-esportazione", [db] port = 58322, shadow_port = 58320, [api] port = 58321, [studio] port = 58323, [inbucket] port = 58324
supabase db start --workdir "$SB"
export TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:58322/postgres
```

Dopo ogni modifica alle migrazioni o ai test pgTAP: `rsync -a --delete supabase/ "$SB/supabase/"` e ripristina il `config.toml` della copia (oppure copia solo `migrations/` e `tests/`: `rsync -a --delete supabase/migrations/ "$SB/supabase/migrations/" && rsync -a --delete supabase/tests/ "$SB/supabase/tests/"`).

## Mappa dei file

| File | Responsabilità |
|---|---|
| `supabase/migrations/20261012100000_backup.sql` (nuovo) | ruolo `app_backup`, permessi, `app.backup_auth_rows()` |
| `supabase/tests/backup_test.sql` (nuovo) | permessi e lettura di `app_backup`, chiavi primarie, niente sequenze, marcatori `xid8` |
| `supabase/tests/coverage_test.sql` | funzioni eseguibili da `app_backup` |
| `server/src/backup/format.ts` (nuovo) | chiavi, intestazione, gzip, AES-GCM; valido in Worker e Node |
| `server/src/backup/read.ts` (nuovo) | tabelle, stima, fotografia, parti del documento |
| `server/src/backup/export.ts` (nuovo) | esportazione notturna, limite, salto, conservazione, log |
| `server/src/backup/restore.ts` (nuovo) | controlli, caricamento, `verifyRestored` |
| `server/src/scheduled.ts` (nuovo) | smistamento delle espressioni cron |
| `scripts/backup/migrations-commit.ts` (nuovo) | commit con esattamente le migrazioni dell'esportazione |
| `scripts/backup/restore.ts` (nuovo) | CLI `inspect` e `restore` |
| `server/src/db.ts`, `server/src/env.ts`, `server/src/index.ts`, `server/wrangler.jsonc` | identità `backup`, configurazione, smistamento, cron e binding |
| `server/vitest.config.ts`, `server/vitest.drill.config.ts` (nuovo), `server/package.json`, `.github/workflows/ci.yml` | prova di ripristino separata e ultima in CI |
| `server/test/support/r2.ts`, `server/test/support/backup.ts` (nuovi) | bucket finto, fixture e helper comuni |
| `server/src/backup/format.test.ts`, `scripts/backup/migrations-commit.test.ts`, `server/test/backup.test.ts`, `server/test/scheduled.test.ts`, `server/test/drill/restore-drill.test.ts` (nuovi) | test |
| `server/.env.example`, `server/README.md`, `supabase/README.md` | chiave locale, prova del cron, ruolo, procedura |

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
-- Test-only rights, rolled back with the transaction: postgres may become app_backup,
-- and app_backup may call pgTAP. Production grants neither.
grant app_backup to postgres with inherit false, set true;
grant usage on schema extensions to app_backup;
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
select is(
	array(select c.relname || '.' || a.attname from pg_attribute a join pg_class c on c.oid = a.attrelid
		where c.relnamespace = 'app'::regnamespace and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
			and a.atttypid = 'xid8'::regtype order by 1),
	array['catalogue_state.version_xid', 'families.data_version_xid'],
	'xid8 markers are those of XID_MARKERS in server/src/backup/restore.ts');

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

Run: `rsync -a --delete supabase/tests/ "$SB/supabase/tests/" && supabase test db --workdir "$SB"`
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

Run: `rsync -a --delete supabase/migrations/ "$SB/supabase/migrations/" && supabase db reset --workdir "$SB" && supabase test db --workdir "$SB"`
Expected: PASS di tutti i file.

- [ ] **Step 5: aggiorna `supabase/README.md`**

Nella tabella «Ruoli»:

```markdown
| `app_backup` | NOLOGIN, BYPASSRLS | legge tutte le tabelle di `app` (anche le future) e le migrazioni applicate; esegue solo `app.backup_auth_rows()`; non scrive nulla. Usato dall'esportazione notturna |
```

e nella tabella delle funzioni per ruolo `| `app_backup` | `backup_auth_rows` |`.

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
  - `type BackupKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>`
  - `importKey(base64: string): Promise<BackupKey>` (rifiuta lunghezze diverse da 32 byte)
  - `parseKeyList(value: string): Promise<Record<string, BackupKey>>` (`k1=<b64>,k2=<b64>`; un valore solo vale per `k1`)
  - `encodeExport(parts: string[], key: BackupKey, keyId: string): Promise<{ blob: Blob; uncompressedBytes: number; storedBytes: number }>`
  - `decodeExport(bytes: Uint8Array, keys: Readonly<Record<string, BackupKey>>): Promise<string>`
  - `class ExportFormatError extends Error { reason: 'magic' | 'version' | 'unknown_key' | 'corrupt' }`

- [ ] **Step 1: scrivi i test che falliscono**

`server/src/backup/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { decodeExport, encodeExport, ExportFormatError, importKey, parseKeyList } from './format.ts';

const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const randomKey = () => base64(crypto.getRandomValues(new Uint8Array(32)));
const bytesOf = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

describe('export format', () => {
	it('round-trips a document given in parts, reporting sizes', async () => {
		const key = await importKey(randomKey());
		const parts = ['{"hello":"mondo è",', '"n":12345678901234567890.1}'];
		const { blob, uncompressedBytes, storedBytes } = await encodeExport(parts, key, 'k1');
		const bytes = await bytesOf(blob);
		expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe('CSM1');
		expect(uncompressedBytes).toBe(new TextEncoder().encode(parts.join('')).length);
		expect(storedBytes).toBe(bytes.length);
		await expect(decodeExport(bytes, { k1: key })).resolves.toBe(parts.join(''));
	});

	it('uses a fresh IV every time', async () => {
		const key = await importKey(randomKey());
		const a = await bytesOf((await encodeExport(['{}'], key, 'k1')).blob);
		const b = await bytesOf((await encodeExport(['{}'], key, 'k1')).blob);
		expect(base64(a.subarray(8, 20))).not.toBe(base64(b.subarray(8, 20)));
	});

	it('rejects keys that are not 32 bytes', async () => {
		await expect(importKey(base64(new Uint8Array(16)))).rejects.toThrow('32 bytes');
	});

	it('parses a key list, a single key meaning k1', async () => {
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
		const bytes = await bytesOf((await encodeExport(['{"a":1}'], k1, 'k1')).blob);
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

Run: `npm test -w server -- src/backup/format.test.ts`
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

/** `k1=<base64>,k2=<base64>`; a single key without a name is k1. */
export async function parseKeyList(value: string): Promise<Record<string, BackupKey>> {
	const entries = value.split(',').map((p) => p.trim()).filter(Boolean);
	const keys: Record<string, BackupKey> = {};
	for (const entry of entries) {
		const named = /^([A-Za-z0-9_-]+)=(.+)$/.exec(entry);
		// A bare base64 key may end with "=": only "<id>=<44 chars>" counts as named.
		if (named && named[2].length >= 40) keys[named[1]] = await importKey(named[2]);
		else if (entries.length === 1) keys.k1 = await importKey(entry);
		else throw new Error('backup key list: use k1=<base64>,k2=<base64>');
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

const drain = async (stream: ReadableStream<Uint8Array>) => new Uint8Array(await new Response(stream).arrayBuffer());

/** The parts become one UTF-8 Blob, streamed through gzip: no joined string is ever built. */
export async function encodeExport(parts: string[], key: BackupKey, keyId: string): Promise<{ blob: Blob; uncompressedBytes: number; storedBytes: number }> {
	const head = header(keyId);
	const source = new Blob(parts);
	const gzipped = await drain(source.stream().pipeThrough(new CompressionStream('gzip')));
	const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
	const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: head }, key, gzipped);
	const blob = new Blob([head, iv, sealed]);
	return { blob, uncompressedBytes: source.size, storedBytes: blob.size };
}

export async function decodeExport(bytes: Uint8Array, keys: Readonly<Record<string, BackupKey>>): Promise<string> {
	if (bytes.length < 6 || !MAGIC.every((b, i) => bytes[i] === b)) throw new ExportFormatError('magic');
	if (bytes[4] !== BINARY_VERSION) throw new ExportFormatError('version');
	const end = 6 + bytes[5];
	const key = keys[new TextDecoder().decode(bytes.subarray(6, end))];
	if (!key) throw new ExportFormatError('unknown_key');
	let gzipped: ArrayBuffer;
	try {
		gzipped = await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: bytes.slice(end, end + IV_BYTES), additionalData: bytes.slice(0, end) },
			key,
			bytes.slice(end + IV_BYTES),
		);
	} catch {
		throw new ExportFormatError('corrupt');
	}
	return new TextDecoder().decode(await drain(new Blob([gzipped]).stream().pipeThrough(new DecompressionStream('gzip'))));
}
```

Se `tsc` segnala `Uint8Array<ArrayBufferLike>` non assegnabile a `BufferSource` o `BlobPart`, usa `.slice()` (copia con `ArrayBuffer` proprio) nei punti segnalati; non usare cast.

- [ ] **Step 4: verifica**

Run: `npm test -w server -- src/backup/format.test.ts && npm run typecheck`
Expected: PASS; typecheck pulito (anche quello della radice).

- [ ] **Step 5: commit**

```bash
git add server/src/backup/format.ts server/src/backup/format.test.ts
git commit -m "Esportazione: formato binario con gzip e AES-256-GCM"
```

---

### Task 3: identità `backup`, stima e fotografia del database

**Files:**
- Modify: `server/src/db.ts` (tipo `DbIdentity` e `switch` di `withDbOn`)
- Create: `server/src/backup/read.ts`
- Create: `server/test/support/backup.ts`
- Create: `server/test/backup.test.ts` (primo blocco)

**Interfaces:**
- Consumes: `EXPORT_FORMAT` (Task 2); `withDbOn`, `Tx` di `server/src/db.ts`; `menuFixtures`, `seedShoppingEquivalence`.
- Produces:
  - `DbIdentity` con `{ kind: 'backup' }`
  - `interface TableDump { name: string; ident: string; orderBy: string; rows: string; count: number }`
  - `interface Snapshot { migrations: string; auth: string; users: number; identities: number; tables: TableDump[] }`
  - `appTables(tx: Tx): Promise<{ name: string; ident: string; orderBy: string }[]>`
  - `estimateExportBytes(tx: Tx): Promise<number>`
  - `readSnapshot(tx: Tx): Promise<Snapshot>`
  - `exportParts(snapshot: Snapshot, createdAt: string, workerVersion: string): string[]`
  - test: `seedBackupFixtures(db: TestDatabase): Promise<BackupFixtures>` con `{ userId, familyId, listId }`

- [ ] **Step 1: fixture comuni**

`server/test/support/backup.ts`:

```ts
import type { TestDatabase } from './db.ts';
import { menuFixtures } from './menu.ts';
import { seedShoppingEquivalence } from './shopping-fixtures.ts';

export interface BackupFixtures {
	userId: string;
	familyId: string;
	listId: string;
}

/** Rows in every area, plus the values a backup most easily corrupts. */
export async function seedBackupFixtures(db: TestDatabase): Promise<BackupFixtures> {
	const fx = menuFixtures(db);
	const { userId, familyId } = await fx.member();
	await fx.book();
	const ingredientId = await fx.ingredient();
	const recipeId = await fx.publishRecipe({ ingredientIds: [ingredientId] });
	await fx.publishVersion(recipeId, '2026-02-01T00:00:00Z');
	const weekId = await fx.insertWeek(familyId, '2026-10-12');
	await fx.insertSlot(weekId, { date: '2026-10-12', mealType: 'lunch', recipeId, updatedBy: userId });
	await db.admin`insert into app.ratings (user_id, recipe_id, stars) values (${userId}, ${recipeId}, 4)`;
	// Generated column from_dimension.
	await seedShoppingEquivalence(db, { ingredientId, fromUnit: 'piece', toUnit: 'g', factor: 120 });
	const [{ id: listId }] = await db.admin<{ id: string }[]>`
		insert into app.shopping_lists (family_id, week_id, updated_by) values (${familyId}, ${weekId}, ${userId}) returning id`;
	// Adjacent numbers beyond the precision of a JavaScript number.
	await db.admin.unsafe(`insert into app.shopping_list_checks (shopping_list_id, ingredient_id, variety_key, quantity_at_check) values
		('${listId}', '${ingredientId}', 'a', '{"mass_g": 9007199254740993}'),
		('${listId}', '${ingredientId}', 'b', '{"mass_g": 9007199254740992.000000001}')`);
	// Nested metadata in Auth, and a sign-in identity.
	await db.admin.unsafe(`update auth.users set raw_user_meta_data = raw_user_meta_data || '{"tags": [1, [2, 3]], "nested": {"a": {"b": null}}}'
		where id = '${userId}'`);
	await db.admin`insert into auth.identities (provider_id, user_id, identity_data, provider)
		values (${userId}, ${userId}, ${db.admin.json({ sub: userId, email: `${userId}@test.local` })}, 'email')`;
	return { userId, familyId, listId };
}
```

- [ ] **Step 2: scrivi i test che falliscono**

`server/test/backup.test.ts`:

```ts
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EXPORT_FORMAT } from '../src/backup/format.ts';
import { estimateExportBytes, exportParts, readSnapshot } from '../src/backup/read.ts';
import { withDbOn } from '../src/db.ts';
import { type BackupFixtures, seedBackupFixtures } from './support/backup.ts';
import { hasDatabase, setupDatabase, type TestDatabase } from './support/db.ts';

describe.skipIf(!hasDatabase)('nightly export', () => {
	let db: TestDatabase;
	let sql: postgres.Sql;
	let fx: BackupFixtures;
	beforeAll(async () => {
		db = await setupDatabase();
		sql = postgres(db.appServerUrl, { max: 2, fetch_types: false });
		fx = await seedBackupFixtures(db);
	});
	afterAll(async () => {
		await sql?.end();
		await db?.close();
	});

	it('reads every app table, the users and the migrations, bypassing RLS', async () => {
		const snapshot = await withDbOn(sql, { kind: 'backup' }, readSnapshot);
		const [{ tables }] = await db.admin<{ tables: number }[]>`
			select count(*)::int as tables from pg_class where relnamespace = 'app'::regnamespace and relkind = 'r'`;
		expect(snapshot.tables).toHaveLength(tables);
		for (const table of snapshot.tables) {
			const [{ count }] = await db.admin.unsafe<{ count: number }[]>(`select count(*)::int as count from app.${table.ident}`);
			expect(table.count, table.name).toBe(count);
		}
		expect(snapshot.tables.find((t) => t.name === 'families')!.rows).toContain(fx.familyId);
		expect(snapshot.tables.find((t) => t.name === 'shopping_list_checks')!.rows).toContain('9007199254740993');
		expect(snapshot.tables.find((t) => t.name === 'ingredient_unit_equivalences')!.rows).toContain('"from_dimension"');
		expect(snapshot.identities).toBeGreaterThan(0);
		expect(JSON.parse(snapshot.migrations)).toContain('20261012100000');
	});

	it('reads one snapshot even when another connection commits between two reads', async () => {
		let concurrentId = '';
		const snapshot = await withDbOn(sql, { kind: 'backup' }, async (tx) => {
			await tx`select count(*) from app.families`; // the snapshot starts here
			[{ id: concurrentId }] = await db.admin<{ id: string }[]>`insert into app.families (name) values ('Concurrent') returning id`;
			return readSnapshot(tx);
		});
		expect(concurrentId).not.toBe('');
		expect(snapshot.tables.find((t) => t.name === 'families')!.rows).not.toContain(concurrentId);
	});

	it('cannot write in the backup identity', async () => {
		await expect(withDbOn(sql, { kind: 'backup' }, (tx) => tx`update app.families set name = name`)).rejects.toMatchObject({ code: '25006' });
	});

	it('estimates the size from the database, close to the real document', async () => {
		const { estimate, snapshot } = await withDbOn(sql, { kind: 'backup' }, async (tx) => ({
			estimate: await estimateExportBytes(tx),
			snapshot: await readSnapshot(tx),
		}));
		const real = new TextEncoder().encode(exportParts(snapshot, '2026-10-12T02:30:00.000Z', 'test').join('')).length;
		expect(estimate).toBeGreaterThan(real * 0.9);
		expect(estimate).toBeLessThan(real * 1.1);
	});

	it('composes a valid document from parts, without parsing rows', async () => {
		const snapshot = await withDbOn(sql, { kind: 'backup' }, readSnapshot);
		const doc = JSON.parse(exportParts(snapshot, '2026-10-12T02:30:00.000Z', 'test').join(''));
		expect(doc.format).toBe(EXPORT_FORMAT);
		expect(Object.keys(doc.tables)).toEqual(snapshot.tables.map((t) => `app.${t.name}`));
		expect(doc.auth.users.length).toBe(snapshot.users);
	});
});
```

- [ ] **Step 3: verifica che falliscano**

Run: `npm test -w server -- test/backup.test.ts`
Expected: FAIL (`Cannot find module '../src/backup/read.ts'`).

- [ ] **Step 4: aggiungi l'identità in `db.ts`**

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

- [ ] **Step 5: implementa `read.ts`**

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
```

La stima conta ogni riga come `row_to_json` più un separatore; `json_agg` aggiunge `, ` e a capo fra le righe, per questo il test ammette il 10%. Se il test della stima resta fuori dalla fascia, correggi la formula (non la fascia) sommando 2 byte per riga.

- [ ] **Step 6: verifica**

Run: `npm test -w server -- test/backup.test.ts test/db.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: commit**

```bash
git add server/src/db.ts server/src/backup/read.ts server/test/support/backup.ts server/test/backup.test.ts
git commit -m "Esportazione: identità backup, stima e fotografia del database in repeatable read"
```

---

### Task 4: esportazione notturna in R2, limite e conservazione delle ultime 7

**Files:**
- Create: `server/test/support/r2.ts`
- Create: `server/src/backup/export.ts`
- Modify: `server/src/env.ts`
- Modify: `server/test/backup.test.ts`

**Interfaces:**
- Consumes: `encodeExport`, `importKey`, `BackupKey`, `EXPORT_FORMAT` (Task 2); `estimateExportBytes`, `readSnapshot`, `exportParts` (Task 3); `withDbOn`; `logEvent`; `errorCode` di `server/src/menu/generation.ts`.
- Produces:
  - `KEEP_EXPORTS = 7`, `EXPORT_LIMIT_BYTES = 16 * 1024 * 1024`, `EXPORT_PREFIX = 'exports/'`
  - `exportKey(scheduled: Date): string`
  - `interface ExportDeps { sql: postgres.Sql; bucket: R2Bucket; key: BackupKey; keyId: string; workerVersion: string; limitBytes: number }`
  - `type ExportOutcome = 'done' | 'skipped' | 'too_large' | 'failed'`
  - `runNightlyExportOn(deps: ExportDeps, scheduled: Date): Promise<ExportOutcome>`
  - `runNightlyExport(env: Env, scheduled: Date): Promise<ExportOutcome>`
  - `Env` con `BACKUPS?: R2Bucket; BACKUP_ENCRYPTION_KEY?: string; BACKUP_KEY_ID?: string`
  - test: `class MemoryBucket` con `objects: Map<string, { body: Uint8Array; customMetadata: Record<string, string> }>`, `failPut`, `failDelete`, `pageSize`, `asBucket()`

- [ ] **Step 1: bucket finto**

`server/test/support/r2.ts`:

```ts
/** The R2 calls of the export, in memory. Pages of two objects exercise the list cursor. */
export class MemoryBucket {
	objects = new Map<string, { body: Uint8Array; customMetadata: Record<string, string> }>();
	failPut = false;
	failDelete = false;
	pageSize = 2;

	async put(key: string, value: Blob, options?: { customMetadata?: Record<string, string> }) {
		if (this.failPut) throw new Error('put failed');
		this.objects.set(key, { body: new Uint8Array(await value.arrayBuffer()), customMetadata: options?.customMetadata ?? {} });
		return { key };
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

In testa a `server/test/backup.test.ts`, per verificare che oltre il limite le righe non si leggano:

```ts
import { vi } from 'vitest';

const readCalls = vi.hoisted(() => ({ count: 0 }));
vi.mock('../src/backup/read.ts', async (original) => {
	const actual = await original<typeof import('../src/backup/read.ts')>();
	return { ...actual, readSnapshot: (tx: Parameters<typeof actual.readSnapshot>[0]) => (readCalls.count++, actual.readSnapshot(tx)) };
});
```

e gli import:

```ts
import { exportKey, runNightlyExport, runNightlyExportOn, type ExportDeps } from '../src/backup/export.ts';
import { decodeExport, importKey, type BackupKey } from '../src/backup/format.ts';
import type { Env } from '../src/env.ts';
import { MemoryBucket } from './support/r2.ts';
```

Dentro il `describe` con database:

```ts
	const keyB64 = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
	let key: BackupKey;
	beforeAll(async () => {
		key = await importKey(keyB64);
	});
	const deps = (bucket: MemoryBucket, limitBytes = 64 * 1024 * 1024): ExportDeps =>
		({ sql, bucket: bucket.asBucket(), key, keyId: 'k1', workerVersion: 'test', limitBytes });
	const night = (day: number, hour = 2) => new Date(Date.UTC(2026, 9, day, hour, 30));
	const quiet = () => ({ info: vi.spyOn(console, 'log').mockImplementation(() => {}), error: vi.spyOn(console, 'error').mockImplementation(() => {}) });
	const events = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map(([line]) => JSON.parse(String(line)));
	afterEach(() => vi.restoreAllMocks());

	it('names exports by the scheduled UTC minute', () => {
		expect(exportKey(night(12))).toBe('exports/2026-10-12T02-30Z.json.gz.enc');
	});

	it('writes an encrypted export with metadata, readable with the key', async () => {
		const bucket = new MemoryBucket();
		const { info } = quiet();
		expect(await runNightlyExportOn(deps(bucket), night(12))).toBe('done');
		const stored = bucket.objects.get('exports/2026-10-12T02-30Z.json.gz.enc')!;
		expect(stored.customMetadata).toMatchObject({ format: 'cosasimangia-export/1', keyId: 'k1' });
		const doc = JSON.parse(await decodeExport(stored.body, { k1: key }));
		expect(Object.keys(doc.tables)).toContain('app.families');
		expect(events(info).find((e) => e.event === 'backup_export_done')).toMatchObject({ key: 'exports/2026-10-12T02-30Z.json.gz.enc' });
	});

	it('does not read rows nor write when the estimate exceeds the limit', async () => {
		const bucket = new MemoryBucket();
		const { error } = quiet();
		readCalls.count = 0;
		expect(await runNightlyExportOn(deps(bucket, 1000), night(12))).toBe('too_large');
		expect(readCalls.count).toBe(0);
		expect(bucket.objects.size).toBe(0);
		expect(events(error)).toContainEqual(expect.objectContaining({ event: 'backup_export_too_large', limitBytes: 1000 }));
	});

	it('warns above half of the limit and still exports', async () => {
		const bucket = new MemoryBucket();
		const { error } = quiet();
		const estimate = await withDbOn(sql, { kind: 'backup' }, estimateExportBytes);
		expect(await runNightlyExportOn(deps(bucket, Math.ceil(estimate * 1.5)), night(12))).toBe('done');
		expect(events(error)).toContainEqual(expect.objectContaining({ event: 'backup_export_near_limit' }));
	});

	it('skips the 04:30 run when the night already has an export', async () => {
		const bucket = new MemoryBucket();
		quiet();
		await runNightlyExportOn(deps(bucket), night(12));
		expect(await runNightlyExportOn(deps(bucket), night(12, 4))).toBe('skipped');
		expect([...bucket.objects.keys()]).toEqual(['exports/2026-10-12T02-30Z.json.gz.enc']);
	});

	it('keeps the 7 most recent exports, across list pages', async () => {
		const bucket = new MemoryBucket();
		quiet();
		for (let day = 1; day <= 9; day++) await runNightlyExportOn(deps(bucket), night(day));
		expect([...bucket.objects.keys()].sort()).toEqual([3, 4, 5, 6, 7, 8, 9].map((d) => `exports/2026-10-0${d}T02-30Z.json.gz.enc`));
	});

	it('deletes nothing when the write fails', async () => {
		const bucket = new MemoryBucket();
		const { error } = quiet();
		for (let day = 1; day <= 7; day++) await runNightlyExportOn(deps(bucket), night(day));
		bucket.failPut = true;
		expect(await runNightlyExportOn(deps(bucket), night(8))).toBe('failed');
		expect(bucket.objects.size).toBe(7);
		expect(events(error)).toContainEqual(expect.objectContaining({ event: 'backup_export_failed', phase: 'put' }));
	});

	it('keeps a written export when pruning fails', async () => {
		const bucket = new MemoryBucket();
		const { error } = quiet();
		for (let day = 1; day <= 7; day++) await runNightlyExportOn(deps(bucket), night(day));
		bucket.failDelete = true;
		expect(await runNightlyExportOn(deps(bucket), night(8))).toBe('done');
		expect(bucket.objects.has('exports/2026-10-08T02-30Z.json.gz.enc')).toBe(true);
		expect(events(error)).toContainEqual(expect.objectContaining({ event: 'backup_export_failed', phase: 'prune' }));
	});

	it('logs and returns when the bucket or the key are missing', async () => {
		const { error } = quiet();
		const env = { HYPERDRIVE: { connectionString: db.appServerUrl }, BACKUP_ENCRYPTION_KEY: keyB64 } as unknown as Env;
		expect(await runNightlyExport(env, night(12))).toBe('failed');
		expect(await runNightlyExport({ ...env, BACKUPS: new MemoryBucket().asBucket(), BACKUP_ENCRYPTION_KEY: 'c2hvcnQ=' }, night(12))).toBe('failed');
		expect(events(error).filter((e) => e.event === 'backup_export_not_configured')).toHaveLength(2);
	});

	it('runs end to end from the Worker env', async () => {
		const bucket = new MemoryBucket();
		quiet();
		const env = { HYPERDRIVE: { connectionString: db.appServerUrl }, BACKUPS: bucket.asBucket(), BACKUP_ENCRYPTION_KEY: keyB64, BACKUP_KEY_ID: 'k1' } as unknown as Env;
		expect(await runNightlyExport(env, night(12))).toBe('done');
		expect(bucket.objects.size).toBe(1);
	});
```

(aggiungi `afterEach` all'import da `vitest`).

- [ ] **Step 3: verifica che falliscano**

Run: `npm test -w server -- test/backup.test.ts`
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
import { estimateExportBytes, exportParts, readSnapshot } from './read.ts';

export const KEEP_EXPORTS = 7;
/** Largest document whose measured peak stays under 64 MB in workerd (spec, «Dimensioni, memoria e tempi»). */
export const EXPORT_LIMIT_BYTES = 16 * 1024 * 1024;
export const EXPORT_PREFIX = 'exports/';

export interface ExportDeps {
	sql: postgres.Sql;
	bucket: R2Bucket;
	key: BackupKey;
	keyId: string;
	workerVersion: string;
	limitBytes: number;
}

export type ExportOutcome = 'done' | 'skipped' | 'too_large' | 'failed';

class ExportTooLargeError extends Error {
	readonly estimatedBytes: number;
	constructor(estimatedBytes: number) {
		super('export too large');
		this.name = 'ExportTooLargeError';
		this.estimatedBytes = estimatedBytes;
	}
}

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

/** One night: skip if done, check the size, snapshot, encrypt, write, keep the newest 7. Never throws. */
export async function runNightlyExportOn(deps: ExportDeps, scheduled: Date): Promise<ExportOutcome> {
	const started = Date.now();
	const key = exportKey(scheduled);
	let phase = 'list';
	let summary: Record<string, number> = {};
	try {
		const existing = await deps.bucket.list({ prefix: key.slice(0, EXPORT_PREFIX.length + 11), limit: 1 }); // exports/2026-10-12T
		if (existing.objects.length > 0) {
			logEvent('backup_export_skipped', { key: existing.objects[0].key });
			return 'skipped';
		}
		phase = 'read';
		const { estimatedBytes, snapshot } = await withDbOn(deps.sql, { kind: 'backup' }, async (tx) => {
			// Before any row reaches the Worker: memory is the limit (spec, section 3).
			const estimate = await estimateExportBytes(tx);
			if (estimate > deps.limitBytes) throw new ExportTooLargeError(estimate);
			return { estimatedBytes: estimate, snapshot: await readSnapshot(tx) };
		});
		if (estimatedBytes > deps.limitBytes / 2) logEvent('backup_export_near_limit', { key, estimatedBytes, limitBytes: deps.limitBytes }, 'error');
		phase = 'encode';
		const rows = snapshot.tables.reduce((sum, t) => sum + t.count, 0);
		const { blob, uncompressedBytes, storedBytes } = await encodeExport(exportParts(snapshot, new Date().toISOString(), deps.workerVersion), deps.key, deps.keyId);
		summary = { estimatedBytes, uncompressedBytes, storedBytes, tables: snapshot.tables.length, rows, users: snapshot.users };
		phase = 'put';
		await deps.bucket.put(key, blob, {
			customMetadata: {
				format: EXPORT_FORMAT,
				keyId: deps.keyId,
				createdAt: new Date().toISOString(),
				...Object.fromEntries(Object.entries(summary).map(([k, v]) => [k, String(v)])),
			},
		});
	} catch (error) {
		if (error instanceof ExportTooLargeError) {
			logEvent('backup_export_too_large', { key, estimatedBytes: error.estimatedBytes, limitBytes: deps.limitBytes }, 'error');
			return 'too_large';
		}
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
			{ sql, bucket: env.BACKUPS, key, keyId: env.BACKUP_KEY_ID || 'k1', workerVersion: env.CF_VERSION_METADATA?.id ?? 'dev', limitBytes: EXPORT_LIMIT_BYTES },
			scheduled,
		);
	} finally {
		await sql.end().catch(() => {});
	}
}
```

- [ ] **Step 6: verifica**

Run: `npm test -w server -- test/backup.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: commit**

```bash
git add server/src/env.ts server/src/backup/export.ts server/test/support/r2.ts server/test/backup.test.ts
git commit -m "Esportazione: scrittura notturna cifrata in R2 con limite di dimensione e ultime 7 copie"
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

	it('matches the crons and the bucket of wrangler.jsonc', async () => {
		const text = await readFile(join(import.meta.dirname, '..', 'wrangler.jsonc'), 'utf8');
		const config = JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
		expect(config.triggers.crons).toEqual([HOURLY_CRON, NIGHTLY_EXPORT_CRON]);
		expect(config.r2_buckets).toEqual([{ binding: 'BACKUPS', bucket_name: 'cosasimangia-backups', jurisdiction: 'eu' }]);
		expect(config.vars.BACKUP_KEY_ID).toBe('k1');
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

Run: `npm test -w server -- test/scheduled.test.ts`
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

- [ ] **Step 4: aggiorna `wrangler.jsonc`, `.env.example` e `README.md`**

```jsonc
	// Hourly weekly job (spec section 4) and nightly export to R2 at 02:30 UTC, retried at 04:30 (section 8).
	"triggers": { "crons": ["0 * * * *", "30 2,4 * * *"] },
```

in `vars`, con il commento sulla riga precedente:

```jsonc
		// Id of BACKUP_ENCRYPTION_KEY (a Worker secret), written in each export header.
		"BACKUP_KEY_ID": "k1"
```

dopo `hyperdrive`:

```jsonc
	// Nightly exports: private bucket in the EU jurisdiction, created by the owner before deploying.
	"r2_buckets": [{ "binding": "BACKUPS", "bucket_name": "cosasimangia-backups", "jurisdiction": "eu" }]
```

In `server/.env.example`:

```bash
# Nightly export key for local runs: `openssl rand -base64 32`. Production uses a Worker secret.
BACKUP_ENCRYPTION_KEY=
```

In `server/README.md`, dopo il paragrafo del job settimanale in locale:

````markdown
Esportazione notturna in locale (R2 simulato da Miniflare, chiave in `.env`): da
`server/`, `npx wrangler dev --test-scheduled`, poi
`curl "http://localhost:8787/cdn-cgi/local/scheduled?cron=30+2,4+*+*+*"`. Il log
`backup_export_done` riporta la chiave completa dell'oggetto, che comincia già con
`exports/`; per scaricarla, sempre da `server/`:

```bash
KEY='exports/2026-10-12T02-30Z.json.gz.enc'   # la chiave dal log
npx wrangler r2 object get "cosasimangia-backups/$KEY" --local --jurisdiction eu --file ../export.bin
```

Il file finisce nella radice del repository, da cui si usa la CLI di ripristino
(`supabase/README.md`).
````

- [ ] **Step 5: verifica**

Run: `npm test -w server && npm run typecheck`
Expected: PASS di tutta la suite del server (anche `asset-routing.test.ts`, che legge lo stesso `wrangler.jsonc`).

- [ ] **Step 6: commit**

```bash
git add server/src/scheduled.ts server/src/index.ts server/wrangler.jsonc server/.env.example server/README.md server/test/scheduled.test.ts
git commit -m "Esportazione: cron notturno smistato accanto al job orario e binding R2"
```

---

### Task 6: ripristino con controlli, marcatori e confronto esatto

**Files:**
- Create: `server/src/backup/restore.ts`
- Modify: `server/test/backup.test.ts` (nuovo blocco)

**Interfaces:**
- Consumes: `appTables` (Task 3); `EXPORT_FORMAT` (Task 2); helper di test dei Task 3-4.
- Produces:
  - `XID_MARKERS: Readonly<Record<string, readonly string[]>>`, `MIGRATION_ROWS: Readonly<Record<string, string>>`
  - `class RestoreError extends Error { reason: 'format' | 'unknown_migrations' | 'migrations' | 'tables' | 'not_empty' | 'columns' | 'load_failed' | 'orphans' | 'mismatch'; details: string[] }` (dettagli solo strutturali)
  - `interface RestoreOptions { acceptUnknownMigrations?: boolean }`
  - `interface RestoreResult { tables: number; rows: number; users: number; identities: number }`
  - `restoreExport(tx: postgres.TransactionSql, document: string, options?: RestoreOptions): Promise<RestoreResult>` (nella transazione del chiamante, senza commit né rollback)
  - `verifyRestored(tx: postgres.TransactionSql): Promise<string[]>` (differenze fra il database e `pg_temp.restore_document`; vuoto se identici)

- [ ] **Step 1: scrivi i test che falliscono**

In `server/test/backup.test.ts` aggiungi `import { RestoreError, restoreExport, verifyRestored } from '../src/backup/restore.ts';` e nel blocco con database:

```ts
	class Rollback extends Error {}

	/** Decrypted document of a fresh export of the test database. */
	const freshExport = async () => {
		const bucket = new MemoryBucket();
		quiet();
		await runNightlyExportOn(deps(bucket), night(20));
		vi.restoreAllMocks();
		const [stored] = bucket.objects.values();
		return decodeExport(stored.body, { k1: key });
	};

	/**
	 * Emulates a destination just prepared with the migrations, inside a rolled-back
	 * transaction of the shared test database. The real preparation (`supabase db reset
	 * --no-seed`) runs in the drill of Task 8.
	 */
	const emulateFreshDestination = async (tx: postgres.TransactionSql) => {
		const tables = await tx<{ ident: string }[]>`
			select quote_ident(relname) as ident from pg_class where relnamespace = 'app'::regnamespace and relkind = 'r'`;
		await tx.unsafe(`truncate ${[...tables.map((t) => `app.${t.ident}`), 'auth.identities', 'auth.users'].join(', ')} cascade`);
		await tx`insert into app.catalogue_state default values`;
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

	it('restores into a fresh destination, from a session in another time zone, with markers reset', async () => {
		const document = await freshExport();
		await inRolledBack(async (tx) => {
			await emulateFreshDestination(tx);
			await tx`set local time zone 'Europe/Rome'`;
			const result = await restoreExport(tx, document);
			expect(result.users).toBeGreaterThan(0);
			expect(await verifyRestored(tx)).toEqual([]);
			const [markers] = await tx<{ n: number }[]>`
				select (select count(*) from app.families where data_version_xid is not null)
					+ (select count(*) from app.catalogue_state where version_xid is not null) as n`;
			expect(Number(markers.n)).toBe(0);
		});
	});

	it('keeps bumping counters when an imported marker equals the restoring transaction', async () => {
		const document = await freshExport();
		await inRolledBack(async (tx) => {
			await emulateFreshDestination(tx);
			const [{ xid }] = await tx<{ xid: string }[]>`select pg_current_xact_id()::text as xid`;
			const coinciding = document.replace(
				new RegExp(`("id":"${fx.familyId}".*?"data_version_xid":)(null|"\\d+")`),
				`$1"${xid}"`,
			);
			expect(coinciding).not.toBe(document);
			await restoreExport(tx, coinciding);
			const [before] = await tx<{ v: string }[]>`select data_version::text as v from app.families where id = ${fx.familyId}`;
			await tx`update app.families set name = 'Renamed after restore' where id = ${fx.familyId}`;
			const [after] = await tx<{ v: string }[]>`select data_version::text as v from app.families where id = ${fx.familyId}`;
			expect(BigInt(after.v)).toBe(BigInt(before.v) + 1n);
		});
	});

	it('detects any change after the load, beyond JavaScript precision and inside nested Auth metadata', async () => {
		const document = await freshExport();
		const mutations: [string, string][] = [
			[`update app.shopping_list_checks set quantity_at_check = '{"mass_g": 9007199254740994}' where shopping_list_id = '${fx.listId}' and variety_key = 'a'`, 'app.shopping_list_checks'],
			[`update app.families set data_version = data_version + 1 where id = '${fx.familyId}'`, 'app.families'],
			[`update auth.users set raw_user_meta_data = jsonb_set(raw_user_meta_data, '{tags,1}', '[2, 3, 4]') where id = '${fx.userId}'`, 'auth.users'],
		];
		for (const [mutation, table] of mutations) {
			await inRolledBack(async (tx) => {
				await emulateFreshDestination(tx);
				await restoreExport(tx, document);
				// Without triggers: a counter bump in families would add a second difference.
				await tx`set local session_replication_role = replica`;
				await tx.unsafe(mutation);
				await tx`set local session_replication_role = origin`;
				expect(await verifyRestored(tx)).toEqual([table]);
			});
		}
	});

	it('refuses a destination with data, even only a changed catalogue counter', async () => {
		const document = await freshExport();
		await inRolledBack(async (tx) => {
			expect(await restoreReason(tx, document)).toBe('not_empty');
		});
		await inRolledBack(async (tx) => {
			await emulateFreshDestination(tx);
			await tx`update app.catalogue_state set version = 7`;
			expect(await restoreReason(tx, document)).toBe('not_empty');
		});
	});

	it('refuses other migrations, other tables, unknown columns, another format and dangling references', async () => {
		const document = await freshExport();
		const doc = JSON.parse(document);
		const orphan = JSON.stringify({ ...doc.tables['app.ratings'][0], recipe_id: '00000000-0000-0000-0000-000000000000' });
		const cases: [string, string][] = [
			[document.replace('"migrations":[', '"migrations":["19990101000000",'), 'migrations'],
			[document.replace('"app.books":', '"app.bookz":'), 'tables'],
			[document.replace('"app.books":[{', '"app.books":[{"ghost":1,'), 'columns'],
			[document.replace('cosasimangia-export/1', 'cosasimangia-export/9'), 'format'],
			[document.replace('"app.ratings":[', `"app.ratings":[${orphan},`), 'orphans'],
		];
		for (const [variant, reason] of cases) {
			expect(variant, reason).not.toBe(document);
			await inRolledBack(async (tx) => {
				await emulateFreshDestination(tx);
				expect(await restoreReason(tx, variant)).toBe(reason);
			});
		}
	});

	it('reports a failing load with table and SQLSTATE only', async () => {
		const document = await freshExport();
		const at = document.indexOf('"app.families":');
		const broken = document.slice(0, at) + document.slice(at).replace('"measurement_system":"metric"', '"measurement_system":"SENTINEL-4f1c"');
		await inRolledBack(async (tx) => {
			await emulateFreshDestination(tx);
			const error = await restoreExport(tx, broken).then(() => null, (e: unknown) => e);
			expect(error).toMatchObject({ reason: 'load_failed', details: ['app.families', '23514'] });
			expect(String((error as Error).message)).not.toContain('SENTINEL');
		});
	});
```

- [ ] **Step 2: verifica che falliscano**

Run: `npm test -w server -- test/backup.test.ts`
Expected: FAIL (`Cannot find module '../src/backup/restore.ts'`).

- [ ] **Step 3: implementa `restore.ts`**

```ts
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
	await tx`insert into pg_temp.restore_document (doc) values (${document}::json)`;

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
			`with exported as (
				select coalesce(jsonb_agg(e::jsonb), '[]') as rows,
					coalesce((select array_agg(distinct k) from json_array_elements(${t.path}) x, json_object_keys(x) k), '{}') as keys
				from pg_temp.restore_document, json_array_elements(${t.path}) e
			)
			select (select coalesce(jsonb_agg((select jsonb_object_agg(k, to_jsonb(r)->k) from unnest(exported.keys) k) order by r.id), '[]')
					from ${t.rel} r)
				= (select coalesce(jsonb_agg(x order by x->>'id'), '[]') from jsonb_array_elements(exported.rows) x) as same
			from exported`,
		);
		if (!same) different.push(t.name);
	}
	return different;
}
```

Note per l'implementazione:
- L'ordinamento di Auth nel confronto (`order by r.id` contro `x->>'id'`) deve coincidere: `uuid` e testo ordinano allo stesso modo per gli UUID in minuscolo; se il test segnala differenze d'ordine, ordina entrambi per `(… ->> 'id')`.
- Se `truncate ... cascade` del test fallisce per un permesso su una tabella di `auth` collegata (`42501`), sostituisci il troncamento in `emulateFreshDestination` con `set local session_replication_role = replica`, `delete from` di ogni tabella di `app`, di `auth.identities`, `auth.sessions` e `auth.users`, poi `set local session_replication_role = origin`.

- [ ] **Step 4: verifica**

Run: `npm test -w server -- test/backup.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: suite completa**

Run: `npm test -w server`
Expected: PASS (le transazioni del ripristino si annullano).

- [ ] **Step 6: commit**

```bash
git add server/src/backup/restore.ts server/test/backup.test.ts
git commit -m "Esportazione: ripristino in modalità replica, marcatori azzerati e confronto esatto"
```

---

### Task 7: commit delle migrazioni e CLI

**Files:**
- Create: `scripts/backup/migrations-commit.ts`
- Test: `scripts/backup/migrations-commit.test.ts`
- Create: `scripts/backup/restore.ts`

**Interfaces:**
- Consumes: `decodeExport`, `parseKeyList`, `ExportFormatError` (Task 2); `restoreExport`, `RestoreError` (Task 6).
- Produces:
  - `migrationVersions(repo: string, commit: string): string[]`
  - `findMigrationsCommit(repo: string, ref: string, versions: readonly string[]): string | null`
  - comandi `node scripts/backup/restore.ts inspect <file> [--ref <ref>]` e `node scripts/backup/restore.ts restore <file> [--dry-run] [--accept-unknown-migrations]`; uscita 0 riuscito, 1 rifiutato o fallito, 2 argomenti mancanti.

- [ ] **Step 1: scrivi il test che fallisce**

`scripts/backup/migrations-commit.test.ts`:

```ts
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findMigrationsCommit, migrationVersions } from './migrations-commit.ts';

describe('commit of the migrations of an export', () => {
	let repo: string;
	const commits: string[] = [];
	const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();

	beforeAll(async () => {
		repo = await mkdtemp(join(tmpdir(), 'migrations-'));
		git('init', '-q', '-b', 'main');
		git('config', 'user.email', 'test@example.com');
		git('config', 'user.name', 'Test');
		await mkdir(join(repo, 'supabase', 'migrations'), { recursive: true });
		await writeFile(join(repo, 'supabase', 'migrations', '20260101000000_first.sql'), 'select 1;');
		git('add', '.');
		git('commit', '-q', '-m', 'first');
		commits.push(git('rev-parse', 'HEAD'));
		await writeFile(join(repo, 'README.md'), 'not a migration');
		git('add', '.');
		git('commit', '-q', '-m', 'docs');
		await writeFile(join(repo, 'supabase', 'migrations', '20260201000000_second.sql'), 'select 2;');
		git('add', '.');
		git('commit', '-q', '-m', 'second');
		commits.push(git('rev-parse', 'HEAD'));
	});
	afterAll(() => rm(repo, { recursive: true }));

	it('lists the versions of a commit', () => {
		expect(migrationVersions(repo, commits[1])).toEqual(['20260101000000', '20260201000000']);
	});

	it('finds the commit of an archive older than the last migration', () => {
		expect(findMigrationsCommit(repo, 'main', ['20260101000000'])).toBe(commits[0]);
		expect(findMigrationsCommit(repo, 'main', ['20260201000000', '20260101000000'])).toBe(commits[1]);
		expect(findMigrationsCommit(repo, 'main', ['20990101000000'])).toBeNull();
	});
});
```

- [ ] **Step 2: verifica che fallisca**

Run: `npx vitest run scripts/backup/migrations-commit.test.ts`
Expected: FAIL (`Cannot find module './migrations-commit.ts'`).

- [ ] **Step 3: implementa `migrations-commit.ts`**

```ts
import { execFileSync } from 'node:child_process';

const git = (repo: string, args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' });

/** Versions (numeric prefixes) of supabase/migrations at a commit, sorted. */
export function migrationVersions(repo: string, commit: string): string[] {
	return git(repo, ['ls-tree', '--name-only', commit, 'supabase/migrations/'])
		.split('\n')
		.map((path) => /\/(\d+)_[^/]*\.sql$/.exec(path)?.[1])
		.filter((v): v is string => Boolean(v))
		.sort();
}

/**
 * Newest commit of `ref` whose supabase/migrations holds exactly `versions`: the schema to
 * prepare before restoring an export (spec, decision 9). Null when none matches.
 */
export function findMigrationsCommit(repo: string, ref: string, versions: readonly string[]): string | null {
	const want = [...versions].sort().join(',');
	const commits = git(repo, ['rev-list', ref, '--', 'supabase/migrations']).split('\n').filter(Boolean);
	return commits.find((commit) => migrationVersions(repo, commit).join(',') === want) ?? null;
}
```

- [ ] **Step 4: verifica**

Run: `npx vitest run scripts/backup/migrations-commit.test.ts`
Expected: PASS.

- [ ] **Step 5: implementa la CLI**

`scripts/backup/restore.ts`:

```ts
/**
 * Nightly export tools (procedure in supabase/README.md, spec 2026-10-11-esportazione-r2).
 *
 *   node scripts/backup/restore.ts inspect <file> [--ref <ref>]
 *   node scripts/backup/restore.ts restore <file> [--dry-run] [--accept-unknown-migrations]
 *
 * Key from BACKUP_ENCRYPTION_KEY; destination from DATABASE_URL, password from PGPASSWORD.
 * Output never carries data: only outcome, reason, structural names and codes.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import postgres from 'postgres';
import { decodeExport, ExportFormatError, parseKeyList } from '../../server/src/backup/format.ts';
import { RestoreError, type RestoreResult, restoreExport } from '../../server/src/backup/restore.ts';
import { findMigrationsCommit } from './migrations-commit.ts';

class DryRun extends Error {}

/** A missing environment variable: its name is the whole message. */
class MissingVariable extends Error {
	constructor(name: string) {
		super(name);
		this.name = 'MissingVariable';
	}
}

const USAGE = 'usage: node scripts/backup/restore.ts inspect <file> [--ref <ref>] | restore <file> [--dry-run] [--accept-unknown-migrations]';

/** Outcome without data: error objects, messages and details of Postgres may quote values. */
function describeError(error: unknown): string {
	if (error instanceof RestoreError) return `refused: ${error.reason}${error.details.length > 0 ? ` (${error.details.join(', ')})` : ''}`;
	if (error instanceof ExportFormatError) return `refused: ${error.reason}`;
	if (error instanceof MissingVariable) return `failed: missing ${error.message}`;
	const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
		&& /^([0-9A-Z]{5}|E[A-Z]+)$/.test(error.code) ? ` ${error.code}` : '';
	return `failed: ${error instanceof Error ? error.name : 'unknown'}${code}`;
}

async function readExport(file: string): Promise<string> {
	const keyList = process.env.BACKUP_ENCRYPTION_KEY;
	if (!keyList) throw new MissingVariable('BACKUP_ENCRYPTION_KEY');
	return decodeExport(new Uint8Array(await readFile(file)), await parseKeyList(keyList));
}

async function inspect(file: string, ref: string): Promise<void> {
	const doc = JSON.parse(await readExport(file)) as { createdAt: string; workerVersion: string; migrations: string[] | null };
	console.log(`created at: ${doc.createdAt}`);
	console.log(`worker version: ${doc.workerVersion}`);
	if (!doc.migrations) {
		console.log('migrations: unknown');
		return;
	}
	console.log(`migrations: ${doc.migrations.length}, last ${doc.migrations.at(-1)}`);
	const commit = findMigrationsCommit(join(import.meta.dirname, '..', '..'), ref, doc.migrations);
	console.log(commit ? `commit: ${commit}` : `commit: none on ${ref} has exactly these migrations`);
}

async function restore(file: string, dryRun: boolean, acceptUnknownMigrations: boolean): Promise<void> {
	const url = process.env.DATABASE_URL;
	if (!url) throw new MissingVariable('DATABASE_URL');
	const document = await readExport(file);
	const sql = postgres(url, { max: 1, onnotice: () => {} });
	try {
		let result: RestoreResult | undefined;
		try {
			await sql.begin(async (tx) => {
				result = await restoreExport(tx, document, { acceptUnknownMigrations });
				if (dryRun) throw new DryRun();
			});
		} catch (error) {
			if (!(error instanceof DryRun)) throw error;
		}
		if (acceptUnknownMigrations) console.log('warning: migrations not compared');
		console.log(`${dryRun ? 'dry run passed, nothing written' : 'restored'}: ${result!.tables} tables, ${result!.rows} rows, ${result!.users} users, ${result!.identities} identities`);
	} finally {
		await sql.end().catch(() => {});
	}
}

const [command, file, ...flags] = process.argv.slice(2);
const refAt = flags.indexOf('--ref');
if (!file || (command !== 'inspect' && command !== 'restore')) {
	console.error(USAGE);
	process.exit(2);
}
try {
	if (command === 'inspect') await inspect(file, refAt >= 0 ? flags[refAt + 1] : 'origin/main');
	else await restore(file, flags.includes('--dry-run'), flags.includes('--accept-unknown-migrations'));
} catch (error) {
	console.error(describeError(error));
	process.exitCode = 1;
}
```


- [ ] **Step 6: verifica**

Run: `npm run typecheck && npx vitest run scripts/backup/migrations-commit.test.ts && node scripts/backup/restore.ts; echo "exit $?"`
Expected: typecheck pulito (la radice compila la CLI e i moduli del server che importa); test PASS; l'ultima riga stampa l'uso ed `exit 2`. I percorsi riusciti e d'errore della CLI si provano nel Task 8.

- [ ] **Step 7: commit**

```bash
git add scripts/backup/migrations-commit.ts scripts/backup/migrations-commit.test.ts scripts/backup/restore.ts
git commit -m "Esportazione: CLI inspect e restore senza dati nell'output, ricerca del commit delle migrazioni"
```

---

### Task 8: prova di ripristino su una destinazione reale (CI)

**Files:**
- Create: `server/test/drill/restore-drill.test.ts`
- Create: `server/vitest.drill.config.ts`
- Modify: `server/vitest.config.ts` (esclusione di `test/drill/**`)
- Modify: `server/package.json` (script `test:drill`)
- Modify: `.github/workflows/ci.yml` (ultimo passo)

**Interfaces:**
- Consumes: `seedBackupFixtures` (Task 3); `MemoryBucket` (Task 4); `runNightlyExportOn` (Task 4); `readSnapshot` (Task 3); `encodeExport`, `decodeExport`, `importKey` (Task 2); `XID_MARKERS` (Task 6); `migrationVersions` (Task 7); la CLI (Task 7).
- Produces: `npm run test:drill -w server` (distruttivo: azzera il database locale indicato da `TEST_DATABASE_URL` con `supabase db reset --no-seed`; gira in CI o con `RESTORE_DRILL=1`).

- [ ] **Step 1: configurazione della prova**

`server/vitest.drill.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

// The restore drill resets the local database: its own config, run last (CI) or on purpose.
export default defineConfig({
	test: {
		include: ['test/drill/**/*.test.ts'],
		globalSetup: ['test/global-setup.ts'],
		fileParallelism: false,
		testTimeout: 600_000,
		hookTimeout: 600_000,
	},
});
```

In `server/vitest.config.ts` aggiungi `exclude: ['test/drill/**', 'node_modules/**']` dentro `test`. In `server/package.json` lo script `"test:drill": "vitest run -c vitest.drill.config.ts"`. In `.github/workflows/ci.yml`, dopo `- run: npm test`:

```yaml
      # Last: resets the database, then restores an export into it with the real CLI.
      - run: npm run test:drill -w server
```

- [ ] **Step 2: scrivi la prova (fallisce finché uno dei passi non è corretto)**

`server/test/drill/restore-drill.test.ts`:

```ts
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { runNightlyExportOn } from '../../src/backup/export.ts';
import { decodeExport, encodeExport, importKey } from '../../src/backup/format.ts';
import { readSnapshot, type Snapshot } from '../../src/backup/read.ts';
import { XID_MARKERS } from '../../src/backup/restore.ts';
import { migrationVersions } from '../../../scripts/backup/migrations-commit.ts';
import { type BackupFixtures, seedBackupFixtures } from '../support/backup.ts';
import { hasDatabase, setupDatabase } from '../support/db.ts';
import { MemoryBucket } from '../support/r2.ts';

const run = promisify(execFile);
const repoRoot = join(import.meta.dirname, '..', '..', '..');
const cli = join(repoRoot, 'scripts', 'backup', 'restore.ts');
// Destructive: only in CI or when asked explicitly.
const enabled = hasDatabase && Boolean(process.env.CI || process.env.RESTORE_DRILL);
const databaseUrl = process.env.TEST_DATABASE_URL!;

/** Marker values are reset by design: compare the rest as text. */
const withoutMarkers = (text: string) =>
	Object.values(XID_MARKERS).flat().reduce((t, m) => t.replace(new RegExp(`"${m}":(null|"\\d+")`, 'g'), `"${m}":null`), text);

describe.skipIf(!enabled)('restore drill on a destination prepared like the procedure', () => {
	const keyB64 = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
	let dir: string;
	let file: string;
	let document: string;
	let before: Snapshot;
	let fx: BackupFixtures;
	let admin: postgres.Sql;

	const cliRun = async (args: string[]) => {
		const env = { ...process.env, BACKUP_ENCRYPTION_KEY: keyB64, DATABASE_URL: databaseUrl };
		try {
			const { stdout, stderr } = await run(process.execPath, [cli, ...args], { env, cwd: repoRoot });
			return { code: 0, out: stdout + stderr };
		} catch (error) {
			const e = error as { code: number; stdout: string; stderr: string };
			return { code: e.code, out: e.stdout + e.stderr };
		}
	};
	const writeExport = async (name: string, text: string) => {
		const { blob } = await encodeExport([text], await importKey(keyB64), 'k1');
		const path = join(dir, name);
		await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
		return path;
	};
	/** Only the untouched rows of the migrations: nothing loaded, nothing left behind. */
	const expectFresh = async () => {
		const [state] = await admin<{ users: number; families: number; catalogue: number }[]>`
			select (select count(*)::int from auth.users) as users, (select count(*)::int from app.families) as families,
				(select count(*)::int from app.catalogue_state where id and version = 1 and version_xid is null) as catalogue`;
		expect(state).toEqual({ users: 0, families: 0, catalogue: 1 });
	};

	beforeAll(async () => {
		const db = await setupDatabase();
		fx = await seedBackupFixtures(db);
		const sql = postgres(db.appServerUrl, { max: 1, fetch_types: false });
		const bucket = new MemoryBucket();
		const quiet = vi.spyOn(console, 'log').mockImplementation(() => {});
		await runNightlyExportOn({ sql, bucket: bucket.asBucket(), key: await importKey(keyB64), keyId: 'k1', workerVersion: 'drill', limitBytes: 64 * 1024 * 1024 }, new Date());
		quiet.mockRestore();
		const [stored] = bucket.objects.values();
		document = await decodeExport(stored.body, { k1: await importKey(keyB64) });
		before = await db.admin.begin((tx) => readSnapshot(tx));
		await sql.end();
		await db.close();
		dir = await mkdtemp(join(tmpdir(), 'drill-'));
		file = await writeExport('export.bin', document);
		// The documented preparation: migrations applied, no seed.
		const workdir = process.env.SUPABASE_WORKDIR ?? repoRoot;
		await run('supabase', ['db', 'reset', '--no-seed', '--workdir', workdir], { cwd: repoRoot });
		admin = postgres(databaseUrl, { max: 1, onnotice: () => {} });
	});
	afterAll(async () => {
		await admin?.end();
		if (dir) await rm(dir, { recursive: true });
	});

	it('inspect finds a commit with exactly the exported migrations', async () => {
		const { code, out } = await cliRun(['inspect', file, '--ref', 'HEAD']);
		expect(code).toBe(0);
		const commit = /commit: ([0-9a-f]{40})/.exec(out)?.[1];
		expect(commit).toBeDefined();
		expect(migrationVersions(repoRoot, commit!)).toEqual(JSON.parse(before.migrations));
	});

	it('refuses a destination with one more migration (an older archive)', async () => {
		await admin`insert into supabase_migrations.schema_migrations (version) values ('20991231000000')`;
		try {
			const { code, out } = await cliRun(['restore', file]);
			expect(code).toBe(1);
			expect(out).toContain('refused: migrations (extra 20991231000000)');
		} finally {
			await admin`delete from supabase_migrations.schema_migrations where version = '20991231000000'`;
		}
		await expectFresh();
	});

	it('fails after partial inserts without printing any value, leaving the destination untouched', async () => {
		const at = document.indexOf('"app.families":');
		const broken = await writeExport('broken.bin',
			document.slice(0, at) + document.slice(at).replace('"measurement_system":"metric"', '"measurement_system":"SENTINEL-4f1c"'));
		const { code, out } = await cliRun(['restore', broken]);
		expect(code).toBe(1);
		expect(out).toContain('refused: load_failed (app.families, 23514)');
		expect(out).not.toContain('SENTINEL');
		expect(out).not.toContain('@test.local');
		await expectFresh();
	});

	it('passes a dry run without writing', async () => {
		const { code, out } = await cliRun(['restore', file, '--dry-run']);
		expect(code).toBe(0);
		expect(out).toContain('dry run passed, nothing written');
		await expectFresh();
	});

	it('restores, reads back identical apart from reset markers, and keeps counting', async () => {
		const { code, out } = await cliRun(['restore', file]);
		expect(code).toBe(0);
		expect(out).toContain('restored:');
		const after = await admin.begin((tx) => readSnapshot(tx));
		expect(after.migrations).toBe(before.migrations);
		expect(after.auth).toBe(before.auth);
		for (const table of before.tables) {
			const restored = after.tables.find((t) => t.name === table.name)!;
			expect(withoutMarkers(restored.rows), table.name).toBe(withoutMarkers(table.rows));
		}
		expect(after.tables.find((t) => t.name === 'shopping_list_checks')!.rows).toContain('9007199254740992.000000001');
		const [{ v: v0 }] = await admin<{ v: string }[]>`select data_version::text as v from app.families where id = ${fx.familyId}`;
		await admin`update app.families set name = 'Renamed after restore' where id = ${fx.familyId}`;
		const [{ v: v1 }] = await admin<{ v: string }[]>`select data_version::text as v from app.families where id = ${fx.familyId}`;
		expect(BigInt(v1)).toBe(BigInt(v0) + 1n);
	});
});
```

- [ ] **Step 3: esegui la prova sullo stack del worktree**

Run: `RESTORE_DRILL=1 SUPABASE_WORKDIR="$SB" npm run test:drill -w server`
Expected: PASS dei 5 casi. Se fallisce, correggi il codice dei Task 6-7, non la prova; se fallisce per righe inserite da una migrazione, aggiorna `MIGRATION_ROWS` e la spec. Poi riporta lo stack allo stato dei test: `supabase db reset --workdir "$SB"`.

- [ ] **Step 4: suite normale invariata**

Run: `npm test && npm run typecheck`
Expected: PASS; `test/drill/` non gira nella suite normale.

- [ ] **Step 5: commit**

```bash
git add server/test/drill/restore-drill.test.ts server/vitest.drill.config.ts server/vitest.config.ts server/package.json .github/workflows/ci.yml
git commit -m "Esportazione: prova di ripristino in CI su una destinazione preparata come da procedura"
```

---

### Task 9: misura del limite, procedura scritta e prova locale completa

**Files:**
- Modify: `supabase/README.md` (sezione «Esportazione notturna e ripristino»)
- Modify: `server/src/backup/export.ts` (`EXPORT_LIMIT_BYTES`, solo se la misura lo abbassa)
- Modify: `progetto/superpowers/specs/2026-10-11-esportazione-r2.md` (valore e misure nella sezione 3)

**Interfaces:**
- Consumes: tutto quanto sopra.
- Produces: limite confermato; procedura per l'utente; esiti della prova locale completa (criterio di fine della PR).

- [ ] **Step 1: scrivi la procedura in `supabase/README.md`**

````markdown
## Esportazione notturna e ripristino

Il Worker esporta ogni notte alle 02:30 UTC (secondo tentativo alle 04:30) i dati di
`app` e gli utenti di Auth (`auth.users`, `auth.identities`) nel bucket R2
`cosasimangia-backups` (giurisdizione UE), cifrati con la chiave del secret
`BACKUP_ENCRYPTION_KEY`, e conserva le ultime 7. Restano fuori sessioni, token e agenti
collegati. Spec: `progetto/superpowers/specs/2026-10-11-esportazione-r2.md`.

Tutti i comandi partono dalla radice del repository, salvo dove è indicato `cd server`.
Chiave e password si inseriscono con `read -rs` (non compaiono a schermo né nella
cronologia della shell):

```bash
read -rs BACKUP_ENCRYPTION_KEY && export BACKUP_ENCRYPTION_KEY   # la chiave dal gestore di password
```

### 1. Scarica l'esportazione

La chiave completa dell'oggetto (comincia già con `exports/`) si legge nel dashboard
(R2 → `cosasimangia-backups` → `exports/`) o nel log `backup_export_done`.

```bash
KEY='exports/2026-10-12T02-30Z.json.gz.enc'
(cd server && npx wrangler r2 object get "cosasimangia-backups/$KEY" --remote --jurisdiction eu --file ../export.bin)
```

### 2. Trova il commit delle migrazioni

```bash
git fetch origin
node scripts/backup/restore.ts inspect export.bin
```

Stampa data, versione del Worker, migrazioni e il commit di `origin/main` in cui
`supabase/migrations/` ha esattamente quelle migrazioni. Prepara la destinazione da
quel commit: `git worktree add ../ripristino <commit>`.

### 3. Prepara la destinazione

Un database con le migrazioni del commit e nessun dato:

- **ambiente di verifica locale:** dal worktree del commit, con uno stack Supabase che
  non contiene dati da conservare, `supabase db reset --no-seed`;
- **progetto di produzione perso:** un progetto Supabase nuovo; applica le migrazioni
  dal worktree del commit (`supabase link` e `supabase db push`, passi da concordare
  con il coordinatore), poi imposta la password di `app_server`.

Le uniche righe ammesse sono quelle che le migrazioni inseriscono (oggi la riga
iniziale di `app.catalogue_state`); qualsiasi altro dato fa rifiutare il ripristino.

### 4. Prova a vuoto, poi ripristino

```bash
export DATABASE_URL='postgresql://postgres@<host>:<porta>/postgres'   # senza password
read -rs PGPASSWORD && export PGPASSWORD
node scripts/backup/restore.ts restore export.bin --dry-run
node scripts/backup/restore.ts restore export.bin
```

La CLI rifiuta destinazioni non vuote, migrazioni diverse, chiavi sbagliate e file
alterati; carica tutto in una transazione e fa il commit solo se chiavi esterne e
contenuti coincidono con l'esportazione. Non stampa mai valori: in caso d'errore indica
motivo, tabella e codice.

### 5. Ricollega l'app (solo su un progetto nuovo)

In quest'ordine:

1. Auth del progetto nuovo: chiavi di firma asimmetriche, provider, SMTP di Resend,
   server OAuth 2.1, URL del sito e di redirect.
2. Hyperdrive verso il Session pooler nuovo, come utente `app_server`, con il limite
   di connessioni di prima: `(cd server && npx wrangler hyperdrive update <id> --origin-host <host> --origin-port 5432 --database postgres --origin-user app_server --origin-password "$APP_SERVER_PASSWORD")`
   dopo `read -rs APP_SERVER_PASSWORD && export APP_SERVER_PASSWORD`.
3. `SUPABASE_URL` in `server/wrangler.jsonc` (issuer, JWKS, scoperta OAuth per MCP).
4. `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` della build della SPA.
5. `npm run deploy` (compila la SPA e pubblica il Worker).
6. Verifica: accesso, famiglia e menu nell'app, `/.well-known/oauth-protected-resource`
   che indica il progetto nuovo. Avvisa che tutti rifanno l'accesso e ricollegano gli
   agenti.

### Prove

- **Prova locale completa** (criterio di fine della PR dell'esportazione): i passi 1-4
  su un'esportazione di `wrangler dev`, poi accesso e lettura di famiglia e menu
  dall'app locale puntata alla destinazione.
- **Prova automatica in CI:** `npm run test:drill -w server` (azzera il database).
- **Prova di produzione** (a carico dell'utente, voce separata del registro): dopo la
  creazione del bucket e la prima notte, i passi 1-4 con un'esportazione vera e la
  chiave presa dal gestore di password, non dal secret.

Con più chiavi (dopo una rotazione): `BACKUP_ENCRYPTION_KEY='k1=<…>,k2=<…>'`.
````

- [ ] **Step 2: dati sintetici poco comprimibili**

Sul database dello stack del worktree (`$TEST_DATABASE_URL`), dopo `supabase db reset --workdir "$SB"` (con seed): crea una lista della spesa per una famiglia del seed e riempila di testo casuale fino alla dimensione voluta (1 KB per riga di base64 casuale):

```bash
psql "$TEST_DATABASE_URL" -v rows=16000 <<'SQL'
with f as (select id from app.families limit 1),
	w as (insert into app.weeks (family_id, starts_on) select id, '2030-01-07' from f returning id, family_id),
	l as (insert into app.shopping_lists (family_id, week_id) select family_id, id from w returning id)
insert into app.shopping_list_items (shopping_list_id, text)
select l.id, encode(extensions.gen_random_bytes(768), 'base64') from l, generate_series(1, :rows);
SQL
```

(se `psql` non è installato: `podman exec -i supabase_db_w5-esportazione psql -U postgres -v rows=16000 < file.sql`).

- [ ] **Step 3: misura in workerd**

Per 8, 16 e 32 MB di documento (`rows` = 8000, 16000, 32000; riparti da `supabase db reset --workdir "$SB"` fra una misura e l'altra), da `server/` con `.env` che punta allo stack del worktree e porte libere:

```bash
npx wrangler dev --test-scheduled --port 8797 --inspector-port 9239
```

Premi `d` per aprire i DevTools, scheda **Performance**: avvia la registrazione con «Memory» attivo, poi in un altro terminale `curl "http://localhost:8797/cdn-cgi/local/scheduled?cron=30+2,4+*+*+*"`, ferma la registrazione dopo il log `backup_export_done`. Annota il picco dell'heap JS e, da un'istantanea della scheda **Memory** presa con un breakpoint su `deps.bucket.put` in `export.ts`, la memoria degli ArrayBuffer; la CPU dal profilo della registrazione; la durata dal campo `ms`; `estimatedBytes`, `uncompressedBytes` e `storedBytes` dal log. Per misurare anche le dimensioni oltre il limite attuale, alza temporaneamente `EXPORT_LIMIT_BYTES` in locale senza fare commit.

- [ ] **Step 4: fissa il limite**

`EXPORT_LIMIT_BYTES` è la dimensione più grande fra 8, 16 e 32 MB il cui picco (heap JS più ArrayBuffer) resta sotto 64 MB. Se è 16 MB non cambia nulla nel codice; altrimenti aggiorna la costante e il test non cambia (usa limiti propri). Scrivi la tabella delle misure e il valore nella spec, sezione 3, «Dimensioni, memoria e tempi», al posto di «Valore iniziale 16 MB, confermato o abbassato dalla misura».

- [ ] **Step 5: prova locale completa (criterio di fine della PR)**

1. Riparti da `supabase db reset --workdir "$SB"` (dati del seed), esporta con `wrangler dev` come allo step 3 e scarica l'oggetto come nella procedura (`--local`, chiave dal log).
2. `node scripts/backup/restore.ts inspect export.bin --ref HEAD`: commit trovato.
3. Destinazione preparata come da procedura: `supabase db reset --no-seed --workdir "$SB"`.
4. `DATABASE_URL=postgresql://postgres@127.0.0.1:58322/postgres PGPASSWORD=postgres` (password locale nota, non segreta), `restore --dry-run` riuscito, poi `restore` riuscito.
5. Avvia lo stack completo con Auth (`supabase start --workdir "$SB"`; `db start` avvia solo il database). App web locale puntata allo stack del worktree (`web/.env.local` con `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` di `supabase status --workdir "$SB"`), accesso con un utente del seed ripristinato: famiglia e menu visibili; `curl http://localhost:8797/.well-known/oauth-protected-resource` risponde con l'issuer locale.
6. Riporta lo stack ai dati dei test: `supabase db reset --workdir "$SB"`; cancella `export.bin`.

- [ ] **Step 6: verifica finale**

Run: `supabase test db --workdir "$SB" && npm run typecheck && npm test && RESTORE_DRILL=1 SUPABASE_WORKDIR="$SB" npm run test:drill -w server`
Expected: tutto verde. Poi `supabase db reset --workdir "$SB"`.

- [ ] **Step 7: commit**

```bash
git add supabase/README.md server/src/backup/export.ts progetto/superpowers/specs/2026-10-11-esportazione-r2.md
git commit -m "Esportazione: limite misurato in workerd, procedura di ripristino e prova locale completa"
```

Riporta nella descrizione della PR: tabella delle misure, limite, esito della prova locale completa passo per passo, file condivisi toccati, passi esterni della spec (sezione 5) e prova di produzione (sezione 6) da fare dopo il merge.
