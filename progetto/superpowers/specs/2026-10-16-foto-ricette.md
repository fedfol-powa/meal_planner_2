# W12: Foto delle ricette (ondata 3, attività E, issue #39)

Creato: 16 ottobre 2026
Stato: spec di dettaglio dopo il brainstorming con il coordinatore (domande 1 e 2 e
conferma dell'agente, risposte dell'utente del 16 ottobre 2026) e una verifica interna di
un costruttore indipendente (foto delle bozze servite, ricette da libro); corretta dopo la
revisione di spec e piano (`revisioni/w12-spec-piano.md`, rilievi 1–6, e decisioni del
coordinatore in `messaggi/w12-01-revisione-spec.md`) e dopo la seconda revisione
(`revisioni/w12-spec-piano-2.md`, rilievi 1–4) e dopo la terza (`revisioni/w12-spec-piano-3.md`,
formato della risposta `413`).
Branch: `ondata3/foto-ricette` · Worktree: `.worktrees/foto`

Subordinata alla specifica principale
(`progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`: Parte 1 «Il ricettario» e
«Usare l'app attraverso il proprio agente»; sezioni 1, 2, 8, 13, 14 e 15), al piano
generale (`progetto/superpowers/plans/2026-10-11-piano-generale.md`, «Ordine dell'ondata 3»,
riga E, e «Interfacce decise») e al brief `progetto/coordinamento/brief/w12-foto-ricette.md`.

## Obiettivo

Le ricette possono avere una foto. Si vede nelle schede del menu e del ricettario (banner
3:1) e nella scheda ricetta (16:9), come nel design approvato; senza foto le schede restano
identiche a oggi. I curatori aggiungono, sostituiscono e tolgono la foto dalla scheda
ricetta dell'app, anche scattandola con il telefono, e tramite il proprio agente,
passando l'indirizzo di un'immagine.

## Perimetro

Dentro:

- una foto per ricetta, archiviata in un bucket R2 nuovo e servita dal Worker;
- caricamento dall'app (scheda ricetta, solo curatori) con ridimensionamento nel browser;
- impostazione da un indirizzo via MCP, con scaricamento controllato e ridimensionamento
  nel Worker tramite il binding Images di Cloudflare;
- rimozione e sostituzione, dall'app e via MCP;
- foto nelle viste delle ricette e nelle schede (menu, ricettario, suggerimenti della
  revisione dei pasti, scheda ricetta);
- cache a runtime delle foto già viste nel service worker;
- riferimenti alle foto nell'esportazione notturna e conservazione illimitata degli oggetti;
- guida all'agente aggiornata.

Fuori (dal brief): foto per le 56 ricette importate (le aggiungono i curatori una per
volta), modulo manuale del ricettario, più foto per ricetta, foto dei pasti liberi,
email, Google, ripristino dell'intero catalogo, PDF della spesa. **Niente provenienza
della foto** (decisione dell'utente del 16 ottobre 2026, domanda 2): non si salva né si
mostra da dove viene; supera il punto 4 dell'orientamento del brief.

## 1. Decisioni di prodotto (brainstorming)

1. **Dove si gestisce nell'app** (domanda 1, proposta approvata dall'utente con una
   precisazione): aggiungere, sostituire e togliere la foto si fa **solo dalla scheda
   ricetta aperta** (`RecipePage`), mai dalle schede compatte del menu o del ricettario,
   che restano senza comandi per la foto.
   - Ricetta senza foto: il curatore vede in cima alla scheda ricetta, sotto
     l'intestazione, un pulsante bordato «Aggiungi foto» / «Add photo». Apre il
     selettore di file del telefono (`<input type="file" accept="image/*">`), che
     sull'iPhone offre «Scatta foto» e «Libreria foto». Gli altri utenti non vedono nulla.
   - Ricetta con foto: sulla foto della scheda ricetta, nell'angolo in alto a destra, un
     pulsante a icona «Foto» / «Photo» visibile solo ai curatori. Apre il foglio dal basso
     dell'app (`BottomSheet`) con due righe: «Sostituisci la foto» / «Replace photo»
     (stesso selettore) e «Togli la foto» / «Remove photo», con una conferma nel foglio
     («Togliere la foto?» con «Togli» e «Indietro»).
   - Durante il caricamento il pulsante mostra lo stato («Caricamento…» / «Uploading…»)
     ed è disabilitato; un errore compare nel foglio o sotto il pulsante con il testo
     dell'errore (sezione 5). Nessun aggiornamento ottimistico: la foto appare quando il
     server conferma e la vista si rilegge.
2. **Provenienza** (domanda 2, decisione dell'utente): nessuna. Né campo né riga «Foto
   di…». Con ogni foto si salvano solo chi l'ha caricata, quando e da quale canale, per lo
   storico dei curatori; nell'app non si mostrano.
3. **Agente** (domanda 2, decisione dell'utente: «più libertà»): l'agente può prendere
   l'immagine da qualunque sito, partendo di norma dalla pagina della fonte della ricetta
   (`og:image` o l'immagine della ricetta in schema.org) quando c'è. La guida chiede di
   mostrare al curatore l'immagine scelta e di impostarla solo dopo un sì esplicito, come
   per la pubblicazione (confermato dall'utente il 16 ottobre 2026). Per le ricette di casa o da libro l'agente può proporre
   un'immagine trovata altrove, sempre con la conferma, oppure lasciare che il curatore la
   scatti dall'app.

## 2. Modello dei dati

**Tabella dedicata, non una colonna su `recipes`** (scelta tecnica): la foto ha una vita
propria: lo **storico** delle sostituzioni e rimozioni, l'**attribuzione** (chi e
quando, da quale canale), l'**idempotenza** per `id` scelto dal client e
l'individuazione della **foto corrente** con un indice univoco parziale. Una colonna su
`recipes` perderebbe storia e attribuzione e non darebbe un'identità alla richiesta da
ripetere. Gli oggetti in R2 non si cancellano mai in automatico (sezione 7); un'eventuale
pulizia futura userà anche questo storico, ma solo dopo aver verificato i riferimenti di
tutte le esportazioni conservate.

Migrazione `supabase/migrations/20261016110000_recipe_photos.sql` (la più recente su
`main` è `20261016100000_family_management.sql`; il coordinatore controlla le collisioni).

`app.recipe_photos`:

| Colonna | Tipo | Note |
|---|---|---|
| `id` | `uuid` pk | scelto dal client (idempotenza, sezione 1 della specifica) |
| `recipe_id` | `uuid` not null, fk `app.recipes(id)` | |
| `storage_key` | `text` not null unique | chiave dell'oggetto in R2, sezione 3; check sulla forma `^photos/[A-Za-z0-9_-]{22}\.webp$` |
| `content_type` | `text` not null | oggi solo `image/webp` (check) |
| `width`, `height` | `int` not null, > 0 | misure del file salvato |
| `bytes` | `int` not null, > 0 | |
| `created_by` | `uuid` null, fk `auth.users(id)` `on delete set null` | come le altre colonne d'autore del ricettario (sezione 8, cancellazione dell'account) |
| `created_at` | `timestamptz` not null default `clock_timestamp()` | |
| `channel` | `text` not null, check in (`web`, `mcp`), come le altre tabelle con canale | |
| `removed_at` | `timestamptz` null | sostituita o tolta |
| `removed_by` | `uuid` null, fk `auth.users(id)` `on delete set null` | |

- Indice univoco parziale su `recipe_id` where `removed_at is null`: **al più una foto
  corrente per ricetta**. Righe mai cancellate fisicamente (come bozze e versioni).
- Check: `removed_by` solo con `removed_at`; `removed_at >= created_at`.
- **RLS**, sullo stesso modello delle tabelle del catalogo
  (`20261011100200_catalogue.sql`): `select` per `authenticated` sulle foto delle ricette
  che l'utente può leggere (la policy si appoggia a quella di `recipes`: chi non vede la
  ricetta non vede la foto); scritture solo con `app.has_role('recipe_curator')`:
  `insert` e `update` limitato alle colonne `removed_at` e `removed_by`; nessun `delete`.
  `app_backup` legge tutto (BYPASSRLS, sola lettura, già previsto). `app_job` nessun
  accesso.
- **Funzione per la rotta pubblica** `app.served_photo(p_key text)` `security definer`,
  `EXECUTE` solo ad `anon`: restituisce `content_type` e `bytes` se la chiave è di una
  foto **corrente** (`removed_at is null`), di qualunque stato della ricetta, bozze
  comprese, altrimenti nessuna riga. È l'unico accesso di `anon` alla tabella. Le bozze
  sono comprese perché l'URL di una foto di bozza arriva solo ai curatori (via MCP o
  `draftView`) e deve aprirsi, così l'agente può far vedere al curatore la foto
  impostata; la chiave resta non indovinabile come le altre.
- **Contatore del ricettario:** trigger su `recipe_photos` (insert e update) che chiama
  `app.bump_catalogue_version()`; le letture delle ricette dichiarano già
  `reads: ['catalogue']` (ricettario, scheda, menu, spesa), quindi le copie sul
  dispositivo si rinnovano. Una foto di una bozza fa crescere il contatore lo stesso:
  un'invalidazione in più, ammessa dalla regola dei contatori.
- **Lucchetto:** impostare o togliere la foto blocca prima la riga di `app.recipes`
  (`select … for update`), poi scrive in `recipe_photos`. Rispetta l'ordine dei lucchetti
  della sezione 1 («il resto» dopo le righe del catalogo) e serializza due sostituzioni
  concorrenti della stessa ricetta: vince l'ultima che arriva, l'altra resta nello storico
  come sostituita.

**Versioni e bozze** (scelte tecniche, coerenti con la sezione 2 della specifica: «tag,
foto, stato e date stanno fuori dal documento»):

- Cambiare la foto **non crea una versione** e non apre una bozza: la foto è della
  ricetta, non della versione. I pasti passati mostrano la foto attuale (la foto non
  cambia ciò che si è mangiato).
- Una **bozza nuova può avere la foto** prima della pubblicazione (la riga di `recipes`
  esiste già): via MCP subito, dall'app no, perché la bozza nell'app è una pagina in sola
  lettura senza `RecipePage`. Le viste non mostrano la foto finché la ricetta non è
  pubblicata (le viste di una ricetta mai pubblicata restano nome e descrizione; le schede
  delle bozze nel design non hanno foto).
- **Archiviazione:** la foto resta legata alla ricetta; la ricetta archiviata, quando la si
  legge da un pasto, la mostra; riportata nel ricettario la ritrova.
- **Ripristino di una versione:** non tocca la foto.
- **Ripristino dell'intero catalogo** (futuro, fuori perimetro): le foto non fanno parte
  dello storico ricostruibile; da decidere con quell'attività (annotato fra le decisioni
  da riportare).

## 3. Archiviazione e accesso alle immagini

**Bucket R2 nuovo**, `cosasimangia-photos`, giurisdizione `eu`, privato (nessun accesso
pubblico di R2, nessun dominio `r2.dev`), binding `PHOTOS`. Separato da
`cosasimangia-backups`: diritti, conservazione e contenuto diversi.

**Chiave dell'oggetto:** `photos/<22 caratteri base64url>.webp`, cioè 128 bit casuali
generati dal Worker con `crypto.getRandomValues` a ogni caricamento (mai dal client: l'`id`
della riga lo sceglie il client per l'idempotenza, la chiave no). Ogni sostituzione crea
una chiave nuova; un oggetto non si riscrive mai.

**Accesso: chiavi non indovinabili servite senza autenticazione, non URL firmati**
(scelta tecnica, motivata):

- L'app si autentica con un token, che un `<img>` non manda. Gli URL firmati a scadenza
  cambierebbero nel tempo: rompono la copia delle viste sul dispositivo (una vista salvata
  porterebbe URL scaduti, contro la regola della sezione 1 che mostra subito la copia
  all'apertura, anche offline) e la cache del service worker, che si basa su URL stabili.
- Le foto sono **del ricettario, non dati di una famiglia**: una foto di una ricetta è
  visibile a ogni utente con accesso al ricettario. Il rischio residuo di una chiave non
  indovinabile è che chi ha avuto l'URL lo passi a terzi: per una foto di un piatto è
  accettabile. Una foto scattata in casa può mostrare un ambiente domestico: lo si
  mitiga servendo solo le foto **correnti** (sotto), così una foto tolta non si scarica
  più dal Worker. Restano due limiti dichiarati: le copie già salvate fuori dall'app
  (un'immagine scaricata o inoltrata da qualcuno che l'ha vista) non sono revocabili, e
  la cache delle foto di un dispositivo dove la foto era già stata vista la conserva fino
  all'uscita dall'account o all'espulsione per il tetto (sezione 7).
- **Ricette da libro:** la rotta serve anche le foto delle ricette di un libro, che il
  ricettario propone solo alle famiglie che hanno quel libro. Quel limite riguarda quali
  ricette si propongono, non dati riservati: la ricetta stessa resta nel ricettario
  unico e una foto del piatto non è un dato della famiglia. L'URL arriva comunque solo a
  chi vede la ricetta (viste sotto RLS e controllo dei libri di `loadContents`).
- 128 bit casuali non si indovinano; il bucket non si elenca dall'esterno.

**Rotta `GET /photos/<chiave>`** nel Worker (aggiunta a `run_worker_first` in
`server/wrangler.jsonc` e alla tabella delle rotte della sezione 1):

1. limitatore per IP con un binding `ratelimit` nuovo, `PHOTO_READ_LIMIT`
   (`namespace_id` `9103`, 300 richieste ogni 60 s: una pagina del ricettario con 60 schede
   resta molto sotto); oltre, `429`;
2. forma della chiave validata (stessa espressione del check), altrimenti `404`;
3. transazione breve nel ruolo `anon` con `app.served_photo(chiave)`: nessuna riga →
   `404`. Così una foto tolta o sostituita non si serve più, e dopo un ripristino da
   esportazione torna servita se il database la indica di nuovo come corrente;
4. `PHOTOS.get(chiave)`: oggetto mancante → `404` con un log di errore
   (`photo_object_missing`);
5. risposta con il corpo di R2 e le intestazioni:
   - `Content-Type` dal database;
   - `Cache-Control: private, no-store` (rilievo 2 della revisione, decisione del
     coordinatore): la risposta non entra nella cache HTTP del browser né in cache
     condivise, che l'app non può svuotare all'uscita e che continuerebbero a servire una
     foto tolta. L'offline lo garantisce **solo** la cache esplicita del service worker
     (sezione 7): la Cache API non applica le direttive HTTP e la chiave è immutabile,
     quindi lì vale «prima la cache, poi la rete». Senza service worker attivo (prima
     visita, browser senza supporto) ogni apertura scarica di nuovo la foto: costo
     accettato;
   - `X-Content-Type-Options: nosniff`;
   - `Content-Security-Policy: default-src 'none'; sandbox` (difesa se l'URL si apre
     direttamente);
   - `Cross-Origin-Resource-Policy: same-origin` (l'immagine si incorpora solo
     dall'app; non ostacola un agente che scarica l'URL dal proprio processo, né il
     curatore che lo apre come pagina; impedisce solo di incorporarla in pagine di altri
     siti, compresi i client degli agenti nel browser, che possono comunque mostrare il
     link);
   - `ETag` dell'oggetto; `HEAD` ammesso con le stesse regole.

Errori della rotta in JSON come le altre rotte del server (`not_found`, `rate_limited`).

**CSP dell'app:** oggi l'app non ha una Content-Security-Policy; le foto sono della stessa
origine, quindi una futura `img-src 'self'` le ammette senza eccezioni. Nessuna modifica.

**Costo:** R2 ha 10 GB gratuiti al mese; 1.000 foto da circa 250 KB fanno 250 MB.
Le letture dalla rotta passano dal Worker (piano a pagamento già attivo); con la cache del
service worker ogni dispositivo scarica una foto una volta per sessione.

## 4. Formati, misure e ridimensionamento

**Formato salvato: WebP, lato lungo al più 1600 px, qualità 80**: peso indicativo 150–350 KB. **Una sola misura** per schede e scheda
ricetta: il banner 3:1 di una scheda larga 400 px CSS su uno schermo a densità 3 chiede
1200 px di larghezza; la scheda ricetta 16:9 su desktop circa 720 px CSS a densità 2,
1440 px. Più misure moltiplicherebbero trasformazioni e oggetti senza guadagno sensibile
per pochi utenti.

**Tutto passa dal binding Images** (documentazione Cloudflare consultata con Context7 il
16 ottobre 2026): `env.IMAGES.input(stream).transform({ width: 1600, height: 1600, fit:
'scale-down' }).output({ format: 'image/webp', quality: 80 })`, preceduto da
`env.IMAGES.info(stream)` (gratuito) per formato e misure.

- **Perché il binding e non una libreria:** il Worker non ha un decodificatore di
  immagini; una libreria WebAssembly (per esempio una build di libvips o di un
  codificatore WebP) peserebbe megabyte nel bundle e CPU per richiesta. Il binding non è
  una dipendenza npm.
- **Costo:** il piano Images Free comprende 5.000 trasformazioni uniche al mese per le
  immagini che non stanno in Cloudflare Images (il nostro caso, R2); oltre, le nuove
  trasformazioni falliscono con l'errore `9422` senza addebiti. Facciamo **una
  trasformazione per caricamento**, mai alla lettura: il limite non si avvicina. Il piano
  Images Paid non serve. La via meno costosa è questa: trasformare una volta e salvare il
  risultato, invece di trasformare a ogni richiesta (`cf.image` su `fetch` o URL
  `/cdn-cgi/image/`), che conterebbe una trasformazione per variante e richiederebbe una
  zona con il dominio.
- **Esito del binding:** un'immagine che `info` o `input` non decodificano → `invalid` sul
  campo dell'immagine con il codice `photo_unreadable`. Il limite mensile raggiunto (errore
  `9422` nel messaggio dell'eccezione del binding) → `internal` con il log
  `photo_images_limit` (gli altri errori del servizio → `internal` con
  `photo_images_failed`). In ogni caso nessun oggetto scritto in R2, nessuna riga, e la
  foto precedente resta corrente (rilievo 3 della revisione, provato nei test).
- **In locale:** `wrangler dev` offre una versione ridotta del binding (larghezza,
  altezza, rotazione, formato), sufficiente. Nei test in Node il binding si sostituisce
  con un'implementazione finta iniettata (stesso modo dell'env finto dei test del server)
  che legge le misure dall'intestazione del file e restituisce un WebP di prova.
- **Metadati:** le opzioni di `transform` del binding non hanno il parametro `metadata`
  degli URL di trasformazione (tipi di `@cloudflare/workers-types` verificati il 16 ottobre
  2026). Dall'app i metadati li toglie comunque la ricodifica nel `canvas` (sotto). Per le
  immagini via indirizzo, che vengono da pagine pubbliche, la prova sullo stack locale
  verifica che il WebP prodotto non porti EXIF (GPS); se li portasse, il Worker toglie i
  blocchi `EXIF` e `XMP` dal contenitore RIFF del WebP prima di salvarlo (pochi byte da
  saltare, senza decodifica).

**Controlli dell'immagine, comuni ai due canali** (dopo `info`):

- formato in ingresso fra `image/jpeg`, `image/png`, `image/webp`, cioè i formati in
  ingresso del piano Images Free; **AVIF in ingresso no**, perché la documentazione di
  Cloudflare lo riserva al piano Enterprise (rilievo 3 della revisione; AVIF in uscita è
  un'altra cosa e non serve). Rifiutati AVIF, SVG (può contenere script), GIF e il resto →
  `invalid`, codice `photo_type`. Dall'app il problema non si pone, perché il browser
  ricodifica in JPEG; via indirizzo arrivano i byte originali e vale questo controllo;
- lato corto almeno 400 px → altrimenti `invalid`, codice `photo_too_small` (le miniature
  dei siti renderebbero male nel banner);
- dimensione in ingresso: dall'app al più 10 MB (limite del corpo applicato durante la
  lettura, sezione 5, più `z.file().max()` nel contratto), via indirizzo al più 10 MB scaricati (sotto il limite di 20 MB di `.input()`) →
  `invalid`, codice `photo_too_large`;
- risultato al più 1 MB (controllo di sicurezza, non atteso).

**Ridimensionamento nel browser, senza librerie:** prima del caricamento l'app riduce
l'immagine a lato lungo 2048 px in JPEG qualità 0,85 con `createImageBitmap(file, {
imageOrientation: 'from-image' })` e un `<canvas>` (`toBlob('image/jpeg', 0.85)`). Serve a
caricare 0,3–0,8 MB invece dei 3–5 MB di una foto dell'iPhone, anche su rete mobile; il
WebP finale lo fa comunque il server, così il formato salvato è uno solo; la ricodifica
nel `canvas` toglie i metadati (posizione GPS compresa) di una foto scattata in casa. JPEG e non WebP nel browser perché Safari
non codifica WebP da `canvas` in modo affidabile su tutte le versioni; il server converte.
Un'immagine già sotto 2048 px si ricodifica lo stesso (toglie i metadati e uniforma il
tipo). Se `createImageBitmap` fallisce (formato non decodificabile dal browser) l'app
mostra il testo di `photo_unreadable` senza caricare.

## 5. Operazioni del contratto

Area `catalogue` (curatori, globali), file `contract/src/catalogue/`; viste delle ricette
nell'area `recipes`. Tutte `offline: false`.

| Operazione | Metadati | Input | Output |
|---|---|---|---|
| `catalogue.uploadPhoto` | `mcp: false`, `role: 'curator'`, `creates: true` | `{ id: uuid, recipeId: uuid, file: z.file() }` (JPEG, PNG o WebP, al più 10 MB) | `photoView` |
| `catalogue.setPhotoFromUrl` | `mcp: { readOnly: false }`, `role: 'curator'`, `creates: true` | `{ id: uuid, recipeId: uuid, imageUrl: string }` | `photoView` |
| `catalogue.removePhoto` | `mcp: { readOnly: false }`, `role: 'curator'` | `{ recipeId: uuid }` | `{ recipeId, photo: null }` |

`photoView`: `{ recipeId, photo: { id, url, width, height } }`, con `url` relativa
`/photos/<chiave>` (l'app la usa così; via MCP il server la rende assoluta con l'origine
della richiesta, così l'agente può scaricarla o dare il link al curatore, che lo apre nel browser; vale anche per le bozze, sezione 2).

- **`uploadPhoto` solo web, motivato** (sezione 13): MCP non trasporta file; l'agente usa
  `setPhotoFromUrl`. Si usa `mcp: false` e non `webOnly`, perché `webOnly` richiede uno
  strumento esposto e uno strumento con un file in ingresso non ha uno schema utile per gli
  agenti. Il file arriva con il protocollo RPC di oRPC (multipart, `z.file()`, supporto
  documentato: Context7, 16 ottobre 2026); in OpenAPI resta `multipart/form-data`.
- **Limite del corpo prima del parser** (rilievo 4 della revisione): oRPC tiene in memoria
  `File` e `Blob`, e `z.file().max()` valida un file già letto. Per questo `route` in
  `server/src/app.ts`, **prima** di `handler.handle` e prima di qualsiasi verifica del
  token, legge da sé, con un limite, il corpo delle richieste soggette al controllo, e solo
  dopo passa a oRPC una nuova `Request` con il corpo già letto.
  - **Quali richieste** (seconda revisione, rilievo 1): ogni richiesta sotto `/api/` con
    `Content-Type` `multipart/form-data`, qualunque sia il percorso, e ogni richiesta il
    cui percorso, tolti gli slash finali, è uno dei due percorsi di `uploadPhoto` (RPC
    `/api/rpc/catalogue/uploadPhoto`, OpenAPI `/api/catalogue/recipes/{recipeId}/photo/upload`).
    Il criterio del tipo multipart non dipende da come oRPC normalizza i percorsi (slash
    finale o altre varianti): un file arriva solo in multipart, e nessun'altra operazione
    lo usa. Il criterio del percorso copre un corpo non multipart diretto a quei percorsi.
  - **Come** (seconda revisione, rilievo 2): un `Content-Length` dichiarato oltre
    **10 MiB di file più 64 KiB per l'involucro multipart** (`UPLOAD_BODY_LIMIT`) si
    rifiuta senza leggere; altrimenti `route` legge il flusso contando i byte e lo annulla
    appena supera il limite, senza affidarsi a `Content-Length`. Il superamento si decide
    **prima di chiamare l'handler**, così il parser multipart non legge mai il corpo
    grande; un corpo entro il limite si passa all'handler come `ArrayBuffer` in una nuova
    `Request` con le stesse intestazioni (il Worker lo tiene in memoria una volta, come
    farebbe comunque oRPC). Gli altri percorsi e i corpi non multipart non cambiano.
  - **Formato della risposta** (terza revisione): la risposta `413` la serializza
    **oRPC**, non `route` a mano. Un JSON scritto a mano non è un errore oRPC del
    trasporto: RPC vuole l'involucro `json` e il riconoscimento chiede `defined` e
    `message`, quindi RPCLink e OpenAPILink lo leggerebbero come `PAYLOAD_TOO_LARGE` e il
    client web come `unknown` (riprodotto dal revisore con la versione 1.15.5). Per questo,
    quando il limite è superato, `route` chiama comunque `handler.handle` con una
    `Request` **senza corpo** (stesso metodo e URL, senza `Content-Length` né
    `Content-Type`) e con `uploadTooLarge: true` nel contesto. Un interceptor nuovo,
    `rejectOversizedUpload`, primo nell'elenco degli interceptor dei due handler, prima di
    `mapUnreadableRequest`, lancia allora
    `new ORPCError('invalid', { status: 413, data: { issues: [{ path: ['file'], code: 'photo_too_large' }] } })`
    prima di qualsiasi decodifica. oRPC lo codifica nel formato di ciascun trasporto, come
    già fa per gli errori di `mapUnreadableRequest` (documentazione oRPC via Context7: gli
    errori lanciati dagli interceptor dell'handler diventano la risposta, con lo stato
    dell'`ORPCError`); `mapUnreadableRequest` lascia passare un `ORPCError` con un codice
    del contratto. I client leggono `status: 413`, `code: 'invalid'` e l'issue
    `photo_too_large`, e il web mostra «La foto è troppo grande».
- **Idempotenza:** `id` scelto dal client. Se esiste già una riga con quell'`id` per la
  stessa ricetta, l'operazione non scarica, non trasforma e non scrive: risponde con lo
  stato attuale della foto di quella ricetta. Un `id` già usato per un'altra ricetta →
  `invalid` sul campo `id`.
- **Ricetta inesistente o non visibile al curatore** → `not_found`. La foto si può
  impostare su ricette `draft`, `published` e `archived`.
- **`removePhoto`** è a stato assoluto: senza foto corrente risponde lo stesso
  `{ recipeId, photo: null }` senza scrivere.
- **Ordine del lavoro e transazione** (scelta tecnica): la pipeline apre la transazione
  dell'utente prima del gestore. Il gestore controlla la ricetta, scarica e trasforma
  l'immagine, scrive l'oggetto in R2 e solo dopo inserisce la riga (togliendo la
  precedente) sotto il lucchetto della ricetta. Se la transazione fallisce dopo la
  scrittura in R2, l'oggetto resta orfano nel bucket (non si cancella mai in automatico,
  sezione 7): mai un riferimento senza oggetto. La connessione resta occupata per la durata dello
  scaricamento (al più 10 s, sotto) e della trasformazione: accettato per operazioni
  rare con pochi curatori; se servisse, si sposterebbe il lavoro di rete prima della
  transazione con un passo dedicato della pipeline.
- **Errori** (codici esistenti, nessun codice nuovo di primo livello): `invalid` con il
  percorso del campo (`file` o `imageUrl`) e un codice fra `photo_type`, `photo_too_small`,
  `photo_too_large`, `photo_unreadable`, `photo_url` (indirizzo non ammesso),
  `photo_unreachable` (non raggiungibile, errore HTTP, tempo scaduto, troppi redirect);
  `not_found`; `forbidden` per chi non è curatore (dalla pipeline). Testi nel web e per MCP
  nelle due lingue.

**Scaricamento da un indirizzo (`setPhotoFromUrl`)**, in `server/src/catalogue/photos/`:

- solo `https:`; niente credenziali nell'URL; porta assente o 443; lunghezza al più 2048;
- host che non sia un indirizzo IP letterale (IPv4 o IPv6), né `localhost`, né un nome
  senza punto, né con suffisso `.local`, `.internal`, `.localhost`, `.home.arpa`; né
  l'origine dell'app o `*.workers.dev`/`*.supabase.co` del progetto. Workers non
  raggiunge reti private, ma il controllo resta esplicito e provato;
- `fetch` con `redirect: 'manual'`: al più 3 redirect, ognuno rivalidato con le stesse
  regole; intestazioni minime (`Accept: image/*`, un `User-Agent` dell'app), nessun cookie
  o token;
- tempo massimo 10 s per l'intera catena (`AbortSignal.timeout`);
- risposta 2xx; `Content-Length` oltre 10 MB rifiutata subito; il corpo si legge contando
  i byte e si interrompe oltre 10 MB; `Content-Type` dichiarato non decisivo: decide
  `info` del binding;
- log con host e codice d'esito, mai l'URL completo con la query.

**Viste delle ricette (modifiche solo additive):**

- `recipeSummaryView` (`contract/src/recipes/views.ts`) riceve
  `photoUrl: z.string().nullable().optional()`: l'URL relativo della foto corrente, `null`
  senza foto o per una ricetta mai pubblicata. Facoltativo nel tipo perché copie salvate
  sul dispositivo e risposte di prima non lo hanno: il web tratta l'assenza come `null`.
  `CACHE_SCHEMA` non cambia (campo aggiunto, sezione 1, «Modifiche solo additive»).
  Lo popolano `loadContents` e le viste di `server/src/recipes/views.ts`, nella stessa
  istruzione che carica riga e documento (join con la foto corrente), così ricettario,
  scheda, menu e suggerimenti la ricevono senza altro codice.
- `recipeMatchView` di `catalogue.searchRecipes` e `draftView` ricevono lo stesso campo
  facoltativo `photoUrl` (assoluto via MCP, come sopra), così l'agente vede se una ricetta
  o una bozza ha già la foto senza una lettura in più. Nessuna lettura dedicata
  `getPhoto`.
- I tipi del web (`web/src/api/types.ts`) e il client finto (`web/src/api/fake/`) seguono.

**Guida all'agente** (`server/src/catalogue/guide.ts`, `catalogue.getGuide`): sezione
«Foto» in inglese come il resto della guida: una foto per ricetta, fuori dal documento e
dalle versioni; cercarla di norma sulla pagina della fonte (`og:image`, immagine della
ricetta in schema.org) o altrove; mostrare al curatore l'immagine prima di impostarla e
procedere solo dopo un sì esplicito; mai dedurre ingredienti dall'immagine (design,
«Usare immagini…»); `catalogue_setPhotoFromUrl` per impostarla o sostituirla,
`catalogue_removePhoto` per toglierla; dall'app il curatore può scattarla.

## 6. Web

**Schede (`web/src/components/RecipeCard.tsx`)**, come il prototipo
(`prototype/src/lib/components/RecipeCard.svelte`) e `design/design.md`, «Schede dei
pasti e immagini»:

- con `recipe.photoUrl`: `<div class="meal-media">` in proporzione 3:1 con
  `<img class="meal-photo" src alt="" loading="lazy" decoding="async">` e l'etichetta
  (pasto o gruppo) sopra la foto, in verde con testo bianco (classi già in
  `web/src/design/global.css`); il resto della scheda invariato. `alt=""`: la foto è
  decorativa, il titolo segue;
- senza foto: **identica a oggi** (etichetta in `meal-heading`, nessun elemento in più);
- immagine che non si carica (offline e non in cache, `404`): l'evento `error` fa
  tornare la scheda alla forma senza foto, senza riquadro vuoto;
- pasto passato: foto desaturata come nel prototipo (`grayscale(0.4)`, opacità 0,85);
- stampa: la regola esistente nasconde `.meal-photo`.

`RecipeCard.test.tsx`: il test «never shows an image: recipes have no photos» si sostituisce
con test con e senza foto; quello della ricetta mai pubblicata resta senza immagine.

**Suggerimenti della revisione dei pasti** (`web/src/features/meals/RecipePicker.tsx`):
schede scorrevoli con il banner 3:1 quando c'è la foto (design, «Revisione dei pasti»),
altrimenti come oggi.

**Scheda ricetta (`web/src/routes/RecipePage.tsx`)**: con la foto, un
`meal-media` 16:9 sotto l'intestazione (proporzione del design per la scheda ricetta),
prima della riga della fonte; per i curatori il pulsante «Foto» sulla foto e il foglio
(sezione 1); senza foto, per i curatori, il pulsante bordato «Aggiungi foto». Il ruolo si
legge con `useIsCurator()` (area `catalogue`). Offline i comandi sono disabilitati
(operazioni `offline: false`), come le altre scritture.

**Mutazioni** (registro delle mutazioni del web, nessun aggiornamento ottimistico):
`uploadPhoto`, `removePhoto` (e `setPhotoFromUrl` non usata dal web) marcano scadute e
fanno rileggere le query delle ricette (`recipes`), del menu e dei suggerimenti della
famiglia corrente e quelle dell'area `catalogue`; la scheda aperta mostra la foto alla
rilettura.

**Risposte superate** (rilievo 5 della revisione): la sola invalidazione non basta. Una
modifica del pasto partita prima di un caricamento può rispondere con la settimana e la
foto vecchia dopo che la rilettura ha già mostrato quella nuova, e `runMealMutation` la
scriverebbe. Le foto entrano nel meccanismo comune già usato per i voti
(`ratingsConfirmed` in `web/src/api/mutations.ts`): un contatore per sessione delle
modifiche confermate del ricettario, `catalogueChangesConfirmed(session)`, che cresce a
ogni `uploadPhoto` o `removePhoto` riuscita (il ricettario è globale, quindi il contatore
non è per famiglia). `runMealMutation` lo legge alla partenza e, se all'arrivo della
risposta è cambiato, non scrive la settimana: la marca scaduta e la fa rileggere, come
per un voto confermato nel frattempo. Un test lo prova con la risposta del pasto
ritardata.

Una mutazione TanStack in corso conta già come «pagina occupata» (`useBusyCheck`):
nessun ricaricamento della PWA a metà caricamento. Il ridimensionamento nel browser avviene
dentro la funzione della mutazione, quindi è coperto dallo stesso controllo.

**Testi nuovi** (dizionari dell'area `catalogue` o `recipe`, italiano e inglese britannico):
«Aggiungi foto» / «Add photo», «Foto» / «Photo», «Sostituisci la foto» / «Replace photo»,
«Togli la foto» / «Remove photo», «Togliere la foto?» / «Remove the photo?», «Togli» /
«Remove», «Indietro» / «Back», «Caricamento…» / «Uploading…», e i testi degli errori:
`photo_type` «Formato non supportato: usa una foto JPEG, PNG o WebP.» / «Unsupported
format: use a JPEG, PNG or WebP photo.»; `photo_too_small` «La foto è troppo
piccola.» / «The photo is too small.»; `photo_too_large` «La foto è troppo grande.» /
«The photo is too large.»; `photo_unreadable` «Non riesco a leggere questa immagine.» /
«This image can't be read.». Testo finale nel piano; stessa voce per MCP lato server.

## 7. Offline, esportazione e conservazione

**Service worker** (`web/src/pwa/`): strategia nuova `photo` per `GET` della stessa origine
su `/photos/*` (fuori da `SERVER_PREFIXES`, che restano in passthrough):

- è l'**unica** cache delle foto: la rotta risponde `Cache-Control: private, no-store`
  (sezione 3), quindi né la cache HTTP del browser né cache condivise ne conservano copie;
- **prima la cache, poi la rete** in una cache dedicata `cosasimangia-photos-v1`, **non legata alla
  versione della build** e quindi non toccata dal precache né dalla rotazione delle tre
  versioni: `staleCaches` deve escluderla esplicitamente (oggi prende ogni nome con il
  prefisso `cosasimangia-`), con un test;
- in cache solo risposte `200` con `Content-Type` `image/*`; un `404` non si salva;
- tetto di **300 foto** (circa 75 MB nel caso peggiore, di norma meno): oltre, si tolgono
  le voci più vecchie per ordine di inserimento (`cache.keys()` restituisce l'ordine di
  inserimento); niente scadenza a tempo, l'URL è immutabile;
- **mai nel precache**: le foto non sono file della build;
- **uscita dall'account** (sezione 1): le foto sono del ricettario, non dati di una
  famiglia, ma si tolgono comunque con la cache delle foto, come la copia delle viste.
  La procedura unica di chiusura della sessione (aggancio `session.onClose`) manda al
  service worker il messaggio `{ type: 'clear-photos' }` e, se nessun worker controlla la
  pagina, cancella la cache direttamente. Il worker tiene un numero d'epoca: lo fa
  crescere, poi cancella la cache. Ogni risposta di una foto ricorda l'epoca alla
  partenza e si salva solo se l'epoca non è cambiata, così **una risposta arrivata
  durante l'uscita non ricrea la cache** della sessione chiusa (rilievo 2 della revisione).
  Se il worker si riavvia, le richieste in corso muoiono con lui: l'epoca persa non apre
  varchi. Copie già salvate fuori dall'app non sono revocabili (sezione 3);
- una foto mai vista non è disponibile offline e la scheda ricade nella forma senza foto.

**Esportazione notturna:** `recipe_photos` è una tabella di `app`, quindi entra
automaticamente nell'esportazione (`appTables` le scopre a ogni esecuzione): l'esportazione
contiene i **riferimenti** (chiavi, misure, autori, date), **non le immagini**. Nessuna
modifica al codice dell'esportazione; un test lo verifica. Il ripristino da esportazione
(`scripts/backup/restore.ts`) riporta le righe; le immagini restano nel bucket delle foto,
che non si ripristina.

**Conservazione: illimitata, nessuna cancellazione automatica** (rilievo 1 della
revisione, decisione del coordinatore del 16 ottobre 2026). Gli oggetti nel bucket delle
foto non si cancellano mai in automatico: né le foto tolte o sostituite, né gli orfani.

- **Perché:** una pulizia che guarda solo il database corrente e l'età degli oggetti non
  distingue un caricamento fallito da una foto ancora citata da un'altra esportazione
  conservata. Esempio della revisione: si ripristina un'esportazione precedente al
  caricamento di una foto, la foto sparisce dal database, ma un'esportazione successiva
  che la cita è ancora fra le 7 conservate; cancellare l'oggetto renderebbe rotto il suo
  ripristino. Inoltre le 7 esportazioni conservate sono le ultime 7 riuscite, non gli
  ultimi 7 giorni: dopo una serie di notti fallite una finestra a tempo non basterebbe.
  Le regole del ciclo di vita di R2 hanno lo stesso difetto e in più contano l'età dalla
  creazione dell'oggetto, non dalla rimozione della foto.
- **Costo:** minimo. Qualche centinaio di foto da poche centinaia di KB, contro i 10 GB
  gratuiti di R2.
- **Orfani:** gli oggetti di caricamenti la cui transazione è fallita (sezione 5) e,
  dopo un ripristino da un'esportazione più vecchia, quelli delle foto caricate dopo
  quell'esportazione restano nel bucket senza riga. Non fanno danni: la rotta li serve
  solo se il database li indica come correnti.
- **Una pulizia futura** dovrà tenere conto dei riferimenti in **tutte le esportazioni
  conservate** (per esempio con un elenco delle chiavi citate scritto accanto a ogni
  esportazione), oltre che del database corrente, e in caso di verifica incompleta dovrà
  conservare gli oggetti. Fuori perimetro.

Il punto 6 del brief resta soddisfatto, con la conservazione illimitata: un ripristino da
qualunque esportazione conservata trova tutte le immagini che cita.

## 8. Infrastruttura e passi esterni (per il runbook del coordinatore)

Nel codice (`server/wrangler.jsonc`, `server/src/env.ts`):

- `r2_buckets`: `{ "binding": "PHOTOS", "bucket_name": "cosasimangia-photos",
  "jurisdiction": "eu" }`;
- `images`: `{ "binding": "IMAGES" }`;
- `ratelimits`: `PHOTO_READ_LIMIT`, `namespace_id` `9103`, 300 ogni 60 s;
- `assets.run_worker_first`: aggiunta di `/photos/*`.

`PHOTOS` e `IMAGES` sono facoltativi in `Env`: senza, le operazioni di caricamento
rispondono `internal` con un log `photo_storage_not_configured`, la rotta risponde `404`,
il resto dell'app funziona.

Passi esterni nel rilascio, **non li faccio io**:

1. creare il bucket `cosasimangia-photos` nella giurisdizione `eu` (dashboard o
   `wrangler r2 bucket create cosasimangia-photos --jurisdiction eu`), senza accesso
   pubblico, senza dominio personalizzato;
2. verificare che Cloudflare Images sia disponibile sull'account di POWA nel piano Free
   (le trasformazioni del binding sono comprese; nessun acquisto) e che il binding `IMAGES`
   si pubblichi;
3. verificare che il `namespace_id` `9103` sia libero nell'account;
4. `npm run release` controlla i binding nuovi della configurazione del Worker (il
   coordinatore valuta se aggiungerli ai controlli di `--preview`);
5. applicare la migrazione con il rilascio.

In locale: Wrangler simula R2 e il binding Images ridotto; i test del server usano un
bucket in memoria e un binding finto, come i test dell'esportazione.

## 9. Test

- **pgTAP** (`supabase/tests/`): tabella, vincoli (una foto corrente per ricetta, forma
  della chiave, colonne d'autore), RLS (lettura legata alla ricetta, scritture solo
  curatori, `update` solo su `removed_at`/`removed_by`, nessun `delete`),
  `app.served_photo` (solo correnti, anche di bozze, eseguibile solo da `anon`), trigger del
  contatore del ricettario, autori a `null` dopo la cancellazione dell'account.
- **Server** (Vitest con l'env finto, bucket in memoria, binding Images finto, `fetch`
  finta per gli indirizzi):
  - permessi: un membro non curatore riceve `forbidden` sulle tre operazioni;
  - tipi e dimensioni rifiutati (AVIF, SVG, GIF, troppo grande, troppo piccola,
    illeggibile);
  - errore `9422` del binding: `internal`, foto precedente intatta, nessun oggetto né
    riga nuovi;
  - corpo del caricamento oltre `UPLOAD_BODY_LIMIT` senza `Content-Length` e con
    `Content-Length` dichiarato oltre, attraverso `createApp` (nessuna simulazione di
    `handler.handle`), su RPC e su OpenAPI, ciascuno con e senza slash finale, senza
    autenticazione: `413` con `photo_too_large` nel corpo, lettura interrotta, nessuna
    chiamata a Images né a R2; un multipart oltre il limite verso un altro percorso
    `/api/` è rifiutato allo stesso modo; inoltre, attraverso i client RPC (RPCLink) e
    OpenAPI (OpenAPILink) collegati a `createApp`, per il limite dichiarato e per quello
    rilevato durante la lettura, l'errore ricevuto ha `status: 413`, `code: 'invalid'` e
    l'issue `photo_too_large` (queste prove falliscono con un JSON scritto a mano);
  - indirizzi non validi (http, IP letterali, `localhost`, credenziali, porta), redirect
    verso un indirizzo non ammesso, più di 3 redirect, tempo scaduto, 404, corpo oltre il
    limite senza `Content-Length`;
  - caricamento, sostituzione (la precedente risulta tolta, una sola corrente), rimozione,
    ripetizione con lo stesso `id` senza nuovo oggetto;
  - transazione fallita dopo la scrittura in R2: nessuna riga, oggetto orfano;
  - viste: `photoUrl` nel ricettario, nella scheda, nel menu, assente per le bozze;
    versione «invariato» che cambia dopo una foto nuova;
  - rotta `/photos/*`: intestazioni, `404` per foto tolta, chiave malformata o oggetto
    mancante, `429` dal limitatore;
  - esportazione con le righe di `recipe_photos`, senza i byte delle immagini; dopo
    esportazione, sostituzione e ripristino nel database di prova, la foto dell'esportazione
    torna servita e il suo oggetto è ancora nel bucket (nessuna cancellazione automatica);
  - strumenti MCP presenti (`catalogue_setPhotoFromUrl`, `catalogue_removePhoto`) e
    `uploadPhoto` assente; URL assoluti via MCP.
- **Web** (Vitest e Testing Library): schede con e senza foto (senza foto il markup di
  oggi), errore dell'immagine che torna alla forma senza foto, comandi visibili solo ai
  curatori e solo nella scheda ricetta, foglio con sostituisci e togli, errori tradotti,
  ridimensionamento (funzione pura del calcolo delle misure; canvas finto), service worker
  (strategia `photo`, cache dedicata esclusa dalla rotazione, tetto, cancellazione alla
  chiusura della sessione, risposta arrivata durante l'uscita non salvata); risposta di un
  pasto ritardata dopo un caricamento o una rimozione confermati attraverso i veri
  `useUploadPhoto` e `useRemovePhoto` (senza toccare il contatore a mano): scartata e
  settimana riletta. Il test fallisce se si toglie l'incremento dagli `onSuccess` o il
  controllo da `runMealMutation`.
- **Stack locale con agent-browser**, anche a larghezza da telefono (390 px): caricamento
  di una foto da file (l'input di file con un file di prova), schede del menu e del
  ricettario con e senza foto confrontate con `design/references/hellofresh/` e il
  prototipo, sostituzione e rimozione, offline dopo una visita (foto viste disponibili,
  non viste ricadute senza foto). Prove locali senza la produzione
  (`protocollo-worker.md`, «Prove sullo stack locale»), controllando l'URL di Auth.

**Esito delle prove sullo stack locale** (16 ottobre 2026; Supabase locale con il ricettario
importato, `wrangler dev` con R2 e Images locali, build della SPA con l'Auth locale, accesso
verificato verso `127.0.0.1`, mai la produzione; agent-browser a 390 px e a 1280 px):

- caricamento da file nella scheda ricetta come curatrice (ridimensionamento nel browser,
  WebP salvato dal binding Images, foto 16:9 con il pulsante «Foto»); sostituzione dal
  foglio (la precedente risulta tolta nella tabella) e rimozione con conferma; la foto
  tolta risponde `404` dalla rotta;
- schede del menu e del ricettario: banner 3:1 con l'etichetta verde sopra, schede senza
  foto invariate, foto del pasto passato desaturata; membro non curatore: foto visibile,
  nessun comando, nessun input di file;
- rotta `/photos/<chiave>`: `Cache-Control: private, no-store`, `nosniff`, CSP
  `default-src 'none'; sandbox`, `Cross-Origin-Resource-Policy: same-origin`, `ETag`;
- offline dopo una visita (Worker fermo e browser offline, riapertura a freddo): le foto
  viste arrivano dalla cache `cosasimangia-photos-v1`, una foto tolta dalla cache ricade
  nella scheda senza foto; all'uscita dall'account la cache delle foto non c'è più;
- `setPhotoFromUrl` via REST con una JPEG pubblica che porta EXIF con GPS: il WebP salvato
  contiene il solo blocco `VP8 `, senza `EXIF` né `XMP`. La rimozione dei blocchi RIFF
  nel Worker non serve. È il binding Images **locale** (ridotto): dopo il rilascio va
  ripetuta la verifica con il binding vero (un `setPhotoFromUrl` con una foto con GPS e il
  controllo dei blocchi del file servito);
- la prova ha trovato un difetto, corretto prima della PR: il lato pagina della cache
  (`web/src/pwa/photos.ts`) importava una costante di `sw-rules.ts`, Rollup spostava il
  modulo in un chunk condiviso e `sw.js` cominciava con un `import`, che un service worker
  classico non valuta (registrazione fallita). Ora la build fallisce se `sw.js` importa
  altri chunk (`assertSelfContained`).

**Da provare a mano sull'iPhone dopo il rilascio** (annotato per il coordinatore): dalla
PWA installata, «Aggiungi foto» offre «Scatta foto» e «Libreria foto»; una foto HEIC della
libreria si carica (conversione del browser e `createImageBitmap`); orientamento corretto
di una foto verticale; tempi di caricamento su rete mobile; foto disponibili offline dopo
una visita.

## 10. Dipendenze

Nessuna dipendenza npm nuova a runtime. Il binding Images è un servizio di Cloudflare
sull'account già usato, senza costo nel piano Free alle quantità previste; sostituisce una
libreria di decodifica e codifica nel Worker (sezione 4).

Una sola devDependency del server, **`@orpc/openapi-client` `1.15.5`**, solo per i test
(da approvare dal coordinatore): fornisce `OpenAPILink`, con cui le prove del limite del
caricamento leggono il rifiuto come lo leggerebbe un client OpenAPI vero (terza
revisione). È già installata e nel lockfile, alla stessa versione, come dipendenza di
`@orpc/openapi`, che il server usa: dichiararla non aggiunge pacchetti. Farne a meno
vorrebbe dire decodificare a mano la risposta OpenAPI nei test, cioè ripetere proprio il
formato che la prova deve verificare.

## Decisioni da riportare nella specifica

**Prodotto** (decisioni dell'utente del 16 ottobre 2026):

- le foto si aggiungono, sostituiscono e tolgono solo dalla scheda ricetta aperta, dai
  curatori: «Aggiungi foto» senza foto, pulsante «Foto» sulla foto con il foglio
  «Sostituisci la foto» / «Togli la foto»; le schede compatte non hanno comandi per la foto
  (Parte 1 «Il ricettario»; sezioni 8 e 14);
- nessuna provenienza della foto salvata o mostrata (sezioni 2, 8, 14; supera la «fonte»
  tra le domande della sezione 15);
- l'agente può impostare una foto da qualunque indirizzo, di norma dalla pagina della
  fonte, mostrandola al curatore e impostandola dopo un sì esplicito (Parte 1 «Usare
  l'app attraverso il proprio agente»; sezioni 8 e 13).

**Tecniche** (mie, motivate sopra):

- tabella `app.recipe_photos` con una foto corrente per ricetta, fuori dal documento e
  dalle versioni; bozze con foto ammesse ma non mostrate; trigger sul contatore del
  ricettario (sezione 2);
- bucket R2 `cosasimangia-photos` (UE, privato), chiavi casuali da 128 bit, rotta
  `/photos/<chiave>` senza autenticazione che serve solo le foto correnti, con
  `Cache-Control: private, no-store` e limitatore per IP (sezione 1, tabella delle rotte;
  sezione 8);
- WebP con lato lungo 1600 px, una sola misura, trasformato una volta al caricamento con il
  binding Images (piano Free, ingresso JPEG, PNG e WebP, niente AVIF); ridimensionamento
  JPEG nel browser prima del caricamento (sezione 1, componenti; sezione 15 «Hosting e
  costi»);
- `catalogue.uploadPhoto` solo web (`mcp: false`), con il limite del corpo applicato
  durante la lettura prima del parser; `catalogue.setPhotoFromUrl` e
  `catalogue.removePhoto` anche MCP; scaricamento controllato (https, niente IP né nomi
  interni, 3 redirect, 10 s, 10 MB) (sezioni 1 e 13);
- campo facoltativo `photoUrl` nelle viste delle ricette (sezione 1, «Modifiche solo
  additive»); modifiche delle foto nel meccanismo delle risposte superate del web
  (sezione 1, «Letture dalla copia sul dispositivo»);
- cache delle foto solo nel service worker, separata dal precache, 300 voci, cancellata
  alla chiusura della sessione anche contro le risposte in volo; copie esterne non
  revocabili (sezione 1, «Copia e sessione sul dispositivo»);
- esportazione con i soli riferimenti; oggetti del bucket mai cancellati in automatico,
  orfani ammessi, una pulizia futura dovrà considerare tutte le esportazioni conservate
  (sezione 8, «Esportazione notturna»);
- ripristino dell'intero catalogo e foto: da decidere con quell'attività (sezione 15);
- sezione 15: voce «Foto delle ricette» chiusa.
