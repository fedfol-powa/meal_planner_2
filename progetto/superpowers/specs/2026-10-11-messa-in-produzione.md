# Messa in produzione: spec di dettaglio

Creata: 11 ottobre 2026 · Attività: messa in produzione (W6, branch
`traguardo/messa-in-produzione`) · Subordinata a
`progetto/superpowers/specs/2026-09-29-app-famiglia-design.md` (sezioni 1, 2, 4, 8, 9,
10, 11, 13) e al piano generale `progetto/superpowers/plans/2026-10-11-piano-generale.md`.

Porta il traguardo A in produzione per la famiglia di Federico: risorse di Cloudflare e
Supabase, migrazioni, primo rilascio, import del ricettario e dei dati della famiglia,
collaudo sull'iPhone, agenti, ritorno indietro e rotazione finale delle password. Le
scelte sono state concordate con il coordinatore e con l'utente nel brainstorming
dell'11 ottobre 2026.

**In questa fase nessuna operazione sulla produzione.** Il progetto Supabase
`lronuqvtjdhfyychnscr` (produzione, confermato dall'utente l'11 ottobre) e l'account
Cloudflare di POWA si toccano solo eseguendo il runbook del piano, dopo l'approvazione
dell'utente, passo per passo.

## 1. Chi fa cosa

| Chi | Cosa |
|---|---|
| **Utente** | Passi nelle dashboard di Supabase e Cloudflare (Data API, chiave pubblica, OAuth server, URL del sito, pool); creazione degli account (password dei familiari); file delle credenziali; «vai» dopo ogni anteprima; collaudo sull'iPhone; rotazione finale delle password; `! npx wrangler login` e `! supabase login` se servono |
| **Coordinatore** | Lancia migrazioni, `bootstrap.sql` e l'azzeramento (con `scripts/prod-sql.sh`), script di caricamento, `npm run release`, comandi `wrangler` (Hyperdrive, bucket, segreti su richiesta dell'utente, `tail`, `rollback`); sempre dopo un'anteprima mostrata all'utente e il suo «vai». Unisce le PR di configurazione |
| **Worker (W6)** | In implementazione: script di caricamento, `npm run release`, script di azzeramento, documenti, PR di configurazione; prove sullo stack locale. In produzione non lancia nulla |

**Anteprima prima di ogni scrittura in produzione.** Migrazioni:
`supabase db push --dry-run`. Famiglia e azzeramento: `scripts/prod-sql.sh --preview`
(transazione chiusa con `rollback`). Caricamento e azzeramento: `--dry-run`. Rilascio: `npm run release --
--preview`. Il coordinatore mostra l'esito all'utente e procede solo con il suo «vai».

## 2. Credenziali

- **File:** `.env.production.local` nella radice del checkout principale
  (`/Users/fedfol/Projects/meal_planner_2/`), scritto dall'utente con il suo editor.
  Coperto da `.env.*` del `.gitignore`; l'eccezione nuova è esattamente
  `!web/.env.production` e non lo include (controllo con `git check-ignore` nel piano).
- **Contenuto:**

  | Variabile | Uso |
  |---|---|
  | `SUPABASE_DB_PASSWORD` | CLI di Supabase (`db push`, `migration list`), che la legge dall'ambiente |
  | `POSTGRES_DATABASE_URL` | `scripts/prod-sql.sh` per `bootstrap.sql` e per l'azzeramento: Session pooler, porta 5432, utente `postgres.lronuqvtjdhfyychnscr` |
  | `APP_SERVER_DATABASE_URL` | script di caricamento e creazione di Hyperdrive: Session pooler, porta 5432, utente `app_server.lronuqvtjdhfyychnscr` |
  | `APP_SERVER_PASSWORD` | solo per `wrangler hyperdrive update` alla rotazione (stessa password della riga sopra) |

- **Regola per chi esegue:** il file si carica solo dentro il comando che lo usa
  (`node --env-file=<file> …` oppure `set -a; . <file>; set +a; <comando>` nella stessa
  riga). Mai `cat`, `echo`, `env`, `printenv` o `set -x`; gli script non stampano mai
  stringhe di connessione né password, nemmeno negli errori (si stampano solo host e
  utente).
- **Controllo del bersaglio:** script di caricamento, azzeramento e `release` si
  rifiutano di partire se la variabile che serve manca o se la stringa non punta al
  progetto atteso: utente che termina con `.lronuqvtjdhfyychnscr` e host del pooler di
  Supabase; con `--local`, solo `127.0.0.1` o `localhost`.
- **La copia compilata di `bootstrap.sql`** (email e nomi dei familiari) non entra mai
  nel repository: sta in `~/.config/cosasimangia/bootstrap.production.sql`, cartella
  creata dall'utente.
- **Dopo il collaudo** l'utente cambia le password (sezione 9).

## 3. Fasi e dipendenze

| Fase | Contenuto | Dipende da |
|---|---|---|
| **1. Infrastruttura senza famiglia** | Prerequisiti, migrazioni, password di `app_server`, Hyperdrive, PR di configurazione, primo rilascio, accesso di prova | Solo ciò che è su `main` oggi (ondata 1 e attività unite dell'ondata 2), più lo script di caricamento con `--check-connection` e `npm run release` di questa attività |
| **2. Import e avvio della famiglia** | Passi esterni dell'esportazione, rilascio, prova delle esportazioni, account, famiglia, caricamento, collaudo | Unite e pubblicate: revisione dei pasti (W1), esportazione in R2 (W5) con bucket, chiave e prima esportazione verificata, bozze nell'app (W3, PR #26); tutta questa attività unita |
| **3. Agenti** | Chiave pubblica nel Worker, OAuth server, URL del sito, rilascio, prova della revoca | Collegamento degli agenti (W2) unito; subito dopo l'avvio della famiglia |
| **Chiusura** | Rotazione delle password, esito registrato | Fasi 1–3 completate |

La fase 1 si può eseguire appena il piano è approvato e unita la PR di questa
attività: scopre i problemi di Hyperdrive, chiavi e build senza dati veri, ed è
smontabile senza perdite. La fase 2 rispetta la sezione 8 della specifica (esportazione
definita e provata prima dell'uso del catalogo in produzione).

**Spec ancora non unite a cui il runbook rimanda** (stato all'11 ottobre 2026):

- collegamento degli agenti, `progetto/superpowers/specs/2026-10-11-collegamento-agenti.md`
  sul branch `traguardo/collegamento-agenti`, sezione «Passi esterni per la produzione
  (li fa l'utente)»; le correzioni della review non sono ancora committate;
- esportazione in R2, `progetto/superpowers/specs/2026-10-11-esportazione-r2.md` sul
  branch `traguardo/esportazione-r2`, sezioni «5. Passi esterni» e «6. Collaudo»;
- revisione dei pasti (W1) e bozze nell'app (PR #26): nessun passo esterno.

Al momento di ogni fase il coordinatore rilegge la sezione richiamata sulla versione
unita: se è cambiata, vale quella.

## 4. Fase 1: infrastruttura senza famiglia

Passi richiamati dal Task 10 del piano della piattaforma
(`progetto/superpowers/plans/2026-10-11-piattaforma.md`, «Risorse di produzione e prima
pubblicazione») e dalla spec della piattaforma, sezione 6, «Passi di produzione»;
questa spec li ordina e ne decide gli esecutori.

1. **Prerequisiti, in sola lettura.**
   - `npx wrangler whoami` mostra l'account POWA (altrimenti `! npx wrangler login`
     dell'utente); `supabase projects list` mostra `lronuqvtjdhfyychnscr` (altrimenti
     `! supabase login`).
   - Chiavi asimmetriche: `curl -s https://lronuqvtjdhfyychnscr.supabase.co/auth/v1/.well-known/jwks.json`
     contiene una chiave con `alg` `ES256` o `RS256` (già vista dalla piattaforma; qui è
     un riscontro).
   - Data API (utente): Dashboard › Project Settings › Data API, *Exposed schemas* con
     solo `public` e `graphql_public` (passo 4 della spec di W2, indipendente dal suo
     merge).
2. **Migrazioni** (coordinatore, dopo `SUPABASE_DB_PASSWORD` nel file):
   `supabase link --project-ref lronuqvtjdhfyychnscr`, `supabase db push --dry-run`
   (anteprima: tutte le migrazioni di `main`), «vai», `supabase db push`. Verifica:
   `supabase migration list` con locale e remoto allineati; nessuna famiglia (il seed
   non si applica senza `--include-seed`). Ritorno indietro: correzione in avanti con
   una migrazione nuova; database vuoto, quindi nel caso peggiore lo si azzera.
3. **Pool e password di `app_server`** (utente): dimensione del pool in Dashboard ›
   Database › Connection pooling; password con `openssl rand -hex 24` (esadecimale, nulla
   da codificare nell'URL), impostata nell'editor SQL con
   `alter role app_server with password '<password>';`; `APP_SERVER_DATABASE_URL` e
   `APP_SERVER_PASSWORD` nel file. Verifica (coordinatore): script di caricamento con
   `--check-connection`, che risponde con il numero di famiglie e ricette (0 e 0).
4. **Hyperdrive** (coordinatore): limite = pool − 5, almeno 5 (minimo di Hyperdrive).

   ```bash
   set -a; . /Users/fedfol/Projects/meal_planner_2/.env.production.local; set +a; npx wrangler hyperdrive create cosasimangia --connection-string="$APP_SERVER_DATABASE_URL" --caching-disabled --origin-connection-limit=<N>
   ```

   Lanciato da `server/`. Verifica: `npx wrangler hyperdrive get <id>`. Ritorno
   indietro: `npx wrangler hyperdrive delete <id>`.
5. **PR di configurazione** (worker; merge del coordinatore), nessun valore segreto: id
   di Hyperdrive e `account_id` di POWA in `server/wrangler.jsonc`; `web/.env.production`
   con `VITE_SUPABASE_URL=https://lronuqvtjdhfyychnscr.supabase.co` e
   `VITE_SUPABASE_PUBLISHABLE_KEY` (chiave pubblica copiata dall'utente da Dashboard ›
   Project Settings › API Keys); eccezione `!web/.env.production` nel `.gitignore`.
   Vite legge il file da solo nella build di produzione.
6. **Primo rilascio** (coordinatore): `npm run release -- --preview`, «vai»,
   `npm run release -- --apply` (sezione 7). Verifica: i controlli di `--apply`, che
   comprendono i `curl` del passo 4 del Task 10. Ritorno indietro: `npx wrangler
   rollback`; al primo rilascio non c'è nulla da proteggere.
7. **Accesso di prova** (utente): crea il proprio account (Authentication › Users › Add
   user, «Auto Confirm User»); entra dall'iPhone sull'indirizzo `workers.dev`: app vera,
   nessuna famiglia, nessun menu. Il coordinatore segue `npx wrangler tail` a un'ora
   piena: il cron gira senza errori. **Alla fine l'utente fa «Esci»** (vedi sezione 5).

## 5. Fase 2: import e avvio della famiglia

**Prerequisiti.**

1. Passi esterni dell'esportazione (utente, comandi lanciati dal coordinatore su
   richiesta), dalla spec di W5, sezione 5: bucket `cosasimangia-backups` in
   giurisdizione `eu`, chiave generata e conservata nel gestore di password, `wrangler
   secret put BACKUP_ENCRYPTION_KEY`. Prima del rilascio che porta l'esportazione.
2. Rilascio (coordinatore) con le migrazioni delle attività unite.
3. Prova di produzione delle esportazioni (spec di W5, sezione 6) dopo la prima
   esportazione notturna: i backup funzionano prima che entrino dati veri.

**Finestra: da lunedì a mercoledì entro le 19.** Il cron orario crea la settimana
successiva di ogni famiglia da mercoledì alle 20:00 nel suo fuso
(`server/src/menu/job.ts`, `isNextWeekDue`); la generazione pigra crea la settimana
corrente alla prima lettura del menu (`ensureWeeks`, `server/src/menu/generation.ts`).
Tra la creazione della famiglia e la fine del caricamento non deve partire nessuna
delle due:

- famiglia e caricamento si fanno di seguito, da lunedì a mercoledì entro le 19;
- **nessuno apre l'app** in quell'intervallo (Federico ha fatto «Esci» alla fine della
  fase 1: una PWA in secondo piano che torna in primo piano rilegge il menu);
- lo script di caricamento si **rifiuta** se la famiglia ha già una settimana con
  `generated_at` valorizzato, e l'anteprima lo mostra;
- la settimana in corso, già pianificata nel progetto di origine, arriva come «menu in
  corso» (sezione 6); la successiva la genera l'app mercoledì alle 20, con impostazioni
  e storico presenti;
- **da quel momento il vecchio flusso non pianifica più settimane.** Lo spegnimento del
  progetto di origine resta una decisione dell'utente (sezione 11 della specifica), ma
  due menu per la stessa settimana no.

**Passi.**

1. **Account** (utente): per ogni familiare Authentication › Users › Add user, «Auto
   Confirm User»; password comunicate dall'utente. L'account di Federico esiste dalla
   fase 1. L'utente dà al coordinatore gli UUID degli utenti (colonna UID della
   dashboard), non le password.
2. **Famiglia** (coordinatore): copia compilata di `supabase/scripts/bootstrap.sql` in
   `~/.config/cosasimangia/bootstrap.production.sql` (UUID della famiglia generato una
   volta e conservato, persone con lingua e ruolo, Federico `family_admin` e
   `recipe_curator`). Anteprima:

   ```bash
   scripts/prod-sql.sh --preview ~/.config/cosasimangia/bootstrap.production.sql
   ```

   «vai», poi `scripts/prod-sql.sh --apply …` sullo stesso file (sezione 8, «SQL sulla
   produzione»).
   Verifica: un secondo lancio non crea nulla (lo script è rilanciabile). Ritorno
   indietro: prima del caricamento la famiglia è vuota; si cancella con
   `delete from app.families where id = '<uuid>'` dopo anteprima e «vai».
3. **Caricamento** (coordinatore): `--dry-run` con i conteggi all'utente, «vai»,
   caricamento (sezione 6). Verifica: un secondo `--dry-run` dice «0 da creare» per
   ogni voce; report in `scripts/import/out/load-report.md`. Ritorno indietro: un errore
   non lascia nulla (transazione unica); «caricato ma sbagliato» nella sezione 8.
4. **Collaudo sull'iPhone** (utente con il coordinatore):

   | Area | Controllo |
   |---|---|
   | Accesso | Ogni familiare entra; Federico amministratore e curatore |
   | Menu | La settimana corrente coincide con il PDF del progetto di origine: ricette, porzioni, testi liberi («Pizza da asporto») |
   | Ricettario | Numero di ricette come nel report; ricette dei libri visibili (libri posseduti); voti di Federico; «Mangiate di recente» dallo storico; sezione Bozze con le bozze dell'import |
   | Impostazioni | Uguali alla tabella di `supabase/README.md` (porzioni, tempi, pasti fissi, regole, cetrioli) |
   | Revisione dei pasti | «Cambia ricetta» su un pasto futuro, poi annulla |
   | Spesa | Lista della settimana; spunte online e offline; Bring! |
   | PWA | Installazione sulla schermata Home; riapertura; riapertura offline |
   | Prima generazione | Giovedì: la settimana successiva, creata dal cron di mercoledì alle 20, rispetta le impostazioni (pizza domenica a pranzo, cena libera sabato, pesce il venerdì, porzioni) e non ripete il menu in corso |
   | Esportazione | La notte dopo il caricamento l'esportazione in R2 c'è ed è più grande delle precedenti |

   Esito in `server/README.md` («Risorse di produzione») e nel registro del
   coordinamento. Un controllo fallito porta al ritorno indietro (sezione 8).

## 6. Script di caricamento

**File:** `scripts/import/load.ts` (comando), con moduli e test accanto
(`scripts/import/load-*.ts`). Non modifica file di altre aree: importa
`scripts/import/import-recipes.ts` (`runImport`), `scripts/import/inputs.ts`
(`readInputs`), `scripts/import/family.ts` (`buildFamilyData`),
`scripts/planner-data/origin.ts`, `scripts/planner-data/family.ts`
(`curatorFamilySettings`), `@app/domain/recipe` (`resolveReferences`),
`server/src/catalogue/write.ts`, `server/src/catalogue/ingredients.ts`
(`setEquivalence`), `server/src/family/settings-writes.ts` (`writeSettingsKey`).

**Uso:**

```bash
node --env-file=<file> scripts/import/load.ts --today <YYYY-MM-DD> --family <uuid> --curator <uuid> [--dry-run] [--local]
node --env-file=<file> scripts/import/load.ts --check-connection [--local]
```

- `--today` obbligatorio, come per l'import (decide le settimane concluse).
- `--curator` è l'UUID dell'utente (i profili non hanno l'email): deve avere
  `recipe_curator` ed essere `family_admin` di `--family`, altrimenti rifiuto prima di
  scrivere.
- Legge `APP_SERVER_DATABASE_URL`; con `--local` accetta solo host locali, senza
  rifiuta tutto ciò che non è il Session pooler di `lronuqvtjdhfyychnscr` (sezione 2).
- Legge dal database gli `origin_slug` delle ricette e gli slug di ingredienti e libri
  (al posto di `--existing`) e costruisce il bundle in memoria con `runImport`.

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

**Ordine delle scritture.**

1. **Libri e ingredienti** con `createBook` e `createIngredient`, slug del bundle
   conservati; uno slug già presente si salta (`created: false`).
2. **Equivalenze** da `readInputs(...).equivalences` con `setEquivalence`
   (idempotente), ingrediente risolto per slug.
3. **Ricette:** per ognuna `resolveReferences`, poi `createDraft` con `originSlug` e
   `originType`. Le `publishable` si pubblicano con `publishDraft` **solo se
   `pendingReview` è vuoto**; altrimenti restano tutte bozze e il report lo dice.
4. **Impostazioni** da `curatorFamilySettings()` con `writeSettingsKey`: porzioni,
   tempi e testi fissi per pasto e giorno, regole, quote note/nuove, intervalli dei
   gruppi (pesi esclusi, come nel perimetro del traguardo A). `families.settings`
   conserva solo i valori cambiati: si scrivono solo le chiavi diverse dai default di
   `resolveFamilySettings({})`, e una chiave già salvata non si tocca.
5. **Limite sui cetrioli** in `family_ingredients` (`limit`, 1 a settimana) per gli
   ingredienti di `curatorRestrictions`; una riga esistente non si tocca.
6. **Libri posseduti:** tutti i libri citati dal ricettario d'origine (le ricette dei
   libri vengono dai libri del curatore), in `family_books` con `on conflict do
   nothing`; l'anteprima li elenca per titolo.
7. **Voti di Federico** (`familyScoresOf`) in `ratings` con `on conflict do nothing`,
   solo su ricette pubblicate o archiviate (lo impone la policy `ratings_write`); quelli
   su bozze vanno nel report come «in sospeso».
8. **Ricette provate senza data** in `family_tried_recipes` con `source: 'import'`,
   `on conflict do nothing`.
9. **Storico e menu in corso** come `app_job` (sotto).

**Dati della famiglia dall'intero ricettario d'origine.** Voti, provate e storico si
calcolano con `buildFamilyData` su tutte le schede d'origine, non sul bundle delle sole
schede nuove: un rilancio dopo la pubblicazione di una bozza aggiunge i voti rimasti in
sospeso. Le ricette si trovano per `origin_slug`.

**Storico.** Pasti di `buildFamilyData` (casi R4 invariati), raggruppati per settimana.
Porzioni dal `menu/<lunedì>/menu.yaml` dell'origine se c'è e nomina quella ricetta in
quel pasto, altrimenti dalle impostazioni di quel giorno e pasto. Due ricette nello
stesso pasto: entra la prima in ordine di slug, l'altra va nel report. Settimane con
`generated_at` nullo, pasti con `updated_by` nullo.

**Menu in corso** (caso nuovo, da riportare nella sezione 11). Per ogni
`menu/<lunedì>/menu.yaml` dell'origine con settimana non conclusa a `--today`
(domenica della settimana ≥ `--today`, la stessa regola di R4): una settimana dell'app
con tutti i suoi pasti, anche quelli dei giorni già passati. `ricetta` + `porzioni` →
pasto con ricetta; `libero` → testo libero, con le porzioni delle impostazioni di quel
giorno e pasto; pasto mancante → nessuna riga. Le note per pasto dell'origine (dosi
concordate per il vecchio PDF) non si importano nella colonna `note`, perché l'app
ricalcola le dosi: sono elencate nel report. Una scheda citata ma assente dal ricettario dell'app è un errore
che ferma il caricamento. Questi pasti non sono «mangiati»: diventano storico per il
pianificatore quando passano, come ogni pasto dell'app.

**Rilanciabile, senza sovrascrivere.**

- Catalogo: slug e `origin_slug` già presenti si saltano; si rilancia anche dopo
  l'avvio (sezione 11 della specifica).
- Dati della famiglia: si aggiunge soltanto. Voti, provate, libri e limiti con `on
  conflict do nothing`; impostazioni solo dove la chiave è ancora al default; una
  settimana già presente nell'app (generata o importata) si salta per intero.
- **Rifiuto:** se `families.settings` è ancora vuoto (primo caricamento) e la famiglia
  ha già una settimana con `generated_at` valorizzato, si ferma prima di scrivere: la
  prima generazione è avvenuta con i default. Ai rilanci successivi (impostazioni già
  scritte) le settimane generate sono normali e si saltano.

**Uscite.** Una riga di riepilogo in console e `scripts/import/out/load-report.md`:
conteggi per voce (creati, già presenti, in sospeso), voti in sospeso, libri posseduti,
casi R4 di `buildFamilyData`, note del menu in corso non importate, pasti doppi
scartati, modalità (`dry-run` o scritto). Nessuna stringa di connessione.

**`--check-connection`:** si collega con lo stesso controllo del bersaglio e stampa
numero di famiglie e ricette visibili ad `app_job`; non scrive.

## 7. Rilascio: `npm run release`

`scripts/release.ts`, script `release` nel `package.json` della radice; nessuna libreria
nuova (`node:child_process`, `fetch`). Lanciato dal coordinatore in due tempi.

**`--preview`** (non scrive nulla):

- branch `main`, albero pulito, `HEAD` uguale a `origin/main` dopo `git fetch`;
- CI verde sul commit: `gh run list --commit <sha> --workflow ci.yml --json conclusion`
  con `success`;
- file delle credenziali presente e con il bersaglio giusto (sezione 2);
- `supabase db push --dry-run` con la password dall'ambiente;
- `web/.env.production` con le due variabili valorizzate, senza segnaposto;
- versione attualmente pubblicata (`npx wrangler deployments list`, ultima voce);
- stampa il commit da pubblicare, che `--apply` richiede.

**`--apply <sha>`** (dopo il «vai»):

1. ripete i controlli; si ferma se il commit non è `<sha>`;
2. `supabase db push` (si salta se non ci sono migrazioni nuove);
3. `npm run build -w web`; controlla che `web/dist` contenga l'host
   `lronuqvtjdhfyychnscr.supabase.co` (altrimenti la build è in modalità finta e si
   ferma);
4. `npm run deploy -w server`;
5. verifiche sull'indirizzo pubblicato: `GET /api/openapi.json` → 200; `GET
   /api/session/whoami` senza token → 401; `POST /mcp` senza token → 401; `GET
   /.well-known/oauth-protected-resource/mcp` → `resource` che termina in `/mcp`; `GET
   /menu` → 200 HTML; `GET /shopping-lists/<token inesistente>` → 404, non 500 (tocca il
   database tramite Hyperdrive nel ruolo `anon`).

L'indirizzo `workers.dev` si legge dall'output di `wrangler deploy` al primo rilascio e
si scrive in `scripts/release.config.json` (`{ "productionUrl": … }`, versionato, nessun
segreto) con una PR; finché manca, `--apply` salta le verifiche dopo il deploy e lo dice.

## 8. Ritorno indietro

| Cosa va male | Come si torna indietro |
|---|---|
| Worker nuovo difettoso | `npx wrangler rollback` (dal coordinatore, da `server/`); le migrazioni sono solo additive, il Worker precedente funziona sullo schema nuovo |
| Migrazione sbagliata | Correzione in avanti con una migrazione nuova; niente migrazioni «down». In fase 1 il database è vuoto |
| Hyperdrive sbagliato | `npx wrangler hyperdrive update <id> …` o `delete` e nuova creazione, poi PR con l'id |
| Caricamento riuscito ma sbagliato, **prima** che la famiglia usi l'app | `supabase/scripts/reset-app-data.sql` (sotto), poi correzione di script o YAML, famiglia e caricamento rifatti |
| Errore nei dati **dopo** l'avvio | Correzioni puntuali dall'app o dall'agente; per un danno grave, ripristino dall'esportazione in R2 con la procedura della spec di W5, sezione 4 |
| L'app non è usabile dalla famiglia | La famiglia torna al PDF del progetto di origine, che resta attivo (sezione 11): l'utente riprende a pianificare lì. I dati dell'app restano; si riprende con un nuovo passaggio di consegne a problema risolto |

**SQL sulla produzione: `scripts/prod-sql.sh`.** Sul Mac non c'è `psql`: lo script usa
quello dell'immagine Postgres dello stack locale (`public.ecr.aws/supabase/postgres`,
già scaricata) con `podman run --rm -i -e POSTGRES_DATABASE_URL`, così la stringa passa
solo come variabile d'ambiente. Accetta solo file con esattamente una riga `begin;` e
una riga `commit;` (come `bootstrap.sql`): `--preview` sostituisce `commit;` con
`rollback;` e mostra l'output (avvisi e conteggi), `--apply` esegue il file com'è.
Carica il file delle credenziali al suo interno e controlla il bersaglio (sezione 2).

**`supabase/scripts/reset-app-data.sql`.** Svuota catalogo, settimane, pasti, voti,
spesa e dati delle famiglie (famiglie comprese), lascia schema, utenti, profili e ruoli
globali. Si ferma senza toccare nulla se esiste anche una sola traccia d'uso: righe in
`meal_changes`, spunte della spesa, settimane con `generated_at` valorizzato,
salvataggi di bozze o versioni con canale diverso da `import`. Lanciato dal
coordinatore con `scripts/prod-sql.sh`, con anteprima (conteggi delle righe che
toglierebbe) e «vai». Provato sullo stack locale da
`supabase/scripts/reset-app-data_test.sh`, come `bootstrap_test.sh`.

## 9. Fase 3 e chiusura

**Fase 3, agenti** (dopo il merge di W2, subito dopo l'avvio della famiglia). Dalla
spec di W2, «Passi esterni per la produzione (li fa l'utente)»:

1. PR (worker o W2) con la chiave pubblica in `SUPABASE_PUBLISHABLE_KEY` dei `vars` di
   `server/wrangler.jsonc` (stesso valore di `web/.env.production`).
2. Utente: Authentication › OAuth Server (attivo, *Authorization path* `/authorize`,
   registrazione dinamica attiva); Authentication › URL Configuration, *Site URL* uguale
   all'indirizzo `workers.dev`, *Redirect URLs* con `<origine>/**`.
3. Coordinatore: `npm run release` (anteprima, «vai», applicazione).
4. Prova della revoca e verifiche di W2 (suoi passi 3 e 10).

Al passaggio al dominio `cosasimangia.qunidi.it` (ondata 3) *Site URL* e *Redirect
URLs* vanno aggiornati: annotazione in `server/README.md`.

**Rotazione delle password** (ultimo passo, fatta dall'utente, in un'ora senza uso):

1. Utente: Dashboard › Database › Settings › *Reset database password*; aggiorna
   `SUPABASE_DB_PASSWORD` e `POSTGRES_DATABASE_URL` nel file.
2. Utente: nuova password di `app_server` (`openssl rand -hex 24`, `alter role
   app_server with password '…'` nell'editor SQL); aggiorna `APP_SERVER_DATABASE_URL`
   e `APP_SERVER_PASSWORD`.
3. Coordinatore, subito dopo: `npx wrangler hyperdrive update <id>
   --origin-password="$APP_SERVER_PASSWORD"` con l'ambiente caricato (opzioni verificate
   con Context7 nel piano). Fra il passo 2 e il 3 le connessioni nuove di Hyperdrive
   falliscono per pochi minuti.
4. Verifica: `GET /shopping-lists/<token inesistente>` → 404; accesso e Menu
   sull'iPhone; il cron dell'ora successiva senza errori in `wrangler tail`; script di
   caricamento `--check-connection` con la password nuova; `supabase migration list` con
   la nuova password del database.

**Esito** in `server/README.md`, «Risorse di produzione»: nomi delle risorse, limite di
connessioni scelto e perché, indirizzo `workers.dev`, procedura di rilascio, data del
collaudo, data della rotazione.

## 10. Documenti da allineare (in implementazione)

- `server/README.md`: «Pubblicazione» (con `npm run release`, non più «dopo che
  l'integrazione di Supabase ha applicato le migrazioni») e «Risorse di produzione».
- `supabase/README.md`: «Passi remoti» (migrazioni dalla CLI, `bootstrap.sql` con
  `scripts/prod-sql.sh` dal coordinatore, impostazioni scritte dal caricamento invece che dall'app) e
  la sezione sull'azzeramento.
- La spec della piattaforma (sezione 7, «le migrazioni arrivano al merge») e la
  specifica principale non si toccano: vedi sotto.

## 11. Fuori perimetro

Dominio `cosasimangia.qunidi.it`, Resend, accesso con Google, inviti (ondata 3);
automazione della pubblicazione con GitHub Actions; ripristino completo provato in
produzione (lo prova W5 in un ambiente di verifica); spegnimento del progetto di origine
(decisione dell'utente).

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
- **Ritorno indietro per la famiglia** (sezione 11): finché il progetto di origine
  resta attivo, il ripiego è il PDF settimanale.

**Tecniche**

- **Pubblicazione** (sezioni 1, 10, 15): per il traguardo A a mano con `npm run release`
  in due tempi (anteprima, poi applicazione dello stesso commit con migrazioni, build
  verificata, deploy e controlli), lanciato dal coordinatore dopo il «vai»
  dell'utente. Supera «automazione prima del traguardo A» (scelta dell'utente, 11
  ottobre 2026); GitHub Actions si rivaluta quando i rilasci diventano frequenti.
- **Migrazioni sul progetto di produzione** (sezioni 1, 15): con la CLI di Supabase
  (`supabase db push --dry-run`, poi `db push`) dentro `npm run release`, sempre prima
  del deploy del Worker. Chiude la voce «modo di applicare le migrazioni» della sezione
  15; la spec della piattaforma (sezione 7) e `server/README.md` vanno allineati.
- **Esecuzione delle operazioni sulla produzione** (sezione 1): le lancia il
  coordinatore con le credenziali in `.env.production.local`, scritto dall'utente e
  caricato solo dentro i comandi; anteprima e «vai» prima di ogni scrittura; rotazione
  delle password a fine collaudo.
- **Variabili della build** (sezione 1): `web/.env.production` versionato con URL e
  chiave pubblica di Supabase.
- **Import nel database** (sezione 11): `scripts/import/load.ts`, una transazione con
  anteprima a rollback, catalogo come curatore con canale `import`, storico e menu in
  corso nel ruolo `app_job`, dati della famiglia calcolati sull'intero ricettario
  d'origine e scritti solo in aggiunta.
- **Avvio a fasi** (sezione 10): infrastruttura senza famiglia, poi import e avvio della
  famiglia (dopo revisione dei pasti, esportazione provata e bozze nell'app), poi
  agenti; finestra per l'avvio della famiglia da lunedì a mercoledì entro le 19.
- **Azzeramento prima dell'uso** (sezione 8): `supabase/scripts/reset-app-data.sql`,
  ammesso solo senza tracce d'uso.
