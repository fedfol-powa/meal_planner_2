# Piano W21: la fila dei giorni segue il dito e mostra la settimana accanto

Brief: `progetto/coordinamento/brief/w21-swipe-trascinamento.md`. Decisioni di prodotto prese
dall'utente il 18/10/2026 (brief); qui come realizzarle. Parte da W19 (piano
`2026-10-18-swipe-settimane.md`, PR #72) e ne cambia solo il movimento: verifica
dell'esistenza della settimana, navigazione del calendario, un solo dito, clic sintetico, mouse
e tastiera restano come sono. Specifica principale, sezioni 5 e 14; `design/design.md`.

## Tecnica scelta: trascinamento con trasformazioni guidate dagli eventi touch

Valutate due strade.

- **Scorrimento nativo con snap su tre settimane affiancate.** Pro: fisica del dispositivo.
  Contro, decisivi: lo snap nativo si ferma sul punto più vicino (metà larghezza), non sulla
  soglia di un terzo decisa dall'utente; l'animazione dello snap non si spegne con
  `prefers-reduced-motion` (`scroll-behavior` vale solo per gli scorrimenti da codice); la
  resistenza verso una settimana inesistente c'è solo dove il browser fa il rimbalzo del bordo
  (Safari sì, Chrome per Android no); l'arrivo va riconosciuto senza `scrollend` (manca nei
  Safari meno recenti) e poi la posizione va riportata al centro mentre cambia il contenuto,
  il punto in cui è più facile un lampeggio.
- **Trasformazioni guidate dagli eventi touch** (scelta). La fila contiene tre settimane
  affiancate in una striscia (precedente, mostrata, successiva); durante il trascinamento si
  scrive `transform: translateX(…)` sulla striscia direttamente nel DOM, senza rendering React.
  Soglia di un terzo, colpo veloce, resistenza e assenza di animazione con movimento ridotto
  sono tutte nostre e uguali su ogni browser. «Gli scorrimenti sono quelli nativi del
  dispositivo» resta vero per gli scorrimenti veri (pagina, traccia dei pasti): qui c'è un
  trascinamento diretto, non uno scorrimento.

## Struttura della fila

- `.day-links` resta il riquadro (bordo, angoli, `overflow: hidden`) e riceve il gesto.
- Dentro, `.day-strip` (la striscia che si muove) con tre `.day-week` di sette colonne: la
  settimana mostrata nel flusso normale, con i collegamenti di oggi; le due accanto in
  posizione assoluta a sinistra e a destra (`right: 100%`, `left: 100%`), fuori dal riquadro
  finché non si trascina. A riposo la striscia non ha trasformazioni.
- Le settimane accanto mostrano solo le date, calcolate (`addDays(…, ±7)`), con lo stesso
  aspetto dei giorni e lo stesso giorno della settimana evidenziato: all'arrivo la fila
  centrale mostra esattamente ciò che si vedeva, quindi il passaggio non si nota. Sono
  `aria-hidden`, senza collegamenti e senza fuoco: lettore di schermo e tastiera vedono solo la
  settimana mostrata, come oggi.
- Settimana inesistente da un lato: la sua `.day-week` è vuota (al posto dei giorni non compare
  niente, si vede lo sfondo).
- Una linea divide le settimane accanto da quella mostrata (bordo destro sulla precedente e
  sinistro sulla successiva), come fra due giorni.

## Gesto

- Eventi touch della piattaforma registrati sulla fila in un solo effetto (`addEventListener`):
  `touchstart`, `touchend`, `touchcancel` passivi; `touchmove` **non passivo**, perché, solo
  dopo che il gesto è diventato orizzontale, chiama `preventDefault` (se l'evento lo consente)
  e così il rimbalzo verticale della pagina di Safari non si somma al trascinamento. Finché il
  gesto non ha un asse, e quando è verticale, nessun `preventDefault`: lo scorrimento verticale
  non viene rubato.
- CSS `touch-action: pan-y pinch-zoom` sulla fila: il browser non prende mai l'asse
  orizzontale (Chrome per Android altrimenti lo considera uno scorrimento e rende i
  `touchmove` successivi non annullabili), verticale e zoom restano del sistema.
- Asse: si decide quando il dito si è mosso di **10 px** (somma dei due assi oltre la soglia
  sul maggiore): orizzontale se `|dx| > |dy|`, altrimenti il gesto si abbandona e la fila non
  si muove più fino al prossimo tocco. Sotto i 10 px il tocco resta un tocco.
- Durante il trascinamento orizzontale la striscia segue il dito: `x = dx` verso una settimana
  esistente (limitato a una larghezza), `x = resist(dx)` verso una settimana inesistente.
- **Resistenza**: la curva dei bordi di iOS, `(1 − 1 / (|dx| · 0,55 / larghezza + 1)) ·
  larghezza`, con il segno di `dx`: segue il dito sempre meno e non supera mai la larghezza
  (a 100 px di dito, su una fila di 340 px, si sposta di circa 47 px).
- Un solo dito, clic sintetico, mouse e tastiera: come W19. Un secondo dito (anche fuori dalla
  fila, ascoltatore su `document` attivo solo durante il gesto) annulla il gesto e la fila
  torna al suo posto. Dopo un trascinamento orizzontale (qualunque esito) il clic sintetico sul
  giorno sotto il dito si ignora entro 400 ms, una volta; la protezione si azzera a un nuovo
  tocco o a un `pointerdown` del mouse e non vale per la tastiera (`detail` 0).

## Rilascio

- Funzione pura `releaseStep(dx, velocity, width)` → `-1 | 0 | 1`:
  - oltre **un terzo della larghezza** della fila → settimana accanto nella direzione del
    trascinamento;
  - altrimenti, **colpo veloce**: velocità di almeno **0,5 px/ms** (500 px/s) nella stessa
    direzione dello spostamento e spostamento di almeno **20 px** → settimana accanto;
  - un colpo veloce nella direzione opposta (il dito torna indietro rapido) annulla anche uno
    spostamento oltre il terzo, come nelle pagine di iOS;
  - altrimenti `0`, la fila torna al suo posto.
- Velocità: dai campioni `(tempo, x)` raccolti a ogni `touchmove` e al rilascio; differenza fra
  il rilascio e il primo campione degli ultimi 100 ms (se coincide con il rilascio, il campione
  precedente). Tempo da `performance.now()`.
- Il passo si applica solo se quella settimana esiste (`adjacent`); verso una settimana
  inesistente il rilascio torna sempre al suo posto.
- **Completamento**: la striscia scorre fino a mostrare tutta la settimana accanto
  (`translateX(∓larghezza)`), 220 ms con uscita morbida; alla fine resta lì (stile in linea) e
  si chiama `onSwipe(step)`, che naviga con il percorso del calendario (W19). Se `onSwipe`
  risponde `false` (settimana sparita nel frattempo) la fila torna indietro.
- **Ritorno**: verso 0 in 200 ms. Un nuovo tocco durante il ritorno riprende la fila dal
  punto in cui si trova (posizione letta dalla trasformazione calcolata), senza salti. Il
  gesto ripreso parte dalla distanza del dito che darebbe quella posizione: su un lato senza
  settimana è la distanza prima della resistenza (`unresist`, l'inversa di `resist`), così la
  resistenza non si applica due volte e la fila prosegue nello stesso verso; tornando verso il
  lato con la settimana, il passaggio per lo zero è continuo (revisione PR #74, rilievo 2).
- Con `prefers-reduced-motion: reduce` o senza Web Animations API: completamento e ritorno
  istantanei; il trascinamento segue comunque il dito (manipolazione diretta).
- Fra completamento e arrivo dei giorni nuovi i tocchi sulla fila si ignorano, e con loro il
  clic che il tocco produce: la protezione non si azzera, anzi resta attiva fino al clic di quel
  tocco o al tocco successivo. Altrimenti un tocco su un giorno durante il completamento lo
  selezionerebbe e si arriverebbe a quel giorno della settimana nuova (revisione PR #74,
  rilievo 1). Tastiera e mouse restano come in W19.

## Arrivo senza salti

- La pagina legge **in anticipo le due settimane accanto** quando le date dicono che esistono:
  `prefetchQuery` con la stessa `weekQuery` e `staleTime: Infinity`, quindi una sola lettura e
  solo se la settimana non è già nella copia locale. Nessuno osserva queste letture: non si
  ripetono al ritorno in primo piano, alla riconnessione né alle invalidazioni (decisione del
  coordinatore dopo la revisione della PR #74). Al rilascio la settimana è quasi sempre già
  nella copia locale e la pagina passa da una settimana all'altra senza «Caricamento…»; se la
  copia anticipata è vecchia, all'arrivo la normale lettura della settimana mostrata ne
  controlla la versione (`staleTime: 0`), come per ogni copia salvata.
- **Costo:** all'apertura fino a due `menu.getWeek` in più (tre invece di una); spostandosi
  di una settimana, al più una lettura anticipata nuova (quella oltre), più il controllo di
  versione della settimana mostrata che c'era già; al ritorno in primo piano, alla
  riconnessione e alle invalidazioni solo la settimana mostrata, come prima di W21. Le letture
  sono condizionali per versione (`readThrough`); nessuna operazione nuova. Effetto collaterale
  utile: offline si raggiungono anche le settimane accanto già lette.
- Disponibilità: una settimana è disponibile se un suo giorno è in `menu.getDates` (W19) o se
  la sua copia è già salvata.
- Quando arrivano i giorni nuovi (cambia il primo giorno di `dates`) un `useLayoutEffect` di
  `DaySelector` toglie la trasformazione prima del disegno: la settimana che era a lato è ora
  quella centrale, con le stesse date e lo stesso giorno evidenziato, e la fila non lampeggia
  né torna al centro prima del tempo.
- Se la settimana di arrivo non è nella copia locale (lettura anticipata non ancora finita,
  oppure offline e non salvata), la pagina mostra «Caricamento…» come quando si sceglie dal
  calendario (W19, invariato).
- Spariscono il rimbalzo e la transizione d'arrivo di W19 (`bounce`, `slideIn`) e il relativo
  codice nella pagina.

## Struttura del codice

- `web/src/routes/menu/weekSwipe.ts`: costanti (`AXIS_SLOP`, `FLICK_VELOCITY`, `FLICK_DISTANCE`,
  `COMMIT_FRACTION`), `releaseStep`, `resist`, `velocityOf(samples)`, `moveStrip(element, from,
  to, onDone)` (Web Animations API, un'animazione per elemento, istantaneo con movimento
  ridotto), `stopMotion`.
- `web/src/components/DaySelector.tsx`: striscia di tre settimane, gesto, prop `adjacent?:
  { previous: boolean; next: boolean }` e `onSwipe?: (step) => boolean` (invariata).
- `web/src/routes/MenuPage.tsx`: letture anticipate delle settimane accanto, disponibilità,
  `swipeWeek` invariato nella sostanza, via la logica di `slideIn`.
- `web/src/design/global.css`: `.day-strip`, `.day-week`, settimane accanto, `touch-action`.
- Nessun testo nuovo.

## Test

- `weekSwipe.test.ts`: `releaseStep` (sotto il terzo torna, oltre il terzo cambia, colpo
  veloce corto cambia, colpo veloce troppo corto no, colpo veloce opposto annulla),
  `resist` (sempre meno, mai oltre la larghezza, segno), `velocityOf`.
- `MenuPage.test.tsx` (Testing Library, eventi touch con tempo controllato e larghezza della
  fila di 350 px):
  - trascinamento sotto il terzo, lento → nessun cambio, la fila torna a 0;
  - oltre il terzo, lento → settimana successiva (sinistra) e precedente (destra), stesso
    giorno, nella cronologia;
  - colpo veloce corto (40 px in 50 ms) → settimana successiva;
  - verso una settimana inesistente → la fila si sposta meno del dito, al rilascio nessuna
    navigazione e ritorno a 0; la settimana accanto è vuota;
  - giorni della settimana accanto presenti durante il trascinamento (date calcolate, stesso
    giorno evidenziato, nascosti al lettore di schermo);
  - la striscia resta sulla settimana accanto finché arrivano i giorni nuovi, poi torna a 0;
  - movimento verticale → nessun movimento della fila né cambio;
  - casi già chiusi in W19 ancora verdi: tocco su un giorno, clic sintetico dopo il
    trascinamento, secondo dito fuori dalla fila, nuovo tocco, tastiera, mouse senza
    `pointerType`, giorno di arrivo senza pasti, settimana a cavallo del mese, offline;
  - con movimento ridotto nessuna animazione; animazione in corso cancellata allo smontaggio.
  - revisione PR #74, con animazioni che il test fa finire: tocco su un giorno durante il
    completamento → si arriva comunque allo stesso giorno della settimana; dopo l'arrivo un
    tocco sceglie di nuovo il giorno; ripresa del ritorno da entrambi i lati senza settimana,
    proseguendo e invertendo la direzione; letture `menu.getWeek` contate all'apertura (tre) e
    al ritorno in primo piano (una sola in più, la settimana mostrata).
- Verifica con agent-browser a larghezza da telefono, eventi touch veri via CDP, sul server di
  sviluppo con dati finti; screenshot a metà trascinamento per la PR.

## Verifica nel browser (18/10/2026)

Server di sviluppo con dati finti, Chromium di agent-browser con profilo «iPhone 14» (fila di
358 px, terzo a 119 px), eventi touch veri con `Input.dispatchTouchEvent` via CDP:
- 120–150 px lenti verso una settimana esistente: la fila segue il dito, entrano i giorni
  accanto, al rilascio si arriva allo stesso giorno della settimana senza «Caricamento…»;
- 80 e 100 px lenti: la fila torna al suo posto;
- 100 px in quattro fotogrammi (circa 0,6 px/ms, sotto il terzo): cambia settimana. Il
  Chromium senza schermo consegna i `touchmove` a circa 30 al secondo, quindi un colpo da
  40 px non si riesce a simulare veloce: va provato sull'iPhone;
- 130 px verso una settimana inesistente: la fila si sposta di 59 px, al posto dei giorni
  c'è lo sfondo, al rilascio torna e non naviga;
- gesto verticale (30 px orizzontali, 120 verticali): la fila non si muove.

## Da provare a mano sull'iPhone

- Sensazione: soglia di un terzo, colpo veloce a 0,5 px/ms, durata di 220/200 ms.
- Resistenza verso una settimana inesistente, paragonata alla fine di un elenco.
- Che, iniziato un trascinamento orizzontale, la pagina non rimbalzi in verticale; che un
  gesto verticale sulla fila non muova la fila.
- Che all'arrivo la fila non lampeggi (settimana letta in anticipo) e, con rete lenta, che
  «Caricamento…» arrivi come dal calendario.
- «Riduci movimento» attivo: la fila segue il dito, ma completamento e ritorno sono immediati.
- Tocco rapido su un giorno sempre selezione; gesto «indietro» dal bordo in Safari.

## Decisioni da riportare nella specifica

Prodotto (sezione 5, swipe fra le settimane; `design/percorsi.md`, percorso 1):
- Mentre il dito si muove la fila dei giorni lo segue e dal lato opposto entrano i giorni
  della settimana accanto (solo le date, con lo stesso giorno della settimana evidenziato).
  Al rilascio si cambia settimana oltre un terzo della larghezza della fila o con un colpo
  veloce anche corto; altrimenti la fila torna al suo posto. Verso una settimana inesistente
  la fila segue il dito con resistenza crescente, al posto dei giorni non compare niente, e
  torna sempre al suo posto (sostituisce il rimbalzo di W19).

Tecniche (sezione 14, «Swipe sulla fila dei giorni»):
- Trascinamento con trasformazioni scritte nel DOM a ogni `touchmove`, senza rendering React;
  striscia di tre settimane con le accanto in posizione assoluta; `touch-action: pan-y
  pinch-zoom` e `touchmove` non passivo con `preventDefault` solo a gesto orizzontale.
- Asse deciso a 10 px; resistenza con la curva dei bordi di iOS (coefficiente 0,55); colpo
  veloce da 0,5 px/ms e almeno 20 px, misurato sugli ultimi 100 ms; un colpo opposto annulla.
- Completamento 220 ms e ritorno 200 ms con la Web Animations API, istantanei con
  `prefers-reduced-motion`; la fila resta sulla settimana accanto fino all'arrivo dei giorni
  nuovi.
- Lettura anticipata e non osservata delle due settimane accanto quando esistono e non sono
  già salvate (`prefetchQuery`, `staleTime: Infinity`): all'apertura fino a due `menu.getWeek`
  in più, mai ripetute al ritorno in primo piano, alla riconnessione o alle invalidazioni;
  all'arrivo la lettura della settimana controlla la versione. Scartato lo scorrimento nativo
  con snap (soglia e movimento ridotto non controllabili).
- Ripresa del ritorno dalla distanza del dito prima della resistenza; un tocco durante il
  completamento non è né gesto né scelta del giorno, e il suo clic si ignora.
