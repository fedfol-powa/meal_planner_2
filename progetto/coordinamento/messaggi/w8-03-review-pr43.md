# W8: review della PR #43, rilievi e decisioni del coordinatore

Rapporto: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w8-pr43.md`
(DA CORREGGERE: 1 bloccante, 1 importante, entrambi sulla pagina occupata; protocollo del
worker, precache, rollback e persistenza verificati senza rilievi). Leggilo tutto.

1. **Porzioni (bloccante).** Occupata finché ci sono porzioni in attesa del timer di 800 ms
   e durante il salvataggio avviato dal cleanup (`runMealMutation` all'uscita dal Menu), fino
   all'esito. Test che attraversano `startUpdates` reale per le due finestre.
2. **Accesso e consenso agli agenti.** `trackBusy` su `backend.signIn()` e
   `backend.decideAuthorization()` fino alla gestione dell'esito; pagine inattive libere.
   Test con risposta trattenuta.
3. **Ricognizione completa, perché una terza review non ne trovi altri.** Cerca in tutto
   `web/src` ogni scrittura o operazione asincrona che non passa da una mutazione TanStack
   (`runMealMutation`, `runAreaMutation`, chiamate dirette a `backend.*`, bozze con timer o
   stato solo in memoria, `fetch` diretti) e per ciascuna decidi: protetta, già coperta, o
   innocua (spiega perché). Riporta la tabella completa nella PR e nella spec.

Test prima, prova di rottura per ogni nuova protezione, push, `STATO: PR_CORRETTA` con il
riassunto.
