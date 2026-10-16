# Foto delle ricette: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Obiettivo:** una foto per ricetta, caricata dai curatori dalla scheda ricetta o impostata
dall'agente da un indirizzo, mostrata nelle schede (3:1) e nella scheda ricetta (16:9),
disponibile offline dopo una visita.

**Architettura:** tabella `app.recipe_photos` fuori dal documento ricetta; immagini WebP
in un bucket R2 nuovo, prodotte una volta al caricamento dal binding Images; rotta
pubblica `/photos/<chiave>` che serve solo le foto correnti; campo facoltativo `photoUrl`
nelle viste; cache dedicata nel service worker; pulizia nel cron notturno.

**Stack:** Postgres/pgTAP (Supabase), Worker Cloudflare (oRPC, R2, Images, ratelimit),
React (TanStack Query), service worker scritto a mano, Vitest.

**Spec:** `progetto/superpowers/specs/2026-10-16-foto-ricette.md` (leggerla prima di ogni
compito; i numeri di sezione sotto sono i suoi).

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
- Ingresso: `image/jpeg|png|webp|avif`; lato corto ≥ 400 px; al più 10 MB; risultato al
  più 1 MB.
- Indirizzi: solo `https:`, porta assente o 443, niente credenziali, lunghezza ≤ 2048,
  niente IP letterali, `localhost`, nomi senza punto, suffissi `.local` `.internal`
  `.localhost` `.home.arpa`, né l'host dell'app, `*.workers.dev`, `*.supabase.co`;
  `redirect: 'manual'`, al più 3 redirect rivalidati, 10 s per tutta la catena.
- Codici d'errore (issue di `invalid`): `photo_type`, `photo_too_small`,
  `photo_too_large`, `photo_unreadable`, `photo_url`, `photo_unreachable`.
- Conservazione: 30 giorni dopo `removed_at`; orfani dopo 2 giorni.
- Service worker: cache `cosasimangia-photos-v1`, 300 voci, cancellata alla chiusura
  della sessione, esclusa da `staleCaches`.
- Rotta: limitatore `PHOTO_READ_LIMIT` (`namespace_id` `9103`, 300 ogni 60 s); intestazioni
  `Cache-Control: public, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`,
  `Content-Security-Policy: default-src 'none'; sandbox`,
  `Cross-Origin-Resource-Policy: same-origin`, `ETag`.
- Prove locali mai contro la produzione (`protocollo-worker.md`, «Prove sullo stack
  locale»).

## Punti da guardare in revisione

1. **Foto sostituita due volte in fretta** (due curatori, o doppio tocco): resta una sola
   foto corrente, la seconda arrivata; nessuna violazione dell'indice univoco. Test nel
   compito 3 (`concurrent replacements leave one current photo`).
2. **Redirect verso un host interno dopo uno esterno valido:** rifiutato con `photo_url`.
   Test nel compito 2 (`refuses a redirect to a blocked host`).
3. **Corpo senza `Content-Length` oltre 10 MB:** lettura interrotta, `photo_too_large`,
   nessun oggetto in R2. Test nel compito 2 (`stops reading past the limit`).
4. **Scheda con foto offline mai vista:** nessun riquadro vuoto né icona rotta; la scheda
   torna senza foto. Test nel compito 7 (`falls back to the plain card when the image fails`).
5. **Logout:** la cache delle foto sparisce con la sessione; un altro utente sullo stesso
   dispositivo non trova foto dell'utente precedente. Test nel compito 9
   (`clears the photo cache when the session closes`).

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
- [ ] **Passo 2:** `supabase test db` → FAIL (tabella assente).
- [ ] **Passo 3: migrazione.** Grant: `select, insert` su `app.recipe_photos` e
  `update (removed_at, removed_by)` ad `authenticated`; policy `recipe_photos_read`
  (select) con `exists (select 1 from app.recipes r where r.id = recipe_id)` (si appoggia
  all'RLS di `recipes`), `recipe_photos_curate` (insert, update) con
  `app.has_role('recipe_curator')`; `select` ad `app_backup`. Check
  `removed_by is null or removed_at is not null` e `removed_at is null or removed_at >= created_at`.
- [ ] **Passo 4:** `supabase test db` → PASS (tutti i file).
- [ ] **Passo 5: commit** «Foto: tabella delle foto delle ricette e funzione pubblica».

### Compito 2: immagini nel Worker (indirizzo, scaricamento, trasformazione, chiave)

**File:**
- Crea: `contract/src/catalogue/photos.ts` (codici e vista, esportati da `contract/src/catalogue/index.ts`)
- Crea: `server/src/catalogue/photos/url.ts`, `download.ts`, `process.ts`, `key.ts`, `errors.ts`
- Crea: `server/test/catalogue/photos-unit.test.ts`, `server/test/support/images.ts`

**Interfacce:**
- Produce (contratto): `PHOTO_ISSUE_CODES = ['photo_type','photo_too_small','photo_too_large','photo_unreadable','photo_url','photo_unreachable'] as const`,
  `type PhotoIssueCode`; `photoView = z.object({ recipeId: z.uuid(), photo: z.object({ id: z.uuid(), url: z.string(), width: z.number().int().positive(), height: z.number().int().positive() }).nullable() })`.
- Produce (server):
  - `class PhotoError extends Error { readonly code: PhotoIssueCode }`;
  - `allowedImageUrl(raw: string, appHost: string): URL | null` (regole dei vincoli globali);
  - `downloadImage(url: URL, deps: { fetch: typeof fetch; appHost: string; timeoutMs?: number; maxBytes?: number; maxRedirects?: number }): Promise<Uint8Array>`
    (default 10 000 ms, 10 MiB, 3; errori `photo_url`, `photo_unreachable`, `photo_too_large`);
  - `type PhotoImages = Pick<ImagesBinding, 'info' | 'input'>`;
    `processPhoto(images: PhotoImages, bytes: Uint8Array): Promise<ProcessedPhoto>` con
    `ProcessedPhoto = { body: Uint8Array; contentType: 'image/webp'; width: number; height: number }`
    (misure lette con un secondo `info` sul risultato; errori `photo_type`,
    `photo_too_small`, `photo_too_large`, `photo_unreadable`; un errore del servizio resta
    un `Error` qualsiasi → `internal` più avanti);
  - `newPhotoKey(): string`, `PHOTO_KEY: RegExp`, `photoPath(key: string): string`
    (`/` + chiave), `photoUrl(key: string, origin?: string): string`.
- Produce (test): `fakeImages(options?: { fail?: 'unreadable' | 'service' }): PhotoImages`
  che legge formato e misure dall'intestazione (JPEG SOF, PNG IHDR, WebP VP8/VP8L/VP8X, SVG
  dal testo) e restituisce un WebP minimo con misure scalate; `jpegOf(width, height)`,
  `pngOf(width, height)` piccoli file validi solo nell'intestazione.

- [ ] **Passo 1: test** in `photos-unit.test.ts`:
  - `allowedImageUrl`: accetta `https://ricette.example.it/a.jpg`; rifiuta `http:`,
    `https://user:pw@x.it/a`, `https://x.it:8443/a`, `https://127.0.0.1/a`, `https://[::1]/a`,
    `https://localhost/a`, `https://intranet/a`, `https://nas.local/a`,
    `https://x.internal/a`, l'host dell'app, `https://w.workers.dev/a`,
    `https://p.supabase.co/a`, un URL di 2049 caratteri;
  - `downloadImage` con `fetch` finta: `refuses a redirect to a blocked host`
    (302 → `https://127.0.0.1/`, `photo_url`); quattro redirect → `photo_unreachable`;
    404 → `photo_unreachable`; `Content-Length: 11000000` → `photo_too_large` senza
    leggere il corpo; `stops reading past the limit` (corpo a pezzi senza
    `Content-Length`, oltre 10 MiB → `photo_too_large`, lettore annullato); tempo scaduto
    (fetch che non risponde, `timeoutMs: 50`) → `photo_unreachable`; nessun `cookie` né
    `authorization` fra le intestazioni inviate;
  - `processPhoto`: JPEG 3000×2000 → WebP 1600×1067, `contentType` `image/webp`; SVG →
    `photo_type`; GIF → `photo_type`; 600×300 → `photo_too_small`; `fail: 'unreadable'`
    (info che lancia) → `photo_unreadable`; risultato oltre 1 MiB → `photo_too_large`;
  - `newPhotoKey()` soddisfa `PHOTO_KEY`, due chiamate diverse.
- [ ] **Passo 2:** `npx vitest run server/test/catalogue/photos-unit.test.ts` → FAIL.
- [ ] **Passo 3:** implementare i moduli. IP letterale: host fra parentesi quadre o tutto
  numeri e punti (anche forme esadecimali/ottali: `new URL` le normalizza in decimale
  puntato, quindi basta il test sul risultato). Il conteggio dei byte legge
  `response.body.getReader()` e chiama `cancel()` oltre il limite.
- [ ] **Passo 4:** test → PASS; `npm run typecheck` → PASS.
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
    `{ id: z.uuid(), recipeId: z.uuid(), file: z.file().mime(['image/jpeg','image/png','image/webp','image/avif']).max(10 * 1024 * 1024) }`);
  - `catalogue.setPhotoFromUrl` (`mcp: { readOnly: false }`, `creates: true`;
    `PUT /catalogue/recipes/{recipeId}/photo`; input `{ id, recipeId, imageUrl: z.string().trim().min(1).max(2048) }`;
    `summary` che dice di mostrare l'immagine al curatore e impostarla solo dopo un sì
    esplicito);
  - `catalogue.removePhoto` (`mcp: { readOnly: false }`; `DELETE /catalogue/recipes/{recipeId}/photo`;
    input `{ recipeId }`; output `photoView` con `photo: null`);
  - tutte e tre `errors({ not_found })`, output `photoView`;
  - `setRecipePhoto(context: OperationContext, input: { id: string; recipeId: string; bytes: () => Promise<Uint8Array> }): Promise<PhotoView>`
    e `removeRecipePhoto(context: OperationContext, recipeId: string): Promise<PhotoView>`;
  - `Env`: `PHOTOS?: R2Bucket`, `IMAGES?: PhotoImages`, `PHOTO_READ_LIMIT: RateLimiter`;
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
  con campo `file` o `imageUrl`. URL della risposta assoluto quando `context.channel === 'mcp'`.

- [ ] **Passo 1: test** in `photos.test.ts` (database locale, `catalogueActors()`,
  `MemoryBucket`, `fakeImages()`, `fetch` finta per gli indirizzi iniettata nell'env di
  test tramite una funzione `fetchImage` opzionale di `Env` usata solo dai test, default
  `fetch`):
  - `a member who is not a curator gets forbidden` sulle tre operazioni;
  - `uploads, replaces and removes a photo`: dopo il caricamento una riga corrente e un
    oggetto; dopo la sostituzione due righe, una con `removed_at`, due oggetti; dopo la
    rimozione nessuna corrente, oggetti intatti; `removePhoto` ripetuto risponde
    `photo: null` senza scrivere;
  - `repeating the same id does no new work` (un solo oggetto, stessa risposta);
  - `the same id for another recipe is invalid`;
  - `refuses types and sizes` (SVG, GIF, 600×300, illeggibile) con il codice sul campo `file`;
  - `setPhotoFromUrl` con indirizzo `http:` → `photo_url` su `imageUrl`; con 404 →
    `photo_unreachable`; riuscito → risposta con URL assoluto quando il token è d'agente;
  - `concurrent replacements leave one current photo` (due chiamate in parallelo, poi
    una sola riga corrente e nessun errore 23505);
  - `a failed transaction leaves an orphan object, never a row` (insert forzato a fallire
    con un trigger temporaneo creato dal test, poi rimosso);
  - `unknown recipe is not_found`; `a draft can get a photo`;
  - MCP: `tools/list` contiene `catalogue_setPhotoFromUrl` e `catalogue_removePhoto`, non
    `catalogue_uploadPhoto` (helper `mcp` di `support/requests.ts`).
- [ ] **Passo 2:** `npx vitest run server/test/catalogue/photos.test.ts` → FAIL.
- [ ] **Passo 3:** contratto, `write.ts`, router, env, `wrangler.jsonc`, guida (sezione
  «Photos» in inglese con i punti della spec, sezione 5, compresa la conferma esplicita).
  Il test del contratto (`checkContract`) resta verde.
- [ ] **Passo 4:** test del server e del contratto → PASS; `npm run typecheck` → PASS.
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
- [ ] **Passo 2:** test → FAIL.
- [ ] **Passo 3:** in `loadContents` un `left join app.recipe_photos p on p.recipe_id = r.id and p.removed_at is null`
  nella stessa istruzione; `NEVER_PUBLISHED` con `photoUrl: null`.
- [ ] **Passo 4:** `npm test -w server` → PASS (le viste esistenti non cambiano).
- [ ] **Passo 5: commit** «Foto: indirizzo della foto nelle viste delle ricette».

### Compito 5: rotta `/photos/<chiave>`

**File:**
- Crea: `server/src/photos/serve.ts`
- Modifica: `server/src/app.ts` (smistamento accanto a `/shopping-lists/`)
- Test: `server/test/photos-route.test.ts`, `server/test/asset-routing.test.ts`

**Interfacce:**
- Produce: `servePhoto(request: Request, env: Env, key: string): Promise<Response>`.

- [ ] **Passo 1: test:** foto corrente → 200, corpo e intestazioni dei vincoli globali,
  `Content-Type` `image/webp`; `HEAD` → 200 senza corpo; `POST` → 405; foto tolta → 404;
  chiave malformata → 404 senza accesso al database; oggetto mancante → 404 e log
  `photo_object_missing`; limitatore che rifiuta → 429 `rate_limited`; nessun token
  richiesto; `/photos/*` instradata al Worker (`asset-routing.test.ts` legge
  `run_worker_first`).
- [ ] **Passo 2:** test → FAIL.
- [ ] **Passo 3:** ordine della spec, sezione 3 (limitatore con chiave `CF-Connecting-IP`,
  forma, `withDb(…, { kind: 'anon' })` con `app.served_photo`, `PHOTOS.get`).
- [ ] **Passo 4:** test → PASS.
- [ ] **Passo 5: commit** «Foto: rotta pubblica delle immagini correnti».

### Compito 6: pulizia notturna ed esportazione

**File:**
- Crea: `server/src/catalogue/photos/sweep.ts`
- Modifica: `server/src/scheduled.ts`, `server/test/support/r2.ts` (`list` restituisce
  anche `uploaded: Date`; `put` lo registra; un campo per fissarlo nei test)
- Test: `server/test/photos-sweep.test.ts`, `server/test/backup.test.ts`, `server/test/scheduled.test.ts`

**Interfacce:**
- Produce: `PHOTO_RETENTION_DAYS = 30`, `ORPHAN_GRACE_DAYS = 2`;
  `sweepPhotosOn(deps: { sql: postgres.Sql; bucket: R2Bucket }, now: Date): Promise<{ deleted: number; orphans: number }>`;
  `runPhotoSweep(env: Env, time: Date): Promise<void>` (non lancia; log
  `photo_sweep_done`, `photo_sweep_failed`, `photo_sweep_not_configured`).

- [ ] **Passo 1: test:** tolta 31 giorni fa → oggetto cancellato; tolta 29 giorni fa →
  conservato; corrente → conservato; orfano caricato 3 giorni fa → cancellato; orfano di
  1 giorno → conservato; riga resta nel database; elenco a più pagine (`pageSize` 2);
  `dispatchScheduled(NIGHTLY_EXPORT_CRON)` esegue esportazione e pulizia, e un errore
  della pulizia non impedisce l'esportazione (e viceversa); l'esportazione contiene
  `app.recipe_photos` con la chiave e senza byte d'immagine.
- [ ] **Passo 2:** test → FAIL.
- [ ] **Passo 3:** lettura nel ruolo `backup` (`withDbOn(sql, { kind: 'backup' }, …)`),
  cancellazioni a gruppi di al più 1000 chiavi.
- [ ] **Passo 4:** `npm test -w server` → PASS.
- [ ] **Passo 5: commit** «Foto: conservazione di 30 giorni e pulizia notturna».

### Compito 7: foto nelle schede

**File:**
- Modifica: `web/src/api/types.ts`, `web/src/api/fake/` (ricette con `photoUrl` facoltativo;
  due ricette finte con foto da `design/assets/recipe-images/` copiate in `web/public/`
  solo per la modalità finta, se `sync-assets` non le porta già)
- Modifica: `web/src/components/RecipeCard.tsx`, `RecipeCard.module.css`,
  `web/src/features/meals/RecipePicker.tsx`
- Test: `web/src/components/RecipeCard.test.tsx`, test di `RecipePicker`

**Interfacce:**
- Produce: componente `RecipePhoto({ url, ratio: '3 / 1' | '16 / 9', children?, past? })`
  in `web/src/components/RecipePhoto.tsx` che rende `meal-media` con `img.meal-photo`
  (`alt=""`, `loading="lazy"`, `decoding="async"`) e, sull'evento `error`, chiama
  `onFail` o non rende nulla.

- [ ] **Passo 1: test:** sostituire `never shows an image: recipes have no photos` con
  `shows the photo banner with the label on it` (img con `src` `/photos/…`, etichetta dentro
  `.meal-media`) e `without a photo the card is unchanged` (snapshot del markup di oggi:
  nessun `.meal-media`, etichetta in `.meal-heading`); `falls back to the plain card when the image fails`
  (evento `error` → nessun `img`, etichetta in `.meal-heading`); ricetta mai pubblicata
  senza immagine (resta); pasto passato con la classe della desaturazione; `RecipePicker`
  con e senza foto.
- [ ] **Passo 2:** `npm test -w web -- RecipeCard` → FAIL.
- [ ] **Passo 3:** implementare; CSS: `aspect-ratio` dal parametro, `.past .meal-photo { filter: grayscale(0.4); opacity: 0.85; }`.
- [ ] **Passo 4:** `npm test -w web` e `npm run typecheck` → PASS.
- [ ] **Passo 5: commit** «Foto: banner 3:1 nelle schede del menu e del ricettario».

### Compito 8: comandi della foto nella scheda ricetta

**File:**
- Crea: `web/src/features/catalogue/photo/resize.ts`, `PhotoControls.tsx`, `photo.module.css`,
  `usePhotoMutations.ts`
- Modifica: `web/src/routes/RecipePage.tsx`, `web/src/i18n/messages/catalogue.ts`,
  `web/src/api/fake/` (le tre operazioni)
- Test: `resize.test.ts`, `PhotoControls.test.tsx`, `web/src/routes/RecipePage.test.tsx`

**Interfacce:**
- Produce:
  - `fitWithin(width: number, height: number, max: number): { width: number; height: number }` (pura, arrotonda);
  - `resizeForUpload(file: File, deps?: { createImageBitmap?, createCanvas? }): Promise<Blob>`
    (2048 px, `image/jpeg`, 0.85; `createImageBitmap(file, { imageOrientation: 'from-image' })`;
    errore → `PhotoResizeError`);
  - `useUploadPhoto(recipeId)`, `useRemovePhoto(recipeId)`: `useMutation` con `id` da
    `crypto.randomUUID()` per gesto; `onSuccess` → invalidate `['recipes']`, `['menu']`,
    `['meals', 'getSuggestions']`, `['catalogue']`; `onError` → `useCatalogueRevocation`;
  - `PHOTO_ISSUES: Record<PhotoIssueCode, MessageKey>` per i testi.
- Testi (spec, sezione 6) nel dizionario `catalogue` con le chiavi `photo.add`,
  `photo.menu`, `photo.replace`, `photo.remove`, `photo.removeConfirm`, `photo.removeAction`,
  `photo.back`, `photo.uploading` e `photo.error.<codice>`.

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
  - `RecipeCard` nel menu e nel ricettario non ha comandi della foto anche per un curatore.
- [ ] **Passo 2:** test → FAIL.
- [ ] **Passo 3:** implementare; foto 16:9 con `RecipePhoto` sotto `PageHeader`; foglio con
  `BottomSheet`; input di file nascosto `accept="image/*"` attivato dai pulsanti.
- [ ] **Passo 4:** `npm test -w web`, `npm run typecheck` → PASS.
- [ ] **Passo 5: commit** «Foto: aggiungere, sostituire e togliere la foto dalla scheda ricetta».

### Compito 9: foto offline nel service worker

**File:**
- Modifica: `web/src/pwa/sw-rules.ts`, `sw-core.ts`, `sw.ts`; `web/src/session/session.ts`
  o il punto dove si registrano gli agganci `onClose` (registrazione dell'aggancio che
  cancella la cache); `web/vite.config.ts` (proxy di `/photos` come `/api`)
- Test: `sw-rules.test.ts`, `sw-core.test.ts`, test della sessione

**Interfacce:**
- Produce: `Strategy` con `'photo'`; `PHOTO_CACHE = 'cosasimangia-photos-v1'`;
  `PHOTO_CACHE_LIMIT = 300`; `staleCaches` che non restituisce mai `PHOTO_CACHE`;
  `clearPhotoCache(caches: Pick<CachesLike, 'delete'>): Promise<void>`.

- [ ] **Passo 1: test:** `strategyFor` → `'photo'` per `GET /photos/<chiave>` della stessa
  origine, `'passthrough'` per altri metodi e origini; `staleCaches` con
  `cosasimangia-photos-v1` fra i nomi non la elenca; `respond` per una foto: dalla cache se
  c'è, altrimenti rete e salvataggio solo per 200 `image/*`, mai per 404; oltre 300 voci
  toglie le più vecchie; `install`/`activate` non toccano la cache delle foto;
  `clears the photo cache when the session closes`.
- [ ] **Passo 2:** test → FAIL.
- [ ] **Passo 3:** implementare.
- [ ] **Passo 4:** `npm test -w web`, `npm run build -w web` → PASS.
- [ ] **Passo 5: commit** «Foto: cache delle foto viste nel service worker».

### Compito 10: prova sullo stack locale e documentazione

**File:**
- Modifica: `supabase/README.md` (bucket delle foto non ripristinato, conservazione di
  30 giorni contro le 7 esportazioni), `progetto/superpowers/specs/2026-10-16-foto-ricette.md`
  (esito delle prove, punto EXIF)

- [ ] **Passo 1:** stack locale (`supabase start`, `wrangler dev` con R2 e Images
  simulati, Vite con le variabili locali; URL di Auth controllato prima dell'accesso).
- [ ] **Passo 2:** con agent-browser, a 390 px e a desktop: curatore carica una foto da
  file nella scheda ricetta; schede del menu e del ricettario con e senza foto confrontate
  con `design/references/hellofresh/` e il prototipo; sostituzione e rimozione; offline
  dopo una visita (foto viste presenti, non viste senza riquadro); screenshot nel
  messaggio della PR.
- [ ] **Passo 3:** via MCP locale (o REST) `setPhotoFromUrl` con un'immagine pubblica; con
  una JPEG con EXIF GPS verificare che il WebP salvato non abbia blocchi `EXIF`/`XMP`; se
  li ha, aggiungere in `process.ts` la rimozione dei blocchi RIFF con un test e annotarlo
  nella spec.
- [ ] **Passo 4:** `npm run typecheck`, `npm test`, `supabase test db`,
  `npm run build -w web` → tutti verdi.
- [ ] **Passo 5: commit** «Foto: prova sullo stack locale e note di ripristino».

Poi PR unica verso `main` (protocollo, fase 6) con passi esterni della spec, sezione 8, e
prove a mano sull'iPhone della sezione 9.
