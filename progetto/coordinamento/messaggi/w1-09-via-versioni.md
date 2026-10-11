# W1 menu — seconda review e via alla PR di mealRecipeVersions

Rapporto: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w1-menu-spec-piano-2.md`. Verdetto
«approvabile con correzioni»: viste, consegna a W4 e implementatore sono a posto.

1. Correggi il rilievo: il test R1 del task 1 non dipende dall'ora reale. Istante
   controllato anche lato SQL (per esempio una funzione interna con l'istante come
   parametro, che `mealRecipeVersions(tx, familyId, weekId)` chiama con `now()`; i
   test la chiamano con istanti fissi), verifiche prima, alla soglia e dopo 15:30 e
   23:00 per entrambi i pasti e dopo il cambio di fuso. Firma pubblica invariata.
2. Poi via all'implementazione, con TDD. **Prima la PR piccola** del task 1
   (`server/src/menu/versions.ts` con test), su un branch dedicato da `main`
   aggiornato, che comprende anche la correzione di `versionedInput`
   (`contract/src/versioned.ts` fa perdere ai gestori il tipo dell'input; generico
   sulla forma dell'oggetto invece di `T extends z.ZodObject`), segnalata da W4. Apri
   la PR e scrivi `STATO: PR_APERTA <url>`; poi continua sul branch principale.
3. Le viste di W6 sono **unite su `main`** (PR #12): i task che le usano sono sbloccati.
   Le parti web aspettano la seconda PR di W5: arrivato lì, `STATO: DOMANDA`.
