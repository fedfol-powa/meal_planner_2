**Verdetto: DA RIFARE**

La direzione funzionale è coerente con le decisioni del coordinamento, ma spec e piano richiedono una revisione prima dell’implementazione: mancano interfacce necessarie, alcuni ritentativi non sono idempotenti e la suddivisione delle PR non supera i controlli già presenti in main.

**Perimetro e riferimenti**

Revisione in sola lettura del commit `f88a22f`, individuato con `git log origin/main..HEAD -- progetto/superpowers/specs/ progetto/superpowers/plans/`. Confronto con `main` e `origin/main` a `48d1e5a`, con i brief richiesti e con il piano generale del checkout principale.

Nel rapporto:

- **S** indica la [spec di dettaglio](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricettario-mcp/progetto/superpowers/specs/2026-10-11-ricettario-mcp.md).
- **P** indica il [piano di implementazione](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricettario-mcp/progetto/superpowers/plans/2026-10-11-ricettario-mcp.md).
- I riferimenti al codice sono relativi al checkout principale `/Users/fedfol/Projects/meal_planner_2/`. Per `domain/`, `contract/`, `server/` e `supabase/` ho verificato l’assenza di differenze rispetto al worktree.

**Rilievi**

1. **Bloccante — Manca la lettura dell’ingrediente necessaria per modificarlo.**

   **Riferimenti:** S:201–213; P:733–765.

   `searchIngredients` restituisce soltanto nome localizzato, reparto, dispensa e varietà. `updateIngredient` richiede invece versione di partenza, entrambi i nomi e tutti i sinonimi; `removeEquivalence` richiede l’identificativo dell’equivalenza. Nessuna lettura dell’area restituisce `ingredientView`.

   Un agente che riprende il lavoro in una nuova conversazione non può correggere un ingrediente esistente preservandone i dati. Le risposte delle mutazioni non sostituiscono una lettura: usare una scrittura per recuperare lo stato può alterarlo.

   **Correzione proposta:** aggiungere `getIngredient({ ingredientId, knownVersion? }) → versionedOutput(ingredientView)`, riservata ai curatori, e aggiornare guida, contratto e test. Provare il percorso ricerca → lettura → modifica da una sessione nuova, conservando sinonimi ed equivalenze.

2. **Bloccante — Rimandare il supporto web di `not_allowed` alla seconda PR rompe la prima.**

   **Riferimenti:** S:117–121, 464–465, 505–508; P:138–179, 2284; main `web/src/api/errors.ts:5–18,55–56`.

   Main contiene un controllo TypeScript che impone la copertura di ogni `ErrorCode` in `CONTRACT_ERROR_CODES`. Aggiungere `not_allowed` al contratto senza aggiornare quel file rende impossibile il `npm run typecheck` richiesto per la PR server. Anche `errorKey` e il test delle traduzioni dipendono dal nuovo messaggio.

   **Correzione proposta:** includere nella PR server l’aggiornamento minimo di `web/src/api/errors.ts` e dei dizionari italiano/inglese. Il cancello delle schermate non deve rinviare la compatibilità con un errore condiviso.

3. **Importante — L’interfaccia prodotta per l’import perde l’identità degli ingredienti e non coincide fra spec e piano.**

   **Riferimenti:** S:103–116; P:1157–1159, 2159–2167; main `domain/src/recipe/ingredient.ts:8–14`, `domain/src/recipe/projection.ts:82–92`, `scripts/import/bundle.ts:85`.

   Il bundle identifica gli ingredienti con uno slug stabile; `createIngredient` lo rigenera dal nome e non accetta lo slug dell’import. Esiste già un caso concreto: `olio-extravergine-di-oliva` ha nome «Olio extravergine d’oliva», dal quale il piano genera `olio-extravergine-d-oliva`. Il successivo confronto con `existing.ingredients` non riconosce l’ingrediente importato.

   Inoltre S descrive `CreateIngredientInput` come input del contratto, che usa `id`; P richiede `ingredientId`. S promette per `saveDraft` l’output del contratto, mentre P restituisce solo `{ draftId, revision }`.

   **Correzione proposta:** fissare tipi espliciti e coerenti per `write.ts`, distinti dagli adattatori HTTP/MCP; consentire all’import di preservare lo slug. Aggiungere un test di import ripetuto con slug diverso da quello ricavabile dal nome e risoluzione tramite `resolveReferences`.

4. **Importante — Le equivalenze non rispettano l’idempotenza dichiarata.**

   **Riferimenti:** S:61–63, 380–386; P:2069–2092.

   Ogni `setEquivalence` cancella la riga precedente, ne crea una con UUID nuovo e incrementa la versione dell’ingrediente, anche quando i dati sono identici. Ripetere la richiesta dopo una risposta persa produce quindi nuovo storico e nuovi identificativi. Ripetere `removeEquivalence` dopo il successo restituisce invece `not_found`.

   **Correzione proposta:** confrontare il contenuto normalizzato prima di scrivere; una ripetizione identica deve conservare UUID e versione. Definire la rimozione idempotente per un ingrediente esistente e aggiungere test che confrontino risposta, righe e contatori prima e dopo il ritentativo.

5. **Importante — Le creazioni sono idempotenti solo quando eseguite in sequenza.**

   **Riferimenti:** P:1334–1346, 2159–2176, 483–486; main `server/src/db-errors.ts:4–18`.

   `createDraft`, `createIngredient` e `createBook` fanno prima una lettura di esistenza e poi un inserimento. Due richieste contemporanee con lo stesso identificativo possono entrambe superare la lettura; la seconda termina con violazione di unicità. Anche `uniqueSlug` può assegnare lo stesso slug a creazioni concorrenti con identificativi diversi.

   `withInvalidOn` non gestisce `23505`; in ogni caso trasformarlo in `invalid` non realizzerebbe l’idempotenza.

   **Correzione proposta:** scegliere e documentare una strategia atomica per identificativo e assegnazione dello slug, con recupero dell’entità già creata. Aggiungere test concorrenti sia per lo stesso UUID sia per due UUID con lo stesso nome.

6. **Importante — `startRevision` contraddice la spec su stato iniziale e ritentativi.**

   **Riferimenti:** S:286–290; P:1251–1261, 1350–1363.

   Il piano cerca una bozza aperta prima di verificare che la ricetta sia pubblicata: chiamando `startRevision` su una ricetta nuova restituisce la bozza `new`, anziché `not_allowed/not_published`. Il test previsto alla riga 1261 fallirebbe con l’implementazione proposta.

   Inoltre non cerca l’UUID richiesto fra le bozze chiuse. Dopo pubblicazione o scarto, ripetere la creazione con lo stesso UUID tenta un nuovo inserimento e fallisce; se nel frattempo esiste un’altra bozza aperta può restituire quella.

   **Correzione proposta:** definire l’ordine fra recupero della creazione già effettuata, verifica della ricetta e riuso della bozza aperta. Testare esplicitamente il ritentativo dopo chiusura e dopo apertura di una revisione successiva.

7. **Importante — Il timestamp di inizio richiesta può retrodatare una pubblicazione rispetto a R1.**

   **Riferimenti:** P:1315, 1600–1623, 1666; main `server/src/pipeline.ts` nella costruzione di `OperationContext`; `supabase/migrations/20261011100400_meals.sql:120–124`; specifica principale:1039–1047.

   `actor.now` viene fissato prima di acquisire i lock e diventa `published_at`. Una pubblicazione avviata prima delle 15:30, ma rimasta in attesa fino a dopo, può risultare retroattivamente in vigore quando il pranzo è diventato passato. La funzione R1 seleziona infatti la versione tramite `published_at <= p_instant`.

   Il piano verifica immutabilità e rollback, ma non questo confine temporale.

   **Correzione proposta:** definire un istante effettivo di pubblicazione acquisito nel database dopo la serializzazione delle scritture, coerente con chiusura della bozza e storico. Aggiungere un test con attesa sul lock attraverso il passaggio del pasto e verificare l’esito tramite il resolver R1 reale.

8. **Importante — Manca la registrazione di `catalogue` nel client web reale.**

   **Riferimenti:** P:2274–2285, 2409–2440, 2503–2509; main `web/src/api/types.ts:54–62`, `web/src/api/clients.ts:14–16`.

   Il client della #17 espone dal Worker soltanto le aree elencate in `SERVER_AREAS`. Il piano aggiunge componenti, query e API finta, ma non include l’aggiornamento di questa lista. Senza tale modifica `api.catalogue` non appartiene al tipo `Api`; aggiungerlo soltanto al client finto lascerebbe dati dimostrativi anche in modalità reale.

   **Correzione proposta:** inserire esplicitamente `catalogue` in `SERVER_AREAS`, aggiornare il fake secondo il contratto e aggiungere un test di `realClients` che verifichi l’instradamento delle tre operazioni web al client RPC.

9. **Importante — Il montaggio previsto esclude i curatori senza famiglia.**

   **Riferimenti:** S:89–98; P:2505–2507; main `web/src/routes/RecipesPage.tsx:17–21,41`; `web/src/components/FamilyGate.tsx`.

   Filtri ed elenco sono dentro `RecipesView`, renderizzato solo quando `FamilyGate` trova una famiglia accessibile. Montare lì le due sezioni globali impedisce a un curatore senza famiglia di vedere bozze e archiviate. Il ruolo di curatore è indipendente dall’appartenenza familiare; le fixture SQL comprendono già curatori senza famiglia.

   **Correzione proposta:** concordare con W6 un montaggio delle sezioni globali esterno al gate familiare, mantenendo il gate per la consultazione familiare. Aggiornare la promessa di modifica limitata a «due righe» e testare un curatore con zero famiglie.

10. **Importante — Le sezioni web possono continuare a mostrare bozze dopo un rifiuto del server.**

    **Riferimenti:** P:2456–2462, 2493–2501; main `web/src/api/errors.ts:59–61`, `web/src/routes/RecipesPage.tsx:31–33`.

    `CatalogueDraftsSection` controlla ruolo e presenza di `overview.data`, ma ignora `overview.isError`. Se il ruolo viene revocato mentre il profilo è ancora in cache, una rilettura può ricevere `forbidden` e lasciare sullo schermo i dati precedenti. Le schermate esistenti applicano invece `isBlocking` per nascondere la copia dopo rifiuti diversi dagli errori di rete.

    **Correzione proposta:** applicare la stessa gestione a sezioni e pagina della bozza; definire l’invalidazione del ruolo e della cache `catalogue` dopo il rifiuto. Testare dati già caricati seguiti da `forbidden`, non soltanto il primo rendering di un non curatore.

11. **Importante — Il passo pgTAP non può diventare verde come scritto.**

    **Riferimenti:** P:197–247, 291–293; main `supabase/tests/coverage_test.sql:37–43`, `supabase/tests/helpers/setup.psql`, `supabase/tests/helpers/fixtures.psql`.

    `coverage_test.sql` confronta l’elenco completo delle funzioni eseguibili da `authenticated`: concedere `recipe_is_cited` richiede di aggiornare quell’elenco. Il piano cita il test soltanto come eventuale controllo su PUBLIC e non dichiara la modifica necessaria.

    Anche i dati iniziali sono lasciati da correggere durante l’esecuzione: `tests.recipe('test-cited')` non esiste e il helper aggiunge già `test-`; analogamente `tests.ingredient('test-pomodori')` non corrisponde alle fixture.

    **Correzione proposta:** aggiungere `coverage_test.sql` ai file modificati e fornire fixture concrete, usando gli slug effettivi oppure creando esplicitamente ricetta e pasto. Conservare i casi previsti su famiglia estranea, revoca, ACL e autori degli ingredienti.

12. **Minore — Il test locale delle convenzioni del contratto non verifica il risultato.**

    **Riferimenti:** P:521–524; main `contract/src/check.ts`, `contract/src/contract.test.ts:6–8`.

    `checkContract` restituisce un array di problemi, non lancia un’eccezione. `expect(() => checkContract(contract)).not.toThrow()` passa anche con convenzioni violate. Il test generale esistente copre il problema, ma quello proposto non dimostra ciò che dichiara.

    **Correzione proposta:** usare `expect(checkContract(contract)).toEqual([])` e verificare esplicitamente l’assenza di `familyId` negli schemi, promessa dal nome del test.

**Verifiche senza rilievi**

- La conferma affidata alle istruzioni dell’agente e la pubblicazione dell’ultima revisione rispettano la decisione dell’utente. Non propongo vincoli sulla revisione controllata né flag sulle traduzioni.
- Il ruolo `curator` della pipeline corrisponde a `recipe_curator` nel database; le policy permettono ai curatori di lavorare sui contributi altrui senza concedere accesso ai pasti delle altre famiglie.
- `ingredientLinesView`, `loadIngredientNamesById` e `loadBookTitlesById` esistono su main e sono riutilizzabili nelle forme previste. Anche proiezioni W3 e conversioni W4 sono disponibili.
- I grant consentono aggiornamento delle proiezioni, chiusura delle bozze, marcatura `overwritten` e inserimento dello storico. Non servono cancellazioni fisiche di ricette, bozze, versioni, ingredienti o libri.
- La transazione della pipeline sostiene il rollback della pubblicazione; il test con errore forzato durante l’inserimento delle righe è pertinente.
- `recipe_is_cited` è limitata ai curatori, restituisce solo un booleano e fissa `search_path`; l’estensione di `catalogue_author_names` conserva la limitazione ai nomi degli autori.

**Punti da fissare dal coordinatore**

- Registrare l’interfaccia di lettura dell’ingrediente e le firme definitive di `write.ts` prima dell’implementazione dei consumatori.
- Concordare con W6 il montaggio indipendente dalla famiglia e includere le modifiche minime di compatibilità web nella PR server.
- Precisare l’istante effettivo della pubblicazione per R1 e trasformarlo in un test condiviso con menu e spesa.
- Resta distinto il cancello della PR web di W2: la #17 è già unita, mentre l’aggancio a `profile.get().globalRoles` va verificato prima della parte web.

**Limiti della verifica**

Non ho modificato file né eseguito migrazioni. Questa è una revisione di documenti contenenti codice proposto: non esiste ancora un’implementazione `catalogue` da sottoporre alla suite. Non ho eseguito test, typecheck o build; le dipendenze locali necessarie alla verifica SQL non risultano installate. Ho consultato PostgreSQL tramite Context7 per i comportamenti di lock e controllo dei privilegi. I rilievi derivano dal confronto statico con il codice reale di main, non da test dichiarati superati.