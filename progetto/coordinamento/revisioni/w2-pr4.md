**Verdetto: APPROVABILE CON CORREZIONI.**

Revisione della PR #4, «Schema e permessi del traguardo A», al commit `b2e83862e30eefa21fbef28e04f1d254805706df`, sul diff `git diff origin/main...HEAD`.

L’impianto recepisce le correzioni delle precedenti review. Restano due difetti da correggere: un accesso indiretto alle ricette in bozza e un caso di mancata invalidazione dello storico. Non occorre riprogettare lo schema.

**Perimetro e verifiche**

Esaminati brief, istruzioni del repository, sezioni pertinenti della specifica principale, spec e piano W2, entrambe le review precedenti, piano generale nel checkout principale e rapporto dello spike. Revisione statica delle nove migrazioni, dei test pgTAP, delle fixture, del seed e degli script di bootstrap. Documentazione PostgreSQL consultata tramite Context7.

| Verifica | Esito |
|---|---|
| `npm test` | **PASS:** 66 test in 13 file |
| `npm run typecheck` | **PASS** |
| `npm run build` | Non eseguibile: nel checkout manca lo script `build` alla radice |
| `git diff --check origin/main...HEAD` | **PASS** |
| `bash -n supabase/scripts/bootstrap_test.sh` | **PASS**, sola sintassi |
| Migrazioni e pgTAP | **Non eseguiti** |
| Bootstrap sul database | **Non eseguito** |

La sandbox impedisce la connessione al socket Podman (`connect: operation not permitted`). Anche `supabase db start` si interrompe tentando di scrivere la telemetria in `~/.supabase`, fuori dalle directory consentite. Ho quindi svolto la revisione SQL statica approfondita richiesta. L’esecuzione positiva dichiarata dall’autore **non è stata verificata indipendentemente**; i test TypeScript non convalidano queste migrazioni.

Nessun file di progetto modificato, commit, push o commento sulla PR. Worktree pulito al termine.

**1. Importante — Un membro può ottenere accesso a una ricetta in bozza collegandola a un proprio pasto**

**Riferimenti:** [policy dei pasti, riga 141](/Users/fedfol/Projects/meal_planner_2/.worktrees/review-pr4/supabase/migrations/20261011100400_meals.sql:141), [lettura delle bozze citate, riga 158](/Users/fedfol/Projects/meal_planner_2/.worktrees/review-pr4/supabase/migrations/20261011100400_meals.sql:158).

`authenticated` può modificare `meal_slots.recipe_id`. La policy verifica soltanto l’accessibilità della settimana; non controlla se l’utente possa assegnare quella ricetta. La FK verifica l’esistenza della ricetta anche quando RLS la nasconde: i controlli referenziali bypassano RLS per definizione. [Documentazione PostgreSQL](https://www.postgresql.org/docs/17/ddl-rowsecurity.html).

Dopo il collegamento, `recipes_read_cited_draft` rende leggibile la ricetta perché compare in un pasto della famiglia.

Sequenza ricavata staticamente, riproducibile con le fixture esistenti:

```sql
select tests.login('franco');

-- La ricetta in bozza citata dai Rossi inizialmente è nascosta.
select name from app.recipes
where id = tests.recipe('new-draft');

-- Franco può collegarla al proprio slot dei Verdi.
update app.meal_slots
set recipe_id = tests.recipe('new-draft'), free_text = null
where id = 'c0c0c0c0-0000-4000-8000-000000000003';

-- Ora la policy consente di leggerla.
select name from app.recipes
where id = tests.recipe('new-draft');
```

Il presupposto è conoscere l’UUID: per esempio, un utente rimosso da una famiglia può averlo conservato nella cache e riutilizzarlo in un’altra famiglia. Il test attuale verifica la scomparsa della bozza dopo la rimozione, ma non questo recupero dell’accesso.

**Perché conta:** l’eccezione prevista per lo storico importato diventa un’autorizzazione che qualsiasi membro può costruirsi. Sono esposte la riga di `recipes` e le sue proiezioni, **non** il documento riservato in `recipe_drafts.content`. È comunque una violazione del confine SQL delle bozze, che lo schema deve garantire anche alle query del server.

**Correzione proposta:** controllare nel database l’assegnazione iniziale e il cambio di `recipe_id`, impedendo a un membro di introdurre riferimenti a bozze non autorizzate. Conservare un percorso esplicito per l’import e permettere le modifiche a porzioni e note degli slot storici già validi. Aggiungere test negativi sia per `INSERT` sia per `UPDATE`, incluso il caso dell’ex membro con un’altra famiglia.

**2. Importante — La cancellazione di un autore storico può cambiare i dati senza incrementare il contatore familiare**

**Riferimenti:** [FK di `actor_id`, riga 57](/Users/fedfol/Projects/meal_planner_2/.worktrees/review-pr4/supabase/migrations/20261011100400_meals.sql:57), [trigger dello storico, riga 120](/Users/fedfol/Projects/meal_planner_2/.worktrees/review-pr4/supabase/migrations/20261011100700_versions.sql:120), [test della cancellazione, riga 169](/Users/fedfol/Projects/meal_planner_2/.worktrees/review-pr4/supabase/tests/meals_test.sql:169).

`meal_changes.actor_id` usa `ON DELETE SET NULL`, ma `meal_changes_version` scatta soltanto dopo un inserimento.

Il caso scoperto è:

1. una persona lascia una famiglia, conservando le proprie modifiche nello storico;
2. in una transazione successiva viene cancellato il suo account;
3. nella vecchia famiglia quella persona è referenziata soltanto da `meal_changes.actor_id`;
4. la FK azzera l’autore, ma nessun trigger incrementa `families.data_version`.

La precedente rimozione dalla famiglia ha già invalidato la cache nella propria transazione. La successiva cancellazione modifica nuovamente lo storico, senza invalidarlo. Non intervengono i trigger delle appartenenze o degli slot se non esistono più quei riferimenti.

**Perché conta:** viola il contratto secondo cui ogni transazione che cambia dati letti incrementa il relativo contatore. Una lettura dello storico basata su `knownVersion` può ricevere `unchanged` pur contenendo ancora il riferimento all’account cancellato.

Il test esistente controlla che l’autore diventi nullo, ma non verifica i contatori e cancella una persona ancora membro: altri trigger possono mascherare la lacuna.

**Correzione proposta:** invalidare la famiglia anche quando la FK aggiorna `meal_changes.actor_id`, mantenendo vietato l’aggiornamento diretto agli utenti. Aggiungere una regressione con transazioni distinte per uscita e cancellazione, con l’autore presente soltanto nello storico; verificare azzeramento dell’autore, conservazione della modifica e incremento del contatore.

**Esito delle correzioni precedenti**

Nel codice risultano presenti:

- revoca esplicita di `EXECUTE FROM PUBLIC` per tutte le **29 funzioni** e RLS abilitata sulle **29 tabelle**;
- risolutori interni senza grant e funzioni pubbliche di autorizzazione booleane;
- controllo della data dello slot con i permessi del chiamante;
- FK composta per `undoes` e grant per colonna sulle identità immutabili;
- conservazione di bozze, salvataggi, ingredienti e libri;
- eccezione per l’azzeramento degli autori delle bozze chiuse;
- funzione limitata ai nomi degli autori per i curatori;
- bootstrap per UUID e sostituzioni del test limitate all’input;
- contatori deduplicati per transazione e test con commit e rollback reali.

Questa è una conferma statica della presenza delle correzioni, non delle ACL effettive o del loro collaudo sul database.

**Punti da decidere o consolidare dal coordinatore**

1. **Prima del merge:** confermare con W1 se l’integrazione GitHub di Supabase applica automaticamente le migrazioni al progetto remoto, come già richiesto dal piano.
2. **Verifica finale:** eseguire pgTAP e bootstrap, comprese le nuove regressioni, su un ambiente autorizzato; mantenere la prova di `session.whoami` sulle migrazioni reali come criterio di chiusura dell’interfaccia W1/W2.
3. **Specifica principale:** consolidare le decisioni già elencate da W2 nella sezione «Decisioni da riportare», inclusa la semantica R1 prima della prima pubblicazione. La prova della revoca OAuth reale resta assegnata all’ondata 2.