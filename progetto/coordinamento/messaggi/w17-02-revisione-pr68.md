# W17, rilievo della seconda revisione della PR #68

Rapporto: `progetto/coordinamento/revisioni/w17-pr68-2.md` (primi due rilievi chiusi, uno minore nuovo).

**Minore, `SKILL.md` riga 31:** «ogni altro `id` è esistente, non generarlo mai» vale senza
limiti, ma le scritture `shopping_*` (per esempio `shopping_addFreeItem`) vogliono un `id`
nuovo, e la riga 70 permette la spesa su richiesta esplicita. Limita le due regole agli
strumenti trattati dalla skill e, per quelli fuori perimetro, rimanda a schema e descrizione
dello strumento. Niente istruzioni nuove sulla spesa. Poi push e `STATO: PR_APERTA <url>`.
