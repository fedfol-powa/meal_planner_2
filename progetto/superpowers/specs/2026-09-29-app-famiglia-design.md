# App Famiglia: requisiti e design

Creato: 29 settembre 2026
Ultimo aggiornamento: 8 ottobre 2026 (architettura rivista dopo il prototipo: React e
contratto delle operazioni)
Stato: base approvata il 29 settembre; requisiti integrati dalle decisioni del 3 ottobre;
linguaggio visivo definitivo approvato il 4 ottobre e conservato in `design/`.
Il prossimo artefatto è il prototipo completo, da costruire e approvare per giri
usando il linguaggio visivo scelto; metodo, ordine dei percorsi e architettura del
prototipo concordati il 6 ottobre in `design/percorsi.md`.
Review avversariale indipendente del 3 ottobre: adatto a un prototipo esplorativo,
non ancora pronto per l'implementazione; rilievi e decisioni conseguenti nella sezione 17.
Repository: `fedfol-powa/meal_planner_2` (privato)
Progetto di origine: `fedfol-powa/meal_planner` (resta attivo, vedi "Convivenza")

## Come usare e aggiornare questo documento

Questo è il **documento unico di riferimento per i requisiti e il design completo**,
versionato in Git. Ogni scelta concordata durante brainstorming, prototipazione, design
di dettaglio o implementazione aggiorna le sezioni interessate di questo documento.
Le decisioni superate si ritrovano nella cronologia Git, non in requisiti contraddittori
lasciati attivi nel testo.

`AGENTS.md` contiene il metodo di lavoro e rimanda qui per il prodotto. Piani, prototipo
e documenti di approfondimento devono essere coerenti con questa specifica e non possono
diventare fonti alternative delle decisioni. Ogni piano indica quali sezioni realizza;
la revisione verifica sia il risultato sia l'allineamento della specifica.

La Parte 1 descrive l'app per chi la usa; la Parte 2 descrive dati, comportamenti e
architettura. Il linguaggio visivo approvato è definito nella sezione 14 e reso operativo
in `design/design.md`. Le ulteriori decisioni sui flussi entreranno in questa specifica
dopo la review del prototipo. Gli aspetti ancora da concordare sono elencati nella
sezione 15 e non vanno trattati come decisioni approvate.

**Decisioni confermate il 3 ottobre 2026:**

- unità della famiglia: metrico oppure imperiale britannico, con conversioni;
- lingua dell'utente: italiano oppure inglese britannico, dalla prima versione;
- ricette pubblicabili solo con i testi richiesti disponibili in entrambe le lingue;
  se manca una traduzione la ricetta resta in bozza;
- ingredienti verificati, quantità e unità quando applicabili e porzioni di riferimento
  obbligatori per pubblicare, anche per le ricette importate; ammesse indicazioni
  esplicite come "q.b.", senza usarle per sostituire dati mancanti;
- operazioni dell'app disponibili anche tramite MCP, con l'eccezione dell'eliminazione
  di una famiglia: esecuzione solo nell'app web e risposta MCP con URL alla pagina
  dedicata. Browser previsto anche per collegare l'account e riautenticarsi;
- client MCP obiettivo della prima versione: Codex CLI, Claude Code, ChatGPT e Claude
  Desktop, con istruzioni dedicate e compatibilità da verificare nel design tecnico;
- ruolo di curatore del ricettario, con aggiunta guidata tramite il proprio agente MCP
  e pubblicazione della ricetta solo quando le informazioni richieste sono complete;
- bozze persistenti, riprendibili e visibili anche in una sezione dell'app, separate
  dal catalogo pubblicato, condivise e modificabili da tutti i curatori;
- percorso manuale web per creare, modificare e pubblicare ricette, comprese quelle in
  bozza, con gli stessi controlli di MCP e senza funzionalità AI. Priorità bassa: da
  implementare dopo le altre funzionalità; caricamento da file escluso per ora (quinto
  giro del prototipo);
- ogni curatore può modificare l'intero ricettario, comprese le ricette degli altri
  curatori; occorre gestire backup e ripristino per recuperare errori imprevisti;
- ripristino di una singola ricetta accessibile ai curatori; ripristino dell'intero
  catalogo da backup riservato agli amministratori dell'app;
- database come fonte di verità del ricettario; YAML per importazione ed esportazione;
- pagina web di istruzioni MCP, con comandi o configurazioni copiabili;
- amministratore dell'app, inizialmente Federico, con possibilità di aggiungerne altri
  e pagina per gestire ruoli, inviti e cancellazione degli utenti;
- ruoli globali di curatore e amministratore separati e cumulabili; l'amministratore
  può assegnarli entrambi, senza ottenere accesso ai contenuti delle altre famiglie;
- l'amministratore di una famiglia può eliminare la famiglia che amministra solo
  dall'app web; questa operazione non cancella gli account dei membri;
- l'ultimo amministratore dell'app non può essere cancellato o retrocesso senza un
  successore. Prima di cancellare l'ultimo amministratore di una famiglia con altri
  membri occorre nominarne un altro; cancellando l'unico membro si elimina la famiglia;
- tutto il codice in inglese; conversazione e documentazione di progetto in italiano;
- prima prototipo nel repository e review con l'utente, poi verifica e adeguamento delle
  scelte funzionali e architetturali, quindi piani e implementazione dell'app.

L'approvazione dei requisiti non equivale all'approvazione di un piano di implementazione.

**Decisione confermata il 4 ottobre 2026:** il linguaggio visivo del riferimento
`design/index.html`, derivato dallo studio di HelloFresh e rivisto dall'utente su
iPhone, è quello definitivo da utilizzare nella progettazione e nello sviluppo del
prototipo. La guida `design/design.md` applica la decisione della sezione 14.

**Decisioni confermate l'8 ottobre 2026, verifica dell'architettura dopo il prototipo:**

- interfaccia in React invece di Svelte: SPA con Vite, TanStack Router e TanStack Query;
  il prototipo Svelte resta il riferimento eseguibile dei percorsi approvati;
- backend scritto come un unico strato di operazioni applicative con un contratto
  esplicito, servito da una funzione Hono su Netlify, da cui derivano l'API dell'app
  web, l'API documentata OpenAPI e gli strumenti MCP; la libreria del contratto è
  ancora da scegliere (sezione 15);
- MCP nella stessa applicazione, autenticato con il server OAuth 2.1 di Supabase Auth;
- niente Edge Function né Deno: un solo runtime Node per app, MCP e job;
- ricetta come documento con un unico schema per bozze, versioni, YAML e MCP;
- ripristino dell'intero ricettario calcolato dallo storico delle versioni, senza
  copie periodiche del catalogo;
- generazione pigra della settimana come rete di sicurezza del job del mercoledì;
- fasi di rilascio da ripensare con la nuova architettura: la tabella della sezione 10
  resta il riferimento precedente, non un piano confermato (sezione 15).

---

## Parte 1: cosa fa l'app (per tutti)

### In una frase

Un'app sul telefono che ogni settimana prepara da sola il menu di pranzi e cene della
famiglia, lo lascia rivedere a tutti per qualche giorno e, quando serve, trasforma i pasti
scelti in una lista della spesa.

### Il problema che risolve

Decidere ogni settimana cosa mangiare è faticoso: bisogna ricordarsi cosa è piaciuto, non
ripetere sempre gli stessi piatti, mangiare in modo vario ed equilibrato, rispettare le
serate in cui c'è poco tempo o qualcuno non c'è, e poi ricavare la spesa. Oggi lo facciamo
parlando con un assistente AI una volta a settimana. L'app toglie questo passaggio: il menu
arriva già pronto, e la famiglia lo aggiusta insieme.

### Chi la usa

- **La Famiglia.** È il gruppo di persone che mangia insieme e condivide il menu. Chi crea
  la Famiglia la amministra e invia agli altri un link d'invito (anche su WhatsApp). Una
  persona può far parte di più Famiglie, per esempio dei nonni o di genitori separati.
  Chi apre il link entra come membro dopo una conferma esplicita; chi è stato rimosso
  da una famiglia può tornare solo con un link nuovo, creato dopo la rimozione.
- **L'amministratore della famiglia** gestisce membri, inviti e impostazioni di quella
  famiglia e può eliminarla dall'app web. Eliminare una famiglia rimuove i suoi dati
  per tutti i membri, ma conserva gli account delle persone e le altre famiglie a cui
  appartengono.
- **Chiunque può iscriversi** e creare la propria Famiglia.
- **Il curatore del ricettario** è un ruolo assegnabile a un utente. Può collegare il
  proprio agente tramite MCP e aggiungere ricette con un percorso guidato. Essere membro
  o amministratore di una famiglia, da solo, non abilita questa funzione.
- **L'amministratore dell'app** gestisce utenti, ruoli e inviti a livello dell'intera
  applicazione. Inizialmente è Federico; il sistema deve permettere di aggiungerne altri.
  È distinto dall'amministratore di una singola famiglia.

### Quando apri l'app

L'app si apre sui **pasti di oggi**, perché è l'uso più comune: sapere cosa si mangia a
pranzo e a cena. Se oggi non c'è niente di pianificato, mostra i prossimi pasti in
programma.

Per ogni pasto si vedono:

- il nome del piatto e la sua descrizione breve;
- le porzioni;
- il voto;
- gli ingredienti, già calcolati per quelle porzioni.

Se la ricetta ha una fonte esterna (una pagina web o un video YouTube), da lì si apre la
ricetta completa, come oggi dal sito e dal QR del PDF. Per le ricette da libro si vedono
titolo del libro e pagine. I pasti liberi mostrano il loro testo ("pizza", "cena fuori").

Da qui si passa al resto della settimana, alla bozza della prossima e alla lista della
spesa.

### Una settimana tipo

**Mercoledì sera** l'app prepara il menu della settimana che comincia il lunedì
dopo: dodici pasti circa, con i pasti liberi già segnati (per esempio "sabato sera fuori",
"domenica pizza").

Da quel momento tutti i membri della Famiglia possono rivederlo e cambiarlo. Non ci sono
finestre o vincoli per settimana: si può intervenire allo stesso modo sulla settimana
appena preparata, su quella in corso e su quelle passate, per esempio per correggere
cosa si è mangiato o rifare la spesa di un menu vecchio. Su qualsiasi pasto si può:

- cambiare il numero di porzioni;
- cambiare un piatto scegliendo tra cinque suggerimenti, chiedendone altri cinque con
  "proponimene altri", o cercando nel ricettario;
- segnarlo come pasto libero;
- scambiarlo con un altro pasto della stessa settimana;
- scrivere una nota;
- dire "non proporre più" per un piatto che non si vuole rivedere, e scegliere subito
  con cosa sostituirlo.

Ogni piatto mostra chi l'ha cambiato per ultimo e quando ("cambiato da Anna, venerdì
21:30"), così si sa sempre a chi chiedere. Subito dopo una modifica la si può annullare.

Un pasto passato conta sempre come mangiato. Se in realtà si è mangiato altro, si
corregge il pasto come qualsiasi altro: si cambia il piatto o lo si segna come libero.
Il mercoledì successivo l'app prepara la
settimana dopo e il ciclo ricomincia.

### Come sceglie i piatti

A comporre il menu sono regole chiare e le preferenze della Famiglia, non l'intelligenza
artificiale. In via sperimentale, e solo se si dimostra utile, un modello AI può fare da
**giudice**: l'app prepara alcune settimane diverse, tutte già valide, e il giudice indica
la più riuscita nel complesso. Il giudice non sceglie i singoli piatti e non può infrangere
le regole.

- **Equilibrio.** Punta a una settimana varia e sana secondo le linee guida italiane per
  una sana alimentazione (CREA): pesce un paio di volte, legumi circa tre volte, carne rossa
  al massimo una, verdure a ogni pasto, pochi fritti.
- **Niente cose troppo simili troppo vicine.** Non solo lo stesso piatto: evita anche due
  pasti di fila con lo stesso ingrediente principale (salmone, ceci, pollo) o lo stesso tipo
  di piatto (due wok, due torte salate), anche a cavallo tra una settimana e l'altra.
- **Gusti.** Preferisce i piatti con più stelline in Famiglia e alterna piatti già
  conosciuti (circa 60%) a piatti nuovi da provare (circa 40%).
- **Regole di casa.** Rispetta gli ingredienti da evitare o da limitare, i piatti "da non
  proporre più", i pasti liberi, i tempi massimi di certe serate e le regole della Famiglia
  (per esempio "venerdì pesce", "niente pasta a cena").

Quando un membro cambia un piatto a mano l'app non blocca e non segnala niente: le regole
servono a comporre il menu e i suggerimenti, non a giudicare le scelte della Famiglia
(deciso il 6 ottobre 2026).

### Le stelline

Il voto è legato al piatto, non a un pasto: ogni membro può dare da una a cinque stelle a
qualsiasi piatto in qualsiasi momento, dalla scheda del piatto o da un pasto del menu, e
può cambiare idea quando vuole. Il voto della Famiglia su un piatto è la media dei voti dei
suoi membri. È quello che l'app usa per scegliere.

Il voto si vede sempre, ovunque compaia un piatto: nel menu, nei suggerimenti, nella ricerca
e nella scheda del piatto. Si vedono la media della Famiglia e il proprio voto. Dal menu e
dalla scheda si vota, o si cambia il proprio voto, direttamente; nei suggerimenti il voto
si legge soltanto.

### La lista della spesa

Gli ingredienti di ogni pasto sono sempre visibili, già calcolati per le porzioni di quel
pasto. Ogni settimana ha **la sua lista della spesa**, che si apre dalla borsa in alto
nel Menu mentre si guarda quella settimana:

1. la lista contiene tutti i pasti della settimana e li segue: se un pasto cambia, le
   voci si aggiornano da sole; somma gli ingredienti uguali, li divide per reparto e
   mette da parte olio, sale, spezie e gli ingredienti che la famiglia evita;
2. le quantità sono quelle che si comprano: pezzi interi (½ peperone → 1), il succo di
   limone in limoni;
3. si spunta ciò che si ha già in casa o che si è comprato, anche in negozio senza rete:
   tutta la famiglia vede le spunte; si possono aggiungere voci libere (detersivo…);
4. si può esportare: PDF, condivisione (WhatsApp, Note…) oppure invio a Bring!.

Non ci sono altre liste né un archivio: le settimane passate tengono la loro lista,
consultabile dal Menu.

### Il ricettario

È unico per tutta l'app. Contiene le ricette da siti web, video YouTube e libri, con
ingredienti verificati sulla fonte. Le ricette di un libro vengono proposte solo alle
famiglie che dichiarano di avere quel libro. Non ci sono ricette private di una famiglia:
un piatto o è nel ricettario, e lo vedono tutti, o non c'è.

Il catalogo aggiornato vive nel database. Un curatore può chiedere al proprio agente di
aggiungere una ricetta: l'agente raccoglie le informazioni e fa le domande necessarie.
La ricetta entra nel catalogo solo quando il servizio verifica che tutti i dati richiesti
sono presenti e validi, compresi i testi in italiano e inglese britannico. Gli ingredienti
non vengono mai dedotti dal nome del piatto. Elenco verificato degli ingredienti,
quantità e unità quando applicabili e porzioni di riferimento sono necessari anche per
pubblicare una ricetta importata dal vecchio progetto. Le indicazioni esplicite come
"q.b." restano ammesse.

Il lavoro incompleto può essere **salvato come bozza** e ripreso in seguito. Le bozze
sono visibili anche in una sezione dell'app dedicata alla curatela e non vengono proposte
nei menu né usate per la spesa finché non sono pubblicate. Sono condivise e modificabili
da tutti i curatori, mostrando autore e ultima modifica. Se due curatori salvano la
stessa bozza, chi arriva secondo viene avvisato e sceglie quale versione tenere: nessuno
sovrascrive il lavoro dell'altro senza saperlo.

Ogni ingrediente di una ricetta è un prodotto del catalogo (Pomodori, Uva) e può avere
una **varietà** scritta liberamente, solo quando cambia cosa si compra («Roma», «gialla
senza semi»); non serve un elenco di varietà preparato in anticipo. La lista della
spesa tiene separate le varietà diverse.

È previsto anche un **percorso manuale nell'app**, da realizzare per ultimo: un curatore
può compilare una ricetta, salvare o modificare una bozza e pubblicarla; se mancano
dati, la pubblicazione non avviene e il modulo mostra cosa correggere. Questo percorso
non usa AI: il sistema controlla i dati inseriti. Il percorso consigliato resta quello
con il proprio agente via MCP. Il caricamento da file non è previsto per ora. La
consultazione delle bozze nell'app resta prevista già nel percorso iniziale di curatela
MCP.

Ogni curatore può modificare **tutto il ricettario**, anche le ricette inserite da altri.
Una modifica nasce come bozza collegata alla ricetta: le famiglie continuano a vedere la
versione pubblicata finché la modifica non è completa e pubblicata. Ogni pubblicazione
crea una nuova **versione**; i pasti già mangiati restano come erano, mentre oggi, i
pasti futuri e la lista della spesa usano subito la versione nuova. Una ricetta che non
serve più si **archivia**: esce dal ricettario e dai suggerimenti, resta leggibile nei
pasti e si può riportare nel ricettario.

Il sistema deve consentire il recupero dagli errori tramite backup e ripristino; il
curatore può aprire una versione precedente di una ricetta e ripristinarla, mentre il
recupero dell'intero catalogo è riservato agli amministratori dell'app (sezione 8).

### Lingua e unità di misura

Ogni persona sceglie la propria lingua: **italiano o inglese britannico**. La scelta
riguarda l'esperienza dell'app, comprese le informazioni del ricettario e della spesa;
il trattamento dei testi liberi della famiglia è da concordare (sezione 12).

Ogni famiglia sceglie il **sistema metrico o quello imperiale britannico**. Le quantità
devono essere convertite di conseguenza nei pasti, nella spesa e nelle esportazioni.
La lingua e le unità sono indipendenti: si può usare l'inglese con misure metriche.

### Usare l'app attraverso il proprio agente

Un utente può collegare un agente compatibile tramite MCP e usare le operazioni
dell'app attraverso di esso: consultazione, modifiche, voti, spesa, impostazioni e
gestione della famiglia. Curatori e amministratori dell'app accedono anche alle
operazioni previste per i loro ruoli. I permessi sono gli stessi dell'accesso web.

**Eccezione confermata:** eliminare una famiglia richiede l'app web. Se lo chiede
all'agente, MCP non esegue l'eliminazione e restituisce un URL per aprire la pagina
appropriata e confermare esplicitamente l'operazione. Aprire il link non cancella nulla.
La stessa regola vale quando cancellare un account comporterebbe l'eliminazione di
una famiglia di cui la persona è l'unico membro.

Il browser può servire per collegare l'account o autenticarsi nuovamente; l'uso quotidiano
deve poter avvenire tramite l'agente. Una pagina dell'app, «Collega un agente» nel
Profilo, dà l'indirizzo del servizio e i passaggi per ciascun client supportato, con
comandi o configurazioni da copiare, ed elenca gli agenti collegati, che si possono
scollegare. Quando un agente chiede l'accesso, il browser mostra chi si collega, con
quale account e cosa potrà fare; l'utente consente o annulla (sesto giro del prototipo).

### Amministrare l'app

Una pagina riservata agli amministratori dell'app permette di gestire **gli utenti e
gli inviti di tutta l'applicazione**: invitare persone, cambiare ruoli e cancellare
utenti. Deve comprendere l'assegnazione del ruolo di curatore e la possibilità di
nominare altri amministratori dell'app. Le stesse operazioni sono disponibili via MCP,
salvo le cancellazioni di account che eliminerebbero anche una famiglia: in quel caso
MCP rimanda alla pagina dell'app, senza eseguire la cancellazione.

Gli amministratori dell'app possono inoltre riportare l'intero ricettario com'era in
un momento passato. Questo recupero riguarda il catalogo, senza ripristinare i dati
privati delle famiglie: le ricette tornano com'erano come nuova versione, quelle nate
dopo quel momento vengono archiviate, e prima di confermare si vede un'anteprima.

Gli inviti all'app e quelli a una famiglia hanno scopi distinti. L'iscrizione resta
aperta: un invito all'app chiama una persona precisa e può darle il ruolo di curatore
o di amministratore quando accetta, ma non la fa entrare in una famiglia. Regole decise
nel sesto giro del prototipo, sezione 7.

### Cosa l'app non fa (per ora)

- Non inventa ingredienti o ricette. Nella generazione automatica del menu l'AI, se
  attiva, fa solo da giudice tra settimane già valide. Questo vincolo non impedisce
  all'agente dell'utente di aiutarlo nelle modifiche manuali o nella cura del ricettario.
- Non permette di aggiungere ricette senza il ruolo di curatore.
- Non carica ricette da file: si aggiungono tramite l'agente o dal modulo dei curatori.
- Non espone uno storico completo delle modifiche ai pasti (si mostra solo l'ultima).
- Non manda notifiche sui menu; restano i messaggi previsti per accesso, inviti e
  segnalazione degli errori del job all'operatore del servizio.

---

## Parte 2: design tecnico

### 1. Architettura

Verificata dopo il prototipo e decisa l'8 ottobre 2026. Il prototipo ha spostato il
baricentro dal client al server: bozze con conflitti, versioni, ripristini,
amministrazione, cancellazioni vincolate, parità MCP e spesa offline richiedono uno
strato applicativo vero, non un client che scrive direttamente nel database protetto
da RLS con poche funzioni di contorno, come previsto nella base del 29 settembre.

**Struttura:**

```
meal_planner_2/
├── prototype/                    prototipo Svelte, riferimento dei percorsi approvati
├── contract/                     contratto delle operazioni: schemi, errori, metadati
├── domain/                       TypeScript puro: pianificatore, unità, spesa,
│                                 validazione, schema del documento ricetta, versioni
├── server/                       Hono: implementazione delle operazioni, MCP, job
├── web/                          React (Vite, TanStack Router e Query), PWA mobile-first
├── supabase/migrations/          schema SQL, funzioni transazionali e policy RLS
├── scripts/                      importazione, esportazione, report del pianificatore
└── progetto/                     spec, piani, regole di progetto
```

**Componenti:**

- **Interfaccia: React come SPA** costruita con Vite, con TanStack Router per le rotte e
  TanStack Query per dati, cache e mutazioni. Installabile come PWA; il service worker
  serve la consultazione offline e la coda della spesa (sezione 6). Non serve il
  rendering lato server: l'app è dietro accesso e le poche pagine pubbliche (inviti)
  leggono operazioni pubbliche. Token e componenti seguono `design/`; il codice del
  prototipo Svelte si riscrive, mentre la logica di dominio TypeScript e i suoi test si
  riusano.
- **Server: una funzione Hono su Netlify** (runtime Node) accanto al sito statico della
  SPA. Espone tutte le rotte server:

  | Rotta | Consumatore | Contenuto |
  |---|---|---|
  | `/api/rpc/*` | App web | Operazioni con tipi condivisi end-to-end |
  | `/api/*` e `openapi.json` | Test, documentazione, eventuali client futuri | Stesse operazioni in forma REST documentata, generata dal contratto |
  | `/mcp` | Agenti | Strumenti MCP generati dal contratto (sezione 13) |
  | `/shopping-lists/<token>` | Bring! | Pagina HTML con JSON-LD resa dal server (sezione 6) |
  | `/internal/jobs/*` | `pg_cron` | Generazione settimanale, protetta da un segreto (sezione 4) |

- **Supabase**: Postgres, Auth (link via email, Google e server OAuth 2.1 per MCP),
  RLS, `pg_cron` e backup della piattaforma. Il repository è già collegato
  all'organizzazione Supabase tramite l'integrazione GitHub: nel M1 si verifica come
  applica le migrazioni (branch di produzione, cartella) e ci si allinea.
- **Un solo runtime.** Il modulo `domain/` gira solo nel server Node: il job
  settimanale non usa più un'Edge Function e non serve la compatibilità con Deno.
- **Il database è la fonte di verità del catalogo.** Le scritture avvengono attraverso
  operazioni autorizzate e validate sul server. Importazioni ed esportazioni YAML non
  costituiscono una seconda copia modificabile da sincronizzare automaticamente.

**Strato delle operazioni.** Ogni funzione dell'app è un'operazione applicativa
(`meals.changeRecipe`, `shopping.toggleItem`, `curation.publish`…), non un accesso
generico alle tabelle. Il prototipo le abbozza in
`prototype/src/lib/operations/`, punto di partenza dell'elenco. Ogni richiesta segue lo
stesso percorso:

```
Hono → verifica del JWT di Supabase → contesto (utente, canale, lingua)
     → permessi: appartenenza alla famiglia o ruolo globale; limiti di frequenza
     → transazione Postgres → dominio puro → registro (meal_changes, canale)
     → vista localizzata
```

- **Permessi su due livelli con compiti distinti.** L'RLS resta la garanzia
  dell'isolamento fra famiglie e del confine dei ruoli globali anche per le query del
  server, che girano con l'identità dell'utente. Le regole dei flussi (ultimo
  amministratore, conflitti, completezza, eccezioni solo web) stanno nelle operazioni.
  Come eseguire le query del server nel ruolo dell'utente con l'accesso tipizzato al
  database (per esempio Drizzle) è da verificare (sezione 15).
- **Transazioni.** Le operazioni che toccano molte righe (pubblicazione, ripristini,
  eliminazione di una famiglia o di un account) sono atomiche, in una transazione o in
  una funzione Postgres.
- **Canale ricavato dal token.** Le sessioni dell'app web non hanno il claim
  `client_id`, i token rilasciati agli agenti dal server OAuth di Supabase sì: è il
  modo verificabile, richiesto dalla sezione 13, per distinguere web e MCP senza fidarsi
  di un parametro dell'agente.
- **Revoca immediata.** Un JWT resta valido fino alla scadenza anche dopo la
  cancellazione di un account (sezione 17): le operazioni verificano a ogni richiesta
  che l'utente esista e che l'accesso dell'agente non sia stato revocato.

**Contratto delle operazioni.** Il contratto è la fonte unica della forma dell'API per
app web, MCP, coda offline e test. Si scrive separato dall'implementazione, con schemi
di validazione condivisi con `domain/`. Regole:

- **Ogni operazione dichiara** input, output, errori possibili con i relativi dati e
  metadati: area, esposizione MCP (`mcp`), riservata al web con URL di rimando
  (`webOnly`), accodabile offline (`offline`), ruolo richiesto. Un test verifica che
  ogni operazione abbia una scelta esplicita di esposizione.
- **Viste già pronte.** Le letture restituiscono testi nella lingua dell'utente,
  quantità scalate e convertite nel sistema della famiglia, voti (media e proprio) e
  ultima modifica: web e MCP mostrano gli stessi contenuti e il client resta sottile.
- **Errori a codici, non testi**: `forbidden`, `not_found`, `invalid` con il percorso
  dei campi, `conflict` con autore, momento e campi cambiati, `last_admin`,
  `last_app_admin`, `sole_member`, `web_only` con l'URL della pagina. Il web li
  traduce; per MCP il server li rende nella lingua dell'utente.
- **Concorrenza dichiarata.** Le bozze portano la revisione di partenza e ricevono
  `conflict` se superata (sezione 8); i pasti seguono l'ultimo salvataggio e la
  risposta indica chi ha cambiato e quando, con l'identificativo della modifica per
  l'annullamento (sezione 5).
- **Idempotenza.** Le creazioni e le operazioni accodabili offline portano un
  identificativo generato dal client: ripetere la stessa richiesta non duplica nulla.
- **Famiglia esplicita.** Le operazioni di famiglia ricevono `familyId`, perché una
  persona può far parte di più famiglie; utente e canale arrivano solo dal token.
- **Modifiche solo additive.** App e server si pubblicano insieme, ma richieste in coda
  offline e agenti possono usare una forma precedente: si aggiungono campi facoltativi
  e operazioni, non si rinominano né si tolgono senza un periodo di compatibilità.

**Lingua del codice:** identificatori, nomi tecnici di file e directory, tabelle,
colonne, enum, API, strumenti MCP, commenti e test in inglese. Le etichette visibili
sono localizzate; il nome visualizzato di una ricetta o di un ingrediente non è un
identificatore tecnico. I nomi inglesi proposti qui saranno confermati nei piani.

**Motivazioni delle scelte:**

- **Supabase** invece di Django o Firebase (28-29 settembre 2026): login, inviti e
  isolamento tra famiglie garantito dal database (RLS); il modello è relazionale.
  Scelta rafforzata l'8 ottobre: il server OAuth 2.1 di Supabase Auth è conforme a MCP
  (registrazione dinamica dei client, pagina di consenso dell'app, revoca) ed evita di
  costruire in casa la parte più rischiosa.
- **React** invece di Svelte (8 ottobre 2026, scelta dell'utente dopo il prototipo):
  ecosistema più ampio e maggiore familiarità degli agenti che scrivono il codice. Il
  costo è la riscrittura delle schermate del prototipo.
- **SPA con server Hono** invece di Next.js o TanStack Start: il rendering lato server
  non serve; le Server Actions di Next.js non si prestano a una coda offline
  ripetibile né a MCP, che richiederebbero comunque rotte separate; le funzioni server
  di TanStack Start sono di nuovo un'API implicita. Un contratto esplicito servito da
  un server indipendente dal frontend si prova da solo e resta portabile fra host.
- **Netlify** invece di Vercel (28-29 settembre 2026): il piano Hobby di Vercel è solo
  per uso personale non commerciale e i suoi cron girano al massimo una volta al giorno
  con un'ora di tolleranza. Il cron sta comunque in Supabase. Le funzioni sincrone di
  Netlify durano fino a 60 secondi, sufficienti per MCP e per la generazione di una
  famiglia (documentazione consultata l'8 ottobre 2026).

### 2. Modello dei dati

Il modello seguente conserva i concetti approvati e usa nomi tecnici inglesi. È stato
rivisto dopo il prototipo (8 ottobre 2026); i dettagli di schema si confermano nei
piani. Il piano M1a precedente non è una migrazione pronta da applicare.

**La ricetta è un documento** (deciso l'8 ottobre 2026). Un unico schema, definito in
`domain/` e usato dal contratto, descrive il contenuto di una ricetta: testi nelle due
lingue, fonte, attributi del pianificatore, porzioni e righe di ingredienti con
varietà, quantità e unità. Lo stesso schema vale per la bozza (documento parziale), la
versione pubblicata (documento completo e immutabile), l'import e l'export YAML, gli
strumenti MCP e il modulo dei curatori; la validazione di bozza e di pubblicazione
(sezione 8) sono due livelli dello stesso schema. Le colonne di `recipes`,
`recipe_translations` e `recipe_ingredients` sono **proiezioni** della versione
corrente, ricalcolate nella stessa transazione della pubblicazione o del ripristino:
servono a cercare, pianificare e fare la spesa, ma la fonte del contenuto resta la
versione.

**Catalogo** (lettura delle ricette pubblicate per gli utenti autenticati; aggiunta e
modifica dell'intero ricettario tramite operazioni autorizzate ai curatori e validate
sul server; bozze escluse dall'accesso ordinario al catalogo):

| Tabella | Campi principali |
|---|---|
| `recipes` | Identità, stato e proiezione della versione corrente: `id`, `slug`, `source_type` (`web`/`youtube`/`book`/`home`), `source_url`, `book_id`, `book_pages`, `duration_minutes`, `base_servings`, `protein_group`, `carbohydrate_group`, `has_vegetables`, `category`, `meal_type` (`lunch`/`dinner`/`both`), `seasons`, `is_heavy`, `tags`, `status` (`draft`/`published`/`archived`), `version`, `archived_at`, `archived_by`, `created_by`, `created_at`, `updated_by`, `updated_at`. Tutte le ricette sono globali; `created_at` serve anche all'ordinamento "aggiunte di recente" del ricettario. `home` indica una ricetta senza fonte esterna |
| `recipe_translations` | Proiezione: `recipe_id`, `locale`, `name`, `description`: stessa ricetta e stessi attributi di classificazione, testi nelle lingue supportate |
| `ingredients` | `id`, `slug`, `department`, `is_pantry`: identità unica dell'ingrediente, indipendente dalla lingua; è il prodotto generico (Pomodori, Uva), senza varietà, taglia o preparazione nel nome. Reparto, dispensa, equivalenze ed evitati valgono per tutte le varietà |
| `ingredient_translations` | `ingredient_id`, `locale`, `name`, `synonyms` |
| `ingredient_versions` | `ingredient_id`, `version`, contenuto completo dell'ingrediente (reparto, dispensa, nomi e sinonimi nelle due lingue), `changed_by`, `changed_at`: storico in sola aggiunta, scritto a ogni creazione o modifica di un ingrediente del catalogo; serve al ripristino a una data (sezione 8) |
| `recipe_ingredients` | Proiezione: `recipe_id`, `ingredient_id`, `variety` (testo libero e facoltativo, tradotto in `recipe_ingredient_translations`: «Roma», «gialla senza semi»; solo quando cambia cosa si compra), `quantity` (numero o null quando la quantità non è numerica), `unit`, `source_text`, `preparation` (tritato, a dadini, succo, scorza…: dettaglio della ricetta che non cambia l'ingrediente da comprare), `is_optional`, `is_primary`; conservazione della quantità e dell'unità della fonte da precisare nel design delle conversioni. Lo stesso ingrediente compare più volte in una ricetta solo con varietà diverse (confronto normalizzato, quinto giro del prototipo) |
| `ingredient_unit_equivalences` | `ingredient_id`, `from_unit`, `to_unit`, `factor`, `scope` (`recipe` o `shopping`), `source`: equivalenze verificate per ingrediente (tazza USA in grammi o pezzi, succo di limone in limoni) |
| `books` | `id`, `title`: titolo bibliografico originale |
| `recipe_drafts` | `id`, `recipe_id`, `kind` (`new`: ricetta mai pubblicata, con `recipes` in stato bozza; `revision`: modifica di una ricetta pubblicata), `base_version`, `content` (documento parziale), `created_by`, `updated_by`, `updated_at`, `revision` (cresce a ogni salvataggio e serve a riconoscere i conflitti). Una sola revisione aperta per ricetta |
| `recipe_draft_saves` | `draft_id`, `revision`, `content`, `saved_by`, `saved_at`, `channel`, `overwritten` (sì se un salvataggio successivo l'ha sovrascritto in un conflitto): cronologia della bozza in sola aggiunta, da cui si recupera una versione sovrascritta (sezione 8) |
| `recipe_versions` | `recipe_id`, `version`, `content` (documento completo pubblicato), `published_by`, `published_at`, `restored_from` (versione ripubblicata) e, per un ripristino dell'intero catalogo, la data ripristinata; storico in sola aggiunta. `recipes.version` indica la versione corrente; i pasti passati usano la versione in vigore quando sono diventati passati (sezione 5, review R1) |
| `recipe_status_changes` | `recipe_id`, `status`, `changed_by`, `changed_at`: storico in sola aggiunta di pubblicazioni, archiviazioni e ritorni nel ricettario. Con `recipe_versions` e `ingredient_versions` permette di ricostruire il catalogo com'era a qualunque istante, senza copie periodiche (deciso l'8 ottobre 2026, sezione 8) |

**Utenti, ruoli globali e amministrazione:**

| Tabella o concetto | Campi principali / responsabilità |
|---|---|
| `profiles` | `user_id`, `display_name`, `locale` (`it-IT`/`en-GB`) |
| `user_roles` | `user_id`, `role`: permessi globali separati e cumulabili, curatore (`recipe_curator`) e amministratore dell'app (`app_admin`) |
| `app_invitations` | Inviti gestiti dall'amministrazione dell'app, distinti da quelli a una famiglia: `email` del destinatario, ruoli globali da assegnare all'accettazione (anche nessuno), autore, creazione, scadenza a 7 giorni, stato (`pending`/`accepted`/`revoked`, scaduto calcolato), chi l'ha accettato e quando (sesto giro) |
| `agent_authorizations` | Agenti autorizzati da un utente tramite MCP: client, data del collegamento, ultimo uso; revoca dall'app (sesto giro). Le autorizzazioni vivono nel server OAuth 2.1 di Supabase Auth (sezione 13); questa tabella serve solo per i dati che Supabase non fornisce, per esempio l'ultimo uso registrato a ogni chiamata MCP (da verificare) |
| Tracciamento del catalogo e dell'amministrazione | Proposta: autore, data, operazione e canale (`web`/`mcp`/`import`), con regole di conservazione da definire |

**Per famiglia** (RLS: si vede e si scrive solo nella propria famiglia):

| Tabella | Campi principali |
|---|---|
| `families` | `name`, `settings` (vedi sotto), `time_zone` (fuso IANA, `Europe/Rome` nei dati demo), `created_at`. Il fuso stabilisce quando un pasto diventa passato (sezione 5) e la versione mostrata dai pasti passati (R1): come si sceglie e se si può cambiare va deciso prima dello schema (sezione 15) |
| `family_members` | `family_id`, `user_id`, `role` (`family_admin`/`member`), `joined_at` |
| `family_invitations` | `token`, `family_id`, `created_by`, `created_at`, `expires_at` (7 giorni), `revoked_at` |
| `family_removals` | `family_id`, `user_id`, `removed_by`, `removed_at`: rimozioni di membri; un invito creato prima di `removed_at` non fa rientrare quella persona (review R2, deciso il 6 ottobre 2026) |
| `family_books` | `family_id`, `book_id`: libri posseduti |
| `recipe_exclusions` | `family_id`, `recipe_id`, `reason`, `created_by`, `created_at`: "non proporre più" |
| `family_ingredients` | `family_id`, `ingredient_id`, `restriction` (`avoid`/`limit`), `weekly_max` |
| `weeks` | `family_id`, `starts_on` (lunedì), `generated_at`. Unica per (`family_id`, `starts_on`) |
| `meal_slots` | `week_id`, `date`, `meal_type`, `recipe_id` o `free_text`, `servings`, `note`, `updated_by` (null = app), `updated_at` |
| `meal_changes` | `meal_slot_id`, `actor_id`, `before` (jsonb), `after` (jsonb), `created_at`: registro append-only |
| `ratings` | `user_id`, `recipe_id`, `stars` (1-5), `updated_at`. Unico per (`user_id`, `recipe_id`); il voto è personale e contribuisce alle medie delle famiglie di cui l'utente fa parte |
| `weekly_jobs` | `family_id`, `target_week`, `status`, `attempts`, `error`, `updated_at` |
| `shopping_lists` | `family_id`, `week_id`, `updated_by`, `updated_at`: la lista della settimana, una per (`family_id`, `week_id`), creata alla prima modifica |
| `shopping_list_checks` | `shopping_list_id`, `ingredient_id`, `variety_key`, `quantity_at_check` (jsonb), `checked_by`, `checked_at`: voce spuntata con la quantità del momento. La voce è identificata da ingrediente e varietà, perché varietà diverse sono voci diverse (sezione 6): `variety_key` è il testo italiano della varietà normalizzato come nel consolidamento, vuoto senza varietà. Se un curatore cambia la grafia in modo che la forma normalizzata cambi, la spunta non corrisponde più a nessuna voce e si perde, come per una voce uscita dalla lista |
| `shopping_list_items` | `shopping_list_id`, `client_id` (generato dal dispositivo, per l'idempotenza offline), `text`, `checked`, `created_by`, `created_at`: voci libere; più gli ingredienti esclusi rimessi in lista (`shopping_list_added_back`, con la stessa chiave di ingrediente e varietà) |
| `temporary_lists` | `token`, `items` (jsonb), `expires_at` (30 minuti), per l'esportazione Bring! |

**Viste:**

- `family_scores`: media delle stelle dei membri attuali per ricetta;
- `global_scores`: media anonima su tutte le famiglie, usata solo per l'avvio a freddo.

**Nessuno stato della settimana, deciso il 6 ottobre 2026.** Le settimane non hanno
fasi (bozza, in corso, da chiudere, chiusa) né chiusura: ogni settimana si consulta e si
modifica allo stesso modo. Ogni pasto passato con una ricetta conta come mangiato,
anche nello storico usato dal pianificatore: non esiste "non cucinato" (tolto il
6 ottobre 2026, dopo il secondo giro del prototipo); un pasto sbagliato si corregge
cambiandolo. Una settimana generata è visibile da `generated_at`.

**Impostazioni della famiglia** (`families.settings`, jsonb validato):

- matrice commensali per giorno e pasto, con porzioni di default;
- slot fissi (`free` con testo, per esempio sabato cena e domenica pranzo);
- limiti di tempo per slot (per esempio lunedì e mercoledì cena al massimo 15 minuti);
- regole di pasto: pasta solo a pranzo; pesce almeno una volta il venerdì; niente pesce
  fresco il lunedì;
- quota note/nuove (default 7/5 ± 1 su 12 pasti);
- intervalli settimanali per gruppo alimentare (sezione 3);
- pesi del punteggio (non mostrati nell'interfaccia);
- sistema di misura (`measurement_system`): `metric` oppure `uk_imperial`.

Nell'app (quarto giro del prototipo) le impostazioni si vedono tutte tranne i pesi del
punteggio: le modificano solo gli amministratori della famiglia, i membri le leggono;
si salvano a ogni modifica e valgono per le generazioni successive e per i
suggerimenti, senza cambiare i menu già fatti. Quota note/nuove e intervalli per
gruppo alimentare stanno in una sezione «Avanzate» chiusa. Le regole di pasto si
scelgono da tre modelli (un gruppo almeno una volta in un giorno, mai un gruppo in un
giorno, un tipo di piatto solo a pranzo), senza regole in testo libero. Una famiglia
nuova parte con tutti i pranzi e le cene pianificati per 2 porzioni, senza pasti
fissi, limiti, regole, ingredienti evitati né libri, e con gli intervalli CREA.

**Preferenze personali** (`profiles`): lingua `it-IT` oppure `en-GB`, indipendente dalla
famiglia e dal suo sistema di misura. Rilevamento iniziale e valori predefiniti da definire
nel percorso di primo accesso.

**Ruoli nella famiglia:**

- `member`: legge la propria famiglia, modifica gli slot, vota, gestisce le esclusioni;
- `family_admin`: in più gestisce inviti, membri e impostazioni di quella famiglia e
  può eliminarla esclusivamente dall'app web; MCP fornisce il collegamento alla pagina
  dedicata. Finché la famiglia resta attiva, l'ultimo amministratore non può uscire
  o perdere il ruolo senza nominarne un altro. Se è
  l'unico membro, può eliminare la famiglia; la cancellazione del suo account la
  elimina insieme ai relativi dati, secondo le regole della sezione 7.

**Ruoli globali:**

- `recipe_curator`: salva e riprende bozze, pubblica ricette complete e modifica l'intero
  ricettario, anche le ricette e le bozze inserite da altri; archivia una ricetta e la
  riporta nel ricettario. Le bozze hanno una sezione nell'app; il percorso guidato è
  disponibile tramite MCP (percorso consigliato) e il percorso manuale web viene
  realizzato nell'ultima fase. Può ripristinare una versione precedente di una
  singola ricetta;
- `app_admin`: gestisce utenti, ruoli e inviti dell'app, inclusa la nomina di altri
  amministratori e la cancellazione degli utenti; può ripristinare l'intero catalogo
  da backup. Inizialmente assegnato a Federico.

**Separazione confermata:** il ruolo di amministratore di famiglia non concede ruoli
globali. `recipe_curator` e `app_admin` sono indipendenti e cumulabili; un amministratore
dell'app può assegnare entrambi. Essere `app_admin` non concede automaticamente i permessi
del curatore né accesso a menu, note e contenuti delle altre famiglie. Per operare sui
contenuti di una famiglia occorre esserne membro, con i relativi permessi. La gestione
globale degli account e degli inviti deve rispettare questo confine.

In qualunque canale le operazioni verificano i permessi sul server, non soltanto la
visibilità dei comandi nell'interfaccia. I controlli di accesso ai dati familiari devono
valere anche per le operazioni eseguite da amministratori dell'app.

### 3. Pianificatore

**Ingresso:**

- impostazioni della famiglia;
- catalogo visibile alla famiglia: ricette non archiviate, escluse quelle da libri che la
  famiglia non possiede;
- esclusioni e ingredienti da evitare o limitare;
- punteggi;
- storico degli slot delle settimane precedenti e della settimana in corso;
- stagione.

**Vincoli rigidi** (filtrano, mai violati dalla generazione):

- limiti dello slot: tempo, pasto adatto, niente pesce fresco il lunedì, niente pasta a cena;
- esclusioni, ricette archiviate, libri non posseduti;
- ingrediente con restrizione `avoid` come ingrediente non opzionale;
- stessa ricetta usata nelle ultime 2 settimane;
- punteggio famiglia ≤ 2 stelle, salvo mancanza di alternative.

**Punteggio** (vincoli morbidi):

- **gradimento**: punteggio della famiglia, oppure quello globale nell'avvio a freddo;
- **tempo dall'ultima volta** che la famiglia l'ha cucinata;
- **stagione**;
- **equilibrio**: distanza dagli intervalli settimanali per gruppo alimentare;
- **somiglianza**: penalità per pasti vicini che condividono proteina principale,
  carboidrato principale, ingrediente principale o categoria. Il peso decresce con la
  distanza in pasti. La finestra è mobile e attraversa le settimane;
- **quota note/nuove**: "nota" vuol dire cucinata da questa famiglia almeno una volta. La
  quota si applica da quando la famiglia ha almeno 10 ricette cucinate;
- **ingredienti con restrizione `limit`**: penalità, e al massimo `weekly_max` volte.

**Intervalli di default per gruppo alimentare** sui pasti pianificati della settimana.
Sono derivati dalle frequenze CREA 2018 per l'adulto, pensate per 14 pasti, e adattati ai
circa 12 pasti pianificati. Sono impostazioni modificabili.

| Gruppo | Frequenza CREA | Default dell'app |
|---|---|---|
| Pesce | 2 volte a settimana | 2-3 |
| Legumi | 3 volte a settimana | 2-4 |
| Carne bianca | 2 volte a settimana | 1-3 |
| Carne rossa | 1 volta a settimana | massimo 1 |
| Salumi | 1 volta a settimana (occasionale) | massimo 1 |
| Uova | 3 volte a settimana | 1-2 come proteina principale (le uova compaiono anche in altre ricette) |
| Formaggi | 3 volte a settimana | massimo 2 come proteina principale |
| Patate | 2 volte a settimana | massimo 2 come carboidrato principale |
| Verdure | 2 porzioni e mezza al giorno | bonus per le verdure a ogni pasto |
| Fritti o piatti pesanti | non indicata | massimo 1 |

Fonte: CREA, "Le giuste porzioni e le frequenze di consumo consigliate"
(sapermangiare.an.crea.gov.it/493/le-giuste-porzioni.html), consultata il 29 settembre
2026.

**Algoritmo:**

1. prepara gli slot dalla matrice, con porzioni e slot fissi;
2. ordina gli slot da riempire dal più vincolato (cene veloci, venerdì pesce);
3. per ogni slot calcola il punteggio dei candidati nel contesto della settimana e ne sceglie
   uno a caso tra i migliori 3-5, pesando la scelta sul punteggio;
4. controlla le regole di settimana (venerdì pesce, quota, intervalli) e le ripara con
   scambi locali;
5. se uno slot non ha candidati validi resta vuoto, segnato "nessuna ricetta adatta".

Il seme casuale è derivato da famiglia e settimana: a parità di ingresso la settimana è la
stessa, e quindi testabile. Il perché di una scelta non viene salvato né mostrato: non è un
requisito.

**Riuso durante la revisione:**

- **suggerimenti**: lo stesso punteggio con gli altri slot fissati, i migliori 5; come
  nella generazione, rispettano tempi massimi, regole di pasto, ingredienti evitati e
  massimi settimanali della famiglia (la ricerca nel ricettario resta libera);
- **"proponimene altri"**: i 5 candidati successivi nella stessa classifica; finita la
  classifica si ricomincia dai primi. Non sostituisce il piatto: si sceglie tra i nuovi.

Non ci sono avvisi di settimana sulle modifiche a mano (deciso il 6 ottobre 2026).

**Giudice AI (opzionale, sperimentale).** È l'unico ruolo dell'AI nella pianificazione.

- **Cosa fa.** Il pianificatore genera da 3 a 5 settimane candidate con semi diversi, tutte
  conformi ai vincoli rigidi. Il giudice le riceve e restituisce un punteggio per ciascuna.
  Si tiene la migliore. Serve a cogliere ciò che le regole, un criterio alla volta, non
  vedono: per esempio tre piatti pesanti di fila anche dentro gli intervalli, o una
  settimana monotona per colori, consistenze e tipi di piatto.
- **Cosa non fa.** Non propone né sostituisce piatti, non tocca singoli slot, non
  interviene su suggerimenti e "proponimene altri" (restano solo a regole). Non
  può rendere valida una settimana che viola un vincolo: vede solo candidate già valide.
- **Dati inviati.** Solo dati anonimi della settimana: per ogni pasto giorno, pasto, nome
  del piatto, gruppi alimentari, categoria, tempo e porzioni; più il riassunto delle ultime
  2 settimane per la somiglianza. Niente nome della famiglia, membri, note, né quali pasti
  sono liberi.
- **Ricaduta.** Se il giudice è spento, non risponde entro il timeout (per esempio 10
  secondi), fallisce o restituisce qualcosa di non valido, si tiene la candidata con il
  punteggio a regole più alto. La bozza non dipende mai dal giudice.
- **Fornitore intercambiabile.** Un'interfaccia `Judge` (candidate → punteggi) con
  un'implementazione per fornitore, scelta da configurazione. I candidati da provare sono
  Jev (jevmodel.org, API di scoring a $0,042 per milione di token in ingresso, pubblica dal
  21 settembre 2026, multilingue in beta) e un modello piccolo ospitato come Claude Haiku
  4.5. Modelli locali esclusi: le funzioni serverless non li possono eseguire e un
  server dedicato va contro l'impostazione a gestione minima.
- **Attivazione.** C'è un interruttore globale, spento di default, più uno per famiglia per
  il test alla cieca. Si accende in produzione solo se la valutazione (sezione 9) mostra un
  vantaggio chiaro.

### 4. Job settimanale

- `pg_cron` in Supabase lavora in UTC. Il job è pianificato ogni ora il mercoledì tra le
  17:00 e le 22:00 UTC e chiama con `pg_net` la rotta `/internal/jobs/weekly` del
  server, protetta da un segreto condiviso (rivisto l'8 ottobre 2026: niente Edge
  Function). Il codice considera solo le famiglie per cui sono passate le 20:00 nel
  loro fuso (`families.time_zone`), così l'ora legale non richiede di cambiare il cron.
- **Dispatcher**: crea in modo idempotente una riga in `weekly_jobs` per ogni famiglia
  e per il lunedì successivo.
- **Worker**: elabora le famiglie **una alla volta**, ciascuna in una chiamata separata
  alla funzione del server (al massimo 60 secondi su Netlify), così un errore o un
  rallentamento riguarda solo quella famiglia. Per ogni famiglia genera la settimana
  successiva in un'unica transazione, se non esiste già: l'unicità di (`family_id`,
  `starts_on`) impedisce doppioni anche con esecuzioni concorrenti. Con il giudice
  attivo genera le candidate e chiama il giudice fuori dalla transazione. Il carico
  reale del pianificatore va misurato (sezione 17). Non c'è chiusura della settimana
  precedente (decisione del 6 ottobre 2026, sezione 2).
- **Generazione pigra** (decisa l'8 ottobre 2026): se la famiglia apre l'app o un
  agente legge il menu dopo l'orario del job e la settimana successiva non esiste, il
  server la genera in quella richiesta, senza giudice, con lo stesso vincolo di
  unicità. Il job resta il percorso normale e questa è la rete di sicurezza: chi apre
  l'app dopo un fallimento del job attende circa un secondo in più e trova il menu.
  Senza realtime, chi ha già l'app aperta vede la settimana nuova alla riapertura o
  aggiornando.
- **Errori**: un errore riguarda solo la sua famiglia. Si ritenta all'esecuzione successiva
  fino all'ultima finestra utile. Alla fine arriva un'email al referente operativo del
  servizio con le famiglie ancora senza bozza. Questo destinatario va configurato
  esplicitamente: assegnare il nuovo ruolo di curatore non abilita a ricevere segnalazioni
  sulle altre famiglie. Contenuti e accessi operativi devono rispettare la separazione
  dei ruoli della sezione 2.
- **Generazione su richiesta** (wizard della famiglia nuova, oppure "rigenera" se la bozza
  manca): stessa funzione, al massimo 3 volte a settimana per famiglia.
- **Prima generazione di una famiglia nuova** (deciso il 6 ottobre 2026): riempie i
  pasti non ancora passati da oggi a domenica; se è già passato mercoledì alle 20:00
  genera anche la settimana successiva, come avrebbe fatto il job.

### 5. Revisione e modifiche

- **Vista di apertura**: dopo il login e a ogni apertura l'app mostra i pasti di oggi della
  famiglia corrente. Se oggi non ci sono slot con contenuto, mostra il primo giorno futuro
  che ne ha. Se non c'è nessuna settimana (famiglia nuova), porta alla generazione della
  prima settimana.
- **Contenuto di un pasto**, in ogni vista che lo mostra: nome e descrizione breve della
  ricetta, porzioni,
  voto (sotto), ingredienti scalati. Se la ricetta è `web` o `youtube` c'è il collegamento
  al `source_url` della fonte, che si apre fuori dall'app senza passare il referrer
  (come fa oggi il sito del progetto di origine con `Referrer-Policy: no-referrer`).
  Per `book` si mostrano titolo e pagine; per `home` nessun collegamento. Per gli slot
  liberi, il testo.
- **Versione della ricetta nei pasti (review R1, deciso nel quinto giro del prototipo):**
  un pasto passato mostra la ricetta nella versione in vigore quando è diventato passato,
  anche nella scheda ricetta aperta da quel pasto e nella lista della sua settimana;
  oggi e i pasti futuri usano la versione corrente, quindi una correzione del curatore
  arriva subito anche alla spesa (una voce già spuntata che aumenta torna da spuntare).
  Lo slot conserva solo `recipe_id`: la versione si ricava da `recipe_versions` e
  dall'istante in cui il pasto è passato. Solo i curatori vedono nella scheda l'avviso
  che la ricetta è stata aggiornata dopo, con il collegamento alla versione attuale.
- **Ricette archiviate:** restano leggibili e votabili dai pasti che le usano, anche
  futuri, finché la famiglia non li cambia; non compaiono in ricerca, suggerimenti e
  nuove generazioni.

- **Cosa è modificabile, deciso il 6 ottobre 2026:** tutto, in ogni settimana visibile,
  passata, in corso o futura. Nessuna azione dipende dalla settimana.
  - **Istante in cui un pasto diventa passato, confermato il 6 ottobre 2026:** il
    pranzo alle 15:30 e la cena alle 23:00, nell'ora locale della famiglia
    (Europe/Rome nei dati demo). Serve solo a stabilire da quando un pasto conta come
    mangiato nello storico; non blocca modifiche. Fuso orario
    della famiglia ed eventuale personalizzazione degli orari da valutare nel percorso
    Famiglia e account.
- **Navigazione fra i giorni:** sopra il selettore dei sette giorni il mese e un'icona
  aprono un calendario per scegliere qualunque giorno che abbia un menu, anche passato; i giorni
  senza menu non sono selezionabili.
- **Azioni sullo slot**, confermate nel secondo giro del prototipo (6 ottobre 2026):
  cambia porzioni; cambia ricetta (cinque suggerimenti, "proponimene altri", ricerca con
  filtri), che raccoglie anche segna libero con testo, non proporre più e scambia con un
  altro slot della stessa settimana; nota; vota. Valgono per pasti passati, in corso e futuri e per slot
  liberi e vuoti.
  - **Scambio:** si spostano ricetta o testo libero e nota; le porzioni restano allo slot,
    perché dipendono da chi c'è quel giorno.
  - **Non proporre più:** aggiunge l'esclusione per la famiglia e apre subito la scelta
    del sostituto; i pasti già pianificati con quella ricetta non cambiano. L'elenco delle
    esclusioni si gestisce nel percorso Famiglia e account.
  - **Nota:** testo libero fino a 200 caratteri, visibile a tutta la famiglia.
  - **Annulla:** dopo ogni modifica, per alcuni secondi, si può annullare. Ripristina solo
    le proprie modifiche e solo se lo slot non è cambiato di nuovo; l'annullamento è a
    sua volta una modifica registrata.
- **Voto**: è sulla ricetta (`ratings`: utente × ricetta), non sullo slot. È sempre possibile,
  dallo slot di qualsiasi settimana o dalla scheda della ricetta nel catalogo, e non dipende
  dallo stato della settimana.
- **Voto sempre visibile**: ogni volta che l'interfaccia mostra una ricetta (slot,
  suggerimenti, risultati di ricerca, scheda della ricetta) mostra anche le stelline
  con:
  - la media della famiglia e il numero di voti (per esempio "4,3 · 3 voti"), oppure
    "nessun voto";
  - il voto dell'utente corrente, distinto dalla media, oppure "non hai votato".

  Dal voto mostrato si vota o si cambia il proprio voto direttamente, senza passare da
  un'altra schermata (da 1 a 5, più "togli il mio voto"); fanno eccezione i suggerimenti,
  dove il voto è solo visualizzato (deciso il 6 ottobre 2026). Il salvataggio aggiorna subito
  media e proprio voto in quella vista. È un unico componente riusato in tutte le viste; la
  sua forma si decide nel design delle superfici.
- **Tracciabilità**: ogni scrittura aggiorna `updated_by` e `updated_at` e aggiunge
  una riga a `meal_changes`, anche quando arriva da MCP. L'interfaccia mostra solo
  l'ultima modifica, con persona e momento; il canale (web o MCP) resta nel registro e
  non si mostra (deciso il 6 ottobre 2026).
- **Concorrenza, decisa il 6 ottobre 2026:** vince l'ultimo salvataggio, senza avviso di
  conflitto; il registro `meal_changes` conserva tutte le modifiche e l'ultima modifica
  mostrata dice chi ha cambiato il pasto. Niente realtime in v1: aggiornamento
  all'apertura e a richiesta dell'utente.
- **Offline**: l'ultima settimana caricata resta consultabile in sola lettura, tranne
  la lista della spesa (sezione 6), modificabile anche offline.

### 6. Scalatura e lista della spesa

- **Scalatura**: quantità × porzioni dello slot ÷ `base_servings`.
- **Sistema scelto dalla famiglia**: metrico oppure imperiale britannico, anche nei
  risultati MCP. La lingua dell'utente non cambia il sistema di misura.
- **Conversioni**: masse tra g/kg e once/libbre; volumi tra ml/l e misure imperiali
  britanniche. Le unità britanniche devono essere identificate senza confonderle con
  quelle statunitensi. L'elenco esatto, i fattori e gli arrotondamenti saranno verificati
  su fonti di riferimento e confermati nel design delle conversioni.
- **Proposta per i calcoli**: conservare i valori della fonte e usare una rappresentazione
  comune per scalare e sommare quantità compatibili. Convertire e arrotondare solo per
  la presentazione, dopo il consolidamento della spesa. Cambiare la preferenza non
  modifica i dati della ricetta e non introduce conversioni ripetute sui valori salvati.
- **Dimensioni diverse**: non convertire massa in volume senza un'equivalenza verificata
  per quello specifico ingrediente. Conteggi, unità domestiche ambigue e quantità non
  numeriche mantengono il loro significato; la traduzione dell'etichetta non basta a
  stabilire una conversione. Il trattamento di cucchiai, cucchiaini, bicchieri e
  confezioni sarà esplicitato nel design prima dell'importazione.
- **Arrotondamenti metrici della base approvata**, da verificare nel prototipo insieme
  alla nuova pipeline di calcolo: grammi alla decina (a 5 g sotto i 50 g), ml come i
  grammi, pezzi e spicchi al mezzo superiore, cucchiai e cucchiaini al mezzo. La regola
  si applica alla presentazione, non ai valori intermedi da sommare.
- **Codici delle unità**: in inglese o simboli standard; etichette localizzate. Il
  vecchio elenco italiano e quello esteso del piano M1a vanno sostituiti con un elenco
  unico validato, comprendente le unità effettivamente usate dalle fonti.
- **Lista della settimana** (terzo giro del prototipo, 6 ottobre 2026): una lista per
  settimana con tutti i pasti della settimana, senza scelta dei pasti, senza altre liste
  e senza archivio; si apre dalla borsa nella barra del Menu sulla settimana mostrata;
  le settimane passate tengono la loro lista. Le quantità non si salvano: si ricalcolano
  dai pasti, quindi seguono ogni modifica.
- **Generazione delle voci**:
  1. si parte da tutti gli slot della settimana con ricetta (pasti liberi, vuoti e
     ricette senza ingredienti esclusi, questi ultimi segnalati);
  2. si scalano gli ingredienti;
  3. si consolida per ingrediente e varietà: righe che differiscono solo per
     preparazione, taglia o forma della parola sono lo stesso ingrediente; prodotti
     diversi restano voci diverse (mandorle in scaglie, pomodorini perini). Righe con lo
     stesso ingrediente e varietà diverse sono voci separate («Pomodori Roma», «Pomodori»);
     grafie della stessa varietà si sommano (confronto che ignora maiuscole, accenti,
     punteggiatura e parole come «tipo») e la voce mostra la grafia più usata. Gli
     evitati della famiglia valgono per tutte le varietà. Le unità compatibili si
     sommano in una rappresentazione comune; le incompatibili restano sulla stessa
     voce ("50 g + 100 ml");
  4. si convertono nelle unità di acquisto le righe con un'equivalenza di ambito
     `shopping` (succo di limone in grammi → limoni, 47 g di succo a limone secondo
     USDA FoodData Central);
  5. si escludono gli ingredienti con `is_pantry` e quelli con restrizione `avoid`
     della famiglia, mostrati in "Non in lista", da cui si possono rimettere;
  6. si segnano gli opzionali;
  7. si raggruppa per reparto nell'ordine standard (frutta e verdura, macelleria,
     pescheria, banco frigo e latticini, pane, pasta riso e cereali, scatolame e
     conserve, surgelati, condimenti e dispensa, altro);
  8. si presentano le quantità nel sistema della famiglia e i testi nella lingua di chi
     guarda; i pezzi si arrotondano per eccesso all'intero, ignorando un avanzo di 0,1
     dovuto alle conversioni (½ peperone → 1, 2,06 limoni → 2). Ricetta, scheda del
     pasto e provenienza delle voci restano nelle unità della ricetta.
- **Tazze USA delle fonti americane**: si convertono solo con un'equivalenza verificata
  per l'ingrediente, conservando il testo della fonte: il conteggio dato dalla fonte se
  c'è ("½ cup (circa ½ cipolla media)" → ½ cipolla), grammi da fonti verificate per i
  solidi (cheddar grattugiato 113 g, lattuga sminuzzata 72 g), millilitri per liquidi e
  salse (236,6 ml). Senza equivalenza la ricetta resta in bozza.
- **Spunte condivise**: tutti i membri vedono e modificano la lista; per singola voce
  vince l'ultimo salvataggio; si ricorda chi ha cambiato la lista per ultimo. Una voce
  spuntata la cui quantità poi aumenta torna da spuntare e mostra la quantità spuntata
  ("prima: 200 g"); se diminuisce resta spuntata. Voci libere nella sezione "Altro",
  aggiunte dall'ultima riga della sezione.
- **Offline**: la lista è l'unica parte dell'app modificabile offline (spunte, voci
  libere, ingredienti rimessi): le modifiche restano sul dispositivo in una coda locale
  e si inviano al ritorno della rete, con la regola dell'ultimo salvataggio per voce;
  l'interfaccia segnala le modifiche da sincronizzare. Ogni modifica in coda porta un
  identificativo generato dal dispositivo, così un invio ripetuto non la applica due
  volte (sezione 1, contratto delle operazioni). Bring! richiede la rete.
- **Esportazioni** (dal menu "…" della lista; escludono le voci spuntate e includono le
  voci libere):
  - PDF di una pagina;
  - Web Share API, con testo semplice;
  - Bring!: si salva in `temporary_lists` con un token casuale e si apre
    `https://api.getbring.com/rest/bringrecipes/deeplink?url=<app>/shopping-lists/<token>&source=web`.
    La pagina `/shopping-lists/<token>` è pubblica e `noindex`, e contiene solo il JSON-LD
    `schema.org/Recipe` con `recipeIngredient` nel formato "quantità nome", senza nome della
    famiglia né giorni. Scade dopo 30 minuti; un cron la pulisce. È lo stesso meccanismo
    di `scripts/sito_lib.py` nel progetto di origine.

  Tramite MCP si devono ottenere gli stessi contenuti esportabili: PDF, testo e
  collegamento Bring!. La consegna di file e collegamenti dipende dalle capacità del
  client e verrà provata nel design MCP; il requisito non implica poter comandare
  direttamente l'interfaccia di condivisione del dispositivo da qualunque agente.

### 7. Account, Famiglia, inviti

- **Supabase Auth**: magic link via email e Google. Iscrizione aperta.
- **SMTP personalizzato** (per esempio Resend): il servizio email di default di Supabase
  manda al massimo 2 email all'ora ed è solo per le prove. Con un SMTP personalizzato il
  limite parte da 30 all'ora ed è configurabile.
- **Inviti alla famiglia**:
  - link `/invite/<token>`, valido 7 giorni, riusabile fino alla scadenza, revocabile;
    gli amministratori lo creano, lo condividono e lo revocano dalla pagina dei membri,
    dove vedono i link attivi con autore e scadenza; i membri vedono a chi chiederlo;
  - la pagina dell'invito si legge anche senza accesso (famiglia e chi invita); chi lo
    apre si iscrive se non ha un account ed entra nella famiglia con una conferma
    esplicita; se ne fa già parte, non cambia niente;
  - token scaduto o revocato: messaggio chiaro con l'invito a chiedere un link nuovo
    all'amministratore della famiglia;
  - **rientro dopo la rimozione** (review R2, deciso il 6 ottobre 2026): un membro
    rimosso non rientra con un link creato prima della rimozione, anche se ancora
    valido; gli stessi link restano validi per gli altri. Vede lo stesso messaggio di
    un link non più valido. L'uscita volontaria non blocca i link.
- **Inviti all'app** (decisi nel sesto giro del prototipo): gestibili dagli
  amministratori dell'app nella pagina di amministrazione e tramite MCP. Un invito è
  per un'email e indica, se si vuole, i ruoli globali da assegnare all'accettazione
  (curatore, amministratore dell'app); non fa entrare in nessuna famiglia. Il link vale
  7 giorni, si usa una sola volta e solo con quell'email, si può revocare; un nuovo
  invito alla stessa email sostituisce quello in attesa. A un'email che ha già un
  account non si crea un invito: i ruoli si cambiano dall'elenco degli utenti. La
  pagina `/invite/app/<token>` si legge senza accesso (chi invita, ruoli); chi non ha
  un account si iscrive e torna all'invito; con un altro account la pagina propone di
  uscire e rientrare. Nel prototipo il link si copia e si manda, senza email
  dall'app. L'iscrizione aperta della specifica di base resta prevista.
- **Amministrazione globale**: pagina riservata agli `app_admin` per consultare e gestire
  utenti e inviti, cambiare i ruoli degli utenti, assegnare il ruolo di curatore,
  nominare altri amministratori e cancellare utenti. Le operazioni devono essere
  disponibili anche via MCP. Forma decisa nel sesto giro del prototipo: dal Profilo,
  pagina `/admin` con le sezioni Utenti (ricerca per nome o email, ruoli come
  etichette), Inviti all'app e Ripristino del ricettario (dall'8 ottobre 2026 si
  sceglie giorno e ora invece di una copia, con l'elenco dei ripristini fatti da cui
  annullarli; sezione 8). Il dettaglio di un utente ha gli
  interruttori dei due ruoli: la nomina di un amministratore e la rinuncia al proprio
  ruolo chiedono conferma, l'interruttore dell'ultimo amministratore è bloccato con il
  motivo. Le famiglie di un utente si vedono solo per nome e ruolo, senza contenuti.
  La cancellazione di un utente usa la stessa pagina e le stesse regole della
  cancellazione dell'account, in terza persona; il proprio account si cancella solo
  dalle proprie preferenze. La nomina iniziale di Federico sarà prevista nella
  configurazione iniziale, con identità verificata; i dettagli si definiscono nel piano.
- **Recupero del ricettario**: il ripristino completo a una data è riservato agli
  amministratori dell'app. Il percorso dedicato deve essere rappresentato nel prototipo;
  i curatori hanno invece il ripristino della singola ricetta.
- **Primo accesso** (quarto giro del prototipo): email con link di accesso o Google; a
  un'email nuova si chiede solo il nome. Lingua iniziale dal browser (italiano →
  `it-IT`, altrimenti `en-GB`), modificabile già nella pagina di accesso. Senza
  famiglie l'utente sceglie "Crea la tua famiglia" o apre il link d'invito ricevuto.
- **Wizard della famiglia nuova** (minimo, deciso il 6 ottobre 2026): nome e sistema di
  misura, poi "Genera la prima settimana". Commensali, pasti fissi, ingredienti, libri
  e obiettivi partono dai default (sezione 2) e si sistemano dalle impostazioni; dopo
  la prima generazione il Menu mostra una sola volta, agli amministratori, una scheda
  richiudibile con "Invita la famiglia" e "Sistema le impostazioni".
- **Vista Profilo**: quarta voce della navbar, con famiglia corrente (membri e inviti,
  impostazioni, "non proporre più"), elenco delle proprie famiglie (un tocco cambia la
  famiglia mostrata) e "Crea un'altra famiglia", account e preferenze.
- **Rimozione di un membro**: la decide un amministratore con una conferma che ne
  spiega gli effetti; i suoi voti escono dalla media; le tracce diventano "ex membro".
- **Uscita dalla famiglia**: libera per i membri; l'ultimo amministratore con altri
  membri nomina il successore nello stesso passaggio; l'unico membro deve eliminare la
  famiglia.
- **Preferenze personali**: nome e lingua, modificabili dall'utente nelle proprie
  impostazioni e tramite MCP, indipendentemente dalle impostazioni della famiglia.
  Da qui si esce dall'account e si apre la cancellazione.
- **Cancellazione dell'account, regole confermate**: possibile da parte dell'utente
  stesso e degli amministratori dell'app. Rimuove dati personali e voti e revoca gli
  accessi dell'utente, compresi quelli MCP. Le ricette pubblicate restano nel catalogo.
  Per ciascuna famiglia in cui l'utente è l'ultimo amministratore e ci sono altri
  membri, occorre nominare un successore prima di cancellare l'account. Se è l'unico
  membro, la cancellazione elimina anche quella famiglia e i suoi dati. Una condizione
  non soddisfatta impedisce di completare la cancellazione; la procedura tecnica deve
  evitare cancellazioni parziali. Il trattamento delle attribuzioni, degli inviti
  ancora aperti e delle bozze condivise si completa nel design, senza cancellare
  implicitamente i contributi pubblicati dell'utente.
  Se la cancellazione comporta l'eliminazione di almeno una famiglia, una richiesta
  MCP restituisce soltanto il collegamento alla pagina appropriata dell'app e non
  effettua cancellazioni parziali o complete. La restrizione vale sia per l'utente
  che cancella il proprio account sia per l'amministratore che cancella un altro utente.
- **Ultimo amministratore dell'app, regola confermata**: non può essere cancellato o
  perdere il ruolo `app_admin` finché non viene nominato un successore. Il vincolo vale
  anche per la cancellazione del proprio account e per le operazioni via MCP.
- **Eliminazione della famiglia, permesso confermato**: un `family_admin` può eliminare
  la famiglia che amministra, anche se ha altri membri, **solo dall'app web**. Rimuove
  la famiglia e i suoi dati, compresi menu, note, impostazioni, appartenenze e inviti familiari; interrompe
  i relativi job e impedisce ulteriori accessi a quella famiglia da web e MCP.
  Gli account dei membri, i loro voti personali, le altre famiglie, il ricettario e i
  ruoli globali restano invariati. L'azione non richiede di nominare un successore,
  perché la famiglia cessa di esistere. Un semplice membro non può eseguirla; il solo
  ruolo di amministratore dell'app non conferisce questo permesso su qualunque famiglia.
  Resta distinta la cancellazione automatica di una famiglia rimasta senza membri
  quando si elimina il suo unico utente, descritta sopra.
  L'utente apre la pagina dedicata e conferma esplicitamente l'operazione. La pagina
  identifica la famiglia e chiarisce la rimozione dei dati per tutti i suoi membri.
  MCP restituisce un esito che richiede un'azione nell'app con il relativo URL, senza
  eseguire l'eliminazione. Il link è soltanto una navigazione: non contiene un comando
  che cancelli dati all'apertura. La pagina richiede l'accesso e verifica nuovamente
  i permessi al momento della conferma. Forma decisa nel quarto giro del prototipo:
  pagina `/profile/family/delete?family=<id>`, raggiungibile dalle impostazioni, con
  nome della famiglia, membri coinvolti, dati cancellati e dati che restano, e un
  pulsante di conferma dopo il riepilogo; un membro vede che solo un amministratore
  può eliminarla.
- **Pagina di cancellazione dell'account** (quarto giro del prototipo): elenca,
  famiglia per famiglia, se continua senza l'utente, se serve scegliere un successore
  (scelta sulla pagina stessa) o se viene eliminata; spiega cosa si cancella (nome,
  email, voti, accessi anche MCP, link d'invito creati ancora attivi) e cosa resta
  (ricette pubblicate, modifiche ai menu come "ex membro"). Il pulsante resta
  disattivato finché manca un successore o l'utente è l'ultimo amministratore
  dell'app.
- **Privacy**: informativa, dati minimi (email, nome visualizzato, dati della famiglia).
- **Limiti di frequenza**: iscrizioni (rate limit di Supabase Auth) e generazioni su
  richiesta.

### 8. Ricettario: database, curatori, validazione e scambio dati

**Fonte di verità confermata:** il catalogo autorevole è nel database Supabase. Le
ricette nuove si salvano mediante operazioni applicative autorizzate, senza dover aprire
una pull request. Lo schema, i validatori e le migrazioni restano codice versionato in
Git. Un merge di codice non sostituisce il catalogo e non archivia ricette sulla base
della loro assenza da un file YAML.

**Aggiunta guidata tramite MCP:**

1. Il curatore collega il proprio agente e indica la ricetta e la sua fonte, oppure
   fornisce direttamente le informazioni per una ricetta di casa.
2. Il servizio espone i dati richiesti e i vincoli; l'agente raccoglie le informazioni e
   chiede quelle mancanti. La guida non deve dipendere dalla memoria di un singolo agente:
   il servizio fornisce istruzioni scritte, a partire da quelle sugli ingredienti decise
   nel quinto giro del prototipo (sotto, "Ingredienti e varietà").
3. La validazione sul server restituisce campi mancanti e incoerenze in forma strutturata,
   così l'agente può proseguire con domande mirate.
   Le informazioni parziali possono essere salvate in una bozza persistente e recuperate
   in una sessione successiva; restano escluse dal catalogo pubblicato.
4. Proposta di interazione: prima del salvataggio l'agente presenta la scheda completa
   al curatore per la conferma, comprese le traduzioni predisposte.
5. Il server verifica nuovamente ruolo, completezza e validità al momento della
   pubblicazione e salva la ricetta con i suoi ingredienti e riferimenti in modo atomico.
   Un errore non deve lasciare una ricetta parzialmente inserita nel catalogo.

**Bozze persistenti confermate:** una bozza ammette informazioni incomplete e sopravvive
alla conversazione con l'agente. È consultabile nella sezione di curatela dell'app e
recuperabile tramite MCP. Dal 6 ottobre 2026 la sezione di curatela per la
consultazione è in testa al ricettario: una sezione "Bozze" collassabile, visibile
solo ai curatori, con una scheda per bozza (Nuova o Modifica, nome, chi l'ha salvata e
quando, dati che mancano per pubblicare); le ricette archiviate sono in fondo al
ricettario, in una sezione chiusa (quinto giro). Un pasto passato che usa una
ricetta in bozza mostra nome e descrizione; la scheda si apre solo ai curatori e il
voto non è disponibile finché la ricetta non è pubblicata. Tutti i curatori possono consultare e modificare le bozze
degli altri; autore e ultima modifica sono visibili. Salvare una bozza non pubblica
una ricetta: la completezza resta vincolante per l'ingresso nel catalogo utilizzato
dalle famiglie.

Il salvataggio di una bozza applica controlli sui dati forniti senza richiedere i campi
ancora mancanti: rifiuta solo dati sbagliati (indirizzo non valido, numeri non
positivi, ingrediente inesistente o ripetuto), accetta quantità e testi ancora vuoti.
La pubblicazione applica invece l'intera validazione.

**Campi obbligatori per pubblicare, decisi nel quinto giro del prototipo:** nome e
descrizione in italiano e inglese britannico; durata; porzioni di riferimento; almeno un
ingrediente, ciascuno con quantità e unità quando applicabili (oppure "q.b." o una
quantità a parole nelle due lingue) e con la varietà nelle due lingue se indicata; per
le fonti `web` e `youtube` l'indirizzo, per `book` libro e pagine, per `home` nessun
dato aggiuntivo. Il gruppo alimentare resta facoltativo.

**Conflitti fra curatori, decisi nel quinto giro:** ogni salvataggio dichiara la
revisione della bozza da cui parte. Se nel frattempo un altro curatore ha salvato, il
salvataggio è rifiutato con autore, momento e campi cambiati da ciascuno; chi salva
sceglie se prendere l'altra versione o sovrascriverla consapevolmente, e quella
sovrascritta resta nella cronologia della bozza. Allo stesso modo, pubblicare una
revisione partita da una versione superata richiede una conferma esplicita.

**Percorso manuale web confermato, a bassa priorità** (secondario rispetto a MCP;
forma provata nel quinto giro):

1. Il curatore crea una ricetta da un modulo oppure apre una bozza esistente, anche
   iniziata tramite MCP o da un altro curatore. Il modulo è una pagina unica a sezioni
   (nome e descrizione, fonte, pasto e porzioni, ingredienti), con un selettore di
   lingua in cima (italiano/inglese, un punto sulla lingua a cui mancano testi; deciso
   il 7 ottobre 2026): i campi tradotti mostrano una lingua per volta e un problema
   in un'altra lingua porta il selettore su quella.
2. Inserisce o modifica i dati e può salvare la bozza incompleta con «Salva bozza»;
   uscendo con modifiche non salvate l'app chiede se salvarle.
3. «Pubblica» salva le modifiche e applica l'intera validazione, con gli stessi
   validatori del percorso MCP: se passa la ricetta è pubblicata, altrimenti resta in
   bozza e il modulo mostra in cima e accanto ai campi cosa correggere. Non c'è un passo
   di verifica separato (deciso nella review del quinto giro); il server riesegue sempre
   i controlli e verifica i permessi.

Non sono usate funzionalità AI nel percorso manuale: niente compilazione, classificazione
o traduzione automatica tramite modelli. I dati e le traduzioni richiesti sono inseriti
dal curatore. La verifica automatica applica regole deterministiche e non certifica
da sola che ingredienti e quantità siano stati trascritti correttamente dalla fonte.

**Caricamento da file, non previsto per ora** (deciso nel quinto giro): l'aggiunta passa
dall'agente MCP o dal modulo. Se tornasse utile, dovrà leggere uno dei formati concordati
senza AI e portare i dati in una bozza modificabile, con gli stessi controlli del modulo,
senza pubblicare direttamente nel catalogo.

Il percorso manuale, inclusa la modifica web delle bozze, viene
implementato dopo le altre funzionalità (M6). La sezione web per consultare le bozze e
il lavoro guidato tramite MCP restano parte della curatela iniziale. Una stessa bozza
deve poter passare da MCP al modulo manuale e viceversa, senza creare copie distinte.

**Ingredienti e fonti:** solo dati verificati sulla fonte o forniti dal curatore,
trascritti per `base_servings`, mai dedotti dal nome del piatto. Un validatore strutturale
non prova la correttezza della trascrizione: la provenienza e le verifiche devono far
parte del percorso di curatela. Ingredienti equivalenti si collegano alla stessa entità
canonica, anche se i nomi sono in lingue diverse.

**Ingredienti e varietà, decisi nel quinto giro del prototipo:**

- l'ingrediente del catalogo è il prodotto generico; si cerca prima di crearne uno nuovo
  (la ricerca trova anche le varietà già usate) e un ingrediente nuovo ha nome nelle due
  lingue e reparto, senza varietà, taglia o preparazione nel nome;
- la **varietà** è testo libero e facoltativo sulla riga della ricetta, nelle due lingue,
  solo quando cambia cosa si compra (cultivar o tipo: «Roma», «cuore di bue», «gialla
  senza semi»). Taglia, maturazione e preparazione non sono varietà e restano nel testo
  della fonte o nella preparazione. Non esiste un elenco di varietà da mappare;
- il testo si salva com'è scritto, ripulito dagli spazi; i confronti (spesa, suggerimenti,
  righe ripetute) ignorano maiuscole, accenti, punteggiatura e parole come «tipo» e
  «varietà». Tutto minuscolo è escluso perché rovinerebbe i nomi propri;
- all'inserimento il sistema dà consigli che non bloccano: una grafia diversa di una
  varietà già usata per quell'ingrediente, il nome dell'ingrediente ripetuto («Pomodoro
  Roma» → «Roma»), parole di preparazione. Gli stessi controlli valgono per il modulo e
  per MCP, che ha operazioni per elencare le varietà note e controllare un testo;
- se la fonte cita due volte lo stesso ingrediente senza varietà diverse, le quantità si
  uniscono in una riga e il testo della fonte le riporta entrambe;
- le istruzioni per l'agente su questi punti sono una bozza nel prototipo
  (`prototype/src/lib/operations/curation-guide.ts`, copia italiana in
  `design/percorsi.md`) e diventeranno parte della guida servita da MCP (sezione 13).

**Completezza degli ingredienti confermata:** per pubblicare occorrono un elenco
verificato degli ingredienti, quantità e unità quando applicabili e `base_servings`
positivo, corrispondente alle porzioni per cui sono fornite le quantità. Questo vale
per ogni fonte, comprese le ricette da libro o di casa, e per l'importazione del
ricettario precedente. Se questi dati mancano, la ricetta resta in bozza.

Indicazioni non numeriche esplicite, come "q.b.", sono ammesse quando risultano dalla
fonte o dai dati forniti dal curatore: vengono elencate senza inventare una quantità
numerica. Una quantità ignota non può essere trasformata in "q.b." per superare la
validazione. La pubblicazione richiede anche entrambe le lingue (sezione 12).

**Validazione condivisa:** schema, identificatori unici, riferimenti a ingredienti e
libri esistenti, quantità e unità ammesse, porzioni di riferimento, attributi del
pianificatore e dati della fonte coerenti con il tipo. La stessa logica serve l'aggiunta
MCP, le operazioni manuali web del curatore e l'importazione: è lo schema del documento
ricetta (sezione 2), applicato con i controlli parziali al salvataggio di una bozza e
con quelli completi alla pubblicazione. I test di questa logica
sono eseguiti in CI; la CI non sostituisce la validazione di ogni scrittura sul server.

**Modifica dell'intero ricettario confermata:** ogni curatore può modificare le ricette
di qualunque autore. Le modifiche pubblicate devono rispettare gli stessi controlli
di completezza, unità, riferimenti e fonti delle nuove ricette. **Deciso nel quinto
giro:** «Modifica» crea una bozza di revisione collegata alla ricetta (una sola aperta
per ricetta, ripresa da chiunque); le famiglie vedono la versione pubblicata finché la
revisione non viene pubblicata come versione successiva. I pasti passati restano sulla
versione con cui sono stati mangiati (sezione 5); conflitti come sopra.

**Archiviazione, decisa nel quinto giro:** qualunque curatore archivia una ricetta
pubblicata (con «Annulla» subito dopo) e la riporta nel ricettario dall'elenco delle
archiviate. Una ricetta archiviata esce da ricettario, ricerca, suggerimenti e
generazioni; i pasti che la usano restano leggibili e votabili, anche quelli futuri,
finché la famiglia non li cambia. La precedente archiviazione automatica per assenza dal
YAML è eliminata. Una bozza nuova mai pubblicata si può eliminare solo se nessun pasto
la cita; una revisione si può scartare. La cancellazione del curatore non implica la
cancellazione delle ricette che ha contribuito.

**Backup e ripristino richiesti:** il ricettario deve poter essere recuperato dopo
modifiche errate o eventi imprevisti. Il design deve coprire ricette, ingredienti,
traduzioni, fonti, riferimenti ai libri e bozze, mantenendo coerenti i collegamenti con
i pasti delle famiglie. Un export YAML occasionale non è da solo un piano di backup.

**Recupero su due livelli:** la divisione dei permessi è confermata.

- **Singola ricetta, decisa nel quinto giro:** dal menu della ricetta, «Versioni» elenca
  le versioni con autore e data; una versione precedente si apre com'era e
  «Ripristina» la ripubblica subito come nuova versione, dopo una conferma. Nessun
  confronto campo per campo (escluso nella review). Lo storico resta intero; il
  ripristino riporta solo campi e righe di ingredienti di quella ricetta, non le entità
  condivise (ingredienti del catalogo, nomi, reparti), e non avviene se la vecchia
  versione non supera i controlli di oggi. Accessibile ai curatori.
- **Intero catalogo:** ripristino a una data scelta, con anteprima dell'impatto e
  verifica della coerenza. **Deciso l'8 ottobre 2026:** lo stato del catalogo a una
  data si ricostruisce dallo storico in sola aggiunta (`recipe_versions`,
  `recipe_status_changes`, `ingredient_versions`, sezione 2), senza copie giornaliere o
  settimanali da pianificare e conservare. Ciò che il sesto giro chiamava «backup» è
  quindi un istante dello storico. Il ripristino complessivo è riservato
  agli amministratori dell'app, perché può annullare modifiche di più
  curatori. Il recupero del catalogo non deve riavvolgere menu, voti, utenti o permessi
  delle famiglie e non concede accesso ai loro contenuti. **Deciso nel sesto giro del
  prototipo,** con il riferimento alla data invece che alla copia: le ricette pubblicate
  a quella data tornano com'erano, pubblicate come nuova versione (lo storico resta
  intero); quelle nate dopo, o archiviate allora, vengono archiviate, non cancellate, e
  i pasti che le citano restano leggibili; quelle archiviate oggi ma pubblicate allora
  tornano nel ricettario. Una ricetta la cui versione di allora non supera i controlli
  di oggi resta com'è e l'anteprima lo dice. Gli ingredienti del catalogo tornano come
  erano allora; quelli nati dopo restano. Bozze, menu, voti, famiglie e utenti non
  cambiano; i pasti passati restano sulla versione mangiata (R1). L'anteprima mostra le
  ricette per gruppo prima della conferma. Il ripristino scrive solo nuove versioni,
  quindi per annullarlo basta ripristinare l'istante che lo precede: la copia «Prima
  del ripristino» del sesto giro non serve più.

Storico e backup hanno scopi distinti: lo storico permette di correggere un contributo
o riportare il catalogo a una data; la perdita o il danneggiamento del database sono
coperti dai backup della piattaforma Supabase, che riguardano l'intero database e
quindi anche i dati delle famiglie. Piano di Supabase, perdita massima di lavoro
accettabile, tempi di recupero e modalità operative si definiscono prima dell'uso del
catalogo in produzione. La procedura dovrà essere provata con un ripristino in un
ambiente di verifica.

Le azioni di recupero esposte nell'app devono essere disponibili anche via MCP con gli
stessi permessi e controlli. Il design distinguerà queste azioni dai compiti operativi
di backup dell'infrastruttura.

**YAML per importazione ed esportazione:** formato di scambio con chiavi tecniche in
inglese, da precisare nel piano. Un export rappresenta il catalogo a una certa data;
non viene risincronizzato automaticamente come seconda fonte di verità. L'import
iniziale legge `../meal_planner/ricettario/ricette.yaml`, mappa ingredienti e unità,
prepara schede da rivedere e un **report delle ambiguità**, senza inventare valori.
Solo le schede che soddisfano le regole concordate entrano nel catalogo. Le ricette
importate prive di ingredienti verificati, quantità e unità richieste, porzioni di
riferimento o testi in entrambe le lingue restano bozze da completare; non sono
pubblicate con una deroga per i dati pregressi.

Voti B, `storico` ed esclusioni nelle `note` del formato di origine diventano i **dati
della famiglia di Federico**, separati dal catalogo. Conversione dei voti: B=1, BB=3,
BBB=4, BBBB=5 stelle, come voto di Federico. I nomi italiani citati qui sono campi
dell'input preesistente, non nomi da usare nel nuovo codice.

### 9. Test

- **Pianificatore**:
  - test unitari per regola su un catalogo di prova;
  - test di proprietà: su centinaia di semi, zero violazioni dei vincoli rigidi e ogni slot
    pieno o segnato "nessuna ricetta adatta";
  - **report di qualità**: `scripts/planner-report` genera 20 settimane con i dati
    reali della famiglia del curatore e riporta violazioni, gruppi rispetto agli
    intervalli, quota note/nuove, coppie simili più vicine e ripetizioni. Va guardato prima
    di attivare il job.
- **Giudice** (solo se lo si sperimenta):
  - test unitari della ricaduta: spento, timeout, errore, risposta non valida portano sempre
    alla candidata migliore a regole;
  - test sui dati inviati: nessun campo identificativo della famiglia nel payload;
  - valutazione del valore: report di qualità con solo regole e con regole più giudice, poi
    un test alla cieca di qualche settimana sulla famiglia del curatore (due proposte senza
    sapere quale ha scelto il giudice). Se il giudice non vince in modo chiaro, resta
    spento.
- **Scalatura e lista**: casi tabellari su unità, arrotondamenti finali, non scalabili,
  sinonimi, unità incompatibili, `is_pantry` e `avoid`; conversioni metriche e imperiali
  britanniche, indipendenza dalla lingua, cambio di preferenza senza alterare i dati.
- **RLS**: test contro il Supabase locale. Un membro della famiglia A non legge né scrive
  niente della famiglia B; un utente senza ruolo di curatore non aggiunge ricette; un
  membro non amministratore non gestisce inviti e impostazioni della famiglia. I test
  dei privilegi globali seguiranno la matrice dei permessi concordata.
- **Ricettario**: validazione con casi validi, mancanti e incoerenti; mancata scrittura
  di schede incomplete nel catalogo pubblicato anche se l'agente prova a pubblicarle;
  blocco della pubblicazione senza ingredienti, quantità o unità richieste e porzioni
  di riferimento, anche per l'importazione; accettazione di "q.b." documentato e
  distinzione rispetto a una quantità ignota;
  salvataggio e ripresa delle bozze da MCP e consultazione dal web, senza renderle
  disponibili nei menu o nella spesa; modifica di ricette di altri curatori, con
  controllo dei conflitti; atomicità della pubblicazione;
  import con i casi presi dal ricettario attuale e nessuna sovrascrittura dei contributi
  già presenti. Cambi di codice ed esportazioni non devono sostituire il catalogo.
- **Curatela manuale (M6)**: creazione, modifica di bozze anche altrui, pubblicazione
  rifiutata finché mancano dati e riuscita dopo la correzione, con gli stessi vincoli di
  MCP; nessuna chiamata a servizi AI; ripresa della stessa bozza fra web e MCP e
  gestione dei conflitti fra curatori.
- **Recupero del catalogo**: ripristino di una singola ricetta e dell'intero catalogo a
  una data rispettivamente da curatori e amministratori dell'app, con rifiuto delle
  operazioni non autorizzate; ricostruzione esatta del catalogo a una data dallo
  storico; coerenza fra ricette, proiezioni, ingredienti, traduzioni e bozze;
  conservazione dei riferimenti dai pasti e assenza di modifiche a dati e ruoli
  familiari; annullamento di un ripristino ripristinando l'istante precedente. Il
  collaudo comprende anche l'effettivo recupero da un backup della piattaforma.
- **Contratto e operazioni**: test delle operazioni contro il Supabase locale, con
  l'identità di utenti diversi, così permessi e RLS si provano insieme; test ricavati
  dal contratto che verificano per ogni operazione la scelta esplicita di esposizione
  MCP, la presenza dello strumento corrispondente e la risposta `web_only` con URL per
  le operazioni riservate al web; idempotenza delle operazioni accodabili offline;
  rifiuto delle richieste dopo la cancellazione dell'account o la revoca dell'agente.
- **Lingue**: copertura di italiano e inglese britannico, identità stabili del catalogo,
  formattazione e rifiuto della pubblicazione quando manca un testo richiesto in una
  delle due lingue, anche per importazione e percorso manuale. Una bozza può invece
  essere salvata e ripresa con traduzioni ancora mancanti.
- **MCP**: parità di operazioni, permessi, validazione, attribuzione, conflitti e limiti
  rispetto al web, salvo l'eliminazione delle famiglie riservata all'app; isolamento
  fra utenti e famiglie; riconnessione e accessi revocati;
  esportazioni effettivamente utilizzabili nei client supportati. Verifica del
  collegamento e dei percorsi previsti su ciascuno dei quattro client obiettivo:
  Codex CLI, Claude Code, ChatGPT e Claude Desktop, registrando versioni o modalità
  provate ed eventuali limitazioni emerse.
- **Amministrazione dell'app**: accesso alla pagina e agli strumenti MCP riservato al
  ruolo autorizzato; assegnazione e revoca di ruoli, nomina di altri amministratori,
  inviti e cancellazione di utenti; protezione dell'ultimo amministratore dell'app,
  trasferimento dell'amministrazione familiare prima della cancellazione quando ci
  sono altri membri, eliminazione della famiglia dell'unico membro e revoca degli
  accessi MCP dell'utente cancellato. Il catalogo pubblicato rimane disponibile.
- **Eliminazione della famiglia**: permesso limitato agli amministratori di quella
  famiglia ed esecuzione riservata all'app web, con controllo sul server; rimozione
  dei dati e degli accessi familiari senza cancellare account, voti personali o altre famiglie. Il solo ruolo
  `app_admin` e il ruolo `member` non autorizzano l'operazione diretta. Verificare anche
  famiglia con più membri e job in corso, senza lasciare una famiglia parzialmente attiva.
  Da MCP si ottiene soltanto l'URL, senza eliminazioni, anche tentando la cancellazione
  dell'account dell'unico membro. Aprire il link non ha effetti di scrittura; il
  completamento richiede autenticazione, permessi validi e conferma nella pagina web.
- **End to end** (Playwright): iscrizione, creazione della famiglia, invito, modifica di uno
  slot, voto, generazione della lista con pagina Bring!, cambio lingua e unità,
  collegamento MCP e operazioni di curatela e amministrazione.

### 10. Fasi di rilascio

**Ordine confermato il 3 ottobre:** prima costruire e concordare il prototipo dell'app,
salvato nel repository; poi verificare le scelte funzionali e architetturali alla luce
del prototipo; infine aggiornare e approvare i piani prima dell'implementazione dell'app.

Ogni fase ha il suo piano in `progetto/superpowers/plans/` e rimanda alle sezioni di questa
specifica. Il piano del 29 settembre per M1a è **superato nelle parti su Git come fonte
del catalogo, sincronizzazione, permessi e codice italiano** e non va eseguito come
scritto. M1b non è ancora stato scritto. La nuova ripartizione di M1 sarà definita dopo
il prototipo; la tabella seguente è il percorso di riferimento precedente alla verifica
dell'architettura. **Punto aperto dall'8 ottobre 2026** (sezione 15): le fasi vanno
ripensate alla luce della nuova architettura e della challenge del piano (esperimenti
iniziali su pianificatore e accesso MCP, dipendenza fra curatela e pubblicazione del
ricettario importato, ampiezza di M1, collocazione di amministrazione, inviti all'app e
ripristino dell'intero catalogo). Fino ad allora la tabella non è un piano confermato.

| Fase | Contenuto | Risultato |
|---|---|---|
| **P0 Prototipo e revisione** | Prototipo nel repository, review dei flussi e delle superfici, riesame funzionale e architetturale, consolidamento della specifica e dei nuovi piani | Un'esperienza concordata guida l'implementazione |
| **M1 Fondamenta** | Schema e RLS, Auth, famiglie e inviti, catalogo nel database, import e revisione, dati iniziali di Federico, preferenze di lingua e unità, ruoli globali, accesso MCP e relativa guida. Ripartizione di curatela e amministrazione da precisare nel nuovo piano | Si entra e si consulta il ricettario e la propria famiglia; i percorsi autorizzati sono disponibili anche via MCP |
| **M2 Modifica e voti** | Azioni sugli slot, suggerimenti, annullamento, ultima modifica, stelline e media, esclusioni, creazione manuale di una settimana, con equivalenti MCP | La famiglia pianifica a mano dall'app o dall'agente |
| **M3 Pianificatore** | Algoritmo, report di qualità, job del mercoledì, generazione su richiesta anche via MCP. Poi, come esperimento separato, giudice AI opzionale | La bozza arriva da sola; il giudice si accende solo se vince la valutazione |
| **M4 Lista della spesa** | Lista della settimana, consolidamento, conversioni ed equivalenze, spunte condivise e offline, PDF, condivisione, Bring!, esportazioni MCP | Si prepara e si fa la spesa nella lingua personale e nelle unità della famiglia |
| **M5 Apertura** | Wizard, avvio a freddo, privacy, SMTP, limiti di frequenza | Altre famiglie possono iscriversi |
| **M6 Curatela manuale — ultima priorità** | Modulo web senza AI per creare, modificare e pubblicare ricette, comprese le bozze condivise, con gli stessi controlli di MCP | I curatori possono completare il lavoro manualmente nell'app, usando gli stessi dati e controlli di MCP |

Lingue, unità e accesso MCP sono requisiti trasversali: ogni funzione introdotta li
rispetta dalla sua prima versione, con l'eccezione esplicita dell'eliminazione delle
famiglie, per cui MCP restituisce il link all'app. La collocazione delle attività nella roadmap non
rinvia la progettazione delle relative dipendenze al termine dello sviluppo.
La priorità finale di M6 riguarda il modulo manuale, non la
consultazione delle bozze nell'app, richiesta insieme alla curatela tramite MCP.

### 11. Convivenza con il progetto di origine

- `meal_planner` resta com'è: YAML, PDF e sito Netlify pubblicato da `main`. Questa app è
  separata, con il suo repository, il suo sito Netlify e il suo progetto Supabase.
- Il ricettario del progetto di origine è la fonte dell'import iniziale. Fino allo
  spegnimento del vecchio flusso, lo script di import è **rilanciabile**: prepara per la
  revisione solo le schede nuove, riconosciute tramite lo slug di origine, e non tocca
  quelle già importate o curate nel database. La corrispondenza con l'identità originale
  deve essere conservata anche se cambiano nome, lingua o identificatori nel nuovo
  catalogo. Una ricetta aggiunta nel vecchio repository può arrivare qui attraverso
  revisione e validazione, senza una sincronizzazione automatica che sovrascriva i dati.
- Nello storico dell'origine alcuni pasti risultano non cucinati (`cucinata: false`).
  Poiché l'app non ha più "non cucinato", l'import non deve registrarli come mangiati:
  come rappresentarli (slot omesso, pasto libero o segnalazione nel report delle
  ambiguità) si decide insieme ai rilievi di R4.
- Quando spegnere il vecchio flusso lo decide l'utente, dopo M4.

### 12. Lingue e contenuti tradotti

**Confermato:** lingua scelta per utente, italiano e inglese britannico nella prima
versione. Il sistema di misura appartiene invece alla famiglia; nessuna scelta impone
automaticamente l'altra. Le nuove pagine di guida MCP e amministrazione fanno parte
dell'esperienza tradotta.

**Ambito del design proposto:**

- testi dell'interfaccia, messaggi di errore, avvisi, impostazioni, ruoli e reparti;
- nomi e descrizioni delle ricette, ingredienti e relativi sinonimi di ricerca;
- contenuti della lista della spesa ed esportazioni nella lingua di chi li genera;
- date, numeri, plurali e nomi delle unità coerenti con la lingua selezionata;
- identificatori e codici tecnici stabili in inglese, indipendenti dalle traduzioni,
  utilizzabili allo stesso modo dal web e da MCP.

Le stringhe dell'interfaccia possono vivere nel codice; le traduzioni del catalogo
seguono le ricette nel database autorevole. È proposta una preparazione e revisione
delle traduzioni durante la curatela, anche con l'aiuto dell'agente, anziché tradurre
nuovamente ogni volta che si apre una ricetta.

**Pubblicazione bilingue confermata:** i testi richiesti di una ricetta devono essere
disponibili sia in italiano sia in inglese britannico prima della pubblicazione.
Questo comprende nome e descrizione della ricetta, i nomi degli ingredienti collegati
e, dal 6 ottobre 2026, il testo delle quantità non numeriche (per esempio "1 mazzetto",
"3 matasse"), mostrato nella lingua dell'utente; le identità e le quantità numeriche
sono condivise fra le due lingue. La regola vale per nuove
ricette, modifiche e importazioni e viene verificata dal server in ogni canale.
Le traduzioni mancanti sono segnalate nella bozza e impediscono di pubblicarla: mostrare
l'originale italiano non è un'alternativa alla completezza del catalogo pubblicato.

Nel percorso MCP l'agente può aiutare a preparare le traduzioni; nel percorso manuale
il curatore le inserisce senza funzionalità AI dell'app. Le modalità di revisione delle
traduzioni suggerite restano da definire. Anche il trattamento dei testi liberi degli
utenti è da concordare: la proposta iniziale è conservarli come scritti. Questi testi,
le trascrizioni originali delle fonti e i titoli bibliografici sono distinti dai testi
localizzati obbligatori. I collegamenti alle fonti non diventano traduzioni dei siti o
dei libri.

### 13. MCP e guida al collegamento

**Requisito:** ogni operazione disponibile nell'app deve avere un equivalente MCP per
lo stesso utente e con gli stessi permessi, **tranne l'eliminazione di una famiglia**,
che MCP può soltanto indirizzare alla pagina dell'app. Il server espone operazioni applicative,
non accesso generico alle tabelle.

**Architettura decisa l'8 ottobre 2026** (sezione 1):

- **Stessa applicazione.** Il server MCP è la rotta `/mcp` della funzione Hono, con il
  trasporto Streamable HTTP senza stato, adatto alle funzioni serverless; non è un
  servizio separato.
- **Autenticazione con il server OAuth 2.1 di Supabase Auth**, conforme alla
  specifica di autorizzazione MCP: metadati di scoperta, registrazione dinamica dei
  client, flusso con PKCE e pagina di consenso ospitata dall'app (`/authorize`, sesto
  giro). Il server MCP verifica i token come risorsa protetta. Scollegare un agente
  dall'app revoca la sua autorizzazione, con i token di aggiornamento e le sessioni di
  quel client.
- **Strumenti generati dal contratto delle operazioni**, con i metadati di esposizione
  di ciascuna operazione: nessuno strumento scritto a mano che possa divergere dal web.
  Raggruppamento degli strumenti (uno per operazione o uno per area con l'azione come
  parametro) da provare sui client (sezione 15).
- **Istruzioni per l'agente**, a partire da quelle sugli ingredienti (sezione 8),
  servite dal server MCP stesso, non solo descritte nella pagina dell'app.

Compatibilità effettiva dei quattro client e consegna delle esportazioni restano da
verificare con una prova prima dell'implementazione (sezione 15).

**Client obiettivo confermati per la prima versione:** Codex CLI, Claude Code, ChatGPT
e Claude Desktop. Questa scelta definisce il perimetro da supportare e documentare;
non attesta una compatibilità già verificata. Il design tecnico deve verificare per
ciascuno collegamento, autenticazione, operazioni di lettura e scrittura, rispetto dei
ruoli e consegna delle esportazioni. Le differenze emerse devono essere riportate nella
guida e risolte o concordate prima del rilascio, senza introdurre altre eccezioni
implicite alla copertura delle operazioni.

| Ambito | Operazioni da coprire tramite MCP |
|---|---|
| Accesso e contesto | Collegare l'account, elencare le proprie famiglie e indicare quella su cui operare |
| Pasti e ricettario | Consultare oggi e settimane, cercare e leggere ricette, ingredienti e voti |
| Revisione | Cambiare ricetta e porzioni, chiedere suggerimenti, scambiare pasti, segnare pasti liberi, note ed esclusioni |
| Voti e generazione | Dare, cambiare o togliere il proprio voto; richiedere la generazione nei limiti previsti |
| Spesa | Leggere la lista di una settimana, spuntare voci, aggiungere voci libere, ottenere PDF, testo e collegamento Bring! |
| Famiglia e account | Creare e gestire la famiglia, impostazioni e inviti secondo il ruolo; per eliminarla restituire solo l'URL della pagina web; preferenze personali e cancellazione del proprio account, rimandando all'app quando comporterebbe anche l'eliminazione di una famiglia |
| Curatela | Conoscere i requisiti e le istruzioni sugli ingredienti, salvare e riprendere bozze (con la stessa gestione dei conflitti del web), controllare una bozza senza pubblicarla, pubblicare ricette complete, modificare ricette di qualunque autore, cercare ingredienti e varietà già usate e controllare una varietà, archiviare e riportare nel ricettario, elencare le versioni e ripristinarne una |
| Amministrazione globale | Gestire utenti, ruoli, nomina di amministratori, inviti e ripristino dell'intero catalogo a una data; cancellare utenti con i vincoli previsti, restituendo solo un URL quando l'operazione eliminerebbe anche una famiglia |

Il server ricava l'identità dall'accesso autenticato e verifica il diritto di operare
sulla famiglia o sulla funzione globale richiesta. Il nome di un ruolo fornito
dall'agente non concede quel ruolo. Risultati ed errori devono permettere all'agente di
mostrare gli stessi errori previsti dal web.

**Eliminazione della famiglia: passaggio obbligatorio all'app.** Una richiesta MCP
non esegue né prepara una cancellazione automatica; restituisce un risultato
strutturato che spiega la necessità di aprire l'app e contiene l'URL della pagina
appropriata. L'utente deve aprirla, autenticarsi se necessario e confermare. La pagina
verifica i permessi, senza considerarli concessi dal possesso del link.

La restrizione deve essere applicata sul server e coprire anche le cancellazioni
indirette tramite eliminazione dell'account dell'unico membro. Nascondere un comando
nella lista degli strumenti non basta: il design deve distinguere il contesto di
accesso web da quello MCP in modo verificabile, senza fidarsi di un parametro con cui
l'agente dichiara il canale della richiesta. **Meccanismo deciso l'8 ottobre 2026:** i
token rilasciati agli agenti dal server OAuth portano il claim `client_id`, assente
nelle sessioni dell'app web; le operazioni riservate al web rifiutano con `web_only` e
l'URL della pagina ogni richiesta che lo contiene, qualunque rotta usi. Le altre
operazioni rimangono disponibili via MCP secondo i ruoli già concordati.

Un agente può assistere il curatore o l'utente nelle operazioni manuali, ma il
pianificatore automatico resta il sistema a regole della sezione 3. L'app non impone
un modello o un fornitore AI al client MCP.

**Pagina web di istruzioni** («Collega un agente» nel Profilo, forma decisa nel sesto
giro del prototipo, `/profile/agents`):

- nessun paragrafo introduttivo (tolto nella review): cosa l'agente può fare con i
  ruoli dell'utente si legge nella schermata di autorizzazione;
- offre percorsi distinti per Codex CLI, Claude Code, ChatGPT e Claude Desktop, con
  indirizzo MCP e comandi o configurazioni copiabili quando il client usa questa
  modalità, oppure passaggi nell'interfaccia quando previsti;
- spiega accesso e autorizzazione nel browser, ammessi dall'utente, ed eventuale
  riautenticazione;
- chiarisce che l'eliminazione delle famiglie si completa soltanto nell'app, tramite
  il collegamento restituito dall'agente;
- include un esempio per verificare il collegamento e un esempio del flusso del curatore;
- per i curatori, rimanda alle istruzioni scritte che il servizio fornisce all'agente
  (ingredienti, varietà e quantità: sezione 8);
- descrive come scollegare l'agente secondo il meccanismo di autorizzazione scelto.

Ordine deciso nel sesto giro: indirizzo del servizio con «Copia»; i quattro client a
fisarmonica (scelta nella review rispetto alle schede), ciascuno con passaggi numerati
e comandi da copiare; accesso; esempi da chiedere all'agente (per i curatori anche il
flusso di curatela e le istruzioni sugli ingredienti servite all'agente); nota
sull'eliminazione delle famiglie; in fondo «Agenti collegati» con client, data del
collegamento, ultimo uso e «Scollega». Scollegare revoca l'accesso; la conferma spiega
anche come togliere il servizio dal client. Nel prototipo i comandi di Claude Code
(`claude mcp add --transport http`, accesso da `/mcp`) e di Codex (`codex mcp add
<nome> --url`, `codex mcp login`) e i passaggi di Claude Desktop (connettore
personalizzato) sono verificati con la documentazione del 7 ottobre 2026; quelli di
ChatGPT no. Restano esempi da verificare prima del rilascio.

**Schermata di autorizzazione** (sesto giro, `/authorize`, simulata): aperta dall'agente
nel browser, richiede l'accesso all'app; mostra il client, l'account in uso con «Non
sei tu? Cambia account», cosa l'agente potrà fare secondo i ruoli dell'utente e cosa
no (eliminare una famiglia, vedere le credenziali), con «Consenti» e «Annulla».
Autorizzare di nuovo lo stesso client sostituisce l'accesso precedente.

I client iniziali sono scelti; comandi e modalità di collegamento effettivi vanno
verificati nel relativo design. La specifica non assume che tutti gli agenti abbiano
lo stesso comando o le stesse capacità di
gestione di file. Il prototipo distinguerà gli esempi dalle istruzioni operative finali.

### 14. Prototipo e consolidamento del design

**Confermato:** il primo artefatto da costruire è un prototipo dell'app conservato nel
repository e sottoposto a review dell'utente, prima dell'implementazione del prodotto.
La review deve poter cambiare sia funzionalità sia scelte architetturali. Il prototipo
è in `prototype/`; tutti i percorsi sono stati rivisti entro il 7 ottobre 2026.

**Metodo e percorsi, concordati il 6 ottobre 2026.** Il prototipo si costruisce per
giri, ciascuno con preparazione, piano approvato, sviluppo, review con l'utente e
consolidamento. L'ordine dei percorsi, il loro stato, l'architettura del prototipo e
il contenuto di ogni giro sono tracciati in `design/percorsi.md`, guida dei flussi da
seguire anche nello sviluppo dell'app. Le decisioni di prodotto emerse nelle review
restano registrate in questa specifica; il documento dei percorsi descrive come si
attraversano nelle schermate e vi rimanda.

- ordine: Fondamenta, Menu, Ricettario e voti, Revisione dei pasti, Spesa, Famiglia e
  account, Curatela, MCP, Amministrazione dell'app;
- primo giro: Fondamenta, Menu, Ricettario e voti insieme, con una tappa intermedia
  dopo Fondamenta e Menu; i giri successivi si compongono alla fine di ogni review;
- prototipo SvelteKit autonomo eseguito nel browser, con dati demo in `localStorage`,
  operazioni applicative simulate che abbozzano quelle condivise fra web e MCP e un
  pannello di prova per utente, ruoli, lingua, unità, data simulata e scenari;
- tracciamento nel repository: `design/percorsi.md` per il percorso complessivo, un
  piano per giro in `progetto/superpowers/plans/`, commit Git locali per la storia.

**Primo giro approvato il 6 ottobre 2026:** Fondamenta, Menu e Ricettario e voti, con
il perimetro descritto in `design/percorsi.md` e il prototipo in `prototype/`.

**Secondo giro approvato il 6 ottobre 2026:** Revisione dei pasti. Le azioni si aprono
dalla matita nel footer della scheda, in un pannello sotto la scheda con porzioni,
cambia ricetta e nota; cambio ricetta, scambio, pasto libero, nota ed esclusione si
completano in un foglio dal basso. "Cambia ricetta" mostra in cima pasto libero,
"non proporre più" e "scambia con un altro pasto", poi i suggerimenti in schede scorrevoli con
"proponimene altri" e infine la ricerca. Dopo ogni modifica un avviso offre "Annulla".

**Terzo giro approvato il 6 ottobre 2026:** Spesa. Una lista per settimana, aperta
dalla borsa nella barra del Menu sulla settimana mostrata, con tutti i pasti della
settimana; spunte condivise e possibili offline; voci libere nell'ultima riga di
"Altro"; "Non in lista" richiudibile per dispensa ed evitati; freccia per vedere da
quali pasti viene una voce; esportazioni nel menu "…" in alto a destra. Pagine
secondarie con freccia "indietro" e nome della destinazione; un tocco su Menu nella
navbar con il Menu aperto porta a oggi. Dopo tre revisioni nel giro sono state
scartate la scelta dei pasti, le liste fatte a mano, l'elenco delle liste e lo storico
(dettagli in `design/percorsi.md`).

**Quarto giro approvato il 6 ottobre 2026:** Famiglia e account. Primo accesso
simulato, wizard minimo con prima generazione, pagina dell'invito, vista Profilo,
membri e inviti, impostazioni della famiglia (griglia «Chi mangia quando» con pasti
fissi e tempi per pasto, regole a modelli, ingredienti, libri, unità, «Avanzate»),
"non proporre più", preferenze, uscita, eliminazione della famiglia e cancellazione
dell'account su pagine dedicate con conferma a pulsante. Le azioni irreversibili usano
un pulsante rosso. Dettagli in `design/percorsi.md`.

**Quinto giro approvato il 7 ottobre 2026:** Curatela. Bozze in testa al ricettario a
schede e archiviate in fondo; «+» per una ricetta nuova; menu «…» nella scheda ricetta
per i curatori (modifica tramite bozza di revisione, versioni, archiviazione); modulo
manuale a pagina unica con «Salva bozza» e «Pubblica» in un passo, problemi in cima e
accanto ai campi, avviso di conflitto fra curatori e richiesta di salvare uscendo;
varietà degli ingredienti in testo libero con consigli; versione precedente aperta
com'era con «Ripristina»; versione dei pasti passati (R1). Il percorso consigliato per
la curatela resta MCP. Dettagli in `design/percorsi.md`.

**Sesto giro approvato il 7 ottobre 2026:** MCP e Amministrazione dell'app, senza
agente simulato. «Collega un agente» nel Profilo con indirizzo, client a fisarmonica,
accesso, esempi e agenti collegati; schermata di autorizzazione nel browser.
Amministrazione dal Profilo in una pagina con utenti e ruoli, inviti all'app con ruoli
facoltativi e backup del ricettario con anteprima del ripristino; cancellazione di un
utente sulla stessa pagina della cancellazione dell'account. Dettagli in
`design/percorsi.md`. Tutti i percorsi del prototipo sono stati rivisti.

**Linguaggio visivo definitivo, approvato il 4 ottobre 2026.** L'utente ha scelto
il linguaggio del riferimento HTML derivato dallo studio di HelloFresh e verificato
su iPhone. Il materiale approvato è raccolto in `design/`:

- `design/design.md`: guida operativa di palette, font, gerarchie, spazi e componenti;
- `design/index.html`: riferimento interattivo approvato;
- `design/assets/`: font e fotografie usati dal riferimento;
- `design/references/hellofresh/`: screenshot approvati e provenienza degli asset.

La guida attua questa decisione e rimane subordinata ai requisiti di questa specifica.
Il piano e lo sviluppo del prototipo devono usarla esplicitamente; non è necessario
riaprire la scelta del linguaggio. Ogni variazione successiva richiede accordo con
l'utente e aggiornamento della specifica e della guida.

**Caratteri del linguaggio approvato:** fondo crema `#FAF8F3`, superfici bianche,
testo e pulsanti primari `#232323`, verde `#067A46` per gli accenti e stato attivo
della navbar; titoli dei piatti in Agrandir Regular, sezioni in Agrandir Tight Bold,
corpo e controlli in Roboto. Schede bianche con fotografia quando disponibile e
ombra leggera; pulsanti da 8 px di raggio e separatori sottili. File dei font,
dimensioni, pesi, spazi e stati sono definiti nella guida.

**Struttura del riferimento approvato:** il Menu si apre direttamente sul calendario,
senza header introduttivo o footer decorativo. I giorni restano in colonne da
scorrere lateralmente, con selettore superiore sincronizzato; il giorno attivo è
scuro con testo bianco. Nessuna ripetizione del numero del giorno o contatori nel
contenuto. Dal 6 ottobre 2026 la navbar inferiore mostra Menu, Ricettario e una voce
per famiglia, account, cambio di famiglia e funzioni dei ruoli (curatela,
amministrazione, istruzioni MCP), con etichetta «Profilo» / «Profile» (rinominata
nella review del quarto giro); la Spesa esce dalla navbar e si apre dal Menu (terzo giro). Sopra il
selettore dei giorni una barra con il mese e le icone di azione (calendario e borsa
della spesa); la scheda del pasto ha un footer a icone
per scheda ricetta, voto, ingredienti e modifica (dal secondo giro; "non cucinato" è
stato tolto); foto in
banner basso 3:1 e fonte sulla riga del tempo, troncata. Le schede del ricettario usano
lo stesso componente; il ricettario ha ricerca, un'icona che apre filtri e
ordinamento (nome, voto, aggiunte di recente, mangiate di recente), con una freccia
per invertire l'ordine scelto; nessun filtro per stagione. Nella scheda
ricetta il titolo apre la fonte e sotto seguono voto, descrizione, porzioni e
ingredienti (dettagli in `design/design.md`).
La navbar mostra solo icone, con nomi accessibili,
rispettando l'area sicura dell'iPhone e senza coprire i contenuti. Gli ingredienti si
espandono nelle singole card. Questi elementi costituiscono la base delle relative
viste del prototipo; le altre funzioni vanno declinate nello stesso linguaggio.

**Ambito dell'approvazione:** l'HTML in `design/` è un riferimento visivo e di
interazione, non il prototipo completo o l'implementazione del prodotto. Il menu
fisso, il ricettario limitato alle ricette della settimana e la spesa del solo
giorno selezionato sono dimostrativi: non sostituiscono il catalogo globale e la
spesa consolidata delle sezioni 6 e 8. Il prototipo dovrà coprire i flussi, le lingue,
le unità, i ruoli e gli stati previsti dalla specifica. Il sito esterno documenta
l'origine dello stile; cambiamenti futuri di quel sito non alterano la scelta
consolidata nel repository.

**Perimetro proposto da concordare nel piano del prototipo:**

- navigazione provabile da telefono e desktop, con dati dimostrativi;
- pasti di oggi, settimana e revisione, ricerca e scheda ricetta, voti e lista della spesa;
- famiglia, membri e inviti, preferenze personali e della famiglia; eliminazione della
  famiglia da parte del suo amministratore solo nell'app, con passaggio dal link
  restituito da MCP; differenza rispetto alla cancellazione di un account, con i
  vincoli sull'ultimo amministratore e sull'eliminazione indiretta delle famiglie;
- cambio lingua e sistema di misura osservabile nei dati mostrati;
- pagina di collegamento MCP e rappresentazione del percorso guidato del curatore;
- sezione bozze nell'app, ripresa del lavoro e pubblicazione; modifica di una ricetta
  di un altro curatore e rappresentazione del recupero da errore;
- rappresentazione del futuro percorso manuale senza AI, con modifica, verifica e
  correzione di una bozza condivisa; la sua presenza nel prototipo non anticipa la
  priorità di implementazione M6;
- pagina di amministrazione dell'app, con elenco utenti, ruoli, inviti, cancellazione
  e percorso di ripristino dell'intero catalogo;
- stati significativi: dati mancanti, nessun risultato, permessi insufficienti e conflitti.

Proposta: simulare le integrazioni per rivedere l'esperienza prima di collegare servizi
reali. La review del prototipo non certifica la compatibilità di un client MCP, il
funzionamento dell'autenticazione o l'applicazione dei permessi: questi richiedono le
successive verifiche tecniche.

**Criterio di passaggio all'implementazione:** review del prototipo, decisioni riportate
nelle sezioni pertinenti di questo documento, verifica dell'architettura risultante
(svolta l'8 ottobre 2026, sezione 1, con i punti aperti della sezione 15),
piani aggiornati e approvati, scelta del metodo di esecuzione. Il linguaggio visivo
è già approvato; le ulteriori decisioni sulle superfici e sui flussi entreranno qui
insieme ai riferimenti ai file del prototipo completo.

### 15. Decisioni da completare nel design

Questa sezione è parte della specifica di lavoro: rende visibili le scelte ancora aperte,
non autorizza a risolverle implicitamente durante l'implementazione. Quando una scelta
viene concordata, si aggiorna la relativa sezione e si chiude la voce qui.

| Tema | Decisione da concordare | Dove confluisce |
|---|---|---|
| Utenti e inviti | Gestione degli inviti familiari da parte dell'amministrazione globale (per ora esclusa: l'amministrazione non entra nelle famiglie). Deciso nel quarto giro: un membro rimosso rientra solo con un link creato dopo la rimozione (review R2). Decise nel sesto giro le regole degli inviti all'app (email, ruoli facoltativi, 7 giorni, uso singolo, revoca, sostituzione) | Sezione 7 |
| Cancellazione | Passaggio da MCP al web (la forma delle pagine di conferma è decisa nel quarto giro), dettagli tecnici della cancellazione e della revoca degli accessi, attribuzioni, inviti pendenti e bozze condivise. Già confermate protezione dell'ultimo amministratore, successione familiare ed eliminazione della famiglia solo nell'app, anche quando conseguente alla cancellazione di un account | Sezioni 2, 7 e 13 |
| Completezza delle ricette | Momento della conferma del curatore nel percorso MCP. Decisi nel quinto giro i campi obbligatori per pubblicare, anche per tipo di fonte (sezione 8) | Sezioni 8, 11 e 12 |
| Backup e ripristino | Piano Supabase e backup della piattaforma per i guasti del database: perdita di lavoro tollerata, tempi e procedura tecnica di recupero. Decisi nel quinto giro il ripristino della singola ricetta e la versione usata dai pasti passati, nel sesto il ripristino dell'intero catalogo (ricette successive archiviate, anteprima), l'8 ottobre la ricostruzione a una data dallo storico al posto delle copie periodiche | Sezioni 2, 8, 9 e 13 |
| Lingue | Revisione delle traduzioni suggerite, testi liberi, impostazione iniziale della lingua e ricerca multilingue; traduzioni mancanti bloccano già la pubblicazione. Proposta dell'8 ottobre da valutare: campi bilingui (`{it-IT, en-GB}` validati dallo schema) al posto delle tabelle `*_translations`, dato che le lingue sono due, fisse ed entrambe obbligatorie | Sezioni 2 e 12 |
| Misure | Elenco dei codici, unità domestiche ambigue, fattori verificati, arrotondamenti imperiali e comportamento su quantità piccole. Già decisi nel terzo giro: tazze USA solo con equivalenze per ingrediente, pezzi interi nella spesa, conversioni di acquisto (succo di limone in limoni) | Sezione 6 |
| MCP | Verifica dei quattro client scelti con il server OAuth 2.1 di Supabase (comandi d'esempio nel sesto giro, ChatGPT da verificare), raggruppamento degli strumenti, consegna delle esportazioni, ultimo uso degli agenti e comportamento dei ritentativi. Decise nel sesto giro la pagina di collegamento, la schermata di autorizzazione e lo scollegamento dall'app; l'8 ottobre architettura, autenticazione e distinzione del canale (sezioni 1 e 13) | Sezioni 1, 2 e 13 |
| Prototipo | Tutti i percorsi approvati entro il sesto giro (7 ottobre 2026); architettura verificata l'8 ottobre. Il prototipo resta in Svelte come riferimento dei percorsi; dall'8 ottobre il ripristino del catalogo vi si fa scegliendo una data (sezione 8) | Sezione 14 |
| Implementazione | **Fasi di rilascio da ripensare** con la nuova architettura (sezione 10): esperimenti iniziali su pianificatore con i dati reali e accesso OAuth MCP, import bilingue preparato nel repository per non far dipendere il ricettario dalla curatela MCP o dal modulo manuale, ampiezza di M1, MCP introdotto per aree, collocazione di amministrazione, inviti all'app e ripristino dell'intero catalogo; nuovi confini di M1a/M1b, flusso Git e configurazione dell'integrazione Supabase. Stack deciso l'8 ottobre (sezione 1) | Sezioni 1 e 10 |
| Architettura | Libreria del contratto delle operazioni: oRPC (contratto separato, RPC e OpenAPI dallo stesso router, integrazione con TanStack Query; da verificare la stabilità della versione) oppure contratto zod con Hono e `zod-openapi`, eventualmente dopo una prova. Da verificare: Hono sulle Functions Node di Netlify, query del server nel ruolo dell'utente con RLS e accesso tipizzato (per esempio Drizzle), coda offline con le mutazioni persistite di TanStack Query | Sezione 1 |
| Calendario | **Fuso orario della famiglia, da decidere prima dello schema** (`families.time_zone`: come si sceglie, se si può cambiare e con quali effetti sui pasti passati e su R1). Generazione su richiesta rispetto al job del mercoledì (review R3; le chiusure sono state eliminate; prima generazione di una famiglia nuova decisa nel quarto giro; generazione pigra come rete di sicurezza del job decisa l'8 ottobre, sezione 4) | Sezioni 2, 4 e 5 |
| Importazione | Familiarità iniziale distinta dallo storico datato e mappatura delle ricette di casa con URL, senza perdita di provenienza (review R4) | Sezioni 3, 8 e 11 |
| Pianificatore e giudice | Classificazione univoca dei vincoli e degli esiti quando non soddisfacibili; chiarire se il giudice può conoscere la posizione dei pasti liberi (review R5) | Sezioni 3 e 9 |

### 16. Registro delle revisioni

| Data | Decisioni consolidate |
|---|---|
| 29 settembre 2026 | Approvata la base funzionale e tecnica dell'app, con pianificatore a regole e rilascio per fasi |
| 3 ottobre 2026 | Aggiunti unità metriche/imperiali britanniche, lingua personale italiano/inglese britannico, parità MCP, ruolo di curatore e inserimento guidato, catalogo autorevole nel database, guida MCP, amministrazione globale degli utenti e codice in inglese. Confermati ruoli globali cumulabili senza accesso automatico ai contenuti familiari. Stabiliti prototipo prima dell'implementazione e questo documento come riferimento unico aggiornato a ogni nuova scelta |
| 3 ottobre 2026, prosecuzione | Confermate bozze persistenti visibili in una sezione dell'app, possibilità per ogni curatore di modificare l'intero ricettario e necessità di backup e ripristino. La completezza è richiesta per pubblicare nel catalogo, mentre le bozze possono essere incomplete. Il ripristino della singola ricetta spetta ai curatori, quello dell'intero catalogo agli amministratori dell'app |
| 3 ottobre 2026, curatela manuale | Confermate bozze condivise e modificabili da tutti i curatori. Aggiunto il percorso manuale web senza AI per creare, modificare, verificare nuovamente e pubblicare ricette; ultima priorità di implementazione (M6). Upload da file registrato come opzione da definire |
| 3 ottobre 2026, traduzioni | Confermati italiano e inglese britannico entrambi obbligatori per pubblicare una ricetta; traduzioni mancanti mantengono la scheda in bozza, anche per l'importazione |
| 3 ottobre 2026, ingredienti | Confermati elenco verificato degli ingredienti, quantità e unità quando applicabili e porzioni di riferimento come requisiti di pubblicazione anche per le ricette pregresse. Ammessi "q.b." espliciti; i dati mancanti mantengono la ricetta in bozza |
| 3 ottobre 2026, client MCP | Scelti Codex CLI, Claude Code, ChatGPT e Claude Desktop come client obiettivo della prima versione, con guida dedicata e verifica tecnica per ciascuno |
| 3 ottobre 2026, cancellazioni | Confermate le regole per cancellare utenti: protezione dell'ultimo amministratore dell'app, successore nelle famiglie con altri membri, eliminazione della famiglia dell'unico membro, conservazione delle ricette pubblicate e revoca degli accessi. Aggiunto al ruolo di amministratore della famiglia il diritto di eliminarla senza cancellare gli account dei membri |
| 3 ottobre 2026, eccezione MCP | Eliminazione delle famiglie riservata all'app web: MCP restituisce un URL e l'utente completa l'operazione nella pagina dedicata. La restrizione copre anche la cancellazione di account che comporterebbe l'eliminazione di una famiglia |
| 3 ottobre 2026, review avversariale | Riesame indipendente della revisione `e473472`: direzione di prodotto adatta al prototipo esplorativo, implementazione ancora subordinata alle decisioni e correzioni della sezione 17. Nessuna soluzione proposta dal revisore è automaticamente una decisione approvata |
| 4 ottobre 2026, linguaggio visivo definitivo | Approvato il linguaggio derivato dallo studio HelloFresh e rappresentato in `design/index.html`: guida vincolante in `design/design.md`, istruzioni per gli agenti e materiale approvato consolidato in `design/`. Il futuro prototipo deve riusare questa base; flussi e servizi restano soggetti alla specifica e ai piani successivi |
| 6 ottobre 2026, percorsi del prototipo | Concordati metodo per giri, ordine dei nove percorsi, primo giro su Fondamenta, Menu e Ricettario con tappa intermedia, prototipo SvelteKit con dati e operazioni simulate, tracciamento in `design/percorsi.md` e nei piani di giro |
| 6 ottobre 2026, preparazione del primo giro | Pasto passato alle 15:30 (pranzo) e alle 23:00 (cena); quarta voce della navbar per famiglia, account e ruoli; due varianti del componente voto da confrontare nella review |
| 6 ottobre 2026, tappa intermedia del prototipo | Eliminati stati e chiusura delle settimane: ogni settimana è modificabile, i pasti passati contano come cucinati salvo "non cucinato", il job genera soltanto. Calendario per scegliere qualunque giorno con menu; Spesa fuori dalla navbar, ingresso da decidere nel percorso Spesa |
| 6 ottobre 2026, "non cucinato" tolto | Ogni pasto passato conta come mangiato; un pasto sbagliato si corregge cambiandone il piatto o segnandolo libero. Tolto il campo `cooked` di `meal_slots`; lo storico del pianificatore usa tutti i pasti passati con ricetta |
| 6 ottobre 2026, secondo giro del prototipo approvato | Revisione dei pasti: niente avvisi di settimana; vince l'ultimo salvataggio senza conflitto; ultima modifica senza canale; scambio nella stessa settimana con piatto e nota; "non proporre più" che apre la scelta del sostituto; "proponimene altri" al posto di "proponimene un altro"; voto solo visualizzato nei suggerimenti; annullamento delle proprie modifiche; azioni dalla matita in un pannello nella scheda (porzioni, cambia ricetta, nota), con pasto libero, esclusione e scambio dentro "Cambia ricetta" |
| 6 ottobre 2026, terzo giro del prototipo approvato | Spesa: una lista per settimana con tutti i pasti, aperta dal Menu, senza scelta dei pasti, altre liste o archivio; persistente e condivisa, con spunte che valgono per "ce l'ho già" e "comprato", voci libere e modifica offline con coda locale; quantità che seguono i pasti, pezzi interi, unità di acquisto e tazze USA tramite equivalenze per ingrediente; voci distinte solo per prodotti diversi; esportazioni nel menu "…". Tolta la scorciatoia "solo quelli non ancora in lista" |
| 6 ottobre 2026, quarto giro del prototipo approvato | Famiglia e account: rientro dopo la rimozione solo con un link nuovo (R2); impostazioni tutte visibili tranne i pesi, con «Avanzate» e regole a modelli; wizard minimo (nome e unità) e prima generazione da oggi a domenica più la settimana successiva dopo mercoledì alle 20:00; vista «Tu» rinominata «Profilo», con cambio di famiglia; pagine dedicate per eliminare la famiglia e cancellare l'account con conferma a pulsante; pulsanti rossi per le azioni irreversibili; i suggerimenti rispettano le impostazioni della famiglia |
| 7 ottobre 2026, quinto giro del prototipo approvato | Curatela: pasti passati sulla versione con cui sono stati mangiati, oggi e futuri sulla corrente (R1); modifica tramite bozza di revisione; conflitti fra curatori rifiutati e risolti consapevolmente; archiviazione reversibile; ripristino di una versione aperta com'era, senza confronto; pubblicazione in un passo senza verifica esplicita; campi obbligatori per tipo di fonte; varietà degli ingredienti in testo libero con confronto normalizzato e consigli, istruzioni per l'agente; caricamento da file escluso per ora; avviso della versione solo ai curatori; percorso MCP consigliato rispetto al modulo |
| 7 ottobre 2026, sesto giro del prototipo approvato | MCP e Amministrazione dell'app: nessun agente simulato; selettore di lingua nel modulo della ricetta; pagina «Collega un agente» senza introduzione, con client a fisarmonica, comandi d'esempio verificati e agenti collegati da scollegare; schermata di autorizzazione nel browser; amministrazione dal Profilo con utenti e ruoli (conferma per nominare amministratori, ultimo amministratore bloccato, famiglie solo per nome e ruolo), cancellazione di un utente con le regole dell'account; inviti all'app per un'email con ruoli facoltativi, 7 giorni, uso singolo e revoca, senza ingresso in famiglie; ripristino dell'intero catalogo come nuova versione con archiviazione delle ricette successive, anteprima e copia prima del ripristino |
| 8 ottobre 2026, verifica dell'architettura | Dopo una challenge del piano e dell'architettura iniziali alla luce del prototipo: interfaccia in React (SPA con Vite, TanStack Router e Query) al posto di Svelte; strato unico di operazioni con contratto esplicito servito da Hono su Netlify, da cui derivano API web, OpenAPI e strumenti MCP (libreria del contratto aperta); MCP nella stessa app con il server OAuth 2.1 di Supabase e canale ricavato dal claim `client_id`; job con `pg_cron` verso il server, senza Edge Function né Deno; ricetta come documento con proiezioni; ripristino dell'intero catalogo a una data dallo storico, senza copie periodiche; spunte della spesa per ingrediente e varietà, cronologia delle bozze in tabella e fuso orario della famiglia nel modello. Poi confermata la generazione pigra come rete di sicurezza del job e aggiornato il prototipo (ripristino del catalogo scegliendo giorno e ora, con elenco dei ripristini da annullare). Campi bilingui restano una proposta; le fasi di rilascio diventano un punto aperto |
| 6 ottobre 2026, primo giro del prototipo approvato | Barra con mese e icone sopra i giorni; schede con footer a icone, foto 3:1 e fonte troncata sulla riga del tempo; stesso componente nel ricettario; voto in riga; scheda ricetta con titolo collegato alla fonte; filtri richiudibili con ordinamento invertibile e senza stagione; quantità non numeriche tradotte e obbligatorie per pubblicare; etichetta «Tu» confermata; bozze in testa al ricettario solo per i curatori; navbar con sole icone |

### 17. Review avversariale del 3 ottobre 2026

**Perimetro:** revisore indipendente con contesto nuovo, senza la conversazione di
progettazione; lettura integrale della specifica alla revisione
`e47347200045f1a82ad5b296fad4b95ead45f6f9`, confronto con la base `0ff8a66`, AGENTS,
README e dati pertinenti del progetto di origine. Il revisore ha lavorato in sola
lettura. I rilievi sostanziali sono stati ricontrollati nel testo e negli esempi
dell'origine prima di essere registrati qui.

**Verdetto:** pronto per un **prototipo esplorativo**, non pronto per l'implementazione.
La review non ha dimostrato incompatibilità che impongano di cambiare stack o rinunciare
a MCP. Il prototipo può servire proprio a confrontare le alternative ancora aperte;
non deve presentare come definitivi comportamenti che non sono stati concordati.

**Ripresa concordata con l'utente:** al termine della review del 3 ottobre è confermato
che il prossimo passo sarà iniziare dal prototipo. I casi emersi dalla review guideranno
la sua progettazione e le decisioni ancora aperte, prima dei nuovi piani del prodotto.

I rilievi seguenti sono **aperti**. Le raccomandazioni sono proposte di revisione e non
sostituiscono i requisiti confermati finché non viene concordata e integrata la soluzione.

**R1 — Impatto alto: versioni delle ricette e significato del ripristino.**
Sezioni 2, 5 e 8. Uno slot che conserva solo l'identità della ricetta potrebbe mostrare
ingredienti e dosi nuovi dopo una modifica del curatore, anche quando la famiglia ha
già fatto la spesa. Inoltre un backup precedente alla creazione di una ricetta non può
sostituire semplicemente il catalogo se menu e voti ormai la referenziano. Ripristinare
traduzioni o dati di ingredienti condivisi potrebbe cambiare altre ricette, mentre il
recupero singolo promette di non farlo. È una decisione di prodotto ancora aperta,
non un'impossibilità tecnica dimostrata. Occorre scegliere la versione usata dai pasti,
il destino delle ricette successive al backup e l'ambito delle dipendenze ripristinate.
**Quando:** rappresentare i casi in P0, chiudere la semantica prima dello schema M1.
**Decisione del 7 ottobre 2026 (quinto giro del prototipo), per la singola ricetta:** i
pasti passati usano la versione in vigore quando sono diventati passati, oggi e i pasti
futuri la corrente (sezione 5); il ripristino di una ricetta riporta solo i suoi campi e
le sue righe, non le entità condivise, e si rifiuta se non supera i controlli di oggi
(sezione 8). **Decisione del 7 ottobre 2026 (sesto giro), per l'intero catalogo:** le
ricette del backup sono ripubblicate come nuova versione e quelle successive al backup
archiviate, con i pasti che restano leggibili; le entità condivise (ingredienti)
tornano come nel backup, quelle nate dopo restano; anteprima e copia «Prima del
ripristino» (sezione 8).

**R2 — Impatto alto sul controllo degli accessi: rientro dopo rimozione.**
Sezione 7. Gli inviti familiari sono riutilizzabili per sette giorni: secondo il flusso
descritto, un membro rimosso potrebbe riaprire un invito ancora valido e rientrare.
L'esistenza di questo percorso deriva dalle regole scritte; l'aspettativa che la
rimozione debba impedirlo è un'inferenza da confermare con l'utente. Va deciso se la
rimozione richieda una nuova autorizzazione esplicita per tornare, anche in presenza di
più inviti validi. **Quando:** scenario in P0 e regola chiusa prima di M1.
**Decisione del 6 ottobre 2026 (quarto giro del prototipo):** la rimozione si registra
e nessun link creato prima di essa fa rientrare quella persona; serve un link nuovo.
Regola in sezione 7, tabella `family_removals` in sezione 2.

**R3 — Impatto medio: generazione su richiesta e chiusura delle settimane.**
Sezioni 2, 4 e 5. Il worker chiude la settimana precedente e la generazione su richiesta
usa la stessa funzione: eseguire letteralmente questo flusso il lunedì può anticipare
la chiusura rispetto al mercoledì previsto. Se tutte le esecuzioni di un mercoledì
falliscono, manca inoltre una regola per chiudere le settimane scadute più vecchie e
per rappresentarne lo stato. Raccomandazione: distinguere generazione richiesta e
chiusura di tutte le settimane effettivamente scadute, con condizioni proprie. Sono
da precisare anche il target della prima generazione e l'istante in cui un pasto passa.
**Quando:** comportamento visibile in P0; orchestrazione e recupero prima di M3.
**Aggiornamento del 6 ottobre 2026:** le chiusure delle settimane sono state eliminate
(sezione 2) e l'istante del pasto passato è deciso (sezione 5); resta aperta solo la
parte su generazione su richiesta e prima generazione.

**R4 — Impatto medio: mappature dell'import che i dati reali richiedono.**
Sezioni 3, 8 e 11. Nell'origine `pasta-tonno` e `lenticchie-comidista` risultano
`collaudata: true` senza apparizioni in `storico`; esistono inoltre ricette `casa` con
URL, mentre il nuovo tipo `home` indica assenza di fonte esterna. Conservare soltanto
voti, storico ed esclusioni perderebbe la familiarità iniziale; copiare il tipo senza
analizzarne la provenienza potrebbe perdere collegamenti. Il report delle ambiguità
deve coprire questi casi, senza inventare pasti passati o cambiare la fonte degli
ingredienti. Non è un errore di un import già implementato: è un requisito da precisare
nel contratto di import. **Quando:** prima dell'importazione M1; non blocca P0.

**R5 — Impatto basso, solo per il giudice opzionale: pasti liberi deducibili.**
Sezione 3. Trasmettere giorno e tipo di pasto di ogni ricetta permette di dedurre gli
slot liberi mancanti in una settimana completa, mentre il testo promette di non inviare
quali pasti sono liberi. Va chiarito se il divieto riguardi il testo libero oppure
anche la posizione degli slot; nel secondo caso occorre adeguare il payload.
**Quando:** prima dell'esperimento del giudice in M3; non blocca P0 o M1.

**Verifiche tecniche da portare nei piani, senza nuove decisioni implicite:**

- La revoca degli accessi richiesta dalla sezione 7 deve coprire anche token già
  emessi, letture del catalogo e sessioni MCP (8 ottobre 2026: le operazioni verificano
  a ogni richiesta utente e autorizzazione, sezione 1). La documentazione Supabase consultata
  dal revisore tramite Context7 precisa che eliminare un utente non invalida subito
  tutti i suoi JWT: la cancellazione dell'account non basta da sola a realizzare il
  requisito. [Gestione utenti Supabase](https://supabase.com/docs/guides/auth/managing-user-data).
- Il recupero applicativo del catalogo deve essere distinto dal ripristino dell'intero
  database, per rispettare l'indipendenza dei dati familiari richiesta in R1 (8 ottobre
  2026: il primo si ricava dallo storico, il secondo è dei backup della piattaforma).
  [Backup Supabase](https://supabase.com/docs/guides/platform/backups).
- Prima di M3 serve una classificazione unica di vincoli rigidi, obiettivi e deroghe:
  `weekly_max`, massimi degli intervalli e venerdì pesce devono avere esiti verificabili
  quando non soddisfacibili. I limiti di runtime dichiarati non sostituiscono la misura
  del carico reale del pianificatore.
- Restano da verificare effettivamente i quattro client MCP, il contesto web richiesto
  per eliminare famiglie, le esportazioni e i ritentativi. Il prototipo simulato non
  dimostra questi comportamenti tecnici.

**Aspetti risultati coerenti:** fonte unica dei requisiti; database autorevole;
separazione fra bozze e pubblicato; nuova validazione al momento della pubblicazione;
ruoli globali distinti da quelli familiari; eccezione MCP estesa alle cancellazioni
indirette; conversioni senza arrotondamenti cumulativi né equivalenze massa/volume
inventate; implementazione manuale differita deliberatamente a M6.

**Limiti della review:** nessuna implementazione o integrazione reale eseguita; nessuna
certificazione della compatibilità MCP o del deploy. Non sono stati rivalidati criteri
nutrizionali o prezzi dei fornitori AI. Le decisioni già elencate come aperte nella
sezione 15 non sono state automaticamente classificate come difetti.
