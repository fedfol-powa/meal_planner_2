# W4 — review della PR #11

Rapporto: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w4-pr11.md`. Verdetto «approvabile con
correzioni».

1. **Bloccante:** `/shopping-lists/*` in `assets.run_worker_first` di
   `server/wrangler.jsonc`; test che attraversa il routing degli asset (pagina valida,
   token scaduto, metodo non consentito), per esempio con Miniflare già installato.
2. **Settimana inesistente con «invariato»:** l'esistenza della settimana si verifica
   prima dell'uscita anticipata. Preferisci una soluzione nella tua operazione, nel passo
   che calcola la versione, senza toccare `server/src/pipeline.ts`. Se serve davvero
   l'aggancio `prepare`, implementalo esattamente con la forma del piano di W1
   (`createImplementer(contract, { prepare })`, eseguito nella transazione dell'utente
   prima di `readVersion`) e dimmelo, così W1 lo riusa. Test con settimana inesistente
   e versione corrente presa da un'altra settimana della famiglia.

Push, `STATO: PR_CORRETTA`. La CI esegue i test con il database.
