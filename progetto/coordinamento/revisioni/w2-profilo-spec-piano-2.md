# Seconda revisione W2 — Profilo e famiglia

**Verdetto: APPROVABILE CON CORREZIONI**

Revisione in sola lettura. Nessun file modificato. Resta un problema nei rilievi precedenti 2–3; le altre correzioni richieste risultano recepite nei documenti.

## 1. Importante — Le mutazioni superate saltano le invalidazioni delle viste dipendenti

**Riferimenti:** [spec, riga 281](/Users/fedfol/Projects/meal_planner_2/.worktrees/profilo/progetto/superpowers/specs/2026-10-11-profilo-famiglia.md:281), [piano, riga 2366](/Users/fedfol/Projects/meal_planner_2/.worktrees/profilo/progetto/superpowers/plans/2026-10-11-profilo-famiglia.md:2366), [test concorrente, riga 2275](/Users/fedfol/Projects/meal_planner_2/.worktrees/profilo/progetto/superpowers/plans/2026-10-11-profilo-famiglia.md:2275).

Quando `isCurrent()` è falso, `applyMutation` invalida soltanto la vista destinataria e termina prima delle invalidazioni previste per l’operazione. Una risposta superata può però corrispondere a una scrittura riuscita.

**Caso concreto:** parte `setIngredientRestriction(avoid)`, poi `setMeal`; entrambe condividono il gettone di `settings`. Arriva prima la risposta di `setMeal`, poi quella della restrizione: quest’ultima viene scartata e invalida le impostazioni, ma la spesa conserva l’ingrediente evitato.

Ho riprodotto il caso in memoria usando i blocchi del piano e il `QueryClient` installato nella base W5: `settingsInvalidated: true`, `shoppingInvalidated: false`. Il test previsto usa due operazioni senza dipendenze esterne, quindi non intercetta il difetto.

**Correzione proposta:** distinguere una risposta superata nell’ordine da una sessione chiusa. A sessione valida, ogni scrittura riuscita deve invalidare tutte le proprie dipendenze anche quando la risposta non viene applicata. Aggiungere il test con restrizione e porzioni, risposte invertite e cache della spesa già popolata.

## Verifica delle interfacce richieste

Recepiti `profile_preferences` privata, implementatore unico in `server/src/router.ts` e passaggio completo da `me` a `profile` dopo la seconda PR W5.

`resolveFamilySettings(unknown): PlannerSettings`, percorso e comportamento tollerante coincidono con W1. Per le esclusioni, la spec attuale di W1 dichiara la lettura diretta di `recipe_exclusions`; non espone una firma alternativa alle operazioni W2. Non emerge una divergenza nel consumo dichiarato.

## Punti da decidere

Nessuna nuova decisione di prodotto o architettura necessaria: la correzione applica la matrice delle invalidazioni già concordata.