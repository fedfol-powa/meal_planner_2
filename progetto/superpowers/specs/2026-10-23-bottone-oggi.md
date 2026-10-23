# Spec W23: pulsante «Oggi» nella barra del Menu

Brief `progetto/coordinamento/brief/w23-bottone-oggi.md`; scelte dell'utente del 23/10/2026
trasmesse dal coordinatore. Prototipo: `prototype/src/routes/menu/+page.svelte` (commit
`c4d11e8` con le tre varianti, `19ab381` con quella scelta). Specifica principale, sezioni 5 e
14; `design/design.md`, «Calendario e navigazione»; `design/percorsi.md`, percorso 1.

## Perché

Per tornare al giorno corrente dal Menu oggi bisogna sapere che un secondo tocco su Menu nella
navbar porta a oggi, oppure aprire il calendario. Chi scorre le settimane passate o future con lo
swipe (W19, W21) non ha un modo visibile per tornare. Il pulsante rende visibile quel ritorno,
solo quando serve.

## Cosa decide l'utente (23/10)

- **Forma: variante C, icona con etichetta.** Una freccia di ritorno e la parola «Oggi» /
  «Today», senza riquadro, nel colore del testo come le altre icone della barra, a sinistra
  dell'icona del calendario.
- **Su oggi il pulsante non c'è.** Compare solo quando il Menu mostra un altro giorno.
- **Oggi senza pasti: il pulsante non si mostra** (proposta del worker, approvata). In quel caso
  l'apertura porta a un altro giorno («a oggi o al primo giorno con pasti», sezione 5) e un
  pulsante «Oggi» che porta a un altro giorno sarebbe falso.
- **Larghezza di 320 px: nessun adattamento.** Agli iPhone attuali (da 375 px) la barra sta in
  una riga anche con «September 2026» (avanzano 17 px); a 320 px la borsa può uscire dal
  margine e va bene così.

## Comportamento

1. **Quando compare.** Il pulsante c'è se e solo se il giorno di apertura (risposta di
   `menu.getOpening`, o la sua copia salvata) è oggi e il giorno mostrato è un altro. «Oggi» è
   la data locale della famiglia (`families.time_zone`), la stessa che il Menu manda già a
   `menu.getOpening`. Se oggi non ha slot con contenuto l'apertura è un altro giorno e il
   pulsante non compare mai, in nessuna settimana.
2. **Il tocco.** Porta a oggi come la scelta di un giorno dal selettore o dal calendario: nella
   stessa settimana la traccia dei pasti scorre in modo fluido fino a oggi e l'indirizzo cambia
   senza una voce nuova nella cronologia; da un'altra settimana è una navigazione normale a
   `?day=<oggi>`, con lo skeleton se la settimana non è ancora letta (W20). Nessuna animazione
   nuova: lo scorrimento della striscia dei giorni di W21 resta legato al dito e alle settimane
   accanto, mentre «Oggi» può saltare di molte settimane, come il calendario.
3. **Focus.** Dopo il tocco il pulsante sparisce: il focus passa al nome del mese, appena la
   settimana di oggi è mostrata, così chi usa tastiera o lettore di schermo resta nella barra.
4. **Forma e misure.** Pulsante senza riquadro alto 44 px (area di tocco), freccia da 22 px e
   «Oggi» in Roboto Bold 14 px, colore del testo `#232323`, spazio di 6 px fra icona ed
   etichetta, raggio 8 px per il focus. Sta nel gruppo delle azioni a destra, prima del
   calendario: il mese resta fermo e la barra non cambia altezza quando compare o sparisce.
   Mese, calendario e borsa restano come sono; il mese non va a capo.
5. **Nome accessibile.** «Vai a oggi» / «Go to today», che contiene il testo visibile; l'icona
   è nascosta ai lettori di schermo.
6. **Quando cambia «oggi».** Il giorno si ricalcola a ogni disegno del Menu, come oggi per
   l'apertura: con l'app aperta a cavallo della mezzanotte il pulsante si aggiorna al primo
   disegno successivo (un tocco, uno scorrimento, il ritorno in primo piano che rilegge i dati).
   Nessun timer: è la stessa regola dell'apertura. Al tocco la data si rilegge: se nel frattempo
   è cambiata, il tocco fa quello del secondo tocco su Menu (Menu senza `?day`, cioè l'apertura
   del nuovo giorno: oggi o il primo giorno con pasti), così non porta mai a ieri.
7. **Senza rete.** Vale la copia salvata dell'apertura: se la settimana di oggi è salvata
   l'apertura è oggi anche quando oggi non ha pasti (regola esistente di `savedOpening`), e in
   quel caso il pulsante compare e porta a oggi vuoto. Si accetta: è lo stesso giorno su cui si
   apre il Menu offline.
8. **Altri stati.** Nessun pulsante nello skeleton del Menu, in «Ancora nessun menu» e negli
   errori: compare solo nella barra della settimana mostrata.

## Fuori da questa attività

- Server, contratto, MCP: nessun cambiamento; il pulsante usa `menu.getOpening` e
  `menu.getWeek` come sono.
- `Skeleton.tsx` e il layout di attesa del Menu (`MenuSkeleton.tsx`, lavoro di W22): non si
  toccano.
- Il secondo tocco su Menu nella navbar resta com'è.

## Da provare a mano sull'iPhone

- Il pulsante compare toccando un altro giorno, con lo swipe a un'altra settimana e dal
  calendario; sparisce al ritorno su oggi.
- La barra non si sposta quando il pulsante compare o sparisce, in italiano e in inglese, con
  un mese lungo (settembre).
- Il tocco nella stessa settimana scorre fino a oggi; da un'altra settimana mostra oggi.
- Con VoiceOver: nome «Vai a oggi» e focus sul mese dopo il tocco.
- PWA lasciata aperta a cavallo della mezzanotte e riportata in primo piano: il pulsante segue
  il nuovo giorno.

## Decisioni da riportare nella specifica

### Prodotto

- Pulsante «Oggi» / «Today» nella barra del Menu, a sinistra del calendario, nella forma
  «icona con etichetta» (freccia di ritorno e testo, senza riquadro), scelta dall'utente il
  23/10/2026 fra tre varianti nel prototipo. Compare solo quando il Menu mostra un giorno
  diverso da oggi e oggi ha pasti; un tocco porta a oggi. Sezione 5 («Navigazione fra i
  giorni») e sezione 14; `design/design.md`, «Calendario e navigazione»; percorso 1 di
  `design/percorsi.md`.
- Oggi senza pasti: il pulsante non si mostra (l'apertura porta a un altro giorno). Sezione 5.
- Nessun adattamento sotto i 375 px di larghezza. Sezione 14.

### Tecniche

- Condizione: giorno di apertura uguale alla data locale della famiglia e diverso dal giorno
  mostrato; nessuna lettura nuova, nessun timer per la mezzanotte. Sezione 14.
- Tocco come la scelta di un giorno (`select`): scorrimento fluido nella stessa settimana,
  navigazione da un'altra settimana, nessuna animazione nuova. Focus sul mese dopo il tocco,
  quando la settimana è mostrata. Sezione 14.
- Icona `today` nuova in `Icon.tsx`; nessuna dipendenza. Sezione 14.
