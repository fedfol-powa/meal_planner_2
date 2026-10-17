# Ricetta da un link: descrizione dell'evolutiva

Stato: descrizione dal brainstorming del 17 ottobre 2026 fra l'utente e il coordinatore.
Precede il prototipo e la spec di dettaglio, che la estendono. Fonti: specifica
principale (sezioni 8, 10, 12, 13), `design/design.md`, `design/percorsi.md` (percorso 6).

## Perché

Il curatore trova una ricetta interessante, di solito sul telefono, e vuole aggiungerla al
ricettario partendo dal link, senza ricopiarla. Oggi deve passare dall'agente MCP, in
pratica dal computer con Claude Code. L'evolutiva porta l'inizio del lavoro nell'app e lo
consegna all'agente con un tocco, anche dal telefono.

Successo: dal telefono, in meno di un minuto, il curatore incolla il link, ha la bozza
salvata e apre Claude con le istruzioni pronte; Claude completa la bozza e la pubblica
dopo il suo «sì» in chat.

## Obiettivi

- Creare una bozza da un link qualsiasi, nell'app e via MCP.
- Estrarre dalla pagina tutto quello che si può senza AI, e salvare comunque la bozza
  quando non si estrae nulla.
- Passare la bozza all'agente con istruzioni già pronte: «Completa con Claude» e
  «Copia le istruzioni».

## Non obiettivi

- Nessuna AI dentro l'app o nel server: resta valida la decisione del quinto giro
  («niente compilazione, classificazione o traduzione automatica tramite modelli» nel
  percorso manuale). Completamento, collegamento al catalogo, traduzioni e attributi li
  fa l'agente del curatore, come oggi.
- Nessuna modifica dei campi della bozza nell'app: resta al modulo manuale, che rimane
  l'ultima priorità dell'ondata 3.
- Nessuna pubblicazione dall'app: si pubblica in chat con l'agente, dopo il «sì»
  esplicito del curatore sulla scheda completa (decisione dell'utente).
- Nessuna estrazione dal parlato dei video, né dalle didascalie in testo libero di
  Instagram, TikTok o YouTube (decisione dell'utente: estrazione automatica solo da blog e
  siti; per gli altri link basta il link, più il titolo se si trova).
- Nessuna integrazione nel menu Condividi di iOS: Safari non supporta il Web Share Target
  per le app web installate.

## Anti-obiettivi

- Un ingrediente che non c'è nella fonte. Le righe estratte sono quelle della pagina,
  conservate come scritte (`source_text`); né l'app né le istruzioni per l'agente
  autorizzano a dedurre ingredienti dal nome del piatto o dalla foto (regola di
  `AGENTS.md`).
- Una ricetta pubblicata senza il «sì» del curatore.
- Un link che non produce nulla e lascia il curatore senza sapere cosa fare.

## Il percorso

1. **Ingresso.** Nel Ricettario, solo per i curatori. Nell'app di oggi un'azione di
   aggiunta non c'è (esiste solo nel prototipo, «Nuova ricetta»; il modulo manuale non è
   fatto): *mia scelta*, l'evolutiva introduce una sola azione «Aggiungi ricetta» che per
   ora apre direttamente il campo del link e che, quando arriverà il modulo manuale,
   diventerà il punto in cui scegliere fra link e modulo (memoria dell'utente: una sola
   azione principale per schermata). Campo per incollare il link;
   *mia scelta*: se gli appunti contengono già un indirizzo l'app lo propone, senza
   leggerli senza un gesto del curatore.
2. **Link già usato.** Se l'indirizzo, normalizzato, è già la fonte di una ricetta o di
   una bozza aperta, l'app lo dice e porta a quella invece di crearne una copia
   (*mia scelta*; la normalizzazione la decide la spec).
3. **Lettura della pagina, dal server, senza AI**, al primo livello che riesce:
   - **ricetta completa** dal JSON-LD `schema.org/Recipe` (tipico di blog e siti di
     cucina): nome, descrizione, porzioni, durata, righe degli ingredienti come scritte,
     immagine;
   - **metadati della pagina** (Open Graph, `<title>`): titolo e, se ci sono,
     descrizione e immagine. L'utente si aspetta che il titolo arrivi quasi sempre;
   - **solo il link**, se la pagina non si raggiunge, è bloccata o non ha nulla di utile.
4. **La bozza nasce subito, già salvata**, senza una schermata di conferma (decisione
   dell'utente). Fonte `youtube` per i link di YouTube, `web` per tutti gli altri
   (*mia scelta*, sui tipi di fonte che esistono già). Se la pagina ha un'immagine, è la
   foto della bozza, con i vincoli delle foto di oggi (dimensione minima e così via);
   il curatore la cambia o la toglie come oggi (*mia scelta*). **Lingua** (*mia
   scelta*): nome e descrizione vanno nel campo della lingua della pagina se è italiano o
   inglese (da `inLanguage` del JSON-LD o da `lang` della pagina), altrimenti nel campo
   italiano, e le istruzioni chiedono all'agente di tradurli; le righe degli ingredienti
   restano come scritte nella fonte (`source_text`), in qualunque lingua.
5. **La bozza nell'app** mostra cosa è stato estratto, da quale livello, e un elenco
   chiaro di cosa manca per pubblicare (ingredienti da collegare al catalogo, testi in
   inglese britannico, attributi del pianificatore, porzioni…). Azione in primo piano
   «Completa con Claude»; «Copia le istruzioni» come seconda azione, per ChatGPT o per
   un agente sul computer. *Mia scelta*: l'elenco di cosa manca e i due pulsanti valgono
   per tutte le bozze nuove, comprese quelle create via MCP o importate; le bozze di
   revisione di una ricetta pubblicata restano come oggi. Il livello di estrazione si
   mostra solo per le bozze nate da un link.
6. **«Completa con Claude»** apre `https://claude.ai/new?q=<istruzioni>`; sull'iPhone
   apre l'app Claude con il testo già scritto (verificato dall'utente il 17/10). Le
   istruzioni contengono almeno: l'id della bozza, il link della fonte, cosa manca, il
   rimando a `catalogue.getGuide`, la richiesta di leggere gli ingredienti dalla fonte
   quando non sono stati estratti, il divieto di dedurli e la richiesta di mostrare la
   scheda completa e pubblicare solo dopo il «sì». Il testo esatto lo decide la spec,
   nelle due lingue dell'interfaccia.
7. **L'agente** riprende la bozza con gli strumenti di oggi (`catalogue_getDraft`,
   `catalogue_saveDraft`, ricerca e creazione degli ingredienti, `catalogue_publish`…),
   la completa e la pubblica dopo il «sì» in chat.

**Via MCP** c'è lo stesso ingresso: uno strumento che crea la bozza da un link con la
stessa estrazione (nome indicativo `catalogue.createDraftFromUrl`), così dal computer si
incolla il link direttamente all'agente. Vale la regola trasversale: ogni operazione
dell'app è anche MCP.

## Fatti verificati il 17 ottobre 2026

- L'app Claude per iPhone usa il nostro server MCP (`https://cosasimangia.app/mcp`)
  dopo aver aggiunto il connettore personalizzato su claude.ai; ha risposto con le
  ricette vere del ricettario (prova dell'utente). Il connettore si aggiunge dal web, non
  dall'app.
- `https://claude.ai/new?q=…` sull'iPhone apre l'app Claude con il testo già scritto
  (prova dell'utente). Non è un indirizzo documentato da Anthropic: può cambiare, quindi
  «Copia le istruzioni» resta sempre disponibile.
- ChatGPT: secondo il centro assistenza di OpenAI (ottobre 2026), server MCP
  personalizzati con scrittura solo sui piani Business, Enterprise ed Edu (Pro in sola
  lettura), e l'uso dal telefono sembra non supportato; non provato. Per questo niente
  pulsante dedicato, solo «Copia le istruzioni».

## Vincoli

- Specifica principale: campi obbligatori per pubblicare (sezione 10), MCP come seconda
  interfaccia di ogni operazione, lingue italiano e inglese britannico, bozze condivise
  fra curatori con i conflitti di oggi.
- La lettura delle pagine avviene dal Worker: indirizzi pubblici `http`/`https` soltanto,
  nessuna rete interna, limiti di tempo, dimensione e redirect, e un limite di frequenza
  per curatore (le soglie le decide la spec).
- Le ricette non hanno un procedimento: i passaggi della fonte non si importano, la
  ricetta rimanda al link come oggi.
- Dipendenze al minimo: per leggere il JSON-LD e i metadati bastano le API del Worker
  (per esempio `HTMLRewriter`); ogni libreria nuova va motivata e approvata.
- Nessuna prova verso la produzione con credenziali di prova; prova del pulsante e
  del connettore sull'iPhone a carico dell'utente.

## Cosa resta al costruttore (prototipo e spec)

- Il prototipo in `prototype/` mostra ingresso, link già usato, i tre livelli di
  estrazione (con dati demo), la bozza con l'elenco di cosa manca, i due pulsanti e il
  testo delle istruzioni; varianti da confrontare nel pannello Prova dove la scelta è
  visiva (memoria dell'utente). Nessun servizio reale.
- La spec di dettaglio decide: come la bozza conserva le righe estratte non ancora
  collegate a un ingrediente del catalogo, e come le mostra il prototipo e l'app; la
  conversione di porzioni e durata dal formato di schema.org; la normalizzazione degli
  indirizzi per i doppioni; le soglie di lettura; il testo esatto delle istruzioni;
  come si aggiorna `catalogue.getGuide`; la foto della bozza visibile nell'app prima
  della pubblicazione (oggi la bozza nell'app è in sola lettura, sezione 10).
