# Revisione avversariale W5 — Esportazione notturna in R2

**Verdetto: DA RIFARE**

Il piano richiede correzioni prima dell’implementazione: la procedura documentata non può ripristinare una destinazione appena preparata, la CLI può divulgare dati negli errori e il recupero conserva identificativi di transazione non trasferibili fra database. Anche alcuni test proposti non sono eseguibili come scritti o non verificano le garanzie dichiarate.

Revisione in sola lettura della spec e del piano al commit `dbf9d706`, confrontati con `main` al commit `90322a51`, i brief, la specifica principale e il piano generale nel checkout principale. Nessun file modificato, nessun commit.

Nel rapporto:

- **Spec**: `progetto/superpowers/specs/2026-10-11-esportazione-r2.md`.
- **Piano**: `progetto/superpowers/plans/2026-10-11-esportazione-r2.md`.

## Rilievi

### 1. Bloccante — La destinazione preparata secondo la procedura viene sempre rifiutata

**Riferimenti:** [Spec:264](/Users/fedfol/Projects/meal_planner_2/.worktrees/esportazione/progetto/superpowers/specs/2026-10-11-esportazione-r2.md:264), [Piano:1323](/Users/fedfol/Projects/meal_planner_2/.worktrees/esportazione/progetto/superpowers/plans/2026-10-11-esportazione-r2.md:1323), [Piano:1585](/Users/fedfol/Projects/meal_planner_2/.worktrees/esportazione/progetto/superpowers/plans/2026-10-11-esportazione-r2.md:1585); su `main`, [20261011100700_versions.sql:12](/Users/fedfol/Projects/meal_planner_2/supabase/migrations/20261011100700_versions.sql:12).

**Problema.** La CLI rifiuta qualsiasi riga nelle tabelle `app`. La procedura prepara la destinazione applicando le migrazioni, oppure con `supabase db reset --no-seed`. Ma una migrazione inserisce già la riga di `app.catalogue_state`: escludere il seed non elimina quell’inserimento.

**Impatto.** Il ripristino documentato termina con `not_empty` anche su un progetto nuovo. Il test automatico nasconde il problema perché esegue un `wipe` aggiuntivo, assente dalla procedura reale.

**Correzione proposta.** Definire una preparazione precisa della destinazione che gestisca i dati iniziali delle migrazioni senza consentire la sovrascrittura indiscriminata di dati esistenti. Provare in CI il percorso completo: destinazione con migrazioni reali, preparazione documentata, CLI `--dry-run`, ripristino effettivo. Il test deve usare gli stessi passi della procedura.

### 2. Importante — La CLI stampa errori che possono contenere dati personali

**Riferimenti:** [Piano:22](/Users/fedfol/Projects/meal_planner_2/.worktrees/esportazione/progetto/superpowers/plans/2026-10-11-esportazione-r2.md:22), [Piano:1537](/Users/fedfol/Projects/meal_planner_2/.worktrees/esportazione/progetto/superpowers/plans/2026-10-11-esportazione-r2.md:1537).

**Problema.** Il ramo per gli errori inattesi esegue `console.error(error)`. Gli errori PostgreSQL possono contenere valori delle righe in `message`, `detail` e contesto SQL; Postgres.js conserva questi campi nell’oggetto errore. Un errore di conversione, unicità o vincolo durante il caricamento può quindi stampare dati dell’esportazione.

**Impatto.** Viola il requisito «mai dati, chiavi o messaggi d’errore». Il rischio riguarda stderr e i suoi eventuali archivi, anche se i log del Worker usano correttamente `errorCode`.

**Correzione proposta.** Stampare esclusivamente fase, codice e diagnostica strutturale consentita. Non stampare oggetti errore, `detail`, query o parametri. Aggiungere test con errori contenenti sentinelle nei campi sensibili e verificare che nessuna compaia in stdout/stderr. Evitare inoltre esempi operativi che invitino a inserire chiavi e password letterali nella cronologia della shell.

### 3. Importante — Gli identificativi di transazione ripristinati possono impedire l’aggiornamento delle cache

**Riferimenti:** [Spec:298](/Users/fedfol/Projects/meal_planner_2/.worktrees/esportazione/progetto/superpowers/specs/2026-10-11-esportazione-r2.md:298), [Piano:1344](/Users/fedfol/Projects/meal_planner_2/.worktrees/esportazione/progetto/superpowers/plans/2026-10-11-esportazione-r2.md:1344); su `main`, [20261011100700_versions.sql:17](/Users/fedfol/Projects/meal_planner_2/supabase/migrations/20261011100700_versions.sql:17) e [riga 29](/Users/fedfol/Projects/meal_planner_2/supabase/migrations/20261011100700_versions.sql:29).

**Problema.** Il ripristino copia anche `families.data_version_xid` e `catalogue_state.version_xid`. I trigger confrontano questi valori con `pg_current_xact_id()` per deduplicare gli incrementi nella stessa transazione.

Gli `xid8` sono univoci nella vita del singolo cluster, non fra cluster diversi. Nel nuovo database una transazione può quindi avere lo stesso identificativo di un marcatore importato. [Documentazione PostgreSQL](https://www.postgresql.org/docs/17/datatype-oid.html).

**Impatto.** Una modifica successiva al ripristino può non incrementare il contatore: l’app restituisce «invariato» mentre i dati sono cambiati. Il confronto immediato dell’esportazione non rileva questo difetto.

**Correzione proposta.** Conservare i contatori applicativi e reinizializzare i marcatori di deduplicazione secondo una regola esplicita. Aggiungere un test che simuli la coincidenza e provi una mutazione dopo il recupero. Va concordata e documentata l’eccezione al confronto byte per byte per questi campi operativi.

### 4. Importante — Il test pgTAP non dispone dei privilegi necessari per eseguire le asserzioni

**Riferimenti:** [Piano:120](/Users/fedfol/Projects/meal_planner_2/.worktrees/esportazione/progetto/superpowers/plans/2026-10-11-esportazione-r2.md:120), [Piano:156](/Users/fedfol/Projects/meal_planner_2/.worktrees/esportazione/progetto/superpowers/plans/2026-10-11-esportazione-r2.md:156); su `main`, [20261011100000_foundation.sql:20](/Users/fedfol/Projects/meal_planner_2/supabase/migrations/20261011100000_foundation.sql:20), [setup.psql:8](/Users/fedfol/Projects/meal_planner_2/supabase/tests/helpers/setup.psql:8).

**Problema.** Il test esegue `SET LOCAL ROLE app_backup` dalla connessione amministrativa. La migrazione concede il ruolo ad `app_server`, ma non abilita `postgres` a usarlo. Il repository gestisce già esplicitamente questa particolarità per `app_job`: il creatore non superuser riceve automaticamente una membership amministrativa con `SET FALSE` e `INHERIT FALSE`. [Documentazione PostgreSQL](https://www.postgresql.org/docs/17/role-attributes.html).

Inoltre, dopo il cambio di ruolo il test invoca pgTAP, ma gli helper concedono `USAGE` su `extensions` soltanto ad `app_job`, non ad `app_backup`.

**Impatto.** Il Task 1 non arriva al verde secondo il piano; il fallimento riguarda l’infrastruttura del test prima delle verifiche di sicurezza.

**Correzione proposta.** Nel setup transazionale del test concedere i soli privilegi necessari per impersonare `app_backup` e usare pgTAP, oppure verificare il comportamento tramite una connessione `app_server`. Non allargare i privilegi di produzione per soddisfare gli helper. Eseguire l’intero file sulla configurazione Supabase della CI.

### 5. Importante — La soglia di 50 MB non garantisce il rispetto della memoria del Worker

**Riferimenti:** [Spec:234](/Users/fedfol/Projects/meal_planner_2/.worktrees/esportazione/progetto/superpowers/specs/2026-10-11-esportazione-r2.md:234), [Piano:353](/Users/fedfol/Projects/meal_planner_2/.worktrees/esportazione/progetto/superpowers/plans/2026-10-11-esportazione-r2.md:353), [Piano:849](/Users/fedfol/Projects/meal_planner_2/.worktrees/esportazione/progetto/superpowers/plans/2026-10-11-esportazione-r2.md:849).

**Problema.** La spec considera sicuri 50 MB stimando un consumo di 2–3 volte il documento: già il limite superiore supera 128 MB. Il codice mantiene le stringhe delle tabelle, compone il documento, lo codifica, crea un `Blob` e produce buffer compressi, cifrati e finali. Non esiste una misura che sostenga il limite dichiarato.

Il controllo avviene dopo la lettura completa e la codifica UTF-8; sopra soglia registra un log e prosegue.

**Impatto.** L’esecuzione può esaurire la memoria prima del log o del `catch`, impedendo nuove esportazioni. I 128 MB valgono per isolate, che può servire più invocazioni concorrenti. [Limiti Workers](https://developers.cloudflare.com/workers/platform/limits/).

**Correzione proposta.** Stabilire un limite sostenibile misurato in workerd, includendo documenti poco comprimibili e memoria preesistente. Applicare un controllo prima delle allocazioni più costose e definire l’esito quando il limite viene superato. Misurare separatamente memoria, CPU e durata.

Correggere anche il limite CPU dichiarato: per questo cron sul piano a pagamento la documentazione indica fino a 15 minuti, non il default HTTP di 30 secondi.

### 6. Importante — Il recupero su un nuovo progetto non riconfigura tutti i collegamenti dell’app

**Riferimenti:** [Spec:307](/Users/fedfol/Projects/meal_planner_2/.worktrees/esportazione/progetto/superpowers/specs/2026-10-11-esportazione-r2.md:307), [Piano:1600](/Users/fedfol/Projects/meal_planner_2/.worktrees/esportazione/progetto/superpowers/plans/2026-10-11-esportazione-r2.md:1600); su `main`, [server/src/app.ts:48](/Users/fedfol/Projects/meal_planner_2/server/src/app.ts:48), [web/src/env.ts:1](/Users/fedfol/Projects/meal_planner_2/web/src/env.ts:1).

**Problema.** La procedura aggiorna Hyperdrive e la configurazione Auth, ma omette:

- `SUPABASE_URL` del Worker, da cui dipendono issuer, JWKS e discovery OAuth;
- `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` della SPA;
- ricostruzione e pubblicazione della SPA con i nuovi valori.

**Impatto.** Il database può essere recuperato correttamente mentre il browser continua a contattare il progetto perso o il Worker rifiuta i token del nuovo progetto.

**Correzione proposta.** Elencare tutte le configurazioni dipendenti dal progetto e il relativo ordine di aggiornamento e pubblicazione. Il collaudo deve verificare login, lettura autenticata di famiglia/menu e discovery MCP attraverso l’app riconfigurata.

### 7. Importante — Il confronto «byte per byte» non è realizzato e il controllo Auth è più debole dell’uguaglianza

**Riferimenti:** [Spec:298](/Users/fedfol/Projects/meal_planner_2/.worktrees/esportazione/progetto/superpowers/specs/2026-10-11-esportazione-r2.md:298), [Piano:1145](/Users/fedfol/Projects/meal_planner_2/.worktrees/esportazione/progetto/superpowers/plans/2026-10-11-esportazione-r2.md:1145), [Piano:1389](/Users/fedfol/Projects/meal_planner_2/.worktrees/esportazione/progetto/superpowers/plans/2026-10-11-esportazione-r2.md:1389).

**Problema.** Il test commentato «byte for byte» usa `JSON.parse(...).toEqual(...)`: perde precisione numerica e confronta oggetti, non byte. Inoltre rilegge e confronta soltanto le tabelle `app`, senza un confronto equivalente dei contenuti Auth.

In SQL, `to_jsonb(r) @> e` accetta anche differenze dentro i campi esportati: per esempio elementi aggiuntivi negli array o proprietà aggiuntive nei metadati annidati. La tolleranza riguarda quindi più delle sole colonne nuove di Auth. [Semantica del contenimento JSONB](https://www.postgresql.org/docs/17/datatype-json.html).

**Impatto.** Le verifiche possono accettare differenze incompatibili con la garanzia concordata. L’asserzione specifica su un numero grande non rende esatto il confronto generale.

**Correzione proposta.** Confrontare stringhe o hash della serializzazione deterministica, includendo Auth. Se si ammettono nuove colonne Auth, proiettare soltanto le colonne esportate e confrontarne esattamente i valori, senza contenimento ricorsivo. Aggiungere casi con numeri adiacenti oltre la precisione JavaScript e metadati Auth con array e oggetti annidati.

### 8. Importante — La suite non prova la fotografia coerente né il percorso positivo della CLI

**Riferimenti:** [Piano:466](/Users/fedfol/Projects/meal_planner_2/.worktrees/esportazione/progetto/superpowers/plans/2026-10-11-esportazione-r2.md:466), [Piano:1125](/Users/fedfol/Projects/meal_planner_2/.worktrees/esportazione/progetto/superpowers/plans/2026-10-11-esportazione-r2.md:1125), [Piano:1463](/Users/fedfol/Projects/meal_planner_2/.worktrees/esportazione/progetto/superpowers/plans/2026-10-11-esportazione-r2.md:1463).

**Problema.** Il test della fotografia confronta conteggi senza scritture concorrenti: passerebbe anche con `READ COMMITTED`. I test CLI verificano soltanto rifiuti; non provano commit riuscito e annullamento completo del `--dry-run`. Le fixture del nuovo test non inseriscono esplicitamente una riga in `ingredient_unit_equivalences`, quindi non dimostrano il recupero della colonna generata di `app`.

**Impatto.** Sono possibili regressioni proprio sulle garanzie principali del backup, pur mantenendo verde la suite.

**Correzione proposta.** Prevedere nel ciclo TDD:

- una scrittura concorrente coordinata fra due letture, che renda il test rosso senza `REPEATABLE READ`;
- una riga con colonna generata valorizzata;
- CLI riuscita su destinazione separata e verifica dei dati dopo il commit;
- `--dry-run` riuscito e destinazione invariata;
- errore dopo inserimenti parziali e verifica del rollback completo.

### 9. Importante — Il commit necessario al recupero viene individuato con una data non affidabile

**Riferimenti:** [Spec:129](/Users/fedfol/Projects/meal_planner_2/.worktrees/esportazione/progetto/superpowers/specs/2026-10-11-esportazione-r2.md:129), [Piano:1585](/Users/fedfol/Projects/meal_planner_2/.worktrees/esportazione/progetto/superpowers/plans/2026-10-11-esportazione-r2.md:1585), piano generale, «Interfacce decise» e registro dell’integrazione Supabase.

**Problema.** `git log --until=<data> -1 main` trova un commit Git, non il codice effettivamente pubblicato né le migrazioni effettivamente applicate quella notte. Il coordinamento documenta pubblicazione e applicazione delle migrazioni come passi distinti; l’applicazione automatica al merge è disattivata. `workerVersion` contiene un UUID Cloudflare, senza una procedura definita per ricondurlo al commit.

**Impatto.** Durante un incidente si può preparare uno schema incompatibile con l’archivio. La CLI lo rifiuterà, ma la procedura non indica come individuare quello corretto.

**Correzione proposta.** Registrare una relazione durevole fra versione pubblicata, SHA Git e migrazioni applicate, e documentare come ricavarla dall’esportazione. Provare il recupero di un archivio precedente dopo l’aggiunta di una migrazione.

### 10. Minore — Alcuni comandi operativi non sono copiabili come indicato

**Riferimenti:** [Piano:297](/Users/fedfol/Projects/meal_planner_2/.worktrees/esportazione/progetto/superpowers/plans/2026-10-11-esportazione-r2.md:297), [Piano:1583](/Users/fedfol/Projects/meal_planner_2/.worktrees/esportazione/progetto/superpowers/plans/2026-10-11-esportazione-r2.md:1583), [Piano:1623](/Users/fedfol/Projects/meal_planner_2/.worktrees/esportazione/progetto/superpowers/plans/2026-10-11-esportazione-r2.md:1623).

**Problema.**

- Il Task 2 lancia Vitest dalla radice con la configurazione server, che non imposta `root` e cerca `src/**/*.test.ts` e `test/**/*.test.ts` rispetto alla directory corrente.
- Il download antepone `exports/` alla «chiave dal log», ma quella chiave contiene già `exports/`.
- La procedura scarica `export.bin` da `server/`, poi usa un percorso CLI relativo alla radice senza esplicitare il cambio di directory e il percorso del file.

**Correzione proposta.** Usare `npm test -w server -- src/backup/format.test.ts`; distinguere chiaramente chiave completa e nome del file; indicare directory di esecuzione e percorsi coerenti in tutti i comandi.

## Punti da decidere dal coordinatore o dall’utente

1. **Marcatori `*_xid`:** approvare il trattamento dei campi operativi durante il ripristino e precisare il perimetro del confronto byte per byte.
2. **Limite operativo dell’esportazione:** stabilire, dopo le misure, dimensione supportata e comportamento oltre soglia.
3. **Collaudo di produzione:** rendere esplicito il criterio di completamento con esportazione vera, chiave recuperata dal gestore di password e app funzionante sul progetto ripristinato. La prova locale e quella successiva alla pubblicazione devono avere responsabilità e stato distinti.

## Verifiche e limiti della revisione

Sono coerenti con le decisioni ricevute la separazione `app_backup`/`app_job`, la funzione Auth con `search_path` vuoto ed esecuzione revocata a PUBLIC, il posizionamento di `REPEATABLE READ` prima delle letture, lo smistamento dei cron, l’esclusione delle colonne generate dall’inserimento e il blocco pgTAP contro nuove sequenze in `app`.

La conservazione proposta pagina l’elenco e cancella solo dopo un `put` riuscito; i test coprono il mancato caricamento e il fallimento della pulizia. I flag Wrangler per bucket UE e download risultano supportati; il difetto dei comandi riguarda soprattutto la composizione dei percorsi.

Consultata la documentazione tramite Context7. Eseguita una verifica TypeScript degli estratti in memoria, senza creare file: conferma gli adattamenti `BufferSource`/`BlobPart` già anticipati dal piano. Non eseguiti test d’integrazione o ripristini: l’implementazione è ancora nel piano e l’accesso al socket Podman è risultato vietato dalla sandbox. Nessuna operazione remota eseguita.