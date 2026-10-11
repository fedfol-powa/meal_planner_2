# Esportazione notturna in R2 (ondata 2, W5)

Creato: 11 ottobre 2026
Stato: design approvato a sezioni dal coordinatore l'11 ottobre 2026; corretta dopo la
review di spec e piano (`revisioni/w5-esportazione-spec-piano.md`, verdetto «da
rifare», messaggio `w5-08-review-esportazione.md`) e dopo la seconda review
(`revisioni/w5-esportazione-spec-piano-2.md`, approvabile con tre correzioni, applicate);
approvata dal coordinatore l'11 ottobre 2026.
Brief: `progetto/coordinamento/brief/w5-esportazione-r2.md`.
Specifica principale: sezioni 1, 2, 4, 8 («Storico e backup»), 9, 15 («Backup e
ripristino») e 16 (registro dell'8 e dell'11 ottobre 2026). Questa spec la estende e le
resta subordinata.

## Obiettivo

Ogni notte il Worker esporta tutto il database (dati dello schema `app` e utenti di
Supabase Auth) in un oggetto cifrato di R2 e conserva le ultime 7 esportazioni. Una
procedura scritta e provata ripristina un'esportazione in un database appena preparato
con le migrazioni, e una prova automatica in CI segue gli stessi passi della procedura.

## Perimetro

**Dentro:** ruolo `app_backup` e funzione per gli utenti di Auth (nuova migrazione con
test pgTAP); esportazione nel Worker sul Cron Trigger con limite di dimensione;
formato, compressione e cifratura; conservazione delle ultime 7; CLI di ripristino con
verifiche e ricerca del commit delle migrazioni; prova di ripristino in CI; procedura
scritta; comandi dei passi esterni.

**Fuori:** email di allarme sui fallimenti (ondata 3, con quelle del job settimanale,
sezione 4); ripristino del catalogo a una data dallo storico (sezione 8, già deciso,
è un'altra cosa); operazioni del contratto, schermate o strumenti MCP: l'esportazione è
un compito operativo dell'infrastruttura, non un'azione di recupero dell'app (sezione 8,
«Il design distinguerà queste azioni dai compiti operativi di backup»); esportazione a
pagine o in streaming (oltre il limite, vedi «Dimensioni, memoria e tempi»).

## Decisioni prese nel brainstorming e nella review

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
   perdere le esportazioni: la prova di produzione usa la copia del gestore di password,
   così la verifica anche.
3. **Formato:** JSON per tabella prodotto da Postgres (`json_agg`), un solo documento
   compresso con gzip (`CompressionStream`) e cifrato; il Worker non può eseguire
   `pg_dump` e non serve: lo schema si ricrea dalle migrazioni.
4. **Approccio:** esportazione nel Worker con un'espressione cron dedicata; scartate una
   GitHub Action notturna con `pg_dump` (password del database e token R2 nei secret di
   GitHub, workflow programmati in ritardo e disattivati dopo 60 giorni senza attività,
   contro il brief) e l'esportazione a pagine con upload multipart (complessità inutile
   per pochi MB).
5. **Ruolo dedicato `app_backup`** in sola lettura, con `BYPASSRLS`, verificato in
   locale (vedi sotto).
6. **Ripristino** in un database preparato con le migrazioni, vuoto salvo le righe che
   le migrazioni stesse inseriscono (elencate nel codice), in modalità
   `session_replication_role = replica`, con verifica di chiavi esterne e contenuti
   prima del commit.
7. **Marcatori di transazione** (review, rilievo 3): i contatori applicativi
   (`families.data_version`, `catalogue_state.version`) si conservano; i marcatori di
   deduplicazione `xid8` (`families.data_version_xid`, `catalogue_state.version_xid`)
   tornano `NULL`, perché gli identificativi di transazione non hanno senso in un altro
   cluster e uno coincidente bloccherebbe l'incremento successivo. I trigger gestiscono
   già `NULL` (`is distinct from pg_current_xact_id()`). Il confronto dopo il ripristino è
   esatto su tutto tranne queste colonne, elencate nel codice (`XID_MARKERS`).
8. **Limite dell'esportazione** (review, rilievo 5): misurato in workerd con dati poco
   comprimibili; controllato **prima** di leggere le righe, da una stima calcolata dal
   database; oltre il limite l'esportazione non parte e scrive un log di errore.
9. **Commit delle migrazioni** (review, rilievo 9): nessun registro nuovo; il commit da
   usare per preparare la destinazione è quello in cui `supabase/migrations/` corrisponde
   esattamente all'elenco delle migrazioni contenuto nell'esportazione; la CLI lo cerca
   (`inspect`). `workerVersion` resta informativo.
10. **Due prove distinte** (review, punto 3): la prova locale completa è il criterio di
    fine della PR; la prova di produzione la fa l'utente dopo la creazione del bucket, ed
    è una voce separata del registro.

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
- `postgres`, creatore di un ruolo, può concedersene l'uso (`grant … to postgres with
  inherit false, set true`) dentro una transazione: serve ai test pgTAP, non alla
  produzione.
- `supabase_migrations.schema_migrations` appartiene a `postgres`; tabelle e funzioni di
  `app` anche.
- Le 30 tabelle di `app` hanno tutte una chiave primaria e nessuna sequenza; colonne
  generate: `app.ingredient_unit_equivalences.from_dimension`,
  `auth.users.confirmed_at`, `auth.identities.email`; colonne `xid8`:
  `families.data_version_xid`, `catalogue_state.version_xid` (in JSON escono come
  stringhe).
- La migrazione `20261011100700_versions.sql` inserisce la riga iniziale di
  `app.catalogue_state` (`id = true`, `version = 1`, `version_xid = null`): un database
  appena migrato non è vuoto.
- Il tipo `json` conserva il testo esatto e `->` ne restituisce la porzione originale,
  spazi e cifre comprese: il confronto può essere fatto sul testo.

## 1. Ruolo e permessi (migrazione `20261012100000_backup.sql`)

```sql
create role app_backup nologin bypassrls;   -- dentro il blocco "if not exists"
grant app_backup to app_server;             -- app_server è NOINHERIT: serve set role
grant usage on schema app to app_backup;
grant select on all tables in schema app to app_backup;
alter default privileges for role postgres in schema app grant select on tables to app_backup;
grant usage on schema supabase_migrations to app_backup;              -- solo se la tabella esiste
grant select on supabase_migrations.schema_migrations to app_backup;  -- idem
```

e la funzione `app.backup_auth_rows() returns jsonb`, `stable security definer set
search_path = ''`, che restituisce `{"users": [...], "identities": [...]}` con
`jsonb_agg(to_jsonb(u) order by u.id)` e `jsonb_agg(to_jsonb(i) order by i.id)`;
`revoke execute ... from public`, `grant execute ... to app_backup`.

**Perché un ruolo dedicato** (sezione 2, separazione dei ruoli): `app_job` scrive
settimane e pasti e legge solo ciò che serve al pianificatore; l'esportazione deve
leggere tutto (spesa, profili, bozze, utenti di Auth) e non scrivere niente. Unire i
due poteri allargherebbe ciò che un errore del job può leggere e ciò che un errore
dell'esportazione può scrivere. `BYPASSRLS` invece di una policy per tabella: una
tabella nuova resta esportata senza ricordarsi una policy, e il test lo garantisce.

**Test pgTAP** (`supabase/tests/backup_test.sql`, più una riga in `coverage_test.sql`).
Il setup del file, dentro la transazione del test e quindi annullato alla fine, concede
a `postgres` l'uso di `app_backup` (`with inherit false, set true`) e ad `app_backup`
l'`usage` sullo schema `extensions` di pgTAP; la produzione non riceve nessuno dei due.
Verifica:

- `app_backup` ha `SELECT` su ogni tabella di `app` e nessun `INSERT`, `UPDATE`,
  `DELETE`, `TRUNCATE`; una tabella creata dopo (come farebbe una migrazione futura)
  resta leggibile;
- `app_backup` esegue solo `backup_auth_rows` fra le funzioni di `app`; nessun altro
  ruolo (`authenticated`, `anon`, `app_job`, `app_server`, PUBLIC) la esegue;
- `app_backup` è `NOLOGIN` e `BYPASSRLS`; `app_server` può passarvi senza ereditarne i
  permessi;
- come `app_backup` si legge una famiglia senza appartenervi (RLS scavalcato),
  `backup_auth_rows()` restituisce gli utenti, `auth.users` diretto è negato, ogni
  scrittura è negata;
- ogni tabella di `app` ha una chiave primaria (ordine deterministico);
- lo schema `app` non ha sequenze né colonne identità (il ripristino non le gestisce);
- le colonne `xid8` di `app` sono esattamente quelle di `XID_MARKERS` (chi ne aggiunge
  una deve aggiornare l'elenco del ripristino).

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
  `pg_catalog` a ogni esportazione, in ordine `collate "C"`; nessun elenco nel codice.
- Righe da `json_agg(t order by <colonne della chiave primaria>)` (array vuoto se la
  tabella è vuota): ordine deterministico; il testo di Postgres entra nel documento
  così com'è, senza `JSON.parse`.
- Istanti sempre in UTC: la lettura imposta `set local time zone 'UTC'`, e il ripristino
  fa lo stesso.
- Le colonne generate e i marcatori `xid8` restano nel file; il ripristino non li
  inserisce.
- `migrations` è `null` se `supabase_migrations.schema_migrations` non esiste o non è
  leggibile.

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
- `customMetadata`: `format`, `keyId`, `createdAt`, `uncompressedBytes`, `storedBytes`,
  `tables`, `rows`, `users`. Nessun dato personale.

**Codice:** `server/src/backup/format.ts`, puro e valido sia nel Worker sia in Node
(WebCrypto, `CompressionStream`, `DecompressionStream`): `importKey`, `parseKeyList`,
`encodeExport`, `decodeExport`, `ExportFormatError`.

## 3. Esportazione nel Worker

**Trigger.** In `server/wrangler.jsonc` `"triggers": { "crons": ["0 * * * *", "30 2,4 * * *"] }`.
L'espressione nuova scatta alle 02:30 e alle 04:30 UTC (in Italia 03:30 e 05:30 con
l'ora solare, 04:30 e 06:30 con l'ora legale), mezz'ora dopo il job orario, in
un'invocazione con limiti propri: 15 minuti di durata e, sul piano a pagamento, fino a
15 minuti di CPU per un Cron Trigger. Alle 04:30 esporta solo se manca
un'esportazione con la data UTC del giorno: è un secondo tentativo automatico, così un
errore transitorio non porta la perdita massima a due giorni.

**Smistamento in `server/src/index.ts`** (file condiviso con W1, modifica minima e
dichiarata): `scheduled` chiama `dispatchScheduled(controller.cron, env, time)` di
`server/src/scheduled.ts`, che fa `switch` sull'espressione: `'0 * * * *'` →
`runWeeklyJob` come oggi; `'30 2,4 * * *'` → `runNightlyExport`; altrimenti log
`scheduled_unknown_cron` (error). Le espressioni sono costanti esportate e un test
verifica che coincidano con `wrangler.jsonc`.

**Configurazione (`Env`):** `BACKUPS?: R2Bucket` (binding R2), `BACKUP_ENCRYPTION_KEY?:
string` (secret, base64 di 32 byte), `BACKUP_KEY_ID?: string` (var, `k1`). Il binding
in `wrangler.jsonc`:

```jsonc
"r2_buckets": [{ "binding": "BACKUPS", "bucket_name": "cosasimangia-backups", "jurisdiction": "eu" }]
```

Giurisdizione UE: dati personali delle famiglie conservati nell'Unione. In locale
`wrangler dev` simula il bucket con Miniflare; la chiave locale sta in `server/.env`
(ignorato da Git), con la riga vuota in `server/.env.example`.

**`runNightlyExport(env, scheduledTime)`** in `server/src/backup/export.ts`:

1. **Configurazione:** se manca `BACKUPS` o `BACKUP_ENCRYPTION_KEY` (o la chiave non è
   di 32 byte) → log `backup_export_not_configured` (error) e ritorno, senza eccezione.
2. **Salto:** `BACKUPS.list({ prefix: 'exports/<YYYY-MM-DD>T' })` della data UTC; se
   c'è già un oggetto → `backup_export_skipped` e ritorno.
3. **Lettura**, in una transazione con l'identità `{ kind: 'backup' }` di
   `server/src/db.ts` (file di W1, modifica minima e dichiarata: `set transaction
   isolation level repeatable read, read only`, poi `set local role app_backup`):
   1. `set local time zone 'UTC'`;
   2. **stima** della dimensione: per ogni tabella `sum(octet_length(row_to_json(t)::text))`
      più quella degli utenti di Auth, calcolata nel database senza trasferire righe;
      se supera `EXPORT_LIMIT_BYTES` → `ExportTooLargeError`, log
      `backup_export_too_large` (error) con stima e limite, nessuna scrittura; sopra
      metà del limite, log `backup_export_near_limit` (error) e l'esportazione prosegue;
   3. per ogni tabella `select coalesce(json_agg(t order by …), '[]')::text, count(*)`;
      `app.backup_auth_rows()::text`; elenco delle migrazioni.
   La stima e le letture stanno nella stessa fotografia `repeatable read`.
4. **Composizione e scrittura** con il minimo di copie: le parti del documento vanno in
   un `Blob` (UTF-8) letto in streaming attraverso `CompressionStream`; il risultato
   compresso si cifra; l'oggetto finale si scrive come `Blob([intestazione, IV,
   cifrato])`. I riferimenti alle stringhe si rilasciano prima della cifratura.
5. **Conservazione:** `list({ prefix: 'exports/' })` con cursore fino alla fine, ordine
   per chiave, `delete(chiavi tranne le ultime 7)`. Solo dopo un `put` riuscito: una
   notte fallita non consuma copie buone. Una regola di ciclo di vita di R2 a 7 giorni
   è scartata perché, dopo giorni di fallimenti, cancellerebbe le ultime copie buone.
6. **Log** `backup_export_done`: `key`, `estimatedBytes`, `uncompressedBytes`,
   `storedBytes`, `tables`, `rows`, `users`, `pruned`, `ms`.

**Errori:** `backup_export_failed` (error) con `phase` (`list`, `read`, `encode`,
`put`, `prune`) e `code` (`errorCode` di `menu/generation.ts`, già usato dal job: codici
di Postgres o nome dell'errore, mai messaggi o dati). Un errore di `prune` non rende
fallita l'esportazione già scritta. `runNightlyExport` non lancia eccezioni.

### Dimensioni, memoria e tempi

- **Memoria.** I 128 MB valgono per isolate, che può servire anche altre richieste. Il
  picco dell'esportazione è circa la somma di: testo delle tabelle (1-2 byte per
  carattere in V8), Blob UTF-8, compresso, cifrato; con dati poco comprimibili circa 4
  volte la dimensione del documento. Regola: `EXPORT_LIMIT_BYTES` è la dimensione più
  grande, fra 8, 16 e 32 MB di documento, il cui picco misurato in workerd resta sotto
  **64 MB** (metà del limite, margine per l'isolate). Valore iniziale 16 MB, confermato
  o abbassato dalla misura del piano prima della PR; il valore e le misure finiscono in
  questa sezione e nella PR.
- **Misura** in `wrangler dev` (workerd): dati sintetici poco comprimibili (testo
  casuale in `app.shopping_list_items`) per documenti da 8, 16 e 32 MB; picco di memoria
  dal pannello Memory dei DevTools (timeline delle allocazioni, heap JS più
  ArrayBuffer), CPU dal profilo CPU dei DevTools, durata dal log `ms`. La CPU reale in
  produzione si legge poi nei log del Worker pubblicato (prova di produzione).
- **Oggi:** il database reale pesa pochi MB; ci si aspettano centinaia di KB cifrati.
  Se la stima si avvicina al limite (log `backup_export_near_limit`), si passa a
  un'esportazione a pagine con upload multipart: nuova attività, non questa.
- **Ora:** 02:30 UTC, fuori dagli orari d'uso delle famiglie in Europa.

## 4. Ripristino

**Codice:** `server/src/backup/restore.ts` (controlli, caricamento e verifiche dentro
la transazione del chiamante), `scripts/backup/restore.ts` (CLI Node) e
`scripts/backup/migrations-commit.ts` (ricerca del commit). Nessuna dipendenza nuova.

**Comandi della CLI** (dalla radice del repository):

```bash
node scripts/backup/restore.ts inspect <file>                 # intestazione, migrazioni, commit corrispondente
node scripts/backup/restore.ts restore <file> [--dry-run] [--accept-unknown-migrations]
```

La chiave arriva da `BACKUP_ENCRYPTION_KEY` (una chiave sola vale per `k1`; più chiavi
`k1=<base64>,k2=<base64>`); la destinazione da `DATABASE_URL` senza password, con la
password in `PGPASSWORD` (Postgres.js la legge da lì). La procedura le fa inserire con
`read -rs`, così chiave e password non finiscono nella cronologia della shell.

**Preparazione della destinazione** (la stessa nella procedura e nella prova in CI): un
database con le migrazioni del commit trovato da `inspect` e nessun dato; in locale
`supabase db reset --no-seed`, in produzione un progetto Supabase nuovo con le
migrazioni applicate. Le righe che le migrazioni inseriscono sono elencate nel codice
(`MIGRATION_ROWS`): oggi solo la riga iniziale di `app.catalogue_state`, riconosciuta
dal predicato `id and version = 1 and version_xid is null`. Una destinazione in cui
quella riga è cambiata, o con qualsiasi altra riga, è rifiutata come non vuota: non
esiste un'opzione per sovrascrivere dati veri. Se una migrazione futura inserisce altre
righe, la prova in CI fallisce e l'elenco va aggiornato.

**Controlli prima di scrivere** (rifiuto con codice di uscita 1):

1. Intestazione valida, identificativo della chiave presente fra quelle date, tag GCM
   corretto, `format` = `cosasimangia-export/1`.
2. Migrazioni della destinazione uguali, come insieme, a quelle dell'esportazione. Se
   l'esportazione ha `migrations: null` o la destinazione non ha la tabella, si
   prosegue solo con `--accept-unknown-migrations`.
3. Stesso insieme di tabelle di `app`.
4. Destinazione vuota come definito sopra (`app`, `auth.users`, `auth.identities`).
5. Ogni colonna dell'esportazione esiste nella destinazione.

**Caricamento**, una transazione come `postgres`:

1. `set local time zone 'UTC'`; il documento decifrato entra **una volta** in una
   tabella temporanea `restore_document(doc json) on commit drop`. Tipo `json`, non
   `jsonb`: conserva il testo esatto per il confronto. Estrazione, caricamento e
   confronto si fanno in SQL, così nessun numero passa da `JSON.parse`.
2. `set local session_replication_role = replica`: non scattano trigger dei contatori,
   d'immutabilità, di controllo né `create_profile_after_insert`, e non si controllano
   le chiavi esterne. Restano attivi i vincoli `check`, `not null` e di unicità.
3. Le righe di `MIGRATION_ROWS` riconosciute si cancellano.
4. `auth.users`, poi `auth.identities`, poi le tabelle di `app` in ordine topologico
   delle chiavi esterne (a parità, alfabetico; cicli e autoreferenze non bloccano grazie
   alla modalità `replica`). Per tabella: `insert into <t> (<colonne>) select <colonne>
   from json_populate_recordset(null::<t>, (select <percorso> from restore_document))`,
   con le colonne dell'esportazione che nella destinazione non sono generate e non sono
   marcatori `xid8` (`XID_MARKERS`): i marcatori restano `NULL`.
5. Lo schema `app` non ha sequenze né colonne identità (verificato da pgTAP).

**Verifiche prima del commit**, nella stessa transazione:

1. `session_replication_role = origin`; per ogni vincolo di chiave esterna delle tabelle
   di `app`, `auth.users` e `auth.identities`, una query generata da `pg_constraint`
   conta le righe orfane: devono essere zero.
2. **Confronto esatto** (`verifyRestored`, che restituisce l'elenco delle differenze):
   - tabelle di `app` senza marcatori: `json_agg(t order by <chiave>)::text` uguale,
     carattere per carattere, al testo `(doc->'tables'->'app.<t>')::text`;
   - tabelle con marcatori (`families`, `catalogue_state`): uguaglianza `jsonb` delle
     righe senza le colonne di `XID_MARKERS` (valori esatti, numeri compresi), più tutti
     i marcatori `NULL`;
   - `auth.users` e `auth.identities`: uguaglianza `jsonb` dell'array delle righe
     proiettate sulle sole colonne esportate (una versione più nuova di Auth può avere
     colonne in più, che non si confrontano); nessun contenimento: un array o un oggetto
     annidato diverso è una differenza.
3. Una differenza → `RestoreError('mismatch', [tabelle])` e rollback. `--dry-run`
   esegue tutto e poi annulla.

**Errori senza dati.** La CLI stampa solo esito, motivo e diagnostica strutturale (nomi
di tabelle, colonne, vincoli, versioni delle migrazioni, codici SQLSTATE). Non stampa
oggetti errore, messaggi, `detail`, query, parametri né valori: un errore di Postgres
durante il caricamento diventa `RestoreError('load_failed', ['<tabella>', '<SQLSTATE>'])`,
qualsiasi altro errore `failed: <nome dell'errore>`.

**Ricerca del commit** (`inspect`): decifra, stampa `createdAt`, `workerVersion`,
numero e ultima migrazione, e il commit più recente di `origin/main` (o del ref
indicato con `--ref`) in cui i file di `supabase/migrations/` hanno esattamente quelle
versioni (`git rev-list <ref> -- supabase/migrations` e `git ls-tree` per ciascun
commit). Se nessun commit corrisponde lo dice: l'esportazione viene da migrazioni non
unite su `main`.

**Procedura scritta** in `supabase/README.md`, sezione «Esportazione notturna e
ripristino», con le due prove della sezione 6.

**Configurazioni che dipendono dal progetto Supabase**, da aggiornare in quest'ordine
dopo un ripristino su un progetto nuovo:

1. progetto nuovo: chiavi di firma asimmetriche, provider di Auth, SMTP di Resend,
   server OAuth 2.1, URL del sito e di redirect;
2. migrazioni dal commit trovato, password di `app_server`, ripristino con la CLI;
3. Hyperdrive: origine verso il Session pooler del progetto nuovo (`wrangler hyperdrive
   update <id> --origin-host … --origin-user app_server.<ref del nuovo progetto> --origin-password …`: il Session pooler vuole il riferimento del progetto nel nome utente, limite di
   connessioni come prima);
4. `SUPABASE_URL` in `server/wrangler.jsonc` (issuer, JWKS, scoperta OAuth per MCP);
5. `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` della build della SPA;
6. ricostruzione e pubblicazione (`npm run deploy`, che compila la SPA e pubblica il
   Worker);
7. verifica: accesso, lettura di famiglia e menu nell'app, scoperta MCP
   (`/.well-known/oauth-protected-resource/mcp` risponde con `authorization_servers` che indica il progetto nuovo); poi tutti rifanno
   l'accesso e ricollegano gli agenti.

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
   e incolla la stessa chiave quando Wrangler la chiede. Non salvarla in file.
3. **Pubblicazione** del Worker (`npm run deploy` dalla radice), come ogni merge.
4. **Prova di produzione** (sezione 6).

Una domanda di conferma va al coordinatore (`STATO: DOMANDA`) prima di qualsiasi passo
sull'account di POWA; nessun comando remoto si esegue dal worker.

## 6. Collaudo: due prove distinte

**Prova locale completa: criterio di fine della PR** (worker, prima della PR; esito
nella descrizione):

1. dati locali con le fixture e dati sintetici; esportazione da `wrangler dev
   --test-scheduled` con R2 simulato; misure di memoria, CPU e durata (sezione 3);
2. `inspect` dell'esportazione scaricata con `wrangler r2 object get … --local`: commit
   trovato;
3. destinazione preparata come da procedura (`supabase db reset --no-seed` su uno stack
   separato), `restore --dry-run` riuscito e destinazione invariata, poi `restore`;
4. app web locale puntata alla destinazione: accesso con un utente ripristinato, lettura
   di famiglia e menu, risposta della scoperta MCP.

**Prova automatica in CI** (`npm run test:drill -w server`, ultimo passo della CI perché
azzera il database): stessi passi 2-3 con la CLI vera su una destinazione preparata con
`supabase db reset --no-seed`, più i casi d'errore (sezione «Test»).

**Prova di produzione: voce separata del registro, la fa l'utente** dopo la creazione
del bucket e la prima esportazione notturna:

1. nel dashboard (R2 → `cosasimangia-backups` → `exports/`) c'è l'oggetto della notte e
   nei log del Worker `backup_export_done`, con CPU e durata;
2. download con la chiave completa dell'oggetto (che comincia già con `exports/`), da
   `server/`:
   `npx wrangler r2 object get "cosasimangia-backups/<chiave completa>" --remote --jurisdiction eu --file ../export.bin`;
3. `inspect` e ripristino in un ambiente di verifica locale con la chiave presa **dal
   gestore di password**, non dal secret; accesso e lettura come nella prova locale.

## Cosa uso e cosa produco

**Uso (su `main`):**

- `server/src/index.ts` e `wrangler.jsonc`: Cron Trigger orario e `runWeeklyJob` (W1);
- `server/src/db.ts` (`withDb`, `withDbOn`, `DbIdentity`), `log.ts` (`logEvent`),
  `menu/generation.ts` (`errorCode`), `env.ts`;
- ruoli `app_server` e schema `app` (PR #4), fixture e `support/db.ts` dei test del
  server, CI con Postgres locale (PR #5).

**Produco:**

- migrazione `20261012100000_backup.sql` (ruolo `app_backup`, funzione
  `app.backup_auth_rows()`), nessuna tabella o colonna nuova o cambiata; test
  `supabase/tests/backup_test.sql`;
- `server/src/backup/` (`format.ts`, `read.ts`, `export.ts`, `restore.ts`) e
  `server/src/scheduled.ts`;
- `scripts/backup/restore.ts`, `scripts/backup/migrations-commit.ts`;
- `server/test/drill/restore-drill.test.ts`, `server/vitest.drill.config.ts`, script
  `test:drill` in `server/package.json`;
- **modifiche a file condivisi, minime:** `server/src/index.ts` (lo `scheduled`
  delega a `dispatchScheduled`), `server/src/db.ts` (`case 'backup'`),
  `server/src/env.ts` (tre campi), `server/wrangler.jsonc` (cron, binding R2, var),
  `server/vitest.config.ts` (esclusione di `test/drill/`), `server/package.json`
  (script), `.github/workflows/ci.yml` (ultimo passo `test:drill`),
  `supabase/tests/coverage_test.sql` (una riga), `supabase/README.md` (ruolo e
  procedura), `server/.env.example` e `server/README.md` (chiave locale e prova del cron
  notturno).

Interfaccia per altre attività: nessuna. Chi aggiunge una tabella in `app` non deve
fare nulla; chi aggiunge una colonna `xid8`, una sequenza o righe inserite da una
migrazione fa fallire un test che rimanda a questa spec.

## Test

**Unità (Vitest, senza database):**

- `server/src/backup/format.test.ts`: andata e ritorno; chiave sbagliata,
  identificativo sconosciuto, magia o versione errate, intestazione alterata (dato
  autenticato) e byte alterati rifiutati; chiavi diverse da 32 byte rifiutate; IV
  diversi a ogni codifica; elenco di chiavi.
- `scripts/backup/migrations-commit.test.ts`: in un repository Git temporaneo con due
  commit (il secondo aggiunge una migrazione), l'elenco delle migrazioni del primo trova
  il primo commit, quello del secondo il secondo, un elenco sconosciuto nessuno.
- `server/test/scheduled.test.ts`: espressioni uguali a `wrangler.jsonc`; smistamento;
  espressione sconosciuta registrata senza eccezioni.

**Con il database (Vitest, `server/test/backup.test.ts`, R2 finto in memoria con
pagine da 2 oggetti):**

- fotografia: tutte le tabelle e i conteggi; **scrittura concorrente** fra due letture
  della stessa transazione (una famiglia inserita e confermata da un'altra connessione
  dopo la prima lettura non compare: il test fallisce senza `repeatable read`);
  scrittura negata nell'identità `backup`;
- esportazione: oggetto cifrato con metadati; salto alle 04:30; conservazione delle
  ultime 7 su più pagine; `put` fallito senza cancellazioni; `delete` fallito con
  esportazione riuscita; configurazione mancante; **limite**: con un limite piccolo
  nessuna lettura delle righe, nessun oggetto e log `backup_export_too_large`;
- ripristino in transazione annullata sul database dei test, preparato emulando lo
  stato dopo le migrazioni (svuotamento e riga iniziale di `catalogue_state`): rifiuti
  per formato, tabelle, colonne, migrazioni, destinazione non vuota (anche
  `catalogue_state` cambiata), orfani; `verifyRestored` segnala una mutazione dopo il
  ripristino in una tabella senza marcatori (numero oltre la precisione di JavaScript
  cambiato di 1), in una con marcatori e in `auth.users` (elemento aggiunto a un array
  annidato dei metadati); **marcatori**: con un documento il cui `data_version_xid`
  coincide con la transazione del ripristino, una scrittura successiva nella stessa
  transazione fa crescere `data_version`.

**Prova in CI (`server/test/drill/restore-drill.test.ts`)**, con la CLI vera su una
destinazione preparata con `supabase db reset --no-seed`:

- fixture comprese una riga di `ingredient_unit_equivalences` (colonna generata), numeri
  adiacenti oltre la precisione di JavaScript in jsonb, metadati di Auth con array e
  oggetti annidati;
- `inspect` riuscito;
- destinazione con una migrazione in più (archivio precedente) rifiutata con
  `migrations`;
- caricamento che fallisce dopo inserimenti parziali (valore con una sentinella che
  viola un `check` di `app.families`): uscita 1, nessuna sentinella in stdout e stderr,
  destinazione invariata;
- `--dry-run` riuscito e destinazione invariata;
- `restore` riuscito; rilettura identica alla fotografia d'origine (marcatori esclusi,
  e `NULL`); una scrittura dopo il ripristino fa crescere `data_version`.

## Decisioni da riportare nella specifica

**Prodotto:**

- Le esportazioni notturne comprendono dati delle famiglie, catalogo e account (email
  e password cifrate da Supabase); dopo un ripristino da esportazione tutti rifanno
  l'accesso e ricollegano gli agenti (sezione 8, «Storico e backup»; sezione 15,
  «Backup e ripristino»).
- Perdita massima di circa un giorno con un secondo tentativo nella stessa notte
  (sezione 8).
- Collaudo in due prove: locale completa (criterio di fine della PR) e di produzione
  con la chiave dal gestore di password (voce separata, a carico dell'utente)
  (sezioni 8 e 9).

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
- Limite di dimensione misurato in workerd (picco sotto 64 MB), controllato con una
  stima del database prima di leggere le righe; oltre il limite nessuna esportazione e
  log di errore (sezione 8).
- Ripristino con la CLI `scripts/backup/restore.ts` in un database appena migrato
  (righe iniziali delle migrazioni elencate), in modalità `replica`, contatori
  conservati e marcatori `xid8` azzerati, verifica di chiavi esterne e confronto esatto
  prima del commit; commit delle migrazioni ricavato dall'elenco contenuto
  nell'esportazione; configurazioni dipendenti dal progetto elencate in ordine;
  procedura in `supabase/README.md` (sezioni 1, 8 e 9).
- Prova di ripristino in CI con destinazione reale (sezione 9).
- Email di allarme sui fallimenti dell'esportazione nell'ondata 3, insieme a quelle del
  job (sezioni 4 e 15).
- Correzione: un Cron Trigger ha fino a 15 minuti di CPU sul piano a pagamento (già
  scritto nella sezione 4).
- Chiude in sezione 15, «Backup e ripristino»: strumento, conservazione, cifratura,
  limite e procedura tecnica; restano i tempi di recupero misurati con un'esportazione
  vera.
