# W19, rilievo della seconda revisione della PR #72

Rapporto: `progetto/coordinamento/revisioni/w19-pr72-2.md` (quattro rilievi chiusi, il 3 solo in parte).

**Minore, `DaySelector.tsx` righe 73–79:** il clic del mouse arrivato come `MouseEvent` senza
`pointerType` (Safari prima della 18.2) resta bloccato nei 400 ms dopo uno swipe. Azzera la
soppressione all'inizio di una nuova interazione del mouse (per esempio `pointerdown` con
`pointerType === 'mouse'`), lasciando bloccato il clic sintetico del touch; aggiungi il test
con quella sequenza e un `click` senza `pointerType`. Poi push e `STATO: PR_APERTA <url>`.
