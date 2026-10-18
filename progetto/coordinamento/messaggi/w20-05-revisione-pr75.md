# W20, rilievi della revisione della PR #75

Rapporto completo: `progetto/coordinamento/revisioni/w20-pr75.md` (APPROVABILE CON CORREZIONI).
Correggi nella stessa PR, poi push e di nuovo `STATO: PR_APERTA <url>`.

1. **Importante, `RecipePicker.tsx` riga 110:** con suggerimenti in cache e rilettura fallita
   compaiono insieme le schede e lo spazio riservato (l'area passa da 325 a 623 px e Cerca
   scende). Lo spazio sostitutivo solo quando non ci sono schede; con schede conservate,
   errore senza secondo ingombro. Test successo → riapertura → errore.
2. **Minore, `RecipePage.tsx` riga 108:** le righe skeleton degli ingredienti hanno un solo
   `span`; quelle vere hanno nome e quantità in grassetto allineati sulla baseline: +1 px per
   riga (214 contro 219 px su cinque ingredienti). Riproduci colonne, peso e baseline con
   contenuto invisibile, senza compensazioni numeriche; riverifica nel browser.
3. **Minore, `design/design.md` riga 397:** la regola «con i dati salvati il contenuto compare
   subito» va precisata: subito quando i dati sono già disponibili (e, per la Spesa, la coda è
   letta); ammesse le due attese locali (ripristino oltre 200 ms, coda della Spesa).
