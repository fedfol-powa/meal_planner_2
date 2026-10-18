# Piano W19: swipe sulla fila dei giorni per cambiare settimana

Brief: `progetto/coordinamento/brief/w19-swipe-settimane.md`. Decisioni di prodotto già prese
dall'utente il 18/10/2026 (brief); qui solo come realizzarle. Specifica principale, sezione 5
(apertura e navigazione del Menu), 14 e 15; `design/design.md`; `design/percorsi.md`, percorso 1.

## Gesto

- Solo sulla fila dei giorni (`DaySelector`, elemento `.day-links`); la traccia dei pasti
  (`week-track`) resta com'è.
- Eventi **touch** della piattaforma (`touchstart`, `touchmove`, `touchend`, `touchcancel`),
  ascoltati da React in modo passivo: nessun `preventDefault`, quindi lo scorrimento verticale
  della pagina e i gesti di sistema restano nativi. Con il mouse non c'è gesto: i clic restano
  clic. Scelti al posto dei pointer event perché non richiedono `touch-action` né la gestione
  di `pointercancel` quando il browser prende lo scorrimento, e su iOS sono il caso d'uso reale.
- Riconoscimento al rilascio, su un solo dito: spostamento orizzontale **di almeno 48 px** e
  **almeno il doppio** di quello verticale. Sotto soglia, in diagonale o con più dita non
  succede nulla e il tocco resta un tocco (selezione del giorno).
- Verso sinistra (dx < 0) la settimana successiva, verso destra la precedente.
- Dopo uno swipe riconosciuto, il clic sintetico che alcuni browser emettono sul giorno sotto
  il dito viene ignorato (cattura del clic sulla fila entro 400 ms), così uno swipe non
  seleziona anche il giorno.
- La classificazione è una funzione pura (`swipeStep(dx, dy)` → `-1 | 1 | 0`), con i suoi test.

## Settimane disponibili

- Giorno di arrivo: lo stesso giorno della settimana, `selected ± 7` giorni.
- Esiste se la lettura `menu.getDates` del mese di quel giorno (la stessa del calendario,
  `datesQuery`) lo contiene, oppure se la sua settimana è già nella copia salvata
  (`queryKeys.week`). Nessuna operazione nuova nel contratto.
- Il Menu legge in anticipo i mesi del giorno precedente e successivo di 7 giorni (di solito
  lo stesso mese del giorno scelto: una sola lettura, condivisa con il calendario).
- Se non esiste, o la lettura non è ancora arrivata o è fallita: nessuna navigazione, la fila
  fa un piccolo rimbalzo verso la direzione del gesto e torna al suo posto. Nessun messaggio.
- La navigazione usa `select(target)` della pagina, lo stesso percorso del calendario: il giorno
  è fuori dalla settimana mostrata, quindi `navigate({ search: { day } })` con una voce nuova
  nella cronologia (il tasto indietro riporta alla settimana di prima, come dal calendario).

## Offline

- Il calendario offline abilita solo i giorni delle letture `getDates` salvate; scegliendo un
  giorno di una settimana non salvata, il Menu mostra l'errore di lettura con «Riprova». Lo
  swipe si comporta allo stesso modo: se la data è nelle date salvate naviga e, se la
  settimana non è salvata, compare lo stesso errore; se le date del mese non sono salvate,
  rimbalza (come il calendario, che offline non lascia scegliere).
- In più, una settimana già salvata si raggiunge anche se mancano le date del suo mese: è
  la stessa copia che il calendario mostrerebbe arrivando da un collegamento.

## Movimento

- Rimbalzo: `transform: translateX(±12px)` e ritorno, 200 ms, con la Web Animations API
  (`element.animate`), senza CSS nuovo.
- Transizione di arrivo: quando la nuova settimana è mostrata, la fila entra dal lato del
  gesto (`translateX(±24px)` → 0, opacità 0,4 → 1), 180 ms.
- Con `prefers-reduced-motion: reduce` nessuna animazione; nessuna animazione decorativa.
- Se `element.animate` non c'è (browser vecchi, jsdom) il passaggio avviene senza animazione.

## Accessibilità

- Il gesto si aggiunge ai controlli esistenti: giorni (collegamenti con `aria-current`),
  pulsante del mese e icona calendario restano invariati per tastiera e lettore di schermo.
- Nessun annuncio nuovo: con VoiceOver attivo lo swipe a un dito è il gesto di sistema per
  spostarsi fra gli elementi e non arriva alla pagina, quindi chi usa il lettore di schermo
  cambia settimana dal calendario, che porta il fuoco al giorno scelto e lo annuncia. Un
  annuncio legato allo swipe non verrebbe mai letto.
- Nessun testo nuovo.

## Struttura del codice

- `web/src/routes/menu/weekSwipe.ts`: `swipeStep`, costanti delle soglie, `bounce` e `slideIn`
  (animazioni con controllo di `prefers-reduced-motion`).
- `web/src/components/DaySelector.tsx`: prop facoltativa `onSwipe(step) => boolean`; gestisce
  il tocco, ignora il clic dopo uno swipe, rimbalza se `onSwipe` risponde `false`.
- `web/src/routes/MenuPage.tsx`: letture anticipate delle date, `swipeWeek(step)` che verifica
  la settimana e chiama `select`, `slideIn` sulla fila quando arriva la settimana nuova.

## Test

- `weekSwipe.test.ts`: soglie (sotto 48 px, diagonale, verticale, sinistra, destra).
- `MenuPage.test.tsx` (Testing Library, eventi touch):
  - swipe a sinistra da giovedì 8 ottobre → giovedì 15 ottobre, nella cronologia;
  - swipe a destra → giovedì 1 ottobre;
  - swipe a sinistra dalla settimana del 12 ottobre (ultima dei dati finti) → nessuna
    navigazione;
  - movimento sotto soglia o verticale → nessun cambio;
  - tocco su un giorno (touch senza movimento + clic) → selezione del giorno.
- Verifica con agent-browser a larghezza da telefono, eventi touch, sul server di sviluppo con
  dati finti (mai la produzione).

## Da provare a mano sull'iPhone

- Sensazione del gesto: soglia di 48 px e rapporto 2:1 né troppo duri né troppo facili.
- Rimbalzo e transizione d'arrivo: durata e ampiezza; con «Riduci movimento» attivo, nessuna.
- Che lo swipe vicino al bordo sinistro non entri in conflitto con il gesto «indietro» di
  Safari nell'app installata (in standalone non c'è; in Safari il bordo resta del sistema).
- Che un tocco rapido su un giorno resti sempre una selezione.

## Decisioni da riportare nella specifica

Prodotto (sezione 5, apertura e navigazione del Menu; `design/percorsi.md`, percorso 1):
- Swipe orizzontale sulla fila dei giorni: a sinistra la settimana successiva, a destra la
  precedente, sullo stesso giorno della settimana; settimana inesistente → rimbalzo, nessun
  messaggio. Il calendario resta l'alternativa accessibile.

Tecniche (sezione 15 o registro del piano generale):
- Gesto su eventi touch passivi, soglia 48 px e prevalenza 2:1 sull'asse verticale; nessuna
  libreria.
- Esistenza della settimana da `menu.getDates` del mese (letto in anticipo) o dalla copia
  salvata della settimana; navigazione con lo stesso percorso del calendario.
- Animazioni con Web Animations API, disattivate con `prefers-reduced-motion`.
