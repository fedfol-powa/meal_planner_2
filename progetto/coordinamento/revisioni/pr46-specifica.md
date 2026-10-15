**Revisione PR #46 — CORREZIONI RICHIESTE**

Esaminato `git diff main...HEAD`, con `HEAD d8ecf4d` e `main 5d6bc92`. La PR modifica soltanto i tre documenti indicati; `server/`, `contract/`, `web/` e `supabase/` coincidono con `main`.

Le 18 decisioni della sezione finale della specifica W9 risultano riportate. Restano due formulazioni generali contraddittorie e un’imprecisione sul comportamento degli errori.

1. **Importante — Il percorso autenticato è ancora descritto come obbligatorio per ogni operazione.**

   **File:** `progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`, righe **759–765, 780–782 e 809–812**.

   Il testo afferma «Ogni richiesta segue lo stesso percorso», includendo verifica JWT, permessi e transazione; aggiunge che «Ogni operazione» imposta il ruolo `authenticated` e verifica la sessione. Queste affermazioni contraddicono il nuovo paragrafo sulle operazioni `public`, alle righe 831–842.

   **Riscontro:** la specifica W9, righe 157–169, esclude autenticazione e transazione della pipeline per queste operazioni. Su `main`, `server/src/pipeline.ts:116` gestisce il ramo pubblico prima di `authenticate`, lasciando agli handler le transazioni brevi `anon`.

   **Perché conta:** la specifica autorevole descrive due percorsi incompatibili come regole generali, proprio nell’interfaccia che l’attività C deve riusare.

   **Correzione proposta:** limitare esplicitamente diagramma, transazione `authenticated` e verifica della sessione alle **operazioni autenticate**. Aggiungere accanto al diagramma il rimando al percorso `public`: limitatore per IP, nessuna autenticazione, transazioni brevi `anon` aperte dall’handler.

2. **Importante — Il requisito generale MCP non include la nuova esclusione delle operazioni pubbliche.**

   **File:** `progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`, righe **2725–2728**; stessa formulazione da allineare alle righe **49–51 e 2594–2596**.

   Il requisito continua a imporre un equivalente MCP per ogni operazione dell’app, indicando come unica eccezione l’eliminazione della famiglia. Il nuovo paragrafo alle righe 2789–2795 esclude invece lettura e accettazione degli inviti.

   **Riscontro:** `contract/src/app-invitations/index.ts:58` e `:63` dichiarano `mcp: false` per `get` e `accept`; `contract/src/check.ts` vieta l’esposizione MCP delle operazioni `public`. È la decisione esplicita della specifica W9, righe 153–154.

   **Perché conta:** resta attivo un requisito di copertura che il contratto vieta deliberatamente di soddisfare.

   **Correzione proposta:** precisare che la copertura MCP riguarda le operazioni dell’utente autenticato; le operazioni `public`, comprese lettura e accettazione degli inviti, sono escluse. Conservare separatamente la regola dell’eliminazione della famiglia, per cui MCP restituisce l’URL dell’app.

3. **Minore — La riconciliazione degli errori omette il caso `weak_password`.**

   **File:** `progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`, righe **1840–1845**.

   Il nuovo testo afferma che, se l’account non è ancora visibile dopo una creazione non riuscita, la risposta è `internal` e la persona riprova. Non vale quando Auth ha rifiutato la password come debole.

   **Riscontro:** `server/src/accounts/index.ts:67–70` restituisce `weak_password` quando Auth risponde con quel codice e la successiva lettura restituisce 404. `server/src/app-invitations/router.ts:68` lo traduce in `invalid`, campo `password`, codice `weak_password`. Il comportamento è previsto dalla specifica W9, riga 189, e verificato da `server/src/accounts/index.test.ts:63`.

   **Perché conta:** il testo confonde un errore correggibile nel modulo con un guasto temporaneo, suggerendo un ritentativo senza cambiare password.

   **Correzione proposta:** aggiungere l’eccezione: «Se Auth rifiuta la password come debole e l’account non esiste, restituisce `invalid` sul campo `password` con codice `weak_password`; l’invito resta prenotato e si può riprovare con un’altra password».

**Copertura e fonti**

Gli aggiornamenti del piano generale e di `design/percorsi.md` risultano coerenti con le decisioni W9. Rilascio del 15 ottobre, chiave dedicata `worker-invitations`, prova sull’iPhone e aggiornamento automatico della PWA trovano riscontro nel registro del coordinamento, riga 8: non risultano aggiunte prive di fonte.

**Verifiche eseguite**

| Verifica | Esito |
|---|---|
| `git diff --check main...HEAD` | Superata |
| `npm run typecheck` | Superata in tutti i workspace |
| Test `domain` | 270 superati |
| Test `contract` | 54 superati |
| Test `server` | 102 superati, 351 saltati |
| Test `web` | 698 superati, 11 saltati |
| Test degli script | 191 superati, 10 falliti, 24 saltati; una suite fallita e un errore non gestito |
| Build web | Non completata: mancano gli asset generati `web/public/assets/fonts` |

`npm test` inizialmente si arresta per il divieto di scrittura nella directory condivisa `.vite-temp`; le suite sono state rilanciate con `--configLoader native --no-cache`. Gli errori degli script riguardano restrizioni `EPERM`, dipendenze non risolte nei checkout temporanei e apertura di una porta locale vietata. Non sono attribuibili al diff documentale. Le prove d’integrazione saltate non sono state validate.

La build è stata tentata con output in `/private/tmp`, senza generare asset nel worktree per rispettare la revisione in sola lettura. Nessun file del lavoro esaminato è stato modificato.

**Decisioni da sottoporre al coordinatore o all’utente:** nessuna nuova decisione di prodotto; i rilievi richiedono l’allineamento a comportamenti già concordati e implementati.

**Esito: CORREZIONI RICHIESTE.**