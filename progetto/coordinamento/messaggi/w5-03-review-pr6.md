# W5: correzioni dalla review della PR #6

Rapporto completo: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w5-pr6.md`
(verdetto «da rifare» su tre punti; C1, C3, C5, C6, C8, C9 risultano risolti). Correggi
con TDD, scrivendo prima i test di regressione con le sequenze del rapporto.

## Scelte tecniche del coordinatore

1. **«Esci» annullato da un rinnovo (bloccante, `AuthProvider.tsx:56`, `supabaseBackend.ts:48`).**
   Il backend conserva il tipo dell'evento di Supabase (`SIGNED_IN`, `TOKEN_REFRESHED`,
   `SIGNED_OUT`, …) invece di ridurre tutto a «c'è un utente». Lo stato di autenticazione
   ha una fase esplicita «in chiusura» legata alla generazione che sta uscendo: in quella
   fase `TOKEN_REFRESHED` e ogni evento dello stesso utente e della stessa generazione si
   ignorano, e l'uscita si conclude sempre con `backend.signOut()`. Solo un `SIGNED_IN`
   successivo, di un altro utente o arrivato dopo la chiusura, apre una generazione nuova.
   Test: pulizia sospesa → `TOKEN_REFRESHED` di A → fine della pulizia ⇒ disconnesso,
   `backend.signOut()` chiamato, nessun ripristino alla riapertura; resta verde il caso
   dell'ingresso di B durante la pulizia.

2. **Segni di revoca persi (bloccante, `persister.ts:35`, 76–90, 118–134).**
   Un record per (utente, famiglia) invece di una mappa unica, e ogni lettura, confronto e
   scrittura di un segno dentro **una sola transazione `readwrite` di IndexedDB** (le
   transazioni sullo stesso store sono serializzate anche fra schede): `markRevoked` tiene
   il timestamp massimo; `clearRevoked(t)` cancella solo se il segno salvato è ≤ t. Il
   filtro della scrittura della copia legge i segni nella stessa transazione che scrive la
   copia, o subito prima nella stessa transazione. L'adattatore in memoria dei test deve
   riprodurre la stessa atomicità. Test: le due sequenze concorrenti del rapporto seguite
   da scrittura tardiva e ripristino; più un test sull'adattatore IndexedDB vero (con
   `fake-indexeddb` solo in sviluppo, se serve: dipendenza approvata, sostituisce un
   IndexedDB reale nei test; senza, l'atomicità resta non provata) o nel browser.

3. **Lingua sbagliata in cache (importante, `SessionScope.tsx:64`, `queries.ts:93`, `session.ts:132`).**
   La lingua si fissa all'avvio della lettura e viaggia con la chiamata e con i suoi
   tentativi (niente lettura di `localeRef.current` al momento del nuovo tentativo); se nel
   frattempo la lingua è cambiata, la risposta si scarta e la query si annulla senza
   scrivere in cache. Il client finto usa la lingua della richiesta per dati e versione.
   Test: richiesta italiana → rinnovo sospeso → cambio in inglese → rinnovo riuscito →
   ritorno all'italiano, controllando anche persistenza e ripristino.

## Poi

Rebase su `origin/main` (nel frattempo è stata unita la PR #5 con server e contratto;
risolvi eventuali conflitti nella radice), `npm test` e `npm run typecheck` dalla radice e
da `web/`, `npm run build`, commit, push. Aggiorna la sezione delle correzioni nel piano
(C10–C12). Scrivi `STATO: PR_CORRETTA` e fermati. L'anteprima sulla porta 8767 riavviala
con la build nuova.
