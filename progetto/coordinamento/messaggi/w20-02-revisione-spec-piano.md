# W20, rilievi della revisione di spec e piano

Rapporto completo: `progetto/coordinamento/revisioni/w20-spec-piano.md` (APPROVABILE CON
CORREZIONI, sei rilievi importanti e due minori). Correggi spec e piano su tutti gli otto punti
come propone il rapporto, poi commit e di nuovo `STATO: SPEC_E_PIANO_PRONTI`.

In sintesi:
1. Cache: distingui identità, ripristino della cache (IndexedDB), ripristino della coda della
   Spesa e lettura remota senza dati; l'attesa della coda resta (non perdere le spunte
   locali); prove con ripristino lento (> 200 ms) online e offline e con operazioni pendenti.
2. `FamilyGate`: layout completo di attesa della pagina (contenitori, intestazioni) condiviso
   con il gate, non solo il frammento dei dati; controlli veri fuori dall'`aria-hidden`.
3. Pausa offline anche nel gate (oggi `useFamily` non espone `fetchStatus`); test di ingresso
   offline senza profilo salvato.
4. Geometria vera: modello di layout dei blocchi (`display`), stili strutturali dei moduli CSS
   condivisi; verifica con coordinate e dimensioni sul caso comune.
5. Animazione su un solo livello, nessuna animazione annidata; durata coerente fra spec e
   piano; verifica nel browser che tutto il sottoalbero sia fermo con movimento ridotto e in
   pausa offline.
6. Test: avvio con `holdCheck()`; matrice caricamento → contenuto, errore, vuoto, cache per
   ogni pagina coperta; soglia e timer; verifica finale dopo il Task 8 (Menu compreso).
7. Censimento: aggiungi `/password`, correggi la misura delle righe di Cerca, distingui misure
   dal CSS e misure nel browser, «pagine rare invariate».
8. Togli `npm run lint` (non esiste) o sostituiscilo con i comandi veri.
