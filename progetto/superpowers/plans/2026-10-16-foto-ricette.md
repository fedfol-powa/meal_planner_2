# Foto delle ricette: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Obiettivo:** una foto per ricetta, caricata dai curatori dalla scheda ricetta o impostata
dall'agente da un indirizzo, mostrata nelle schede (3:1) e nella scheda ricetta (16:9),
disponibile offline dopo una visita.

**Architettura:** tabella `app.recipe_photos` fuori dal documento ricetta; immagini WebP
in un bucket R2 nuovo, prodotte una volta al caricamento dal binding Images e mai
cancellate in automatico; rotta pubblica `/photos/<chiave>` che serve solo le foto
correnti, senza cache HTTP; campo facoltativo `photoUrl` nelle viste; cache dedicata nel
service worker, svuotata all'uscita.

**Stack:** Postgres/pgTAP (Supabase), Worker Cloudflare (oRPC, R2, Images, ratelimit),
React (TanStack Query), service worker scritto a mano, Vitest.

**Spec:** `progetto/superpowers/specs/2026-10-16-foto-ricette.md` (leggerla prima di ogni
compito; i numeri di sezione sotto sono i suoi). Corretto dopo la revisione
`progetto/coordinamento/revisioni/w12-spec-piano.md` e le decisioni del coordinatore in
`progetto/coordinamento/messaggi/w12-01-revisione-spec.md`.

## Vincoli globali

- Codice, nomi, commenti e test in inglese; testi per l'utente in italiano e inglese
  britannico; commit piccoli in italiano, come nella storia del repository.
- Nessuna dipendenza npm nuova.
- Migrazione solo additiva: `supabase/migrations/20261016110000_recipe_photos.sql`.
- Modifiche solo additive al contratto: `photoUrl` facoltativo; `CACHE_SCHEMA` invariato.
- Nessun aggiornamento ottimistico nel web.
- Chiave: `photos/<22 caratteri base64url>.webp` (128 bit casuali dal Worker); regex
  `^photos/[A-Za-z0-9_-]{22}\.webp$`.
- WebP, `transform({ width: 1600, height: 1600, fit: 'scale-down' })`,
  `output({ format: 'image/webp', quality: 80 })`.
- Ingresso: solo `image/jpeg`, `image/png`, `image/webp` (piano Images Free, **niente
  AVIF**); lato corto ≥ 400 px; al più 10 MiB; risultato al più 1 MiB.
- Corpo del caricamento: `UPLOAD_BODY_LIMIT = 10 * 1024 * 1024 + 64 * 1024`, applicato
  durante la lettura, prima del parser e del token.
- Indirizzi: solo `https:`, porta assente o 443, niente credenziali, lunghezza ≤ 2048,
  niente IP letterali, `localhost`, nomi senza punto, suffissi `.local` `.internal`
  `.localhost` `.home.arpa`, né l'host dell'app, `*.workers.dev`, `*.supabase.co`;
  `redirect: 'manual'`, al più 3 redirect rivalidati, 10 s per tutta la catena.
- Codici d'errore (issue di `invalid`): `photo_type`, `photo_too_small`,
  `photo_too_large`, `photo_unreadable`, `photo_url`, `photo_unreachable`. Limite Images
  (`9422`): `internal` con log `photo_images_limit`.
- **Nessuna cancellazione automatica** di oggetti dal bucket delle foto: nessuna pulizia,
  nessuna regola del ciclo di vita (decisione del coordinatore).
- Rotta: limitatore `PHOTO_READ_LIMIT` (`namespace_id` `9103`, 300 ogni 60 s); intestazioni
  `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`,
  `Content-Security-Policy: default-src 'none'; sandbox`,
  `Cross-Origin-Resource-Policy: same-origin`, `ETag`.
- Service worker: cache `cosasimangia-photos-v1`, prima la cache poi la rete, 300 voci,
  esclusa da `staleCaches`, svuotata alla chiusura della sessione con un numero d'epoca
  contro le risposte in volo.
- Prove locali mai contro la produzione (`protocollo-worker.md`, «Prove sullo stack
  locale»).

## Comandi

I test si lanciano **dal workspace**, non dalla radice: la configurazione Vitest della
radice include solo `scripts/**` e passerebbe senza eseguire nulla (rilievo 6).

- Stack locale: `supabase start` (se non già attivo); dopo aver scritto la migrazione,
  `supabase migration up` per applicarla al database locale senza cancellarlo (in caso di
  stato incoerente, `supabase db reset`).
- pgTAP: `supabase test db`.
- Server, test unitari: `npm test -w server -- test/catalogue/photos-unit.test.ts`.
- Server, test d'integrazione: con lo schema aggiornato e
  `export TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres`
  (lo stesso valore della CI; `assertLocalTestDatabase` rifiuta altri host), per esempio
  `npm test -w server -- test/catalogue/photos.test.ts`. Senza `TEST_DATABASE_URL` i file
  con `describe.skipIf(!hasDatabase)` si saltano: un PASS senza la variabile non vale.
- Web: `npm test -w web -- <filtro>`; build `npm run build -w web`.
- Tutto: `npm run typecheck`, `npm test` (radice, con `TEST_DATABASE_URL`).

Ogni passo «FAIL» deve mostrare il test indicato fallire per il motivo atteso, non
«No test files found».

## Punti da guardare in revisione

1. **Foto sostituita due volte in fretta** (due curatori, o doppio tocco): resta una sola
   foto corrente, la seconda arrivata; nessuna violazione dell'indice univoco. Test nel
   compito 3 (`concurrent replacements leave one current photo`).
2. **Redirect verso un host interno dopo uno esterno valido:** rifiutato con `photo_url`.
   Test nel compito 2 (`refuses a redirect to a blocked host`).
3. **Caricamento enorme costruito a mano, senza `Content-Length`:** lettura interrotta
   oltre il limite, `413`, nessuna chiamata a Images né a R2, anche senza token. Test nel
   compito 6 (`stops an oversized upload while reading`).
4. **Scheda con foto offline mai vista:** nessun riquadro vuoto né icona rotta; la scheda
   torna senza foto. Test nel compito 7 (`falls back to the plain card when the image fails`).
5. **Uscita con una foto in arrivo:** la risposta che arriva dopo lo svuotamento non
   ricrea la cache. Test nel compito 9 (`a response arriving during sign-out is not stored`).

---

### Compito 1: tabella, permessi e funzione pubblica

**File:**
- Crea: `supabase/migrations/20261016110000_recipe_photos.sql`
- Crea: `supabase/tests/recipe_photos_test.sql`

**Interfacce:**
- Produce: tabella `app.recipe_photos` (colonne della spec, sezione 2); indice univoco
  parziale `recipe_photos_one_current` su `recipe_id` where `removed_at is null`;
  `app.served_photo(p_key text) returns table (content_type text, bytes int)`,
  `security definer`, `set search_path = ''`, `EXECUTE` revocato a `public` e concesso
  solo ad `anon`; trigger `recipe_photos_touch_catalogue` (insert, update) →
  `app.bump_catalogue_version()`.

- [ ] **Passo 1: test pgTAP** (`helpers/setup.psql` e `helpers/fixtures.psql` come gli
  altri), con queste asserzioni:
  - un curatore inserisce una foto di una ricetta pubblicata e una di una bozza;
  - una seconda foto corrente della stessa ricetta viola `recipe_photos_one_current`
    (`23505`); dopo `update … set removed_at = now(), removed_by = …` la nuova entra;
  - `storage_key` fuori forma (`'photos/x.webp'`) viola il check (`23514`);
  - `content_type <> 'image/webp'` viola il check;
  - un membro non curatore: `insert` rifiutato da RLS; vede la foto di una ricetta
    pubblicata, non quella di una bozza;
  - `update` di `storage_key` rifiutato (privilegio di colonna, `42501`); `delete`
    rifiutato;
  - `app.served_photo`: restituisce una riga per la foto corrente pubblicata e per quella
    corrente di una bozza, nessuna per una foto tolta o per una chiave sconosciuta;
    `has_function_privilege('anon', …, 'execute')` vero, per `authenticated` e `public`
    falso;
  - `catalogue_state.version` cresce dopo un inserimento;
  - cancellando l'utente in `auth.users`, `created_by` e `removed_by` diventano `null`.
- [ ] **Passo 2:** `supabase test db` → FAIL su `recipe_photos_test.sql` (tabella assente).
- [ ] **Passo 3: migrazione.** Grant: `select, insert` su `app.recipe_photos` e
  `update (removed_at, removed_by)` ad `authenticated`; policy `recipe_photos_read`
  (select) con `exists (select 1 from app.recipes r where r.id = recipe_id)` (si appoggia
  all'RLS di `recipes`), `recipe_photos_curate` (insert, update) con
  `app.has_role('recipe_curator')`; `select` ad `app_backup`. Check
  `removed_by is null or removed_at is not null` e `removed_at is null or removed_at >= created_at`.
- [ ] **Passo 4:** `supabase migration up`, poi `supabase test db` → PASS (tutti i file).
- [ ] **Passo 5: commit** «Foto: tabella delle foto delle ricette e funzione pubblica».

### Compito 2: immagini nel Worker (indirizzo, scaricamento, trasformazione, chiave)

**File:**
- Crea: `contract/src/catalogue/photos.ts` (codici e vista, esportati da `contract/src/catalogue/index.ts`)
- Crea: `server/src/catalogue/photos/url.ts`, `download.ts`, `process.ts`, `key.ts`, `errors.ts`
- Crea: `server/test/catalogue/photos-unit.test.ts`, `server/test/support/images.ts`

**Interfacce:**
- Produce (contratto): `PHOTO_ISSUE_CODES = ['photo_type','photo_too_small','photo_too_large','photo_unreadable','photo_url','photo_unreachable'] as const`,
  `type PhotoIssueCode`; `PHOTO_INPUT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const`;
  `photoView = z.object({ recipeId: z.uuid(), photo: z.object({ id: z.uuid(), url: z.string(), width: z.number().int().positive(), height: z.number().int().positive() }).nullable() })`.
- Produce (server):
  - `class PhotoError extends Error { readonly code: PhotoIssueCode }`;
    `class PhotoServiceError extends Error { readonly limit: boolean }` (`limit` vero se il
    messaggio dell'errore del binding contiene `9422`);
  - `allowedImageUrl(raw: string, appHost: string): URL | null` (regole dei vincoli globali);
  - `downloadImage(url: URL, deps: { fetch: typeof fetch; appHost: string; timeoutMs?: number; maxBytes?: number; maxRedirects?: number }): Promise<Uint8Array>`
    (default 10 000 ms, 10 MiB, 3; errori `photo_url`, `photo_unreachable`, `photo_too_large`);
  - `readLimited(body: ReadableStream<Uint8Array>, maxBytes: number): Promise<Uint8Array>`
    (lancia `PhotoError('photo_too_large')` e annulla il lettore oltre il limite; usata
    anche dal compito 6);
  - `type PhotoImages = Pick<ImagesBinding, 'info' | 'input'>`;
    `processPhoto(images: PhotoImages, bytes: Uint8Array): Promise<ProcessedPhoto>` con
    `ProcessedPhoto = { body: Uint8Array; contentType: 'image/webp'; width: number; height: number }`
    (misure lette con un secondo `info` sul risultato; errori `photo_type`,
    `photo_too_small`, `photo_too_large`, `photo_unreadable`; errore di `output` o
    `transform` non di decodifica → `PhotoServiceError`);
  - `newPhotoKey(): string`, `PHOTO_KEY: RegExp`, `photoPath(key: string): string`
    (`/` + chiave), `photoUrl(key: string, origin?: string): string`.
- Produce (test): `fakeImages(options?: { fail?: 'unreadable' | 'limit' | 'service' }): PhotoImages`
  che legge formato e misure dall'intestazione (JPEG SOF, PNG IHDR, WebP VP8/VP8L/VP8X,
  AVIF `ftypavif`, GIF, SVG dal testo) e restituisce un WebP minimo con misure scalate;
  con `fail: 'limit'` `output` lancia `new Error('ERROR 9422: monthly transformation limit')`;
  `jpegOf(width, height)`, `pngOf(width, height)`, `avifOf(width, height)` piccoli file
  validi solo nell'intestazione.

- [ ] **Passo 1: test** in `photos-unit.test.ts`:
  - `allowedImageUrl`: accetta `https://ricette.example.it/a.jpg`; rifiuta `http:`,
    `https://user:pw@x.it/a`, `https://x.it:8443/a`, `https://127.0.0.1/a`, `https://[::1]/a`,
    `https://0x7f.1/a`, `https://localhost/a`, `https://intranet/a`, `https://nas.local/a`,
    `https://x.internal/a`, l'host dell'app, `https://w.workers.dev/a`,
    `https://p.supabase.co/a`, un URL di 2049 caratteri;
  - `downloadImage` con `fetch` finta: `refuses a redirect to a blocked host`
    (302 → `https://127.0.0.1/`, `photo_url`); quattro redirect → `photo_unreachable`;
    404 → `photo_unreachable`; `Content-Length: 11000000` → `photo_too_large` senza
    leggere il corpo; `stops reading past the limit` (corpo a pezzi senza
    `Content-Length`, oltre 10 MiB → `photo_too_large`, lettore annullato); tempo scaduto
    (fetch che non risponde, `timeoutMs: 50`) → `photo_unreachable`; nessun `cookie` né
    `authorization` fra le intestazioni inviate;
  - `processPhoto`: JPEG 3000×2000 → WebP 1600×1067, `contentType` `image/webp`; AVIF →
    `photo_type`; SVG → `photo_type`; GIF → `photo_type`; 600×300 → `photo_too_small`;
    `fail: 'unreadable'` (info che lancia) → `photo_unreadable`; `fail: 'limit'` →
    `PhotoServiceError` con `limit: true`; risultato oltre 1 MiB → `photo_too_large`;
  - `newPhotoKey()` soddisfa `PHOTO_KEY`, due chiamate diverse.
- [ ] **Passo 2:** `npm test -w server -- test/catalogue/photos-unit.test.ts` → FAIL
  (moduli assenti).
- [ ] **Passo 3:** implementare i moduli. IP letterale: host fra parentesi quadre o tutto
  numeri e punti dopo la normalizzazione di `new URL` (che converte le forme
  esadecimali e ottali in decimale puntato).
- [ ] **Passo 4:** stesso comando → PASS; `npm run typecheck` → PASS.
- [ ] **Passo 5: commit** «Foto: scaricamento controllato e trasformazione nel Worker».

### Compito 3: operazioni del contratto, gestori, configurazione e MCP

**File:**
- Modifica: `contract/src/catalogue/operations.ts` (tre operazioni), `contract/src/catalogue/catalogue-contract.test.ts`
- Crea: `server/src/catalogue/photos/write.ts`
- Modifica: `server/src/catalogue/router.ts`, `server/src/env.ts`, `server/wrangler.jsonc`,
  `server/src/catalogue/guide.ts`, `server/test/support/context.ts`, `server/test/support/requests.ts` (`testEnv`)
- Crea: `server/test/catalogue/photos.test.ts`

**Interfacce:**
- Consuma: compito 2.
- Produce:
  - `catalogue.uploadPhoto` (`mcp: false`, `offline: false`, `role: 'curator'`,
    `creates: true`; `POST /catalogue/recipes/{recipeId}/photo/upload`; input
    `{ id: z.uuid(), recipeId: z.uuid(), file: z.file().mime([...PHOTO_INPUT_TYPES]).max(10 * 1024 * 1024) }`);
  - `catalogue.setPhotoFromUrl` (`mcp: { readOnly: false }`, `creates: true`;
    `PUT /catalogue/recipes/{recipeId}/photo`; input `{ id, recipeId, imageUrl: z.string().trim().min(1).max(2048) }`;
    `summary` che dice di mostrare l'immagine al curatore e impostarla solo dopo un sì
    esplicito, e che sono ammessi JPEG, PNG e WebP);
  - `catalogue.removePhoto` (`mcp: { readOnly: false }`; `DELETE /catalogue/recipes/{recipeId}/photo`;
    input `{ recipeId }`; output `photoView` con `photo: null`);
  - tutte e tre `errors({ not_found })`, output `photoView`;
  - `setRecipePhoto(context: OperationContext, input: { id: string; recipeId: string; bytes: () => Promise<Uint8Array> }): Promise<PhotoView>`
    e `removeRecipePhoto(context: OperationContext, recipeId: string): Promise<PhotoView>`;
  - `Env`: `PHOTOS?: R2Bucket`, `IMAGES?: PhotoImages`, `PHOTO_READ_LIMIT: RateLimiter`,
    `PHOTO_FETCH?: typeof fetch` (solo per i test; default il `fetch` globale);
    `wrangler.jsonc`: binding `PHOTOS` (`cosasimangia-photos`, `eu`), `images`
    `{ "binding": "IMAGES" }`, ratelimit `PHOTO_READ_LIMIT` `9103` 300/60,
    `/photos/*` in `run_worker_first`, commenti come gli altri.
- Ordine in `setRecipePhoto` (spec, sezione 5): ricetta visibile (`select … for update`
  sulla riga di `app.recipes`, `not_found` se manca) → idempotenza per `id` (stessa
  ricetta: risponde lo stato attuale senza lavoro; altra ricetta: `invalid` su `id`) →
  binding mancanti: log `photo_storage_not_configured` e `internal` → `bytes()` →
  `processPhoto` → `PHOTOS.put(newPhotoKey(), body, { httpMetadata: { contentType } })` →
  `update … set removed_at = clock_timestamp(), removed_by` della corrente → `insert`
  con `channel` del contesto. `PhotoError` → `appError('invalid', { issues: [{ path: [campo], code }] })`
  con campo `file` o `imageUrl`; `PhotoServiceError` → log `photo_images_limit` o
  `photo_images_failed`, poi `internal`. URL della risposta assoluto quando
  `context.channel === 'mcp'`.

- [ ] **Passo 1: test** in `photos.test.ts` (database locale, `catalogueActors()`,
  `MemoryBucket`, `fakeImages()`, `PHOTO_FETCH` finta per gli indirizzi):
  - `a member who is not a curator gets forbidden` sulle tre operazioni;
  - `uploads, replaces and removes a photo`: dopo il caricamento una riga corrente e un
    oggetto; dopo la sostituzione due righe, una con `removed_at`, due oggetti; dopo la
    rimozione nessuna corrente e **tutti gli oggetti ancora nel bucket**; `removePhoto`
    ripetuto risponde `photo: null` senza scrivere;
  - `repeating the same id does no new work` (un solo oggetto, stessa risposta);
  - `the same id for another recipe is invalid`;
  - `refuses types and sizes` (AVIF, SVG, GIF, 600×300, illeggibile) con il codice sul
    campo `file`;
  - `the Images limit keeps the previous photo` (`fakeImages({ fail: 'limit' })` su una
    ricetta che ha già una foto: `internal`, log `photo_images_limit`, stessa foto
    corrente, nessun oggetto né riga nuovi);
  - `setPhotoFromUrl` con indirizzo `http:` → `photo_url` su `imageUrl`; con 404 →
    `photo_unreachable`; con un AVIF scaricato → `photo_type`; riuscito → risposta con URL
    assoluto quando il token è d'agente;
  - `concurrent replacements leave one current photo` (due chiamate in parallelo, poi
    una sola riga corrente e nessun errore 23505);
  - `a failed transaction leaves an orphan object, never a row` (insert forzato a fallire
    con un trigger temporaneo creato dal test, poi rimosso; l'oggetto resta nel bucket);
  - `unknown recipe is not_found`; `a draft can get a photo`;
  - MCP: `tools/list` contiene `catalogue_setPhotoFromUrl` e `catalogue_removePhoto`, non
    `catalogue_uploadPhoto` (helper `mcp` di `support/requests.ts`).
- [ ] **Passo 2:** con `TEST_DATABASE_URL` impostato e la migrazione applicata,
  `npm test -w server -- test/catalogue/photos.test.ts` → FAIL (operazioni assenti).
- [ ] **Passo 3:** contratto, `write.ts`, router, env, `wrangler.jsonc`, guida (sezione
  «Photos» in inglese con i punti della spec, sezione 5, compresa la conferma esplicita e
  i formati ammessi). Il test del contratto (`checkContract`) resta verde.
- [ ] **Passo 4:** `npm test -w server -- test/catalogue/photos.test.ts`,
  `npm test -w contract` → PASS; `npm run typecheck` → PASS.
- [ ] **Passo 5: commit** «Foto: operazioni del ricettario per caricare, impostare e togliere la foto».

### Compito 4: `photoUrl` nelle viste

**File:**
- Modifica: `contract/src/recipes/views.ts`, `contract/src/catalogue/views.ts`
  (`recipeMatchView`, `draftView`)
- Modifica: `server/src/recipes/views.ts` (`loadContents`, `Content`, riepilogo),
  `server/src/catalogue/views.ts`
- Test: `server/test/recipes/views.test.ts`, `server/test/catalogue/photos.test.ts`

**Interfacce:**
- Produce: `recipeSummaryView.photoUrl: z.string().nullable().optional()` (relativo,
  `null` senza foto e per le ricette mai pubblicate); stesso campo in `recipeMatchView` e
  `draftView` (assoluto via MCP).

- [ ] **Passo 1: test:** `recipes.get`, `recipes.search` e `menu.getWeek` portano
  `photoUrl` `/photos/…` per una ricetta pubblicata con foto, `null` senza foto, `null` per
  una bozza citata da un pasto anche se ha la foto; una lettura con `knownVersion` dopo
  `uploadPhoto` non è «invariata»; `catalogue.searchRecipes` e `getDraft` via agente
  portano l'URL assoluto.
- [ ] **Passo 2:** `npm test -w server -- test/recipes/views.test.ts test/catalogue/photos.test.ts` → FAIL.
- [ ] **Passo 3:** in `loadContents` un `left join app.recipe_photos p on p.recipe_id = r.id and p.removed_at is null`
  nella stessa istruzione; `NEVER_PUBLISHED` con `photoUrl: null`.
- [ ] **Passo 4:** `npm test -w server` → PASS (le viste esistenti non cambiano).
- [ ] **Passo 5: commit** «Foto: indirizzo della foto nelle viste delle ricette».

### Compito 5: rotta `/photos/<chiave>` ed esportazione

**File:**
- Crea: `server/src/photos/serve.ts`
- Modifica: `server/src/app.ts` (smistamento accanto a `/shopping-lists/`)
- Test: `server/test/photos-route.test.ts`, `server/test/asset-routing.test.ts`, `server/test/backup.test.ts`

**Interfacce:**
- Produce: `servePhoto(request: Request, env: Env, key: string): Promise<Response>`.

- [ ] **Passo 1: test:**
  - foto corrente → 200, corpo e intestazioni dei vincoli globali (`Cache-Control`
    esattamente `private, no-store`), `Content-Type` `image/webp`; `HEAD` → 200 senza
    corpo; `POST` → 405; foto tolta → 404; chiave malformata → 404 senza accesso al
    database; oggetto mancante → 404 e log `photo_object_missing`; limitatore che rifiuta
    → 429 `rate_limited`; nessun token richiesto; `/photos/*` instradata al Worker
    (`asset-routing.test.ts` legge `run_worker_first`);
  - in `backup.test.ts`: `exports photo references without image bytes` (la tabella
    `recipe_photos` è nell'esportazione con la chiave; nessun byte d'immagine nel
    documento) e `a restored export finds its photo again` (foto A corrente → esportazione
    → sostituzione con B → ripristino dell'esportazione in un database di prova con il
    percorso già usato dal file → `app.served_photo(A)` restituisce una riga e l'oggetto
    A è ancora nel bucket in memoria).
- [ ] **Passo 2:** `npm test -w server -- test/photos-route.test.ts test/asset-routing.test.ts test/backup.test.ts` → FAIL.
- [ ] **Passo 3:** ordine della spec, sezione 3 (limitatore con chiave `CF-Connecting-IP`,
  forma, `withDb(…, { kind: 'anon' })` con `app.served_photo`, `PHOTOS.get`).
- [ ] **Passo 4:** stesso comando → PASS.
- [ ] **Passo 5: commit** «Foto: rotta pubblica delle immagini correnti, senza cache HTTP».

### Compito 6: limite del corpo del caricamento

**File:**
- Crea: `server/src/photos/upload-limit.ts`
- Modifica: `server/src/app.ts` (in `route`, prima di `contextFor` e `handler.handle`)
- Test: `server/test/photos-upload-limit.test.ts`

**Interfacce:**
- Consuma: `readLimited` non serve qui (il corpo resta un flusso); `PhotoError` del compito 2.
- Produce: `UPLOAD_BODY_LIMIT`; `isPhotoUploadPath(pathname: string): boolean` (RPC
  `/api/rpc/catalogue/uploadPhoto`, OpenAPI `^/api/catalogue/recipes/[^/]+/photo/upload$`);
  `limitUploadBody(request: Request, maxBytes: number): Request | Response` (risposta
  `413` subito se `Content-Length` dichiarato supera il limite; altrimenti una nuova
  `Request` con il corpo passato da un `TransformStream` che conta i byte e va in errore
  oltre il limite). L'errore del flusso, quando arriva dentro oRPC, diventa la stessa
  risposta `413` (`{ code: 'invalid', status: 413, data: { issues: [{ path: ['file'], code: 'photo_too_large' }] } }`):
  `route` riconosce l'errore del limitatore e risponde così.

- [ ] **Passo 1: test** (con `fakeImages` e `MemoryBucket` che contano le chiamate):
  - `refuses a declared oversized upload at once` (`Content-Length` 20 MiB, nessun corpo
    letto, 413, nessuna verifica del token: anche senza `Authorization`);
  - `stops an oversized upload while reading` (corpo multipart a pezzi senza
    `Content-Length`, 12 MiB: 413, il generatore del corpo si ferma poco oltre il limite,
    zero chiamate a `info`, `input` e `put`);
  - un caricamento di 9 MiB passa (con un curatore, 200);
  - gli altri percorsi (`/api/rpc/catalogue/saveDraft`) non sono limitati da qui.
- [ ] **Passo 2:** `npm test -w server -- test/photos-upload-limit.test.ts` → FAIL.
- [ ] **Passo 3:** implementare.
- [ ] **Passo 4:** `npm test -w server` → PASS.
- [ ] **Passo 5: commit** «Foto: limite del corpo del caricamento prima del parser».

### Compito 7: foto nelle schede

**File:**
- Modifica: `web/src/api/types.ts`, `web/src/api/fake/` (ricette con `photoUrl` facoltativo;
  due ricette finte con foto da `design/assets/recipe-images/`, servite nella modalità
  finta da `web/public/` solo se `sync-assets` non le porta già)
- Crea: `web/src/components/RecipePhoto.tsx`
- Modifica: `web/src/components/RecipeCard.tsx`, `RecipeCard.module.css`,
  `web/src/features/meals/RecipePicker.tsx`
- Test: `web/src/components/RecipeCard.test.tsx`, test di `RecipePicker`

**Interfacce:**
- Produce: `RecipePhoto({ url, ratio: '3 / 1' | '16 / 9', children?, onFail? })` che rende
  `meal-media` con `img.meal-photo` (`alt=""`, `loading="lazy"`, `decoding="async"`) e,
  sull'evento `error`, chiama `onFail`.

- [ ] **Passo 1: test:** sostituire `never shows an image: recipes have no photos` con
  `shows the photo banner with the label on it` (img con `src` `/photos/…`, etichetta dentro
  `.meal-media`) e `without a photo the card is unchanged` (snapshot del markup di oggi:
  nessun `.meal-media`, etichetta in `.meal-heading`); `falls back to the plain card when the image fails`
  (evento `error` → nessun `img`, etichetta in `.meal-heading`); ricetta mai pubblicata
  senza immagine (resta); pasto passato con la classe della desaturazione; `RecipePicker`
  con e senza foto.
- [ ] **Passo 2:** `npm test -w web -- RecipeCard RecipePicker` → FAIL.
- [ ] **Passo 3:** implementare; CSS: `aspect-ratio` dal parametro, `.past .meal-photo { filter: grayscale(0.4); opacity: 0.85; }`.
- [ ] **Passo 4:** `npm test -w web` e `npm run typecheck` → PASS.
- [ ] **Passo 5: commit** «Foto: banner 3:1 nelle schede del menu e del ricettario».

### Compito 8: comandi della foto nella scheda ricetta e risposte superate

**File:**
- Crea: `web/src/features/catalogue/photo/resize.ts`, `PhotoControls.tsx`, `photo.module.css`,
  `usePhotoMutations.ts`
- Modifica: `web/src/routes/RecipePage.tsx`, `web/src/i18n/messages/catalogue.ts`,
  `web/src/api/fake/` (le tre operazioni), `web/src/api/mutations.ts`
- Test: `resize.test.ts`, `PhotoControls.test.tsx`, `web/src/routes/RecipePage.test.tsx`,
  `web/src/api/mutations.test.ts`

**Interfacce:**
- Produce:
  - `fitWithin(width: number, height: number, max: number): { width: number; height: number }` (pura, arrotonda);
  - `resizeForUpload(file: File, deps?: { createImageBitmap?, createCanvas? }): Promise<Blob>`
    (2048 px, `image/jpeg`, 0.85; `createImageBitmap(file, { imageOrientation: 'from-image' })`;
    errore → `PhotoResizeError`);
  - in `mutations.ts`: `catalogueChangesConfirmed(session: Session): number` e
    `countCatalogueChangeConfirmed(session: Session): void` (stesso schema di
    `ratingsConfirmed`/`countRatingConfirmed`, ma per sessione, non per famiglia);
    `runMealMutation` legge `catalogueChangesConfirmed` alla partenza e lo aggiunge alla
    condizione di `isLatest`;
  - `useUploadPhoto(recipeId)`, `useRemovePhoto(recipeId)`: `useMutation` con `id` da
    `crypto.randomUUID()` per gesto; `onSuccess` → `countCatalogueChangeConfirmed(session)`,
    poi invalidate `['recipes']`, `['menu']`, `['meals', 'getSuggestions']`,
    `['catalogue']`; `onError` → `useCatalogueRevocation`;
  - `PHOTO_ISSUES: Record<PhotoIssueCode, MessageKey>` per i testi.
- Testi (spec, sezione 6) nel dizionario `catalogue` con le chiavi `photo.add`,
  `photo.menu`, `photo.replace`, `photo.remove`, `photo.removeConfirm`, `photo.removeAction`,
  `photo.back`, `photo.uploading` e `photo.error.<codice>`; `photo.error.photo_type` dice
  «JPEG, PNG o WebP» / «JPEG, PNG or WebP».

- [ ] **Passo 1: test:**
  - `fitWithin(4032, 3024, 2048)` → `{ width: 2048, height: 1536 }`; `fitWithin(800, 600, 2048)` → invariato;
  - `resizeForUpload` con bitmap e canvas finti: chiama `toBlob('image/jpeg', 0.85)` alle
    misure di `fitWithin`;
  - `RecipePage`: membro non curatore senza comandi; curatore senza foto vede «Aggiungi
    foto», con foto vede il pulsante «Foto» sulla foto e nessun «Aggiungi foto»; scegliere
    un file chiama `catalogue.uploadPhoto` con il blob ridimensionato e mostra
    «Caricamento…» disabilitato; risposta → rilettura della ricetta; foglio con
    «Sostituisci la foto» e «Togli la foto», conferma «Togliere la foto?» → `removePhoto`;
    errore `invalid` con `photo_too_small` → testo tradotto; offline → comandi disabilitati;
  - `RecipeCard` nel menu e nel ricettario non ha comandi della foto anche per un curatore;
  - in `mutations.test.ts`: `a meal answer prepared before a photo change is not written`
    (avviare `runMealMutation` con una `call` trattenuta che risponde con la settimana con
    la foto vecchia; nel frattempo `countCatalogueChangeConfirmed`; liberare la risposta:
    `applied` falso, la settimana in cache non è sovrascritta ed è marcata scaduta);
    lo stesso scenario senza modifiche del ricettario resta `applied` vero.
- [ ] **Passo 2:** `npm test -w web -- resize PhotoControls RecipePage mutations` → FAIL.
- [ ] **Passo 3:** implementare; foto 16:9 con `RecipePhoto` sotto `PageHeader`; foglio con
  `BottomSheet`; input di file nascosto `accept="image/*"` attivato dai pulsanti.
- [ ] **Passo 4:** `npm test -w web`, `npm run typecheck` → PASS.
- [ ] **Passo 5: commit** «Foto: aggiungere, sostituire e togliere la foto dalla scheda ricetta».

### Compito 9: foto offline nel service worker

**File:**
- Modifica: `web/src/pwa/sw-rules.ts`, `sw-core.ts`, `sw.ts`; il punto dove la sessione
  registra i propri agganci `onClose` (come la coda della spesa in
  `web/src/features/shopping/queue/queue.ts`); `web/vite.config.ts` (proxy di `/photos`
  come `/api`)
- Crea: `web/src/pwa/photos.ts` (lato pagina: `clearPhotos()`)
- Test: `sw-rules.test.ts`, `sw-core.test.ts`, `web/src/pwa/photos.test.ts`

**Interfacce:**
- Produce: `Strategy` con `'photo'`; `PHOTO_CACHE = 'cosasimangia-photos-v1'`;
  `PHOTO_CACHE_LIMIT = 300`; `staleCaches` che non restituisce mai `PHOTO_CACHE`;
  in `sw-core.ts` uno stato `photoEpoch` in `WorkerDeps` (`{ value: number }`) e
  `handleMessage` che, con `{ type: 'clear-photos' }`, fa crescere l'epoca, cancella
  `PHOTO_CACHE` e risponde `{ type: 'photos-cleared' }` sulla porta;
  `clearPhotos(deps?: { serviceWorker?, caches? }): Promise<void>` lato pagina (messaggio al
  controller con un `MessageChannel` e attesa della risposta, al più 2 s; senza controller
  o senza risposta, `caches.delete(PHOTO_CACHE)` diretto).

- [ ] **Passo 1: test:** `strategyFor` → `'photo'` per `GET /photos/<chiave>` della stessa
  origine, `'passthrough'` per altri metodi e origini; `staleCaches` con
  `cosasimangia-photos-v1` fra i nomi non la elenca; `respond` per una foto: dalla cache se
  c'è, altrimenti rete e salvataggio solo per 200 `image/*`, mai per 404; oltre 300 voci
  toglie le più vecchie; `install`/`activate` non toccano la cache delle foto;
  `a response arriving during sign-out is not stored` (fetch trattenuta; `clear-photos`
  arriva; la fetch risponde 200: la foto torna alla pagina ma la cache resta vuota);
  `clears the photo cache when the session closes` (chiusura della sessione → `clearPhotos`
  chiamata; senza controller cancella la cache direttamente).
- [ ] **Passo 2:** `npm test -w web -- sw-rules sw-core photos` → FAIL.
- [ ] **Passo 3:** implementare.
- [ ] **Passo 4:** `npm test -w web`, `npm run build -w web` → PASS.
- [ ] **Passo 5: commit** «Foto: cache delle foto viste nel service worker».

### Compito 10: prova sullo stack locale e documentazione

**File:**
- Modifica: `supabase/README.md` (bucket delle foto non ripristinato e mai ripulito in
  automatico: un ripristino da qualunque esportazione conservata trova le immagini;
  oggetti orfani possibili; una pulizia futura dovrà considerare tutte le esportazioni
  conservate), `progetto/superpowers/specs/2026-10-16-foto-ricette.md` (esito delle prove,
  punto EXIF)

- [ ] **Passo 1:** stack locale (`supabase start`, `supabase migration up`, `wrangler dev`
  con R2 e Images simulati, Vite con le variabili locali; URL di Auth controllato prima
  dell'accesso).
- [ ] **Passo 2:** con agent-browser, a 390 px e a desktop: curatore carica una foto da
  file nella scheda ricetta; schede del menu e del ricettario con e senza foto confrontate
  con `design/references/hellofresh/` e il prototipo; sostituzione e rimozione; offline
  dopo una visita (foto viste presenti, non viste senza riquadro); dopo l'uscita la cache
  `cosasimangia-photos-v1` è vuota e la risposta di `/photos/*` porta
  `Cache-Control: private, no-store`; screenshot nel messaggio della PR.
- [ ] **Passo 3:** via REST locale `setPhotoFromUrl` con un'immagine pubblica; con una
  JPEG con EXIF GPS verificare che il WebP salvato non abbia blocchi `EXIF`/`XMP`; se li
  ha, aggiungere in `process.ts` la rimozione dei blocchi RIFF con un test e annotarlo
  nella spec.
- [ ] **Passo 4:** con `TEST_DATABASE_URL` impostato: `npm run typecheck`, `npm test`,
  `supabase test db`, `npm run build -w web` → tutti verdi.
- [ ] **Passo 5: commit** «Foto: prova sullo stack locale e note di ripristino».

Poi PR unica verso `main` (protocollo, fase 6) con passi esterni della spec, sezione 8, e
prove a mano sull'iPhone della sezione 9.
