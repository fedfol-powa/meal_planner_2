# Revisione W1 — Menu, pianificatore, job e generazione pigra

**Verdetto: DA RIFARE**

La revisione di spec e piano individua un’interfaccia W1–W6 incompatibile, problemi nella generazione di settimane fuori ordine e nel recupero dei job, e test che non possono passare rispettando i contratti esistenti. Questi punti vanno corretti prima dell’implementazione.

Revisione in sola lettura sul commit `c8f68fd3f90aea1c29d7d6e7e58a0dd7fdd828f5`, confrontata con il piano generale del checkout principale, le spec collegate, lo schema SQL e la base web W5. Nessun file modificato.

## Rilievi

### 1. Bloccante — Le interfacce delle viste condivise W1–W6 non coincidono

**Riferimenti:** [spec W1, riga 351](/Users/fedfol/Projects/meal_planner_2/.worktrees/menu/progetto/superpowers/specs/2026-10-11-menu-pianificatore.md:351), [piano W1, riga 517](/Users/fedfol/Projects/meal_planner_2/.worktrees/menu/progetto/superpowers/plans/2026-10-11-menu-pianificatore.md:517), [piano W1, riga 1589](/Users/fedfol/Projects/meal_planner_2/.worktrees/menu/progetto/superpowers/plans/2026-10-11-menu-pianificatore.md:1589), [spec W6, riga 100](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricettario/progetto/superpowers/specs/2026-10-11-ricettario-e-voti.md:100).

I percorsi dei file coincidono, ma il loro contenuto pubblico è incompatibile:

| W1 consuma | W6 produce |
|---|---|
| Schema `ratingSummary` | Schema `ratingSummaryView` |
| `ratingSummaries(tx, familyId, recipeIds)` | `ratingSummaries(tx, familyId, userId, recipeIds)` |
| `ingredientLinesView(tx, items, options): Promise<Map<…>>` | Funzione pura `ingredientLinesView(lines, names, options): IngredientLineView[]` |
| `recipeSummaryViews` e `RecipeAtVersion` | `recipeViews`, `RecipeRef`, `RecipeView`, `recipeViewKey` |

Anche il passaggio al web richiede lavoro esplicito: il riepilogo W6 non contiene `photo` e ammette campi nullabili che il tipo `RecipeSummary` di W5 non ammette.

**Perché conta:** i Task 4 e 9 non compilano contro la consegna W6. Il ripiego «W1 scrive i moduli e W6 li adotta» assegna inoltre a due attività implementazioni diverse degli stessi file. Il cancello W1 non comprende esplicitamente `ratings.set`, già chiamato dalle stelline del Menu, né garantisce le viste storiche complete: la prima PR W6 può ancora rifiutarle ([spec W6, riga 375](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricettario/progetto/superpowers/specs/2026-10-11-ricettario-e-voti.md:375)).

**Correzione proposta:** fissare un’unica interfaccia di W6 e aggiornare entrambi i documenti prima del via. W1 deve importarla senza creare una variante concorrente. Il cancello deve includere viste R1 funzionanti, `ratings.set` e adeguamento dei componenti/tipi web condivisi. Aggiungere una prova del voto dal Menu sui dati reali, con risposta applicata solo dopo conferma del server.

### 2. Importante — Generare prima la settimana successiva permette ripetizioni quando nasce quella corrente

**Riferimenti:** [spec W1, riga 90](/Users/fedfol/Projects/meal_planner_2/.worktrees/menu/progetto/superpowers/specs/2026-10-11-menu-pianificatore.md:90), [spec W1, riga 229](/Users/fedfol/Projects/meal_planner_2/.worktrees/menu/progetto/superpowers/specs/2026-10-11-menu-pianificatore.md:229), [piano W1, riga 1032](/Users/fedfol/Projects/meal_planner_2/.worktrees/menu/progetto/superpowers/plans/2026-10-11-menu-pianificatore.md:1032).

Il job genera esclusivamente la settimana successiva. Una famiglia senza settimane può quindi ricevere quella successiva dal cron e aprire il Menu soltanto dopo. La generazione pigra crea allora quella corrente, ma carica solo lo storico con `date < weekStart`: ignora completamente la settimana successiva già presente.

**Perché conta:** le due settimane possono contenere gli stessi piatti, violando il vincolo fra settimane della [specifica principale, riga 752](/Users/fedfol/Projects/meal_planner_2/.worktrees/menu/progetto/superpowers/specs/2026-09-29-app-famiglia-design.md:752).

Una prova isolata sul dominio esistente, con 20 candidate, settimana successiva generata per prima e corrente dal mercoledì sera, ha prodotto 14 e 9 pasti con **8 ricette ripetute**. La settimana parziale è stata rappresentata azzerando le porzioni precedenti, come previsto dalla semantica proposta di `from`.

**Correzione proposta:** definire come la creazione della corrente tiene conto delle settimane future già generate, senza sovrascriverle. Aggiungere test per entrambe le sequenze — prima apertura prima/dopo il cron — e per il recupero di una settimana mancante dopo un’altra già pianificata.

### 3. Importante — L’unicità della settimana non evita il deadlock fra cron e generazione pigra

**Riferimenti:** [piano W1, riga 1054](/Users/fedfol/Projects/meal_planner_2/.worktrees/menu/progetto/superpowers/plans/2026-10-11-menu-pianificatore.md:1054), [piano W1, riga 1231](/Users/fedfol/Projects/meal_planner_2/.worktrees/menu/progetto/superpowers/plans/2026-10-11-menu-pianificatore.md:1231), [trigger dei contatori, riga 17](/Users/fedfol/Projects/meal_planner_2/.worktrees/menu/supabase/migrations/20261011100700_versions.sql:17).

È possibile questa sequenza:

1. La richiesta pigra inserisce la corrente; il trigger aggiorna e blocca la riga della famiglia.
2. Il cron inserisce la successiva e resta in attesa sul medesimo contatore.
3. La richiesta pigra tenta di inserire la successiva e attende l’inserimento del cron.

Si forma un ciclo di attese. Il test del Task 6 esercita soltanto due generazioni della **stessa** settimana, senza la precedente scrittura della corrente.

**Perché conta:** una delle generazioni viene annullata; se perde la richiesta pigra, il savepoint assorbe l’errore e quella lettura può non trovare la settimana promessa. È un’interleaving dedotto dalle query e dai trigger, non una prova eseguita sul database. Il comportamento dei lock e l’interruzione di una transazione in deadlock sono documentati da [PostgreSQL](https://www.postgresql.org/docs/17/explicit-locking.html).

**Correzione proposta:** stabilire un ordine di serializzazione comune per famiglia prima degli inserimenti, compatibile sia con `authenticated` sia con `app_job`, oppure prevedere un ritentativo appropriato. Non risolvere concedendo ai membri nuovi permessi amministrativi su `families`. Aggiungere un test concorrente controllato fra cron e `ensureWeeks`, con entrambe le settimane inizialmente assenti.

### 4. Importante — I job falliti vengono abbandonati al cambio di settimana

**Riferimenti:** [spec W1, riga 214](/Users/fedfol/Projects/meal_planner_2/.worktrees/menu/progetto/superpowers/specs/2026-10-11-menu-pianificatore.md:214), [piano W1, riga 1447](/Users/fedfol/Projects/meal_planner_2/.worktrees/menu/progetto/superpowers/plans/2026-10-11-menu-pianificatore.md:1447).

La spec descrive l’elaborazione delle righe `pending` e `failed`. Il piano seleziona invece soltanto il `nextWeekStart(local)` dell’esecuzione corrente, dopo `isNextWeekDue(local)`.

Un job per il 19 ottobre fallito fino a domenica 18:

- lunedì 19 non viene selezionato;
- mercoledì 21 viene considerato soltanto il bersaglio 26 ottobre;
- resta `failed` senza ulteriori tentativi né segnalazioni di ritardo.

Anche `isNextWeekOverdue(local)` torna falso il lunedì: il ritardo dipende dalla settimana corrente anziché dal bersaglio del job.

**Perché conta:** la coda persistente perde la funzione di recupero e può contenere fallimenti permanenti non più osservabili.

**Correzione proposta:** separare lo smistamento dei nuovi bersagli dalla lettura dei job pendenti. Definire il destino dei bersagli diventati correnti o passati e calcolare il ritardo rispetto al mercoledì pertinente a `target_week`. Testare domenica→lunedì, interruzioni di più settimane e recupero tramite generazione pigra.

### 5. Importante — Una settimana appena generata con soli slot vuoti risulta inesistente

**Riferimenti:** [spec W1, riga 320](/Users/fedfol/Projects/meal_planner_2/.worktrees/menu/progetto/superpowers/specs/2026-10-11-menu-pianificatore.md:320), [piano W1, riga 1275](/Users/fedfol/Projects/meal_planner_2/.worktrees/menu/progetto/superpowers/plans/2026-10-11-menu-pianificatore.md:1275), [MenuPage W5, riga 104](/Users/fedfol/Projects/meal_planner_2/.worktrees/web/web/src/routes/MenuPage.tsx:104).

Quando non esistono candidate adatte, il pianificatore crea comunque gli slot `empty`. La prima query di apertura esclude questi slot; quella di ripiego considera soltanto date precedenti a oggi.

Alla prima generazione, gli slot sono tutti da oggi in avanti: `openingOf` restituisce dunque `no_weeks` benché settimana e pasti esistano.

**Perché conta:** W5 mostra «Ancora nessun menu» e non rende il calendario né le schede «Nessuna ricetta adatta». L’esito previsto dal pianificatore rimane nascosto.

**Correzione proposta:** distinguere l’assenza di settimane dall’assenza di pasti con contenuto. Prevedere un ripiego su un giorno con slot vuoti e testarlo dal server fino alla schermata, anche nelle due lingue.

### 6. Importante — `getOpening` può restituire «invariato» con una data ormai superata

**Riferimenti:** [spec W1, riga 288](/Users/fedfol/Projects/meal_planner_2/.worktrees/menu/progetto/superpowers/specs/2026-10-11-menu-pianificatore.md:288), [piano W1, riga 606](/Users/fedfol/Projects/meal_planner_2/.worktrees/menu/progetto/superpowers/plans/2026-10-11-menu-pianificatore.md:606), [pipeline, riga 97](/Users/fedfol/Projects/meal_planner_2/.worktrees/menu/server/src/pipeline.ts:97).

La soluzione presume che MCP non invii `knownVersion`, ma il contratto e lo schema dello strumento lo consentono anche senza `today`.

Un agente può leggere lunedì senza `today`, conservare la versione e ripresentarla martedì. Se non sono cambiati i contatori, riceve `unchanged`, nonostante l’apertura debba cambiare. Inoltre il controllo «`today` distante al massimo un giorno» si trova nel gestore, saltato quando la pipeline risponde `unchanged`.

**Perché conta:** la correttezza dipende da una convenzione del client che il server non impone.

**Correzione proposta:** rendere esplicito e verificato il rapporto fra data e versione: per esempio vietare `knownVersion` senza una data esplicita, oppure includere la data effettiva nella versione dell’operazione. Eseguire la validazione temporale prima dell’uscita anticipata. Testare il cambio di giorno via MCP con `knownVersion`, senza scritture intermedie.

### 7. Importante — Diversi test TDD proposti contraddicono i contratti che devono verificare

**Riferimenti principali:** [piano W1, riga 259](/Users/fedfol/Projects/meal_planner_2/.worktrees/menu/progetto/superpowers/plans/2026-10-11-menu-pianificatore.md:259), [riga 816](/Users/fedfol/Projects/meal_planner_2/.worktrees/menu/progetto/superpowers/plans/2026-10-11-menu-pianificatore.md:816), [riga 1385](/Users/fedfol/Projects/meal_planner_2/.worktrees/menu/progetto/superpowers/plans/2026-10-11-menu-pianificatore.md:1385).

Tre contraddizioni concrete:

- **Task 2:** mercoledì alle 20:00 il test si aspetta giovedì pranzo. La cena di mercoledì passa alle 23:00: il risultato corretto è mercoledì cena. L’esecuzione isolata del codice proposto conferma questa divergenza.
- **Task 5:** il test R1 usa `app_job` e si aspetta anche la ricetta mai pubblicata. La policy [`recipes_job`, riga 33](/Users/fedfol/Projects/meal_planner_2/.worktrees/menu/supabase/migrations/20261011100600_jobs.sql:33) esclude le bozze; l’`inner join app.recipes` elimina quello slot. Il test va eseguito come membro della famiglia per provare il comportamento destinato all’utente.
- **Task 8:** `{ slots: 'broken' }` dovrebbe far fallire la generazione. W2 stabilisce invece che `resolveFamilySettings` scarti i valori malformati e usi i default, senza errori ([spec W2, riga 73](/Users/fedfol/Projects/meal_planner_2/.worktrees/profilo/progetto/superpowers/specs/2026-10-11-profilo-famiglia.md:73)). I test di fallimento, ritentativo e allarme non raggiungono il ramo atteso.

**Perché conta:** seguendo il ciclo rosso→verde si rischia di correggere il prodotto per soddisfare aspettative sbagliate o di indebolire RLS e risoluzione delle impostazioni.

**Correzione proposta:** correggere le aspettative e introdurre un punto controllato per simulare errori di generazione. Aggiungere test R1 nel ruolo utente ai confini 15:30/23:00 e dopo un cambio di fuso, con confronto alle funzioni SQL. La copertura dell’ora legale va estesa oltre il singolo caso di Roma presente nel Task 2, includendo Londra e New York come promesso dalla spec.

### 8. Minore — La firma di `toPlannerRecipe` è già diversa da quella riportata

**Riferimenti:** [piano W1, riga 896](/Users/fedfol/Projects/meal_planner_2/.worktrees/menu/progetto/superpowers/plans/2026-10-11-menu-pianificatore.md:896), [piano W1, riga 1042](/Users/fedfol/Projects/meal_planner_2/.worktrees/menu/progetto/superpowers/plans/2026-10-11-menu-pianificatore.md:1042), [implementazione W3, riga 59](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricetta-import/domain/src/recipe/projection.ts:59).

W1 descrive e chiama `toPlannerRecipe(id, document, bookId)`. W3 espone `toPlannerRecipe(id, document)` e ricava `bookId` dal documento.

**Perché conta:** il frammento proposto non compila contro W3. L’adattamento è semplice, ma l’interfaccia non va presentata come già coincidente.

**Correzione proposta:** aggiornare firma, chiamata e tabella delle dipendenze; verificare con una fixture che il libro presente nel documento venga usato per filtrare le candidate.

## Esito degli altri controlli richiesti

| Area | Esito |
|---|---|
| **Cron Trigger** | Coerente con la decisione registrata nel piano generale. L’assenza di `/internal/jobs/*`, `pg_net` e segreto condiviso non è un difetto. Il `pg_cron` già presente serve alla pulizia delle liste temporanee. |
| **Permessi della generazione pigra** | Le grant e policy esistenti consentono al membro di inserire settimane e slot della propria famiglia. Non emerge la necessità di ampliare i privilegi. L’hook è collocato dopo autenticazione e controllo del ruolo. |
| **Idempotenza della singola settimana** | Unicità, `ON CONFLICT DO NOTHING` e transazione unica proteggono dai doppioni. Resta il problema concorrente del rilievo 3. |
| **W1 → W4, R1** | `mealRecipeVersions(tx, familyId, weekId)` e `{slotId, recipeId, version}` coincidono. `isPast` è un campo aggiuntivo compatibile. Nel registro generale va uniformato il riferimento a `versionId`. |
| **W2 → W1, impostazioni** | Percorso, proprietario e firma di `resolveFamilySettings` coincidono. La semantica di tolleranza ai valori malformati contraddice i test W1, come nel rilievo 7. |
| **Esclusioni** | Proprietà coerente: W2 gestisce aggiunta/rimozione; W1 legge `recipe_exclusions`. Nessuna duplicazione di operazioni nel Menu. |
| **Famiglia mostrata** | W1 riceve sempre `familyId` e il fuso esiste già in `FamilyView`. W2 pianifica esplicitamente il passaggio da `me.get` a `profile.get` e l’adeguamento di `useFamily`. |
| **Migrazioni** | Nessuna collisione dichiarata: W1, W6 e Spesa non aggiungono migrazioni; Profilo aggiunge `current_family_id`. |
| **File condivisi** | Il conflitto sostanziale riguarda i moduli `recipes/views.ts`. Anche `web/src/api/types.ts` e `queries.ts` richiedono integrazione coordinata fra W1, W2 e W6; le sole registrazioni nei router non esauriscono le modifiche condivise. |
| **MCP** | Le tre letture sono esposte dal contratto; non serve introdurre «rigenera», esplicitamente rinviato. Occorrono prove `tools/call` della generazione pigra e degli errori, oltre al controllo `tools/list`. |
| **Testi bilingui** | Previsti dizionari e viste localizzate; manca una verifica completa del Menu nei due idiomi per gli stati vuoti, R1 e gli ingredienti. I testi liberi familiari restano contenuti dell’utente. |

## Punti da decidere nel coordinamento

1. **Interfaccia definitiva W6:** scegliere una sola forma dei caricatori e registrare la consegna richiesta da W1, comprese versioni storiche e voto. La proprietà dei file resta quella già assegnata a W6.
2. **Settimane generate fuori ordine:** fissare la strategia che impedisce ripetizioni quando nasce la corrente dopo la successiva, preservando i menu già visibili.
3. **Job con bersaglio ormai corrente o passato:** decidere se recuperare i soli pasti ancora aperti oppure terminare esplicitamente il job; evitare righe fallite abbandonate.
4. **Apertura con soli slot vuoti:** definire il giorno di ripiego e riportarlo fra le decisioni di prodotto, mantenendo visibili le schede «Nessuna ricetta adatta».

Le decisioni già registrate — Cron Trigger, generazione nel ruolo dell’utente, hook `prepare`, prima generazione automatica e fallback R1 — non richiedono una nuova approvazione; richiedono il consolidamento nella specifica principale previsto dal protocollo.

## Verifiche svolte e limiti

Sono stati confrontati documenti, firme, componenti web, grant, policy e trigger. Eseguite soltanto prove isolate in memoria del calendario proposto e del dominio esistente; nessuna scrittura nel repository o nel database.

Consultata tramite Context7 la documentazione di Cloudflare, PostgreSQL e Postgres.js. Confermati il limite CPU del cron orario sul piano a pagamento e il comportamento dei savepoint. Non sono state eseguite suite di implementazione, build o prove sul Worker: questa è una revisione di spec e piano.