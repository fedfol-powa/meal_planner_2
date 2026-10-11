# Schema e permessi (W2): design di dettaglio

Creato: 11 ottobre 2026
Attività: ondata 1, W2, branch `fondamenta/schema`, proprietà `supabase/`.
Riferimenti: specifica principale `2026-09-29-app-famiglia-design.md`, sezioni 1, 2,
5, 7, 8, 12, 15, 16, 17 (R1, R2); piano generale `2026-10-11-piano-generale.md`;
`spike/REPORT.md`. Questo documento estende la specifica e le resta subordinato.

## Obiettivo

Lo schema del traguardo A creato da codice in `supabase/migrations/`, con:

- le tabelle della sezione 2 che servono al traguardo A;
- RLS che garantisce l'isolamento fra famiglie e il confine dei ruoli globali anche per
  le query del server, che girano nel ruolo dell'utente (sezione 1);
- i ruoli Postgres del server e del job;
- i contatori di versione per famiglia e per il ricettario;
- un ambiente locale con test automatici delle policy con più utenti;
- uno script per preparare a mano i primi utenti e la famiglia.

Le regole dei flussi (ultimo amministratore, successione, conflitti delle bozze,
validazione del documento ricetta, registro dei pasti) restano nelle operazioni del
server (W1 e ondata 2). Lo schema garantisce isolamento, integrità referenziale,
vincoli semplici e storico in sola aggiunta.

## Decisioni prese nel brainstorming (11 ottobre 2026)

Risposte del coordinatore, in parte concordate con W1, W3 e W4 e con l'utente:

1. **Schema `app`, non `public`.** La Data API di Supabase (PostgREST) espone `public`:
   con un JWT valido un utente potrebbe scrivere le tabelle senza passare dalle
   operazioni, saltando le regole dei flussi. Tutte le tabelle e funzioni stanno nello
   schema `app`, non esposto. Disattivare anche la Data API nel progetto remoto è una
   misura in più, da proporre all'utente con una domanda a parte.
2. **Ambiente locale: Supabase CLI su Podman.** `supabase db start` avvia solo il
   Postgres di Supabase (stessa immagine della produzione) sulla VM Podman;
   `supabase db reset` applica migrazioni e `seed.sql`; `supabase test db` esegue i
   test pgTAP. Verificato l'11 ottobre 2026: Postgres 17.11, migrazione con schema
   `app`, test pgTAP con due utenti e RLS superati; `pg_cron`, `pg_net` e `pgtap`
   disponibili. Nessuna dipendenza npm.
3. **Contatori di versione con trigger nel database** (concordato con W1).
4. **Un solo login per il server**, `app_server`, che sceglie il ruolo per transazione.
5. **Campi bilingui** (decisione dell'utente su proposta di W3): testi jsonb
   `{"it-IT": …, "en-GB": …}` nelle colonne di proiezione, niente tabelle
   `*_translations`.
6. **Tabelle dell'ondata 3 rimandate**: `family_invitations`, `family_removals`,
   `app_invitations`, `agent_authorizations`.
7. **Idempotenza con chiavi naturali** (concordato con W1): identificativo generato dal
   client dove si crea una riga, operazioni a stato assoluto (`setChecked` con
   `checked: true`, non un'inversione); nessuna tabella generica delle ricevute.
8. **Interfacce da W4**: codici dei reparti di `domain/src/shopping/departments.ts`
   (`produce`, `butcher`, `fish`, `chilled`, `bakery`, `pasta_grains`, `tinned`,
   `frozen`, `condiments`, `other`) con check constraint; `quantity_at_check` nella
   forma canonica `{mass_g, volume_ml, counts: {unit: n}, texts: […], to_taste}`,
   validata dal server con lo schema zod del dominio.
9. **Attributi del pianificatore obbligatori per pubblicare** (decisione dell'utente),
   tranne `seasons` e l'ingrediente principale.
10. **Default delle impostazioni della famiglia nel dominio**: il database conserva solo
    i valori impostati (`{}` per una famiglia nuova); il server completa con i default
    del dominio in lettura, così i default stanno in un solo posto.

## Struttura di `supabase/`

```
supabase/
├── config.toml           da `supabase init`; Data API solo su public e graphql_public
├── README.md             comandi locali e passi remoti
├── migrations/           un file per area, in ordine
├── seed.sql              dati locali di sviluppo (non per la produzione)
├── scripts/
│   └── bootstrap.sql     primi utenti, ruoli e famiglia sul progetto vero
└── tests/                pgTAP, un file per area, più le funzioni di aiuto
```

Migrazioni, nell'ordine:

| File | Contenuto |
|---|---|
| `…_foundation.sql` | schema `app`, ruoli `app_server` e `app_job`, permessi sullo schema, funzioni di aiuto delle policy |
| `…_identity.sql` | `profiles`, `user_roles`, trigger su `auth.users` |
| `…_catalogue.sql` | ricette, proiezioni, ingredienti, libri, bozze, versioni, storico |
| `…_families.sql` | famiglie, membri, libri, ingredienti evitati, esclusioni |
| `…_meals.sql` | settimane, pasti, registro, voti, viste dei punteggi, funzioni R1 |
| `…_shopping.sql` | liste, spunte, voci libere, rimessi, liste temporanee |
| `…_jobs.sql` | `weekly_jobs`, policy di `app_job` |
| `…_versions.sql` | contatori e trigger |
| `…_cron.sql` | pulizia delle liste temporanee con `pg_cron` |

I prefissi sono i timestamp della CLI (`supabase migration new`).

## Ambiente locale

- VM Podman `podman-machine-default` (creata l'11 ottobre 2026; `podman machine start`
  dopo un riavvio). Podman espone l'API compatibile Docker su `/var/run/docker.sock`, che
  la CLI usa senza configurazione; serve `/opt/podman/bin` nel `PATH`.
- Comandi: `supabase db start`, `supabase db reset`, `supabase test db`,
  `supabase stop`. `db reset` avvia anche il container di Auth: è previsto.
- CI (proposta per W1, che possiede la CI): un job su GitHub Actions con la CLI di
  Supabase, `supabase db start` e `supabase test db`.

## Ruoli Postgres

| Ruolo | Tipo | Poteri |
|---|---|---|
| `app_server` | LOGIN, NOINHERIT | membro di `authenticated`, `anon`, `app_job`; nessun permesso diretto su tabelle o funzioni: senza `set local role` non legge nulla |
| `authenticated` | di Supabase | permessi espliciti su `app`, sempre filtrati da RLS |
| `anon` | di Supabase | solo `usage` su `app` ed `execute` su `app.temporary_list_by_token(text)` |
| `app_job` | NOLOGIN | legge famiglie, impostazioni, membri, libri, evitati, esclusioni, voti, settimane, pasti e catalogo pubblicato di tutte le famiglie; scrive `weeks`, `meal_slots`, `weekly_jobs` |

- Il server (W1) sceglie il ruolo per rotta: richieste degli utenti →
  `set local role authenticated` con `request.jwt.claims`; `/internal/jobs/*` →
  `set local role app_job`; `/shopping-lists/<token>` → `set local role anon`.
- La password di `app_server` non sta nelle migrazioni: si imposta sul progetto remoto
  (`alter role app_server with password …`) con una DOMANDA all'utente. Per il Session
  pooler il nome utente è `app_server.<project_ref>`.
- `app_job` ha policy proprie (`to app_job`) e non vede bozze, cronologie,
  profili, ruoli globali, spesa né registro dei pasti.
- Postgres concede `execute` a `public` sulle nuove funzioni: ogni migrazione lo revoca
  sulle funzioni di `app` e concede solo quanto serve.
- Lo schema `app` non ha permessi di default: ogni `grant` è esplicito.

## Tabelle

Convenzioni: chiavi `uuid` con `default gen_random_uuid()`, che il client può
fornire dove serve l'idempotenza; date `timestamptz` con `default now()`; testi
localizzati in jsonb `{"it-IT": text, "en-GB": text}`; colonne d'autore che puntano ad
`auth.users(id)` con `on delete set null` (le tracce diventano «ex membro»);
canale `channel` con valori `web`, `mcp`, `import`.

### Identità

| Tabella | Colonne e vincoli |
|---|---|
| `profiles` | `user_id` PK → `auth.users` on delete cascade; `display_name` non vuoto; `locale` check `it-IT`/`en-GB`; `created_at`, `updated_at` |
| `user_roles` | PK (`user_id`, `role`); `user_id` → `auth.users` on delete cascade; `role` check `recipe_curator`/`app_admin`; `granted_by`, `granted_at` |

Un trigger `after insert` su `auth.users` crea il profilo: nome da
`raw_user_meta_data->>'display_name'`, altrimenti la parte dell'email prima della @;
lingua da `raw_user_meta_data->>'locale'` se valida, altrimenti `it-IT`. Il server
legge `profiles.locale` a ogni richiesta (lingua del contesto) e un profilo mancante
vale come utente inesistente: il profilo sparisce con l'utente.

**Revoca immediata (sezioni 1 e 17).** `app.session_is_active() returns boolean`,
SECURITY DEFINER con `search_path` vuoto, eseguibile da `authenticated`: vero se in
`auth.sessions` esiste la sessione con `id = (auth.jwt()->>'session_id')::uuid` e
`user_id = auth.uid()`, non scaduta (`not_after` nullo o futuro). Il server di W1 la
chiama a ogni richiesta nel ruolo dell'utente: un JWT ancora valido di una sessione
chiusa (uscita, account cancellato, accesso dell'agente revocato) viene rifiutato. Le
colonne di `auth.sessions` e la presenza di `session_id` anche nei token OAuth si
verificano nel primo compito del piano, sull'immagine locale; se i token degli agenti
non portano `session_id`, si segnala al coordinatore.

### Catalogo

| Tabella | Colonne e vincoli |
|---|---|
| `recipes` | `id`; `slug` univoco; identità d'origine dell'import (W3), fuori dal documento: `origin_slug` univoco e facoltativo (slug della scheda in `ricette.yaml`, unica chiave con cui l'import riconosce le schede già importate) e `origin_type` facoltativo, check `web`/`youtube`/`libro`/`casa` (il tipo com'era nell'origine); `status` check `draft`/`published`/`archived`; `version` int ≥ 0 (0 = mai pubblicata); proiezione: `name`, `description` (jsonb), `source_type` (`web`/`youtube`/`book`/`home`), `source_url`, `book_id` → `books`, `book_pages`, `duration_minutes` > 0, `base_servings` > 0, `protein_group`, `is_fresh_fish`, `carbohydrate_group`, `has_vegetables`, `category`, `meal_type`, `seasons` text[], `is_heavy`, `tags` text[]; `archived_at`, `archived_by`, `created_by`, `created_at`, `updated_by`, `updated_at` |
| `recipe_ingredients` | proiezione: `recipe_id` → `recipes` on delete cascade; `position`; PK (`recipe_id`, `position`); `ingredient_id` → `ingredients`; `variety` jsonb; `variety_key` text (`varietyKey(variety['it-IT'])` di W4, `domain/src/shopping/variety.ts`; vuota senza varietà); `quantity_kind` check `amount`/`to_taste`/`text`; `quantity` numeric > 0 e `unit` text (codici di W4), presenti se e solo se `amount`; `quantity_text` jsonb, solo con `text`; `source_text` text non vuoto, al massimo 200 caratteri; `preparation` jsonb; `is_optional`, `is_primary`; univoche (`recipe_id`, `position`) e (`recipe_id`, `ingredient_id`, `variety_key`) |
| `ingredients` | `id`; `slug` univoco; `name` jsonb; `synonyms` jsonb `{"it-IT": [], "en-GB": []}`; `department` check sui reparti di W4; `is_pantry`; `version` int ≥ 1; autori e date |
| `ingredient_versions` | PK (`ingredient_id`, `version`); `content` jsonb (reparto, dispensa, nomi, sinonimi ed equivalenze); `changed_by`, `changed_at`, `channel`; solo aggiunte |
| `ingredient_unit_equivalences` | `id`; `ingredient_id` → `ingredients` on delete cascade; `from_unit`, `to_unit`; `from_dimension` generata da `from_unit` con `app.unit_dimension(text)`: `mass` per tutte le unità di massa, `volume` per tutte quelle di volume, il codice stesso per `tbsp`, `tsp`, ogni unità contata e `us_cup`, che contano ciascuna come dimensione a sé (precisazione di W4); un codice sconosciuto è rifiutato; `factor` > 0; `scope` check `recipe`/`shopping`; `source`; univoca su (`ingredient_id`, `scope`, `from_dimension`): al massimo un'equivalenza per ingrediente, ambito e dimensione (review di W4) |
| `books` | `id`; `slug` univoco (l'import riconosce i libri per slug, W3); `title`; `created_by`, `created_at` |
| `recipe_drafts` | `id`; `recipe_id` univoco → `recipes` (una bozza per ricetta); `kind` check `new`/`revision`; `base_version`; `content` jsonb; `revision` int ≥ 1; `created_by`, `created_at`, `updated_by`, `updated_at` |
| `recipe_draft_saves` | PK (`draft_id`, `revision`); `draft_id` → `recipe_drafts` on delete cascade; `content`; `saved_by`, `saved_at`, `channel`; `overwritten` boolean, unica colonna aggiornabile |
| `recipe_versions` | PK (`recipe_id`, `version`); `content` jsonb; `published_by`, `published_at`, `channel`; `restored_from` int; `restored_instant` timestamptz (ripristino dell'intero catalogo); solo aggiunte |
| `recipe_status_changes` | `id`; `recipe_id`; `status`; `changed_by`, `changed_at`, `channel`; solo aggiunte |

Check di `recipes`:

- `version > 0` implica `name`, `description`, `duration_minutes`, `base_servings`,
  `protein_group`, `carbohydrate_group`, `category`, `meal_type`, `has_vegetables`,
  `is_fresh_fish`, `is_heavy` non nulli (attributi obbligatori per pubblicare,
  decisione dell'utente); `seasons` e `is_primary` restano facoltativi;
- `status = 'draft'` se e solo se `version = 0`;
- vocabolari della sezione 2 come check: `protein_group` (`fish`, `white_meat`,
  `red_meat`, `cured_meat`, `legumes`, `eggs`, `cheese`, `vegetarian`),
  `carbohydrate_group` (`pasta`, `rice`, `potatoes`, `bread`, `cereals`, `none`),
  `category` (`wok`, `skottle`, `oven_bake`, `grill`, `pan`, `soup`, `salad`,
  `savoury_pie`, `wrap_sandwich`, `burger`, `other`), `meal_type`
  (`lunch`/`dinner`/`both`), `seasons` sottoinsieme delle stagioni del documento
  ricetta di W3.

I testi jsonb hanno un check di forma: oggetto con le sole chiavi `it-IT` e `en-GB`;
la completezza la verifica il dominio alla pubblicazione.

Proiezioni allineate all'«Interfaccia per W2» della spec di W3
(`2026-10-11-ricetta-import.md`): ogni colonna corrisponde a un campo del documento
(`name` ← `name`, `duration_minutes` ← `durationMinutes`, `quantity_kind` ←
`quantity.kind`…), ricalcolate dal server a ogni pubblicazione o ripristino. Le stagioni
sono quelle di `domain/src/planner/types.ts`. `content` è un `RecipeDocument`
(versioni) o un `RecipeDraftDocument` (bozze e cronologia), entrambi con
`schemaVersion`; il database controlla solo che sia un oggetto. Tag, foto, stato,
versione, date, autori e identità d'origine stanno fuori dal documento, come colonne di
`recipes`.

Una ricetta nuova in bozza ha la riga in `recipes` con `status = 'draft'` e
`version = 0`; il server ne aggiorna `name` e `description` a ogni salvataggio della
bozza `new` e l'import li scrive dal documento, mentre le altre colonne di proiezione
restano vuote. Così un pasto (per esempio dello storico importato) che la cita ne
mostra il nome, e i membri della famiglia leggono solo quella riga di `recipes`, mai il
contenuto della bozza, che resta riservato ai curatori (sezione 8; deciso dal
coordinatore l'11 ottobre 2026, comunicato a W3).

### Famiglie

| Tabella | Colonne e vincoli |
|---|---|
| `families` | `id`; `name` non vuoto; `settings` jsonb, check `jsonb_typeof = 'object'`, default `{}`; `measurement_system` check `metric`/`uk_imperial`; `time_zone` default `Europe/Rome`, validato da trigger su `pg_timezone_names`; `data_version` bigint; `data_version_xid` xid8; `created_at` |
| `family_members` | PK (`family_id`, `user_id`); `family_id` → `families` on delete cascade; `user_id` → `auth.users` on delete cascade; `role` check `family_admin`/`member`; `joined_at` |
| `family_books` | PK (`family_id`, `book_id`) |
| `family_ingredients` | PK (`family_id`, `ingredient_id`); `restriction` check `avoid`/`limit`; `weekly_max` int > 0, obbligatorio solo con `limit` |
| `recipe_exclusions` | PK (`family_id`, `recipe_id`); `reason`; `created_by`, `created_at` |

`measurement_system` sta in una colonna, non nelle impostazioni: è letto da ogni vista
con quantità.

### Pasti e voti

| Tabella | Colonne e vincoli |
|---|---|
| `weeks` | `id`; `family_id` → `families` on delete cascade; `starts_on` date, check lunedì (`isodow = 1`); univoca su (`family_id`, `starts_on`); `generated_at` |
| `meal_slots` | `id`; `week_id` → `weeks` on delete cascade; `date`, check dentro la settimana (trigger, perché dipende da `weeks`); `meal_type` check `lunch`/`dinner`; univoca su (`week_id`, `date`, `meal_type`); `recipe_id` → `recipes` on delete restrict; `free_text`; check che non ci siano entrambi; `servings` int ≥ 0; `note` al massimo 200 caratteri; `updated_by` (null = app), `updated_at` |
| `meal_changes` | `id` (dal client, per l'idempotenza); `meal_slot_id` → `meal_slots` on delete cascade; `actor_id`; `channel`; `before`, `after` jsonb; `undoes` → `meal_changes`; `created_at`; solo aggiunte |
| `ratings` | PK (`user_id`, `recipe_id`); `user_id` on delete cascade; `stars` 1-5; `updated_at` |

Viste:

- `family_scores` (`security_invoker`): per famiglia e ricetta, media e numero dei voti
  dei membri attuali;
- `global_scores`: media e numero su tutti i voti, senza utenti né famiglie, di proprietà
  di `postgres` (non `security_invoker`), perché aggrega oltre l'RLS; serve solo
  all'avvio a freddo del pianificatore.

Funzioni (R1, sezione 5):

- `app.meal_passed_at(date, meal_type, time_zone) returns timestamptz`: il pranzo alle
  15:30 e la cena alle 23:00 nell'ora locale della famiglia;
- `app.recipe_version_at(recipe_id, instant) returns int`: la versione pubblicata più
  recente con `published_at <= instant`, oppure null.

Con le due funzioni una sola query restituisce la versione mostrata da ciascun pasto
passato.

### Spesa

| Tabella | Colonne e vincoli |
|---|---|
| `shopping_lists` | `id`; `family_id` → `families` on delete cascade; `week_id` → `weeks` on delete cascade; univoca su (`family_id`, `week_id`); `updated_by`, `updated_at` |
| `shopping_list_checks` | PK (`shopping_list_id`, `ingredient_id`, `variety_key`); `quantity_at_check` jsonb nella forma canonica di W4 (`texts` è un elenco di `{key, text: {it-IT, en-GB}}`, testi del momento della spunta), validata dal server; il database controlla solo che sia un oggetto; `checked_by`, `checked_at` |
| `shopping_list_added_back` | PK (`shopping_list_id`, `ingredient_id`, `variety_key`); `added_by`, `added_at` |
| `shopping_list_items` | `id` (dal client); `shopping_list_id` on delete cascade; `text` non vuoto; `checked`; `created_by`, `created_at`, `updated_by`, `updated_at` |
| `temporary_lists` | `token` PK, default casuale (`encode(gen_random_bytes(24), 'hex')`); `family_id` on delete cascade; `items` jsonb; `created_by`; `expires_at` default `now() + 30 minuti` |

`app.temporary_list_by_token(token)` (SECURITY DEFINER) restituisce `items` se il token
esiste e non è scaduto, altrimenti nulla; è l'unico accesso di `anon`. Un job di
`pg_cron` ogni 15 minuti cancella le liste scadute.

### Job e catalogo

| Tabella | Colonne e vincoli |
|---|---|
| `weekly_jobs` | PK (`family_id`, `target_week`); `status` check `pending`/`running`/`done`/`failed`; `attempts` int ≥ 0; `error`; `updated_at` |
| `catalogue_state` | una sola riga (`id boolean primary key default true check (id)`); `version` bigint; `version_xid` xid8 |

### Rimandate

- Ondata 3: `family_invitations`, `family_removals`, `app_invitations`,
  `agent_authorizations`; la creazione e l'eliminazione di famiglie da parte degli
  utenti (nel traguardo A le famiglie si creano con lo script). Le chiavi esterne sono
  già pronte per rimozioni e cancellazioni.
- Attività «Menu e job» dell'ondata 2: il cron orario verso `/internal/jobs/weekly`, con
  l'URL del Worker e il segreto nel Vault, che dipendono dall'ambiente.
- Tracciamento generale del catalogo e dell'amministrazione (sezione 2, proposta): per
  ora `channel` e autore sulle tabelle di storico.

## Permessi (RLS)

RLS attiva su tutte le tabelle di `app`. Funzioni di aiuto SECURITY DEFINER,
`stable`, con `search_path` vuoto, usate nelle policy dentro `(select …)`:

- `app.is_member(family_id)`, `app.is_family_admin(family_id)`;
- `app.has_role(role)`: ruolo globale dell'utente corrente;
- `app.shares_family(user_id)`: l'utente corrente e `user_id` hanno una famiglia in
  comune.

Policy per `authenticated`:

| Tabelle | Lettura | Inserimento | Modifica | Cancellazione |
|---|---|---|---|---|
| `profiles` | propria o di chi condivide una famiglia | — (trigger) | propria | — |
| `user_roles` | propri | — | — | — |
| `recipes` | `published`, `archived`; `draft` ai curatori e ai membri di famiglie con un pasto che la cita | curatori | curatori | curatori, solo `draft` |
| `recipe_ingredients`, `ingredients`, `ingredient_unit_equivalences`, `books`, `recipe_versions` | tutti | curatori | curatori (non `recipe_versions`) | curatori (non `recipe_versions`) |
| `recipe_drafts` | curatori | curatori | curatori | curatori |
| `recipe_draft_saves` | curatori | curatori | curatori, solo `overwritten` | — |
| `recipe_status_changes`, `ingredient_versions` | curatori | curatori | — | — |
| `catalogue_state` | tutti | — | — | — |
| `families` | membri | — | amministratori della famiglia | — |
| `family_members` | membri | — | amministratori | amministratori, oppure la propria riga (uscita) |
| `family_books`, `family_ingredients` | membri | amministratori | amministratori | amministratori |
| `recipe_exclusions` | membri | membri | membri | membri |
| `weeks` | membri | membri | membri | — |
| `meal_slots` | membri | membri | membri | — |
| `meal_changes` | membri | membri, con `actor_id = auth.uid()` | — | — |
| `ratings` | propri o di chi condivide una famiglia | propri | propri | propri |
| `shopping_lists`, `shopping_list_checks`, `shopping_list_added_back`, `shopping_list_items` | membri | membri | membri | membri |
| `temporary_lists` | membri | membri | — | — |
| `weekly_jobs` | — | — | — | — |

- Le colonne in sola lettura dopo la creazione si proteggono con `grant update (…)`
  per colonna dove serve (per esempio `recipe_draft_saves.overwritten`,
  `families` senza `data_version`).
- I ruoli globali non aprono nulla delle famiglie: nessuna policy di famiglia cita
  `app_admin` o `recipe_curator`.
- Le regole dei flussi restano nel server: per esempio la policy lascia a un
  amministratore togliersi il ruolo, l'operazione impedisce che sia l'ultimo.
- Le policy di `app_job` sono separate (`to app_job`) e limitate alle tabelle della
  tabella dei ruoli.

## Contatori di versione

- `app.bump_family_version(family_id)` e `app.bump_catalogue_version()`, SECURITY
  DEFINER: incrementano il contatore solo se nella transazione corrente non è già
  stato fatto (`data_version_xid is distinct from pg_current_xact_id()`). Una
  generazione di 14 pasti fa crescere il contatore di 1.
- Contatore della famiglia, trigger per riga su: `families` (escluse le colonne del
  contatore), `family_members`, `family_books`, `family_ingredients`,
  `recipe_exclusions`, `weeks`, `meal_slots`, `meal_changes`, tabelle della spesa.
  `ratings` e `profiles` fanno crescere il contatore di tutte le famiglie dell'utente.
- Contatore del ricettario, trigger su `recipes`, `recipe_ingredients`, `ingredients`,
  `ingredient_unit_equivalences`, `books`. Le bozze e le cronologie non lo toccano.
- Per W1: il server legge `families.data_version` e `catalogue_state.version`. Le viste
  del ricettario dipendono da tutti e due, perché le medie dei voti sono della famiglia.
- `temporary_lists` e `weekly_jobs` non toccano i contatori.

## Test

pgTAP in `supabase/tests/`, eseguiti con `supabase test db`; ogni file è una
transazione annullata alla fine. Le funzioni di aiuto (creare utenti in `auth.users`,
agire come un utente impostando ruolo e `request.jwt.claims`, tornare a `postgres`)
stanno in un file incluso con `\ir`; se `pg_prove` non lo permette, si definiscono
all'inizio di ogni file.

Persone di prova: Anna (amministratrice della famiglia Rossi e membro della famiglia
Bianchi), Bruno (membro Rossi), Carla (amministratrice Bianchi), Dario (curatore senza
famiglia), Elena (`app_admin` senza famiglia), Franco (famiglia Verdi).

Copertura:

- isolamento in lettura e scrittura per ogni tabella di famiglia, compresa la persona
  in due famiglie;
- catalogo leggibile da tutti, scritture rifiutate a chi non è curatore, bozze e
  cronologie invisibili ai non curatori, ricetta in bozza visibile ai membri di una
  famiglia con un pasto che la cita;
- storico non modificabile né cancellabile da nessuno;
- `app_admin` e `recipe_curator` senza accesso alle famiglie;
- `app_job` limitato alle sue tabelle; `anon` solo con la funzione delle liste
  temporanee e solo per token validi e non scaduti; `app_server` senza poteri senza
  cambio di ruolo e capace di passare ad `authenticated`, `anon`, `app_job`;
- contatori: crescono una volta per transazione, solo nelle famiglie interessate (voti
  e profili in tutte le famiglie dell'utente), mai il ricettario con le bozze;
- vincoli: lunedì, data nella settimana, ricetta o testo libero, attributi delle
  ricette pubblicate, reparti, testi bilingui, fuso valido;
- `meal_passed_at` anche nei giorni del cambio dell'ora legale; `recipe_version_at`;
- trigger dei profili;
- `session_is_active`: vero con una sessione attiva dell'utente, falso con sessione
  inesistente, di un altro utente o scaduta, falso senza `session_id` nei claim;
- un test che elenca le tabelle di `app` e fallisce se una non ha RLS attiva o se
  `anon` ha permessi su una tabella.

## Dati locali e script dei primi utenti

- `supabase/seed.sql`: solo per lo sviluppo locale (W1, W5): le persone di prova
  sopra, con password note, famiglie, un curatore, qualche ingrediente e ricetta
  minimi. Non si applica al progetto remoto.
- `supabase/scripts/bootstrap.sql`: per il progetto vero. Gli utenti si creano prima a
  mano dalla dashboard (Authentication > Users > Add user). Lo script ha in testa una
  sezione `values` da compilare (email, nome, lingua, famiglia, ruolo nella famiglia,
  ruoli globali), si ferma se un'email non esiste in `auth.users`, si può rilanciare
  senza duplicati, aggiorna profili e ruoli, crea la famiglia con impostazioni `{}`
  e le appartenenze, in una transazione. Lo esegue l'utente dall'editor SQL; il worker
  non lo esegue sul remoto senza una DOMANDA.

## Passi remoti (tutti con DOMANDA, nessuno in questa attività senza via)

- applicazione delle migrazioni al progetto (dipende dall'integrazione GitHub, che W1
  verifica: potrebbe applicarle da sola al merge su `main`, va chiarito **prima** del
  merge di questa PR);
- password di `app_server` e stringa di connessione di Hyperdrive;
- disattivazione della Data API, oppure conferma che lo schema `app` non è esposto;
- esecuzione di `bootstrap.sql`.

## Interfacce con altri worker

| Con | Cosa |
|---|---|
| W1 | ruoli per rotta (`authenticated` con claim, `app_job`, `anon`); nomi qualificati con `app.`; lettura dei contatori `app.families.data_version` e `app.catalogue_state.version`; `app.profiles.locale` e `app.session_is_active()` a ogni richiesta; controllo del ruolo delle operazioni su **`app.family_members`** (`family_id`, `user_id`, `role` in `family_admin`/`member`) e **`app.user_roles`** (`user_id`, `role` in `recipe_curator`/`app_admin`), oppure con le funzioni `app.is_member`, `app.is_family_admin`, `app.has_role`; idempotenza con identificativi del client; job di CI per `supabase test db`; verifica dell'integrazione GitHub prima del merge |
| W3 | forma di `content` (jsonb, nessun vincolo nel database oltre a `object`); colonne di proiezione di `recipes` e `recipe_ingredients` come nella sua «Interfaccia per W2»; stagioni di `domain/src/planner`; `origin_slug` e `origin_type` per l'import; `books.slug`; `variety_key` calcolato con `varietyKey` di W4 |
| W4 | codici dei reparti; forma canonica di `quantity_at_check`; codici delle unità senza check sulle righe delle ricette (li valida il dominio), ma `app.unit_dimension` riproduce i codici di `domain/src/units/codes.ts` e la regola di W4 per il vincolo delle equivalenze (massa e volume raggruppati, ogni altro codice da solo): un codice nuovo richiede una migrazione che aggiorni la funzione; equivalenze per ingrediente |

## Decisioni da riportare nella specifica

**Prodotto**

- Nel traguardo A le famiglie e i primi utenti si preparano con uno script dalla
  dashboard di Supabase; creazione ed eliminazione di famiglie da parte degli utenti
  arrivano con l'ondata 3 (sezioni 7 e 10).
- Attributi del pianificatore obbligatori per pubblicare, tranne stagioni e ingrediente
  principale (sezione 8; decisione dell'utente).

**Tecniche**

- Tabelle e funzioni nello schema `app`, non esposto dalla Data API (sezioni 1 e 2).
- Ruoli: login unico `app_server` (NOINHERIT, membro di `authenticated`, `anon`,
  `app_job`); `app_job` per job e generazione; `anon` solo per le liste temporanee
  (sezioni 1 e 4).
- Campi bilingui jsonb `{it-IT, en-GB}` nelle proiezioni al posto delle tabelle
  `*_translations` (sezioni 2, 12 e 15).
- Contatori di versione: `families.data_version` e `catalogue_state.version`, fatti
  crescere da trigger una volta per transazione; voti e profili fanno crescere tutte le
  famiglie dell'utente; le bozze non toccano il ricettario (sezioni 1 e 15).
- Idempotenza con identificativi del client sulle righe create, nessuna tabella
  generica (sezione 1).
- Proiezioni di `recipes` e `recipe_ingredients` come nell'interfaccia di W3, con
  `quantity_kind`, testo della fonte e preparazione; `variety_key` calcolato con
  `varietyKey` di W4; identità d'origine `origin_slug`/`origin_type`; `books.slug`
  (sezioni 2, 6 e 8).
- `families.measurement_system` in colonna; impostazioni salvate solo se cambiate,
  default dal dominio (sezione 2).
- `ingredient_versions.content` comprende le equivalenze (sezioni 2 e 8).
- Al massimo un'equivalenza per ingrediente, ambito e dimensione dell'unità di partenza,
  con la dimensione ricavata in SQL dai codici di W4 (sezioni 2 e 6).
- `channel` (`web`/`mcp`/`import`) su registro dei pasti, versioni, stati e salvataggi
  delle bozze (sezione 2, tracciamento).
- Chiavi esterne: autori `on delete set null` («ex membro»), dati personali e
  appartenenze `on delete cascade`, dati di famiglia con la famiglia, pasti che
  impediscono di cancellare una ricetta citata (sezioni 2 e 7).
- Funzioni SQL `meal_passed_at` e `recipe_version_at` per la R1 (sezione 5).
- Revoca immediata: `app.session_is_active()` controlla a ogni richiesta la sessione
  del token in `auth.sessions`; il profilo mancante vale come utente inesistente
  (sezioni 1 e 17).
- Ambiente locale: CLI di Supabase su Podman, test pgTAP (sezione 9).
- Tabelle dell'ondata 3 rimandate (sezione 15).
