# Piano generale dell'implementazione

Creato: 11 ottobre 2026
Ultimo aggiornamento: 11 ottobre 2026
Stato: approvato dall'utente l'11 ottobre 2026; ondata 1 avviata.

Coordina il lavoro dalla fine del prototipo all'app funzionante. Sostituisce la tabella
delle fasi della specifica, sezione 10 (da riscrivere a fine ondata 1 con questo
schema), e il piano M1a del 29 settembre. Ogni attività ha la sua spec di dettaglio e
il suo piano, che rimandano alla specifica principale e restano subordinati a essa.

## Obiettivo

**Traguardo A: l'app usata ogni settimana dalla famiglia di Federico**, con ricettario
gestito anche tramite agente MCP. Poi l'app diventa un prodotto aperto ad altre famiglie.

Scelte dell'utente dell'11 ottobre 2026 sul perimetro del traguardo A:

- comprende la gestione del ricettario tramite MCP (bozze, versioni, pubblicazione);
- accessi diretti con utenze Supabase; primi utenti e famiglie creati a mano da
  Supabase; inviti, wizard e accesso con Google arrivano dopo, nella fase prodotto;
- passi esterni (DNS di `qunidi.it`, Resend, Google) rimandati finché non servono:
  si parte dall'indirizzo `workers.dev`.

## Ondate

### Ondata 1: fondamenta (5 worker in parallelo)

| # | Attività | Branch | Proprietà (directory) | Contenuto |
|---|---|---|---|---|
| 1 | Piattaforma | `fondamenta/piattaforma` | radice (`package.json`, workspace, CI), `contract/` (struttura e convenzioni), `server/`, configurazione Wrangler | Scheletro del repository; Worker che serve SPA, `/api/rpc`, `/api`, OpenAPI e `/mcp` dal contratto; verifica JWT con `jose`; transazione nel ruolo dell'utente; Hyperdrive con limite di connessioni; errori a codici; metadati delle operazioni (`mcp`, `webOnly`, `offline`, ruolo) con test; contatori di versione e risposta «invariato» come meccanismo; deploy su `workers.dev`; verifica dell'integrazione GitHub di Supabase e flusso Git. **Prima consegna: scheletro minimo da unire subito** |
| 2 | Schema e permessi | `fondamenta/schema` | `supabase/` | Migrazioni delle sezioni 2 e 7: profili, ruoli globali, famiglie, membri, ricette, proiezioni, bozze, versioni, ingredienti, settimane, pasti, modifiche, voti, spesa, job. RLS con test delle policy; database locale per i test; dati iniziali a mano per la famiglia |
| 3 | Ricetta e import | `fondamenta/ricetta-import` | `domain/src/recipe/`, `scripts/import/` | Schema del documento ricetta (zod) con livello bozza e livello pubblicabile; scelta sui campi bilingui; controlli di completezza; proiezioni; import rilanciabile da `../meal_planner` con i casi R4, report delle ambiguità, traduzioni en-GB da rivedere |
| 4 | Unità e spesa | `fondamenta/unita-spesa` | `domain/src/units/`, `domain/src/shopping/` | Dominio puro: codici delle unità, sistema metrico e imperiale britannico, equivalenze per ingrediente, scalatura delle porzioni, consolidamento della lista, pezzi interi, unità di acquisto (sezione 6); si parte da `prototype/src/lib/units` e dai test del prototipo |
| 5 | App web di base | `fondamenta/web` | `web/` | React con Vite, TanStack Router e Query; token e componenti da `design/`; testi in italiano e inglese britannico; navbar, schermate principali del prototipo con dati finti; PWA; login con utenza Supabase |

**Interfacce da concordare fra worker** (le decide il coordinatore, registrate qui sotto):

- documento ricetta (3) ↔ tabelle `recipe_versions`, `recipe_drafts` e proiezioni (2);
- codici delle unità e struttura delle righe di ingrediente (3) ↔ dominio unità e spesa (4);
- convenzioni del contratto, errori e contesto (1) ↔ operazioni delle ondate successive;
- ruolo tecnico del server, impostazione dei claim e ruolo `authenticated` (1) ↔ policy (2);
- client oRPC, token di sessione e cache persistita (1) ↔ app web (5).

### Ondata 2: traguardo A

Ogni attività comprende operazioni del contratto, schermate e strumenti MCP derivati,
test. Ordine e parallelismo si fissano a fine ondata 1.

| Attività | Sezioni della specifica |
|---|---|
| Profilo, famiglia e impostazioni (senza inviti) | 2, 7 |
| Ricettario e voti | 2, 8, 12 |
| Menu, pianificatore, job del mercoledì e generazione pigra | 3, 4, 5 |
| Revisione dei pasti | 5 |
| Spesa, anche offline | 6 |
| Gestione del ricettario tramite MCP: bozze, conflitti, versioni, pubblicazione, archiviazione, ripristino della singola ricetta; bozze visibili nell'app | 8, 13 |
| Collegamento degli agenti (OAuth 2.1 di Supabase, pagina «Collega un agente», scollegamento) | 13 |
| Esportazione notturna in R2 | 8 |
| Messa in produzione: import del ricettario e dei dati della famiglia | 11 |

### Ondata 3: prodotto

Inviti familiari e all'app, wizard, accesso con Google, Resend e dominio
`cosasimangia.qunidi.it`, amministrazione dell'app, ripristino dell'intero catalogo,
Claude Desktop e ChatGPT, cancellazioni, apertura ad altre famiglie, modulo manuale del
ricettario (ultima priorità), giudice AI opzionale.

### Ordine dell'ondata 2 (approvato dall'utente l'11 ottobre 2026)

Dopo quattro review di spec «da rifare» per interfacce incompatibili scritte in
parallelo. Un consumatore implementa solo ciò che dipende da interfacce fissate qui o
già unite.

| Interfaccia | Produttore | Consumatori |
|---|---|---|
| Viste della ricetta (`contract/src/recipes/views.ts`, `server/src/recipes/views.ts`), `ratings.set`, `IngredientList` | W6 | W1 (schede del menu) |
| `mealRecipeVersions` (`server/src/menu/versions.ts`) | W1 | W4 |
| `resolveFamilySettings` e schema delle impostazioni (`domain/src/family/settings.ts`) | W2 | W1 |
| Implementatore unico in `server/src/router.ts`, tipo `Implementer` | piattaforma (chi arriva prima, forma fissata sopra) | tutti |
| Client oRPC reale e agganci di sessione per la coda della spesa | W5 (seconda PR) | parti web di W1, W2, W4, W6 |

1. **Interfacce:** W6 scrive «Interfaccia per W1», W4 «Interfaccia richiesta a W5»; il
   coordinatore le registra qui come definitive. W1 completa la spec sulle viste solo dopo.
2. **Produttori con PR piccole, unite presto:** viste di W6, `resolveFamilySettings` di W2,
   `mealRecipeVersions` di W1, seconda PR di W5 con gli agganci.
3. **Consumatori:** schede del menu, spesa, e ogni parte web dopo la seconda PR di W5.
4. **Regola:** prima di lanciare un worker, tabella produttori → consumatori in questo
   piano; il worker parte solo con gli input fissati o uniti.

#### Attività restanti dell'ondata 2 (approvato dall'utente l'11 ottobre 2026)

| Attività | Usa | Produce per | Assegnata |
|---|---|---|---|
| Gestione del ricettario tramite MCP (area `catalogue`) | documento ricetta e controlli (W3), schema di bozze e versioni, viste di W6, pipeline | bozze visibili nell'app → web di W6 (dopo la #17) | W3 |
| Revisione dei pasti | menu (W1), esclusioni (W2), viste e voti (W6) | — | W1, dopo il web del menu |
| Collegamento degli agenti | piattaforma e verifica dei token; OAuth sul progetto Supabase (passo esterno) | prova della revoca | da assegnare, con l'utente |
| Esportazione notturna in R2 | ricettario e versioni; bucket R2 (passo esterno) | — | da assegnare, con l'utente |
| Messa in produzione | tutto | — | ultima |

## Metodo per ogni attività

1. Worker Claude in una tab herdr, con branch e worktree dedicati in `.worktrees/`.
2. **Brainstorming** (skill `superpowers:brainstorming`): il coordinatore risponde ai
   dubbi; le decisioni dell'utente passano dal coordinatore o, se serve, dal Remote
   Control sul worker.
3. **Spec di dettaglio** in `progetto/superpowers/specs/` e **piano** in
   `progetto/superpowers/plans/`.
4. **Review avversariale di spec e piano** da un worker separato; correzioni.
5. **Implementazione** con TDD.
6. **Pull request** e **review avversariale del codice** da un worker separato;
   correzioni.
7. **Merge** su `main` del coordinatore (autorizzato dall'utente l'11 ottobre 2026),
   poi la spec principale riceve le decisioni dalla sezione «Decisioni da riportare»
   della spec di dettaglio.

La specifica principale, `design/percorsi.md`, `AGENTS.md` e questo piano li modifica
solo il coordinatore.

## Stato

| # | Attività | Fase | Note |
|---|---|---|---|
| 1 | Piattaforma | Brainstorming | |
| 2 | Schema e permessi | Brainstorming | |
| 3 | Ricetta e import | Brainstorming | |
| 4 | Unità e spesa | Brainstorming | |
| 5 | App web di base | Brainstorming | |

## Interfacce decise

- **Schema delle tabelle (W2, 11/10):** tutte le tabelle dell'app nello schema `app`, non esposto dalla Data API di Supabase, così nessun client scrive saltando le operazioni del Worker; il server qualifica le tabelle o imposta `search_path`. Disattivare la Data API nel progetto è un passo remoto da chiedere a parte.
- **Struttura (W1, 11/10):** workspace npm con sorgenti TypeScript senza build dei pacchetti: `contract/`, `server/`, `web/`, `domain/` con il proprio `package.json` (`@app/...`); `scripts/` resta nella radice.
- **Database locale (W2, 11/10):** `supabase db start` con Podman (stessa immagine della produzione), test delle policy in pgTAP; ripiego su Postgres semplice se la CLI non funziona con Podman.
- **Localizzazione web (W5, 11/10):** nessuna libreria; hook `useT()` tipato, dizionari per area, plurali con `Intl.PluralRules`, date e numeri con `Intl`.
- **Quantità e unità (W3 ↔ W4, 11/10):** quantità della riga `{kind:'amount', value, unit}` | `{kind:'to_taste'}` | `{kind:'text', text:{it-IT,en-GB}}` più `sourceText` sempre conservato; codici per dimensione: massa `g kg oz lb`, volume `ml l uk_fl_oz uk_pint`, `tbsp tsp` mai convertiti in ml, conteggi `piece clove slice pinch sprig bunch leaf`, `us_cup` solo nelle bozze. Equivalenze di ambito ricetta applicate in gestione o import (versioni immutabili, R1), di ambito spesa a ogni calcolo. Tipi e funzioni in `domain/src/units/` (W4), importati da W3.
- **Campi bilingui (decisione dell'utente, 11/10):** colonne jsonb `{it-IT, en-GB}` validate da zod e da vincoli check al posto delle tabelle `*_translations`, per ricette, ingredienti e righe di ingrediente. Da riportare nelle sezioni 2, 12 e 15 della specifica.
- **Test del server (W1, 11/10):** Vitest in Node chiamando la `fetch` del Worker con un env finto (Postgres locale, chiavi JWT generate nel test); ciò che Node non copre si verifica con `wrangler dev` e sul Worker pubblicato.
- **Ruoli Postgres (W1 ↔ W2, 11/10):** un solo login `app_server` (NOINHERIT, membro di `authenticated`, `anon`, `app_job`); ogni transazione sceglie il ruolo: utente → `authenticated` con i claim, `/internal/jobs/*` → `app_job`, pagina Bring! → `anon` tramite funzione per token. Password impostata a mano sul progetto, fuori dalle migrazioni.
- **Login (W5, 11/10):** solo email e password (`signInWithPassword`); link via email e Google nell'ondata 3. Sviluppo con lo stack Supabase locale (`supabase start`), configurazione degli ambienti di W1; senza variabili l'app parte in modalità finta.
- **Import, casi R4 (W3, 11/10, decisi dal coordinatore):** ricette collaudate senza storico registrate come provate senza data nei dati della famiglia e nel report, nessun pasto inventato; ricette «casa» con URL importate come `web` con l'URL, tipo d'origine conservato e segnalato; storico `cucinata: false` non importato, `null` in settimane concluse importato come mangiato e segnalato, `null` in settimane in corso non importato, giorni o pasti non riconosciuti scartati e segnalati.
- **Misure imperiali (W4, 11/10, decise dal coordinatore, confermate dall'utente l'11/10):** sotto ½ oz si resta in grammi; ½ oz fino a 4 oz, oncia intera fino a 1 lb, poi ¼ di lb; fino a 45 ml cucchiai di misura da 5 e 15 ml, poi fl oz, da 1 pinta al ¼ di pinta; fattori del Weights and Measures Act 1985; nella spesa piece, bunch e slice per eccesso all'intero (tolleranza 0,1), clove, sprig, leaf e pinch al mezzo.
- **Risposta «invariato» (W1, 11/10):** dentro il contratto, non HTTP 304: input con `knownVersion` facoltativo, output `{unchanged: true, version}` oppure `{unchanged: false, version, data}`. Da riportare nella sezione 1 al posto di «HTTP 304 con ETag».
- **Dati di revisione dell'import (W3, 11/10):** YAML versionati in `scripts/import/` (`ingredients.yaml`, `ingredient-lines.yaml`, `translations.en-GB.yaml`) preparati dall'agente dalle righe d'origine; tabella di revisione come pagina per l'utente; approvazione con una riga di intestazione. Preparazione facoltativa ma, se presente, obbligatoria nelle due lingue per pubblicare (sezione 8).
- **Reparti e spunte (W4 → W2, W3, W1, 11/10):** codici dei reparti in `domain/src/shopping/departments.ts`: `produce, butcher, fish, chilled, bakery, pasta_grains, tinned, frozen, condiments, other`. `quantity_at_check` in forma canonica `{mass_g, volume_ml, counts:{unit:n}, texts:[{key, text:{it-IT,en-GB}}], to_taste}` (testi bilingui del momento della spunta, dalla review di W4) con schema zod esportato dal dominio.
- **PWA (W5, 11/10):** service worker scritto a mano (navigazioni dalla rete con ripiego su `index.html`, `/assets/*` dalla cache, `/api/*` esclusa), manifest statico, nessun plugin.
- **Contatori di versione (W1 ↔ W2, 11/10):** fatti crescere da trigger nel database (per riga, con incremento deduplicato: al massimo una volta per transazione, sulla famiglia della riga o sul ricettario); la versione restituita compone i contatori da cui la lettura dipende, la lingua e la versione del Worker; ogni operazione dichiara nei metadati da cosa legge.
- **Tabelle dell'ondata 3 (W2, 11/10):** rimandate (`family_invitations`, `family_removals`, `app_invitations`, `agent_authorizations`); la spec di W2 indica i punti di aggancio.
- **Client web (W5 ↔ W1, 11/10):** oggetto `api` annidato per area fornito da un contesto React, chiavi `[area, operazione, input]` e `queryOptions` scritte a mano (niente `@orpc/tanstack-query` per ora), token da `supabase-js` tramite `getAccessToken()` passato al link oRPC, «invariato» gestito dallo strato delle query, build in `web/dist` servita dal Worker come asset con ripiego su `index.html`.
- **Attributi del pianificatore (decisione dell'utente, 11/10):** obbligatori per pubblicare (`meal_type`, `protein_group`, `carbohydrate_group`, `category`, `is_fresh_fish`, `has_vegetables`, `is_heavy`); facoltativi `seasons` e ingrediente principale. Supera la decisione del quinto giro sul gruppo alimentare facoltativo (sezione 8).
- **Idempotenza (W1 ↔ W2, 11/10):** id generato dal client per le creazioni e operazioni a stato assoluto (per esempio `setChecked` con `checked: true`, non un'inversione); nello schema chiavi naturali univoche dove si crea una riga, nessuna tabella generica delle ricevute.
- **Pubblicazione del Worker (W1, 11/10):** per ora a mano con `wrangler deploy` dal coordinatore dopo il merge, per rimandare i passi esterni; automazione (preferibilmente GitHub Actions con deploy solo a test verdi) prima del traguardo A. CI su ogni PR con typecheck e test, migrazioni applicate dall'integrazione GitHub di Supabase al merge su `main` (da verificare).
- **Cache persistita (W5, 11/10):** `@tanstack/react-query-persist-client` con persister IndexedDB scritto a mano, copia per utente cancellata all'uscita, `buster` sulla versione della build, `maxAge` 7 giorni, rilettura al ritorno in primo piano e alla riconnessione.
- **Documento ricetta (W3, 11/10):** schema zod strutturale per le bozze più funzioni di controllo a codici e percorsi (`ValidationIssue[]`), schema stretto per il pubblicato; campi della fonte piatti con regole per tipo nei controlli; tag, foto, stato e date fuori dal documento; identità d'origine in una colonna di `recipes`; `projectRecipe` e `toPlannerRecipe`; import senza scritture sul database, con `bundle.json`, `report.md` e `review.html` rigenerabili. Gli ingredienti di dispensa esclusi dall'origine non si aggiungono: li elenca il report.
- **Test del web (W5, 11/10):** Vitest con `@testing-library/react` e `jsdom` solo in sviluppo; prova visiva con agent-browser e iPhone sulla porta 8767.
- **Rischio da verificare prima del merge di W2:** l'integrazione GitHub di Supabase potrebbe applicare le migrazioni al progetto remoto al merge su `main`; W1 lo verifica nella configurazione prima che la PR dello schema venga unita.
- **Ordine di implementazione dell'ondata 1 (11/10):** W3 implementa dopo il merge dello scheletro di W1 e del dominio di W4 (usa `UNIT_CODES`, `quantitySchema`, `applyRecipeEquivalence`, `varietyKey`, `DEPARTMENTS`); W2 allinea le colonne alla sezione «Interfaccia per W2» della spec di W3.
- **Equivalenze (review W4, 11/10):** al massimo una equivalenza per (ingrediente, ambito, dimensione dell'unità di partenza); il dominio rifiuta configurazioni ambigue, lo schema lo garantisce con un vincolo. Soglie di presentazione scelte dopo l'arrotondamento (15,8 oz → 1 lb); cucchiai di misura e domestici dello stesso tipo sommati solo nella presentazione; la vista della spesa espone anche la quantità canonica per la spunta offline.
- **Nome delle ricette in bozza (W2 ↔ W3, 11/10):** `recipes.name` e `recipes.description` valorizzati anche per le bozze nuove (import e server a ogni salvataggio), così i membri leggono il nome dei pasti senza accesso alle bozze, riservate ai curatori; le altre proiezioni restano vuote.
- **Review di W3 (11/10):** righe dell'import irrisolte conservate nella bozza con `ingredientId: null` e bloccanti alla pubblicazione; duplicati nelle bozze come problemi di pubblicazione, non errori di salvataggio; approvazione dei YAML legata all'hash del contenuto.
- **Equivalenze e preparazione (11/10):** un'equivalenza può avere una `preparation` facoltativa e si applica solo a righe con la stessa preparazione (la specifica vince sulla generica); unicità per (ingrediente, ambito, dimensione dell'unità di partenza, preparazione).
- **Proprietà dei tipi condivisi (11/10):** W4 possiede `Localized`, `Quantity` completa, codici e schemi delle unità; W3 costruisce le varianti di bozza sopra, senza ridefinirle.
- **Ricette provate senza data (11/10):** tabella `family_tried_recipes(family_id, recipe_id, source, created_at)` riempita dall'import; il pianificatore per ora non la usa.
- **Review di W1 (11/10):** claim JWT obbligatori e validati (`exp`, `sub` e `session_id` UUID, `client_id` non vuoto o assente); log senza segreti; validazione MCP normalizzata anche quando la fa l'SDK; sessione verificata prima di `web_only` e all'ingresso MCP; consegna completa di W1 solo con CI sulle migrazioni reali di W2, che si unisce prima.
- **Revoca reale degli agenti:** da provare nell'attività «Collegamento degli agenti» (ondata 2): revocare un client, riusare il suo access token non scaduto su MCP, RPC e REST, verificare il rifiuto e che gli altri client e la sessione web restino attivi.
- **Review di W2 (11/10, verdetto «da rifare»):** `execute` revocato a `public` su ogni funzione; funzioni di autorizzazione che non rivelano la famiglia di record altrui; `undoes` nella stessa famiglia; ingredienti, libri e bozze mai cancellati fisicamente (archiviazione e chiusura, cronologia conservata); `update` solo sulle colonne previste, identità di settimane e slot immutabile; contatori delle famiglie aggiornati quando cambia il nome di una bozza che citano; bootstrap per UUID; test isolati dal seed.
- **R1 senza versione al momento del pasto (decisione del coordinatore, 11/10):** si usa la prima versione pubblicata; se la ricetta non è mai stata pubblicata, il pasto mostra solo nome e descrizione e non entra nella spesa. Confermato dall'utente l'11/10.
- **Revoca nei test di W2:** rimozione dalla famiglia e revoca del ruolo di curatore efficaci subito con lo stesso JWT, anche sulle letture del catalogo.
- **Review di W5 (11/10, verdetto «da rifare»):** niente aggiornamenti ottimistici: le mutazioni applicano la risposta del server alle viste della stessa famiglia e marcano scadute le liste che dipendono dal valore cambiato; risposte arrivate dopo l'uscita scartate; voto offline rifiutato subito. Chiusura della sessione unica (Esci, uscita da un'altra scheda, cambio d'utente) con cancellazione della copia persistita; «Esci» solo su questo dispositivo; `unauthorized` → un rinnovo poi login, `forbidden` → rimozione delle viste della famiglia. Offline senza rinnovo possibile: copia in sola consultazione fino alla riconnessione. Service worker con shell completa in cache. Lingua del profilo a ogni cambio d'identità. Riferimento al pasto conservato nelle rotte. Client oRPC reale in una seconda PR di W5 dopo il merge di W1.
- **Seconda review di W2 (11/10):** nomi degli autori leggibili dai curatori tramite una funzione o vista limitata a `user_id` e `display_name` degli autori del ricettario; contatori: al massimo un incremento per transazione, ammessa un'invalidazione in più per scritture senza effetti. Dopo le correzioni W2 passa all'implementazione senza terza review di spec: il controllo finale è la review della PR.
- **Viste condivise della ricetta (W6 ↔ W1, 11/10):** schemi in `contract/src/recipes/views.ts` e caricatori in `server/src/recipes/views.ts` di W6 (riepilogo della ricetta, riepilogo del voto, righe di ingrediente scalate e formattate per un insieme di ricette e una famiglia), più `ratings.set`; W1 li importa per le schede dei pasti passando le versioni R1. W6 li consegna presto in una PR piccola.
- **Job settimanale con Cron Trigger (W1 menu, 11/10, scelto dal coordinatore):** il Worker riceve l'evento `scheduled` di Cloudflare e lavora nel ruolo `app_job`, una transazione per famiglia, stato in `weekly_jobs`; niente pg_cron, pg_net, segreto condiviso né rotta `/internal/jobs/*`. Supera la sezione 4 della specifica (da riportare).
- **Impostazioni della famiglia (W2 profilo ↔ W1 menu, 11/10):** `families.settings` conserva solo i valori cambiati; schema zod dei valori salvati e `resolveFamilySettings` in `domain/src/family/settings.ts` (W2); tipi `PlannerSettings` e default in `domain/src/planner/` (W1). Perimetro del traguardo A: tutta la pagina del prototipo, pesi esclusi.
- **Candidate del pianificatore (W1, 11/10):** dal documento della versione corrente con `toPlannerRecipe` di W3, nessuna seconda mappatura dalle proiezioni.
- **Generazione nel traguardo A (W1, 11/10):** pigra all'apertura (settimana successiva dopo mercoledì 20:00) più prima generazione automatica per una famiglia senza settimane; nessuna operazione «rigenera» fino al wizard (ondata 3).
- **Famiglia mostrata (W2, 11/10):** tabella privata `app.profile_preferences` (vedi sotto) con operazione `profile.setCurrentFamily`; `me.get` ripiega sulla prima famiglia; gli agenti MCP indicano sempre `familyId` (famiglia esplicita, sezione 1).
- **Esclusioni (W2, 11/10):** tutta l'area «non proporre più» a W2: `family.listExclusions`, `family.addExclusion` (idempotente per famiglia e ricetta), `family.removeExclusion`; la revisione dei pasti richiama l'aggiunta; W6 non la usa (review di W6, 11/10).
- **Spesa offline senza sessione verificabile (W4 spesa, 11/10, deroga alla «sola consultazione» della review di W5):** la sola lista della spesa resta modificabile con una coda per utente in IndexedDB, mostrata come strato «da sincronizzare» fuori dalla cache delle query; alla riconnessione rinnovo, poi invio in ordine solo se l'utente è lo stesso; rinnovo rifiutato → chiusura unica con coda cancellata; `forbidden` → scarto delle voci della famiglia. Background Sync escluso (Safari iOS).
- **Hook `prepare` nel percorso del server (W1 menu, 11/10):** `createImplementer(contract, { prepare })` esegue per operazione una funzione nella transazione dell'utente prima di `readVersion` (usato dalla generazione pigra del menu).
- **Impostazioni salvate con operazioni puntuali (W2 profilo, 11/10):** un'operazione a stato assoluto per gesto, che aggiorna solo il proprio pezzo del jsonb.
- **Versione per pasto R1, implementazione unica (W1 menu ↔ W4 spesa, 11/10):** `mealRecipeVersions(tx, familyId, weekId)` in `server/src/menu/` (per slot `recipeId`, `version: number | null` e `isPast`) su `app.recipe_version_at`; ora del pasto passato (15:30, 23:00 nel fuso della famiglia) nel calendario di `domain/src/planner/`. La spesa la importa; le righe si leggono da `recipe_versions.content` con il documento di W3.
- **Ricerca nel ricettario (W6, 11/10):** nella lingua dell'utente, con i sinonimi degli ingredienti di quella lingua.
- **Letture del ricettario (W6, 11/10):** filtro, ricerca e ordinamento nel Worker con una funzione pura su dati caricati in blocco sotto RLS (niente `unaccent` né estensioni nuove); viste con date e istanti (`lastEatenOn`, `upcoming[].passesAt` da `app.meal_passed_at`), giudizio «passato» calcolato sul dispositivo come vuole la sezione 1.
- **Esportazioni della spesa nel traguardo A (W4, 11/10):** Condividi (testo dal dominio calcolato sul dispositivo, anche offline, Web Share API o appunti) e Bring! (`shopping.createBringLink`, pagina pubblica per token nel ruolo `anon`, JSON-LD, noindex); PDF rimandato all'ondata 3.
- **Review della PR #6 (W5, 11/10, scelte del coordinatore):** eventi di Supabase conservati col loro tipo e fase «in chiusura» della generazione che esce (rinnovi e eventi dello stesso utente ignorati, uscita sempre conclusa con `signOut`); segni di revoca un record per (utente, famiglia) aggiornati in una sola transazione `readwrite` di IndexedDB, con `fake-indexeddb` ammesso solo nei test; lingua fissata all'avvio della lettura e mantenuta nei tentativi, risposte superate dal cambio di lingua scartate.
- **Review della PR #7 (W4, 11/10):** univocità delle equivalenze verificata anche in `findEquivalence` (percorso ricetta e import); arrotondamento imperiale stabile ai punti intermedi; chiavi dei testi nella spunta coerenti con il testo italiano e uniche.
- **Fonte delle equivalenze (PR #7 di W4, 11/10, decisa dal coordinatore):** `ingredient_unit_equivalences.source` obbligatoria e non vuota anche nel database (nuova migrazione di W2), coerente con il dominio e con le «equivalenze verificate» della sezione 2.
- **Seconda review di W5 (11/10):** coordinatore unico della sessione con numero di generazione e un solo rinnovo alla volta; cancellazioni solo a identità nota; revoca fra schede con `BroadcastChannel` e blocco della riscrittura; shell del service worker sostituita in modo atomico alla riapertura; niente dati precedenti al cambio di lingua o contesto. Poi implementazione senza terza review di spec.
- **Review della spesa (W4, 11/10, scelte del coordinatore):** agganci di sessione per la coda (rinnovo esplicito con esito `ok`/`rejected`/`network`, invio rifiutato su sessione chiusa, agganci asincroni alla chiusura e alla revoca, pulizia di `shopping-queue:`, messaggi fra schede per tipo) implementati da W5 nella seconda PR con le firme scritte da W4; `setItemChecked` sempre con quantità esplicita; voce libera ricreata da una ripetizione dopo la cancellazione di un altro membro accettata; esclusione fra schede con Web Locks (`shopping-queue:<userId>`), senza Web Locks limitazione dichiarata; Bring! disabilitato con operazioni pendenti e aperto in due passi (link «Apri in Bring!» dopo la creazione, niente `window.open` dopo l'attesa).
- **Review della PR #9 (W3, 11/10):** campi della fonte vuoti normalizzati a `null`; numeri con punto e tre cifre ambigui, importati come testo e segnalati; `--today` obbligatorio nell'import; un solo vocabolario delle parole ignorate nelle varietà (quello della spesa).
- **Viste condivise, firme definitive (review di W2 e W6, 11/10):** W6 unico autore dei due `views.ts`, con le sue firme (`ratingSummaries(tx, familyId, userId, recipeIds)`, riepiloghi in blocco per `{recipeId, version, servings}` comprese versioni storiche e ricette mai pubblicate, funzione pura delle righe più caricatore asincrono in blocco); W1 si adegua e non scrive quei file. Testi mancanti nelle bozze: nome nell'altra lingua, descrizione `string | null`. Il ricettario trasmette tutti i pasti futuri della ricetta. `IngredientList` di W6, con la preparazione.
- **Implementatore del server unico (11/10):** costruito solo in `server/src/router.ts` (con `{ prepare }` di W1); ogni area esporta un factory che riceve `os`; tipo `Implementer` da `server/src/pipeline.ts`.
- **Famiglia mostrata privata (review di W2, 11/10):** in `app.profile_preferences(user_id, current_family_id)` con RLS del solo proprietario, non in `profiles` (leggibile dai co-membri). Il passaggio da `me.get` a `profile.get` nel web (wrapper, chiavi, revoca) lo fa W2 sopra la seconda PR di W5. Impostazioni malformate lette con i default; la scrittura normalizza i genitori del percorso.
- **Review del menu (W1, 11/10, scelte del coordinatore):** generando una settimana il pianificatore considera anche le settimane successive già generate, senza mai sovrascriverle; generazione serializzata per famiglia con `pg_advisory_xact_lock` sia nella richiesta pigra sia nel cron; job `pending`/`failed` ritentati finché la loro settimana non finisce (se iniziata, solo i pasti aperti), poi chiusi come abbandonati con log, ritardo rispetto al mercoledì della `target_week`; `no_weeks` solo senza settimane, altrimenti apertura sul primo giorno con slot da oggi (o l'ultimo), con le schede «Nessuna ricetta adatta» visibili; data effettiva di `getOpening` nella versione, validazione prima dell'«invariato».
- **Interfaccia per W1 definitiva (W6, 11/10, dopo la seconda review):** sezione 1 di `progetto/superpowers/specs/2026-10-11-ricettario-e-voti.md` sul branch `traguardo/ricettario` al commit `f5b1dd2`: schemi `recipeSummaryView`, `ratingSummaryView`, `ingredientLineView`, `mealOccurrenceView`; `RecipeRef {recipeId, version: number | null, servings}`, `recipeViewKey`, `recipeSummaries`, `ingredientLines`, `ratingSummaries(tx, familyId, userId, recipeIds)`, `recipeViews(tx, viewer, refs)`, funzione pura `ingredientLinesView`. Documento immutabile della versione sempre letto (R1 coerente); `servings: 0` mostrato alle porzioni di riferimento; `RecipeCard`, `RecipePage` e `IngredientList` di W6. Modifiche solo tramite il coordinatore.
- **Interfaccia di W4 per W5 definitiva (11/10, dopo la seconda review):** sezione «Interfaccia richiesta a W5» di `progetto/superpowers/specs/2026-10-11-spesa.md` sul branch `traguardo/spesa` al commit `7d1ebce`; la implementa W5 nella seconda PR (`fondamenta/web-client`).
- **`noUncheckedIndexedAccess` anche in `domain/` (11/10, domanda di W5):** il web lo usa e controlla i tipi dei sorgenti importati dal contratto; W1 corregge il pianificatore e attiva l'opzione nel tsconfig di `domain/`.
- **R1 e risposta «invariato» (review della PR #15, 11/10):** le letture che dipendono da `mealRecipeVersions` (`menu.getWeek`, `shopping.getWeekList`) includono nella versione il numero di pasti della settimana già passati, calcolato con lo stesso istante SQL di R1 (aiuto esportato da `server/src/menu/versions.ts`, W1); così al passaggio delle 15:30 e 23:00 la cache si rinnova.
- **Gestione del ricettario tramite MCP, perimetro web (W3, 11/10, scelta del coordinatore):** nel traguardo A sezioni «Bozze» (solo curatori) e «Archiviate» con «Riporta nel ricettario» e pagina della bozza in sola lettura, componenti dell'area `catalogue` di W3 montati in `RecipesPage` con una modifica minima; archiviazione dal menu e Versioni/Ripristina sul web all'ondata 3 (nel traguardo A via MCP). «Elimina» di una bozza mai pubblicata = chiusura `discarded` (nessuna cancellazione fisica), ammessa solo se nessun pasto la cita (funzione security definer); istruzioni per l'agente come `catalogue.getGuide` in sola lettura.
- **Gestione del ricettario, scelte del brainstorming di W3 (11/10, coordinatore):** ingredienti creati e modificati a stato assoluto con versione e conflitto, storico in `ingredient_versions`, equivalenze solo di ambito ricetta (shopping e archiviazione degli ingredienti fuori dal traguardo A); conversione delle `us_cup` fatta dal server al controllo e alla pubblicazione, bozza invariata, conversioni mostrate nell'esito; conflitto come errore `conflict` con discriminante `draft`/`version`/`ingredient` (in `contract/src/errors.ts`), sovrascrittura che cita la revisione sovrascritta, ripetizioni idempotenti.
- **Conferma del curatore e traduzioni via MCP (decisione dell'utente, 11/10):** solo istruzioni all'agente in `catalogue.getGuide` (scheda completa con le traduzioni, pubblicazione dopo un sì esplicito); `catalogue.publish` pubblica l'ultima revisione della bozza, senza vincolo sulla revisione controllata né flag sulle traduzioni. Chiude i due punti aperti della sezione 15 della specifica.

## Registro delle decisioni del coordinamento

| Data | Decisione |
|---|---|
| 11 ottobre 2026 | W5: nell'ondata 1 Menu e Ricettario in sola lettura completi nella resa, Profilo con segnaposto, stelline su dati finti per provare le mutazioni con copia locale; i componenti senza funzione arrivano con l'ondata 2 |
| 11 ottobre 2026 | Piano generale approvato: tre ondate, cinque worker nell'ondata 1, traguardo A con gestione MCP, utenze dirette prima di Google, passi esterni rimandati; push, PR e merge delegati al coordinatore |
| 11 ottobre 2026 | L'utente delega al coordinatore l'approvazione delle dipendenze nuove, sempre con la regola delle dipendenze al minimo |
| 11 ottobre 2026 | Unita la PR #3 (scheletro del monorepo) dopo review Codex senza rilievi; da verificare che W5 aggiunga test e typecheck effettivi a `web/` |
| 11 ottobre 2026 | Unita la PR #4 (schema e permessi) dopo tre review e 434 test pgTAP rilanciati dal coordinatore; «Deploy to production» dell'integrazione GitHub di Supabase disattivato (verificato dall'utente), quindi le migrazioni non arrivano al progetto remoto con il merge |
| 11 ottobre 2026 | Unita la PR #5 (piattaforma: Worker, contratto, verifica dei token, CI con le migrazioni reali e 434 test pgTAP); passi di produzione rimandati alla prima pubblicazione |
| 11 ottobre 2026 | Ondata 2 avviata in parallelo alla chiusura dell'ondata 1, su richiesta dell'utente: sei worker (i revisori Codex non contano); W1 menu e pianificatore, W6 ricettario e voti, W2 profilo e famiglia; regole comuni in `progetto/coordinamento/brief/ondata2-comune.md` |
| 11 ottobre 2026 | Unita la PR #8 (fonte obbligatoria e non vuota nelle equivalenze, come il trim di JavaScript; 449 test pgTAP) |
| 11 ottobre 2026 | Unita la PR #7 (dominio unità e spesa) dopo due review; W3 passa all'implementazione; W4 avviato sull'attività Spesa dell'ondata 2 |
| 11 ottobre 2026 | L'utente approva l'ordine dell'ondata 2: interfacce prima, poi produttori con PR piccole, poi consumatori; regola della tabella produttori → consumatori prima di lanciare un worker |
| 11 ottobre 2026 | L'utente approva i quattro YAML dell'import (tagli di carne come varietà, «Sale e pepe» solo sale, cotti/precotti come preparazione, peperoncino secco per «1 pizzico», preparazioni del libro come prodotti in `other`, 4 traduzioni en-GB scritte da W3) |
| 11 ottobre 2026 | Unite la PR #6 (app web di base, dopo tre review) e la PR #9 (documento ricetta e import, dopo due review, YAML approvati dall'utente): ondata 1 completata |
| 11 ottobre 2026 | Unita la PR #12 (viste condivise della ricetta di W6, `ratings.set`, adeguamenti web della ricetta) dopo una review senza rilievi |
| 11 ottobre 2026 | Unita la PR #10 (`resolveFamilySettings` e schema delle impostazioni salvate, W2) dopo una review con un rilievo minore corretto |
| 11 ottobre 2026 | Unita la PR #13 (`mealRecipeVersions`, `versionedInput` tipizzato, pianificatore con `noUncheckedIndexedAccess`, W1) dopo una review senza rilievi |
| 11 ottobre 2026 | Unita la PR #16 (profilo e famiglia lato server, `profile_preferences`, W2) dopo una review senza rilievi |
| 11 ottobre 2026 | Unita la PR #14 (ricettario lato server: ricerca, scheda, MCP, W6) dopo due review |
| 11 ottobre 2026 | Unita la PR #15 (menu lato server: generazione, generazione pigra, job settimanale con Cron Trigger, letture, MCP, W1) dopo due review |
| 11 ottobre 2026 | Unita la PR #11 (spesa lato server: contratto, lettura, mutazioni idempotenti, esportazioni, pagina Bring!, MCP, W4) dopo quattro review |
| 11 ottobre 2026 | L'utente sceglie per la gestione MCP del ricettario la conferma del curatore affidata alle sole istruzioni dell'agente, con pubblicazione dell'ultima revisione |
