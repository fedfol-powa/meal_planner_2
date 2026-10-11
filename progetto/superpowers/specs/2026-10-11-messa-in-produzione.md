# Messa in produzione: spec di dettaglio

Creata: 11 ottobre 2026 · Corretta dopo la review avversariale (16 rilievi,
`progetto/coordinamento/revisioni/w6-produzione-spec-piano.md`) · Attività: messa in
produzione (W6, branch `traguardo/messa-in-produzione`) · Subordinata a
`progetto/superpowers/specs/2026-09-29-app-famiglia-design.md` (sezioni 1, 2, 4, 8, 9,
10, 11, 13) e al piano generale `progetto/superpowers/plans/2026-10-11-piano-generale.md`.

Porta il traguardo A in produzione per la famiglia di Federico: risorse di Cloudflare e
Supabase, migrazioni, primo rilascio, import del ricettario e dei dati della famiglia,
collaudo sull'iPhone, agenti, ritorno indietro e rotazione finale delle password. Le
scelte sono state concordate con il coordinatore e con l'utente nel brainstorming
dell'11 ottobre 2026; le decisioni del coordinatore sui tre punti aperti della review
sono nelle sezioni 5 e 6.

**In questa fase nessuna operazione sulla produzione.** Il progetto Supabase
`lronuqvtjdhfyychnscr` (produzione, confermato dall'utente l'11 ottobre) e l'account
Cloudflare di POWA si toccano solo eseguendo il runbook del piano, dopo l'approvazione
dell'utente, passo per passo.

## 1. Chi fa cosa

| Chi | Cosa |
|---|---|
| **Utente** | Passi nelle dashboard di Supabase e Cloudflare (Data API, chiave pubblica, certificato del database, OAuth server, URL del sito, pool); creazione degli account (password dei familiari); file delle credenziali; chiave delle esportazioni nel gestore di password e `! npx wrangler secret put`; «vai» dopo ogni anteprima; collaudo sull'iPhone; rotazione finale delle password; `! npx wrangler login` e `! supabase login` se servono |
| **Coordinatore** | Lancia `scripts/prod-sql.sh` (famiglia, azzeramento, rimozione della famiglia, controlli in sola lettura), lo script di caricamento, `npm run release`, i comandi `wrangler` (Hyperdrive, bucket, `tail`, `rollback`, `delete`); sempre dopo un'anteprima mostrata all'utente e il suo «vai». Unisce le PR di configurazione |
| **Worker (W6)** | In implementazione: script di caricamento, `npm run release`, `scripts/prod-sql.sh` e gli SQL di servizio, documenti, PR di configurazione; prove sullo stack locale e in CI. In produzione non lancia nulla |

**Anteprima legata a ciò che si applica.** Ogni scrittura in produzione ha un'anteprima
che non scrive e stampa un'**impronta** di ciò che verrà applicato; l'applicazione
richiede quell'impronta e si rifiuta, senza scrivere, se è cambiata:

| Operazione | Anteprima | Applicazione |
|---|---|---|
| Rilascio | `npm run release -- --preview` → commit `<sha>` | `npm run release -- --apply <sha>` |
| SQL sulla produzione | `scripts/prod-sql.sh --preview <file>` → SHA-256 del file | `scripts/prod-sql.sh --apply <file> --confirm <sha256>` |
| Caricamento | `load.ts … --dry-run` → impronta degli input | `load.ts … --confirm <impronta>` |

Il coordinatore mostra l'esito all'utente e procede solo con il suo «vai».

## 2. Credenziali, bersaglio e trasporto

- **File:** `.env.production.local` nella radice del checkout principale
  (`/Users/fedfol/Projects/meal_planner_2/`), scritto dall'utente con il suo editor.
  Coperto da `.env.*` del `.gitignore`; l'eccezione nuova è esattamente
  `!web/.env.production` e non lo include (controllo con `git check-ignore --no-index`,
  senza creare file).
- **Contenuto:**

  | Variabile | Uso |
  |---|---|
  | `POSTGRES_DATABASE_URL` | migrazioni (`supabase db push --db-url`), `scripts/prod-sql.sh`: Session pooler, porta 5432, database `postgres`, utente `postgres.<ref>` |
  | `APP_SERVER_DATABASE_URL` | script di caricamento: Session pooler, porta 5432, database `postgres`, utente `app_server.<ref>` |
  | `APP_SERVER_PASSWORD` | solo per le opzioni `--origin-password` di `wrangler hyperdrive create/update` (stessa password della riga sopra) |

  Entrambe le URL terminano con
  `?sslmode=verify-full&sslrootcert=/Users/fedfol/.config/cosasimangia/supabase-ca.crt`:
  il certificato si scarica da Dashboard › Database › Settings › *SSL Configuration*
  e si salva in quel percorso (cartella creata dall'utente).
- **Regola per chi esegue:** il file si carica solo dentro il comando che lo usa (gli
  script lo leggono da soli; per `wrangler hyperdrive` `set -a; . <file>; set +a;
  <comando>` nella stessa riga). Mai `cat`, `echo`, `env`, `printenv` o `set -x`; gli
  script non stampano mai stringhe di connessione né password, nemmeno negli errori (si
  stampano solo ruolo, host, porta e database) e filtrano l'output dei comandi figli
  togliendo ogni occorrenza della password.
- **Progetto di destinazione, un solo punto:** `scripts/production-target.json`
  (versionato, nessun segreto) contiene `{ "supabaseRef": "lronuqvtjdhfyychnscr" }`.
  Caricamento, `prod-sql.sh` e `release` lo leggono; cambiarlo (ripristino su un
  progetto nuovo, sezione 8) richiede una PR revisionata, mai un'opzione da riga di
  comando.
- **Controllo del bersaglio** (prima di collegarsi, uguale per i tre strumenti):
  protocollo `postgres:`/`postgresql:`; utente esattamente `<ruolo atteso>.<ref>`
  (`postgres` o `app_server`); host che termina in `.pooler.supabase.com`, uno solo;
  porta 5432; database `postgres`; fra i parametri solo `sslmode=verify-full` e
  `sslrootcert`. Qualsiasi altro parametro (`ssl`, `sslmode` diverso, opzioni del
  client) è un rifiuto. Con `--local` (solo prove) l'host è `127.0.0.1` o `localhost`,
  senza parametri TLS.
- **TLS verificato:** le connessioni remote usano TLS con verifica di catena e nome
  dell'host, come la CLI di ripristino di W5: si riusa `destinationOf` di
  `scripts/backup/cli.ts`, che consuma `sslmode`/`sslrootcert` e passa a Postgres.js
  `ssl: { rejectUnauthorized: true, ca }`. Un server senza TLS fa fallire la
  connessione, mai una ricaduta in chiaro. `psql` (in `prod-sql.sh`) riceve gli stessi
  parametri, con la cartella del certificato montata in sola lettura; la CLI di
  Supabase riceve la URL verificata con `--db-url`.
- **La copia compilata di `bootstrap.sql`** (email e nomi dei familiari) non entra mai
  nel repository: sta in `~/.config/cosasimangia/bootstrap.production.sql`.
- **Dopo il collaudo** l'utente cambia le password (sezione 9).

## 3. Fasi e dipendenze

| Fase | Contenuto | Dipende da |
|---|---|---|
| **1. Infrastruttura senza famiglia** | Prerequisiti, certificato e file delle credenziali, password di `app_server`, Hyperdrive, **bucket e chiave delle esportazioni**, PR di configurazione, primo rilascio, segreto della chiave, accesso di prova | Ciò che è su `main` (ondata 1, revisione dei pasti, esportazione in R2 unita con la #30 e la #32, bozze nell'app), più la PR di questa attività |
| **2. Import e avvio della famiglia** | Prova delle esportazioni, account, famiglia, caricamento, primo collaudo, collaudo completo | Fase 1; prima esportazione notturna verificata (spec di W5, sezione 6) |
| **3. Agenti** | Chiave pubblica nel Worker, OAuth server, URL del sito, rilascio, prova della revoca e del ricettario tramite agente | Collegamento degli agenti (W2) unito; subito dopo l'avvio della famiglia |
| **Chiusura** | Rotazione delle password, esito registrato | Fasi 1–3 completate |

Il codice su `main` dopo la #30 contiene già il binding `BACKUPS` al bucket
`cosasimangia-backups` (giurisdizione `eu`) e il cron notturno `30 2,4 * * *`: la spec di
W5 (sezione 5) chiede di creare il bucket prima della prima pubblicazione successiva al
merge. Per questo **bucket e chiave entrano nella fase 1, prima del primo rilascio**; la
prova di produzione delle esportazioni resta nella fase 2, prima dell'import. Il
rilascio controlla i prerequisiti del codice che pubblica (sezione 7) e si ferma se ne
manca uno.

La fase 1 scopre i problemi di Hyperdrive, chiavi e build senza dati veri ed è
smontabile senza perdite. La fase 2 rispetta la sezione 8 della specifica (esportazione
definita e provata prima dell'uso del catalogo in produzione).

**Spec a cui il runbook rimanda:**

- esportazione in R2, `progetto/superpowers/specs/2026-10-11-esportazione-r2.md`, unita:
  sezioni «4. Ripristino», «5. Passi esterni» e «6. Collaudo»;
- collegamento degli agenti, `progetto/superpowers/specs/2026-10-11-collegamento-agenti.md`
  sul branch `traguardo/collegamento-agenti`, **non ancora unita**: sezione «Passi
  esterni per la produzione (li fa l'utente)». La fase 3 dipende dal suo merge;
- revisione dei pasti (W1) e bozze nell'app (PR #26): unite, nessun passo esterno.

Al momento di ogni fase il coordinatore rilegge la sezione richiamata sulla versione
unita: se è cambiata, vale quella.

## 4. Fase 1: infrastruttura senza famiglia

Passi richiamati dal Task 10 del piano della piattaforma
(`progetto/superpowers/plans/2026-10-11-piattaforma.md`, «Risorse di produzione e prima
pubblicazione») e dalla spec della piattaforma, sezione 6, «Passi di produzione»;
questa spec li ordina e ne decide gli esecutori. I comandi esatti sono nel runbook del
piano (R1–R13).

1. **Prerequisiti, in sola lettura:** `wrangler whoami` (account POWA),
   `supabase projects list` (`lronuqvtjdhfyychnscr`), JWKS con una chiave `ES256` o
   `RS256`, Data API con *Exposed schemas* solo `public` e `graphql_public` (passo 4
   della spec di W2, indipendente dal suo merge).
2. **Certificato e file delle credenziali** (utente): certificato del database in
   `~/.config/cosasimangia/supabase-ca.crt`; `POSTGRES_DATABASE_URL` nel file. Verifica:
   `prod-sql.sh` con un file di sola lettura risponde dal progetto giusto.
3. **Pool e password di `app_server`** (utente): dimensione del pool; password con
   `openssl rand -hex 24`, impostata nell'editor SQL; `APP_SERVER_DATABASE_URL` e
   `APP_SERVER_PASSWORD` nel file. Verifica: caricamento con `--check-connection`.
4. **Hyperdrive** (coordinatore): limite = pool − 5, almeno 5, con le opzioni
   `--origin-*` esplicite (nessuna URL con parametri TLS passata a Hyperdrive).
5. **Bucket e chiave delle esportazioni** (spec di W5, sezione 5, passi 1–2): bucket
   `cosasimangia-backups` in giurisdizione `eu`; chiave generata dall'utente e
   conservata nel gestore di password. Il segreto si imposta al passo 8.
6. **PR di configurazione** (worker; merge del coordinatore), nessun valore segreto: id
   di Hyperdrive e `account_id` in `server/wrangler.jsonc`; `web/.env.production` con
   `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`; eccezione
   `!web/.env.production` nel `.gitignore` (già nella PR di questa attività).
7. **Primo rilascio** (coordinatore): `npm run release -- --preview`, «vai», `--apply
   <sha>` (sezione 7). Ritorno indietro: `wrangler delete` (sezione 8).
8. **Segreto della chiave** (utente, subito dopo il primo rilascio e prima delle 02:30):
   `! npx wrangler secret put BACKUP_ENCRYPTION_KEY` da `server/`. Da qui ogni
   anteprima di rilascio controlla che il segreto ci sia.
9. **Accesso di prova** (utente): crea il proprio account, entra dall'iPhone
   sull'indirizzo `workers.dev`: app vera, nessuna famiglia. Il coordinatore segue
   `wrangler tail` a un'ora piena (cron senza errori) e, la mattina dopo, i log
   dell'esportazione notturna (`backup_export_done`). **Alla fine l'utente fa «Esci»**.

## 5. Fase 2: import e avvio della famiglia

**Prerequisito:** prova di produzione delle esportazioni (spec di W5, sezione 6) dopo
la prima esportazione notturna: i backup funzionano prima che entrino dati veri.

**Finestra: da lunedì a mercoledì entro le 19.** Il cron orario crea la settimana
successiva di ogni famiglia da mercoledì alle 20:00 nel suo fuso
(`server/src/menu/job.ts`, `isNextWeekDue`); la generazione pigra crea la settimana
corrente alla prima lettura del menu (`ensureWeeks`, `server/src/menu/generation.ts`).

- Famiglia, caricamento e **primo collaudo** (sotto) si fanno di seguito, nella stessa
  giornata, da lunedì a mercoledì entro le 19; **nessun altro apre l'app** in
  quell'intervallo (Federico ha fatto «Esci» alla fine della fase 1).
- Il caricamento prende lo stesso lock della generazione (sezione 6): una generazione
  che parte durante il caricamento aspetta e poi trova settimane e impostazioni scritte.
- La settimana in corso, già pianificata nel progetto di origine, arriva come «menu in
  corso» (sezione 6); la successiva la genera l'app mercoledì alle 20, con impostazioni
  e storico presenti.
- **Da quel momento il vecchio flusso non pianifica più settimane.** Lo spegnimento del
  progetto di origine resta una decisione dell'utente (sezione 11 della specifica), ma
  due menu per la stessa settimana no.
- **Avvio che non termina nella finestra** (decisione del coordinatore): se il bootstrap
  riesce ma il caricamento o il primo collaudo non terminano entro le 19 del mercoledì,
  la famiglia ancora inutilizzata si rimuove con `supabase/scripts/remove-family.sql`
  (sezione 8: transazione, controllo dell'impronta, anteprima e «vai») e si ritenta in
  una finestra successiva. Niente sospensioni della generazione. Il catalogo caricato
  resta: il caricamento successivo lo ritrova e lo salta.

**Passi.**

1. **Account** (utente): per ogni familiare Authentication › Users › Add user (email,
   password, «Auto Confirm User»). L'account di Federico esiste dalla fase 1. L'utente
   dà al coordinatore per ognuno **email, nome, lingua e ruolo nella famiglia** (quello
   che chiede `bootstrap.sql`) e l'UID di Federico (colonna UID della dashboard, per
   `--curator`), mai le password.
2. **Famiglia** (coordinatore): copia compilata di `supabase/scripts/bootstrap.sql` in
   `~/.config/cosasimangia/bootstrap.production.sql`: UUID della famiglia generato una
   volta e annotato nel registro; Federico `family_admin` con ruoli globali
   `app_admin` e `recipe_curator` (sezione 2 della specifica: l'amministratore
   dell'app è Federico); gli altri `member` o `family_admin` come indicato. Anteprima
   con `prod-sql.sh --preview`, «vai», `--apply --confirm <sha256>`. Un rilancio non
   cambia la famiglia esistente e **riallinea** nome, lingua e ruolo delle persone ai
   valori del file (comportamento di `bootstrap.sql`): la verifica è un secondo
   `--preview` che mostra l'avviso «family already exists» e le stesse righe. Ritorno
   indietro: `remove-family.sql`.
3. **Caricamento** (coordinatore): `--dry-run` con conteggi, report e impronta degli
   input all'utente; «vai»; caricamento con `--confirm <impronta>` (sezione 6). Lo
   script stampa alla fine l'**impronta dei dati** (sezione 8), che il coordinatore
   annota nel registro: è la condizione per rimozione e azzeramento. Verifica: un
   secondo `--dry-run` dice «0 da creare» per ogni voce.
4. **Primo collaudo, in sola lettura** (Federico sull'iPhone, con il coordinatore, entro
   le 19): accesso; menu della settimana corrente uguale al PDF del progetto di origine
   (ricette, porzioni, testi liberi); ricettario (numero di ricette come nel report,
   ricette dei libri visibili, sezione Bozze); impostazioni uguali alla tabella di
   `supabase/README.md`. Nessuna modifica. Il piano verifica in locale che queste
   letture non cambino l'impronta (se una lettura scrive, esce dal primo collaudo). Se
   fallisce o non finisce entro le 19: rimozione della famiglia, correzione, nuova
   finestra.
5. **Collaudo completo** (familiari con il coordinatore, dopo il primo collaudo):
   tabella sotto. Da qui la famiglia usa l'app: niente più rimozione né azzeramento,
   solo i ritorni indietro «dopo l'avvio» (sezione 8).

**Collaudo completo.** «CI» indica ciò che i test automatici già coprono; il collaudo
lo verifica sul Worker pubblicato, sull'iPhone e con dati veri.

| Area | Controllo | Risultato atteso | Già in CI |
|---|---|---|---|
| Accesso | Ogni familiare entra | Federico amministratore della famiglia, curatore, `app_admin`; gli altri col ruolo indicato | ruoli e policy |
| Voti | Due familiari votano la stessa ricetta pubblicata | Il voto di ciascuno resta suo; la media della famiglia nel ricettario cambia di conseguenza | media e permessi |
| Revisione dei pasti | «Cambia ricetta» su un pasto futuro, poi annulla | Il pasto torna com'era; la spesa segue | sì, su server locale |
| Spesa | Lista della settimana; spunta online; spunta con l'iPhone offline, poi di nuovo online | Dopo il ritorno online la spunta compare **su un secondo accesso** (altro familiare o browser) | coda offline nel browser simulato |
| Condividi | «Condividi» della lista della spesa e apertura in Bring! | La pagina pubblica mostra gli ingredienti; Bring! li importa | pagina pubblica |
| Lingua e unità | Un familiare passa a inglese britannico e unità imperiali, poi torna | Testi e quantità cambiano; nessun dato perso | traduzioni e conversioni |
| PWA | Installazione sulla schermata Home; riapertura; riapertura offline | L'app si apre anche offline con l'ultimo menu | service worker |
| Prima generazione | Giovedì, **prima di aprire il menu**: `supabase/scripts/check-first-generation.sql` con `prod-sql.sh --preview` | Riga di `app.weekly_jobs` per la settimana successiva con `status = done` (il job la crea solo se la settimana non esiste: la generazione pigra non la lascia) e `generated_at` fra mercoledì 20:00 e 21:00 ora di Roma; poi nell'app la settimana rispetta le impostazioni (pizza domenica a pranzo, cena libera sabato, pesce il venerdì, porzioni) e non ripete il menu in corso | job e generazione |
| Esportazione | La notte dopo il caricamento | Oggetto in `exports/` più grande dei precedenti e `backup_export_done` nei log | esportazione e ripristino |

Il ricettario tramite agente si collauda nella fase 3. Esito in `server/README.md`
(«Risorse di produzione») e nel registro del coordinamento. Un controllo fallito porta
al ritorno indietro (sezione 8).

## 6. Script di caricamento

**File:** `scripts/import/load.ts` (comando), con moduli e test in
`scripts/import/load/`. Non modifica file di altre aree: importa
`scripts/import/import-recipes.ts` (`runImport`), `scripts/import/inputs.ts`
(`readInputs`), `scripts/import/family.ts` (`buildFamilyData`),
`scripts/planner-data/origin.ts`, `scripts/planner-data/family.ts`
(`curatorFamilySettings`), `@app/domain/recipe` (`resolveReferences`),
`server/src/catalogue/write.ts`, `server/src/catalogue/ingredients.ts`
(`setEquivalence`), `server/src/family/settings-writes.ts` (`writeSettingsKey`),
`server/src/menu/generation.ts` (`lockFamilyWeeks`), `scripts/backup/cli.ts`
(`destinationOf`).

**Uso** (eseguito con `node` direttamente, TypeScript a sola cancellazione dei tipi:
niente sintassi non cancellabile, come impone `erasableSyntaxOnly`):

```bash
node scripts/import/load.ts --env-file <file> --today <YYYY-MM-DD> --family <uuid> --curator <uuid> --dry-run [--local]
node scripts/import/load.ts --env-file <file> --today <YYYY-MM-DD> --family <uuid> --curator <uuid> --confirm <impronta> [--local]
node scripts/import/load.ts --env-file <file> --check-connection [--local]
```

- `--today` obbligatorio, come per l'import (decide le settimane concluse).
- `--curator` è l'UUID dell'utente (i profili non hanno l'email): deve avere
  `recipe_curator` ed essere `family_admin` di `--family`, altrimenti rifiuto prima di
  scrivere.
- Legge `APP_SERVER_DATABASE_URL` dal file indicato (`process.loadEnvFile`), con il
  controllo del bersaglio e il TLS della sezione 2.
- `--dry-run` e `--confirm` sono alternativi e uno dei due è obbligatorio: non esiste
  un caricamento senza anteprima.

**Impronta degli input.** Prima di collegarsi, lo script calcola uno SHA-256 su:
contenuto di tutti i file letti dell'origine (`ricettario/**`, `menu/**/menu.yaml`) e di
`scripts/import/*.yaml`, commit `HEAD` del repository, `--today`, `--family`,
`--curator`, ruolo, host e database di destinazione. `--dry-run` la stampa;
`--confirm` la ricalcola e, se diversa, si ferma **senza collegarsi** («inputs changed
since the preview: run --dry-run again»). Così l'approvazione vale per gli input
mostrati.

**Una transazione sola.** Tutto il caricamento è una transazione su una connessione
diretta (`postgres`, `max: 1`): o entra tutto o niente. `--dry-run` esegue lo stesso
codice e chiude con `rollback`; l'anteprima riporta quindi i conteggi veri, con gli
stessi controlli delle scritture. Ruoli nella transazione:

1. `set_config('request.jwt.claims', …, true)` con i claim del curatore (`sub`,
   `role: authenticated`, `session_id` generato, `exp`) e `set local role
   authenticated`; attore `{ userId: curator, channel: 'import' }`. `session_is_active`
   lo controlla solo il percorso del server, non `write.ts` né le policy usate qui
   (come in `server/test/catalogue/import-writes.test.ts`).
2. Per settimane e pasti: `reset role` e `set local role app_job`, perché storico e
   menu in corso possono citare bozze (il trigger `check_meal_slot_recipe` le rifiuta
   per `authenticated`).

**Concorrenza.** Subito dopo il controllo del curatore, prima di qualsiasi lettura che
decide cosa scrivere: `lockFamilyWeeks(tx, familyId)` (lo stesso advisory lock della
generazione, fino alla fine della transazione), poi `select settings from
app.families where id = … for update` (la riga resta bloccata fino al commit, quindi
nessuna modifica delle impostazioni fra lettura e scrittura). Ordine dei lock: advisory
della famiglia, poi riga della famiglia; la generazione prende solo l'advisory e le
scritture delle impostazioni solo la riga, quindi non c'è ciclo. Una generazione
concorrente aspetta il commit e poi trova le settimane già scritte; una scrittura
concorrente nel catalogo (stesso slug) fa fallire il caricamento per unicità, senza
effetti: si rilancia.

**Ordine delle scritture.**

1. **Libri e ingredienti** con `createBook` e `createIngredient`, slug del bundle
   conservati; uno slug già presente si salta (`created: false`).
2. **Equivalenze** da `readInputs(...).equivalences`. Si cerca per **chiave logica**
   (ingrediente, `scope = 'recipe'`, dimensione dell'unità di partenza, preparazione),
   la stessa di `setEquivalence`. Se esiste, si salta **qualunque valore abbia**: se è
   diversa dall'input (un curatore l'ha cambiata) va nel report come «divergente,
   conservata». `setEquivalence` si chiama solo se manca.
3. **Ricette:** per ognuna `resolveReferences`, poi `createDraft` con `originSlug` e
   `originType`. Le `publishable` si pubblicano con `publishDraft` **solo se
   `pendingReview` è vuoto**; altrimenti restano tutte bozze e il report lo dice in
   testa.
4. **Impostazioni** da `curatorFamilySettings()` con `writeSettingsKey`: porzioni,
   tempi e testi fissi per pasto e giorno, regole, quote note/nuove, intervalli dei
   gruppi (pesi esclusi). Si scrivono solo le chiavi diverse dai default di
   `resolveFamilySettings({})` e ancora assenti in `families.settings`.
5. **Limite sui cetrioli** in `family_ingredients` (`limit`, 1 a settimana); una riga
   esistente non si tocca.
6. **Libri posseduti:** tutti i libri citati dal ricettario d'origine, in
   `family_books` con `on conflict do nothing`; l'anteprima li elenca per titolo.
7. **Voti di Federico** (`familyScoresOf`) in `ratings` con `on conflict do nothing`,
   solo su ricette pubblicate o archiviate (policy `ratings_write`); quelli su bozze
   vanno nel report come «in sospeso».
8. **Ricette provate senza data** in `family_tried_recipes` con `source: 'import'`,
   `on conflict do nothing`; più le ricette scartate dai pasti doppi (sotto).
9. **Storico e menu in corso** come `app_job` (sotto).

**Dati della famiglia dall'intero ricettario d'origine.** Voti, provate e storico si
calcolano con `buildFamilyData` su tutte le schede d'origine, non sul bundle delle sole
schede nuove: un rilancio dopo la pubblicazione di una bozza aggiunge i voti rimasti in
sospeso. Le ricette si trovano per `origin_slug`.

**Storico.** Pasti di `buildFamilyData` (casi R4 invariati), raggruppati per settimana.
Porzioni dal `menu/<lunedì>/menu.yaml` dell'origine se c'è e nomina quella ricetta in
quel pasto, altrimenti dalle impostazioni di quel giorno e pasto. Settimane con
`generated_at` nullo, pasti con `updated_by` nullo.

**Due ricette nello stesso pasto storico** (decisione del coordinatore): il pasto prende
la prima per slug; l'altra entra fra le ricette provate (`family_tried_recipes`,
`source: 'import'`, se non c'è già) e nel report. L'informazione «l'abbiamo mangiata»
non si perde e non si inventa un pasto.

**Menu in corso** (caso nuovo, da riportare nella sezione 11). Per ogni
`menu/<lunedì>/menu.yaml` dell'origine con settimana non conclusa a `--today`
(domenica della settimana ≥ `--today`, la stessa regola di R4): una settimana dell'app
con tutti i suoi pasti, anche quelli dei giorni già passati. `ricetta` + `porzioni` →
pasto con ricetta; `libero` → testo libero, con le porzioni delle impostazioni di quel
giorno e pasto; pasto mancante → nessuna riga. Le note per pasto dell'origine (dosi
concordate per il vecchio PDF) non si importano nella colonna `note`, perché l'app
ricalcola le dosi: sono elencate nel report. Una scheda citata ma assente dal
ricettario dell'app è un errore che ferma il caricamento. Questi pasti non sono
«mangiati»: diventano storico per il pianificatore quando passano.

**Preferenze condizionali** (decisione del coordinatore). Le note delle schede
d'origine possono contenere preferenze che non sono un'esclusione globale (per esempio
`gamberi-zucchine-skottle`: «non proporla nelle cene per 4 (solo per i 2 adulti)»). Non
diventano esclusioni. Lo script cerca nelle note le frasi di preferenza (elenco di
espressioni nel codice: «non proporla», «non proporre», «non piace», «non piacciono»,
«solo per», «bambini», «evitare») e le elenca nel report e nell'anteprima sotto
«Preferenze da sistemare a mano», con ricetta e testo della nota. Nessuna perdita
silenziosa, nessun divieto più ampio; il coordinatore le legge con l'utente prima del
«vai».

**Rilanciabile, senza sovrascrivere.**

- Catalogo: slug, `origin_slug` ed equivalenze già presenti si saltano, qualunque
  valore abbiano; si rilancia anche dopo l'avvio (sezione 11 della specifica).
- Dati della famiglia: si aggiunge soltanto. Voti, provate, libri e limiti con `on
  conflict do nothing`; impostazioni solo dove la chiave è assente; una settimana già
  presente nell'app (generata o importata) si salta per intero.
- **Rifiuto:** se `families.settings` è ancora vuoto (primo caricamento) e la famiglia
  ha già una settimana con `generated_at` valorizzato, si ferma prima di scrivere: la
  prima generazione è avvenuta con i default. Il controllo avviene sotto i lock.

**Uscite.** Una riga di riepilogo in console e `scripts/import/out/load-report.md`. Il
report **incorpora il report dell'import** (`runImport(...).files['report.md']`:
bozze con i motivi, righe da mappare, ricette di casa con URL e ricette provate senza
data dei casi R4, storico non importato, schede già presenti) e vi aggiunge in testa:
modalità, impronta degli input, pubblicazione bloccata, conteggi delle scritture
(creati, già presenti, in sospeso), equivalenze divergenti, voti in sospeso, libri
posseduti, ricette dello storico assenti, pasti doppi passati fra le provate, note del
menu in corso non importate, preferenze da sistemare a mano. Nessuna stringa di
connessione. Dopo un caricamento scritto stampa anche l'impronta dei dati (sezione 8).

**`--check-connection`:** si collega con lo stesso controllo del bersaglio e TLS e
stampa numero di famiglie e ricette visibili ad `app_job`; non scrive.

## 7. Rilascio: `npm run release`

`scripts/release.ts`, script `release` nel `package.json` della radice; nessuna libreria
nuova (`node:child_process` senza shell, `fetch`). Legge le credenziali con
`--env-file <file>` (default il file della sezione 2). Lanciato dal coordinatore in due
tempi.

**`--preview`** (non scrive nulla in produzione):

1. **Repository:** branch `main`, albero pulito, `HEAD` uguale a `origin/main` dopo
   `git fetch`; CI verde sul commit (`gh run list --commit <sha> --workflow ci.yml`).
2. **Un solo progetto per tutto:** il ref di `scripts/production-target.json` coincide
   con: utente di `POSTGRES_DATABASE_URL` (controllo del bersaglio, sezione 2), host di
   `VITE_SUPABASE_URL` in `web/.env.production`, `SUPABASE_URL` dei `vars` di
   `server/wrangler.jsonc`. Se esiste `supabase/.temp/project-ref` (un `supabase link`
   fatto a mano) deve coincidere anch'esso, altrimenti rifiuto: nessuna ambiguità su
   dove vanno le migrazioni.
3. **Configurazione del Worker** (`server/wrangler.jsonc`, letto togliendo le righe di
   commento): `account_id` presente; id di Hyperdrive diverso dal segnaposto di zeri;
   ogni bucket di `r2_buckets` esistente (`wrangler r2 bucket info <nome>
   --jurisdiction <giurisdizione>`); ogni segreto richiesto da
   `scripts/release.config.json` (`requiredSecrets`, oggi `BACKUP_ENCRYPTION_KEY`)
   presente in `wrangler secret list`. Al **primo rilascio** (nessuna versione
   pubblicata) i segreti non si possono ancora controllare: l'anteprima lo dice e
   l'applicazione termina con il passo obbligatorio «`wrangler secret put …` prima
   delle 02:30».
4. **Build della SPA con valori fissati:** rifiuto se esistono `web/.env.local`,
   `web/.env.production.local` o variabili `VITE_*` nell'ambiente del processo; i due
   valori di `web/.env.production` devono essere valorizzati, senza segnaposto, con
   l'URL `https://<ref>.supabase.co` e una chiave `sb_publishable_…`. La chiave si
   prova in sola lettura: `GET https://<ref>.supabase.co/auth/v1/settings` con
   `apikey: <chiave>` → 200. Poi `npm run build -w web` con l'ambiente ripulito dalle
   `VITE_*` e i due valori passati esplicitamente; `web/dist` deve contenere **sia**
   l'URL **sia** la chiave esatti; poi `wrangler deploy --dry-run --outdir <tmp>` da
   `server/` (il bundle del Worker si costruisce).
5. **Migrazioni:** `supabase db push --dry-run --db-url <POSTGRES_DATABASE_URL
   verificata>`: la CLI va dove indica la URL controllata, mai sul progetto «collegato».
   La password non passa nell'argomento se la CLI la accetta da `PGPASSWORD` (verificato
   sullo stack locale in implementazione); altrimenti resta nell'argomento di un
   processo locale e l'output è filtrato.
6. **Versione pubblicata:** `wrangler deployments list`, ultima voce (id, tag, data).
7. Stampa il commit da pubblicare e il comando `--apply <sha>`.

**`--apply <sha>`** (dopo il «vai»), sempre con lo SHA:

1. ripete **tutti** i controlli e la build dell'anteprima; si ferma se il commit non è
   `<sha>`. Un errore di build, chiave o configurazione si scopre qui, **prima di
   qualsiasi scrittura** in produzione;
2. `supabase db push --db-url …` (si salta se l'anteprima dice che il remoto è
   aggiornato);
3. `npm run deploy -w server -- --tag <sha> --message "release <sha>"`: la versione
   pubblicata porta il commit, che serve al ritorno indietro;
4. verifiche sull'indirizzo pubblicato: `GET /api/openapi.json` → 200; `GET
   /api/session/whoami` senza token → 401; `POST /mcp` senza token → 401; `GET
   /.well-known/oauth-protected-resource/mcp` → `resource` che termina in `/mcp`; `GET
   /menu` → 200 HTML; `GET /shopping-lists/000000000000000000000000000000000000000000000000`
   → 404, non 500. Il token è di **48 caratteri esadecimali**, il formato che
   `server/src/shopping/bring-page.ts` passa al database: la risposta attraversa
   Hyperdrive nel ruolo `anon` (con un token di altro formato la rotta risponde 404 senza
   interrogare il database e il controllo non proverebbe nulla).

L'indirizzo `workers.dev` si legge dall'output di `wrangler deploy` al primo rilascio e
si scrive in `scripts/release.config.json` (`productionUrl`, versionato, nessun
segreto) con una PR; finché manca, `--apply` stampa l'indirizzo letto e fa le verifiche
su quello.

## 8. Ritorno indietro

| Cosa va male | Come si torna indietro |
|---|---|
| **Primo rilascio** difettoso (non c'è una versione precedente) | `npx wrangler delete` da `server/` dopo anteprima (`wrangler deployments list` con una sola versione) e «vai»: Worker, indirizzo `workers.dev` e cron spariscono; Hyperdrive, bucket e database restano. Al nuovo primo rilascio si reimposta il segreto. Database senza famiglia: nulla da proteggere |
| Rilascio successivo difettoso | `npx wrangler rollback <version-id> --message "<motivo>"` alla versione con il tag dello SHA precedente (`wrangler versions list`). Prima, compatibilità dello schema: `git diff --name-only <sha precedente> <sha attuale> -- supabase/migrations` elenca le migrazioni applicate dopo; il ritorno è ammesso se sono tutte additive (nuove tabelle, colonne con default o nulle, funzioni nuove), altrimenti correzione in avanti |
| Migrazione sbagliata | Correzione in avanti con una migrazione nuova; niente migrazioni «down». In fase 1 il database è senza famiglia |
| Hyperdrive sbagliato | `wrangler hyperdrive update <id>` con le opzioni `--origin-*`, o `delete` e nuova creazione, poi PR con l'id |
| Avvio che non termina nella finestra, o primo collaudo fallito | `supabase/scripts/remove-family.sql` (sotto), correzione, nuova finestra |
| Caricamento riuscito ma sbagliato nel catalogo, **prima** del collaudo completo | `supabase/scripts/reset-app-data.sql` (sotto), correzione di script o YAML, famiglia e caricamento rifatti |
| Errore nei dati **dopo** l'avvio | Correzioni puntuali dall'app o dall'agente; per un danno grave, ripristino dall'esportazione in R2 (spec di W5, sezione 4) e cambio di progetto (sotto) |
| L'app non è usabile dalla famiglia | La famiglia torna al PDF del progetto di origine, che resta attivo (sezione 11): l'utente riprende a pianificare lì. I dati dell'app restano; si riprende con un nuovo passaggio di consegne a problema risolto |

**Impronta dei dati: la condizione «solo bootstrap e import».** Rimozione e azzeramento
non provano a riconoscere tutte le forme d'uso (voti modificati, voci libere della
spesa, impostazioni, libri, esclusioni, ingredienti, equivalenze, archiviazioni…): ne
dimenticherebbero qualcuna. Usano invece un'**impronta di tutto lo schema `app`**:
`pg_temp.app_fingerprint()`, definita in `supabase/scripts/app-fingerprint.sql`, MD5 per
tabella del testo di tutte le righe in ordine, combinato in ordine di nome della
tabella. Tabelle escluse, elencate nel file: `profile_preferences` (preferenze di
visualizzazione, nessun contenuto). Il caricamento la stampa subito dopo il commit (la
calcola nel ruolo `app_backup`, che legge tutto `app`); il coordinatore la annota nel
registro. Rimozione e azzeramento:

1. bloccano **tutte** le tabelle di `app` (`lock table … in exclusive mode` per la
   rimozione, `access exclusive` per l'azzeramento) prima di qualsiasi controllo: una
   scrittura concorrente aspetta e, dopo, trova i dati già rimossi;
2. calcolano l'impronta e la confrontano con quella annotata, passata come variabile
   (`--set expected_fingerprint=<impronta>`); se è diversa si fermano senza toccare
   nulla («app data changed since the load»). Qualsiasi scrittura dopo il caricamento,
   anche una sola, cambia l'impronta: nel dubbio si rifiuta.

**SQL sulla produzione: `scripts/prod-sql.sh`.**

```bash
scripts/prod-sql.sh --preview <file.sql> [--set nome=valore …]
scripts/prod-sql.sh --apply <file.sql> --confirm <sha256> [--set nome=valore …]
```

Sul Mac non c'è `psql`: lo script usa quello dell'immagine Postgres dello stack locale
(`public.ecr.aws/supabase/postgres`) con `podman run --rm -i` (`CONTAINER_CLI=docker`
in CI). Legge `POSTGRES_DATABASE_URL` dal file delle credenziali
(`PROD_CREDENTIALS`, default quello della sezione 2), ne controlla il bersaglio con lo
stesso modulo del caricamento e la passa al container solo come variabile d'ambiente;
monta in sola lettura `~/.config/cosasimangia` (certificato). Accetta solo file con
esattamente una riga `begin;` e una riga `commit;`. Prima del file invia sempre
`supabase/scripts/app-fingerprint.sql`. `--preview` sostituisce `commit;` con
`rollback;`, mostra l'output e stampa lo SHA-256 del file; `--apply` esige `--confirm`
con quello SHA e altrimenti non si collega. `--set` diventa `psql -v`. Variabili:
`PROD_CREDENTIALS`, `PROD_SQL_TARGET=local` (solo prove), `CONTAINER_CLI`.

**File SQL di servizio** (in `supabase/scripts/`, provati in CI su uno stack isolato):

- `app-fingerprint.sql`: la funzione dell'impronta;
- `show-fingerprint.sql`: stampa l'impronta (sola lettura);
- `remove-family.sql` (variabili `family_id`, `expected_fingerprint`): lock, confronto
  dell'impronta, `delete from app.families where id = :family_id` (a cascata settimane,
  pasti, membri, impostazioni, libri, provate; il catalogo e i voti di Federico
  restano, e il caricamento successivo li ritrova); conteggi di ciò che toglie;
- `reset-app-data.sql` (variabile `expected_fingerprint`): lock, confronto
  dell'impronta, `truncate app.families, app.recipes, app.ingredients, app.books
  cascade`; lascia schema, utenti, profili e ruoli globali;
- `check-first-generation.sql` (variabili `family_id`, `week_start`): riga di
  `weekly_jobs` e `generated_at` della settimana (sezione 5), sola lettura.

**Danno grave dopo l'avvio: ripristino su un progetto nuovo.** Segue la spec di W5,
sezione 4, «Configurazioni che dipendono dal progetto Supabase», con queste aggiunte
perché le protezioni di W6 seguano il cambio senza indebolirsi:

1. PR revisionata che cambia **insieme** `scripts/production-target.json`
   (`supabaseRef` nuovo), `SUPABASE_URL` in `server/wrangler.jsonc` e
   `web/.env.production` (URL e chiave pubblica nuovi). Il rilascio rifiuta qualsiasi
   combinazione incoerente (sezione 7, punto 2).
2. L'utente aggiorna `POSTGRES_DATABASE_URL` e `APP_SERVER_DATABASE_URL` nel file delle
   credenziali (utenti `postgres.<ref nuovo>` e `app_server.<ref nuovo>`, certificato
   del progetto nuovo); finché non lo fa, ogni strumento rifiuta.
3. Migrazioni (`release --preview` le mostra), ripristino con la CLI di W5,
   `wrangler hyperdrive update`, rilascio: nell'ordine di W5.
4. Il vecchio progetto non si cancella finché il nuovo non ha passato il collaudo.

## 9. Fase 3 e chiusura

**Fase 3, agenti** (dopo il merge di W2, subito dopo l'avvio della famiglia). Dalla
spec di W2, «Passi esterni per la produzione (li fa l'utente)»:

1. PR (worker o W2) con la chiave pubblica in `SUPABASE_PUBLISHABLE_KEY` dei `vars` di
   `server/wrangler.jsonc` (stesso valore di `web/.env.production`; il rilascio
   controlla che coincidano).
2. Utente: Authentication › OAuth Server (attivo, *Authorization path* `/authorize`,
   registrazione dinamica attiva); Authentication › URL Configuration, *Site URL* uguale
   all'indirizzo `workers.dev`, *Redirect URLs* con `<origine>/**`.
3. Coordinatore: `npm run release` (anteprima, «vai», applicazione).
4. Prove di W2 (suoi passi 3 e 10): collegamento di Claude Code, `session_whoami`,
   revoca con «Scollega». In più, **ricettario tramite agente** con Federico curatore:
   ricerca di una ricetta, creazione di una bozza, modifica, pubblicazione e
   archiviazione di una ricetta di prova; risultato atteso: la ricetta compare e poi
   sparisce dal ricettario nell'app, con canale `mcp` nelle versioni.

Al passaggio al dominio `cosasimangia.qunidi.it` (ondata 3) *Site URL* e *Redirect
URLs* vanno aggiornati: annotazione in `server/README.md`.

**Rotazione delle password** (ultimo passo, fatta dall'utente, in un'ora senza uso):

1. Utente: Dashboard › Database › Settings › *Reset database password*; aggiorna
   `POSTGRES_DATABASE_URL` nel file.
2. Utente: nuova password di `app_server` (`openssl rand -hex 24`, `alter role
   app_server with password '…'` nell'editor SQL); aggiorna `APP_SERVER_DATABASE_URL`
   e `APP_SERVER_PASSWORD`.
3. Coordinatore, subito dopo: `wrangler hyperdrive update <id>
   --origin-password="$APP_SERVER_PASSWORD"` con l'ambiente caricato. Fra il passo 2 e
   il 3 le connessioni nuove di Hyperdrive falliscono per pochi minuti.
4. Verifica: `GET /shopping-lists/000…000` (48 zeri) → 404; accesso e Menu sull'iPhone;
   il cron dell'ora successiva senza errori in `wrangler tail`; `--check-connection`;
   `prod-sql.sh --preview supabase/scripts/show-fingerprint.sql`.

**Esito** in `server/README.md`, «Risorse di produzione»: nomi delle risorse, limite di
connessioni scelto e perché, indirizzo `workers.dev`, procedura di rilascio, data del
collaudo, data della rotazione.

## 10. Documenti da allineare (in implementazione)

- `server/README.md`: «Pubblicazione» (con `npm run release`, non più «dopo che
  l'integrazione di Supabase ha applicato le migrazioni» né `npm run deploy` a mano) e
  «Risorse di produzione».
- `supabase/README.md`: «Passi remoti» (migrazioni dentro `npm run release`,
  `bootstrap.sql` con `scripts/prod-sql.sh` dal coordinatore, impostazioni scritte dal
  caricamento invece che dall'app) e una sezione «Impronta, rimozione della famiglia e
  azzeramento». La sezione di W5 «Esportazione notturna e ripristino» si richiama.
- La spec della piattaforma (sezione 7, «le migrazioni arrivano al merge») e la
  specifica principale non si toccano: vedi sotto.

## 11. Fuori perimetro

Dominio `cosasimangia.qunidi.it`, Resend, accesso con Google, inviti (ondata 3);
automazione della pubblicazione con GitHub Actions; ripristino completo provato in
produzione (lo prova W5 in un ambiente di verifica); spegnimento del progetto di origine
(decisione dell'utente); conversione automatica delle preferenze condizionali.

## Decisioni da riportare nella specifica

**Prodotto**

- **Menu in corso** (sezione 11): all'avvio l'import porta le settimane già pianificate
  nel progetto di origine e non concluse alla data dell'import come settimane e pasti
  dell'app (ricetta e porzioni, testi liberi), senza segnarle come mangiate; la prima
  settimana generata dall'app è la successiva. Da quel momento il vecchio flusso non
  pianifica più settimane. Decisione del coordinatore e dell'utente, 11 ottobre 2026.
- **Impostazioni della famiglia scritte dal caricamento** (sezioni 2 e 11): porzioni,
  tempi, pasti fissi, regole, limite sui cetrioli e libri posseduti (tutti i libri del
  ricettario d'origine) dalle regole del progetto di origine, prima che qualcuno apra
  l'app, perché la prima apertura genera il menu.
- **Preferenze condizionali dell'origine** (sezioni 8 e 11): non diventano esclusioni;
  l'import le elenca come «preferenze da sistemare a mano» con ricetta e nota.
  Decisione del coordinatore, 11 ottobre 2026.
- **Due ricette nello stesso pasto storico** (sezione 11, R4): il pasto prende la prima
  per slug, l'altra entra fra le ricette provate e nel report. Decisione del
  coordinatore, 11 ottobre 2026.
- **Avvio a finestra** (sezione 10): famiglia, caricamento e primo collaudo in sola
  lettura da lunedì a mercoledì entro le 19; se non terminano, la famiglia inutilizzata
  si rimuove e si ritenta. Decisione del coordinatore, 11 ottobre 2026.
- **Ritorno indietro per la famiglia** (sezione 11): finché il progetto di origine
  resta attivo, il ripiego è il PDF settimanale.

**Tecniche**

- **Pubblicazione** (sezioni 1, 10, 15): per il traguardo A a mano con `npm run release`
  in due tempi (anteprima con build, configurazione e prerequisiti verificati, poi
  applicazione dello stesso commit: migrazioni, deploy con il tag del commit, controlli),
  lanciato dal coordinatore dopo il «vai» dell'utente. Supera «automazione prima del
  traguardo A» (scelta dell'utente, 11 ottobre 2026); GitHub Actions si rivaluta quando
  i rilasci diventano frequenti.
- **Migrazioni sul progetto di produzione** (sezioni 1, 15): con la CLI di Supabase e
  `--db-url` verificata (`db push --dry-run`, poi `db push`) dentro `npm run release`,
  sempre prima del deploy del Worker. Chiude la voce «modo di applicare le migrazioni»
  della sezione 15; la spec della piattaforma (sezione 7) e `server/README.md` vanno
  allineati.
- **Esecuzione delle operazioni sulla produzione** (sezione 1): le lancia il
  coordinatore con le credenziali in `.env.production.local`, scritto dall'utente e
  letto solo dagli strumenti; anteprima con impronta e «vai» prima di ogni scrittura;
  connessioni con TLS verificato; progetto di destinazione in un solo file versionato;
  rotazione delle password a fine collaudo.
- **Variabili della build** (sezione 1): `web/.env.production` versionato con URL e
  chiave pubblica di Supabase; la build di rilascio rifiuta override locali.
- **Import nel database** (sezione 11): `scripts/import/load.ts`, una transazione con
  anteprima a rollback legata agli input, catalogo come curatore con canale `import`,
  storico e menu in corso nel ruolo `app_job`, lock della generazione, dati della
  famiglia calcolati sull'intero ricettario d'origine e scritti solo in aggiunta;
  nessun valore del catalogo già presente sovrascritto.
- **Avvio a fasi** (sezione 10): infrastruttura senza famiglia (con bucket e chiave
  delle esportazioni), poi import e avvio della famiglia (dopo l'esportazione provata),
  poi agenti.
- **Rimozione e azzeramento prima dell'uso** (sezione 8): ammessi solo se l'impronta di
  `app` è quella registrata dopo il caricamento, con tutte le tabelle bloccate.
