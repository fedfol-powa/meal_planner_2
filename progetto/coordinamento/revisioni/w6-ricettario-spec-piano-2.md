**Verdetto: APPROVABILE CON CORREZIONI**

Le firme della sezione 1 ora coprono il consumo previsto da W1: riferimenti da `mealRecipeVersions`, versioni storiche, ricette mai pubblicate, voti e ingredienti scalati per porzioni. Restano quattro problemi da correggere prima della consegna.

Revisione in sola lettura, con verifiche statiche su documenti e codice. Nessun file modificato; nessun test, typecheck o build eseguito.

**Rilievi**

1. **Importante — Le proiezioni possono mescolare due versioni durante una pubblicazione concorrente.**

   **Riferimenti:** [piano W6:750](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricettario/progetto/superpowers/plans/2026-10-11-ricettario-e-voti.md:750), [db.ts:14](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricettario/server/src/db.ts:14).

   `loadContents` legge prima versione, riepilogo e porzioni di riferimento da `recipes`, poi gli ingredienti dalle proiezioni. La transazione reale non imposta un isolamento diverso da quello predefinito: due letture successive possono vedere commit diversi, come confermato dalla [documentazione PostgreSQL consultata tramite Context7](https://www.postgresql.org/docs/17/transaction-iso.html).

   Se viene pubblicata V2 fra queste query, un riferimento numerato V1 può restituire nome e porzioni base di V1 con ingredienti di V2. Essere nella stessa transazione non basta a garantire R1.

   **Correzione:** leggere il documento immutabile della versione richiesta anche quando coincide con la corrente; per `version: null`, risolvere prima il numero e caricare quel documento. In alternativa, garantire una lettura coerente delle proiezioni. Aggiungere un test con pubblicazione interposta fra le letture.

2. **Importante — L’adeguamento di `RecipeSummary` e dei componenti W5 resta incompleto.**

   **Riferimenti:** [tipi W5:10](/Users/fedfol/Projects/meal_planner_2/.worktrees/web/web/src/api/types.ts:10), [spec W6:85](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricettario/progetto/superpowers/specs/2026-10-11-ricettario-e-voti.md:85), [piano W6:1850](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricettario/progetto/superpowers/plans/2026-10-11-ricettario-e-voti.md:1850).

   Il task 10 esplicita `description` nullabile, ma omette **`sourceType` e `mealType` nullabili**, necessari alle ricette mai pubblicate. Se si mantengono i tipi W5 riscritti a mano, questa incompatibilità resta.

   La **foto è già presente in W5**, mentre manca nel contratto W6. Il piano ne dispone la rimozione dal tipo, ma [RecipeCard:46](/Users/fedfol/Projects/meal_planner_2/.worktrees/web/web/src/components/RecipeCard.tsx:46) e [RecipePage:77](/Users/fedfol/Projects/meal_planner_2/.worktrees/web/web/src/routes/RecipePage.tsx:77) continuano a leggerla. `RecipeCard` non compare fra i componenti da adeguare.

   **Correzione:** completare esplicitamente il mapping dei campi nullabili e aggiornare entrambi i componenti, fixture e test per l’assenza di `photo`. Verificare una scheda del Menu alimentata dal payload reale di una ricetta mai pubblicata.

3. **Importante — Uno slot con zero porzioni ammesso dal database fa fallire l’intera settimana.**

   **Riferimenti:** [schema pasti:21](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricettario/supabase/migrations/20261011100400_meals.sql:21), [consumo W1:439](/Users/fedfol/Projects/meal_planner_2/.worktrees/menu/progetto/superpowers/specs/2026-10-11-menu-pianificatore.md:439), [piano W6:278](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricettario/progetto/superpowers/plans/2026-10-11-ricettario-e-voti.md:278), [scaleQuantity:5](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricettario/domain/src/units/scale.ts:5).

   `meal_slots.servings` ammette zero anche con una ricetta. W1 passa direttamente le porzioni dello slot; W6 invoca `scaleQuantity`, che solleva `RangeError` per zero. Basta quindi uno slot valido secondo lo schema per interrompere `recipeViews` e la lettura settimanale. Il generatore evita questi slot, ma il caricatore non dispone dello stesso vincolo.

   **Correzione:** definire nella sezione 1 il comportamento per zero e gestirlo prima della scalatura, oppure garantire esplicitamente l’invariante positivo nei percorsi che alimentano il Menu. Aggiungere il caso al test d’integrazione W1/W6.

4. **Minore — Il test R1 del dettaglio usa un documento che W3 rifiuta.**

   **Riferimenti:** [fixture W6:367](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricettario/progetto/superpowers/plans/2026-10-11-ricettario-e-voti.md:367), [test R1:1568](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricettario/progetto/superpowers/plans/2026-10-11-ricettario-e-voti.md:1568), [schema W3:95](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricetta-import/domain/src/recipe/document.ts:95).

   Senza `lines`, la fixture salva `ingredients: []`. Il test R1 del dettaglio crea proprio questa ricetta; dopo la pubblicazione di V2, leggere V1 passa da `publishedRecipeSchema.parse`, che richiede almeno un ingrediente. Il test fallirà prima di verificare libro e versione storica.

   **Correzione:** fornire almeno una riga valida alle fixture pubblicate e validare i documenti con lo schema W3 prima dell’inserimento.

**Punti da decidere tramite il coordinatore**

- Fissare la semantica degli slot con zero porzioni fra W1, W6 e schema.
- Assegnare esplicitamente a W6 anche l’adeguamento di `RecipeCard` al riepilogo definitivo, così W1 riceve tipi e componenti compatibili.