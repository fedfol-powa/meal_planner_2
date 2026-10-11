# W6 ricettario — via alla PR delle viste

La PR #9 di W3 è unita su `main` (`publishedRecipeSchema` disponibile), insieme alla
PR #6 di W5. La tua sezione 1 è registrata come definitiva nel piano generale.

1. Porta il tuo branch su `main` aggiornato (rebase o merge, come preferisci, senza
   perdere commit).
2. Implementa con TDD la **prima PR piccola** della tua spec (sezione 6): i due
   `views.ts` esattamente con le firme della sezione 1, `ratings.set`, il test
   d'integrazione che usa le viste come il Menu (versione storica, ricetta mai
   pubblicata, porzioni diverse, zero porzioni, pubblicazione interposta), e gli
   adeguamenti web condivisi (`RecipeCard`, `RecipePage`, `IngredientList`, tipi della
   ricetta). Su un branch dedicato, per esempio `traguardo/ricettario-viste`.
3. Push, PR verso `main`, `STATO: PR_APERTA <url>` e fermati.

Se una firma della sezione 1 si rivela non implementabile, non cambiarla da solo:
`STATO: DOMANDA`.
