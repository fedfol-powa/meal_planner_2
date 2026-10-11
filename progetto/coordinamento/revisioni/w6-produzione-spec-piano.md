# Revisione avversariale W6 — Messa in produzione

## Verdetto: DA RIFARE

L’impostazione generale rispetta le decisioni concordate, ma il piano non è ancora eseguibile in sicurezza. Sono presenti blocchi concreti nel controllo della destinazione delle migrazioni, nella connessione al database, nell’azzeramento, nell’ordine delle dipendenze e nel codice TypeScript proposto.

Le correzioni richieste non rimettono in discussione l’esecuzione del coordinatore, il file locale delle credenziali, l’anteprima con «vai», la CLI Supabase, i rilasci manuali o l’avvio in tre fasi.

## Perimetro e verifiche

Esaminati:

- spec e piano W6 nel worktree `produzione`, commit `26a51d633d22033109432084a251468e8a32b015`;
- sezioni pertinenti della specifica principale, piano generale nel checkout principale, registro del coordinamento e Task 10 della piattaforma;
- codice di import, scritture del catalogo, impostazioni, generazione, bootstrap, configurazione Worker e CI su `main`;
- spec W2 e W5 nei worktree indicati; rapporto della precedente prova W6.

Durante la revisione `main` è avanzato. Il confronto finale delle dipendenze usa `0bcbc94c3d610511d578e203b9e1b47ea7d06d13`, che comprende W5.

Revisione svolta senza modificare file, senza commit e senza operazioni remote. Per rispettare quest’ultimo vincolo non è stato interrogato Context7: le verifiche sulle librerie hanno usato i sorgenti installati localmente.

Due controlli eseguiti esclusivamente in memoria:

- il costruttore TypeScript proposto fallisce con Node `26.11.1`, errore `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`;
- Postgres.js, costruito con una URL sintetica nella forma prescritta dal runbook, risolve `ssl: false`. Non è stata aperta alcuna connessione.

Non sono stati eseguiti deploy, migrazioni, test sul database o build. Gli script W6 sono ancora codice proposto nel piano.

Nei riferimenti seguenti:

- **S** = `progetto/superpowers/specs/2026-10-11-messa-in-produzione.md`;
- **P** = `progetto/superpowers/plans/2026-10-11-messa-in-produzione.md`.

## Rilievi

### 1. Bloccante — Il controllo del progetto non protegge le migrazioni

**Riferimenti:** P:1197–1207; S:330–339; P:1426–1433.

`release` verifica il riferimento dentro `APP_SERVER_DATABASE_URL`, ma esegue `supabase db push` senza una destinazione esplicita. La CLI usa il progetto collegato nel checkout, non la URL verificata.

Una URL corretta nel file delle credenziali e un checkout collegato a un altro progetto superano quindi il controllo descritto. Il precedente `supabase link` del runbook non costituisce una verifica dei rilasci successivi.

**Perché conta:** viene meno il requisito esplicito di rifiutare il riferimento sbagliato prima di scrivere.

**Correzione proposta:** verificare la destinazione effettivamente usata dalla CLI prima di qualsiasi anteprima o applicazione; ripetere la verifica in `--apply`. Legare allo stesso progetto migrazioni, URL della SPA e configurazione del Worker. Aggiungere un test con URL corretta ma progetto collegato errato, verificando che nessun comando di migrazione venga eseguito.

### 2. Bloccante — Il caricamento remoto non abilita TLS

**Riferimenti:** P:170–187, 1036–1040, 1437; S:233–239. Riscontro: `node_modules/postgres/src/index.js:443–450`.

La URL proposta per `APP_SERVER_DATABASE_URL` non contiene una configurazione TLS; il costruttore Postgres.js non imposta `ssl`. Il controllo del bersaglio verifica soltanto suffissi di utente e host.

Con queste opzioni Postgres.js usa `ssl: false`, confermato localmente senza collegarsi. Se il pooler richiede TLS il caricamento fallisce; altrimenti manca la protezione del trasporto.

**Correzione proposta:** rendere obbligatoria una connessione TLS con verifica del certificato per ogni destinazione remota, coerentemente con W5. Validare anche protocollo, ruolo previsto, porta e database, impedendo opzioni della URL che contraddicano il controllo. Conservare l’eccezione esplicita per il database locale.

Aggiungere test delle opzioni effettivamente passate al client, non soltanto della descrizione dell’endpoint.

### 3. Bloccante — L’azzeramento può cancellare dati dopo l’inizio dell’uso

**Riferimenti:** P:1277–1298; S:373–380. Riscontri: `supabase/migrations/20261011100500_shopping.sql:36`, `server/src/catalogue/ingredients.ts:191–202`, `server/src/catalogue/write.ts:208–218`.

Il controllo delle «tracce d’uso» non copre diverse scritture reali:

- modifica di un voto;
- aggiunta di una voce libera alla spesa;
- modifica di impostazioni, libri o esclusioni;
- modifica di un ingrediente o di un’equivalenza;
- archiviazione di una ricetta.

Queste azioni possono avvenire senza creare alcuna delle cinque tracce controllate. Lo script procede comunque con `truncate … cascade` su tutte le famiglie e tutto il catalogo.

Inoltre il controllo precede il `TRUNCATE` senza impedire scritture concorrenti nell’intervallo.

**Perché conta:** lo script promette di rifiutare l’azzeramento dopo l’avvio, ma può cancellare contributi autentici.

**Correzione proposta:** definire una condizione verificabile di «solo dati del bootstrap/import», con perimetro atteso e protezione dalla concorrenza. In caso di dubbio deve rifiutare. Testare separatamente ciascuna delle scritture sopra e una scrittura concorrente, verificando che nulla venga cancellato.

### 4. Bloccante — La fase 1 pubblica già W5, ma il bucket viene creato nella fase 2

**Riferimenti:** S:65–73, 143–146; P:1455–1459, 1473–1478. Riscontri su `main` `0bcbc94`: `server/wrangler.jsonc:9–10,34–35`; spec W5:431–433.

Il runbook pubblica il `main` corrente nella fase 1. Dopo il merge W5, quel codice contiene già il binding al bucket `cosasimangia-backups` e il cron notturno. La creazione del bucket e l’impostazione della chiave sono invece rinviate a R11.

W5 prescrive espressamente di creare il bucket prima della prima pubblicazione successiva al merge.

**Correzione proposta:** mantenere le tre fasi, ma spostare nella fase infrastrutturale i prerequisiti necessari al codice effettivamente pubblicato. La prova con esportazione e ripristino può restare nella fase 2, prima dell’import.

Il controllo di rilascio deve riconoscere binding e prerequisiti mancanti prima di applicare migrazioni o pubblicare.

### 5. Bloccante — Il codice proposto non parte con il comando Node previsto

**Riferimenti:** P:706; P:17, 1008–1009. Riscontro: `tsconfig.base.json:11`, `erasableSyntaxOnly: true`.

Il piano propone:

```ts
class DryRun extends Error {
  constructor(readonly result: LoadResult) {
    super('dry run');
  }
}
```

La parameter property non è supportata dall’esecuzione TypeScript diretta in modalità strip-only. La prova con Node `26.11.1` restituisce `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. È incompatibile anche con `erasableSyntaxOnly`.

Poiché `load.ts` importa `run.ts`, il problema impedisce anche `--check-connection`.

**Correzione proposta:** dichiarare il campo separatamente e assegnarlo nel costruttore. Aggiungere una prova del comando Node reale: il solo test tramite Vitest non verifica questa compatibilità.

### 6. Importante — Il rilancio sovrascrive equivalenze curate nel database

**Riferimenti:** P:656–663; S:256–257, 300–306. Riscontro su `main`: `server/src/catalogue/ingredients.ts:184–202`.

Il caricamento salta un’equivalenza soltanto quando tutti i valori coincidono. Se un curatore ne ha cambiato fattore, destinazione o fonte, viene chiamata `setEquivalence`, che aggiorna la riga esistente o la sostituisce.

Questa è idempotenza rispetto agli stessi input, non conservazione dei contributi successivi. Contraddice la fonte di verità nel database e il requisito di import senza sovrascritture.

**Correzione proposta:** riconoscere l’esistenza tramite la chiave logica dell’equivalenza. Se esiste con valori diversi, conservarla e riportare la divergenza. Provare un import, una modifica effettuata dal curatore e un rilancio: valore e versione devono restare invariati.

### 7. Importante — Il caricamento non si coordina con generazione e modifiche concorrenti

**Riferimenti:** P:840–847, 876–890; S:151–162, 302–310. Riscontro su `main`: `server/src/menu/generation.ts:9–11,61–67,80–88`.

La generazione prende un advisory lock per famiglia; il caricamento non lo prende. Il controllo delle settimane generate è una lettura separata dalle scritture. Analogamente, le impostazioni vengono lette senza bloccare la riga prima di decidere quali chiavi aggiungere.

La finestra concordata e il divieto di aprire l’app riducono il rischio del primo avvio, ma non proteggono:

- un’esecuzione che oltrepassa la finestra;
- una generazione concorrente dopo il controllo;
- i rilanci dopo l’avvio, esplicitamente ammessi;
- una modifica delle impostazioni tra lettura e scrittura.

**Correzione proposta:** usare il medesimo lock della generazione prima dei controlli e proteggere la lettura delle impostazioni fino alla scrittura, con un ordine dei lock coerente. Definire anche cosa succede se bootstrap o caricamento falliscono e la finestra sta terminando: non lasciare una famiglia incompleta al cron successivo.

Servono test concorrenti con due connessioni, oltre al caso già generato.

### 8. Importante — I test d’integrazione proposti si contraddicono e alcune verifiche non entrano in CI

**Riferimenti:** P:552–588, 793–827, 1248–1263, 1377–1381. Riscontri: `server/test/support/db.ts:94–96`; `.github/workflows/ci.yml:23–30`.

La suite usa un solo `beforeAll`. Il test di P:575 carica e conferma i dati; successivamente il test di P:793 pretende ancora impostazioni e due settimane nuove. Con l’implementazione completa quei dati sono già presenti.

Il test della ricetta assente modifica il menu della stessa settimana già importata: il caricamento salta la settimana prima di esaminarne i pasti, quindi non lancia l’errore atteso.

Il test `pendingReview` riusa gli stessi slug già caricati: può passare senza dimostrare che il blocco impedisca davvero una nuova pubblicazione.

Infine, il piano non aggiunge alla CI il test shell dell’azzeramento, costruito intorno a Podman, mentre la CI corrente non lo esegue. `db.close()` chiude soltanto la connessione: non pulisce le fixture.

**Correzione proposta:** fixture indipendenti per test, pulizia esplicita e casi di rilancio contenuti nello stesso test. Integrare le prove distruttive in uno stack isolato e compatibile con la CI. Aggiungere verifiche di rollback dopo un errore successivo alle prime scritture, rifiuto dei ruoli errati e assenza di credenziali negli errori dei processi reali.

### 9. Importante — La verifica della build non controlla la configurazione effettiva

**Riferimenti:** P:1157–1169, 1201–1209; S:332, 340–342. Riscontri: `web/src/env.ts:1–7`; `node_modules/vite/dist/node/chunks/node.js:6055–6091`.

Il piano valida il contenuto di `web/.env.production`, ma Vite può ricevere valori prevalenti da `.env.production.local` e dall’ambiente del processo.

La successiva ricerca dell’host in un qualsiasi asset non dimostra che la SPA usi quella configurazione, né che usi la chiave pubblica corretta. Un host corretto con una chiave locale o errata supera quel controllo.

Inoltre la build avviene dopo la scrittura delle migrazioni: un errore locale di compilazione viene scoperto quando una parte del rilascio è già applicata.

**Correzione proposta:** validare e fissare i valori effettivi della build, neutralizzando o rifiutando gli override inattesi. Costruire e verificare l’artefatto prima delle scritture in produzione. Testare esplicitamente override locali, chiave vuota/errata e fallimento della build senza chiamate di deploy o migrazione.

### 10. Importante — Il controllo «database» può restituire verde senza interrogare Hyperdrive

**Riferimenti:** S:344–348, 409; P:1174–1186, 1461, 1534. Riscontro su `main`: `server/src/shopping/bring-page.ts:17–29`.

Il piano usa `/shopping-lists/<token inesistente>` come prova del collegamento al database, senza prescrivere la forma del token.

La rotta interroga il database soltanto per token di **48 caratteri esadecimali**. Un valore come `inesistente` restituisce 404 direttamente, anche con Hyperdrive completamente guasto.

**Correzione proposta:** indicare un token concreto, valido nel formato ma assente, e usarlo sia nei comandi copiabili sia nei test. Il test deve distinguere il percorso che interroga il database da quello che rifiuta il formato.

### 11. Importante — La prova del `.gitignore` può eliminare file delle credenziali già esistenti

**Riferimento:** P:1225–1233.

La sequenza esegue `touch` e poi `rm` su:

- `.env.production.local`;
- `web/.env.production.local`;
- `web/.env.production`.

`touch` non garantisce che il file fosse assente. Se esiste già, la prova ne aggiorna la data e poi lo cancella. L’affermazione «i file creati sono vuoti» non è quindi garantita.

**Correzione proposta:** verificare i percorsi con `git check-ignore --no-index`, senza creare file, oppure usare un repository temporaneo isolato. Nessun test deve cancellare i percorsi reali delle credenziali o della configurazione.

### 12. Importante — Il ritorno indietro non è completo per primo deploy e ripristino su un altro progetto

**Riferimenti:** S:130–133, 356–363; P:1461, 1504–1507. Confronto: spec W5:349–357, 412–427.

Per il primo deploy viene indicato `wrangler rollback`, ma non esiste una versione precedente. Manca l’azione concreta per fermare l’app e i cron dopo un primo rilascio difettoso.

Per il danno grave si rimanda a W5, che ripristina in una destinazione vuota e descrive il passaggio a un nuovo progetto. W6, però, fissa il vecchio riferimento nei controlli di import, SQL e rilascio. Il runbook non spiega come aggiornare questi controlli durante quel passaggio.

**Correzione proposta:** distinguere e completare:

1. arresto o rimozione controllata del primo Worker;
2. rollback a una versione identificata, con compatibilità dello schema verificata;
3. ripristino W5 e cambio di progetto autorizzato, aggiornando anche le protezioni W6 e la destinazione della CLI.

Il cambio di riferimento deve essere esplicito e revisionato, senza indebolire il rifiuto del progetto sbagliato.

### 13. Importante — Il collaudo può attribuire al cron una settimana generata dalla prima apertura

**Riferimenti:** S:194–206; P:1500–1503. Riscontro su `main`: `server/src/menu/generation.ts:80–92`.

Il controllo del giovedì consiste nel trovare la settimana successiva nell’app. La prima apertura può però generarla pigramente dopo un fallimento del cron. Quel controllo non dimostra quindi che il job del mercoledì abbia funzionato.

La checklist omette inoltre prove esplicite di voto e propagazione della media, ritorno online della coda spesa, Condividi, cambio lingua/unità e gestione reale del ricettario tramite agente. Sono percorsi del traguardo A, non funzionalità dell’ondata 3.

**Correzione proposta:** prima di aprire il menu verificare il job e la settimana già presenti, con esito e orario coerenti. Integrare una checklist con risultato atteso per i percorsi citati, distinguendo ciò che è già coperto in CI da ciò che richiede iPhone, Worker pubblicato e client MCP.

Per la spesa verificare la sincronizzazione su un secondo accesso, non soltanto la spunta sul dispositivo offline.

### 14. Importante — L’anteprima dell’import non è legata ai dati poi applicati

**Riferimenti:** P:731–735, 905–907, 1494–1498; S:238–240.

Anteprima e applicazione rileggono autonomamente il ricettario, i menu del progetto di origine e i file di revisione. Il «vai» non è associato a una fotografia o a un’impronta degli input mostrati.

Un aggiornamento del progetto di origine tra i due comandi cambia ciò che verrà scritto, pur usando gli stessi argomenti. Anche la copia compilata del bootstrap può cambiare tra anteprima e applicazione.

**Correzione proposta:** associare l’approvazione a input identificati e immutabili, oppure verificarne l’impronta prima dell’applicazione e richiedere una nuova anteprima se cambia. Includere data, famiglia, curatore e destinazione. Provare il caso «file cambiato dopo l’anteprima» senza scritture.

### 15. Minore — Il report perde parte delle informazioni R4 già disponibili

**Riferimenti:** P:733–738, 858–859, 995–1000. Riscontri: `scripts/import/report.ts:31–45`; specifica principale:1870–1886.

W6 conserva i `findings` di `buildFamilyData`, ma scarta `recipeFindings` e il report già restituito da `runImport`. Il nuovo report non elenca quindi gli adattamenti `casa` con URL; le ricette provate senza data sono conteggiate senza un elenco equivalente a quello esistente.

Si perdono anche motivi delle bozze e altre ambiguità utili a comprendere l’anteprima.

**Correzione proposta:** riusare o incorporare il report dell’import, aggiungendovi gli esiti delle scritture. Testare nel report finale entrambi i casi R4, i motivi delle bozze e le voci scartate.

### 16. Minore — Istruzioni di bootstrap e comandi non sono ancora copiabili senza interpretazioni

**Riferimenti:** P:1319, 1323–1339, 1431–1433, 1484–1493; S:176–189. Riscontro: `supabase/scripts/bootstrap.sql:19–28,61–79`.

Sono presenti incongruenze operative:

- R15 raccoglie UID, nome, lingua e ruolo, ma `bootstrap.sql` richiede le email;
- il bootstrap è descritto come un rilancio senza cambiamenti, ma aggiorna nome, lingua e ruolo familiare delle persone già presenti;
- il file SQL di controllo è mostrato su una sola riga, mentre `prod-sql.sh` richiede righe esatte separate `begin;` e `commit;`;
- l’uso dichiarato di `prod-sql.sh` include `--local <file>`, ma il codice usa variabili d’ambiente;
- alcuni esempi di `release --apply` omettono lo SHA obbligatorio.

**Correzione proposta:** allineare input, comportamento e sintassi effettivi; fornire blocchi completi con directory di esecuzione, variabili necessarie ed esito atteso. Esplicitare anche l’assegnazione iniziale di `app_admin` a Federico, prevista dalla specifica principale.

## Punti da decidere dal coordinatore o dall’utente

1. **Preferenze condizionali nelle note dell’origine.** La specifica principale, sezione 8, richiede di trasferire le esclusioni familiari. L’origine contiene almeno la nota di `ricette.yaml:248`, che vieta una ricetta nelle cene per quattro ma la ammette per due adulti. `buildFamilyData` non produce esclusioni e W6 non definisce una mappatura. Serve una decisione esplicita per queste preferenze non rappresentabili come esclusione globale: non vanno né perse silenziosamente né trasformate in un divieto più ampio.

2. **Due ricette nello stesso pasto storico.** S:283–287 e P:327–334 scelgono la prima per slug e scartano l’altra. È una riduzione dei dati, non una semplice scelta tecnica. Va confermata dal coordinatore o dall’utente e riportata nelle decisioni da consolidare; in alternativa il caso deve restare una divergenza da risolvere prima del caricamento.

3. **Rinvio dell’avvio oltre la finestra.** La finestra lunedì–mercoledì entro le 19 resta confermata. Occorre scegliere la procedura operativa quando bootstrap riesce ma caricamento o collaudo iniziale non terminano: rimuovere la famiglia ancora inutilizzata oppure sospendere esplicitamente la generazione fino a un nuovo tentativo.

## Condizioni per la prossima revisione

Prima dell’approvazione servono un piano corretto sui rilievi bloccanti e test che dimostrino almeno:

- rifiuto della destinazione effettiva errata;
- connessioni remote protette e credenziali assenti dagli output;
- esecuzione dei comandi Node reali;
- import atomico, conservativo e coordinato con la generazione;
- rifiuto dell’azzeramento dopo qualsiasi uso;
- build e prerequisiti verificati prima delle scritture;
- primo deploy e recupero descritti fino al ritorno a un servizio verificabile.

La revisione dell’implementazione dovrà poi verificare questi comportamenti sul codice effettivo e in CI.