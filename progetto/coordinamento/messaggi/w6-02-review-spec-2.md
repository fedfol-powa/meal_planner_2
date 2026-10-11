# W6 ricettario — seconda review di spec e piano

Rapporto: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w6-ricettario-spec-piano-2.md`. Verdetto «approvabile con
correzioni»: la sezione 1 copre ciò che serve al Menu.

## Correggi come propone il revisore

1. Proiezioni coerenti con R1: leggere sempre il documento immutabile della versione
   richiesta, anche se coincide con la corrente; per `version: null` risolvere prima il
   numero e poi caricare quel documento. Test con pubblicazione interposta.
2. Adeguamento web completo: `sourceType` e `mealType` nullabili nel mapping,
   `RecipeCard` e `RecipePage` (sono tuoi, decisione del coordinatore) adeguati
   all'assenza di `photo`, con fixture e test; scheda alimentata dal payload reale di
   una ricetta mai pubblicata.
3. **Slot con zero porzioni (decisione del coordinatore):** il caricatore non chiama mai
   `scaleQuantity` con zero; per `servings: 0` le righe si mostrano alle porzioni di
   riferimento della ricetta (la scheda resta leggibile; la spesa li esclude per conto
   suo). Scrivilo nella sezione 1 e aggiungi il caso al test d'integrazione per W1.
4. Fixture pubblicate con almeno una riga valida, validate con lo schema di W3 prima
   dell'inserimento.

Commit, poi `STATO: SPEC_E_PIANO_CORRETTI` e aspetta: registro la sezione 1 come
definitiva e la passo a W1. Il via alla tua prima PR piccola (viste) arriva insieme, dopo
il merge della PR #9 di W3 di cui usi `publishedRecipeSchema`.
