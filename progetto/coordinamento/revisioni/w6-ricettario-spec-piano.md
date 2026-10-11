**Verdetto: DA RIFARE**

Spec e piano W6 richiedono una revisione prima dell’implementazione. Il blocco principale è l’incompatibilità concreta delle interfacce concordate con W1. Sono inoltre presenti difetti nella gestione delle bozze bilingui, dello storico e della cache.

Revisione svolta in sola lettura sui documenti indicati, sul piano generale del checkout principale e sul codice disponibile delle fondamenta. Nessun file modificato. Non ho eseguito test, typecheck o build: questa è una revisione di spec e piano, non dell’implementazione W6. Le verifiche descritte sotto sono statiche.

**1. Rilievi**

1. **Bloccante — W1 e W6 prevedono interfacce condivise incompatibili e proprietà sovrapposte.**

   **Riferimenti:** [spec W6:102](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricettario/progetto/superpowers/specs/2026-10-11-ricettario-e-voti.md:102), [spec W1:351](/Users/fedfol/Projects/meal_planner_2/.worktrees/menu/progetto/superpowers/specs/2026-10-11-menu-pianificatore.md:351), [piano W1:1533](/Users/fedfol/Projects/meal_planner_2/.worktrees/menu/progetto/superpowers/plans/2026-10-11-menu-pianificatore.md:1533).

   Le differenze riguardano il contratto effettivo, non soltanto i nomi:

   | Elemento | Consegna W6 | Consumo W1 |
   |---|---|---|
   | `ingredientLinesView` | Funzione pura: righe, nomi, opzioni; restituisce un array | Funzione asincrona: transazione, documenti, opzioni; restituisce una mappa |
   | `ratingSummaries` | Quattro argomenti, incluso `userId` | Tre argomenti, senza `userId` |
   | Riepiloghi | `recipeViews` e `recipeViewKey` | `recipeSummaryViews` e `RecipeAtVersion`, assenti dalla consegna W6 |
   | Schema del voto | `ratingSummaryView` | `ratingSummary` |

   Inoltre W1 prevede di scrivere autonomamente `server/src/recipes/views.ts` se W6 non è ancora unito, proprio mentre W6 programma la consegna anticipata dello stesso file. La prima PR W6 rifiuta anche le versioni storiche diverse dalla corrente, necessarie al Menu.

   **Perché conta:** i piani non si integrano come scritti; possono produrre errori di compilazione, due implementazioni concorrenti e una dipendenza apparentemente soddisfatta ma incompleta per R1.

   **Correzione proposta:** fissare una sola interfaccia, aggiornare entrambi i documenti e assegnare esplicitamente la scrittura dei due `views.ts` a W6. Se si sceglie `recipeViews`, W1 deve consumarla con le firme e le chiavi W6. Separare la disponibilità delle viste correnti dalla disponibilità completa di R1 e prevedere un test d’integrazione del Menu che importi il modulo reale.

2. **Importante — La vista delle ricette mai pubblicate presume traduzioni complete.**

   **Riferimenti:** [piano W6:545](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricettario/progetto/superpowers/plans/2026-10-11-ricettario-e-voti.md:545), [piano W6:584](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricettario/progetto/superpowers/plans/2026-10-11-ricettario-e-voti.md:584), [schema SQL:26](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricettario/supabase/migrations/20261011100000_foundation.sql:26), [test dell’import W3:18](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricetta-import/scripts/import/bundle.test.ts:18).

   `RecipeRow` dichiara `name` e `description` come `Localized` completi; `summaryOf` accede direttamente a `row.name[locale]` e `row.description[locale]`. Lo stesso percorso viene usato per le bozze citate dai pasti.

   Il database ammette invece oggetti parziali, valori nulli e colonne nulle. L’import contempla esplicitamente bozze senza `name.en-GB`.

   **Perché conta:** un pasto importato con nome soltanto italiano può produrre `undefined` dove il contratto richiede una stringa, oppure un’eccezione su un valore nullo. Il guasto può compromettere l’intera lettura settimanale del Menu.

   **Correzione proposta:** distinguere il riepilogo minimo di una bozza dai dati pubblicati. Concordare il ripiego per i testi mancanti, tipizzare correttamente le proiezioni parziali e aggiungere test con bozza citata, utente inglese, traduzione assente e descrizione nulla. I test attuali usano sempre bozze bilingui complete.

3. **Importante — Tre pasti futuri non bastano a mantenere corretto lo storico nella cache.**

   **Riferimenti:** [spec W6:273](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricettario/progetto/superpowers/specs/2026-10-11-ricettario-e-voti.md:273), [piano W6:1218](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricettario/progetto/superpowers/plans/2026-10-11-ricettario-e-voti.md:1218), [piano W6:1323](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricettario/progetto/superpowers/plans/2026-10-11-ricettario-e-voti.md:1323), [pipeline:97](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricettario/server/src/pipeline.ts:97).

   Ricerca e dettaglio conservano soltanto i primi tre `upcoming`. Quando passa un quarto pasto già pianificato, nessuna scrittura deve necessariamente modificare i contatori. La rilettura può quindi rispondere «invariato», ma il dispositivo non possiede quel quarto pasto.

   **Perché conta:** `lastEatenOn`, l’ordinamento «Mangiate di recente» e gli ultimi cinque pasti possono restare errati anche dopo una rilettura online.

   **Correzione proposta:** trasmettere tutti i pasti futuri necessari alla derivazione locale oppure definire un orizzonte di validità che obblighi una lettura completa quando viene superato. Aggiungere un test con almeno quattro occorrenze, avanzamento dell’ora senza scritture e risposta «invariato». Precisare anche cosa provoca il ricalcolo mentre la pagina resta aperta: chiamare `new Date()` durante il render non programma un aggiornamento alle soglie.

4. **Importante — La versione storica può mostrare il libro della versione corrente.**

   **Riferimenti:** [piano W6:552](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricettario/progetto/superpowers/plans/2026-10-11-ricettario-e-voti.md:552), [piano W6:618](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricettario/progetto/superpowers/plans/2026-10-11-ricettario-e-voti.md:618), [piano W6:1382](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricettario/progetto/superpowers/plans/2026-10-11-ricettario-e-voti.md:1382).

   Il caricatore corrente ricava `bookTitle` da `recipes.book_id`. Il caricatore storico ripristina fonte e pagine dal documento, ma ignora `document.bookId`; la fusione mantiene quindi il titolo del libro corrente.

   Esempio: versione 1 dal libro A, pagina 12; versione 2 dal libro B, pagina 40. La scheda del pasto passato mostra **libro B, pagina 12**.

   **Perché conta:** viola R1 e indica una fonte sbagliata. Leggere il titolo attuale dell’entità condivisa significa leggere il titolo del libro referenziato dalla versione storica.

   **Correzione proposta:** conservare `bookId` nel caricamento del documento storico e caricare in blocco i titoli dei libri effettivamente referenziati. Testare cambio A → B e cambio libro → fonte web.

5. **Importante — Il piano W2 propone un `domain/package.json` che elimina export necessari a W6.**

   **Riferimenti:** [piano W2:104](/Users/fedfol/Projects/meal_planner_2/.worktrees/profilo/progetto/superpowers/plans/2026-10-11-profilo-famiglia.md:104), [package attuale del dominio](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricettario/domain/package.json), [piano W6:175](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricettario/progetto/superpowers/plans/2026-10-11-ricettario-e-voti.md:175).

   Il blocco completo proposto da W2 contiene soltanto gli export `./planner` e `./family`. Il file attuale contiene anche `./units` e `./shopping`; W3 aggiunge `./recipe`. Applicare quel blocco come sostituzione elimina gli ingressi consumati dalle altre attività.

   **Perché conta:** W6 importa direttamente `@app/domain/units`; la compilazione può rompersi dopo l’integrazione di Profilo.

   **Correzione proposta:** cambiare il passo W2 in un’aggiunta puntuale di `./family`, conservando tutti gli export esistenti. Registrare `domain/package.json` tra i file condivisi da verificare dopo il rebase. Il rilievo riguarda il piano W2, ma blocca l’integrazione W6.

6. **Minore — L’ordine testuale dei pasti è invertito rispetto allo storico promesso.**

   **Riferimenti:** [piano W6:1172](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricettario/progetto/superpowers/plans/2026-10-11-ricettario-e-voti.md:1172), [piano W6:1182](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricettario/progetto/superpowers/plans/2026-10-11-ricettario-e-voti.md:1182).

   `order by s.date desc, s.meal_type desc` mette `lunch` prima di `dinner`, mentre il commento sostiene il contrario. Lo storico espone quindi il pranzo prima della cena dello stesso giorno; il successivo `reverse()` produce l’errore opposto nell’elenco futuro.

   **Correzione proposta:** ordinare per `p.at desc`, oppure usare un ordinamento esplicito del tipo di pasto. Aggiungere un test con pranzo e cena della stessa ricetta nello stesso giorno, verificando anche il taglio agli ultimi cinque pasti.

7. **Minore — La preparazione viene trasmessa ma il componente web condiviso non la mostra.**

   **Riferimenti:** [piano W6:263](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricettario/progetto/superpowers/plans/2026-10-11-ricettario-e-voti.md:263), [piano W6:1409](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricettario/progetto/superpowers/plans/2026-10-11-ricettario-e-voti.md:1409), [IngredientList W5:3](/Users/fedfol/Projects/meal_planner_2/.worktrees/web/web/src/components/IngredientList.tsx:3).

   W6 aggiunge `preparation` separatamente dal nome dell’ingrediente, ma `IngredientList` mostra soltanto `name` e `amount`. Il task web non prevede di modificarlo.

   **Perché conta:** informazioni verificate come «cotti» o «a dadini» arrivano a MCP ma scompaiono dalle schede web.

   **Correzione proposta:** includere l’adeguamento di `IngredientList` nel piano, concordandone la proprietà con W1. Verificare la preparazione in italiano e inglese, sia nella scheda ricetta sia nelle schede del Menu.

8. **Minore — Il task web non segue TDD e lascia impliciti cambiamenti del contratto W5.**

   **Riferimenti:** [piano W6:1499](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricettario/progetto/superpowers/plans/2026-10-11-ricettario-e-voti.md:1499), [piano W6:1518](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricettario/progetto/superpowers/plans/2026-10-11-ricettario-e-voti.md:1518), [tipi W5:35](/Users/fedfol/Projects/meal_planner_2/.worktrees/web/web/src/api/types.ts:35), [tipi W5:60](/Users/fedfol/Projects/meal_planner_2/.worktrees/web/web/src/api/types.ts:60).

   I test delle pagine vengono scritti dopo il loro collegamento. Inoltre W5 restituisce un array da `recipes.search` e usa `RecipeListItem.servings`; W6 restituisce `{items}` e `baseServings`. Il piano chiede genericamente di adeguare le forme senza rendere espliciti questi passaggi.

   **Correzione proposta:** anticipare i test delle pagine e degli adattamenti API, verificandone il fallimento prima delle modifiche. Precisare aggiornamento di query, tipi, API finta e mapping delle porzioni. Inserire casi con payload nella forma reale W6, oltre a cambio famiglia, voto offline e apertura da `slotId`.

**2. Esito del confronto delle interfacce**

| Interfaccia | Esito |
|---|---|
| Viste ricetta W6 → W1 | **Incompatibili**, rilievo 1. Coincidono le directory, non le firme né tutti gli export. |
| `ratings.set` | Input e risposta W6 coincidono con l’API W5: `{familyId, recipeId, stars}` → riepilogo. Proprietà W6 coerente. |
| `mealRecipeVersions` W1 → W4 | Compatibile strutturalmente: W1 produce `{slotId, recipeId, version, isPast}`, W4 consuma i primi tre campi. Il piano generale usa ancora `versionId`: va aggiornato a `version: number \| null`. |
| `resolveFamilySettings` W2 → W1 | Firma, posizione e proprietà coerenti. W1 passa il JSON salvato al risolutore W2; tipi e default restano nel pianificatore. Resta il conflitto degli export del rilievo 5. |
| Esclusioni | Proprietà delle operazioni assegnata a W2. W6 le esclude dalla propria UI; piano generale e spec W2 dicono ancora che W6 richiama l’aggiunta: occorre allineare il registro al perimetro scelto. |
| Hook `prepare` | W1 lo colloca dopo autorizzazione e prima di `readVersion`, coerentemente con il piano generale. W6 non propone modifiche concorrenti alla pipeline. |
| Famiglia mostrata | W2 possiede colonna, operazione e aggiornamento di `useFamily()`. W6 mantiene `familyId` esplicito. La migrazione da `me.get` versionato a `profile.get` non versionato è pianificata da W2. |
| Migrazioni | Nessuna collisione dichiarata con W6: W6, Menu e Spesa non aggiungono migrazioni; Profilo aggiunge `20261011120000_current_family.sql`. |
| File condivisi | Oltre agli indici, si sovrappongono tipi API, API finta, dati demo e componenti ricetta. Serve una responsabilità esplicita per il loro adeguamento; il solo rebase non risolve le differenze semantiche. |

**3. Sicurezza, MCP, lingue e verificabilità**

- **Permessi e RLS:** il percorso previsto usa la transazione dell’utente, ruolo `familyMember` e identità dal contesto. `ratings.set` non accetta un identificativo dell’autore; la policy SQL limita la scrittura al proprio voto. La visibilità per possesso del libro è invece un controllo applicativo: la RLS del catalogo consente la lettura delle ricette pubblicate.
- **Isolamento:** sono previsti test per famiglia altrui, slot altrui e bozze. Il test presentato come voto di un ex membro usa però una persona mai appartenuta alla famiglia ([piano W6:441](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricettario/progetto/superpowers/plans/2026-10-11-ricettario-e-voti.md:441)). Conviene aggiungere la rimozione reale e la rilettura con lo stesso JWT.
- **MCP:** tutte e tre le operazioni W6 sono esposte con metadati coerenti; nessuna eccezione `webOnly`. Il piano prova l’esecuzione MCP del voto, mentre per le letture controlla soprattutto presenza e annotazioni. Completare con chiamate effettive di ricerca e dettaglio.
- **Bilinguismo:** quantità e testi pubblicati riusano il dominio e i dizionari; il difetto verificato riguarda le bozze incomplete del rilievo 2.
- **TDD:** i task server sono articolati in test, fallimento e implementazione. Il task web va riordinato come indicato nel rilievo 8.

**4. Decisioni da prendere tramite il coordinatore**

1. Scegliere e congelare l’interfaccia unica W1/W6, con responsabile dei file e condizione di disponibilità completa di R1.
2. Definire la resa dei testi mancanti nelle bozze citate dai pasti, compreso il ripiego linguistico; riportarla nella specifica pertinente.
3. Scegliere come garantire la completezza temporale della cache: tutti gli eventi necessari oppure un orizzonte esplicito con rinnovo completo.
4. Confermare il perimetro delle esclusioni e correggere i riferimenti secondo cui W6 dovrebbe chiamare `family.addExclusion`.
5. Assegnare gli adeguamenti condivisi di `domain/package.json`, tipi API, componenti ricetta e dati finti, con una verifica d’integrazione dopo i merge.