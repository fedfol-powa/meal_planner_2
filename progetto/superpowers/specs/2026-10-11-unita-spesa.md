# Unità e spesa: design di dettaglio

Creato: 11 ottobre 2026
Attività: W4 dell'ondata 1 (`fondamenta/unita-spesa`), piano generale
`progetto/superpowers/plans/2026-10-11-piano-generale.md`.
Realizza: specifica principale, sezioni 2 (`ingredient_unit_equivalences`,
`shopping_list_checks`, `shopping_list_items`), 6, 12 (unità e reparti localizzati) e 15
(«Misure»). Subordinato alla specifica principale; le scelte nuove sono nell'ultima sezione.

## 1. Obiettivo e perimetro

Due moduli di dominio TypeScript puro, senza accesso a database, rete o runtime:

- `domain/src/units/`: codici delle unità, quantità, scalatura, equivalenze per
  ingrediente, somma senza arrotondamenti, presentazione nel sistema della famiglia e testo
  nella lingua di chi guarda;
- `domain/src/shopping/`: reparti, chiave della varietà, consolidamento della lista della
  settimana, stato delle voci (spunte, «prima: …», «Non in lista») e testo delle
  esportazioni.

Li usano il server (operazioni, MCP, esportazioni), l'app web (stessa presentazione anche
offline) e W3 (schema della ricetta, import). Si riscrive pulita la logica approvata del
prototipo (`prototype/src/lib/units`, `prototype/src/lib/operations/shopping*.ts`,
`prototype/src/lib/domain/ingredient-variety.ts`), con i suoi test.

**Fuori perimetro:** lettura e scrittura nel database, voci libere (`shopping_list_items`),
coda offline, PDF, pagina JSON-LD di Bring! e `temporary_lists`, interfaccia. Il dominio
riceve dati già caricati e restituisce dati.

## 2. Interfacce concordate tramite il coordinatore (11 ottobre 2026)

1. **Quantità della riga di ingrediente** (con W3): unione discriminata
   - `{ kind: 'amount', value: number, unit: UnitCode }`
   - `{ kind: 'to_taste' }`
   - `{ kind: 'text', text: { 'it-IT': string, 'en-GB': string } }`

   più `sourceText: string`, la quantità come scritta nella fonte, sempre conservata.
   Intervalli («1-2 foglie»), confezioni («1 vaschetta da 250 g»), bicchieri, gocci,
   bustine, vasetti e panetti sono `text`; l'import li segnala e il curatore può
   convertirli in g o ml citando la fonte. Nelle proiezioni `quantity` e `unit` sono null
   senza numero (dettaglio di W2 e W3).
2. **Codici delle unità** per dimensione (tabella nella sezione 3); `us_cup` ammesso solo
   nelle bozze.
3. **Equivalenze di ambito `recipe`** (tazze USA in g, ml o pezzi) applicate in gestione o
   import: la riga pubblicata contiene la quantità convertita e `sourceText` conserva la
   fonte («½ cup (circa ½ cipolla media)»); il livello pubblicabile rifiuta `us_cup`.
   Le versioni pubblicate restano immutabili e una correzione di un'equivalenza non
   cambia i pasti passati (R1). **Equivalenze di ambito `shopping`** (succo di limone in
   limoni) applicate a ogni calcolo della lista.
4. **Reparti** definiti in `domain/src/shopping/departments.ts`, importati da W2 e W3.
5. **`shopping_list_checks.quantity_at_check`**: forma canonica `CombinedQuantity`
   (sezione 5) con schema zod esportato dal dominio, usato da W2 e dal server (W1).

## 3. Codici delle unità

| Dimensione | Codici | Somma |
|---|---|---|
| `mass` | `g`, `kg`, `oz`, `lb` | in grammi |
| `volume` | `ml`, `l`, `uk_fl_oz`, `uk_pint` | in millilitri |
| `spoon` | `tbsp`, `tsp` | solo fra codici uguali, mai convertiti in ml |
| `count` | `piece`, `clove`, `slice`, `pinch`, `sprig`, `bunch`, `leaf` | solo fra codici uguali |
| `us_cup` | `us_cup` | solo fra tazze (non dovrebbe mai arrivare alla spesa: solo bozze) |

**Fattori** (Weights and Measures Act 1985 e NIST):

- 1 oz = 28,349523125 g; 1 lb = 16 oz;
- 1 fl oz britannica = 28,4130625 ml; 1 pinta britannica = 20 fl oz (568,26125 ml);
- 1 tazza USA = 236,5882365 ml (usata solo per proporre equivalenze di liquidi; la
  conversione resta per ingrediente);
- cucchiaio di misura britannico 15 ml, cucchiaino 5 ml: usati solo per **presentare**
  piccoli volumi nel sistema imperiale (sezione 6), non per convertire `tbsp`/`tsp` delle
  ricette, che restano unità domestiche.

Le unità statunitensi diverse dalla tazza (fl oz e pinte USA) non hanno codice: una fonte
che le usa si converte in gestione, come una confezione.

## 4. Scalatura ed equivalenze

- `scaleQuantity(q, servings, baseServings)`: `amount` × porzioni ÷ porzioni di base,
  senza arrotondare; `to_taste` e `text` restano invariati (un «1 mazzetto» scritto come
  testo non si scala; `1 bunch` sì). Porzioni non positive: errore.
- `UnitEquivalence`: `ingredientId`, `fromUnit`, `toUnit`, `factor` (quantità di `toUnit`
  per una `fromUnit`), `scope` (`recipe` | `shopping`), `source` (testo della fonte
  verificata). Stessa forma di `ingredient_unit_equivalences`.
- `applyRecipeEquivalence(q, eq)`: per W3 e l'import; converte una quantità `amount`
  nell'unità di destinazione se `unit === fromUnit` e lo scope è `recipe`, altrimenti
  errore.
- `toPurchaseUnit`: nella spesa, per un ingrediente con equivalenza `shopping`, converte
  la parte della quantità nella dimensione di `fromUnit` (massa e volume in unità base,
  conteggi per codice): 50 g di succo con «1 limone = 47 g» diventano 50/47 `piece`.
  Il resto della quantità resta com'è.

## 5. Somma: `CombinedQuantity`

Forma canonica, senza arrotondamenti, salvata anche in `quantity_at_check`:

```json
{ "mass_g": 340, "volume_ml": null,
  "counts": { "piece": 2, "tbsp": 1.5 },
  "texts": ["1 mazzetto"], "to_taste": true }
```

- `mass_g`, `volume_ml`: somma nelle unità base o null;
- `counts`: unità `spoon`, `count` e `us_cup` per codice;
- `texts`: chiave italiana dei testi non numerici, senza duplicati; le traduzioni per la
  presentazione arrivano con le righe (sezione 7);
- `to_taste`: almeno una riga «q.b.».

Funzioni: `emptyCombined`, `addQuantity(c, q)`, `exceeds(now, before)` (vero se una
dimensione o un codice cresce oltre un margine relativo di 10⁻⁹, se compare un nuovo
codice, un nuovo testo o «q.b.»; una diminuzione non conta), `combinedQuantitySchema` (zod).

## 6. Presentazione

La conversione e l'arrotondamento avvengono **solo qui**, dopo la somma. Ordine fisso
delle parti di una quantità combinata: massa, volume, cucchiai, cucchiaini, conteggi
nell'ordine dei codici, testi, «q.b.»; separatore « + ».

**Sistema metrico** (sezione 6 della specifica e prototipo):

| Unità | Arrotondamento |
|---|---|
| g, ml | sotto 5 all'intero (minimo 1), sotto 50 a 5, poi a 10; da 1000 in su in kg o l a 0,1 |
| tbsp, tsp | al mezzo (minimo ½) |
| piece, clove, sprig, bunch, leaf, pinch | al mezzo per eccesso |
| slice | all'intero per eccesso |
| us_cup | al quarto (solo bozze) |

**Sistema imperiale britannico** (deciso l'11 ottobre 2026, coordinatore; da vedere
nella review dell'utente):

| Quantità | Presentazione |
|---|---|
| massa sotto ½ oz (14,17 g) | grammi, arrotondati come nel metrico |
| massa da ½ a 4 oz | once al ½ |
| massa da 4 oz a 1 lb | once intere |
| massa da 1 lb | libbre al ¼ |
| volume fino a 45 ml | sotto 15 ml cucchiaini (5 ml) al ½, poi cucchiai (15 ml) al ½ |
| volume oltre 45 ml e sotto 1 pinta | fl oz al ½ fino a 4, poi intere |
| volume da 1 pinta | pinte al ¼ |
| cucchiai, conteggi, tazze | come nel metrico |

La soglia si sceglie sul valore arrotondato (15,8 oz → «1 lb», 996 g → «1 kg»).

**Cucchiai nella stessa voce** (review di spec e piano): se un volume viene presentato in
cucchiai o cucchiaini di misura e la stessa voce ha cucchiai domestici dello stesso codice,
si mostrano sommati («3 tbsp», non «2 tbsp + 1 tbsp»), arrotondando la somma al mezzo. Il
calcolo resta separato: `volume_ml` e `counts.tbsp` non si fondono in `CombinedQuantity`.

**Lista della spesa** (pezzi interi, tolleranza 0,1 per gli avanzi delle conversioni):
`piece`, `bunch`, `slice` per eccesso all'intero (½ peperone → 1, 2,06 limoni → 2,
2,2 → 3, minimo 1); `clove`, `sprig`, `leaf`, `pinch` al mezzo come nella ricetta.
Ricetta, scheda del pasto e provenienza delle voci restano nelle unità della ricetta
(con la conversione di sistema, senza unità di acquisto né pezzi interi).

**Testo** (`it-IT`, `en-GB`): etichette singolare e plurale per ogni codice («spicchio»/
«spicchi», «clove»/«cloves»; nessuna etichetta per `piece`), frazioni ¼ ½ ¾ per conteggi,
cucchiai, once, fl oz, libbre, pinte e tazze («1½ spicchi»), numeri con
`Intl.NumberFormat` della lingua («1,5 kg», «1.5 kg»), «q.b.»/«to taste», testi non
numerici nella lingua di chi guarda.

## 7. Consolidamento della lista

`consolidateShoppingList(input)`:

**Ingresso**

- `meals`: pasti della settimana in ordine di data e pasto, con `slotId`, `date`,
  `mealType`, `servings` e `recipe` (null per pasto libero o vuoto): `id`, `name`
  (bilingue), `baseServings` (null se mancante), `lines`. La ricetta è quella della
  versione giusta per il pasto (R1), scelta dal chiamante.
- Riga: `ingredientId`, `variety` (bilingue o null), `quantity`, `isOptional`. Tipo
  strutturale minimo definito qui, compatibile con la riga di W3 (la preparazione non
  serve: non cambia la voce).
- `ingredients`: per id, `name` bilingue, `department`, `isPantry`.
- `equivalences`: equivalenze `shopping`.
- `avoided`: ingredienti con restrizione `avoid` della famiglia.

**Passi** (sezione 6 della specifica)

1. Ricette senza righe o senza porzioni di base: in `skipped`; pasti senza ricetta
   ignorati; `mealCount` conta i pasti usati.
2. Scalatura di ogni riga.
3. Chiave della voce: `ingredientId` + `varietyKey(variety['it-IT'])`. La normalizzazione
   ignora maiuscole, accenti, punteggiatura, spazi e le parole `tipo`, `varieta`, `var`,
   `qualita`, `type`, `variety`; vuota senza varietà. È la `variety_key` di
   `shopping_list_checks` e di `shopping_list_added_back`.
4. Conversione in unità di acquisto e somma in `CombinedQuantity`.
5. Esclusione: `avoid` (vale per tutte le varietà dell'ingrediente) prima di `pantry`.
6. Opzionale se lo sono tutte le righe della voce.
7. Varietà mostrata: la grafia bilingue più usata fra le righe della lista; a parità, la
   prima incontrata.
8. Provenienze: pasto, ricetta e quantità scalata della riga (non convertita in unità di
   acquisto).

Un `ingredientId` assente da `ingredients` è un dato incoerente: errore.

**Uscita:** `items` (chiave, ingrediente, varietà, reparto, somma, testi bilingui dei
testi non numerici, opzionale, provenienze, esclusione), `skipped`, `mealCount`.

## 8. Stato e presentazione della lista

`arrangeShoppingList(list, { checks, addedBack, system, locale })`:

- `checks`: chiave e `quantity_at_check`. Una voce è spuntata se esiste la spunta e
  `exceeds(attuale, spuntata)` è falso; se la quantità è cresciuta torna da spuntare e
  mostra «prima: …» (la quantità spuntata presentata come la voce). Una spunta senza voce
  si ignora.
- `addedBack`: le voci escluse rimesse tornano nel loro reparto; le altre restano in «Non
  in lista».
- Reparti nell'ordine standard; voci per nome nella lingua (`localeCompare`).
- Ogni voce porta nome («Pomodori Roma»), quantità presentata con i pezzi interi,
  provenienze presentate, opzionale, stato della spunta e la quantità canonica
  (`combined`): il client la conserva così com'era quando l'utente ha visto la voce e la
  invia con la spunta come `quantity_at_check` (review di spec e piano).

Le voci libere le aggiunge il chiamante nella sezione «Altro».

## 9. Esportazioni

`shoppingExportText(arranged, { locale, manualItems })`: titolo con il numero di pasti,
reparti con le voci non spuntate «quantità nome (facoltativo)», voci libere non spuntate in
«Altro»; restituisce anche le righe «quantità nome» per Bring! e PDF. Etichette dei
reparti, «facoltativo» e titolo in `it-IT` e `en-GB`, definiti nel dominio perché li usano
sia il server (MCP, Bring!) sia il web.

## 10. Struttura dei file

```
domain/src/units/
  codes.ts         codici, dimensioni, fattori
  quantity.ts      Quantity e schema zod
  scale.ts
  equivalence.ts   UnitEquivalence, applyRecipeEquivalence, toPurchaseUnit
  combined.ts      CombinedQuantity, addQuantity, exceeds, schema zod
  present.ts       sistemi e arrotondamenti
  format.ts        testo localizzato
  labels.ts        etichette delle unità e «q.b.»
  index.ts
domain/src/shopping/
  departments.ts   codici, ordine ed etichette dei reparti
  variety.ts       varietyKey
  consolidate.ts
  arrange.ts
  export.ts
  index.ts
```

Ogni file ha il suo `*.test.ts` (vitest), con i casi del prototipo e quelli nuovi:
soglie imperiali e quantità piccole, equivalenze `recipe` e `shopping`, varietà ed
evitati, dispensa, voci rimesse, spunte con crescita e diminuzione, opzionali, limoni,
ricette saltate, ingrediente mancante.

## 11. Dipendenze

Solo `zod` (già nello stack deciso; la usa anche W3), in `domain/package.json`
(`@app/domain`, workspace npm creato dallo scheletro di W1; il `package.json` della radice
non si tocca, deciso dal coordinatore l'11 ottobre 2026). Serve agli schemi di `Quantity`
e `CombinedQuantity` condivisi con contratto e database.
Farne a meno vorrebbe dire scrivere a mano la validazione e duplicarla nel contratto.
`Intl.NumberFormat` è del runtime, presente in Workers e nei browser.

## 12. Limiti noti

- Scorza e succo dello stesso limone si sommano; un'equivalenza `shopping` in grammi
  (succo) vale anche per la scorza misurata in grammi (già accettato nel prototipo).
- Errori dei decimali (sotto 10⁻⁹) assorbiti dalle tolleranze; niente frazioni esatte.
- Una grafia di varietà cambiata in modo che la chiave cambi fa perdere la spunta
  (già nella specifica, sezione 2).

## Decisioni da riportare nella specifica

**Prodotto**

- Presentazione imperiale britannica: grammi sotto ½ oz; once al ½ fino a 4 oz, poi
  intere; libbre al ¼ da 1 lb; volumi fino a 45 ml in cucchiaini o cucchiai di misura
  (5 e 15 ml) al ½; fl oz al ½ fino a 4, poi intere; pinte al ¼ da 1 pinta
  (sezioni 6 e 15).
- Spesa: `piece`, `bunch`, `slice` per eccesso all'intero con tolleranza 0,1; `clove`,
  `sprig`, `leaf`, `pinch` al mezzo (sezione 6).
- Cucchiai e cucchiaini sono unità domestiche: mai convertiti in ml né sommati ai
  volumi. Bicchieri, gocci, confezioni, vasetti, bustine, panetti e intervalli sono
  quantità testuali tradotte, convertibili dal curatore in g o ml con una fonte
  (sezioni 6 e 15).
- Varietà mostrata nella lista: la grafia più usata fra le righe della lista
  (sezione 6).
- Cucchiai di misura e cucchiai domestici dello stesso tipo nella stessa voce si
  mostrano sommati nel sistema imperiale; il calcolo resta separato (sezione 6).

**Tecniche**

- Quantità come unione discriminata `amount`/`to_taste`/`text` più `sourceText` sempre
  conservato; codici delle unità della sezione 3 di questo documento, con dimensioni e
  fattori legali (1985) e NIST; `us_cup` solo nelle bozze (sezioni 2, 6 e 15, chiude la
  conservazione della fonte in `recipe_ingredients`).
- Equivalenze `recipe` applicate in gestione o import, mai in lettura; equivalenze
  `shopping` a ogni calcolo della lista (sezioni 2 e 6).
- Reparti: codici `produce`, `butcher`, `fish`, `chilled`, `bakery`, `pasta_grains`,
  `tinned`, `frozen`, `condiments`, `other` definiti in `domain/src/shopping/` (sezione 2).
- `quantity_at_check` nella forma canonica `CombinedQuantity` (sezione 2); la vista della
  lista espone la quantità canonica di ogni voce, che il client invia con la spunta.
- Etichette di unità e reparti in `domain/`, condivise da server e web (sezione 12).
- Sezione 15, «Misure»: chiusa da questo documento.
