# W20, rilievi della seconda revisione di spec e piano

Rapporto: `progetto/coordinamento/revisioni/w20-spec-piano-2.md` (quattro rilievi importanti
nuovi o residui). Correggi spec e piano, poi commit e di nuovo `STATO: SPEC_E_PIANO_PRONTI`.

1. Ricettario: layout e filtri in un ramo stabile dell'albero, si sostituisce solo l'area che
   dipende dalla famiglia; prova con filtri aperti e focus nel campo durante l'attesa del
   profilo (apertura, focus, valore e geometria conservati).
2. Sezioni dei curatori: distingui profilo sconosciuto, ruolo noto e catalogo disponibile. Le
   sezioni non si promettono prima che il ruolo sia noto; il «before/after» del gate resta
   per gli altri stati (il Ricettario mostra le sezioni autorizzate anche senza famiglia).
   Prove separate per membro, curatore e profilo ritardato.
3. Ricetta: header completo condiviso (link indietro e titolo, vero o segnaposto, nella stessa
   posizione), stili strutturali di foto e voto riusati; fixture comune e confronto di titolo,
   foto, inizio degli ingredienti e altezza.
4. Spesa: i blocchi dell'intestazione condividono lo stato di attesa della lista (soglia e
   pausa offline), un solo annuncio; verifica di tutte le animazioni degli skeleton presenti.

**Decisioni del coordinatore sui punti aperti del rapporto:**
- Va bene lo skeleton durante un ripristino locale che supera i 200 ms anche con copia salvata.
- Confermato lo skeleton fermo offline senza copia (già deciso).
- Curatori: è ammesso un solo spostamento, quando il ruolo diventa noto al **primo avvio senza
  profilo salvato**; con il profilo salvato le sezioni sono presenti da subito e non si
  spostano. Scrivilo nella spec e nei test.
