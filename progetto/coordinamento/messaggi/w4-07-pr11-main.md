# W4 — PR #11: verifica approvata, aggiorna su main e task 8

La verifica delle correzioni della PR #11 è «approvabile» (`/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w4-pr11-2.md`).
Nel frattempo su `main` sono entrate la #12 (viste di W6), la #10 e la **#13 di W1**
(`mealRecipeVersions` e `versionedInput` tipizzato). La PR #11 ora è in conflitto su
`contract/src/contract.ts`, `contract/src/index.ts`, `server/src/router.ts`, e la CI non parte.

1. Porta `traguardo/spesa` su `main` e risolvi i conflitti conservando le registrazioni
   di tutte le aree (implementatore unico in `server/src/router.ts`).
2. Fai qui anche il **task 8**: sostituisci la query provvisoria con
   `mealRecipeVersions` di `server/src/menu/versions.ts` e togli lo schema scritto a mano
   al posto di `versionedInput`. Test con il database.
3. Push, `STATO: PR_CORRETTA`. Farò verificare solo questo ultimo tratto.
