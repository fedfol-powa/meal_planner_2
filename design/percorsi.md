# Percorsi del prototipo di App Famiglia

Creato: 6 ottobre 2026
Ultimo aggiornamento: 6 ottobre 2026
Stato: metodo e ordine dei percorsi concordati con l'utente il 6 ottobre 2026;
primo giro da pianificare.

Questo documento è la guida dei flussi da seguire durante la prototipazione e poi
nello sviluppo dell'app, come [design.md](design.md) lo è per il linguaggio visivo.
Applica la [specifica, sezione 14](../progetto/superpowers/specs/2026-09-29-app-famiglia-design.md)
e le resta subordinato.

## Regola di confine

- **Le decisioni di prodotto** (cosa fa l'app, regole, permessi, dati) si registrano
  nelle sezioni pertinenti della specifica e chiudono le voci della sezione 15.
- **Questo documento** descrive come si attraversano quelle decisioni nelle schermate
  e rimanda alla sezione della specifica che le contiene. Non introduce requisiti.
- **Il prototipo** in `prototype/` è il riferimento eseguibile dei percorsi approvati.
- **Il linguaggio visivo** è quello approvato in `design/`; ogni percorso riusa i suoi
  token e componenti.

## Tracciamento

| Livello | Strumento | Contenuto |
|---|---|---|
| Percorso complessivo | Questo documento | Tabella dei percorsi e dei giri, stato, date di approvazione, collegamenti a piani e review |
| Singolo giro | Piano in `progetto/superpowers/plans/` | Attività con caselle da spuntare, tappe intermedie, sezione "Esito della review" |
| Storia delle decisioni | Commit Git locali | Modifiche a specifica, percorsi e prototipo, a ogni tappa e a fine giro |

Nessun push su GitHub senza richiesta esplicita dell'utente. Strumenti esterni come
issue o documenti condivisi non sono fonti: eventuali viste si generano da qui.

## Ciclo di lavoro di ogni giro

1. **Preparazione:** domande all'utente, una alla volta, solo dove la specifica lascia
   aperta una scelta visibile nelle schermate.
2. **Piano del giro:** piano breve che indica sezioni della specifica realizzate e
   componenti di `design/` riusati o introdotti; approvato prima di scrivere codice.
3. **Sviluppo:** con le tappe concordate; pubblicazione sulla rete locale per la prova
   su iPhone.
4. **Review insieme:** osservazioni classificate in decisioni di prodotto, aggiustamenti
   di superficie e domande aperte.
5. **Consolidamento:** decisioni nella specifica, esito in questo documento e nel piano
   del giro, eventuale ricalibratura dell'ordine dei giri successivi.
6. **Commit** locale a fine giro.

## Ordine dei percorsi

Si parte dal ciclo settimanale, l'uso quotidiano che condiziona di più il modello dei
dati, e ci si allarga ai ruoli. Gli stati trasversali (vuoto, errore, permessi
insufficienti, offline) si costruiscono dentro ogni percorso.

| # | Percorso | Contenuto | Giro | Stato |
|---|---|---|---|---|
| 0 | Fondamenta | Struttura dell'app, token e componenti dal riferimento, navbar a tre voci, dati demo, strumenti di prova | 1 | In review |
| 1 | Menu | Oggi, settimane, calendario, schede dei pasti, pasti liberi e vuoti | 1 | In review |
| 2 | Ricettario e voti | Ricerca, filtri, scheda ricetta, componente stelline | 1 | In review |
| 3 | Revisione dei pasti | Azioni sugli slot, suggerimenti, ultima modifica, avvisi, conflitti | Da definire | — |
| 4 | Spesa | Selezione dei pasti, consolidamento, esclusioni, esportazioni, unità | Da definire | — |
| 5 | Famiglia e account | Wizard, prima generazione, membri e inviti (R2), impostazioni, preferenze, eliminazione della famiglia e cancellazione dell'account | Da definire | — |
| 6 | Curatela | Bozze, modifica di ricette altrui, versioni e ripristino (R1), percorso manuale rappresentato | Da definire | — |
| 7 | MCP | Pagina di istruzioni, conversazioni simulate, rimando all'app per l'eliminazione delle famiglie | Da definire | — |
| 8 | Amministrazione dell'app | Utenti, ruoli, inviti, cancellazione, ripristino del catalogo | Da definire | — |

La composizione dei giri successivi al primo si decide alla fine di ogni review.

## Architettura del prototipo

Concordata il 6 ottobre 2026. Versioni, adapter e librerie si verificano con Context7
nel piano del primo giro.

- **Progetto SvelteKit autonomo** in `prototype/`, eseguito interamente nel browser,
  con stato salvato in `localStorage`. Pubblicato sulla rete locale per l'iPhone;
  eventualmente su Netlify in seguito.
- **Struttura:** `src/lib/design` (token da `design.md`, font, stili di base),
  `src/lib/components`, `src/lib/domain` (tipi del modello della sezione 2 della
  specifica), `src/lib/operations`, `src/lib/store`, `src/lib/i18n`, `src/lib/units`,
  `src/routes` (una rotta per vista), `scripts` (dati demo), `static` (asset copiati da
  `design/` con uno script, senza duplicati versionati).
- **Operazioni applicative simulate:** le schermate non accedono allo stato
  direttamente ma chiamano operazioni (`getTodayMeals`, `searchRecipes`, `rateRecipe`…)
  che ricevono il contesto (utente, famiglia, canale `web`/`mcp`), simulano i permessi
  e restituiscono risultati o errori strutturati (conflitto, permesso mancante, dato non
  valido). Sono la bozza delle operazioni condivise tra web e MCP e servono al percorso 7.
- **Strumenti di prova:** pannello distinto dall'app, non parte del prodotto, per
  cambiare utente demo e ruoli, famiglia, lingua (`it-IT`/`en-GB`), sistema di misura
  (`metric`/`uk_imperial`), data e ora simulate, scenario (famiglia con storico,
  famiglia nuova, oggi senza pasti), modalità offline e per azzerare i dati.
- **Dati demo:** ricette generate da `../meal_planner/ricettario/ricette.yaml` in sola
  lettura, con gli ingredienti verificati dell'origine; testi inglesi scritti per il
  prototipo e marcati come dimostrativi; famiglia di Federico con alcuni membri
  inventati, voti e storico ricavati dai suoi dati; settimane precalcolate. Il
  pianificatore a regole non c'è: le scelte simulate sono semplici e dichiarate.
  Fattori di conversione imperiali standard, marcati come provvisori finché la voce
  "Misure" della sezione 15 resta aperta.
- **Fuori dal prototipo:** Supabase, autenticazione reale, MCP reale, pianificatore,
  email ed esportazioni reali. Dove servono si simulano e l'interfaccia lo dichiara.
- **Verifiche:** test Vitest su operazioni e unità, controllo dei tipi; prova nel
  browser a 320, 390 e 1440 px con testi italiani e inglesi secondo i controlli di
  [README.md](README.md); confronto visivo con [index.html](index.html) prima di ogni
  review.

## Giro 1: percorsi 0, 1 e 2

Stato: in review dal 6 ottobre 2026 (tappa intermedia raggiunta e adeguamenti fatti).
Piano approvato, esecuzione in questa sessione:
[2026-10-06-prototipo-giro-1.md](../progetto/superpowers/plans/2026-10-06-prototipo-giro-1.md). Tappa intermedia concordata dopo
Fondamenta e Menu, per un controllo veloce prima del Ricettario.

### Tappa intermedia: Fondamenta e Menu

- **Fondamenta:** navbar Menu, Ricettario e «Tu» (la Spesa è uscita dalla navbar alla
  tappa intermedia); «Tu» con le destinazioni future; token, font e componenti riorganizzati; strumenti
  di prova, lingua e sistema di misura funzionanti su tutto ciò che esiste.
- **Apertura** (specifica, sezione 5): pasti di oggi; altrimenti il primo giorno futuro
  con pasti; senza settimane, invito simulato a generare la prima.
- **Calendario:** giorni a scorrimento orizzontale come nel riferimento; accanto al
  selettore un'icona calendario per scegliere qualunque giorno con menu, anche passato.
- **Nessuno stato della settimana** (sezione 2, decisione della tappa intermedia):
  nessuna etichetta o messaggio di stato; "non cucinato" su ogni pasto passato.
- **Schede dei pasti:** con foto, senza foto, pasto libero, slot vuoto "nessuna ricetta
  adatta"; fonte web o YouTube, libro con titolo e pagine, ricetta di casa.
- **Ingredienti** scalati sulle porzioni dello slot, nelle unità della famiglia
  (sezione 6).
- **Voto e ultima modifica** visibili nella scheda; il voto si esprime nel percorso 2,
  le azioni di modifica nel percorso 3.

### Review completa: Ricettario e voti

- **Ricettario** (sezione 8): catalogo demo completo, ricerca per nome e ingrediente
  nella lingua dell'utente, filtri essenziali (pasto, tempo, gruppo alimentare,
  voto; la stagione è rinviata perché i dati di origine non la contengono), stato "nessun risultato" con invito ad allargare i filtri; esclusione
  delle ricette da libri non posseduti.
- **Scheda ricetta:** foto o testo, descrizione, durata, porzioni di riferimento,
  fonte, ingredienti con selettore di porzioni, ultime volte in cui la famiglia l'ha
  mangiata se presenti nello storico demo.
- **Componente stelline** (sezione 5), unico e riusato in pasti, ricerca e scheda:
  media della famiglia con numero di voti o "nessun voto", proprio voto distinto o
  "non hai votato", voto da 1 a 5 e "togli il mio voto" sul posto, aggiornamento
  immediato.
- **Collegamenti** fra pasto e scheda ricetta, conservando il giorno scelto.

### Dati dimostrativi

- **Fonti, in sola lettura:** `../meal_planner/ricettario/ricette.yaml` e i menu delle
  settimane del 21 e 28 settembre e del 5 ottobre 2026; le settimane precedenti citano
  ricette archiviate e sono escluse. Le regole di conversione sono nel piano del giro,
  attività 4, e nello script `prototype/scripts/build-demo-data.ts`.
- **Ricette:** 56, di cui 4 in bozza perché senza ingredienti o porzioni di riferimento;
  le bozze non compaiono nel ricettario e nei menu passati mostrano "ingredienti non
  ancora disponibili". I testi inglesi di ricette e ingredienti
  (`prototype/scripts/demo-translations.en-GB.json`) sono **dimostrativi**, non
  traduzioni del catalogo.
- **Classificazioni dimostrative:** pasto adatto ricavato dallo storico, gruppo
  alimentare dai tag, durata dal testo del tempo.
- **Settimane:** 21 settembre chiusa, 28 settembre da chiudere, 5 ottobre in corso; la
  bozza del 12 ottobre è generata dallo script con una scelta semplice, non dal
  pianificatore, e lascia vuota la cena di mercoledì 14 per mostrare "nessuna ricetta
  adatta". Diventa visibile dopo mercoledì 7 ottobre alle 20:00 (data simulata).
- **Persone:** Federico (curatore e amministratore dell'app, amministratore della
  Famiglia Folloni, membro dei Nonni), Anna e Tom (membri; Tom usa l'inglese), Lucia
  (amministratrice dei Nonni, famiglia senza settimane e senza libri). Voti di Federico
  dal progetto di origine, quelli di Anna e Tom inventati.
- **Limiti noti:** quantità non numeriche mostrate come nella fonte italiana anche in
  inglese; fattori imperiali provvisori; il titolo della scheda apre la fonte come nel
  riferimento approvato e la scheda ricetta ha un link separato.

### Stati trasversali del giro

Dati mancanti (ricetta senza foto o descrizione), nessun risultato, modalità offline
simulata in sola lettura.

### Esito della tappa intermedia (6 ottobre 2026)

Osservazioni dell'utente e decisioni, registrate nella specifica (sezioni 2, 4, 5, 14
e 17, rilievo R3) e in `design.md`:

- nessun vincolo per settimana e nessuna chiusura: ogni settimana si modifica allo
  stesso modo; i pasti passati contano come cucinati salvo "non cucinato";
- evitare le etichette che non sono dati (stato della settimana, "Passato", messaggi
  di spiegazione);
- niente frecce e intervallo della settimana in alto: icona calendario accanto al
  selettore dei giorni, con selezionabili solo i giorni che hanno un menu;
- Spesa fuori dalla navbar; il punto d'ingresso, probabilmente dal Menu con la
  selezione dei pasti, si decide nel percorso Spesa.

### Review del giro (in corso, 6 ottobre 2026)

- Icona del calendario senza riquadro; poi spostata, con il mese, in una barra sopra il
  selettore dei giorni, per mantenerlo simmetrico e lasciare spazio alla spesa.
- Voto: preferite le stelle dirette, ma in una sola riga con la media in grande e senza
  etichette (variante `row`, ora predefinita).
- Scheda del pasto più compatta: footer a icone per scheda ricetta, voto, ingredienti e,
  sui pasti passati, "non cucinato" (risponde alla domanda 4).

### Rotte e componenti del giro

- **Rotte:** `/menu`, `/recipes`, `/recipes/[id]` (`?from=menu&day=` per tornare al
  giorno, `?servings=` per le porzioni), `/you`.
- **Componenti:** `DaySelector`, `DatePicker`, `MealCard`, `IngredientList`,
  `RatingStars` (varianti `inline` e `panel`), `RecipeCard`, `RecipeFilters`,
  `StateNotice`, `OfflineBanner`, `BottomNav`, `DevPanel`, `IconLibrary`.
- **Operazioni simulate:** `getOpeningTarget`, `getWeekView`, `getMenuDates`,
  `setMealCooked`, `searchRecipes`, `getRecipeDetail`, `rateRecipe`
  (`prototype/src/lib/operations`).

### Domande per la review

1. Variante del voto da adottare: stelle dirette o riepilogo con pannello.
2. Etichetta della voce «Tu» / «You».
3. Titolo della scheda collegato alla fonte, come nel riferimento approvato, e link
   separato "Scheda ricetta": confermare o invertire.
4. Pulsante "Segna come non cucinato" visibile su ogni pasto passato: va bene così o
   meglio meno evidente?
5. Ricette `casa` con URL (R4) e ricette in bozza nei menu passati.
6. Quantità non numeriche lasciate nel testo italiano della fonte anche in inglese, e
   quantità non scalabili (per esempio "3 matasse") che restano invariate cambiando le
   porzioni.
7. Filtro per stagione non incluso: i dati di origine non hanno la stagione.

### Fuori dal giro

Azioni di modifica dei pasti, suggerimenti, avvisi e conflitti; Spesa; impostazioni e
famiglia; curatela.

### Domande della preparazione, chiuse il 6 ottobre 2026

1. **Ingresso a famiglia e account:** quarta voce della navbar, etichetta provvisoria
   «Tu» / «You» da confermare in review; porta a famiglia, preferenze, cambio di
   famiglia e funzioni dei ruoli. Nel giro 1 è un segnaposto con l'elenco delle
   destinazioni future. Registrato in `design.md` e nella sezione 14.
2. **Pasto passato:** pranzo alle 15:30 e cena alle 23:00, ora locale della famiglia
   (specifica, sezione 5). Visibile cambiando la data simulata.
3. **Forma del voto:** si costruiscono due varianti del componente, stelle dirette
   nella scheda e riepilogo compatto con pannello, selezionabili dal pannello di prova;
   la scelta si fa in review.

### Esito della review

Da compilare alla review del giro.
