# Prototipo, giro 3: Spesa — piano

> **Esecuzione:** inline, senza subagenti e senza tappa intermedia (metodo del giro 2):
> si sviluppa tutto il giro, poi review sull'output su iPhone. I passi usano le
> caselle (`- [ ]`) per il tracciamento.

**Obiettivo:** rendere provabile su iPhone il percorso 4 della specifica (sezione 6 e
parte funzionale "La lista della spesa"): scelta dei pasti, generazione della lista
consolidata per reparto, voci tolte perché già in casa, dispensa ed evitati a parte,
unità della famiglia ed esportazioni simulate.

**Architettura:** quella dei giri precedenti (`design/percorsi.md`, "Architettura del
prototipo"). Nuove operazioni simulate in `src/lib/operations/shopping.ts`, che
ricevono il contesto e un elenco **esplicito** di slot (così il percorso MCP ha lo
stesso ingresso, sezione 6). La lista è effimera: vive solo in memoria nella vista,
non nel `localStorage`.

**Stack:** invariato (SvelteKit, Svelte 5 runes, TypeScript, Vitest). Nessuna nuova
dipendenza.

**Riferimenti da leggere prima di iniziare:** specifica, sezioni 2 (`ingredients`,
`family_ingredients`), 6 e 14; `design/percorsi.md`; `design/design.md` e
`design/index.html` (lista della spesa del riferimento, gruppi per reparto, pulsanti);
`prototype/README.md`.

**Sezioni della specifica realizzate (in forma simulata):** 6 (scalatura,
consolidamento, esclusioni, opzionali, reparti, presentazione nel sistema della
famiglia, effimera, esportazioni), 2 (`department`, `is_pantry`, restrizione `avoid`).

## Decisioni della preparazione (6 ottobre 2026, provvisorie)

Registrate come provvisorie in `design/percorsi.md`; entrano nella specifica solo alla
chiusura del giro, dopo averle viste funzionare.

1. **Ingresso e selezione:** icona carrello nella barra del mese del Menu, accanto al
   calendario; apre una vista Spesa dedicata (`/shopping`) con l'elenco compatto dei
   pasti per giorno, una casella per pasto, scorciatoie in alto e "Genera lista (N
   pasti)" in basso.
2. **Uso della lista:** solo preparazione ed esportazione, come da specifica. Un tocco
   su una voce la toglie ("ce l'ho già") e la lascia barrata con il ripristino; nessuna
   spunta in negozio, nessun salvataggio.
3. **Dispensa ed evitati:** sezione richiudibile in fondo, "Non in lista", chiusa; un
   tocco su una voce la aggiunge alla lista nel suo reparto.
4. **Selezione di partenza:** spuntati i pasti non ancora passati da ora a domenica; se
   non ne restano, tutta la settimana successiva. Pasti liberi e slot vuoti non sono
   selezionabili. **Si toglie dalla specifica la scorciatoia "solo quelli non ancora in
   lista"** e la relativa memoria del client: chi fa due spese a settimana usa "da oggi
   a domenica" o toglie i pasti a mano.
5. **Voce della lista:** quantità e nome su una riga; una freccia la espande e mostra i
   pasti di provenienza con le quantità parziali.

**Default proposti nel piano** (da confermare approvando il piano):

- La vista di selezione mostra i giorni da oggi alla fine della settimana successiva
  disponibile; i pasti passati non compaiono. Scorciatoie: "Da oggi a domenica",
  "Prossima settimana" (se esiste), "Nessuno".
- Selezione e lista sono due fasi della stessa vista; "Modifica pasti" torna alla
  selezione conservando le spunte. Tornare al Menu scarta la lista.
- Esportazioni dal fondo della lista: **Condividi** (Web Share con testo semplice; se
  il browser non lo consente, come in HTTP sulla rete locale, un foglio con il testo e
  "Copia"), **PDF** (stampa del browser con foglio di stile di stampa, una pagina),
  **Bring!** (simulato: foglio che mostra le voci "quantità nome" che verrebbero
  inviate e la scadenza di 30 minuti). Le voci tolte non si esportano.
- Dopo un'esportazione un avviso conferma; la lista resta finché si esce dalla vista,
  così si può esportare anche altrove.
- Offline simulato: selezione, lista, Condividi e PDF funzionano; Bring! è
  disattivato perché richiede il servizio.
- Lista generata nella lingua di chi la genera e nel sistema di misura della famiglia.

## Simulazione dei dati

Dichiarata nell'interfaccia dove serve e in `design/percorsi.md`.

- **Reparti** (ordine standard, dal progetto di origine): frutta e verdura, macelleria,
  pescheria, banco frigo e latticini, pane e prodotti da forno, pasta riso e cereali,
  scatolame e conserve, surgelati, condimenti e dispensa, altro. Codici in inglese,
  etichette localizzate.
- **Classificazione dimostrativa** degli ingredienti demo in
  `scripts/demo-ingredients.json`: reparto, `isPantry` (olio, sale, pepe, aceto, spezie
  comuni, acqua, come nelle regole di origine) e, solo per duplicati evidenti nei dati
  importati (es. `uovo`/`uova`/`uova-medie`, `limone`/`limoni-medi`), l'id canonico a cui
  ricondurli. Nessun ingrediente nuovo e nessuna quantità dedotta. Ingredienti non
  classificati finiscono in "altro"; un test segnala quelli scoperti.
- **Opzionali:** ricavati dagli id con "facoltativo/facoltativa" (marcati "facoltativo"
  nella lista).
- **Evitati:** la Famiglia Folloni evita un ingrediente inventato per la prova (es.
  peperoncino), dichiarato nel seed; Lucia/Nonni nessuno.

## Regole della lista (sezione 6)

1. Slot selezionati, solo con ricetta pubblicata (pasti liberi, vuoti e bozze esclusi;
   le bozze sono segnalate a parte come "ingredienti non disponibili").
2. Scalatura sulle porzioni dello slot.
3. Consolidamento per ingrediente canonico: somma in una rappresentazione comune per
   dimensione (g, ml); unità non convertibili restano sulla stessa voce ("2 pz + 300 g");
   "q.b." si aggiunge una volta; le quantità testuali si elencano come sono.
4. Esclusione di `isPantry` e degli `avoid` della famiglia, in "Non in lista".
5. Opzionali marcati.
6. Raggruppamento per reparto nell'ordine standard, voci per nome nella lingua
   dell'utente.
7. Conversione e arrotondamento solo alla presentazione, dopo la somma (`present.ts`).

## Varianti da scegliere su iPhone

Nessuna prevista: le scelte visibili sono state decise nella preparazione. Se in
sviluppo emerge una scelta di superficie aperta, la si costruisce come variante nel
pannello Prova.

## Struttura dei file

- `src/lib/domain/types.ts`: `Department`, `Ingredient.department`, `isPantry`,
  `canonicalId`; `FamilyIngredient { familyId, ingredientId, restriction }`;
  `RecipeIngredient.isOptional`.
- `scripts/demo-ingredients.json`, `scripts/build-demo-data.ts`: classificazione nei dati
  generati; `src/lib/demo-data/seed.ts`: restrizione della famiglia.
- `src/lib/units/combine.ts`: somma di quantità per dimensione e presentazione di voci
  miste.
- `src/lib/operations/shopping.ts` (+ test): `getShoppingSelection(db, ctx)`,
  `buildShoppingList(db, ctx, slotIds)`, `arrangeShoppingList(list, addedBack)`,
  `shoppingExport(list, removed, locale)`.
- Componenti: `ShoppingSelection`, `ShoppingList` (con i fogli testo e Bring! simulato,
  riusa `BottomSheet`); icona borsa già presente in `IconLibrary`.
- Rotta: `src/routes/shopping/+page.svelte`; icona nella barra del mese di `/menu`.
- `src/lib/design/global.css`: stile di stampa della lista (una pagina).
- Testi it-IT ed en-GB in `src/lib/i18n/messages.ts`.

## Attività

### Attività 1: decisioni nei documenti e branch

- [x] Branch `prototipo-giro-3` da `main`.
- [x] `design/percorsi.md`: sezione "Giro 3" con perimetro, decisioni provvisorie,
      simulazione dei dati; tabella dei percorsi aggiornata.
- [x] Commit del piano e dei documenti.

### Attività 2: modello e dati demo

- [x] Tipi nuovi, classificazione degli ingredienti, opzionali, restrizione del seed;
      rigenerazione di `generated.json`; versione dello stato salvato incrementata.
- [x] Test: ogni ingrediente usato da ricette pubblicate ha un reparto; i canonici
      puntano a ingredienti esistenti.
- [x] Commit.

### Attività 3: operazioni della spesa (test prima)

- [x] `combine.ts`: somme g/kg, ml/l, oz nei grammi; unità miste; q.b.; testo.
- [x] `getShoppingSelection`: giorni e pasti selezionabili, selezione di partenza
      (casi: metà settimana, domenica sera, dopo la generazione del mercoledì, famiglia
      senza settimane).
- [x] `buildShoppingList`: scalatura, consolidamento, canonici, dispensa, evitati,
      opzionali, bozze, ordine dei reparti, metrico e imperiale, arrotondamento dopo la
      somma, provenienza delle voci.
- [x] `shoppingExport` (testo e voci per Bring!) ("quantità nome", senza famiglia né giorni).
- [x] Commit.

### Attività 4: vista Spesa

- [x] Icona carrello nella barra del mese del Menu, con nome accessibile.
- [x] Selezione: giorni con pasti, caselle da 44 px, scorciatoie, contatore,
      "Genera lista"; stato vuoto (nessun pasto selezionabile, famiglia nuova).
- [x] Lista: reparti, voci con tocco per togliere/ripristinare, freccia per la
      provenienza, "Non in lista" richiudibile, "Modifica pasti".
- [x] Esportazioni: Condividi con ripiego, PDF con stampa, Bring! simulato; avviso di
      conferma; offline.
- [x] Testi it-IT ed en-GB.
- [x] Commit.

### Attività 5: verifica e review

- [x] `npm test`, `npm run check`; prova nel browser a 320, 390 e 1440 px, italiano e
      inglese, metrico e imperiale, offline; anteprima di stampa.
- [x] Confronto visivo con `design/index.html`.
- [x] `design/percorsi.md`: rotte, componenti, operazioni, domande per la review;
      README del prototipo.
- [ ] `npm run preview:lan` e review dell'utente su iPhone; esito qui e in
      `design/percorsi.md`; alla chiusura, decisioni nella specifica (sezioni 6 e 14,
      parte funzionale) e voce "Misure" della sezione 15 aggiornata per quanto chiarito.

## Domande per la review (bozza)

1. La classificazione per reparto e i duplicati ricondotti sono credibili?
2. Le voci miste ("2 + 300 g") e le quantità testuali sono leggibili?
3. Arrotondamenti dopo la somma, in metrico e imperiale.
4. Esportazioni: contenuto del testo condiviso e del PDF.

## Fuori dal giro

Esportazione reale verso Bring! e pagina pubblica `/shopping-lists/<token>`; PDF
generato dal server; equivalente MCP (percorso 7, che userà le stesse operazioni);
gestione delle restrizioni sugli ingredienti (percorso 5); elenco validato delle unità
e fattori definitivi (voce "Misure" della sezione 15).

## Esito dell'esecuzione (6 ottobre 2026)

Sviluppo completato in questa sessione senza subagenti: 152 test e controllo dei tipi
verdi; prova nel browser a 320, 390 e 1440 px in italiano e inglese, metrico e
imperiale, offline (Bring! disattivato) e anteprima di stampa su una pagina. Scelte
prese durante lo sviluppo e domande per la review in `design/percorsi.md`, "Giro 3".
Il confronto con `design/index.html` riguarda gruppi e righe della spesa del
riferimento, riusati (`shopping-group`, `shopping-item`).

## Revisione del piano: lista persistente (6 ottobre 2026)

Dopo la prima prova l'utente ha rivisto la decisione 2 della preparazione: la lista
**non è più effimera**. Cambia la specifica (sezioni 2, 5, 6, 13 e parte funzionale
"La lista della spesa"), da aggiornare alla chiusura del giro come le altre decisioni
provvisorie.

### Nuove decisioni della preparazione (provvisorie)

6. **Liste della famiglia:** ogni lista appartiene a una famiglia; tutti i membri la
   vedono e la modificano, come il menu. Nessuna condivisione tra famiglie.
7. **Spunta in negozio:** un solo gesto, la casella, vale sia "ce l'ho già" sia
   "comprato"; tutti i membri vedono le spunte. Le esportazioni restano.
8. **Aggiornamento automatico:** la lista ricorda i pasti scelti, non le quantità;
   se un pasto cambia (ricetta, porzioni, scambio, pasto libero) le voci si ricalcolano
   da sole.
9. **Più liste aperte e storico:** si possono avere più liste aperte; una lista si
   chiude con "Spesa fatta" o da sola quando tutte le voci sono spuntate, e passa
   nello storico, dove si consulta o si riapre.
10. **Nessun segno "già in lista"** nella scelta dei pasti: resta tolto.
11. **Voci libere:** "Aggiungi una voce" con testo libero, nel reparto "Altro", senza
    conversioni né somme.

### Default proposti (da confermare approvando la revisione)

- **Ingresso:** la borsa nel Menu apre `/shopping`, elenco delle liste aperte (nome,
  numero di pasti, voci spuntate su totali, ultima modifica "Anna · ven 21:30") con
  "Nuova lista"; sotto lo storico, chiuso. `/shopping/new` è la scelta dei pasti di
  oggi, che crea la lista e apre `/shopping/[id]`.
- **Nome automatico** dai giorni dei pasti ("Pasti 6–11 ottobre"); nessuna
  rinomina in questo giro.
- **Voce spuntata che cambia:** se dopo la spunta la quantità di una voce aumenta, la
  voce torna da spuntare e mostra la quantità spuntata prima ("prima: 200 g"); se
  diminuisce resta spuntata. Le voci che spariscono perdono la spunta.
- **Modifica pasti** dalla lista: riapre la scelta con i pasti attuali della lista.
- **Chiusura:** chiudendo, la lista si congela (quantità e spunte del momento) e non
  segue più i pasti; "Riapri" la riporta tra le aperte e torna a seguire i pasti.
  Chiusura automatica all'ultima spunta, con avviso e "Annulla".
- **Eliminazione** di una lista (aperta o nello storico) da parte di qualunque membro,
  con avviso e "Annulla".
- **Concorrenza:** vince l'ultimo salvataggio per singola voce, come per i pasti; ogni
  lista mostra l'ultima modifica (persona e momento).
- **Offline simulato:** liste consultabili ed esportabili, spunte e modifiche
  disattivate come il resto dell'app. Va discusso in review: in negozio la rete
  manca spesso, e spuntare offline richiede una coda di sincronizzazione
  (architettura).
- **Bring!** invariato: pagina temporanea di 30 minuti generata dalla lista.

### Modello simulato

`ShoppingList { id, familyId, status: 'open' | 'closed', slotIds, checks:
{ ingredientId, quantityAtCheck, by, at }[], addedBack, manualItems: { id, text,
checked, by, at }[], frozen: lista calcolata al momento della chiusura | null,
createdBy, createdAt, updatedBy, updatedAt, closedAt }` in `DemoDatabase.shoppingLists`,
salvato in `localStorage` (versione dello stato incrementata). Bozza delle tabelle
`shopping_lists`, `shopping_list_meals`, `shopping_list_checks`,
`shopping_list_manual_items`. Il calcolo resta `buildShoppingList`; le nuove
operazioni ricevono l'id della lista, come servirà a MCP. Dati demo: una lista chiusa
della settimana del 28 settembre nello storico e una lista aperta di Anna con alcune
voci spuntate. Pannello Prova: "Anna spunta una voce della lista".

### Attività della revisione

#### Attività 6: modello e operazioni (test prima)

- [x] Tipi, seed con le due liste demo, versione dello stato.
- [x] `getShoppingLists`, `createShoppingList`, `getShoppingListDetail` (voci
      ricalcolate, spunte, "prima: …", voci libere, ultima modifica),
      `setShoppingListMeals`, `toggleShoppingItem`, `addManualItem`,
      `toggleManualItem`, `removeManualItem`, `addBackExcluded`,
      `closeShoppingList` (congela), `reopenShoppingList`, `deleteShoppingList`
      con annullamento; offline e permessi.
- [x] Commit.

#### Attività 7: viste

- [x] `/shopping` elenco e storico; `/shopping/new` scelta dei pasti; `/shopping/[id]`
      lista con voce libera, spunte condivise, "Modifica pasti", "Spesa fatta",
      "Riapri", "Elimina", esportazioni.
- [x] Pannello Prova: "Anna spunta una voce della lista".
- [x] Testi it-IT ed en-GB; commit.

#### Attività 8: verifica e review

- [ ] Test, tipi, prova nel browser come nell'attività 5 più due utenti sulla stessa
      lista e cambio di un pasto incluso; documenti; anteprima sulla rete locale.

### Esito dell'esecuzione della revisione (6 ottobre 2026)

Eseguita in questa sessione senza subagenti: 169 test e controllo dei tipi verdi;
prova nel browser a 390 px di elenco, lista di Anna, spunta, voce libera, "Spesa
fatta", storico, nuova lista, "Modifica pasti" e spunta di un altro membro dal
pannello Prova. Domande per la review in `design/percorsi.md`.
