# Messa in produzione: spec di dettaglio

Creata: 11 ottobre 2026 · Corretta dopo la review avversariale (16 rilievi,
`progetto/coordinamento/revisioni/w6-produzione-spec-piano.md`) e dopo la seconda
review (5 rilievi, `progetto/coordinamento/revisioni/w6-produzione-spec-piano-2.md`) ·
Corretta dopo la review della PR #34 (13 rilievi, `progetto/coordinamento/revisioni/w6-pr34.md`,
decisioni del coordinatore in `messaggi/w6-produzione-02-review-pr34.md`) · Attività: messa in
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
| **Utente** | Passi nelle dashboard di Supabase e Cloudflare (Data API, chiave pubblica, certificato del database, iscrizioni spente, OAuth server, URL del sito, pool, **creazione e modifica della configurazione di Hyperdrive con la password di `app_server`**); creazione degli account (password dei familiari); file delle credenziali; chiave delle esportazioni nel gestore di password e `! npx wrangler secret put`; «vai» dopo ogni anteprima; collaudo sull'iPhone; rotazione finale delle password; `! npx wrangler login` e `! supabase login` se servono |
| **Coordinatore** | Lancia `scripts/prod-sql.ts` (famiglia, azzeramento, controlli in sola lettura), lo script di caricamento, `npm run release`, i comandi `wrangler` senza segreti (`hyperdrive get` in sola lettura, bucket, `tail`, `rollback`, `delete`); sempre dopo un'anteprima mostrata all'utente e il suo «vai». Unisce le PR di configurazione |
| **Worker (W6)** | In implementazione: script di caricamento, `npm run release`, `scripts/prod-sql.ts` e gli SQL di servizio, documenti, PR di configurazione; prove sullo stack locale e in CI. In produzione non lancia nulla |

**Nessuna password negli argomenti di un processo.** Le password stanno solo nel file
delle credenziali, nell'ambiente dei processi figli (`PGPASSWORD`) e nelle dashboard; mai
in una riga di comando, nemmeno espansa da una variabile (le virgolette impediscono la
separazione, non la visibilità nella lista dei processi). Per questo la password di
origine di Hyperdrive la inserisce l'utente nella dashboard di Cloudflare.

**Anteprima legata a ciò che si applica.** Ogni scrittura in produzione ha un'anteprima
che non scrive e stampa un'**impronta** di ciò che verrà applicato; l'applicazione
richiede quell'impronta e si rifiuta, **prima di collegarsi**, se è cambiata:

| Operazione | Anteprima | Applicazione |
|---|---|---|
| Migrazioni iniziali | `npm run release -- --preview --migrations-only` → impronta del rilascio | `npm run release -- --apply <impronta> --migrations-only` |
| Rilascio | `npm run release -- --preview` → impronta del rilascio | `npm run release -- --apply <impronta>` |
| SQL sulla produzione | `node scripts/prod-sql.ts --preview <script> [--launch] [--set …]` → impronta dell'operazione (sezione 8) | `node scripts/prod-sql.ts --apply <script> [--launch] [--set …] --confirm <impronta>` |
| Caricamento | `load.ts … --dry-run` → impronta degli input | `load.ts … --confirm <impronta>` |

Il coordinatore mostra l'esito all'utente e procede solo con il suo «vai».

**Stessi byte nell'anteprima e nell'applicazione.** Ogni strumento legge i suoi input
**una volta**, in memoria (o in una fotografia privata, sezione 6), calcola l'impronta su
quei byte ed esegue gli stessi byte: nessuna rilettura dal disco dopo il controllo. Il
codice si identifica con il commit e gli strumenti rifiutano, prima di collegarsi, un
checkout non pulito (`git status --porcelain` non vuoto) quando la destinazione è la
produzione: una modifica locale non committata non può cambiare ciò che si esegue senza
cambiare l'impronta.

## 2. Credenziali, bersaglio e trasporto

- **File:** `.env.production.local` nella radice del checkout principale
  (`/Users/fedfol/Projects/meal_planner_2/`), scritto dall'utente con il suo editor.
  Coperto da `.env.*` del `.gitignore`; l'eccezione nuova è esattamente
  `!web/.env.production` e non lo include (controllo con `git check-ignore --no-index`,
  senza creare file).
- **Contenuto:**

  | Variabile | Uso |
  |---|---|
  | `POSTGRES_DATABASE_URL` | migrazioni (`supabase db push`), `scripts/prod-sql.ts`, script di caricamento: Session pooler, porta 5432, database `postgres`, utente `postgres.<ref>` |
  | `APP_SERVER_DATABASE_URL` | solo `load.ts --check-connection`, che prova le credenziali che userà Hyperdrive: Session pooler, porta 5432, database `postgres`, utente `app_server.<ref>` |

  `APP_SERVER_PASSWORD` non esiste più: la password di origine di Hyperdrive la incolla
  l'utente nella dashboard di Cloudflare (sezione 4, passo 5).

  Entrambe le URL terminano con
  `?sslmode=verify-full&sslrootcert=/Users/fedfol/.config/cosasimangia/supabase-ca.crt`:
  il certificato si scarica da Dashboard › Database › Settings › *SSL Configuration*
  e si salva in quel percorso (cartella creata dall'utente).
- **Regola per chi esegue:** il file lo leggono solo gli script, con l'opzione
  `--credentials <file>` (nome scelto per non confonderlo con `--env-file` di Node); non
  si carica mai nella shell. Mai `cat`, `echo`, `env`, `printenv`, `source` o `set -x`; gli
  script non stampano mai stringhe di connessione né password, nemmeno negli errori (si
  stampano solo ruolo, host, porta e database) e filtrano l'output dei comandi figli
  togliendo ogni occorrenza della password.
- **Progetto di destinazione, un solo punto:** `scripts/production-target.json`
  (versionato, nessun segreto) contiene `{ "supabaseRef": "lronuqvtjdhfyychnscr" }`.
  Caricamento, `prod-sql.ts` e `release` lo leggono; cambiarlo (ripristino su un
  progetto nuovo, sezione 8) richiede una PR revisionata, mai un'opzione da riga di
  comando.
- **Controllo del bersaglio** (prima di collegarsi, uguale per i tre strumenti): il
  validatore non dice solo «sì» o «no», **produce i campi** della destinazione
  (`host`, `port`, `database`, `user`, `password`, percorso della CA) e ogni connessione
  si **costruisce da quei campi**, mai dalla URL originale. Regole: protocollo
  `postgres:`/`postgresql:`; utente esattamente `<ruolo atteso>.<ref>` (`postgres` o
  `app_server`); **un solo host**, nome DNS canonico (lettere minuscole, cifre, `-` e
  `.`, nessun IP, nessuna parentesi) che termina in `.pooler.supabase.com`; porta 5432;
  database `postgres`; fra i parametri solo `sslmode=verify-full` e `sslrootcert`, una
  volta ciascuno. Rifiuto per: `%` in host, utente, database o parametri (una codifica
  come `%2C` diventerebbe una lista di host per il driver), virgole, liste di host,
  qualsiasi altro parametro. Solo la password può contenere codifiche `%XX`, decodificate
  una volta. Con `--local` (solo prove) l'host è `127.0.0.1` o `localhost`, senza
  parametri TLS.
- **Stesso oggetto per ogni client:** Postgres.js riceve `{ host, port, database,
  username, password, ssl }` dai campi; `psql` riceve una stringa di connessione
  `host=… port=… dbname=… user=…` **senza password né TLS**, con la password in
  `PGPASSWORD` e il TLS in `PGSSLMODE=verify-full` e `PGSSLROOTCERT` nell'ambiente del
  container (passati con `-e NOME`, senza valore nell'argomento): un percorso del
  certificato con spazi o apici non diventa mai testo della conninfo, dove inizierebbe un
  altro parametro; la CLI di Supabase riceve `--db-url`
  costruita dai campi senza password, e la password in `PGPASSWORD`. Un test verifica
  che le opzioni effettive del driver coincidano con la destinazione mostrata e che
  nessun argv dei processi figli contenga la password.
- **TLS verificato:** le connessioni remote usano TLS con verifica di catena e nome
  dell'host: `ssl: { rejectUnauthorized: true, ca, servername: host }`, con la CA letta
  dal percorso di `sslrootcert`. Un server senza TLS fa fallire la connessione, mai una
  ricaduta in chiaro. `psql` riceve gli stessi parametri, con la cartella del
  certificato montata in sola lettura.
- **I dati dei familiari** (email, nomi, lingue, ruoli) passano a `bootstrap.sql` come
  parametri `--set` di `prod-sql.ts` (sezione 8): nessuna copia compilata del file,
  né nel repository né in `~/.config`. Sono coperti dall'impronta dell'operazione.
- **Dopo il collaudo** l'utente cambia le password (sezione 9).

## 3. Fasi e dipendenze

| Fase | Contenuto | Dipende da |
|---|---|---|
| **1. Infrastruttura senza famiglia** | Prerequisiti (con **iscrizioni spente**, **OAuth server e URL del sito**), certificato e file delle credenziali, **migrazioni iniziali**, password di `app_server`, Hyperdrive, **bucket e chiave delle esportazioni**, PR di configurazione (con la chiave pubblica anche nel Worker), primo rilascio, segreto della chiave, accesso di prova | Ciò che è su `main` (ondata 1, revisione dei pasti, esportazione in R2 unita con la #30 e la #32, collegamento degli agenti unito con la #31, bozze nell'app), più la PR di questa attività |
| **2. Import e avvio della famiglia** | Prova delle esportazioni, account, famiglia, caricamento, primo collaudo, collaudo completo | Fase 1; prima esportazione notturna verificata (spec di W5, sezione 6) |
| **3. Agenti** | Prove del collegamento, della revoca e del ricettario tramite agente (OAuth server e URL del sito sono già attivi dalla fase 1) | Subito dopo l'avvio della famiglia (il collegamento degli agenti è unito con la #31) |
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
- collegamento degli agenti, `progetto/superpowers/specs/2026-10-11-collegamento-agenti.md`,
  unita con la #31: sezione «Passi esterni per la produzione (li fa l'utente)». Il suo
  passo 5 (chiave pubblica nel Worker al posto di `sb_publishable_REPLACE_ME` **prima
  della pubblicazione**) entra nella PR di configurazione della fase 1: con il
  segnaposto «Scollega» risponderebbe `internal`. Anche l'attivazione (passi 6–7: OAuth
  server, *Site URL*, *Redirect URLs*) passa ai **prerequisiti della fase 1**: il Worker
  serve i metadati OAuth leggendoli da Supabase, e senza OAuth server attivo
  `/.well-known/oauth-protected-resource/mcp` risponde 500 e il primo rilascio
  fallirebbe i suoi controlli. Le prove (passi 3 e 10) restano nella fase 3;
- revisione dei pasti (W1) e bozze nell'app (PR #26): unite, nessun passo esterno.

Al momento di ogni fase il coordinatore rilegge la sezione richiamata sulla versione
unita: se è cambiata, vale quella.

## 4. Fase 1: infrastruttura senza famiglia

Passi richiamati dal Task 10 del piano della piattaforma
(`progetto/superpowers/plans/2026-10-11-piattaforma.md`, «Risorse di produzione e prima
pubblicazione») e dalla spec della piattaforma, sezione 6, «Passi di produzione»;
questa spec li ordina e ne decide gli esecutori. I comandi esatti sono nel runbook del
piano (R1–R14).

1. **Prerequisiti, in sola lettura:** `wrangler whoami` (account POWA),
   `supabase projects list` (`lronuqvtjdhfyychnscr`), JWKS con una chiave `ES256` o
   `RS256`, Data API con *Exposed schemas* solo `public` e `graphql_public` (passo 4
   della spec di W2, indipendente dal suo merge). Il sottodominio `workers.dev`
   dell'account (Dashboard di Cloudflare › Workers & Pages, *Subdomain*) fissa fin da
   qui l'indirizzo del Worker: `https://cosasimangia.<sottodominio>.workers.dev`.
   1a. **Iscrizioni: spente** (decisione dell'utente, 12 ottobre 2026; utente):
   Authentication › Sign In / Providers, «Allow new users to sign up» disattivato. Gli
   account si creano solo con «Add user». Verifica in sola lettura: `GET
   https://<ref>.supabase.co/auth/v1/settings` con la chiave pubblica riporta
   `disable_signup: true`; lo controlla anche ogni anteprima di rilascio (sezione 7).
   Si usa la lettura delle impostazioni e non un tentativo di iscrizione: con le
   iscrizioni accese il tentativo creerebbe un utente. Lo stack locale
   (`supabase/config.toml`) non cambia. Con le iscrizioni spente l'OAuth server funziona
   comunque: la documentazione di Supabase Auth (Context7, `/supabase/auth`) applica
   `DISABLE_SIGNUP` alla creazione di utenti (`/signup` e primo accesso con un provider
   esterno), mentre le rotte `/oauth/*`, registrazione dinamica dei client compresa,
   dipendono solo da `OAuthServer.Enabled` e `AllowDynamicRegistration`; gli agenti
   accedono con utenti già esistenti. La fase 3 lo conferma in produzione.
   1b. **OAuth server e URL del sito** (utente; spec di W2, passi 6–7): Authentication ›
   OAuth Server attivo, *Authorization path* `/authorize`, registrazione dinamica
   attiva; Authentication › URL Configuration, *Site URL* = l'indirizzo del punto 1,
   *Redirect URLs* `<indirizzo>/**`. Prima del primo rilascio, che controlla i metadati
   OAuth (sezione 7). Ritorno indietro: disattivare l'OAuth server (gli agenti non si
   collegano; l'app non ne dipende, ma i controlli di rilascio falliscono finché è
   spento).
2. **Certificato e file delle credenziali** (utente): certificato del database in
   `~/.config/cosasimangia/supabase-ca.crt`; `POSTGRES_DATABASE_URL` nel file. Verifica:
   `prod-sql.ts --preview migrations-state` risponde dal progetto giusto.
3. **Migrazioni iniziali** (coordinatore): `npm run release -- --preview
   --migrations-only`, «vai», `--apply <sha> --migrations-only` (sezione 7). Creano lo
   schema `app` e i ruoli `app_server`, `app_job` e `app_backup`, che i passi 4 e 5
   presuppongono: su un progetto senza migrazioni `alter role app_server` fallirebbe e
   Hyperdrive non avrebbe un utente valido. Ritorno indietro: correzione in avanti
   (sezione 8); il database non ha famiglie.
4. **Pool e password di `app_server`** (utente): dimensione del pool; password con
   `openssl rand -hex 24`, impostata nell'editor SQL; `APP_SERVER_DATABASE_URL` nel file.
   Verifica subito: `load.ts --check-connection`.
5. **Hyperdrive** (utente nella dashboard, coordinatore in sola lettura): Dashboard di
   Cloudflare › Storage & Databases › Hyperdrive › *Create configuration*: nome
   `cosasimangia`, host del Session pooler, porta 5432, database `postgres`, utente
   `app_server.<ref>`, la password del passo 4 incollata nel campo, cache disattivata,
   limite di connessioni = pool − 5, almeno 5. La password non passa da nessuna riga di
   comando. Il coordinatore verifica con `wrangler hyperdrive get <id>` (sola lettura:
   host, utente, database, cache, limite) e `load.ts --check-connection` (la stessa
   password funziona sul pooler). Se la dashboard non espone il limite, il coordinatore
   lo imposta con `wrangler hyperdrive update <id> --origin-connection-limit=<N>`, che
   non contiene segreti.
6. **Bucket e chiave delle esportazioni** (spec di W5, sezione 5, passi 1–2): bucket
   `cosasimangia-backups` in giurisdizione `eu`; chiave generata dall'utente e
   conservata nel gestore di password. Il segreto si imposta al passo 9.
7. **PR di configurazione** (worker; merge del coordinatore), nessun valore segreto: id
   di Hyperdrive, `account_id` e **`SUPABASE_PUBLISHABLE_KEY`** (la chiave pubblica, al
   posto del segnaposto `sb_publishable_REPLACE_ME`) in `server/wrangler.jsonc`;
   `web/.env.production` con `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`
   (stessa chiave); eccezione `!web/.env.production` nel `.gitignore` (già nella PR di
   questa attività).
8. **Primo rilascio** (coordinatore): `npm run release -- --preview`, «vai», `--apply
   <impronta del rilascio>` (sezione 7); le migrazioni risultano già applicate; i
   controlli comprendono iscrizioni spente e metadati OAuth (passi 1a e 1b). Ritorno
   indietro: `wrangler delete` (sezione 8).
9. **Segreto della chiave** (utente, subito dopo il primo rilascio e prima delle 02:30):
   `! npx wrangler secret put BACKUP_ENCRYPTION_KEY` da `server/`. Da qui ogni
   anteprima di rilascio controlla che il segreto ci sia.
10. **Accesso di prova** (utente): crea il proprio account, entra dall'iPhone
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
- **Avvio che non termina nella finestra** (decisione del coordinatore, semplificata
  dopo la review della PR #34): se il bootstrap riesce ma il caricamento o il primo
  collaudo non terminano entro le 19 del mercoledì, si **azzera** con
  `reset-app-data` (sezione 8: transazione, controllo dell'**impronta di avvio** più
  recente, anteprima e «vai») e si ritenta in una finestra successiva ripartendo dal
  bootstrap. Niente sospensioni della generazione. Vale anche quando il caricamento
  fallisce: il suo rollback lascia valida l'impronta del bootstrap, che basta
  all'azzeramento. Il catalogo si ricarica da capo nella finestra successiva (lo script
  è rilanciabile). Non si rimuove la sola famiglia: dopo una rimozione il catalogo
  resta e un nuovo `--launch` non sarebbe più ammesso (sezione 8, «stato iniziale»), e
  senza impronta di avvio non ci sarebbe più un ritorno indietro automatico.

**Passi.**

1. **Account** (utente): per ogni familiare Authentication › Users › Add user (email,
   password, «Auto Confirm User»). L'account di Federico esiste dalla fase 1. L'utente
   dà al coordinatore per ognuno **email, nome, lingua e ruolo nella famiglia** (quello
   che chiede `bootstrap.sql`) e l'UID di Federico (colonna UID della dashboard, per
   `--curator`), mai le password.
2. **Famiglia** (coordinatore): `bootstrap.sql` con i dati passati come parametri
   (sezione 8): `--set family_id=<uuid>` (generato una volta e annotato nel registro),
   `--set family_name=…`, `--set measurement_system=metric`, `--set
   time_zone=Europe/Rome` e `--set people=<JSON>` con una voce per persona (email, nome,
   lingua, ruolo nella famiglia, ruoli globali); Federico `family_admin` con ruoli
   globali `app_admin` e `recipe_curator` (sezione 2 della specifica: l'amministratore
   dell'app è Federico); gli altri `member` o `family_admin` come indicato. Anteprima
   con `prod-sql.ts --preview bootstrap --launch …`, «vai», `--apply bootstrap --launch …
   --confirm <impronta dell'operazione>`. Un rilancio non cambia la famiglia esistente e
   **riallinea** nome, lingua e ruolo delle persone ai valori dati (comportamento di
   `bootstrap.sql`): la verifica è un secondo `--preview` senza `--launch` che mostra
   l'avviso «family already exists» e le stesse righe. Il bootstrap si applica con
   **`--launch`** (sezione 8): blocca le tabelle di `app`, rifiuta se il database non è
   nello **stato iniziale** e stampa l'**impronta di avvio** calcolata nella stessa
   transazione, che il coordinatore annota nel registro. Ritorno indietro:
   `reset-app-data` con quell'impronta.
3. **Caricamento** (coordinatore): `--dry-run` con conteggi, report e impronta degli
   input all'utente; «vai»; caricamento con `--confirm <impronta>` (sezione 6), entrambi
   con `--launch-from <impronta di avvio del bootstrap>`. Il caricamento verifica
   l'impronta di partenza e stampa **subito dopo il commit**, prima di qualsiasi altra
   operazione, la **nuova impronta di avvio**, calcolata nella sua transazione; il
   coordinatore la annota e da qui vale quella. Se il caricamento fallisce prima del
   commit, resta valida quella del bootstrap. Se fallisce solo la scrittura del report,
   dopo il commit, lo script termina con un'uscita distinta (sezione 6) e un avviso
   «data written, launch baseline B1 = …»: vale B1. Verifica: un secondo `--dry-run`
   dice «0 da creare» per ogni voce.
4. **Primo collaudo, in sola lettura** (Federico sull'iPhone, con il coordinatore, entro
   le 19): accesso; menu della settimana corrente uguale al PDF del progetto di origine
   (ricette, porzioni, testi liberi); ricettario (numero di ricette come nel report,
   ricette dei libri visibili, sezione Bozze); impostazioni uguali alla tabella di
   `supabase/README.md`. Nessuna modifica. Il piano verifica in locale che queste
   letture non cambino l'impronta (se una lettura scrive, esce dal primo collaudo); alla
   fine `show-fingerprint` deve dare l'ultima impronta di avvio. Se fallisce o non
   finisce entro le 19: azzeramento, correzione, nuova finestra.
5. **Collaudo completo** (familiari con il coordinatore, dopo il primo collaudo):
   tabella sotto. Da qui la famiglia usa l'app: il coordinatore segna nel registro
   l'impronta di avvio come **chiusa**; niente più azzeramento, solo i ritorni indietro
   «dopo l'avvio» (sezione 8).

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
| Prima generazione | Giovedì, **prima di aprire il menu**: `prod-sql.ts --preview check-first-generation` | `cron_generated = t`: riga di `app.weekly_jobs` per la settimana successiva con `status = done`, **`weeks.generated_at` uguale a `weekly_jobs.updated_at`** e `generated_at` fra mercoledì 20:00 e 21:00 ora della famiglia (sotto); poi nell'app la settimana rispetta le impostazioni (pizza domenica a pranzo, cena libera sabato, pesce il venerdì, porzioni) e non ripete il menu in corso | job e generazione |

**Evidenza della prima generazione** (rilievo 10 della review della PR #34). Il job
crea la settimana (`generateWeek`) e segna `done` nella **stessa transazione**
(`server/src/menu/job.ts`), e in Postgres `now()` è l'ora d'inizio della transazione:
`weeks.generated_at` e `weekly_jobs.updated_at` sono quindi **identici** solo se la
settimana l'ha creata quella transazione del job. Una generazione pigra fra il
dispatcher e il job, seguita dal job che trova la settimana e segna `done`, dà due
istanti diversi; una generazione pigra senza job non lascia la riga. La finestra
mercoledì 20:00–21:00 nel fuso della famiglia esclude un recupero tardivo. Si sceglie
questa uguaglianza e non il log: il job non registra un evento di successo (solo
`weekly_job_failed`, `weekly_job_abandoned`, …), aggiungerlo toccherebbe `server/src`,
e `wrangler tail` andrebbe tenuto aperto all'ora esatta. Nessuna colonna nuova.
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
`server/src/menu/generation.ts` (`lockFamilyWeeks`),
`supabase/scripts/app-fingerprint.sql` (sezione 8).

**Uso** (eseguito con `node` direttamente, TypeScript a sola cancellazione dei tipi:
niente sintassi non cancellabile, come impone `erasableSyntaxOnly`):

```bash
node scripts/import/load.ts --credentials <file> --today <YYYY-MM-DD> --family <uuid> --curator <uuid> [--launch-from <impronta di avvio>] --dry-run [--local]
node scripts/import/load.ts --credentials <file> --today <YYYY-MM-DD> --family <uuid> --curator <uuid> [--launch-from <impronta di avvio>] --confirm <impronta> [--local]
node scripts/import/load.ts --credentials <file> --check-connection [--local]
```

- `--today` obbligatorio, come per l'import (decide le settimane concluse).
- `--curator` è l'UUID dell'utente (i profili non hanno l'email): deve avere
  `recipe_curator` ed essere `family_admin` di `--family`, altrimenti rifiuto prima di
  scrivere.
- Legge `POSTGRES_DATABASE_URL` dal file di `--credentials` (`parseEnv`, senza toccare
  `process.env`), con il controllo del bersaglio (ruolo `postgres`) e il TLS della
  sezione 2; la connessione si costruisce dai campi validati. Serve il ruolo `postgres` perché il caricamento di avvio blocca tutte le
  tabelle di `app` (sotto), cosa che `app_server` non può fare; le scritture passano
  comunque come `authenticated` o `app_job` con `set local role`, quindi policy e
  trigger valgono come nell'app.
- `--launch-from <impronta>` indica il **caricamento di avvio** (sezione 8); senza,
  è un rilancio che non produce impronte di avvio.
- `--dry-run` e `--confirm` sono alternativi e uno dei due è obbligatorio: non esiste
  un caricamento senza anteprima.

**Impronta degli input, sugli stessi byte che si scrivono.** Prima di collegarsi, lo
script:

1. con destinazione di produzione, rifiuta un checkout non pulito (`git status
   --porcelain` non vuoto): il codice è quello del commit `HEAD`;
2. legge **una volta** tutti i file dell'origine (`ricettario/**`, `menu/**/menu.yaml`) e
   `scripts/import/*.yaml` e li copia in una **fotografia** privata (cartella temporanea
   `0700`, rimossa all'uscita); da qui in avanti `runImport`, `readInputs` e la lettura
   dei menu leggono solo dalla fotografia, mai dall'origine;
3. calcola lo SHA-256 sui byte della fotografia, sul commit `HEAD`, su `--today`,
   `--family`, `--curator`, `--launch-from` (o la sua assenza) e sulla destinazione
   validata (ruolo, host, porta, database);
4. analizza **prima di aprire la transazione** equivalenze, schede e menu dell'origine;
   solo l'import (`runImport`), che deve sapere quali voci sono già nel catalogo, gira
   dentro la transazione, e legge la stessa fotografia: l'attesa dei lock non può
   cambiare nessun byte letto.

`--dry-run` stampa l'impronta; `--confirm` la ricalcola e, se diversa, si ferma **senza
collegarsi** («inputs changed since the preview: run --dry-run again»). Così
l'approvazione vale per i byte mostrati, anche se un file cambia mentre lo script
aspetta i lock. Le prove: un file modificato durante l'attesa dei lock non cambia ciò
che si scrive; una modifica locale non committata con lo stesso `HEAD` fa rifiutare.

**Una transazione sola.** Tutto il caricamento è una transazione su una connessione
diretta (`postgres`, `max: 1`): o entra tutto o niente. `--dry-run` esegue lo stesso
codice e chiude con `rollback`; l'anteprima riporta quindi i conteggi veri, con gli
stessi controlli delle scritture. Ruoli nella transazione:

0. Solo con `--launch-from`, come `postgres` e prima di ogni altra istruzione: definizione
   di `pg_temp.app_fingerprint()` e `pg_temp.lock_app_tables()`, lock di **tutte** le
   tabelle di `app` in `exclusive mode`, poi confronto dell'impronta con quella data
   (diversa: rifiuto «app data changed since the launch baseline», nulla scritto).
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
effetti: si rilancia. Nel caricamento di avvio i lock di tutte le tabelle (punto 0)
vengono prima: qualsiasi scrittura concorrente aspetta il commit e quindi cade **dopo**
l'impronta di avvio. I rilanci senza `--launch-from` non bloccano le tabelle, perché la
famiglia può già usare l'app.

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
connessione. Un caricamento di avvio scritto stampa la nuova impronta di avvio
(sezione 8), calcolata come `postgres` subito prima del commit; un rilancio senza
`--launch-from` stampa «no launch baseline: not a launch load».

**Ordine delle uscite dopo il commit** (rilievo 9 della review della PR #34). Appena il
commit riesce lo script stampa, prima di ogni operazione che può fallire, la riga
«Committed. Launch baseline after the load: B1» (o «no launch baseline»). Poi scrive
il report: è un passo accessorio. Se fallisce (cartella non scrivibile, disco pieno),
lo script stampa «data written, launch baseline B1 = …; the report could not be
written: <codice>» e termina con **codice 3**, distinto da 1 (errore, nulla scritto) e
da 0. Il riepilogo in console contiene comunque i conteggi.

**Errori senza dati, ma con il dettaglio utile.** Un errore dell'anteprima o del
caricamento stampa: passo in corso (per esempio «recipes: createDraft
<slug>»), nome e codice dell'errore di Postgres, e per gli errori di dominio il loro
codice e il campo; mai il messaggio o il dettaglio di Postgres (possono contenere
valori), mai stringhe di connessione.

**`--check-connection`:** legge `APP_SERVER_DATABASE_URL` (ruolo `app_server`), si
collega con lo stesso controllo del bersaglio e TLS e stampa numero di famiglie e
ricette visibili ad `app_job`; non scrive. Prova la password che userà Hyperdrive e i
grant del ruolo.

## 7. Rilascio: `npm run release`

`scripts/release.ts`, script `release` nel `package.json` della radice; nessuna libreria
nuova (`node:child_process` senza shell, `fetch`). Legge le credenziali con
`--credentials <file>` (default il file della sezione 2). Lanciato dal coordinatore in
due tempi.

**Ambiente controllato.** All'avvio `release` rifiuta qualsiasi variabile `CLOUDFLARE_*`
o `WRANGLER_*` nel proprio ambiente (per esempio `CLOUDFLARE_ENV=review-other` farebbe
pubblicare `cosasimangia-review-other` mentre i controlli leggono la configurazione
principale): l'account viene da `wrangler login` e dall'`account_id` della
configurazione. Il **nome effettivo del Worker** è il `name` di `server/wrangler.jsonc`
(nessuna sezione `env` ammessa nella configurazione), e l'indirizzo atteso è
`https://<nome>.<sottodominio>.workers.dev`.

**`--migrations-only`** (una volta, nella fase 1, prima della password di `app_server` e
di Hyperdrive): anteprima e applicazione fanno solo i punti 1, 2 (senza il controllo di
`web/.env.production`, che ancora non esiste) e 5, poi `supabase db push`; nessun
controllo del Worker, nessuna build, nessun deploy. Serve perché i ruoli `app_server`,
`app_job` e `app_backup` nascono dalle migrazioni. Senza migrazioni pendenti
l'anteprima lo dice esattamente («no pending migrations: nothing to apply») e
l'applicazione termina senza scrivere. Il piano prova l'intera sequenza (migrazioni,
password di `app_server`, `--check-connection`) partendo da un database senza i ruoli
applicativi.

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
   commento): `account_id` presente; nessuna sezione `env`; id di Hyperdrive diverso dal
   segnaposto di zeri; ogni bucket di `r2_buckets` esistente (`wrangler r2 bucket info
   <nome> --jurisdiction <giurisdizione>`); `vars.SUPABASE_PUBLISHABLE_KEY` valorizzata,
   senza segnaposto (`REPLACE_ME`) e **uguale** a `VITE_SUPABASE_PUBLISHABLE_KEY` di
   `web/.env.production` (altrimenti «Scollega» degli agenti non funzionerebbe); ogni
   segreto richiesto da `scripts/release.config.json` (`requiredSecrets`, oggi
   `BACKUP_ENCRYPTION_KEY`) presente in `wrangler secret list`. Al **primo rilascio**
   (nessuna versione pubblicata) i segreti non si possono ancora controllare:
   l'anteprima lo dice e l'applicazione termina con il passo obbligatorio «`wrangler
   secret put …` prima delle 02:30».
4. **Build della SPA con valori fissati:** rifiuto se esistono `web/.env.local`,
   `web/.env.production.local` o variabili `VITE_*` nell'ambiente del processo; i due
   valori di `web/.env.production` devono essere valorizzati, senza segnaposto, con
   l'URL `https://<ref>.supabase.co` e una chiave `sb_publishable_…`. Poi `npm run build
   -w web` con l'ambiente ripulito dalle `VITE_*` e i due valori passati
   esplicitamente; `web/dist` deve contenere **sia** l'URL **sia** la chiave esatti;
   poi `wrangler deploy --dry-run --outdir <tmp>` da `server/` (il bundle del Worker si
   costruisce).
5. **Supabase Auth, in sola lettura:** `GET https://<ref>.supabase.co/auth/v1/settings`
   con `apikey: <chiave>` → 200 (la chiave funziona) e **`disable_signup: true`**
   (iscrizioni spente, sezione 4, passo 1a); `GET
   https://<ref>.supabase.co/.well-known/oauth-authorization-server/auth/v1` → 200 con
   `issuer` e `registration_endpoint` (OAuth server attivo con registrazione dinamica,
   passo 1b). Se uno manca l'anteprima lo elenca come prerequisito mancante e
   l'applicazione non parte.
6. **Migrazioni:** `supabase db push --dry-run --db-url <URL costruita dai campi
   validati, senza password>` con la password in `PGPASSWORD`: la CLI va dove indica la
   destinazione controllata, mai sul progetto «collegato». L'esito si legge dal codice
   d'uscita e dall'elenco delle migrazioni pendenti, non da una frase della CLI.
7. **Versione pubblicata:** `wrangler deployments list --json`, ultimo deployment; per
   ognuna delle sue `versions[]`: `version_id`, quota di traffico (`percentage`) e tag
   (annotazione `workers/tag` di `wrangler versions view <version_id> --json`). È la
   versione da usare per il ritorno indietro (sezione 8).
8. **Impronta del rilascio:** SHA-256 di commit, ambito (`full` o `migrations-only`),
   destinazione del database (ruolo, host, porta, database) e destinazione Cloudflare
   (`account_id`, nome effettivo del Worker). La stampa con il comando di applicazione
   completo, `--credentials <file>` compreso: `npm run release -- --apply <impronta>
   [--migrations-only] --credentials <file>`.

**`--apply <impronta>`** (dopo il «vai»):

1. ripete **tutti** i controlli e la build dell'anteprima e ricalcola l'impronta; si
   ferma, prima di qualsiasi scrittura, se non coincide (commit, ambito, endpoint o
   Worker cambiati: «the release changed since the preview: run --preview again»). Un
   errore di build, chiave, prerequisito o configurazione si scopre qui;
2. `supabase db push` come al punto 6 (si salta se non ci sono migrazioni pendenti);
3. `npm run deploy -w server -- --tag <sha> --message "release <sha>"`, con l'ambiente
   ripulito come all'avvio; dall'output si legge il `version_id` nuovo;
4. **la versione nuova risponde:** `wrangler deployments status --json` deve indicare
   un solo `version_id`, quello del punto 3, al 100%; poi, sull'indirizzo atteso del
   Worker (non un indirizzo letto da altrove), `GET /api/openapi.json` → 200 con
   `info.version` uguale a quel `version_id` (il server lo legge da
   `CF_VERSION_METADATA`, `server/src/app.ts`): risponde la versione appena pubblicata,
   non quella vecchia. Si ritenta per al massimo 60 secondi, il tempo della
   propagazione; poi errore. Le altre verifiche: `GET /api/session/whoami` senza token → 401; `POST /mcp`
   senza token → 401; `GET /.well-known/oauth-protected-resource/mcp` → `resource` che
   termina in `/mcp`; `GET /menu` → 200 HTML; `GET
   /shopping-lists/000000000000000000000000000000000000000000000000` → 404, non 500. Il
   token è di **48 caratteri esadecimali**, il formato che
   `server/src/shopping/bring-page.ts` passa al database: la risposta attraversa
   Hyperdrive nel ruolo `anon` (con un token di altro formato la rotta risponde 404 senza
   interrogare il database e il controllo non proverebbe nulla).

L'indirizzo `workers.dev` è noto dalla fase 1 (sezione 4, punto 1) e si scrive in
`scripts/release.config.json` (`productionUrl`, versionato, nessun segreto) con la PR di
configurazione; `release` rifiuta se non coincide con `https://<nome>.<sottodominio>.workers.dev`
letto dall'output di `wrangler deploy`.

## 8. Ritorno indietro

| Cosa va male | Come si torna indietro |
|---|---|
| **Primo rilascio** difettoso (non c'è una versione precedente) | `npx wrangler delete` da `server/` dopo anteprima (`wrangler deployments list` con una sola versione) e «vai»: Worker, indirizzo `workers.dev` e cron spariscono; Hyperdrive, bucket e database restano. Al nuovo primo rilascio si reimposta il segreto. Database senza famiglia: nulla da proteggere |
| Rilascio successivo difettoso | `npx wrangler rollback <version_id> --message "<motivo>"` alla versione con il tag dello SHA precedente, mostrata dall'anteprima di rilascio (`versions[].version_id`, tag e quota, sezione 7, punto 7). Prima, compatibilità dello schema: `git diff --name-only <sha precedente> <sha attuale> -- supabase/migrations` elenca le migrazioni applicate dopo; il ritorno è ammesso se sono tutte additive (nuove tabelle, colonne con default o nulle, funzioni nuove), altrimenti correzione in avanti |
| Migrazione sbagliata | Correzione in avanti con una migrazione nuova; niente migrazioni «down». In fase 1 il database è senza famiglia |
| Hyperdrive sbagliato | L'utente corregge la configurazione nella dashboard di Cloudflare (Hyperdrive › la configurazione › *Settings*, campi di origine e password), oppure la elimina e ne crea una nuova; il coordinatore verifica con `wrangler hyperdrive get <id>` e, se l'id cambia, PR con l'id |
| Avvio che non termina nella finestra (anche con il caricamento fallito), primo collaudo fallito, caricamento sbagliato, **prima** del collaudo completo | `reset-app-data` con l'ultima impronta di avvio (sotto), correzione di script o YAML, poi bootstrap e caricamento in una nuova finestra |
| Errore nei dati **dopo** l'avvio | Correzioni puntuali dall'app o dall'agente; per un danno grave, ripristino dall'esportazione in R2 (spec di W5, sezione 4) e cambio di progetto (sotto) |
| L'app non è usabile dalla famiglia | La famiglia torna al PDF del progetto di origine, che resta attivo (sezione 11): l'utente riprende a pianificare lì. I dati dell'app restano; si riprende con un nuovo passaggio di consegne a problema risolto |

**Impronta di avvio: la condizione «solo bootstrap e import».** L'azzeramento non prova a
riconoscere tutte le forme d'uso (voti modificati, voci libere della spesa,
impostazioni, libri, esclusioni, ingredienti, equivalenze, archiviazioni…): ne
dimenticherebbe qualcuna. Usa invece un'**impronta di tutto lo schema `app`**:
`pg_temp.app_fingerprint()`, definita in `supabase/scripts/app-fingerprint.sql` insieme a
`pg_temp.lock_app_tables(mode)`, MD5 per tabella del testo di tutte le righe in ordine,
combinato in ordine di nome della tabella. Tabelle escluse, elencate nel file:
`profile_preferences` (preferenze di visualizzazione, nessun contenuto). Si calcola come
`postgres`.

Un'impronta autorizza l'azzeramento solo se è un'**impronta di avvio**: prodotta
**dentro la stessa transazione** delle scritture di avvio, con tutte le tabelle di `app`
già bloccate, e quindi senza spazio per scritture d'altri fra le scritture e il calcolo.
Ne nascono solo due, in catena:

1. **bootstrap** con `prod-sql.ts … bootstrap --launch` (sotto): subito dopo l'inizio
   della transazione blocca tutte le tabelle in `exclusive mode` e rifiuta se il
   database non è nello **stato iniziale**; alla fine calcola l'impronta e la stampa;
2. **caricamento di avvio** con `--launch-from <impronta precedente>` (sezione 6): blocca
   tutte le tabelle, rifiuta se l'impronta di partenza non è quella data, scrive,
   calcola la nuova impronta prima del commit e la stampa subito dopo.

**Stato iniziale** (rilievo 8 della review della PR #34): ogni tabella di `app` è vuota,
tranne quelle che nascono dagli account e dalle migrazioni senza contenuto della
famiglia né del catalogo: `profiles` (creata dal trigger su `auth.users`),
`profile_preferences`, `user_roles` (l'azzeramento le conserva) e `catalogue_state` (la
riga del contatore). «Nessuna famiglia» non basta: dopo una rimozione il catalogo
potrebbe contenere modifiche reali di un curatore, e un nuovo `--launch` le
inglobarebbe in una baseline azzerabile. Per ripartire si usa quindi l'azzeramento
finché l'ultima impronta di avvio è valida (dopo, il database è di nuovo nello stato
iniziale e `--launch` è ammesso); se non lo è più, si decide a mano con l'utente.

Una scrittura concorrente aspetta il commit e cade dopo l'impronta: la cambia, quindi
l'azzeramento rifiuta. Se il caricamento fallisce, il rollback lascia lo stato del
bootstrap e la sua impronta resta valida (è il caso «bootstrap riuscito, import
fallito» della decisione del coordinatore). I **rilanci** non rinnovano
l'autorizzazione: senza `--launch-from` il caricamento non stampa impronte di avvio; con
`--launch-from` funziona solo se nulla è cambiato dall'impronta precedente. Un rilancio
del bootstrap si fa senza `--launch`. Il coordinatore annota ogni impronta di avvio nel
registro con la sua origine; vale l'ultima, e al collaudo completo la segna come chiusa.

L'azzeramento:

1. blocca **tutte** le tabelle di `app` in `access exclusive` prima di qualsiasi
   controllo: una scrittura concorrente aspetta e, dopo, trova i dati già tolti;
2. calcola l'impronta e la confronta con l'ultima impronta di avvio, passata come
   variabile (`--set expected_fingerprint=<impronta>`); se è diversa si ferma senza
   toccare nulla («app data changed since the launch baseline»). Qualsiasi scrittura
   dopo l'avvio, anche una sola, cambia l'impronta: nel dubbio si rifiuta.

La rimozione della sola famiglia (`remove-family.sql`) esce dal perimetro: non lascia
uno stato da cui ripartire con un'impronta di avvio.

**SQL sulla produzione: `scripts/prod-sql.ts`.** Sostituisce `scripts/prod-sql.sh` e
`scripts/prod-sql-plan.ts`: un solo processo Node legge i byte una volta, li controlla,
ne calcola l'impronta e li passa a `psql` sullo stdin, senza che una shell rilegga file.

```bash
node scripts/prod-sql.ts --preview <script> [--launch] [--set nome=valore …] [--credentials <file>]
node scripts/prod-sql.ts --apply <script> [--launch] [--set nome=valore …] --confirm <impronta dell'operazione> [--credentials <file>]
```

- **Lista chiusa nel codice.** `<script>` è un nome, non un percorso. Ogni voce dice
  file, variabili ammesse con il loro tipo, se è in sola lettura e se ammette
  `--launch`:

  | Nome | File in `supabase/scripts/` | Variabili | Note |
  |---|---|---|---|
  | `migrations-state` | `migrations-state.sql` | — | sola lettura (migrazioni applicate, ruoli applicativi) |
  | `show-fingerprint` | `show-fingerprint.sql` | — | sola lettura |
  | `check-first-generation` | `check-first-generation.sql` | `family_id` (UUID), `week_start` (data) | sola lettura |
  | `bootstrap` | `bootstrap.sql` | `family_id` (UUID), `family_name` (testo), `measurement_system` (`metric`/`uk_imperial`), `time_zone` (testo), `people` (JSON) | l'unico con `--launch` |
  | `reset-app-data` | `reset-app-data.sql` | `expected_fingerprint` (32 cifre esadecimali) | scrive |

  Uno script in sola lettura si lancia solo con `--preview`. Variabili mancanti, in più,
  ripetute o di tipo sbagliato: rifiuto prima di collegarsi. `people` è un array JSON di
  oggetti `{ email, display_name, locale, family_role, global_roles }` validato nella
  forma; i testi non contengono caratteri di controllo.
- **Byte dal commit corrente, una volta.** Con destinazione di produzione rifiuta un
  checkout non pulito; legge `app-fingerprint.sql` e il file dello script con `git show
  HEAD:<percorso>`, in memoria. Impronta ed esecuzione usano quei byte.
- **Difesa sul testo** (anche se i file sono versionati e revisionati): un piccolo
  tokenizzatore attraversa il testo riconoscendo stringhe (`'…'`, `E'…'`), identificatori
  fra virgolette, commenti (`--`, `/* … */` annidati) e corpi `$tag$ … $tag$`, e **fuori**
  da questi rifiuta: le parole chiave di controllo della transazione (`begin`, `start`,
  `commit`, `end`, `rollback`, `abort`, `savepoint`, `release`, `prepare`) ovunque
  compaiano, non solo a inizio riga; qualsiasi `\` (metacomandi di `psql`, per esempio
  `\connect`); ogni interpolazione di variabile che non sia nella forma quotata `:'nome'`
  (le variabili diventano sempre letterali, mai testo SQL). Un `commit` dentro il corpo
  di un `do $$ … $$` non si rifiuta qui: dentro una transazione esplicita Postgres lo
  respinge («invalid transaction termination») e tutto torna indietro.
- **Transazione decisa dallo strumento.** I file non contengono `begin` né `commit`.
  L'anteprima invia sullo stdin `begin;`, `app-fingerprint.sql`, l'eventuale
  `select pg_temp.launch_start();`, lo script, l'eventuale `select
  pg_temp.app_fingerprint() as launch_baseline;` e `rollback;`. L'applicazione invia lo
  stesso testo senza `begin`/`rollback` a `psql --single-transaction -f -`. Sempre con
  `-X -q -v ON_ERROR_STOP=1`: al primo errore nulla resta scritto.
- **Destinazione e password.** Destinazione costruita dai campi validati (sezione 2):
  `psql` riceve la stringa di connessione senza password come argomento e la password
  in `PGPASSWORD`, passata al container con `-e PGPASSWORD` (nome senza valore);
  `~/.config/cosasimangia` montata in sola lettura. Container:
  `public.ecr.aws/supabase/postgres` con `podman run --rm -i` (`CONTAINER_CLI=docker`
  in CI).
- **Impronta dell'operazione.** `--preview` stampa uno SHA-256 calcolato **prima di
  collegarsi** su: commit, SHA-256 dei byte di `app-fingerprint.sql` e dello script,
  nome dello script, presenza di `--launch`, le coppie `--set` ordinate per nome, e la
  destinazione validata (ruolo, host, porta, database). `--apply` la ricalcola e, se
  `--confirm` non coincide, si ferma senza collegarsi. Così il «vai» vale per quello
  script, con quei parametri, su quella destinazione.
- Variabili d'ambiente: `PROD_SQL_TARGET=local` (solo prove: host locale, nessun
  controllo del checkout), `CONTAINER_CLI`.

**File SQL di servizio** (in `supabase/scripts/`, provati in CI su uno stack isolato):

- `app-fingerprint.sql`: impronta, lock e `pg_temp.launch_start()` (stato iniziale);
- `migrations-state.sql`, `show-fingerprint.sql`: sola lettura;
- `bootstrap.sql`: i dati dalle variabili `--set` (sopra);
- `reset-app-data.sql` (variabile `expected_fingerprint`, l'ultima impronta di avvio):
  lock, confronto dell'impronta, `truncate app.families, app.recipes, app.ingredients,
  app.books cascade`; lascia schema, utenti, profili e ruoli globali, cioè lo stato
  iniziale;
- `check-first-generation.sql` (variabili `family_id`, `week_start`): riga di
  `weekly_jobs`, `generated_at` della settimana e `cron_generated` (sezione 5), sola
  lettura.

**Danno grave dopo l'avvio: ripristino su un progetto nuovo.** Segue la spec di W5,
sezione 4, «Configurazioni che dipendono dal progetto Supabase», con queste aggiunte
perché le protezioni di W6 seguano il cambio senza indebolirsi:

1. PR revisionata che cambia **insieme** `scripts/production-target.json`
   (`supabaseRef` nuovo), `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` in
   `server/wrangler.jsonc` e `web/.env.production` (URL e chiave pubblica nuovi). Il rilascio rifiuta qualsiasi
   combinazione incoerente (sezione 7, punto 2).
2. L'utente aggiorna `POSTGRES_DATABASE_URL` e `APP_SERVER_DATABASE_URL` nel file delle
   credenziali (utenti `postgres.<ref nuovo>` e `app_server.<ref nuovo>`, certificato
   del progetto nuovo); finché non lo fa, ogni strumento rifiuta.
3. Migrazioni con `--migrations-only`, password di `app_server`, ripristino con la CLI
   di W5, configurazione di Hyperdrive aggiornata dall'utente nella dashboard (host,
   utente `app_server.<ref nuovo>`, password), rilascio: nell'ordine di W5, con le
   migrazioni prima di tutto ciò che usa i ruoli applicativi. Prima del rilascio anche
   iscrizioni spente, OAuth server e URL del sito sul progetto nuovo (sezione 4, passi
   1a e 1b): l'anteprima di rilascio li controlla.
4. Il vecchio progetto non si cancella finché il nuovo non ha passato il collaudo.

## 9. Fase 3 e chiusura

**Fase 3, agenti** (subito dopo l'avvio della famiglia; W2 è unito con la #31). Dalla
spec di W2, «Passi esterni per la produzione (li fa l'utente)»; la chiave pubblica nel
Worker (suo passo 5) è già entrata con la PR di configurazione della fase 1, e ogni
rilascio controlla che coincida con quella della SPA. OAuth server, *Site URL* e
*Redirect URLs* (suoi passi 6–7) sono attivi dalla fase 1 (sezione 4, passo 1b); con
le iscrizioni spente.

1. Prove di W2 (suoi passi 3 e 10): collegamento di Claude Code, `session_whoami`,
   revoca con «Scollega». In più, **ricettario tramite agente** con Federico curatore:
   ricerca di una ricetta, creazione di una bozza, modifica, pubblicazione e
   archiviazione di una ricetta di prova; risultato atteso: la ricetta compare e poi
   sparisce dal ricettario nell'app, con canale `mcp` nelle versioni. La registrazione
   dinamica del client di Claude Code e l'accesso con l'account di Federico confermano
   in produzione che le iscrizioni spente non bloccano gli agenti; se falliscono per
   `signup_disabled`, ci si ferma e si sente l'utente.

Al passaggio al dominio `cosasimangia.qunidi.it` (ondata 3) *Site URL* e *Redirect
URLs* vanno aggiornati: annotazione in `server/README.md`.

**Rotazione delle password** (ultimo passo, fatta dall'utente, in un'ora senza uso):

1. Utente: Dashboard › Database › Settings › *Reset database password*; aggiorna
   `POSTGRES_DATABASE_URL` nel file.
2. Utente: nuova password di `app_server` (`openssl rand -hex 24`, `alter role
   app_server with password '…'` nell'editor SQL); aggiorna `APP_SERVER_DATABASE_URL`.
3. Utente, subito dopo: la stessa password nella dashboard di Cloudflare, Hyperdrive ›
   `cosasimangia` › *Settings*, campo della password di origine. Fra il passo 2 e il 3
   le connessioni nuove di Hyperdrive falliscono per pochi minuti. Coordinatore:
   `wrangler hyperdrive get <id>` (sola lettura).
4. Verifica: `GET /shopping-lists/000…000` (48 zeri) → 404; accesso e Menu sull'iPhone;
   il cron dell'ora successiva senza errori in `wrangler tail`; `--check-connection`;
   `prod-sql.ts --preview show-fingerprint`.

**Esito** in `server/README.md`, «Risorse di produzione»: nomi delle risorse, limite di
connessioni scelto e perché, indirizzo `workers.dev`, procedura di rilascio, data del
collaudo, data della rotazione.

## 10. Documenti da allineare (in implementazione)

- `server/README.md`: «Pubblicazione» (con `npm run release`, non più «dopo che
  l'integrazione di Supabase ha applicato le migrazioni» né `npm run deploy` a mano) e
  «Risorse di produzione».
- `supabase/README.md`: «Passi remoti» (migrazioni dentro `npm run release`,
  `bootstrap.sql` con `scripts/prod-sql.ts` dal coordinatore, impostazioni scritte dal
  caricamento invece che dall'app) e una sezione «Impronta e azzeramento». Nella
  sezione di W5 «Esportazione notturna e ripristino» i vecchi passi di ripristino in
  produzione (`supabase link`, `supabase db push`, `npm run deploy`) si sostituiscono
  con **un solo rimando** al runbook di questo piano («Cambio di progetto dopo un
  ripristino»): nessun secondo percorso durante un incidente.
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
- **Iscrizioni libere spente in produzione** (sezioni 2 e 13): gli account si creano
  solo dalla dashboard («Add user»), anche oltre il traguardo A finché non ci sono gli
  inviti. Decisione dell'utente, 12 ottobre 2026.

**Tecniche**

- **Pubblicazione** (sezioni 1, 10, 15): per il traguardo A a mano con `npm run release`
  in due tempi (anteprima con build, configurazione e prerequisiti verificati, poi
  applicazione dello stesso commit: migrazioni, deploy con il tag del commit, controlli),
  lanciato dal coordinatore dopo il «vai» dell'utente. Supera «automazione prima del
  traguardo A» (scelta dell'utente, 11 ottobre 2026); GitHub Actions si rivaluta quando
  i rilasci diventano frequenti.
- **Migrazioni sul progetto di produzione** (sezioni 1, 15): con la CLI di Supabase e
  `--db-url` verificata (`db push --dry-run`, poi `db push`) dentro `npm run release`,
  sempre prima del deploy del Worker; la prima volta da sole (`--migrations-only`),
  perché i ruoli del server nascono dalle migrazioni. Chiude la voce «modo di applicare le migrazioni»
  della sezione 15; la spec della piattaforma (sezione 7) e `server/README.md` vanno
  allineati.
- **Esecuzione delle operazioni sulla produzione** (sezione 1): le lancia il
  coordinatore con le credenziali in `.env.production.local`, scritto dall'utente e
  letto solo dagli strumenti; anteprima con impronta e «vai» prima di ogni scrittura;
  connessioni con TLS verificato; progetto di destinazione in un solo file versionato;
  rotazione delle password a fine collaudo.
- **Variabili della build** (sezione 1): `web/.env.production` versionato con URL e
  chiave pubblica di Supabase; la build di rilascio rifiuta override locali.
- **Import nel database** (sezione 11): `scripts/import/load.ts`, collegato come
  `postgres`, una transazione con anteprima a rollback legata agli input, catalogo come
  curatore con canale `import`,
  storico e menu in corso nel ruolo `app_job`, lock della generazione, dati della
  famiglia calcolati sull'intero ricettario d'origine e scritti solo in aggiunta;
  nessun valore del catalogo già presente sovrascritto.
- **Avvio a fasi** (sezione 10): infrastruttura senza famiglia (con bucket e chiave
  delle esportazioni), poi import e avvio della famiglia (dopo l'esportazione provata),
  poi agenti.
- **Azzeramento prima dell'uso** (sezione 8): ammesso solo se l'impronta di `app` è
  l'ultima impronta di avvio, prodotta dentro la transazione del bootstrap (solo dallo
  stato iniziale) o del caricamento di avvio con tutte le tabelle bloccate; i rilanci non
  la rinnovano.
- **Nessuna password negli argomenti dei processi** (sezione 1): password solo nel file
  delle credenziali, in `PGPASSWORD` dei processi figli e nelle dashboard; la password
  di origine di Hyperdrive la inserisce l'utente nella dashboard di Cloudflare.
- **SQL sulla produzione solo da una lista chiusa di script versionati** (sezione 1),
  letti dal commit con checkout pulito, con transazione decisa dallo strumento.
