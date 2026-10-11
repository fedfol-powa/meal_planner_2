# Seconda revisione — Revisione dei pasti

**Verdetto: APPROVABILE CON CORREZIONI**

Revisione in sola lettura sul commit `25f1421`. Le correzioni principali sono recepite, ma restano problemi nella gestione delle bozze e nei passaggi dichiarati verdi delle due PR.

Riferimenti:

- **S**: `progetto/superpowers/specs/2026-10-11-revisione-pasti.md`.
- **P**: `progetto/superpowers/plans/2026-10-11-revisione-pasti.md`.

## Rilievi

### 1. Importante — Il controllo `draft_closed` non vede la bozza dopo la rimozione dell’ultima citazione

**Riferimenti:** P:1582–1587; `supabase/migrations/20261011100400_meals.sql:190–195`; `server/src/errors.ts:46`.

Dopo `setFree` sull’ultima citazione, un membro non curatore non vede più la ricetta in `app.recipes`. La query dell’annullamento parte proprio da quella tabella: non trova la bozza chiusa, quindi non restituisce `draft_closed`. Il successivo aggiornamento viene respinto dal trigger con `42501`, normalizzato in `internal`.

**Correzione:** verificare lo stato tramite una funzione limitata all’azione da annullare, senza dipendere dalla visibilità attuale della ricetta e senza ampliare la policy di lettura. Testare il percorso RPC completo con un membro non curatore e verificare l’assenza di scritture dopo il rifiuto.

### 2. Importante — La nuova funzione può rivelare lo stato di bozze di altre famiglie

**Riferimenti:** P:320–322, 403–413; P:236–237.

`recipe_draft_is_open` considera prova di una citazione qualsiasi `meal_changes.before`. Tuttavia, per compatibilità, le righe senza `action_id` accettano ancora un `before` arbitrario.

Nel ruolo `authenticated` è quindi possibile inserire sul proprio slot una riga senza azione contenente l’UUID di una bozza altrui e interrogare la funzione: la funzione `security definer` rivela se quella bozza è aperta. Il test su Franco verifica soltanto l’assenza iniziale di prove, non la loro falsificazione.

**Correzione:** accettare soltanto prove validate del registro delle azioni; aggiungere un pgTAP con citazione falsa in una riga senza `action_id`, mantenendo il risultato negativo.

### 3. Importante — La prima PR fallirebbe `coverage_test.sql`

**Riferimenti:** P:27–29, 412–422; `supabase/tests/coverage_test.sql:37–43`.

La migrazione concede `EXECUTE` su `recipe_draft_is_open` ad `authenticated`. Il test esistente confronta l’elenco completo delle funzioni eseguibili con una lista che non contiene questa funzione. Il piano, inoltre, vieta di modificare i test pgTAP già uniti.

**Correzione:** prevedere esplicitamente l’aggiornamento della lista in `coverage_test.sql` nella prima PR, conservando il controllo esaustivo dei privilegi. Correggere il vincolo del piano: le migrazioni precedenti restano immutate, il test di copertura va aggiornato.

### 4. Importante — Le fixture server non creano le bozze aperte richieste dai nuovi test

**Riferimenti:** P:1309–1315, 1321–1325, 1481–1488; `server/test/support/menu.ts:53`; `server/test/recipes/fixtures.ts:143–147`.

`draftRecipe` crea soltanto una riga in `app.recipes`, senza la corrispondente `app.recipe_drafts`. I nuovi trigger richiedono invece una bozza aperta.

Gli scambi e il ripristino dell’ultima citazione fallirebbero; l’istruzione che dovrebbe chiudere la bozza nel test di annullamento aggiornerebbe zero righe. Restano quindi irrisolti aspetti dei precedenti rilievi 13–14.

**Correzione:** aggiungere una fixture esplicita di bozza importata aperta, usarla nei test pertinenti e verificare che la chiusura modifichi effettivamente quella bozza.

### 5. Importante — La seconda PR contiene ancora ostacoli verificabili al typecheck

**Riferimenti:** P:2446–2473, 2853–2856, 3614–3616; `web/src/test/sessionHarness.tsx:16–33`; `web/tsconfig.json:8–9`.

Il test importa `sessionWrapper`, che non esiste. Il modulo esporta `renderSession`, una funzione che esegue il rendering e richiede un backend: non basta sostituire il nome dell’import.

Inoltre, eliminando `ProvisionalUndo` come richiesto dal Task 14, restano inutilizzati in `UndoProvider.tsx` gli import `useApi`, `useT` e `useMealMutation`. Con `noUnusedLocals` il typecheck fallisce.

**Correzione:** descrivere un wrapper realmente utilizzabile da `renderHook`, oppure riscrivere il test usando `renderSession`; includere la pulizia degli import nel Task 14. Il precedente rilievo 13 non è completamente chiuso.

### 6. Importante — Gli errori nel salvataggio delle porzioni restano silenziosi

**Riferimenti:** P:2802–2805, 2832–2841, 2932–2946.

Il salvataggio differito azzera il valore locale in `onSettled`, ma non espone l’errore al pannello. Durante lo smontaggio, il rifiuto viene esplicitamente ignorato con `.catch(() => undefined)`.

Se l’invio fallisce, la modifica alle porzioni scompare senza spiegazione. Il conteggio delle richieste e il caso offline prima dell’invio non coprono questo percorso.

**Correzione:** esporre l’errore quando la scheda è montata e prevedere un messaggio persistente dopo la navigazione. Aggiungere test con richiesta respinta dopo l’invio, sia prima sia dopo lo smontaggio.

## Punto riservato al coordinatore

**Bozza pubblicata dopo la modifica:** S:319–321, 550 e 567–574; P:1597–1598 adottano il ripristino della ricetta pubblicata, mentre la decisione 4 in `messaggi/w1-11-review-revisione-pasti.md:28–34` richiede `not_allowed`.

Lo scostamento è dichiarato, ma già incorporato nel comportamento proposto. Per chiudere il precedente rilievo 3 occorre applicare la decisione vigente oppure ottenere l’approvazione esplicita dell’alternativa, con relativo test.

## Controlli e limiti

Confrontati tutti i 14 rilievi con decisioni, spec, piano e sorgenti pertinenti; controllati migrazione proposta, RLS, grant, pgTAP e workflow CI.

**L’autonomia delle due PR non è ancora dimostrata:** la prima presenta i problemi dei rilievi 1, 3 e 4; la seconda quelli del rilievo 5.

Non eseguite migrazioni o suite con scritture: il codice esaminato è ancora nel piano. Nessun file modificato, nessun commit; worktree pulito alla verifica finale.