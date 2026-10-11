# Via alle parti web dell'ondata 2

La **PR #17 di W5** (client oRPC reale e agganci di sessione) è unita su `main`. Su `main`
c'è anche tutto il lato server dell'ondata 2: #10, #11, #12, #13, #14, #15, #16.

Per ciascuno:

1. Nuovo branch da `main` aggiornato per la sola parte web, per esempio
   `traguardo/<area>-web`, nel tuo worktree (il branch del server è già unito).
2. Implementa con TDD i task web del tuo piano, sulla struttura reale di W5: client in
   `web/src/api/` (aree in `SERVER_AREAS`, `wrapApi`, tipi, client finto), sessione in
   `web/src/session/`. Mutazioni senza aggiornamento ottimistico, come `useRateRecipe`.
3. Prova visiva con agent-browser (e iPhone sulla 8767 se utile), nelle due lingue.
4. PR piccola verso `main`, `STATO: PR_APERTA <url>`.

**File condivisi del web** (`web/src/api/types.ts`, `wrapApi`, client finto, `SERVER_AREAS`,
`main.tsx`, rotte, dizionari comuni): modifiche minime per registrare la tua area. Le PR
si uniscono **una alla volta**, nell'ordine in cui sono approvate; chi arriva dopo porta il
branch su `main`.

Indicazioni per area:

- **W2 profilo:** prima di tutto il passaggio da `me.get` a `profile.get` (wrapper, chiavi
  della sessione, invalidazione di `['me']` dopo `forbidden`, `useFamily()`), poi Task 11-15.
  La tua PR va unita **per prima**: W3 e gli altri leggono il profilo da lì. Se vuoi,
  apri una PR piccola con il solo passaggio, prima del resto.
- **W6 ricettario:** task 10-12; `recipes` e `ratings` in `SERVER_AREAS`.
- **W1 menu:** Task 12; `menu` in `SERVER_AREAS`.
- **W4 spesa:** task 9-14 con la coda offline; registrazione del prefisso
  `shopping-queue:` in `main.tsx` prima di ogni `purgeOtherCopies`, agganci di sessione
  della #17. Prova reale della coda con lo stack di W1 (`w1-piattaforma`, Auth sulla 55321;
  la password locale di `app_server` è nel `server/.env` non versionato del worktree web),
  senza fermare né resettare nulla.
