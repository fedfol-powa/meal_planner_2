# Seconda revisione W1 — Menu e pianificatore

**Verdetto: APPROVABILE CON CORREZIONI**

Revisione in sola lettura sul commit `6f42b057152fbac72ca40b387195affbd6303b31`. Rimane un problema nella verifica R1 della prima PR; nessuna incompatibilità residua nelle tre priorità indicate.

## Rilievi

### 1. Importante — Il test R1 dipende dall’ora reale e non verifica il passaggio ai confini

**Riferimenti:** [piano, riga 298](/Users/fedfol/Projects/meal_planner_2/.worktrees/menu/progetto/superpowers/plans/2026-10-11-menu-pianificatore.md:298), [query proposta, riga 351](/Users/fedfol/Projects/meal_planner_2/.worktrees/menu/progetto/superpowers/plans/2026-10-11-menu-pianificatore.md:351).

Il test del Task 1 crea pasti del **14 ottobre 2026**, rende corrente V2 e si aspetta `[1, 2]`. La query decide però se il pasto è passato tramite `now()` di PostgreSQL, senza un orologio controllato.

Eseguito l’11 ottobre, entrambi i pasti sono futuri: il risultato previsto dal codice è **`[2, 2]`**, quindi il test fallisce pur rispettando il contratto. Dopo il 14 ottobre può passare, ma verifica soltanto la selezione storica: non esegue letture prima, al momento e dopo le soglie delle 15:30 e 23:00. `now()` restituisce l’istante iniziale della transazione PostgreSQL. [Documentazione consultata tramite Context7](https://www.postgresql.org/docs/17/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT).

**Perché conta:** resta parzialmente aperto il precedente rilievo 7, proprio nella PR iniziale che deve sbloccare W4. Il risultato della suite dipende dal calendario di esecuzione.

**Correzione proposta:** rendere deterministico l’istante usato dalla query nei test e verificare `version` e `isPast` prima, esattamente alla soglia e dopo, per entrambi i pasti e dopo il cambio di fuso. Conservare la firma pubblica concordata `mealRecipeVersions(tx, familyId, weekId)`; sostituire soltanto `Date` in JavaScript non controllerebbe l’orologio SQL.

## Esito delle priorità e dei rilievi precedenti

- **Viste W6:** firme, `RecipeRef`, `recipeViewKey` e consumo tramite `recipeViews` coincidono con la sezione 1 definitiva. Proprietà esclusiva dei file rispettata; cancelli e prova del voto dopo conferma previsti.
- **Consegna a W4:** `mealRecipeVersions` è il Task 1, in PR separata di tre file, senza dipendenze dai produttori ancora in corso. Firma e risultato coincidono con il consumo della Spesa.
- **Implementatore:** costruzione unica in `server/src/router.ts`, con `{ prepare }`, factory delle aree e tipo `Implementer`.
- Gli altri rilievi precedenti risultano recepiti nella spec e nel piano: settimane successive, serializzazione, recupero dei job, apertura con slot vuoti, versione legata alla data e firma di `toPlannerRecipe`.

## Punti da decidere

Nessuna nuova decisione di prodotto o coordinamento necessaria.

## Verifiche e limiti

Confrontati brief, rapporto precedente, messaggi `w1-07` e `w1-08`, piano generale principale, spec collegate e codice SQL pertinente. Nessun file modificato. Non eseguiti test, build o scritture sul database: il rilievo deriva dal confronto statico fra test e query proposti.