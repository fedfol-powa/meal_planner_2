# Esportazione notturna in R2 (ondata 2, W5)

Creato: 11 ottobre 2026
Stato: design approvato a sezioni dal coordinatore l'11 ottobre 2026 (sezioni 1-3 in
conversazione, 4 e 5 scritte direttamente qui); in attesa della review di spec e piano.
Brief: `progetto/coordinamento/brief/w5-esportazione-r2.md`.
Specifica principale: sezioni 1, 2, 4, 8 («Storico e backup»), 9, 15 («Backup e
ripristino») e 16 (registro dell'8 e dell'11 ottobre 2026). Questa spec la estende e le
resta subordinata.

## Obiettivo

Ogni notte il Worker esporta tutto il database (dati dello schema `app` e utenti di
Supabase Auth) in un oggetto cifrato di R2 e conserva le ultime 7 esportazioni. Una
procedura scritta e provata ripristina un'esportazione in un database nuovo, con un
test automatico che esporta, ripristina e confronta i contenuti.

## Perimetro

**Dentro:** ruolo `app_backup` e funzione per gli utenti di Auth (nuova migrazione con
test pgTAP); esportazione nel Worker sul Cron Trigger; formato, compressione e
cifratura; conservazione delle ultime 7; CLI di ripristino con verifiche; test
automatico di esportazione e ripristino; procedura scritta; comandi dei passi esterni.

**Fuori:** email di allarme sui fallimenti (ondata 3, con quelle del job settimanale,
sezione 4); ripristino del catalogo a una data dallo storico (sezione 8, già deciso,
è un'altra cosa); operazioni del contratto, schermate o strumenti MCP: l'esportazione è
un compito operativo dell'infrastruttura, non un'azione di recupero dell'app (sezione 8,
«Il design distinguerà queste azioni dai compiti operativi di backup»); esportazione a
pagine (sopra i 50 MB, vedi «Dimensioni e tempi»).

## Decisioni prese nel brainstorming

Tutte del coordinatore, 11 ottobre 2026.

1. **Contenuto:** schema `app` più `auth.users` e `auth.identities` (con email e hash
   delle password), così un ripristino riporta gli stessi account con gli stessi id e
   i dati delle famiglie restano collegati. Restano fuori sessioni, refresh token,
   client e grant OAuth degli agenti e il resto dello schema `auth`: dopo un ripristino
   si rifà l'accesso e si ricollegano gli agenti (scritto nella procedura).
2. **Cifratura:** oltre alla cifratura a riposo di R2, AES-256-GCM nel Worker con
   WebCrypto, chiave a 256 bit come secret del Worker e copia nel gestore di password
   dell'utente. Motivo: l'account Cloudflare è quello di POWA, e chi ha accesso a R2
   nell'account leggerebbe email e hash delle password. Perdere la chiave significa
   perdere le esportazioni: la prova di ripristino in produzione usa la copia del
   gestore di password, così la verifica anche.
3. **Formato:** JSON per tabella prodotto da Postgres (`json_agg`), un solo documento
   compresso con gzip (`CompressionStream`) e cifrato; il Worker non può eseguire
   `pg_dump` e non serve: lo schema si ricrea dalle migrazioni.
4. **Approccio:** esportazione nel Worker con un'espressione cron dedicata (approccio
   1); scartate una GitHub Action notturna con `pg_dump` (password del database e
   token R2 nei secret di GitHub, workflow programmati in ritardo e disattivati dopo
   60 giorni senza attività, contro il brief) e l'esportazione a pagine con upload
   multipart (complessità inutile per pochi MB; soglia di 50 MB per riconsiderarla).
5. **Ruolo dedicato `app_backup`** in sola lettura, con `BYPASSRLS`, verificato in
   locale (vedi sotto).
6. **Ripristino** in un database con le stesse migrazioni e vuoto, in modalità
   `session_replication_role = replica`, con verifica di chiavi esterne e contenuti
   prima del commit; il test confronta tutto.

## Verifiche fatte in locale (11 ottobre 2026)

Sul Postgres locale di Supabase (stessa immagine della produzione, PostgreSQL 17),
come `postgres`, l'utente delle migrazioni, in transazioni annullate:

- `postgres` non è superuser ma ha `BYPASSRLS`: la migrazione può creare
  `app_backup nologin bypassrls`; `app_server` (membro con `set`) vi passa con
  `set local role app_backup` e legge tutte le tabelle di `app` scavalcando l'RLS.
- `postgres` non può concedere `usage` sullo schema `auth` (GRANT con warning, nessun
  permesso): `app_backup` non legge `auth.users` direttamente. Una funzione
  `security definer` di `postgres` con `search_path = ''` e `EXECUTE` solo ad
  `app_backup` restituisce le righe di `auth.users` e `auth.identities` (provata).
- `postgres` ha `INSERT` su `auth.users` e `auth.identities`, `usage` su `auth` e può
  impostare `session_replication_role = replica` (consentito da supautils): il
  ripristino non richiede un superuser.
- `supabase_migrations.schema_migrations` appartiene a `postgres`.
- Le 30 tabelle di `app` hanno tutte una chiave primaria e nessuna sequenza; colonne
  generate: `app.ingredient_unit_equivalences.from_dimension`,
  `auth.users.confirmed_at`, `auth.identities.email`.
- Dati locali di prova (molto più grandi di quelli reali): 6,3 MB su disco per `app`.

## 1. Ruolo e permessi (migrazione `20261012100000_backup.sql`)

```sql
create role app_backup nologin bypassrls;   -- dentro il blocco "if not exists"
grant app_backup to app_server;             -- app_server è NOINHERIT: serve set role
grant usage on schema app to app_backup;
grant select on all tables in schema app to app_backup;
alter default privileges for role postgres in schema app grant select on tables to app_backup;
grant usage on schema supabase_migrations to app_backup;
grant select on supabase_migrations.schema_migrations to app_backup;  -- solo se esiste
```

e la funzione `app.backup_auth_rows() returns jsonb`, `stable security definer set
search_path = ''`, che restituisce `{"users": [...], "identities": [...]}` con
`json_agg(u order by u.id)` e `json_agg(i order by i.id)`; `revoke execute ... from
public`, `grant execute ... to app_backup`. Le migrazioni si leggono direttamente (la
tabella è di `postgres`); se la tabella non esiste (migrazioni applicate a mano) la
lettura restituisce `null` (vedi ripristino).

**Perché un ruolo dedicato** (sezione 2, separazione dei ruoli): `app_job` scrive
settimane e pasti e legge solo ciò che serve al pianificatore; l'esportazione deve
leggere tutto (spesa, profili, bozze, utenti di Auth) e non scrivere niente. Unire i
due poteri allargherebbe ciò che un errore del job può leggere e ciò che un errore
dell'esportazione può scrivere. `BYPASSRLS` invece di una policy per tabella: una
tabella nuova resta esportata senza ricordarsi una policy, e il test lo garantisce.

**Test pgTAP** (`supabase/tests/backup_test.sql`, più `coverage_test.sql` aggiornato):

- `app_backup` ha `SELECT` su ogni tabella di `app` e nessun `INSERT`, `UPDATE`,
  `DELETE`, `TRUNCATE` su alcuna tabella di `app`;
- `app_backup` esegue solo `backup_auth_rows` fra le funzioni di `app`; nessun altro
  ruolo (`authenticated`, `anon`, `app_job`, `app_server`, PUBLIC) la esegue;
- `app_backup` è `NOLOGIN` e `BYPASSRLS`; `app_server` ne è membro senza ereditarne i
  permessi;
- come `app_backup` si leggono le righe di una famiglia senza appartenervi (RLS
  scavalcato) e `backup_auth_rows()` restituisce gli utenti di prova;
- ogni tabella di `app` ha una chiave primaria (serve all'ordine deterministico);
- lo schema `app` non ha sequenze né colonne identità (il ripristino non le gestisce).

## 2. Formato dell'esportazione

**Documento**, prima della compressione:

```json
{
  "format": "cosasimangia-export/1",
  "createdAt": "2026-10-12T02:30:00.123Z",
  "workerVersion": "<CF_VERSION_METADATA.id>",
  "migrations": ["20261011100000", "..."],
  "auth": { "users": [...], "identities": [...] },
  "tables": { "app.books": [...], "app.families": [...] }
}
```

- `tables` comprende tutte le tabelle di `app` (`relkind = 'r'`), scoperte da
  `pg_catalog` a ogni esportazione, in ordine alfabetico; nessun elenco nel codice.
- Righe da `json_agg(t order by <colonne della chiave primaria>)` (array vuoto se la
  tabella è vuota): ordine deterministico, confronto byte per byte possibile.
- Il JSON arriva dal database come testo e il Worker compone il documento per
  concatenazione, senza `JSON.parse` delle righe.
- Le colonne generate restano nel file; il ripristino non le inserisce.
- `migrations` è `null` se `supabase_migrations.schema_migrations` non esiste.

**Oggetto R2:**

- Chiave: `exports/<YYYY-MM-DD>T<HH-MM>Z.json.gz.enc` dall'istante programmato del
  cron in UTC (es. `exports/2026-10-12T02-30Z.json.gz.enc`): ordinabile per nome.
- Contenuto binario:

  | Byte | Contenuto |
  |---|---|
  | 4 | `CSM1` (magia) |
  | 1 | versione del formato binario (1) |
  | 1 | lunghezza n dell'identificativo della chiave |
  | n | identificativo della chiave in ASCII (`k1`) |
  | 12 | IV casuale |
  | resto | `AES-GCM(gzip(documento UTF-8))`, tag di 16 byte in coda |

  L'intestazione (magia, versione, identificativo) è dato autenticato aggiuntivo
  (`additionalData`) dell'AES-GCM: alterarla fa fallire la decifratura.
- `customMetadata`: `format`, `keyId`, `createdAt`, `uncompressedBytes`, `tables`,
  `rows` (totale), `users`. Nessun dato personale.

**Codice:** `server/src/backup/format.ts`, puro e valido sia nel Worker sia in Node
(WebCrypto, `CompressionStream`, `DecompressionStream` sono globali in entrambi):
`encodeExport(json: string, key: CryptoKey, keyId: string): Promise<Uint8Array>`,
`decodeExport(bytes, keys: Record<string, CryptoKey>): Promise<string>`,
`importKey(base64: string): Promise<CryptoKey>` (rifiuta chiavi diverse da 32 byte).

## 3. Esportazione nel Worker

**Trigger.** In `server/wrangler.jsonc` `"triggers": { "crons": ["0 * * * *", "30 2,4 * * *"] }`.
L'espressione nuova scatta alle 02:30 e alle 04:30 UTC (in Italia 03:30 e 05:30 con
l'ora solare, 04:30 e 06:30 con l'ora legale), mezz'ora dopo il job orario, con limiti propri (15 minuti di durata, 30 s
di CPU di default). Alle 04:30 esporta solo se manca un'esportazione con la data UTC
del giorno: è un secondo tentativo automatico, così un errore transitorio non porta la
perdita massima a due giorni.

**Smistamento in `server/src/index.ts`** (file condiviso con W1, modifica minima e
dichiarata): `scheduled` chiama `dispatchScheduled(controller.cron, env, time)` di
`server/src/scheduled.ts`, che fa `switch` sull'espressione: `'0 * * * *'` →
`runWeeklyJob` come oggi; `'30 2,4 * * *'` → `runNightlyExport`; altrimenti log
`scheduled_unknown_cron` (error). Le espressioni sono costanti esportate e un test
verifica che coincidano con `wrangler.jsonc`.

**Configurazione (`Env`):** `BACKUPS: R2Bucket` (binding R2), `BACKUP_ENCRYPTION_KEY:
string` (secret, base64 di 32 byte), `BACKUP_KEY_ID: string` (var, `k1`). Il binding
in `wrangler.jsonc`:

```jsonc
"r2_buckets": [{ "binding": "BACKUPS", "bucket_name": "cosasimangia-backups", "jurisdiction": "eu" }]
```

Giurisdizione UE: dati personali delle famiglie conservati nell'Unione. In locale
`wrangler dev` simula il bucket con Miniflare; la chiave locale sta in
`server/.env` (ignorato da Git), con la riga vuota in `server/.env.example`.

**`runNightlyExport(env, scheduledTime)`** in `server/src/backup/export.ts`:

1. **Configurazione:** se manca `BACKUPS` o `BACKUP_ENCRYPTION_KEY` (o la chiave non è
   di 32 byte) → log `backup_export_not_configured` (error) e ritorno, senza eccezione.
2. **Salto:** `BACKUPS.list({ prefix: 'exports/<YYYY-MM-DD>T' })` della data UTC; se
   c'è già un oggetto → `backup_export_skipped` e ritorno.
3. **Lettura:** `withDb(HYPERDRIVE, { kind: 'backup' }, readSnapshot)`. In
   `server/src/db.ts` (file di W1, modifica minima e dichiarata) il nuovo `case
   'backup'` esegue `set transaction isolation level repeatable read, read only` e poi
   `set local role app_backup`: tutte le letture vedono la stessa fotografia.
   `readSnapshot(tx)` (`server/src/backup/read.ts`, usata anche dal ripristino):
   `set local time zone 'UTC'` (istanti sempre in UTC nel JSON, qualunque sia il
   fuso della sessione: il ripristino fa lo stesso e il confronto non dipende dal
   server); tabelle e chiavi primarie da `pg_catalog`; per ogni tabella `select coalesce(json_agg(t
   order by …), '[]')::text as rows, count(*)::int as count from app.<t> t`
   (identificatori quotati con `tx(name)`); `app.backup_auth_rows()::text`; migrazioni.
   Restituisce le parti in testo e i conteggi.
4. **Composizione:** `composeExport(parts, createdAt, workerVersion)` concatena il
   documento; se supera 50 MB non compressi → log `backup_export_large` (error),
   l'esportazione prosegue.
5. **Scrittura:** `encodeExport`, poi `BACKUPS.put(key, bytes, { customMetadata })`.
6. **Conservazione:** `list({ prefix: 'exports/' })` con cursore fino alla fine,
   ordine per chiave, `delete(chiavi tranne le ultime 7)`. Solo dopo un `put` riuscito:
   una notte fallita non consuma copie buone. Una regola di ciclo di vita di R2 a 7
   giorni è scartata perché, dopo giorni di fallimenti, cancellerebbe le ultime copie
   buone.
7. **Log** `backup_export_done`: `key`, `uncompressedBytes`, `storedBytes`, `tables`,
   `rows`, `users`, `pruned`, `ms`.

**Errori:** ogni fase in `try/catch`; `backup_export_failed` (error) con `phase`
(`read`, `encode`, `put`, `prune`) e `code` (`errorCode` di `menu/generation.ts`, già
usato dal job: codici e messaggi di Postgres scelti, mai dati). Un errore di `prune` non
rende fallita l'esportazione già scritta (log con `phase: 'prune'`, la prossima notte
ripulisce). L'esportazione non lancia eccezioni fuori da `runNightlyExport`.

**Dimensioni e tempi.** Oggi il database reale pesa pochi MB; ci si aspettano
centinaia di KB cifrati. La CPU va quasi tutta a gzip e AES: stima 50-200 ms per
qualche MB, molto sotto i 30 s di default; la durata è dominata dall'attesa di
Postgres e R2 (secondi). Misura con `wrangler dev` sui dati locali di prova, riportata
nella PR. Memoria: documento, compresso e cifrato coesistono, quindi circa 2-3 volte la
dimensione non compressa: sotto i 128 MB del Worker fino alla soglia di 50 MB. Ora
dell'esportazione: 02:30 UTC, fuori dagli orari d'uso delle famiglie in Europa.

## 4. Ripristino

**Codice:** `server/src/backup/restore.ts` (caricamento e verifiche, riceve una
connessione Postgres.js) e la CLI `scripts/backup/restore.ts` (Node, legge il file e le
variabili d'ambiente, stampa l'esito). Nessuna dipendenza nuova: Postgres.js è già nel
workspace del server.

```bash
BACKUP_ENCRYPTION_KEY='<base64>' DATABASE_URL='postgresql://postgres:<password>@<host>:5432/postgres' \
  node scripts/backup/restore.ts <file> [--dry-run] [--accept-unknown-migrations]
```

`BACKUP_ENCRYPTION_KEY` può contenere più chiavi `k1=<base64>,k2=<base64>`; una chiave
sola senza nome vale per `k1`.

**Controlli prima di scrivere** (rifiuto con messaggio e codice di uscita 1):

1. Intestazione valida, identificativo della chiave presente fra quelle date, tag GCM
   corretto, `format` = `cosasimangia-export/1`.
2. Migrazioni della destinazione uguali, come insieme, a quelle dell'esportazione. Se
   l'esportazione ha `migrations: null` o la destinazione non ha la tabella, si
   prosegue solo con `--accept-unknown-migrations` (avviso stampato).
3. Destinazione vuota: nessuna riga nelle tabelle di `app`, in `auth.users` e in
   `auth.identities`. Nessuna opzione per sovrascrivere.
4. Stesso insieme di tabelle di `app` e, per ogni tabella (comprese `auth.users` e
   `auth.identities`), ogni colonna dell'esportazione esiste nella destinazione; le
   colonne generate della destinazione si escludono dall'inserimento.

**Caricamento**, una transazione come `postgres`:

0. `set local time zone 'UTC'`, come l'esportazione.

1. Il documento decifrato entra **una volta** in una tabella temporanea
   `restore_document(doc jsonb) on commit drop`: estrazione, caricamento e confronto si
   fanno in SQL, così nessun numero passa da `JSON.parse` (niente perdita di
   precisione) e il Node non tiene in memoria una seconda copia delle righe. Anche i
   controlli preliminari 2-4 leggono da lì.
2. `set local session_replication_role = replica`: non scattano trigger dei contatori,
   d'immutabilità, di controllo (date, fusi, ricette) né `create_profile_after_insert`,
   e non si controllano le chiavi esterne. I dati entrano come sono stati esportati.
3. `auth.users`, poi `auth.identities`, poi le tabelle di `app` in ordine topologico
   delle chiavi esterne (da `pg_constraint`; a parità, alfabetico; i cicli e le
   autoreferenze non bloccano, grazie alla modalità `replica`).
4. Per tabella: `insert into <t> (<colonne non generate>) select <colonne> from
   jsonb_populate_recordset(null::<t>, (select doc->'tables'->'app.<t>' from
   restore_document))` (per `auth` il percorso è `doc->'auth'->'users'` o
   `'identities'`).
5. Lo schema `app` non ha sequenze né colonne identità (verificato da un test pgTAP):
   il ripristino non riallinea sequenze. Chi ne aggiunge una fa fallire quel test, che
   rimanda a questa spec per estendere il ripristino.

**Verifiche prima del commit**, nella stessa transazione:

1. `set local session_replication_role = origin`; per ogni vincolo di chiave esterna
   delle tabelle di `app`, `auth.users` e `auth.identities`, una query generata da
   `pg_constraint` conta le righe orfane: devono essere zero.
2. Confronto in SQL con il documento: per ogni tabella di `app`,
   `json_agg(t order by <chiave primaria>)::jsonb` uguale a `doc->'tables'->'app.<t>'`
   (contatori di versione, istanti, storico compresi; jsonb confronta i valori esatti);
   per `auth.users` e `auth.identities` stesso numero di righe e ogni riga esportata
   contenuta (`@>`) nella riga con lo stesso id: si confrontano le colonne
   dell'esportazione, una versione più nuova di Auth può averne di più.
3. Una differenza → `rollback` e l'elenco delle tabelle diverse. `--dry-run` esegue
   tutto e poi annulla.

**Procedura scritta** in `supabase/README.md`, sezione «Esportazione notturna e
ripristino»: scaricare l'esportazione (comandi nella sezione 5), creare il progetto o
azzerare l'ambiente di verifica, applicare le migrazioni del commit in vigore la notte
dell'esportazione, impostare la password di `app_server`, eseguire la CLI (prima
`--dry-run`), aggiornare Hyperdrive se il progetto è nuovo, riconfigurare a mano Auth
(chiavi di firma asimmetriche, provider, SMTP di Resend, server OAuth 2.1, URL di
redirect), avvisare che tutti rifanno l'accesso e ricollegano gli agenti.

## 5. Passi esterni (li fa l'utente, su richiesta del coordinatore)

Da `server/`, con `npx wrangler` autenticato sull'account di POWA. Il binding entra in
`wrangler.jsonc` con la PR: il bucket va creato prima della prima pubblicazione dopo il
merge.

1. **Bucket privato nell'UE:**
   ```bash
   npx wrangler r2 bucket create cosasimangia-backups --jurisdiction eu
   ```
   Nessun dominio pubblico né accesso `r2.dev` (sono disattivati di default: non
   attivarli).
2. **Chiave di cifratura:**
   ```bash
   openssl rand -base64 32
   ```
   Copia l'output nel gestore di password come «Cosa si mangia — chiave delle
   esportazioni k1», poi:
   ```bash
   npx wrangler secret put BACKUP_ENCRYPTION_KEY
   ```
   e incolla la stessa chiave. Non salvarla in file del repository.
3. **Pubblicazione** del Worker (`npm run deploy` dalla radice), come ogni merge.
4. **Verifica della prima esportazione** il giorno dopo: nel dashboard di Cloudflare,
   R2 → `cosasimangia-backups` → `exports/`, deve esserci l'oggetto della notte; nei
   log del Worker l'evento `backup_export_done`. Wrangler non elenca gli oggetti: la
   chiave si legge dal dashboard o dal log.
5. **Prova di ripristino con un'esportazione vera** (completa il collaudo della
   sezione 9 e verifica la copia della chiave):
   ```bash
   npx wrangler r2 object get cosasimangia-backups/exports/<chiave> --remote --jurisdiction eu --file export.bin
   ```
   poi la procedura di ripristino in un ambiente di verifica locale, usando la chiave
   presa dal gestore di password, non dal secret.

Una domanda di conferma va al coordinatore (`STATO: DOMANDA`) prima di qualsiasi passo
sull'account di POWA; nessun comando remoto si esegue dal worker.

## Cosa uso e cosa produco

**Uso (su `main`):**

- `server/src/index.ts` e `wrangler.jsonc`: Cron Trigger orario e `runWeeklyJob` (W1);
- `server/src/db.ts` (`withDb`, `DbIdentity`), `log.ts` (`logEvent`),
  `menu/generation.ts` (`errorCode`), `env.ts`;
- ruoli `app_server` e schema `app` (PR #4), fixture e `support/db.ts` dei test del
  server, CI con Postgres locale (PR #5).

**Produco:**

- migrazione `20261012100000_backup.sql` (ruolo `app_backup`, funzione
  `app.backup_auth_rows()`), nessuna tabella o colonna nuova o cambiata; test
  `supabase/tests/backup_test.sql`, `coverage_test.sql` aggiornato;
- `server/src/backup/` (`format.ts`, `read.ts`, `export.ts`, `restore.ts`) e
  `server/src/scheduled.ts`;
- `scripts/backup/restore.ts`;
- **modifiche a file condivisi, minime:** `server/src/index.ts` (lo `scheduled`
  delega a `dispatchScheduled`), `server/src/db.ts` (`case 'backup'`),
  `server/src/env.ts` (tre campi), `server/wrangler.jsonc` (cron e binding R2),
  `supabase/tests/coverage_test.sql` (asserzioni sulle funzioni per ruolo),
  `supabase/README.md` (ruolo e procedura), `server/.env.example` e `server/README.md`
  (chiave locale e prova del cron notturno).

Interfaccia per altre attività: nessuna. Chi aggiunge una tabella in `app` non deve
fare nulla (la scopre l'esportazione; `alter default privileges` concede la lettura);
chi aggiunge una colonna generata non deve fare nulla. Un'eventuale tabella fuori da
`app` con dati da conservare andrà aggiunta qui.

## Test

**Unità (Vitest, senza database), `server/src/backup/format.test.ts`:**
andata e ritorno di `encodeExport`/`decodeExport`; chiave sbagliata, identificativo
sconosciuto, magia o versione errate, intestazione alterata (dato autenticato) e byte
alterati rifiutati; `importKey` rifiuta lunghezze diverse da 32 byte; IV diversi a ogni
codifica.

**Smistamento, `server/test/scheduled.test.ts`:** le espressioni coincidono con
`wrangler.jsonc`; l'espressione oraria chiama solo il job, quella notturna solo
l'esportazione; un'espressione sconosciuta registra il log e non lancia.

**Esportazione e ripristino (Vitest con Postgres locale),
`server/test/backup.test.ts`, con un R2 finto in memoria (`put`, `list` con prefisso e
cursore, `delete` di più chiavi, `get`):**

- dati in tutte le aree con le fixture esistenti, più una riga in `auth.identities`;
- esportazione con l'identità `backup` tramite `app_server`, come in produzione;
  metadati e conteggi coerenti;
- **ripristino:** in una transazione dell'amministratore annullata alla fine (i file
  di test girano uno alla volta): svuota `app`, `auth.identities` e `auth.users`,
  ripristina, e verifica zero orfani, documento riletto identico all'esportazione,
  contatori di `families.data_version` e `catalogue_state.version` uguali, nessun
  profilo creato due volte dal trigger;
- rifiuti: destinazione non vuota, migrazioni diverse, chiave sbagliata, file
  alterato, colonna mancante nella destinazione;
- conservazione: dopo 9 esportazioni su date diverse restano le 7 più recenti; un
  errore di `put` non cancella nulla; un errore di `delete` non rende fallita
  l'esportazione;
- salto: con un oggetto della stessa data, la seconda esecuzione non scrive;
- configurazione mancante: log `backup_export_not_configured`, nessuna eccezione.

**Prova manuale nell'ambiente di verifica** (prima della PR, esito nella descrizione):
`wrangler dev --test-scheduled` e
`curl "http://localhost:8787/cdn-cgi/local/scheduled?cron=30+2,4+*+*+*"` con R2
simulato; misura della CPU; `wrangler r2 object get … --local`; ripristino con la CLI in
un secondo stack Supabase locale azzerato con `supabase db reset --no-seed`; login di un
utente ripristinato nell'app locale.

## Decisioni da riportare nella specifica

**Prodotto:**

- Le esportazioni notturne comprendono dati delle famiglie, catalogo e account (email
  e password cifrate da Supabase); dopo un ripristino da esportazione tutti rifanno
  l'accesso e ricollegano gli agenti (sezione 8, «Storico e backup»; sezione 15,
  «Backup e ripristino»).
- Perdita massima di circa un giorno con un secondo tentativo nella stessa notte
  (sezione 8).

**Tecniche:**

- Esportazione nel Worker con l'espressione cron `30 2,4 * * *` accanto a quella
  oraria, smistata con `controller.cron`; secondo tentativo alle 04:30 solo se manca
  quella del giorno (sezioni 1 e 4).
- Ruolo `app_backup` NOLOGIN BYPASSRLS in sola lettura su `app`, membro di
  `app_server`, e funzione `app.backup_auth_rows()` `security definer` per gli utenti
  di Auth (sezioni 1 e 2, tabella dei ruoli).
- Formato: documento JSON per tabella prodotto da Postgres, gzip, AES-256-GCM con
  chiave nel secret `BACKUP_ENCRYPTION_KEY` e copia nel gestore di password; bucket
  `cosasimangia-backups` privato in giurisdizione UE; ultime 7 conservate dal codice,
  non da una regola di ciclo di vita (sezione 8).
- Ripristino con la CLI `scripts/backup/restore.ts` in un database con le stesse
  migrazioni e vuoto, in modalità `replica`, con verifica di chiavi esterne e
  contenuti prima del commit; procedura in `supabase/README.md`; collaudo con
  un'esportazione vera (sezioni 8 e 9).
- Soglia di 50 MB non compressi per passare a un'esportazione a pagine (sezione 8).
- Email di allarme sui fallimenti dell'esportazione nell'ondata 3, insieme a quelle del
  job (sezioni 4 e 15).
- Chiude in sezione 15, «Backup e ripristino»: strumento, conservazione, cifratura e
  procedura tecnica; restano i tempi di recupero misurati con un'esportazione vera.
