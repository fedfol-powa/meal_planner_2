# Percorsi del prototipo di App Famiglia

Creato: 6 ottobre 2026
Ultimo aggiornamento: 6 ottobre 2026
Stato: metodo e ordine dei percorsi concordati con l'utente il 6 ottobre 2026;
primo, secondo, terzo e quarto giro approvati il 6 ottobre 2026; quinto giro (Curatela)
in review.

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
| 0 | Fondamenta | Struttura dell'app, token e componenti dal riferimento, navbar a tre voci, dati demo, strumenti di prova | 1 | Approvato il 6 ottobre 2026 |
| 1 | Menu | Oggi, settimane, calendario, schede dei pasti, pasti liberi e vuoti | 1 | Approvato il 6 ottobre 2026 |
| 2 | Ricettario e voti | Ricerca, filtri, scheda ricetta, componente stelline | 1 | Approvato il 6 ottobre 2026 |
| 3 | Revisione dei pasti | Azioni sugli slot, suggerimenti, ultima modifica, annullamento | 2 | Approvato il 6 ottobre 2026 |
| 4 | Spesa | Lista della settimana, consolidamento, esclusioni, esportazioni, unità, offline | 3 | Approvato il 6 ottobre 2026 |
| 5 | Famiglia e account | Wizard, prima generazione, membri e inviti (R2), impostazioni, preferenze, eliminazione della famiglia e cancellazione dell'account | 4 | Approvato il 6 ottobre 2026 |
| 6 | Curatela | Bozze, modifica di ricette altrui, versioni e ripristino (R1), percorso manuale rappresentato | 5 | In review |
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

Stato: approvato dall'utente il 6 ottobre 2026, dopo tappa intermedia e review.
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
- **Settimane:** 21 e 28 settembre e 5 ottobre dai menu di origine; la settimana del
  12 ottobre è generata dallo script con una scelta semplice, non dal pianificatore, e
  lascia vuota la cena di mercoledì 14 per mostrare "nessuna ricetta adatta". Diventa
  visibile dopo mercoledì 7 ottobre alle 20:00 (data simulata).
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

### Review del giro (6 ottobre 2026, chiusa con approvazione)

- Icona del calendario senza riquadro; poi spostata, con il mese, in una barra sopra il
  selettore dei giorni, per mantenerlo simmetrico e lasciare spazio alla spesa.
- Voto: preferite le stelle dirette, ma in una sola riga con la media in grande e senza
  etichette (variante `row`, ora predefinita).
- Scheda del pasto più compatta: footer a icone per scheda ricetta, voto, ingredienti e,
  sui pasti passati, "non cucinato" (risponde alla domanda 4).
- Foto troppo alta (circa metà della scheda): provate miniatura laterale, banner 3:1 e
  16:9; scelto il **banner basso 3:1**.
- Fonte spostata sulla riga di durata e porzioni, a destra, troncata a 22 caratteri.
- Scheda ricetta: titolo sempre collegato alla fonte (risponde alla domanda 3), poi
  voto, descrizione, porzioni e ingredienti.
- Ricettario: icona che apre e chiude filtri e ordinamento (nome, voto, aggiunte di
  recente, mangiate di recente); schede con lo stesso componente del menu.
- Voto: tenuta solo la variante in riga; tolte le altre dal pannello di prova.
- Dati demo: data di aggiunta = prima settimana della ricetta nei menu di origine.
- Freccia accanto all'ordinamento per invertirlo.
- Risposte: etichetta «Tu» confermata (domanda 2); filtro per stagione escluso
  (domanda 7); quantità non numeriche tradotte nella lingua dell'utente e richieste
  per pubblicare (domanda 6, prima parte).
- Bozze (domanda 5): sezione "Bozze" in testa al ricettario, collassabile, solo per i
  curatori, con l'elenco dei dati mancanti; la scheda della bozza si apre solo per i
  curatori, anche dai menu passati; per i membri niente scheda né voto.
- Navbar con sole icone (nome accessibile conservato).
- Correzioni scelte prima di chiudere: aree di tocco da 44 px, frazioni scritte
  "½ spicchio" / "1½ spicchi", cambio utente che resta sulla famiglia corrente se
  possibile, README del prototipo.

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

Approvato dall'utente il 6 ottobre 2026 con il perimetro seguente; le decisioni sono
nella specifica (sezioni 2, 4, 5, 8, 12 e 14) e in `design.md`.

- **Menu:** apertura su oggi o sul primo giorno con pasti; barra con mese e calendario
  (solo giorni con menu); nessuno stato né chiusura delle settimane; pasti passati
  cucinati salvo "non cucinato"; schede con banner 3:1, titolo collegato alla fonte,
  riga tempo e fonte troncata, footer a icone (scheda, voto, ingredienti, non
  cucinato); offline in sola consultazione.
- **Ricettario e voti:** ricerca, filtri e ordinamento invertibile in un pannello
  richiudibile; stesse schede del menu; sezione Bozze per i curatori; scheda ricetta
  con titolo collegato alla fonte, voto in riga, porzioni e storico; voto con media e
  stelle sulla stessa riga.
- **Rinviati:** azioni di revisione dei pasti e conflitti (percorso 3), ingresso della
  spesa (percorso 4), curatela delle bozze (percorso 6), ricerca bilingue, ricalcolo
  delle quantità non numeriche.
- **Problemi minori ancora aperti dalla review del codice:** scorrimento animato
  annullato al tocco di un giorno, messaggio d'errore del voto sempre "offline",
  chiave degli ingredienti nelle liste, URL della fonte non validato, carattere
  invisibile nell'espressione che toglie gli accenti.

## Giro 2: percorso 3

Stato: approvato dall'utente il 6 ottobre 2026, dopo la review; decisioni riportate
nella specifica (sezioni 1, 3, 5, 14 e 16) e in `design.md`.
Piano: [2026-10-06-prototipo-giro-2.md](../progetto/superpowers/plans/2026-10-06-prototipo-giro-2.md).

### Perimetro

Azioni sul pasto (specifica, sezione 5): cambia ricetta con cinque suggerimenti o con la
ricerca, "proponimene un altro", porzioni, scambio, pasto libero, nota, "non proporre
più"; ultima modifica e annullamento. Valgono per pasti passati, in corso e futuri e
per slot liberi e vuoti; con l'offline simulato sono disattivate.

### Decisioni della preparazione

Date dall'utente il 6 ottobre 2026, provate nel prototipo e confermate nella review;
ora sono nella specifica.

1. "Non proporre più" sul pasto apre subito la scelta tra i cinque suggerimenti.
   L'elenco delle esclusioni è del percorso 5.
2. Nessun avviso di settimana: le modifiche a mano sono libere e silenziose; i
   suggerimenti tengono comunque conto del resto della settimana.
3. Ultima modifica con sola persona e momento, senza canale; niente sui pasti mai
   toccati.
4. Concorrenza: vince l'ultimo salvataggio, senza avviso di conflitto; il registro
   delle modifiche conserva tutto.
5. Scambio con qualunque pasto della stessa settimana; si spostano piatto (o testo
   libero) e nota, le porzioni restano allo slot.

Default del piano: "Annulla" per alcuni secondi dopo ogni modifica; nota visibile a
tutta la famiglia, fino a 200 caratteri. "Proponimene un altro" sostituiva subito il
piatto; nella review è diventato "Proponimene altri" (vedi sotto).

### Varianti nel pannello Prova

- **Ingresso alle azioni:** foglio dal basso o pannello sotto la scheda; scelto il
  pannello nella review, la variante a foglio è stata tolta.
- **Suggerimenti:** lista compatta o schede scorrevoli; scelte le schede, la lista è
  stata tolta. Il pannello Prova non ha più varianti di questo giro.

### Suggerimenti simulati

Il pianificatore non c'è. Candidati: ricette visibili alla famiglia, adatte al pasto,
non escluse, non presenti nella settimana né nelle due precedenti. Punteggio: media
della famiglia (3 senza voti), più 0,1 per settimana dall'ultima volta (al massimo 1),
meno 1 se il gruppo proteico coincide con il pasto prima o dopo; parità per nome.
I suggerimenti si mostrano cinque alla volta; "Proponimene altri" passa ai cinque
successivi e alla fine ricomincia dai primi.

### Rotte, componenti e operazioni del giro

- **Rotte:** nessuna nuova; le azioni si aprono dalla scheda del pasto in `/menu`.
- **Componenti nuovi:** `MealActionList` (azioni, nel foglio o nel pannello),
  `MealEditor` (foglio con le fasi: azioni, ricette, scambio, pasto libero, nota,
  esclusione), `RecipePicker` (suggerimenti più ricerca con `RecipeFilters`),
  `SwapPicker`, `BottomSheet`, `ServingsStepper` (riusato nella scheda ricetta),
  `UndoToast`. `RecipeCard` ha l'icona di modifica nel footer, anche per pasti liberi
  e vuoti; lo slot vuoto ha "Scegli una ricetta".
- **Operazioni simulate:** `rankCandidates`, `getSuggestions` a pagine
  (`suggestions.ts`); `replaceMealRecipe`, `setMealServings`,
  `swapMeals`, `setMealFree`, `setMealNote`, `excludeRecipe`, `includeRecipe`,
  `undoMealChanges`, `getFreeTextSuggestions` (`revision.ts`). Ogni scrittura passa da un registro delle modifiche (`mealChanges`, bozza di
  `meal_changes`).
- **Pannello Prova:** "Un altro
  membro cambia un pasto del giorno" per vedere l'ultima modifica e il limite
  dell'annullamento.

### Scelte prese durante lo sviluppo

- "Annulla" ripristina solo le proprie modifiche e solo se il pasto non è stato
  cambiato di nuovo; dopo uno scambio ripristina entrambi i pasti.
- L'annullamento dell'esclusione compare dentro il foglio, sopra i suggerimenti,
  perché l'avviso in basso resterebbe dietro al foglio.
- Nel pannello sotto la matita ci sono solo porzioni e voci di primo livello; cambio
  ricetta, scambio, pasto libero, nota ed esclusione si aprono in un foglio dal basso.
- Le porzioni si salvano quando si smette di toccare − e + (meno di un secondo), così
  un solo "Annulla" ripristina tutta la regolazione.
- Nei suggerimenti il voto si vede (media, numero di voti, proprio voto) ma non si
  esprime; si vota dalla scheda (confermato nella review).

### Domande per la review

1. Varianti: foglio dal basso o pannello nella scheda; suggerimenti in lista o a schede.
2. Default: "Annulla" per 6 secondi, nota fino a 200
   caratteri, proposte rapide del pasto libero.
3. Voto nei suggerimenti solo da leggere: va bene o si deve poter votare anche lì
   (la specifica, sezione 5, chiede di poter votare da ogni voto mostrato)?
4. La regola simulata dei suggerimenti dà risultati credibili? Lo slot vuoto di
   mercoledì 14 ha comunque suggerimenti, perché la regola è più larga del
   pianificatore.
5. Dopo un annullamento il pasto mostra "Cambiato da" chi ha annullato: va bene o
   deve tornare l'autore precedente?
6. Decisioni provvisorie della preparazione (avvisi, concorrenza, canale, scambio,
   "non proporre più"): confermarle e portarle nella specifica.

### Review del giro (6 ottobre 2026, chiusa con approvazione)

- **Ingresso alle azioni:** scelto il pannello dentro la scheda, aperto dalla matita;
  tolta la variante a foglio.
- **Voto nei suggerimenti** solo visualizzato: da riportare nella specifica,
  sezione 5, che oggi chiede di poter votare da ogni voto mostrato.
- **Pannello sotto la matita**, raccolto e riordinato: Porzioni, Cambia ricetta,
  Scambia con un altro pasto, Nota (poi lo scambio è passato dentro Cambia ricetta).
- **Cambia ricetta** contiene i suggerimenti, "Proponimene altri" (rigenera altri
  cinque suggerimenti tra cui scegliere, dentro la stessa vista, senza sostituire il
  piatto), "Segna come pasto libero", "Non proporre più" e la ricerca nel ricettario.
- **Suggerimenti** in schede scorrevoli; "Segna come pasto libero", "Non proporre
  più" e "Scambia con un altro pasto" in cima a Cambia ricetta, prima dei
  suggerimenti; il pannello sotto la matita resta con Porzioni, Cambia ricetta e Nota.
- **"Non cucinato" tolto** dopo la review: ogni pasto passato conta come mangiato e
  un pasto sbagliato si corregge cambiandolo. Nei dati demo i tre pasti che
  l'origine segnava come non cucinati ora contano come mangiati.
- Corretti dalla prova su iPhone: contenuto del foglio visibile sopra il titolo
  durante lo scorrimento e anello di focus sulla × all'apertura.
- Confermati i default (Annulla per 6 secondi, nota fino a 200 caratteri, proposte
  rapide del pasto libero), la regola simulata dei suggerimenti, l'autore
  dell'annullamento come ultima modifica e le decisioni della preparazione.

## Giro 3: percorso 4

Stato: approvato dall'utente il 6 ottobre 2026 dopo tre revisioni nella review; decisioni riportate nella specifica (sezioni 1, 2, 5, 6, 10, 13, 14, 15 e 16) e in `design.md`. Le sezioni che seguono conservano la storia del giro: valgono la "Terza revisione" e le "Decisioni successive".
Piano: [2026-10-06-prototipo-giro-3.md](../progetto/superpowers/plans/2026-10-06-prototipo-giro-3.md).

### Perimetro

Spesa (specifica, sezione 6, e "La lista della spesa"): scelta dei pasti, lista
consolidata per reparto con le unità della famiglia, dispensa ed evitati a parte,
opzionali, esportazioni simulate (testo condiviso, PDF, Bring!). Dopo la prima prova
la lista è diventata **persistente e condivisa dalla famiglia** (vedi "Revisione").

### Decisioni della preparazione (provvisorie)

Date dall'utente il 6 ottobre 2026; entrano nella specifica alla chiusura del giro.

1. Icona carrello nella barra del mese del Menu, accanto al calendario; apre la vista
   Spesa con i pasti per giorno, una casella per pasto, scorciatoie e "Genera lista".
2. ~~La lista serve solo a prepararsi e a esportare~~: superata dalla revisione
   (spunta condivisa, anche in negozio).
3. Dispensa ed evitati in una sezione richiudibile "Non in lista", in fondo; un tocco
   aggiunge la voce alla lista.
4. Selezione di partenza: i pasti non ancora passati da ora a domenica; se non ne
   restano, tutta la settimana successiva. Pasti liberi e vuoti non selezionabili.
   Si toglie la scorciatoia "solo quelli non ancora in lista" (sezione 6).
5. Voce della lista con quantità e nome; una freccia mostra i pasti di provenienza.

### Simulazione dei dati

Reparti, ingredienti di dispensa e duplicati evidenti ricondotti a un solo ingrediente
sono classificati a mano in `prototype/scripts/demo-ingredients.json`, **dimostrativi**;
gli opzionali si ricavano dai nomi con "facoltativo"; la Famiglia Folloni evita un
ingrediente scelto per la prova.

### Scelte prese durante lo sviluppo

- Icona della spesa: la borsa (`icon-bag`) già usata per la Spesa nel riferimento
  approvato, invece di un carrello nuovo.
- La selezione mostra tutti i pasti non ancora passati fino alla fine dell'ultima
  settimana visibile; pasti liberi, slot vuoti e ricette senza ingredienti compaiono
  in grigio, senza casella. Scorciatoie: "Da oggi a domenica", "Prossima settimana"
  (solo se generata) e "Nessuno".
- Nella lista la casella a sinistra, come nel riferimento, significa "ce l'ho già":
  barra la voce, che non viene esportata. La freccia a destra mostra i pasti di
  provenienza con le quantità parziali.
- Quantità incompatibili nell'ordine in cui compaiono ("50 g + 100 ml"); "q.b." una
  sola volta, in fondo; quantità testuali come scritte ("3 matasse").
- Masse e volumi da 1 kg o 1 l in su si mostrano in kg e l.
- Esportazioni in fondo, fisse: Condividi (Web Share; sulla rete locale in http il
  browser non lo consente e si apre il foglio con il testo e "Copia il testo"), PDF
  (stampa del browser, una pagina con tre colonne, senza voci tolte e senza "Non in
  lista"), Bring! simulato (foglio con le voci "quantità nome").
- La lista si rigenera cambiando lingua o unità dal pannello Prova; le voci tolte o
  aggiunte restano. Cambiando utente, famiglia o data si riparte dalla selezione.
- Su schermi larghi la vista è una colonna di 720 px.
- Il pulsante Prova è stato alzato per non coprire i pulsanti di esportazione.

### Rotte, componenti e operazioni del giro

- **Rotta:** `/shopping` (selezione e lista sono due fasi della stessa vista; la
  navbar tiene attivo il Menu).
- **Componenti:** `ShoppingSelection`, `ShoppingList` (con i fogli Testo e Bring!,
  riusa `BottomSheet`); icona nella barra del mese di `/menu`.
- **Operazioni simulate** (`prototype/src/lib/operations/shopping.ts`):
  `getShoppingSelection`, `buildShoppingList` (slot espliciti, come servirà a MCP),
  `arrangeShoppingList`, `shoppingExport`; somma delle quantità in
  `prototype/src/lib/units/combine.ts`.

### Domande per la review

1. Selezione: la scelta di partenza (da ora a domenica) e le scorciatoie bastano?
   I pasti non selezionabili in grigio aiutano o disturbano?
2. Lista: casella "ce l'ho già" a sinistra e freccia della provenienza a destra sono
   chiare? Va bene che "Non in lista" sia chiusa in fondo?
3. Quantità sommate: leggibili "50 g + 100 ml", "50 g + q.b.", "½" di peperone? Vanno
   arrotondati per eccesso i pezzi da comprare (½ peperone → 1)?
4. Reparti e duplicati ricondotti (dimostrativi): credibili?
5. Esportazioni: testo condiviso, PDF a tre colonne, Bring! simulato.
6. Decisioni provvisorie della preparazione: confermarle e portarle nella specifica,
   compresa l'eliminazione di "solo quelli non ancora in lista".

### Revisione: lista persistente (6 ottobre 2026, provvisoria)

Dopo la prima prova l'utente ha deciso che la lista non è più effimera. Decisioni:
liste della famiglia, visibili e modificabili da tutti i membri; una sola casella per
"ce l'ho già" e "comprato"; la lista ricorda i pasti e le voci seguono le loro
modifiche; più liste aperte, chiusura con "Spesa fatta" o all'ultima spunta, storico
da cui si riapre; nessun segno "già in lista" nella scelta dei pasti; voci libere in
"Altro". Default nel piano del giro, sezione "Revisione del piano".

- **Rotte:** `/shopping` (liste aperte con avanzamento e ultima modifica, "Nuova
  lista", storico richiudibile), `/shopping/new` (scelta dei pasti; con `?list=`
  modifica i pasti di una lista aperta, conservando quelli già passati),
  `/shopping/[id]` (lista).
- **Lista:** sotto il titolo nessuna riga di avanzamento o ultima modifica (tolte
  nella prova, anche dalle schede dell'elenco, che mostrano solo nome ed etichetta;
  nello storico resta la data di chiusura); voce libera dall'ultima riga della sezione "Altro" (campo con "+", sempre
  presente nelle liste aperte; richiesta dell'utente nella prova); casella condivisa; se una voce spuntata aumenta, torna
  da spuntare con "prima: …"; "Spesa fatta" ed "Elimina la lista" in fondo, con
  "Annulla" nell'avviso; una lista chiusa è in sola lettura, con "Riapri". Dopo la
  prova tutte le azioni della lista stanno nel menu "…" in alto a destra: Modifica
  pasti, Condividi, PDF, Bring!, Spesa fatta (o Riapri), Elimina la lista; niente più
  pulsanti in fondo.
- **Esportazioni:** escludono le voci spuntate e includono le voci libere in "Altro".
- **Operazioni simulate** (`prototype/src/lib/operations/shopping-lists.ts`):
  `getShoppingLists`, `getShoppingListDetail`, `createShoppingList`,
  `setShoppingListMeals`, `toggleShoppingItem`, `addManualItem`, `toggleManualItem`,
  `removeManualItem`, `toggleAddedBack`, `closeShoppingList`, `reopenShoppingList`,
  `deleteShoppingList`, `restoreShoppingList`. Il calcolo resta
  `computeShoppingList` in `shopping.ts`; una lista chiusa conserva una copia dei pasti.
- **Dati demo:** lista chiusa di Federico (28 settembre – 4 ottobre) nello storico e
  lista aperta di Anna (7–11 ottobre) con tre voci spuntate e una voce libera, creata
  con le stesse operazioni. Pannello Prova: "Un altro membro spunta una voce di una
  lista aperta".

### Domande per la review della revisione

1. Elenco delle liste: avanzamento, ultima modifica e storico chiuso bastano?
2. Una casella sola per "ce l'ho già" e "comprato": regge in negozio?
3. Voce spuntata che aumenta: torna da spuntare con "prima: …". Chiaro?
4. Chiusura automatica all'ultima spunta, con "Annulla": giusta o meglio solo a mano?
5. Lista chiusa congelata, riaperta torna a seguire i pasti: va bene?
6. Offline: spunte disattivate come il resto dell'app. In negozio serve spuntare
   offline? Se sì, è una scelta di architettura (coda di sincronizzazione).
7. Nome automatico dai giorni dei pasti; serve poterla rinominare?

### Seconda revisione: lista settimanale (6 ottobre 2026, provvisoria)

Proposta dall'utente e approvata dopo la discussione dei rischi; dettagli nel piano
del giro, "Seconda revisione".

- Con ogni settimana generata l'app crea la **lista settimanale** ("Settimana 12–18
  ottobre", etichetta "Settimanale", "Creata dall'app"), con tutti i pasti della
  settimana; una sola per famiglia e settimana, mai ricreata se eliminata.
- Va nello storico **a fine settimana** (dopo la cena di domenica), non il mercoledì:
  da mercoledì a domenica sono aperte due liste settimanali. Se nessuno l'ha toccata
  viene eliminata; lo storico conserva le ultime 12 liste chiuse.
- Le liste aperte mostrano prima le settimanali (settimana corrente, poi la
  successiva), poi quelle fatte a mano. "Nuova lista" è invariata; le sovrapposizioni
  tra liste sono accettate.
- Nel prototipo il job è `runShoppingListJobs` (`shopping-lists.ts`), eseguito
  all'avvio e a ogni cambio di stato: si prova cambiando data e ora dal pannello
  Prova (mercoledì 7 ottobre dopo le 20:00, domenica 11 dopo le 23:00).

### Domande per la review della seconda revisione

1. Le liste fatte a mano restano aperte anche quando tutti i loro pasti sono passati:
   vanno archiviate anche loro a fine periodo, come le settimanali?
2. Due liste settimanali aperte da mercoledì a domenica: l'ordine e l'etichetta bastano?
3. Il conteggio dei pasti della settimanale include quelli già passati: va bene?

### Tazze americane e pezzi interi (6 ottobre 2026, decisioni dell'utente nella prova)

- **Tazze (cup) delle fonti americane:** come i siti di ricette che pubblicano in
  grammi (tabelle di peso per ingrediente, per esempio King Arthur) e come chiede la
  sezione 6, una tazza si converte solo con un'equivalenza verificata per quello
  specifico ingrediente, conservando il testo della fonte. Se la fonte dà il
  conteggio si usa quello ("½ cup (circa ½ cipolla media)" → ½ cipolla); i solidi in
  grammi da fonti verificate (cheddar grattugiato 113 g a tazza, King Arthur; lattuga
  iceberg sminuzzata 72 g, USDA FoodData Central); liquidi e salse in ml (236,6 ml,
  NIST). Senza equivalenza la quantità resta "½ tazza USA" e la ricetta resta in bozza.
  Equivalenze dimostrative in `prototype/scripts/demo-unit-equivalences.json`, da
  confermare dal curatore. Una nota finale tra parentesi nella quantità resta solo nel
  testo della fonte ("15 cucchiai (per rosolare le melanzane)" ora è in cucchiai).
- **Pezzi interi nella lista della spesa:** i pezzi si arrotondano per eccesso
  (½ peperone → 1); nella scheda del pasto, nella ricetta e nella provenienza delle
  voci restano le frazioni per cucinare.

### Terza revisione: una lista per settimana (6 ottobre 2026, provvisoria)

Decisione dell'utente dopo la prova, che **supera** la scelta dei pasti (decisioni 1, 4
e 5 della preparazione), le liste fatte a mano, l'elenco delle liste, lo storico, la
chiusura ("Spesa fatta", chiusura all'ultima spunta, "Riapri"), l'eliminazione e la
lista settimanale con archiviazione delle revisioni precedenti.

- **Una lista per settimana**, con tutti i pasti della settimana, senza scelta:
  chi fa due spese spunta ciò che ha già comprato. Non si creano altre liste.
- **Ingresso:** la borsa nella barra del Menu apre la lista della settimana che si sta
  guardando (`/shopping/<lunedì>`); "Menu" in alto a sinistra torna al giorno scelto.
- **Settimane passate:** si aprono allo stesso modo dal Menu, con le spunte com'erano;
  nessun archivio separato.
- **Restano:** spunta condivisa, voce che torna da spuntare con "prima: …", voci
  libere in "Altro", "Non in lista", pezzi interi, esportazioni nel menu "…"
  (Condividi, PDF, Bring!).
- **Modello simulato:** `ShoppingList { familyId, weekId, checks, addedBack,
  manualItems, updatedBy, updatedAt }`, salvata alla prima modifica (una settimana mai
  toccata ha comunque la sua lista, vuota di spunte); nessun job. Operazioni:
  `getWeekShoppingList`, `toggleShoppingItem`, `addManualItem`, `toggleManualItem`,
  `removeManualItem`, `toggleAddedBack` (con il lunedì della settimana).
- **Dati demo:** settimana del 28 settembre tutta spuntata da Federico; settimana del
  5 ottobre con tre spunte di Anna e "Detersivo per i piatti". Pannello Prova: "Un
  altro membro spunta una voce della lista della settimana".

### Decisioni successive (6 ottobre 2026, provvisorie)

- **Spunta offline:** la lista della spesa è l'unica parte dell'app modificabile
  offline (spunte, voci libere, "Non in lista"): le modifiche restano sul telefono
  ("Modifiche salvate su questo telefono, da sincronizzare") e partono al ritorno
  della rete; per singola voce vince l'ultimo salvataggio. Il resto resta in sola
  consultazione. **Conseguenza di architettura**, da riportare nella specifica
  (sezioni 1 e 5): coda locale delle operazioni sulla lista (per esempio in
  IndexedDB) con invio e riconciliazione al ritorno online. Nel prototipo:
  `pendingSince` sulla lista e `syncShoppingLists` quando si esce dall'offline.
- **Voci distinte solo se cambia il prodotto:** preparazione ("tritato",
  "schiacciato", "a dadini", "succo", "scorza"), taglia ("piccola", "grande") e
  forma della parola non creano un ingrediente diverso; varietà e prodotti diversi
  sì (mandorle in scaglie, pomodorini perini, spinacini). Nei dati demo le unioni
  sono in `canonical` di `prototype/scripts/demo-ingredients.json`; nel prodotto la
  preparazione va tenuta sulla riga della ricetta, separata dall'ingrediente
  (specifica, sezione 2, `recipe_ingredients`).
- **Si compra come si vende:** nella lista della spesa un ingrediente misurato in
  modo diverso da come si compra si converte in pezzi con un'equivalenza verificata:
  il succo di limone in grammi diventa numero di limoni (USDA: il succo di un limone
  pesa 47 g; 50 g di succo + la scorza di 1 → "Limone 2"). Ricetta e provenienza delle
  voci restano nelle unità della ricetta. Arrotondamento per eccesso dei pezzi con
  tolleranza di 0,1 (2,06 → 2). Equivalenze con ambito "shopping" in
  `prototype/scripts/demo-unit-equivalences.json`. Limite noto: scorza e succo dello
  stesso limone si sommano.
- **Menu nella navbar:** da un'altra vista riporta al giorno da cui si era partiti; un
  tocco con il Menu già aperto porta a oggi (o al primo giorno con pasti).
- **Indietro uniforme:** freccia e nome della destinazione ("Menu", "Ricettario")
  anche nella scheda ricetta.

## Giro 4: percorso 5

Stato: approvato dall'utente il 6 ottobre 2026; decisioni riportate nella specifica
(sezioni 2, 3, 4, 7, 14, 15, 16 e 17) e in `design.md`.
Piano: [2026-10-06-prototipo-giro-4.md](../progetto/superpowers/plans/2026-10-06-prototipo-giro-4.md).

### Perimetro

Tutto il percorso 5 in un solo giro (specifica, sezioni 2 e 7): primo accesso
simulato, famiglia nuova con prima generazione, ingresso da invito, membri e inviti,
impostazioni della famiglia, "non proporre più", preferenze personali, cambio di
famiglia, uscita, eliminazione della famiglia e cancellazione dell'account.

### Decisioni della preparazione (6 ottobre 2026, provvisorie)

1. **Un solo giro** per tutto il percorso 5.
2. **Rientro dopo la rimozione (R2):** un membro rimosso non può rientrare con un link
   creato prima della sua rimozione; serve un link nuovo dell'amministratore. Gli
   stessi link restano validi per tutti gli altri.
3. **Impostazioni visibili:** tutte quelle della specifica tranne i pesi del
   punteggio; quota note/nuove e intervalli per gruppo alimentare in «Avanzate», chiusa.
4. **Wizard minimo:** nome e sistema di misura, poi «Genera la prima settimana»; il
   resto ha default e si sistema dalle impostazioni.
5. **Prima generazione:** pasti non ancora passati da oggi a domenica; dopo mercoledì
   alle 20:00 anche la settimana successiva, come farebbe il job.

I default proposti (vista «Tu», poi «Profilo», default della famiglia nuova, griglia dei commensali,
regole a modelli, pagine dedicate per eliminazione e cancellazione, primo accesso
simulato) sono nel piano del giro.

### Varianti nel pannello Prova

- **Cambio di famiglia:** dalla vista «Tu» o dal nome della famiglia nella barra del Menu.
- **Conferma delle eliminazioni:** pulsante dopo il riepilogo o nome da scrivere.

### Simulazione dei dati

- Marco, ex membro della Famiglia Folloni con un link ancora valido (R2); Giulia,
  utente nuova senza famiglie; inviti valido, scaduto e revocato.
- Impostazioni della Famiglia Folloni dalle regole di merito del progetto di origine
  (`../meal_planner/progetto/REGOLE.md`, sola lettura); Nonni con i default.
- Prima generazione simulata con la regola dei suggerimenti del giro 2, non con il
  pianificatore.

### Rotte, componenti e operazioni del giro

- **Rotte:** `/welcome` (accesso simulato e scelta iniziale, `?next=` per tornare alla
  pagina chiesta), `/welcome/family` (wizard), `/invite/[token]`, `/you`,
  `/you/family` (membri e inviti), `/you/family/settings`, `/you/family/exclusions`,
  `/you/family/delete?family=` (anche il link che darebbe MCP), `/you/preferences`,
  `/you/account/delete` (dopo la review sotto `/profile`). Senza accesso ogni pagina rimanda a `/welcome`; senza
  famiglia Menu, Ricettario e Spesa rimandano alla scelta iniziale.
- **Componenti nuovi:** `PageHeader`, `Stepper`, `ConfirmDanger` (le due varianti),
  `ShareLinkSheet`, `DinersGrid`, `MealRules`, `IngredientRestrictions`, `SetupCard`,
  `FamilySwitcher`.
- **Operazioni simulate:** `family.ts` (`getFamilyOverview`, `setMemberRole`,
  `removeMember`, `leaveFamily`, `renameFamily`, `setMeasurementSystem`,
  `updateFamilySettings`, `setFamilyBook`, `getIngredientRestrictions`,
  `searchIngredients`, `setIngredientRestriction`, `getExclusions`,
  `dismissSetupCard`, `getFamilyDeletion`, `deleteFamily`), `invitations.ts`
  (`createInvitation`, `revokeInvitation`, `getInvitation`, `acceptInvitation`),
  `onboarding.ts` (`createUser`, `createFamily`, `generateFirstWeeks`), `account.ts`
  (`updateProfile`, `getAccountDeletionPlan`, `deleteAccount`), `constraints.ts`
  (`fitsSettings`). Nuovi errori: `last_admin`, `last_app_admin`, `sole_member`,
  `web_only`.
- **Pannello Prova:** utente «nessuno» e scenario «Primo accesso», varianti del giro,
  «Apri un link d'invito» (attivo, scaduto, revocato), «Link per eliminare la famiglia
  (come da MCP)».

### Scelte prese durante lo sviluppo

- **I suggerimenti rispettano le impostazioni** (tempo massimo, regole, evitati,
  massimi settimanali), come farebbe il pianificatore. Effetto visibile: per le cene
  veloci del lunedì e del mercoledì i suggerimenti sono meno, perché solo 15 ricette
  demo durano al più 20 minuti. La ricerca nel ricettario resta libera.
- **Rimozione e uscita:** la rimozione è registrata (`removals`) e blocca i link
  creati prima; l'uscita volontaria no, quindi chi esce può rientrare con un link
  ancora valido.
- **Pasti non pianificati** (0 porzioni) non creano lo slot: il giorno mostra solo
  gli altri pasti.
- **Lingua iniziale:** browser in italiano → it-IT, altrimenti en-GB; la pagina di
  accesso ha comunque il cambio di lingua.
- **Google simulato** entra sempre come Giulia; l'email crea un utente nuovo se
  sconosciuta, chiedendo solo il nome.
- **Pulsanti di eliminazione rossi** (#b3261e): colore nuovo rispetto alla guida
  visiva, da confermare.
- **Ingresso da invito sempre esplicito:** anche dopo l'accesso serve «Entra nella
  famiglia».
- **Uscite volontarie dall'account** riportano a `/welcome` senza ricordare la pagina.

### Domande per la review

1. Varianti: cambio di famiglia dalla vista «Tu» o dal nome nel Menu; conferma delle
   eliminazioni con pulsante o scrivendo il nome.
2. La griglia «Chi mangia quando» è chiara? Pasti fissi e tempi nel foglio del pasto
   vanno bene?
3. Regole di pasto a modelli: bastano i tre modelli?
4. La scheda «Il primo menu è pronto» è utile o è un'etichetta in più?
5. Il riepilogo della cancellazione dell'account è chiaro famiglia per famiglia?
6. Pulsanti di eliminazione in rosso: si aggiunge il colore alla guida visiva?
7. Testi di spiegazione nelle impostazioni (sotto il titolo e nelle sezioni): tenerli
   o toglierli?

### Review del giro (6 ottobre 2026, chiusa con approvazione)

- La vista «Tu» si chiama **«Profilo»** («Profile»); rotte spostate da `/you` a
  `/profile`.
- Tutto il resto approvato così com'era: confermati i default provati, cioè cambio di
  famiglia dalla vista Profilo e conferma delle eliminazioni con il pulsante dopo il
  riepilogo (tolte le varianti dal Menu e con il nome da scrivere, e la relativa
  impostazione salvata); scheda «Il primo menu è pronto»; tre modelli di regola;
  riepilogo della cancellazione dell'account; pulsanti rossi per le azioni
  irreversibili (aggiunti a `design.md`); testi di spiegazione nelle impostazioni.
- Decisioni della preparazione confermate e riportate nella specifica: R2 chiuso,
  impostazioni visibili tranne i pesi, wizard minimo, prima generazione.

## Giro 5: percorso 6

Stato: sviluppo completato il 6 ottobre 2026; in attesa della review su iPhone.
Piano: [2026-10-06-prototipo-giro-5.md](../progetto/superpowers/plans/2026-10-06-prototipo-giro-5.md).

### Perimetro

Tutto il percorso 6 in un solo giro (specifica, sezione 8): bozze condivise fra
curatori, ripresa e pubblicazione, modulo manuale senza AI con verifica e correzione,
modifica di ricette pubblicate anche altrui, versioni con confronto e ripristino,
archiviazione, conflitti fra curatori e versione della ricetta nei pasti (R1).

### Decisioni della preparazione (6 ottobre 2026, provvisorie)

1. **Un solo giro**, compreso il modulo manuale (non anticipa la priorità M6).
2. **Versione nei pasti (R1):** i pasti passati restano sulla versione in vigore
   quando sono stati mangiati; oggi, i pasti futuri e la lista della spesa passano
   subito alla nuova versione.
3. **Modifica di una ricetta pubblicata** tramite bozza di revisione: le famiglie
   vedono la versione pubblicata finché la revisione non è verificata e pubblicata.
4. **Conflitti fra curatori:** il salvataggio di chi arriva secondo è rifiutato con
   autore, momento e campi cambiati; si sceglie fra prendere l'altra versione o
   sovrascriverla consapevolmente; la versione scartata resta recuperabile.
5. **Archiviazione reversibile:** fuori da ricettario e suggerimenti, pasti leggibili,
   ripristino dall'elenco «Archiviate» sotto le Bozze.
6. **Ripristino di una versione:** ripubblicata subito come nuova versione, dopo
   confronto e conferma; storico intero.
7. **Caricamento da file:** non in questo giro.

I default proposti (ingressi, «Salva bozza» esplicito, verifica prima di
«Pubblica», ambito del ripristino, dati demo) sono nel piano del giro.

### Varianti nel pannello Prova

- **Forma del modulo:** pagina unica a sezioni o a passi.
- **Lingue nel modulo:** italiano e inglese affiancati o selettore di lingua.

### Simulazione dei dati

- Lucia diventa curatrice, per modifiche di ricette altrui e conflitti.
- Versione 1 di ogni ricetta pubblicata all'importazione; una ricetta del 5 ottobre
  ha una versione 2 di Lucia con una dose corretta (R1 visibile).
- Bozze: le quattro importate, una nuova di Lucia a metà, una revisione di Lucia già
  verificata; una ricetta archiviata.
- Pannello Prova: «Un'altra curatrice salva la bozza aperta».

### Rotte, componenti e operazioni del giro

- **Rotte:** `/recipes/new` (nuova ricetta, la bozza nasce al primo «Salva bozza»),
  `/recipes/drafts/[id]` (modulo di una bozza nuova o di revisione),
  `/recipes/[id]/versions` (elenco), `/recipes/[id]/versions/[version]` (confronto
  con l'attuale e ripristino). `/recipes/[id]` accetta `?slot=` dal Menu per mostrare
  la versione di un pasto passato.
- **Componenti nuovi:** `RecipeForm` (le due varianti, verifica, pubblicazione, fogli
  di conflitto, ricetta cambiata, eliminazione e uscita senza salvare),
  `IngredientPicker` (catalogo o ingrediente nuovo), `ActionMenu` (menu «…» in alto a
  destra, ora condiviso con la lista della spesa).
- **Operazioni simulate** (`prototype/src/lib/operations/curation.ts`):
  `getCurationOverview`, `getDraft`, `createDraft`, `startRevision`, `saveDraft` (con
  `conflict`), `verifyDraft`, `publishDraft` (con `stale`), `discardDraft`,
  `searchCatalogueIngredients`, `createIngredient`, `getRecipeVersions`,
  `compareVersions`, `restoreVersion`, `archiveRecipe`, `unarchiveRecipe`. Validazione
  condivisa in `prototype/src/lib/domain/recipe-validation.ts` (`validateForSave`,
  `validateForPublish`, `summarize`); versione dei pasti passati in `access.ts`
  (`versionAt`, `versionForSlot`, `recipeForSlot`), usata da Menu, scheda ricetta e
  spesa. `visibleRecipe` comprende le archiviate (pasti), `catalogueRecipe` no
  (ricerca, suggerimenti, cambio ricetta).
- **Pannello Prova:** «Un'altra curatrice salva la bozza aperta» e le due varianti.

### Scelte prese durante lo sviluppo

- **Campi per pubblicare** (voce "Completezza delle ricette" della sezione 15): nomi
  e descrizioni nelle due lingue, durata, porzioni della fonte, almeno un ingrediente
  con quantità; per sito web e YouTube l'indirizzo, per un libro libro e pagine; il
  gruppo alimentare resta facoltativo. Una ricetta demo pubblicata (erbazzone) non ha
  la durata: va completata alla prima modifica.
- **Bozza:** si salva anche con quantità vuote o testi mancanti; si rifiutano solo dati
  sbagliati (indirizzo non valido, numeri non positivi, ingrediente ripetuto o
  inesistente).
- **«Verifica»** salva prima le modifiche; «Pubblica» si attiva solo dopo una verifica
  superata sull'ultima versione salvata. I problemi compaiono in cima e accanto ai
  campi; toccandoli si va al campo (e al passo, nella variante a passi).
- **Una revisione per ricetta:** «Modifica» riapre quella in corso, chiunque l'abbia
  iniziata. Se nel frattempo la ricetta è passata a un'altra versione, il modulo lo
  dice e la pubblicazione chiede conferma («Pubblica comunque»).
- **Versioni sovrascritte** in un conflitto: restano nella cronologia della bozza
  (dati), senza una vista dedicata.
- **Ingredienti nuovi** entrano subito nel catalogo condiviso, con l'iniziale
  maiuscola; il nome inglese si controlla alla pubblicazione della ricetta.
- **Eliminazione:** una bozza nuova si elimina solo se nessun pasto la cita; nei dati
  demo nessun pasto cita le quattro bozze importate (il piano lo supponeva).
- **Avviso della versione** sulla scheda aperta da un pasto passato, per tutti i membri:
  «Versione 1, quella con cui avete mangiato questo pasto…», con il link alla
  versione attuale. La scheda del pasto nel Menu non ha segni.
- **Archiviazione** con «Annulla» nell'avviso; la scheda di una ricetta archiviata ha
  l'etichetta «Archiviata» per i curatori.
- **Profilo:** sezione «Curatela del ricettario» con «Bozze e ricette archiviate» e
  «Nuova ricetta» (al posto del segnaposto).
- Gli avvisi in basso salgono sopra la barra dei pulsanti del modulo; uscendo con
  modifiche non salvate si sceglie fra salvare, uscire o restare.

### Domande per la review

1. Varianti: modulo a pagina unica o a passi; lingue affiancate o con selettore.
2. Verifica esplicita prima di «Pubblica»: chiara o un passaggio di troppo?
3. R1: l'avviso sulla scheda aperta da un pasto passato basta, o serve un segno anche
   nella scheda del pasto? Va mostrato ai membri o solo ai curatori?
4. Confronto delle versioni: leggibile su iPhone?
5. Avviso di conflitto: comprensibile e sufficiente? Serve vedere le versioni
   sovrascritte?
6. Archiviate sotto le Bozze nel Ricettario o altrove?
7. Campi obbligatori per pubblicare (sopra): giusti, compreso il gruppo alimentare
   facoltativo?
8. Decisioni provvisorie della preparazione: confermarle e portarle nella specifica.

### Prima prova su iPhone (7 ottobre 2026, provvisorie)

- **Ricettario:** ordine Bozze, ricette, Archiviate (l'archivio in fondo, chiuso).
- **Modulo manuale:** sezioni confermate così; resta secondario, perché il percorso
  consigliato per curare le ricette è l'agente via MCP. In «Pasto e porzioni» tolte la
  riga di spiegazione sulle porzioni e l'etichetta visibile «Adatta a».
- **Varietà degli ingredienti**, proposta dell'utente: l'ingrediente del catalogo resta
  il prodotto generico (Pomodori, Uva) con reparto, dispensa, conversioni ed evitati;
  la riga della ricetta ha una **varietà in testo libero e facoltativa** («Roma»,
  «gialla senza semi»), nelle due lingue per pubblicare. Nessun elenco di varietà da
  mappare in anticipo.
  - **Confronto normalizzato**, testo salvato com'è scritto (solo spazi ripuliti):
    maiuscole, accenti, punteggiatura e parole come «tipo» e «varietà» si ignorano;
    nella spesa si mostra la grafia più usata. Tutto minuscolo è stato scartato perché
    rovina i nomi propri.
  - **Consigli all'inserimento, mai blocchi:** grafia diversa di una varietà già usata
    («Usa»), nome dell'ingrediente ripetuto («Pomodoro Roma» → «Roma»), parole di
    preparazione («a dadini»: restano nel testo della fonte). Suggerimenti dalle
    varietà già usate per quell'ingrediente; la ricerca degli ingredienti trova anche le
    varietà («cuore di bue» → Pomodori cuore di bue).
  - **Spesa:** righe con stesso ingrediente e stessa varietà normalizzata si sommano;
    varietà diverse restano righe separate («Pomodori Roma», «Pomodori»); gli evitati
    valgono per tutte le varietà. Lo stesso ingrediente compare due volte in una
    ricetta solo con varietà diverse.
  - **Dati demo:** «pomodori ramati», «pomodoro a dadini (varietà Roma)» e «pomodoro
    cuore di bue» diventano Pomodori con la varietà; «a dadini» resta nel testo della
    fonte. Nell'importazione reale la stessa revisione andrà fatta sul catalogo.
  - **Prototipo:** `prototype/src/lib/domain/ingredient-variety.ts` (normalizzazione,
    consigli, varietà note), operazioni `getIngredientVarieties` e `checkVariety`,
    pulizia al salvataggio in `curation.ts`; istruzioni per l'agente in
    `prototype/src/lib/operations/curation-guide.ts`.

#### Istruzioni per l'agente sugli ingredienti (bozza, da rivedere)

Il servizio MCP le espone insieme alle operazioni (specifica, sezione 8: la guida non
dipende dalla memoria del singolo agente). Testo esposto in inglese nel prototipo;
questa è la copia italiana per la review.

1. **Solo ingredienti verificati** sulla fonte o forniti dal curatore, mai dedotti dal
   nome del piatto; se la fonte è incompleta si salva una bozza e si chiede.
2. **L'ingrediente è il prodotto generico** («Pomodori», «Uva»). Prima si cerca nel
   catalogo (la ricerca trova anche le varietà già usate); un ingrediente nuovo solo se
   nulla va bene, con nome italiano e inglese e reparto, senza varietà, taglia o
   preparazione nel nome.
3. **Varietà solo se cambia cosa si compra:** cultivar o tipo («Roma», «cuore di bue»,
   «Granny Smith», «gialla senza semi»). Non sono varietà taglia, maturazione o qualità
   («grande», «maturo», «fresco») né preparazione («tritato», «a dadini», «succo»,
   «scorza»): restano nel testo della fonte. Prima si guardano le varietà già usate per
   quell'ingrediente e se ne riusa la grafia; si scrive senza il nome dell'ingrediente
   né «tipo»; nomi propri con la maiuscola, parole comuni in minuscolo; italiano e
   inglese. Ogni consiglio del controllo va risolto, chiedendo al curatore se serve.
4. **Quantità** come nella fonte, per le porzioni di riferimento, senza conversioni;
   «q.b.» solo se la fonte lo dice (una quantità ignota è una domanda, mai «q.b.»);
   quantità a parole nelle due lingue; testo della fonte copiato com'è, preparazione
   compresa.
5. **Una riga per ingrediente e varietà:** se la fonte cita due volte lo stesso
   ingrediente (olio per il sugo e per friggere), le quantità si uniscono in una riga e
   il testo della fonte le riporta entrambe.
6. **Prima di salvare** si mostra la scheda completa al curatore, traduzioni comprese;
   la pubblicazione ricontrolla tutto.

Domande per la review: le regole 3 e 5 sono giuste? Servono esempi da ricette vere del
ricettario?
