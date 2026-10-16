# Brief W12: Foto delle ricette (ondata 3, attività E, issue #39)

Segui `progetto/coordinamento/protocollo-worker.md` e, per la forma del lavoro verticale,
`progetto/coordinamento/brief/ondata2-comune.md` (proprietà dei file, migrazioni, MCP,
design, interfacce decise: valgono anche qui).

- **Branch:** `ondata3/foto-ricette` · **Worktree:** `.worktrees/foto`
- **Spec e piano:** `progetto/superpowers/specs/2026-10-16-foto-ricette.md`,
  `progetto/superpowers/plans/2026-10-16-foto-ricette.md`
- **Specifica principale:** Parte 1 («Il ricettario», «Usare l'app attraverso il proprio
  agente»), sezioni 1 (Worker, PWA, precache e Cache Storage, dati sul dispositivo,
  modifiche solo additive), 2 (`recipes` e tabelle collegate), 8 (documento ricetta:
  «tag, foto, stato e date stanno fuori dal documento»; curatori; esportazione notturna
  in R2 e ripristino), 13 (parità MCP), 14 (schede con fotografia quando disponibile,
  banner 3:1) e 15 (riga «Foto delle ricette»). Piano generale: «Ordine dell'ondata 3»
  (riga E) e «Interfacce decise».
- **Issue:** #39 (domande aperte, da chiudere con questa PR).
- **Design e prototipo:** `design/design.md`, `design/index.html`, `design/assets/` (foto
  di riferimento), `design/percorsi.md` (primo giro: schede con foto 3:1; quinto giro:
  gestione del ricettario); in `prototype/` le schede del menu e del ricettario e la
  scheda ricetta.
- **Codice da toccare:** `web/src/components/RecipeCard.tsx` (oggi
  `RecipeCard.test.tsx` verifica che non ci siano immagini), scheda ricetta, viste della
  ricetta (`contract/src/recipes/views.ts`, `server/src/recipes/views.ts`), gestione del
  ricettario lato server e strumenti MCP dell'area `catalogue`, esportazione notturna
  (`server/src/`, binding `BACKUPS` in `server/wrangler.jsonc`), service worker della SPA.

## Obiettivo

Le ricette possono avere una foto. Si vede nelle schede del menu e del ricettario e nella
scheda ricetta, come nel design approvato; senza foto le schede restano come oggi. I
curatori aggiungono, sostituiscono e tolgono la foto dall'app e tramite il proprio agente.

## Orientamento dell'utente (16 ottobre 2026)

L'utente ha accettato queste proposte del coordinatore. Nel brainstorming le dettagli e le
verifichi. Se una non regge, la riporti al coordinatore con le alternative.

1. **Archiviazione:** un bucket R2 nuovo, separato da `cosasimangia-backups`, servito dal
   Worker. Niente Supabase Storage, che sul piano gratuito ha 1 GB.
2. **Chi carica:**
   - i curatori dall'app, anche scattando la foto con il telefono;
   - l'agente via MCP, passando l'indirizzo di un'immagine (per esempio quella della pagina
     della fonte, `og:image` o schema.org).
3. **Ridimensionamento:** le foto caricate dall'app si ridimensionano e si comprimono nel
   browser prima del caricamento, senza librerie.
4. **Provenienza:** l'app è per uso familiare. Con ogni foto si salva da dove viene
   (scattata dalla famiglia, oppure il sito d'origine) e si mostra in piccolo.
5. **Offline:** le foto già viste restano disponibili senza rete con una cache a runtime.
   Non vanno nel precache.
6. **Backup:** l'esportazione notturna include i riferimenti alle foto, non le immagini.
   Una foto tolta o sostituita resta nel bucket per un periodo di conservazione, così un
   ripristino non lascia riferimenti rotti.

## Decisioni da prendere nel brainstorming

Quelle di prodotto le porti all'utente tramite il coordinatore. Le altre le decidi tu nella
spec, motivandole.

- **Foto via MCP:**
  - come il server scarica e controlla l'immagine dall'indirizzo: tipo, dimensione massima,
    tempi, redirect, indirizzi interni non raggiungibili;
  - come si evita di salvare originali enormi senza una libreria nel Worker. Verifica con
    Context7 cosa offrono Workers e Cloudflare Images (trasformazioni, costi, piano a
    pagamento da 5 $) e proponi la via meno costosa.
- **Accesso alle immagini:** l'app si autentica con un token, non con un cookie, quindi un
  `<img>` non lo manda. Scegli fra chiavi non indovinabili servite senza autenticazione e
  URL firmati a scadenza. Il ricettario è unico e non contiene dati delle famiglie: valuta
  il rischio e motivalo, tenendo conto della regola sui dati sul dispositivo (sezione 1).
  Includi l'effetto della scelta su cache e intestazioni (`Cache-Control`, CSP).
- **Modello dei dati** (fuori dal documento ricetta, sezione 8):
  - colonna su `recipes` oppure tabella dedicata;
  - versioni e bozze: una foto cambiata crea una versione o no?
  - una bozza può avere la foto prima della pubblicazione?
  - cosa succede all'archiviazione e al ripristino della singola ricetta.
- **Dove si aggiunge dall'app** (prodotto): il modulo manuale del ricettario non esiste
  ancora (ultima priorità). Proponi il punto più semplice, per esempio un comando
  «Aggiungi foto» nella scheda ricetta, visibile solo ai curatori. Proponi anche come si
  sostituisce o si toglie la foto.
- **Formati e misure:** formato salvato (WebP o JPEG), lato massimo, peso indicativo; una
  o più misure per schede e scheda ricetta.
- **Conservazione** delle foto tolte o sostituite: durata e meccanismo (cron già esistente
  o regola del ciclo di vita di R2).
- **Una sola PR** per tutta l'attività. Il piano ordina i compiti in modo che ogni commit
  lasci i test verdi.

## Vincoli dal coordinamento

- **Dipendenze:** al minimo. Ogni dipendenza nuova dice cosa sostituisce e cosa costa
  farne a meno, e la approva il coordinatore.
- **Permessi:** solo i curatori (ruolo dell'app) aggiungono, sostituiscono o tolgono foto.
  Lo controlla il server, come per le altre operazioni del ricettario. Tutti gli utenti
  con accesso al ricettario le vedono.
- **MCP:** ogni operazione con il suo strumento, salvo `webOnly` motivato (sezione 13). Il
  caricamento di un file dall'app può restare solo web; via MCP vale l'indirizzo.
- **Infrastruttura:** il bucket di produzione e il binding si creano nel rilascio, non li
  crei tu. La spec elenca i passi esterni (nome del bucket, giurisdizione `eu`, regole del
  ciclo di vita) per il runbook del coordinatore. In locale usa il simulatore di R2 di
  Wrangler o Miniflare, come per l'esportazione.
- **Migrazioni** solo additive (sezione 1). Dichiara nella spec tabelle, colonne e
  funzioni nuove. Controlla che la versione non collida con quelle già su `main`.
- **Design:** usa token e componenti di `design/design.md` e confronta il risultato con gli
  screenshot in `design/references/hellofresh/`. Le schede senza foto restano identiche a
  oggi. I testi nuovi vanno in italiano e inglese britannico.
- **Test:**
  - pgTAP per lo schema;
  - server per le operazioni: permessi, tipi e dimensioni rifiutati, indirizzo non valido o
    irraggiungibile, sostituzione e rimozione, esportazione con i riferimenti;
  - SPA sullo stack locale: caricamento dal telefono, schede con e senza foto, offline dopo
    una visita.

  Verifica l'interfaccia con la skill agent-browser, anche a larghezza da telefono. Prove
  locali senza la produzione (`protocollo-worker.md`, «Prove sullo stack locale»). Annota
  nella spec cosa resta da provare a mano sull'iPhone, per esempio la scelta della
  fotocamera o della libreria fotografica dalla PWA installata.
- **Rilascio in produzione:** non lo fai tu. Lo fa il coordinatore dopo il merge.

## Fuori perimetro

- Foto per le 56 ricette già importate: niente ricerca o scaricamento in blocco. Le
  aggiungono i curatori una per volta. Un eventuale riempimento in blocco tramite agente
  sarà una decisione distinta.
- Modulo manuale del ricettario, galleria con più foto per ricetta, foto dei pasti liberi.
- Email (attività D), Google, ripristino dell'intero catalogo, PDF della spesa.
