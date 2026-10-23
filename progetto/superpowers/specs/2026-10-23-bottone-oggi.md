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

Dopo la revisione di spec e piano (`progetto/coordinamento/revisioni/w23-spec-piano.md`) il
coordinatore ha deciso il 23/10 come accertare i pasti di oggi e quando ricalcolare il giorno
(messaggio `w23-01-revisione-spec.md`); i punti 1, 6 e 7 lo riportano. Dopo il secondo giro
(`revisioni/w23-spec-piano-2.md`, messaggio `w23-02-revisione-spec-2.md`) ha deciso il ciclo
delle letture (punto 1) e chiesto di precisare il focus dopo mezzanotte (punto 3). Il terzo
giro (`revisioni/w23-spec-piano-3.md`, approvato dal coordinatore con queste correzioni) ha
aggiunto l'annullamento all'apertura del calendario e distinto l'errore dalla pausa (punto 3).

1. **Quando compare.** Il pulsante c'è se e solo se il giorno mostrato non è oggi **e** è
   accertato che oggi ha almeno un pasto con contenuto (ricetta o pasto libero: `kind` diverso
   da `empty`). L'accertamento viene dai dati della settimana di oggi (`menu.getWeek` del lunedì
   di oggi, con la stessa query del Menu). Vale il normale ciclo di quella query, come per le
   altre settimane osservate dal Menu: riuso della cache, richieste condivise con la stessa
   chiave (spesso è la settimana mostrata o una accanto già letta per lo swipe), riletture con
   verifica della versione al montaggio con dati scaduti, al ritorno in primo piano e alla
   riconnessione. Una settimana accanto che contiene oggi, prima solo letta in anticipo per lo
   swipe, diventa così osservata. Nessuna opzione speciale oltre a quelle del Menu (decisione
   del coordinatore del 23/10). Finché quei dati non ci sono (lettura in corso, errore, settimana inesistente,
   offline senza copia) il pulsante non c'è. Non dipende da `menu.getOpening`, che può
   rispondere oggi anche con soli slot vuoti (sezione 5) e, dalla copia salvata, anche senza
   guardare i pasti: la regola di apertura del Menu resta com'è. «Oggi» è la data locale della
   famiglia (`families.time_zone`), la stessa che il Menu manda già a `menu.getOpening`.
2. **Il tocco.** Porta a oggi come la scelta di un giorno dal selettore o dal calendario: nella
   stessa settimana la traccia dei pasti scorre in modo fluido fino a oggi e l'indirizzo cambia
   senza una voce nuova nella cronologia; da un'altra settimana è una navigazione normale a
   `?day=<oggi>`. Poiché il pulsante compare solo con la settimana di oggi già disponibile,
   l'arrivo di solito è immediato. Nessuna animazione nuova: lo scorrimento della striscia dei
   giorni di W21 resta legato al dito e alle settimane accanto, mentre «Oggi» può saltare di
   molte settimane, come il calendario.
3. **Focus.** Dopo il tocco il pulsante sparisce: il focus passa al nome del mese quando il Menu
   mostra davvero la destinazione del tocco, anche se in mezzo c'è lo skeleton. L'intento
   ricorda quale destinazione:
   - **un giorno esplicito** (oggi, tocco normale): arrivata quando il Menu mostra quel giorno
     con la sua settimana;
   - **l'apertura per una data precisa della famiglia** (tocco dopo il cambio di giorno, punto
     6): la destinazione è il giorno che risponde `menu.getOpening` per quella data. Un'apertura
     provvisoria, cioè la copia salvata (`savedOpening`) mostrata mentre la richiesta è in
     corso, non conta: può essere il giorno di ieri, e il focus non si sposta lì. L'apertura è
     risolta quando arriva la risposta del server, oppure quando la richiesta è in pausa senza
     rete: allora vale il giorno che il Menu mostra con la copia salvata, cioè il ripiego
     offline che esiste già. Se invece la richiesta fallisce, la copia provvisoria sparisce e il
     Menu mostra l'errore con «Riprova» (comportamento attuale): l'intento si annulla e il
     focus non si sposta. La regola di apertura non cambia. Poi l'arrivo è come per il giorno
     esplicito.
   L'intento si annulla se prima dell'arrivo l'utente va altrove (un giorno, anche dello
   skeleton o dell'apertura provvisoria, un'altra vista), se apre il calendario (dal mese o
   dall'icona, anche senza scegliere un giorno) o se la data della famiglia cambia ancora;
   allora il focus non si sposta.
4. **Forma e misure.** Pulsante senza riquadro alto 44 px (area di tocco), freccia da 22 px e
   «Oggi» in Roboto Bold 14 px, colore del testo `#232323`, spazio di 6 px fra icona ed
   etichetta, raggio 8 px per il focus. Sta nel gruppo delle azioni a destra, prima del
   calendario: mese, calendario, borsa e fila dei giorni non cambiano posizione né dimensioni
   quando compare o sparisce (a 375 px, in italiano e in inglese); il mese non va a capo.
5. **Nome accessibile.** «Vai a oggi» / «Go to today», che contiene il testo visibile; l'icona
   è nascosta ai lettori di schermo. Focus visibile da tastiera come gli altri pulsanti.
6. **Quando cambia «oggi».** Nessun timer. La data si ricalcola a ogni disegno del Menu e, in
   modo esplicito, al ritorno in primo piano (`visibilitychange` verso `visible`, e `pageshow`
   per la PWA ripresa dalla cache delle pagine): uno stato con la data forza un nuovo disegno
   se il giorno è cambiato, anche quando le letture rispondono invariate. Durante una
   permanenza continua in primo piano a cavallo della mezzanotte il pulsante si aggiorna al
   primo di questi eventi (accettato dal coordinatore). Al tocco la data si rilegge: se nel
   frattempo è cambiata, il tocco fa quello del secondo tocco su Menu (Menu senza `?day`, cioè
   l'apertura del nuovo giorno: oggi o il primo giorno con pasti), così non porta mai a ieri.
   Lo stesso ricalcolo al ritorno in primo piano aggiorna anche la data mandata a
   `menu.getOpening`: la regola di apertura non cambia, cambia solo il momento in cui si
   accorge del nuovo giorno.
7. **Senza rete.** Vale la copia salvata della settimana di oggi: se c'è e oggi ha pasti il
   pulsante compare; se non c'è, non compare. Nessuna eccezione per l'apertura offline.
8. **Altri stati.** Nessun pulsante nello skeleton del Menu, in «Ancora nessun menu» e negli
   errori: compare solo nella barra della settimana mostrata.

## Fuori da questa attività

- Server, contratto, MCP: nessun cambiamento; il pulsante usa `menu.getWeek` come è.
- La regola di apertura del Menu (`menu.getOpening`, `savedOpening`) non cambia.
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
- PWA lasciata in secondo piano a cavallo della mezzanotte e riportata in primo piano: il
  pulsante segue il nuovo giorno (compare se prima si guardava ieri, sparisce se il nuovo
  giorno è quello mostrato o non ha pasti).

## Decisioni da riportare nella specifica

### Prodotto

- Pulsante «Oggi» / «Today» nella barra del Menu, a sinistra del calendario, nella forma
  «icona con etichetta» (freccia di ritorno e testo, senza riquadro), scelta dall'utente il
  23/10/2026 fra tre varianti nel prototipo. Compare solo quando il Menu mostra un giorno
  diverso da oggi e oggi ha pasti; un tocco porta a oggi. Sezione 5 («Navigazione fra i
  giorni») e sezione 14; `design/design.md`, «Calendario e navigazione»; percorso 1 di
  `design/percorsi.md`.
- Oggi senza pasti con contenuto (anche con soli slot vuoti, o senza rete e senza copia della
  settimana di oggi): il pulsante non si mostra. Sezione 5.
- Nessun adattamento sotto i 375 px di larghezza. Sezione 14.

### Tecniche

- Visibilità (decisione del coordinatore del 23/10): il pulsante compare solo quando i dati
  della settimana di oggi, dalla cache o letti ora con la query `menu.getWeek` del Menu,
  mostrano almeno un pasto con contenuto oggi, e il giorno mostrato è un altro; finché quei
  dati mancano resta nascosto, anche offline senza copia. Non usa `menu.getOpening`. Letture
  (decisione del coordinatore del 23/10): il normale ciclo della query del Menu (cache,
  richieste condivise, riletture al montaggio con dati scaduti, al ritorno in primo piano e
  alla riconnessione), senza opzioni speciali; la settimana di oggi resta osservata anche
  quando se ne mostra un'altra. Sezioni 5 e 14.
- Cambio di giorno (decisione del coordinatore del 23/10): nessun timer; la data locale della
  famiglia si ricalcola a ogni disegno, al ritorno in primo piano (`visibilitychange` verso
  `visible`, `pageshow`) con uno stato che forza il disegno, e al tocco; in primo piano continuo
  a cavallo della mezzanotte si aggiorna al primo di questi eventi. Sezione 14.
- Tocco come la scelta di un giorno (`select`), o come il secondo tocco su Menu se la data è
  cambiata; nessuna animazione nuova. Focus sul mese solo all'arrivo sulla destinazione del
  tocco: un giorno esplicito, oppure l'apertura per una data precisa, che si considera risolta
  solo con la risposta del server o con la richiesta in pausa senza rete (ripiego sulla copia
  salvata), mai sull'apertura provvisoria mentre la richiesta è in corso; un errore della
  richiesta (schermata di errore) annulla l'intento senza spostare il focus; intento annullato
  anche da un'altra navigazione, dall'apertura del calendario (mese o icona) o da un nuovo
  cambio di data. Sezione 14.
- Icona `today` nuova in `Icon.tsx`; nessuna dipendenza. Sezione 14.
