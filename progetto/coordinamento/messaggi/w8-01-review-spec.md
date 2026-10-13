# W8: review di spec e piano, rilievi e decisioni del coordinatore

Rapporto completo: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w8-spec-piano.md`
(verdetto DA CORREGGERE, 9 rilievi). Leggilo tutto.

## Decisione: semplificare l'architettura

Quattro rilievi (1 rollback, 4 timeout del corpo, 5 guardia, 6 posizione della guardia)
nascono dalla navigazione dalla rete, che crea il caso «HTML di una versione, asset di
un'altra». Criterio del coordinamento: il meccanismo più semplice che renda impossibile
l'errore. Quindi:

- **Le navigazioni restano servite dalla shell installata** (come oggi). Shell e asset
  vengono sempre dalla stessa cache, quindi pagina bianca e versioni mescolate sono
  impossibili per costruzione. **Niente guardia inline, niente `use-shell`, niente timeout
  di rete.**
- Il ritardo si toglie dal lato del worker: `skipWaiting()` dopo il precache completo,
  `updateViaCache: 'none'`, `registration.update()` all'avvio e a ogni ritorno visibile.
- La pagina si ricarica quando **la versione del worker attivo è diversa** dalla propria
  (non «più nuova»): dopo il ricaricamento la shell viene dal worker attivo, quindi le
  versioni coincidono e il ciclo è impossibile, anche nel rollback. Aggiungi comunque un
  limite difensivo in `sessionStorage`: al massimo un ricaricamento automatico per coppia
  (versione della pagina, versione del worker).
- Effetto per la famiglia, da scrivere nella spec: dopo un rilascio, alla prima apertura
  con la rete l'app può mostrare la versione precedente per qualche secondo, mentre la
  nuova si scarica, poi passa da sola se la pagina è libera e non è stata toccata;
  altrimenti al ritorno in primo piano successivo.
- La specifica principale (sezione 1, «navigazioni dalla rete con ripiego sulla shell») va
  cambiata di conseguenza: mettilo fra le «Decisioni da riportare», con il motivo.
- Cache: conserva le ultime tre versioni invece della «precedente per timestamp»
  (rilievo 7), così una pagina occupata che salta una versione trova ancora i suoi asset;
  scrivilo come limite semplice, senza tracciare le pagine aperte.

## Gli altri rilievi

2. **Controlli superati.** Ricontrolla visibilità, interazione e occupazione **subito prima**
   di `location.reload()`. L'interazione blocca tutti i trigger. Un controllo superato da
   una nuova transizione di visibilità o da un `controllerchange` si scarta. Test con
   risposte del worker ritardate e controlli concorrenti.
3. **Pagina occupata.** Copri anche: cambio della password (invio in corso),
   cambio della lingua (`runAreaMutation`), uscita in corso (da `signedOut` fino alla
   fine di `backend.signOut()` e della pulizia), accodamento della spesa dall'inizio della
   transazione IndexedDB. Il modo più semplice è un contatore di operazioni in corso
   (`trackBusy(promise)`) usato in quei punti, oltre a `isMutating()`. Test con ciascuna
   operazione trattenuta.
8. **Test.**
   - Nome del bundle `/assets/main-…`.
   - Test con i provider reali, che fallisca se si toglie la registrazione del controllo.
   - Lista riconoscibile salvata con una build, cambio di build sul Menu, riapertura
     offline senza nuove letture.
   - Coda non vuota con gli stessi identificativi prima e dopo.
   - La sessione Supabase vera si prova solo nel collaudo sull'iPhone: dichiaralo invece
     di dedurlo dal backend finto.
   - Nel browser: A₀ (main attuale) → B → C, rollback C → B, pagina occupata che salta
     una versione.
   - Per i test chiave verifica che rompere il collegamento li faccia fallire.
9. **Buster precedente.** Converti il formato precedente sempre in `'1'`. Aggiungi il test
   «buster ISO, schema richiesto `2` → scartata». Nella spec scrivi che, quando
   `CACHE_SCHEMA` cambia, la copia si scarta: niente migrazione, ed è l'unica eccezione
   alla conservazione offline. Il periodo di compatibilità delle API resta comunque
   richiesto.

Aggiorna spec e piano, commit, poi `STATO: SPEC_E_PIANO_CORRETTI` con un riassunto per
rilievo. Dopo la correzione ci sarà una seconda revisione di spec e piano.
