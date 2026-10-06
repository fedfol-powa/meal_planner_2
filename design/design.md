---
version: "1.0"
status: "approved"
approvedOn: "2026-10-04"
name: "App Famiglia"
reference: "index.html"
colors:
  canvas: "#FAF8F3"
  surface: "#FFFFFF"
  text: "#232323"
  bodyText: "#454545"
  muted: "#676767"
  border: "#E4E4E4"
  accent: "#067A46"
  accentSurface: "#EEF5E8"
  freeMealSurface: "#F0F3EA"
  freeMealBorder: "#DCE4D2"
fonts:
  recipeTitle:
    family: "Reference Agrandir"
    source: "assets/hellofresh/fonts/agrandir-regular.woff2"
    weight: 400
    fallback: "Verdana, sans-serif"
  sectionTitle:
    family: "Reference Agrandir Tight"
    source: "assets/hellofresh/fonts/agrandir-tight-bold.woff2"
    weight: 400
    fallback: "Verdana, sans-serif"
  body:
    family: "Reference Roboto"
    source: "assets/hellofresh/fonts/roboto-regular.woff2"
    weight: 400
    fallback: "Helvetica, Arial, sans-serif"
  emphasis:
    family: "Reference Roboto"
    source: "assets/hellofresh/fonts/roboto-bold.woff2"
    weight: 700
    fallback: "Helvetica, Arial, sans-serif"
typography:
  recipeTitle:
    mobileSize: "1.25rem"
    desktopSize: "1.375rem"
    lineHeight: 1.3
  sectionTitle:
    size: "1.25rem"
    lineHeight: 1.3
  body:
    size: "1rem"
    lineHeight: 1.5
  metadata:
    size: "0.875rem"
    lineHeight: 1.5
  source:
    size: "0.8125rem"
    lineHeight: 1.5
  label:
    size: "0.75rem"
    lineHeight: 1.3
    letterSpacing: "0.035em"
  button:
    size: "0.875rem"
    lineHeight: 1.5
  dayNumber:
    size: "1.125rem"
    lineHeight: 1.3
shape:
  cardRadius: "0px"
  buttonRadius: "8px"
  dateSelectorRadius: "8px"
  badgeRadius: "4px"
  cardShadow: "0 1px 3px rgb(0 0 0 / 10%)"
  dividerWidth: "1px"
layout:
  maxWidth: "1200px"
  mobileBreakpoint: "768px"
  narrowBreakpoint: "360px"
  mobileGutter: "16px"
  desktopGutter: "24px"
  narrowGutter: "12px"
  cardGap: "20px"
  desktopCardGap: "24px"
  cardPadding: "18px"
  desktopCardPadding: "20px"
  photoAspectRatio: "16 / 9"
  minimumControlHeight: "44px"
---

# Linguaggio visivo approvato di App Famiglia

**Approvato dall’utente il 4 ottobre 2026 come linguaggio definitivo per il prototipo.**
Questa guida applica la decisione registrata nella
[specifica, sezione 14](../progetto/superpowers/specs/2026-09-29-app-famiglia-design.md).
Il riferimento visuale da seguire è [index.html](index.html), approvato dopo la prova
su iPhone. I valori nel front matter corrispondono a quella pagina.

La direzione deriva dallo studio di [HelloFresh](https://www.hellofresh.com/) e del
suo [menu](https://www.hellofresh.com/menus): fondo crema, schede bianche con foto,
tipografia Agrandir e Roboto, accenti verdi, pulsanti scuri e separazione leggera
fra gli elementi. Il riferimento stabile è la copia approvata nel repository;
cambiamenti futuri del sito esterno non cambiano automaticamente questa guida.

## Come usarla per il prototipo

Prima di progettare o realizzare una schermata:

1. Leggere la specifica di prodotto e questa guida.
2. Aprire `design/index.html` e confrontare gli
   [screenshot approvati](references/hellofresh/preview-mobile.png).
3. Riusare palette, font, scala, spazi e componenti, estendendoli agli stati richiesti
   dalla specifica. Il piano del prototipo deve indicare quali componenti riusa.
4. Verificare la resa su telefono e desktop con testi italiani e inglesi britannici,
   nomi lunghi, ingredienti e quantità. Il risultato va confrontato con il riferimento.
5. Concordare eventuali cambiamenti del linguaggio con l’utente e aggiornare insieme
   questa guida e la sezione pertinente della specifica.

Il linguaggio visivo è deciso. Il lavoro sul prototipo deve approfondire flussi e
stati dell’app utilizzando questa base. Il riferimento HTML è una dimostrazione
visiva, non l’implementazione dei servizi o una fonte alternativa dei requisiti.

## Colori e gerarchia

Lo sfondo generale è crema `#FAF8F3`; schede e navbar sono bianche. Il testo principale
e i pulsanti primari usano `#232323`; descrizioni e testi secondari usano rispettivamente
`#454545` e `#676767`. I separatori sono sottili e chiari, `#E4E4E4`.

Il verde `#067A46` identifica accenti, collegamenti, etichette dei pasti, spunte e
sezione attiva della navbar. Per piccoli fondi di supporto usare `#EEF5E8`.
La selezione del giorno nel calendario è **scura con testo bianco**. Le schede dei
pasti liberi usano fondo `#F0F3EA` e bordo `#DCE4D2`.

Non moltiplicare colori di accento per distinguere le sezioni. Gli stati semantici
ancora assenti dal riferimento, come errori e conflitti, vanno progettati nel piano
del prototipo con testo esplicito e contrasto verificato, senza affidarsi al solo colore.

## Tipografia

- **Agrandir Regular 400:** titoli dei pasti e titoli delle ricette nel ricettario.
  Nel menu: 20 px su mobile e 22 px su desktop, interlinea 1,3. Nel ricettario
  compatto del riferimento: 18 px, interlinea 1,35.
- **Agrandir Tight Bold:** titoli delle sezioni, per esempio i gruppi della spesa,
  20 px con interlinea 1,3. La dichiarazione CSS del file approvato usa peso **400**:
  mantenere questa associazione, anche se il nome del file contiene “bold”.
- **Roboto Regular 400:** corpo a 16 px con interlinea 1,5, testi secondari e link di
  navigazione. Metadati a 14 px e fonti a 13 px. Etichette della navbar a 12 px.
- **Roboto Bold 700:** pulsanti, durate e porzioni, quantità, numeri del calendario,
  etichette dei pasti e stato attivo della navbar.

Le equivalenze in pixel assumono una radice da 16 px; utilizzare `rem` e rispettare
le impostazioni del browser. I titoli lunghi vanno a capo senza essere troncati per
far entrare il layout. Conservare tutti gli accenti e la punteggiatura.

Caricare i quattro WOFF2 locali dichiarati sopra con `font-display: swap`.
Gli alias CSS `Reference Agrandir`, `Reference Agrandir Tight` e `Reference Roboto`
sono quelli della pagina approvata. Usare i pesi reali dichiarati e
`font-synthesis: none`; non introdurre assi o pesi interpolati che questi file non
espongono. La provenienza dei file è nell’
[inventario](references/hellofresh/reference-audit.json).

## Schede dei pasti e immagini

Le schede sono bianche, senza arrotondamento, con la sola ombra leggera dichiarata
nei token. Le fotografie occupano la larghezza della scheda con `object-fit: cover`:
nelle schede del menu, dal 6 ottobre 2026, in un banner basso in proporzione 3:1 per
risparmiare spazio verticale; nella scheda ricetta resta la proporzione 16:9. L’etichetta Pranzo/Cena compare sopra la foto con fondo
verde e testo bianco; nelle schede senza foto è nel contenuto, su fondo verde chiaro.

Sotto la foto: titolo, descrizione e una riga con durata e porzioni a sinistra e la
fonte a destra, tagliata a 22 caratteri con "…" (testo completo al passaggio del
mouse e per i lettori di schermo). Dal 6 ottobre 2026 la
scheda del menu termina con un footer a icone separato da linee da 1 px: scheda
ricetta, voto con la media della famiglia (stella verde piena se hai votato),
ingredienti con il loro numero e, solo per i pasti passati, "non cucinato". Voto e
ingredienti si aprono sotto il footer, uno alla volta; la sezione aperta o lo stato
attivo usano verde su fondo verde chiaro. Il voto aperto mostra la media in grande e
le cinque stelle sulla stessa riga, senza etichette; si toglie toccando di nuovo la
stella scelta. Gli ingredienti aperti sono una lista con quantità allineate a destra e
separatori da 1 px. Il pulsante scuro a tutta larghezza del riferimento resta per le
liste che non stanno in una scheda del menu.

**Ricettario e scheda ricetta (6 ottobre 2026).** Le schede del ricettario usano lo
stesso componente del menu: sul banner l'etichetta è il gruppo alimentare, il footer
ha scheda, voto e ingredienti alle porzioni della fonte. Sopra l'elenco: campo di
ricerca e, a destra, un'icona senza riquadro che apre e chiude filtri e ordinamento;
l'icona è verde su fondo verde chiaro quando un filtro o un ordinamento diverso dal
nome è attivo. Accanto al menu dell'ordinamento una freccia senza riquadro inverte
l'ordine scelto. Non c'è un filtro per stagione. Nella scheda ricetta il titolo è sempre il collegamento alla fonte,
seguito da voto in riga, descrizione, durata, porzioni, ingredienti e storico.

Usare immagini della ricetta con provenienza verificabile. Le foto del riferimento
sono state prese dalle pagine fonte dei piatti; le ricette di casa senza fotografia
rimangono schede di testo. Non dedurre ingredienti o informazioni nutrizionali dalle
immagini. Il collegamento alla fonte resta accessibile dal titolo della ricetta.

## Calendario e navigazione

La vista Menu parte direttamente dal calendario, senza testata introduttiva o
footer decorativo. Il giorno compare nel selettore superiore, senza ripeterne numero
o contatori nel contenuto. Il selettore ha bordo scuro da 1 px e raggio di 8 px;
il giorno attivo ha fondo scuro e testo bianco.

Sopra il selettore, dal 6 ottobre 2026, una barra senza riquadri: a sinistra il mese
del giorno scelto in Agrandir Tight, a destra le icone di azione (ora il calendario,
in seguito la spesa), sul fondo crema. Mese e icona aprono un mese navigabile per
scegliere qualunque giorno con menu, anche passato; il giorno scelto è scuro come nel
selettore e i giorni senza menu sono disattivati. Il selettore resta a tutta larghezza.
Non ci sono frecce o intervalli di settimana, né etichette di stato della settimana.

Un giorno occupa una colonna della larghezza disponibile. Le colonne si scorrono
orizzontalmente con aggancio al giorno; il tocco sul selettore porta alla stessa
colonna. Dentro il giorno si scorre in verticale. Pranzo e cena sono in colonna
sotto 768 px e affiancati da 768 px; il calendario resta visibile.

La navbar è sempre in basso. Dal 6 ottobre 2026 mostra solo le icone, più grandi,
con il nome di ogni voce conservato per i lettori di schermo; le voci sono
**Menu, Ricettario** e una voce per famiglia, account, cambio di famiglia e funzioni
dei ruoli, con etichetta «Tu» / «You» (confermata nella review del primo giro). La Spesa non è più una voce della navbar: il suo punto d'ingresso si decide nel
percorso Spesa.
Lo stato attivo è verde su un piccolo fondo verde chiaro; la navbar riserva spazio
all’area sicura dell’iPhone e non copre il contenuto. Il cambio di vista conserva
il giorno scelto nel menu. Famiglia, preferenze, curatela, amministrazione e
istruzioni MCP si raggiungono dalla quarta voce; i loro flussi sono descritti in
[percorsi.md](percorsi.md), mantenendo questo linguaggio.

## Spazi, controlli e accessibilità

- Larghezza massima: 1200 px. Margini laterali: 24 px desktop, 16 px mobile,
  12 px sotto 360 px.
- Distanza fra schede: 24 px desktop, 20 px mobile. Padding del contenuto delle
  schede: 20 px desktop e 18 px mobile.
- Pulsanti da almeno 44 px, raggio 8 px; etichette di supporto con raggio 4 px.
- Icone lineari coerenti, estremità arrotondate; icone sempre accompagnate da un
  nome accessibile. I controlli della navbar mostrano anche l’etichetta testuale.
- Focus visibile, ordine dei titoli, accesso da tastiera, stato selezionato e
  controlli espandibili devono mantenere semantica nativa o ARIA appropriata.
- Gli scorrimenti sono quelli nativi del dispositivo. Non servono animazioni
  decorative per riprodurre questo linguaggio.
- Il riferimento approvato è in tema chiaro; altri temi non sono definiti da questa guida.

## Confini del riferimento

Il menu fisso, le dodici ricette del ricettario dimostrativo e la spesa per il solo
giorno selezionato servono al confronto visivo. Il prototipo completo deve rispettare
la specifica: catalogo globale, selezione dei pasti, consolidamento degli ingredienti,
lingue, unità, permessi e tutti i flussi previsti. L’approvazione visiva non modifica
quei requisiti e non approva automaticamente i dettagli funzionali dimostrativi.

La struttura HTML e il CSS inline sono un esempio verificabile. Nel prototipo
riorganizzarli in token e componenti condivisi secondo il piano approvato, mantenendo
la resa. Gli screenshot del sito esterno documentano la ricerca; quelli
`preview-*` e `index.html` documentano la variante approvata di App Famiglia.
