# W6 — review della PR #14

Rapporto: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w6-pr14.md`. Verdetto «approvabile con
correzioni».

1. **Rilievo importante:** visibilità (libri posseduti) e documento restituito devono
   venire dalla stessa fotografia del database: nella stessa istruzione SQL, oppure
   fissando la versione autorizzata e caricando quel documento immutabile. Firme delle
   viste invariate. Test con pubblicazione interposta (V2 da un libro non posseduto) per
   ricerca e dettaglio.
2. Estendi il test dell'ex membro rimosso con lo stesso JWT a `recipes.search` e
   `recipes.get`, anche con una `knownVersion` presa prima della rimozione.
3. Le utilità web anticipate (`mealTime`, `useMealClock`) possono restare in questa PR.

Push, `STATO: PR_CORRETTA`.
