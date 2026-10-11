# Schema e permessi (W2): design di dettaglio

Creato: 11 ottobre 2026
Ultimo aggiornamento: 11 ottobre 2026, correzioni dopo la seconda review di spec e piano
(`progetto/coordinamento/revisioni/w2-spec-piano-2.md`, decisioni del coordinatore in
`progetto/coordinamento/messaggi/w2-02-review2.md`; prima review in
`w2-spec-piano.md` e `w2-01-review.md`).
Attività: ondata 1, W2, branch `fondamenta/schema`, proprietà `supabase/`.
Riferimenti: specifica principale `2026-09-29-app-famiglia-design.md`, sezioni 1, 2,
5, 7, 8, 12, 15, 16, 17 (R1, R2, R4); piano generale `2026-10-11-piano-generale.md`;
`spike/REPORT.md`; spec di W3 (`2026-10-11-ricetta-import.md`, «Interfaccia per W2») e
di W4 (`2026-10-11-unita-spesa.md`). Questo documento estende la specifica e le resta
subordinato.

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
validazione del documento ricetta, annullamento delle sole proprie modifiche) restano
nelle operazioni del server (W1 e ondata 2). Lo schema garantisce isolamento,
integrità referenziale, vincoli semplici, colonne immutabili e storico conservato.

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
   test pgTAP. Verificato l'11 ottobre 2026: Postgres 17.11, `pg_cron`, `pg_net` e
   `pgtap` disponibili; `supabase test db` non avvolge i file in una transazione, quindi
   un file può usare transazioni reali distinte; `\ir` e `\gset` di psql funzionano.
   Nessuna dipendenza npm.
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
   con check constraint; `quantity_at_check` nella forma canonica di W4, validata dal
   server; dimensioni delle unità per il vincolo delle equivalenze; equivalenze per
   preparazione.
9. **Attributi del pianificatore obbligatori per pubblicare** (decisione dell'utente),
   tranne `seasons` e l'ingrediente principale.
10. **Default delle impostazioni della famiglia nel dominio**: il database conserva solo
    i valori impostati (`{}` per una famiglia nuova); il server completa con i default
    del dominio in lettura.
11. **Nome delle ricette mai pubblicate** (coordinatore): `recipes.name` e
    `recipes.description` si riempiono anche per le bozze nuove, dal server a ogni
    salvataggio e dall'import; le altre proiezioni restano vuote.

## Decisioni dopo la review (11 ottobre 2026)

Dal coordinatore, sui rilievi della review di spec e piano:

1. **`EXECUTE`**: Postgres concede `EXECUTE` a PUBLIC su ogni funzione nuova e
   `alter default privileges in schema` non lo toglie (verificato in locale: `anon`
   eseguiva le funzioni interne). Ogni migrazione revoca `execute … from public`
   esplicitamente su ogni funzione che crea, prima dei grant selettivi; i test chiamano
   le funzioni interne come `anon` e `authenticated` e ispezionano le ACL.
2. **Risalita alla famiglia**: gli utenti eseguono solo funzioni che restituiscono
   l'esito dell'autorizzazione (`can_access_week`…), mai l'identificativo della
   famiglia di un record; i risolutori interni servono solo ai trigger e nessun ruolo
   li esegue.
3. **`undoes`**: annullamento e modifica annullata stanno sullo stesso slot, garantito
   da una chiave esterna composta. Lo scambio registra una modifica per ciascuno dei
   due slot, quindi è compatibile.
4. **Ingredienti e libri**: nessuna cancellazione fisica; si archiviano
   (`archived_at`). L'identità resta per lo storico delle versioni.
5. **Bozze**: nessuna cancellazione fisica. Pubblicazione e scarto chiudono la bozza
   (`closed_at`, `outcome`); la cronologia dei salvataggi resta per sempre; nessuna
   cascata distruttiva. Anche le ricette mai pubblicate non si cancellano: lo scarto
   chiude la bozza e la riga di `recipes` resta in stato `draft`, per i pasti che la
   citano.
6. **Pasti e settimane**: `update` solo sulle colonne previste dalle operazioni;
   famiglia e data della settimana, settimana, data e pasto dello slot sono immutabili;
   lo scambio aggiorna i contenuti dei due slot.
7. **Bozze citate nei pasti**: quando cambiano nome o descrizione di una ricetta in
   bozza crescono i contatori delle famiglie che la citano.
8. **Bootstrap**: famiglia identificata da un UUID dichiarato nell'input.
9. **Test isolati dal seed**: dati di prova con prefisso `test-`, conteggi limitati a
   quei dati.
10. **Nomi per W1**: sezione «Interfaccia per W1» con i nomi esatti.
11. **Equivalenze per preparazione**: nessuna azione oltre a quanto già fatto; la regola
    di applicazione (la specifica vince sulla generica) è del dominio di W4.
12. **Quantità**: i tre casi espressi separatamente nel vincolo.

Punti aperti decisi dal coordinatore:

- **R1 senza versione al momento del pasto** (storico importato prima della prima
  pubblicazione, o pasto passato corretto con una ricetta pubblicata dopo): si usa la
  prima versione pubblicata; se la ricetta non è mai stata pubblicata, il pasto mostra
  solo nome e descrizione e non entra nella spesa. `recipe_version_at` restituisce la
  prima versione quando l'istante precede la prima pubblicazione, `null` solo se non ce
  n'è nessuna.
- **Revoca**: i test pgTAP verificano, con gli stessi claim, che la rimozione dalla
  famiglia e la revoca del ruolo di curatore valgano subito, anche sulle letture del
  catalogo. La prova con i token OAuth reali è nell'attività «Collegamento degli
  agenti» dell'ondata 2, non qui.
- **`triedUndated`** (R4): tabella `family_tried_recipes` per famiglia, riempita
  dall'import; il pianificatore per ora non la usa.
- **Contatori**: contratto unico «al massimo un incremento per transazione che cambia i
  dati letti», con trigger per riga deduplicati nella transazione. Test con transazioni
  reali distinte e con rollback.

## Decisioni dopo la seconda review (11 ottobre 2026)

1. **Controllo della data dello slot**: il trigger legge la settimana con i permessi di
   chi inserisce (non SECURITY DEFINER). Una settimana altrui o inesistente non si trova,
   il controllo si salta e l'inserimento cade sulla policy: stesso errore nei due casi,
   nessun dato della settimana nel messaggio. Il job vede tutte le settimane e il
   controllo vale anche per lui.
2. **Autori delle bozze chiuse**: contenuto, revisione, identità ed esito restano
   immutabili; l'unico aggiornamento ammesso su una bozza chiusa è l'azzeramento di
   `created_by`, `updated_by`, `closed_by` da parte delle chiavi esterne
   (`on delete set null`) quando si cancella un utente. Gli utenti non possono farlo.
3. **Prova del bootstrap**: sostituisce solo i valori dell'input; famiglie di prova con
   UUID espliciti, pulizia solo per UUID; una famiglia omonima estranea sopravvive.
4. **Fixture**: slot di prova con UUID fissi, conteggi per UUID.
5. **Nomi degli autori per i curatori** (decisione del coordinatore):
   `app.catalogue_author_names()`, SECURITY DEFINER, restituisce solo `user_id` e
   `display_name` delle persone che compaiono come autori in bozze, salvataggi, versioni
   e storico degli stati; vuota per chi non è curatore; eseguibile da `authenticated`,
   non da `anon` né da `app_job`. Serve all'attribuzione delle bozze condivise e dei
   conflitti fra curatori che non hanno famiglie in comune.
6. **Scritture senza effetti**: accettato che facciano crescere i contatori; il contratto
   diventa «al massimo un incremento per transazione; una scrittura senza effetti può
   farlo crescere comunque (invalidazione in più, mai dati sbagliati)».

## Decisioni dopo la review della PR (11 ottobre 2026)

Rilievi di `progetto/coordinamento/revisioni/w2-pr4.md`, decisioni in
`progetto/coordinamento/messaggi/w2-03-review-pr4.md`:

1. **Bozze collegate ai pasti**: un utente (`authenticated`) non può collegare a un pasto,
   né inserendolo né cambiandone `recipe_id`, una ricetta in bozza: altrimenti
   `recipes_read_cited_draft` gliela renderebbe leggibile. Le bozze arrivano ai pasti solo
   dall'import (`app_job` o proprietario). Unica eccezione: una bozza già citata da un
   altro slot della stessa famiglia (scambio nello storico importato). Porzioni e note
   degli slot che la citano restano modificabili. Trigger `BEFORE` limitati a
   `authenticated` e alle settimane accessibili.
2. **Autore cancellato nello storico**: quando la chiave esterna azzera
   `meal_changes.actor_id` cresce il contatore della famiglia (trigger
   `after update of actor_id`; gli utenti non aggiornano il registro).

## Struttura di `supabase/`

```
supabase/
├── config.toml           da `supabase init`; Data API solo su public e graphql_public
├── README.md             comandi locali e passi remoti
├── migrations/           un file per area, in ordine
├── seed.sql              dati locali di sviluppo (non per la produzione)
├── scripts/
│   ├── bootstrap.sql         primi utenti, ruoli e famiglia sul progetto vero
│   └── bootstrap_test.sh     prova locale dello script
└── tests/                pgTAP, un file per area, più le funzioni di aiuto
```

Migrazioni, nell'ordine:

| File | Contenuto |
|---|---|
| `…_foundation.sql` | schema `app`, ruoli `app_server` e `app_job`, permessi sullo schema, funzioni di forma dei testi |
| `…_identity.sql` | `profiles`, `user_roles`, trigger su `auth.users`, `has_role`, `session_is_active` |
| `…_catalogue.sql` | ricette, proiezioni, ingredienti, equivalenze, libri, bozze, versioni, storico |
| `…_families.sql` | famiglie, membri, libri, ingredienti evitati, esclusioni, ricette provate |
| `…_meals.sql` | settimane, pasti, registro, voti, viste dei punteggi, funzioni R1 |
| `…_shopping.sql` | liste, spunte, voci libere, rimessi, liste temporanee |
| `…_jobs.sql` | `weekly_jobs`, policy di `app_job` |
| `…_versions.sql` | contatori e trigger |
| `…_cron.sql` | pulizia delle liste temporanee con `pg_cron` |

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
| `app_job` | NOLOGIN | legge famiglie, impostazioni, membri, libri, evitati, esclusioni, ricette provate, voti, settimane, pasti e catalogo pubblicato di tutte le famiglie; scrive `weeks`, `meal_slots` (solo le colonne dei contenuti) e `weekly_jobs` |

- Il server (W1) sceglie il ruolo per rotta: richieste degli utenti →
  `set local role authenticated` con `request.jwt.claims`; `/internal/jobs/*` →
  `set local role app_job`; `/shopping-lists/<token>` → `set local role anon`.
- La password di `app_server` non sta nelle migrazioni: si imposta sul progetto remoto
  (`alter role app_server with password …`) con una DOMANDA all'utente. Per il Session
  pooler il nome utente è `app_server.<project_ref>`.
- `app_job` ha policy proprie (`to app_job`) e non vede bozze, cronologie, profili,
  ruoli globali, spesa né registro dei pasti.

**Funzioni ed `EXECUTE`.** Ogni migrazione, subito dopo aver creato una funzione,
esegue `revoke execute on function … from public` e poi concede `execute` solo ai
ruoli elencati qui. Le funzioni di trigger e i risolutori interni non hanno grant: li
esegue solo il proprietario, quando scatta un trigger.

| Ruolo | Funzioni eseguibili |
|---|---|
| `anon` | `temporary_list_by_token` |
| `authenticated` | `is_localized_text`, `is_localized_list`, `unit_dimension`, `has_role`, `session_is_active`, `is_member`, `is_family_admin`, `shares_family`, `can_access_week`, `can_access_slot`, `can_access_list`, `catalogue_author_names` (vuota per chi non è curatore), `meal_passed_at`, `recipe_version_at` |
| `app_job` | `is_localized_text`, `is_localized_list`, `unit_dimension`, `meal_passed_at`, `recipe_version_at` |
| PUBLIC, `app_server` | nessuna |

Un test confronta queste liste con le ACL effettive di tutte le funzioni di `app` e
chiama le funzioni interne (`bump_family_version`, `week_family_id`…) come `anon` e
`authenticated`, aspettandosi il rifiuto.

## Tabelle

Convenzioni: chiavi `uuid` con `default gen_random_uuid()`, che il client può
fornire dove serve l'idempotenza; date `timestamptz` con `default now()`; testi
localizzati in jsonb `{"it-IT": text, "en-GB": text}`; colonne d'autore che puntano ad
`auth.users(id)` con `on delete set null` (le tracce diventano «ex membro»);
canale `channel` con valori `web`, `mcp`, `import`. Gli `update` si concedono solo
sulle colonne elencate nella sezione «Permessi»; le altre sono immutabili per gli
utenti.

### Identità

| Tabella | Colonne e vincoli |
|---|---|
| `profiles` | `user_id` PK → `auth.users` on delete cascade; `display_name` non vuoto; `locale` check `it-IT`/`en-GB`; `created_at`, `updated_at` |
| `user_roles` | PK (`user_id`, `role`); `user_id` → `auth.users` on delete cascade; `role` check `recipe_curator`/`app_admin`; `granted_by`, `granted_at` |

Un trigger `after insert` su `auth.users` crea il profilo: nome da
`raw_user_meta_data->>'display_name'`, altrimenti la parte dell'email prima della @;
lingua da `raw_user_meta_data->>'locale'` se valida, altrimenti `it-IT`. Il server
legge `profiles.locale` a ogni richiesta e un profilo mancante vale come utente
inesistente: il profilo sparisce con l'utente.

**Revoca immediata (sezioni 1 e 17).** `app.session_is_active() returns boolean`: vero
se in `auth.sessions` esiste la sessione con `id = (auth.jwt()->>'session_id')::uuid`
e `user_id = auth.uid()`, non scaduta (`not_after` nullo o futuro). Il server di W1 la
chiama a ogni richiesta nel ruolo dell'utente: un JWT ancora valido di una sessione
chiusa (uscita, account cancellato, accesso dell'agente revocato) viene rifiutato.
`auth.sessions` ha anche `oauth_client_id` (verificato in locale): le sessioni degli
agenti stanno nella stessa tabella. La prova con token OAuth reali è dell'ondata 2.
Appartenenze e ruoli globali non dipendono dal token: le policy li leggono a ogni query,
quindi una rimozione o una revoca vale dalla query successiva anche con lo stesso JWT.

### Catalogo

| Tabella | Colonne e vincoli |
|---|---|
| `recipes` | `id`; `slug` univoco; identità d'origine (W3): `origin_slug` univoco e facoltativo, `origin_type` facoltativo, check `web`/`youtube`/`libro`/`casa`; `status` check `draft`/`published`/`archived`; `version` int ≥ 0 (0 = mai pubblicata); proiezione: `name`, `description` (jsonb), `source_type` (`web`/`youtube`/`book`/`home`), `source_url`, `book_id` → `books`, `book_pages`, `duration_minutes` > 0, `base_servings` > 0, `protein_group`, `is_fresh_fish`, `carbohydrate_group`, `has_vegetables`, `category`, `meal_type`, `seasons` text[], `is_heavy`; `tags` text[]; `archived_at`, `archived_by`, `created_by`, `created_at`, `updated_by`, `updated_at` |
| `recipe_ingredients` | proiezione: `recipe_id` → `recipes` on delete cascade; `position`; PK (`recipe_id`, `position`); `ingredient_id` → `ingredients`; `variety` jsonb; `variety_key` text (`varietyKey(variety['it-IT'])` di W4; vuota senza varietà); `quantity_kind`; `quantity` numeric > 0; `unit` text; `quantity_text` jsonb; `source_text` non vuoto, al massimo 200 caratteri; `preparation` jsonb; `is_optional`, `is_primary`; univoche (`recipe_id`, `position`) e (`recipe_id`, `ingredient_id`, `variety_key`); al massimo una riga principale per ricetta |
| `ingredients` | `id`; `slug` univoco; `name` jsonb; `synonyms` jsonb `{"it-IT": [], "en-GB": []}`; `department` check sui reparti di W4; `is_pantry`; `version` int ≥ 1; `archived_at`, `archived_by`; autori e date |
| `ingredient_versions` | PK (`ingredient_id`, `version`); `ingredient_id` → `ingredients` senza cascata; `content` jsonb (reparto, dispensa, nomi, sinonimi ed equivalenze); `changed_by`, `changed_at`, `channel`; solo aggiunte |
| `ingredient_unit_equivalences` | `id`; `ingredient_id` → `ingredients`; `from_unit`, `to_unit`; `from_dimension` generata con `app.unit_dimension(from_unit)`; `factor` > 0; `scope` check `recipe`/`shopping`; `preparation` text facoltativo; `source`; univoca (`ingredient_id`, `scope`, `from_dimension`, `preparation`) con `nulls not distinct` |
| `books` | `id`; `slug` univoco (W3); `title`; `archived_at`, `archived_by`; `created_by`, `created_at` |
| `recipe_drafts` | `id`; `recipe_id` → `recipes` senza cascata; `kind` check `new`/`revision`; `base_version`, nullo se e solo se `new`; `content` jsonb; `revision` int ≥ 1; `created_by`, `created_at`, `updated_by`, `updated_at`; `closed_at`, `closed_by`, `outcome` check `published`/`discarded` (`closed_at` e `outcome` entrambi nulli o entrambi presenti); al massimo una bozza aperta per ricetta (indice univoco parziale su `recipe_id` dove `closed_at is null`); una bozza chiusa non si modifica più (trigger), salvo l'azzeramento degli autori da parte delle chiavi esterne quando si cancella un utente |
| `recipe_draft_saves` | PK (`draft_id`, `revision`); `draft_id` → `recipe_drafts` senza cascata; `content`; `saved_by`, `saved_at`, `channel`; `overwritten` boolean, unica colonna aggiornabile; conservati per sempre |
| `recipe_versions` | PK (`recipe_id`, `version`); `content` jsonb; `published_by`, `published_at`, `channel`; `restored_from` int; `restored_instant` timestamptz (ripristino dell'intero catalogo); solo aggiunte |
| `recipe_status_changes` | `id`; `recipe_id`; `status`; `changed_by`, `changed_at`, `channel`; solo aggiunte |

**Vincolo delle quantità** su `recipe_ingredients`, tre casi separati:

- `amount`: `quantity` e `unit` presenti, `quantity_text` nullo;
- `to_taste`: `quantity`, `unit` e `quantity_text` nulli;
- `text`: `quantity_text` presente, `quantity` e `unit` nulli.

**Check di `recipes`:**

- `version > 0` implica `name`, `description`, `source_type`, `duration_minutes`,
  `base_servings`, `protein_group`, `is_fresh_fish`, `carbohydrate_group`,
  `has_vegetables`, `category`, `meal_type`, `is_heavy` non nulli (decisione
  dell'utente); `seasons` e `is_primary` restano facoltativi;
- `status = 'draft'` se e solo se `version = 0`;
- vocabolari della sezione 2: `protein_group` (`fish`, `white_meat`, `red_meat`,
  `cured_meat`, `legumes`, `eggs`, `cheese`, `vegetarian`), `carbohydrate_group`
  (`pasta`, `rice`, `potatoes`, `bread`, `cereals`, `none`), `category` (`wok`,
  `skottle`, `oven_bake`, `grill`, `pan`, `soup`, `salad`, `savoury_pie`,
  `wrap_sandwich`, `burger`, `other`), `meal_type` (`lunch`/`dinner`/`both`), `seasons`
  sottoinsieme di `spring`, `summer`, `autumn`, `winter` (`domain/src/planner/types.ts`).

I testi jsonb hanno un check di forma: oggetto con le sole chiavi `it-IT` e `en-GB`;
la completezza la verifica il dominio alla pubblicazione.

**Proiezioni** allineate all'«Interfaccia per W2» di W3: ogni colonna corrisponde a un
campo del documento (`duration_minutes` ← `durationMinutes`, `quantity_kind` ←
`quantity.kind`…), ricalcolata dal server a ogni pubblicazione o ripristino (le righe
di `recipe_ingredients` si cancellano e si reinseriscono: sono proiezione, non storico).
`content` è un `RecipeDocument` (versioni) o un `RecipeDraftDocument` (bozze e
cronologia), entrambi con `schemaVersion`; il database controlla solo che sia un
oggetto. Tag, foto, stato, versione, date, autori e identità d'origine stanno fuori dal
documento.

**Ricette mai pubblicate.** Una ricetta nuova in bozza ha la riga in `recipes` con
`status = 'draft'` e `version = 0`; il server ne aggiorna `name` e `description` a ogni
salvataggio della bozza `new` e l'import li scrive dal documento; le altre proiezioni
restano vuote. Un pasto (per esempio dello storico importato) che la cita ne mostra il
nome: i membri leggono solo quella riga, mai il contenuto della bozza.

**Ciclo di vita delle bozze.** Una bozza si apre con `kind = 'new'` (ricetta mai
pubblicata) o `'revision'` (con `base_version`). Ogni salvataggio aggiunge una riga a
`recipe_draft_saves` e aggiorna `content` e `revision`. La pubblicazione chiude la
bozza con `outcome = 'published'`, lo scarto con `'discarded'`. Una nuova modifica
della stessa ricetta apre una bozza nuova. Né le bozze né i salvataggi si cancellano;
le ricette non si cancellano. Scartare la bozza di una ricetta mai pubblicata la lascia
in `recipes` con stato `draft` e senza bozza aperta: non compare nella sezione delle
bozze (bozze aperte) né nel ricettario.

**Ingredienti e libri** non si cancellano: si archiviano con `archived_at`. Le versioni
storiche li citano dentro `content`, quindi la loro identità deve restare risolvibile.

**Equivalenze.** `app.unit_dimension(text)` restituisce `mass` per tutte le unità di
massa, `volume` per tutte quelle di volume, il codice stesso per `tbsp`, `tsp`, ogni
unità contata e `us_cup`; null per un codice sconosciuto, che quindi è rifiutato. La
funzione riproduce i codici di `domain/src/units/codes.ts`: un codice nuovo richiede una
migrazione. `preparation` è la preparazione in italiano normalizzata dal dominio:
l'equivalenza vale solo per le righe con quella preparazione, senza vale per tutte; la
scelta fra specifica e generica è del dominio.

### Famiglie

| Tabella | Colonne e vincoli |
|---|---|
| `families` | `id`; `name` non vuoto (non univoco); `settings` jsonb oggetto, default `{}`; `measurement_system` check `metric`/`uk_imperial`; `time_zone` default `Europe/Rome`, validato da trigger su `pg_timezone_names`; `data_version` bigint; `data_version_xid` xid8; `created_at` |
| `family_members` | PK (`family_id`, `user_id`); `family_id` on delete cascade; `user_id` → `auth.users` on delete cascade; `role` check `family_admin`/`member`; `joined_at` |
| `family_books` | PK (`family_id`, `book_id`) |
| `family_ingredients` | PK (`family_id`, `ingredient_id`); `restriction` check `avoid`/`limit`; `weekly_max` int > 0, presente se e solo se `limit` |
| `recipe_exclusions` | PK (`family_id`, `recipe_id`); `reason`; `created_by`, `created_at` |
| `family_tried_recipes` | PK (`family_id`, `recipe_id`); `source` check `import`; `created_at`: ricette già provate senza data (R4, `triedUndated` di W3), riempita dall'import; il pianificatore per ora non la usa |

### Pasti e voti

| Tabella | Colonne e vincoli |
|---|---|
| `weeks` | `id`; `family_id` on delete cascade; `starts_on` lunedì; univoche (`family_id`, `starts_on`) e (`id`, `family_id`); `generated_at` |
| `meal_slots` | `id`; `week_id` on delete cascade; `date` dentro la settimana (trigger all'inserimento, con i permessi di chi inserisce: non legge settimane non autorizzate; settimana e data sono poi immutabili); `meal_type` `lunch`/`dinner`; univoca (`week_id`, `date`, `meal_type`); `recipe_id` → `recipes` on delete restrict, una ricetta in bozza solo dall'import (trigger: gli utenti non la collegano, salvo che la famiglia la citi già); `free_text`; non entrambi; `servings` ≥ 0; `note` al massimo 200 caratteri; `updated_by` (null = app), `updated_at` |
| `meal_changes` | `id` (dal client); l'azzeramento di `actor_id` alla cancellazione di un utente fa crescere il contatore della famiglia; `meal_slot_id` on delete cascade; `actor_id`; `channel`; `before`, `after` jsonb; `undoes`; `created_at`; univoca (`id`, `meal_slot_id`); chiave esterna (`undoes`, `meal_slot_id`) → (`id`, `meal_slot_id`) on delete cascade: si annulla solo una modifica dello stesso slot; solo aggiunte |
| `ratings` | PK (`user_id`, `recipe_id`); `user_id` on delete cascade; `stars` 1-5; `updated_at`; non su ricette in bozza (policy) |

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
  recente con `published_at <= instant`; se l'istante precede la prima pubblicazione,
  la prima versione; `null` solo se la ricetta non è mai stata pubblicata (il pasto
  mostra solo nome e descrizione e non entra nella spesa).

### Spesa

| Tabella | Colonne e vincoli |
|---|---|
| `shopping_lists` | `id`; `family_id` on delete cascade; `week_id`; chiave esterna (`week_id`, `family_id`) → `weeks` (`id`, `family_id`): la settimana è della stessa famiglia; univoca (`family_id`, `week_id`); `updated_by`, `updated_at` |
| `shopping_list_checks` | PK (`shopping_list_id`, `ingredient_id`, `variety_key`); `quantity_at_check` jsonb oggetto nella forma canonica di W4 (`texts` è un elenco di `{key, text: {it-IT, en-GB}}`), validata dal server; `checked_by`, `checked_at` |
| `shopping_list_added_back` | PK (`shopping_list_id`, `ingredient_id`, `variety_key`); `added_by`, `added_at` |
| `shopping_list_items` | `id` (dal client); `shopping_list_id` on delete cascade; `text` non vuoto; `checked`; autori e date |
| `temporary_lists` | `token` PK casuale (48 caratteri esadecimali); `family_id` on delete cascade; `items` jsonb array; `created_by`; `expires_at` default `now() + 30 minuti` |

`app.temporary_list_by_token(token)` restituisce `items` se il token esiste e non è
scaduto, altrimenti null; è l'unico accesso di `anon`. Un job di `pg_cron` ogni 15
minuti cancella le liste scadute.

### Job e catalogo

| Tabella | Colonne e vincoli |
|---|---|
| `weekly_jobs` | PK (`family_id`, `target_week`); `target_week` lunedì; `status` check `pending`/`running`/`done`/`failed`; `attempts` ≥ 0; `error`; `updated_at` |
| `catalogue_state` | una sola riga; `version` bigint; `version_xid` xid8 |

### Rimandate

- Ondata 3: `family_invitations`, `family_removals`, `app_invitations`,
  `agent_authorizations`; creazione ed eliminazione di famiglie da parte degli utenti
  (nel traguardo A le famiglie si creano con lo script). Le chiavi esterne sono già
  pronte per rimozioni e cancellazioni.
- Attività «Menu e job» dell'ondata 2: il cron orario verso `/internal/jobs/weekly`, con
  l'URL del Worker e il segreto nel Vault, che dipendono dall'ambiente.
- Tracciamento generale del catalogo e dell'amministrazione (sezione 2, proposta): per
  ora `channel` e autore sulle tabelle di storico.

## Permessi (RLS)

RLS attiva su tutte le tabelle di `app`. Funzioni di autorizzazione SECURITY DEFINER,
`stable`, con `search_path` vuoto, che restituiscono solo un booleano:

- `app.is_member(family_id)`, `app.is_family_admin(family_id)`;
- `app.has_role(role)`: ruolo globale dell'utente corrente;
- `app.shares_family(user_id)`: l'utente corrente e `user_id` hanno una famiglia in
  comune;
- `app.can_access_week(week_id)`, `app.can_access_slot(slot_id)`,
  `app.can_access_list(list_id)`: il record esiste e appartiene a una famiglia
  dell'utente. Per un record altrui o inesistente restituiscono `false`, senza
  distinguere i due casi.

I risolutori `app.week_family_id`, `app.slot_family_id`, `app.list_family_id`
restituiscono la famiglia di un record e servono solo alle funzioni dei contatori:
nessun ruolo li esegue.

**Nomi degli autori.** La specifica principale chiede che i curatori vedano autore e
ultima modifica delle bozze condivise e chi ha salvato in un conflitto, anche senza
famiglie in comune. `profiles` resta leggibile solo a sé stessi e ai membri delle stesse
famiglie; i curatori leggono i nomi degli autori con
`app.catalogue_author_names() returns table (user_id uuid, display_name text)`: solo le
persone che compaiono in `recipe_drafts` (`created_by`, `updated_by`, `closed_by`),
`recipe_draft_saves.saved_by`, `recipe_versions.published_by`,
`recipe_status_changes.changed_by`; nessun altro campo del profilo; nessuna riga per chi
non è curatore.

Permessi di `authenticated` (lettura e scrittura filtrate dalle policy; per gli
`update`, le sole colonne elencate):

| Tabelle | Lettura | Inserimento | Modifica (colonne) | Cancellazione |
|---|---|---|---|---|
| `profiles` | propria o di chi condivide una famiglia; i curatori leggono i nomi degli autori del ricettario solo con `catalogue_author_names` | — (trigger) | propria: `display_name`, `locale`, `updated_at` | — |
| `user_roles` | propri | — | — | — |
| `recipes` | `published`, `archived`; `draft` ai curatori e ai membri di famiglie con un pasto che la cita | curatori | curatori: tutte tranne `id`, `created_by`, `created_at` | — |
| `recipe_ingredients` | tutti | curatori | — | curatori (riscrittura della proiezione) |
| `ingredients` | tutti | curatori | curatori: `name`, `synonyms`, `department`, `is_pantry`, `version`, `archived_at`, `archived_by`, `updated_by`, `updated_at` | — |
| `books` | tutti | curatori | curatori: `title`, `archived_at`, `archived_by` | — |
| `ingredient_unit_equivalences` | tutti | curatori | curatori: `to_unit`, `factor`, `source` | curatori (la storia è in `ingredient_versions`) |
| `recipe_versions` | tutti | curatori | — | — |
| `recipe_drafts` | curatori | curatori | curatori: `content`, `revision`, `updated_by`, `updated_at`, `closed_at`, `closed_by`, `outcome` | — |
| `recipe_draft_saves` | curatori | curatori | curatori: `overwritten` | — |
| `recipe_status_changes`, `ingredient_versions` | curatori | curatori | — | — |
| `catalogue_state` | tutti (`version`) | — | — | — |
| `families` | membri | — | amministratori: `name`, `settings`, `measurement_system`, `time_zone` | — |
| `family_members` | membri | — | amministratori: `role` | amministratori, oppure la propria riga (uscita) |
| `family_books` | membri | amministratori | — | amministratori |
| `family_ingredients` | membri | amministratori | amministratori: `restriction`, `weekly_max` | amministratori |
| `recipe_exclusions` | membri | membri | — | membri |
| `family_tried_recipes` | membri | amministratori | — | amministratori |
| `weeks` | membri | membri | membri: `generated_at` | — |
| `meal_slots` | membri | membri (senza collegare ricette in bozza) | membri: `recipe_id`, `free_text`, `servings`, `note`, `updated_by`, `updated_at` | — |
| `meal_changes` | membri | membri, con `actor_id = auth.uid()` | — | — |
| `ratings` | propri o di chi condivide una famiglia | propri, non su bozze | propri: `stars`, `updated_at` | propri |
| `shopping_lists` | membri | membri | membri: `updated_by`, `updated_at` | — |
| `shopping_list_checks` | membri | membri | membri: `quantity_at_check`, `checked_by`, `checked_at` | membri |
| `shopping_list_added_back` | membri | membri | — | membri |
| `shopping_list_items` | membri | membri | membri: `text`, `checked`, `updated_by`, `updated_at` | membri |
| `temporary_lists` | membri | membri | — | — |
| `weekly_jobs` | — | — | — | — |

- I ruoli globali non aprono nulla delle famiglie: nessuna policy di famiglia cita
  `app_admin` o `recipe_curator`.
- Le regole dei flussi restano nel server: per esempio la policy lascia a un
  amministratore togliersi il ruolo, l'operazione impedisce che sia l'ultimo.
- `app_job`: lettura delle tabelle elencate nella sezione dei ruoli (ricette solo
  `published` e `archived`); inserimento in `weeks`, `meal_slots`, `weekly_jobs`;
  modifica di `weeks.generated_at`, delle colonne dei contenuti di `meal_slots` e di
  `weekly_jobs` (`status`, `attempts`, `error`, `updated_at`); nessuna cancellazione.

## Contatori di versione

Contratto con W1: **al massimo un incremento per transazione; una scrittura senza
effetti (zero righe, stessi valori, righe escluse dall'RLS) può farlo crescere comunque**:
un'invalidazione in più, mai dati sbagliati. Ogni transazione che cambia i dati letti
fa crescere il contatore.

- `app.bump_family_version(family_id)` e `app.bump_catalogue_version()` incrementano il
  contatore solo se nella transazione corrente non è già stato fatto
  (`data_version_xid is distinct from pg_current_xact_id()`). Un rollback annulla
  anche l'incremento.
- Contatore della famiglia, trigger per riga su: `families` (solo `name`, `settings`,
  `measurement_system`, `time_zone`), `family_members`, `family_books`,
  `family_ingredients`, `recipe_exclusions`, `family_tried_recipes`, `weeks`,
  `meal_slots`, `meal_changes`, tabelle della spesa (tranne `temporary_lists`).
  `ratings` e `profiles.display_name` fanno crescere il contatore di tutte le famiglie
  dell'utente; `profiles.locale` no, perché è personale.
- Bozze citate nei pasti: un cambio di `name` o `description` di una ricetta in stato
  `draft` fa crescere i contatori delle famiglie con un pasto che la cita.
- Contatore del ricettario, trigger su `recipes` (righe non in bozza), `recipe_ingredients`,
  `ingredients`, `ingredient_unit_equivalences`, `books`. Bozze e cronologie non lo
  toccano.
- `temporary_lists` e `weekly_jobs` non toccano i contatori.
- Il server legge `families.data_version` e `catalogue_state.version`. Le viste del
  ricettario dipendono da tutti e due, perché le medie dei voti sono della famiglia.

## Test

pgTAP in `supabase/tests/`, eseguiti con `supabase test db`. Ogni file include
`helpers/setup.psql` (funzioni `tests.*`) e `helpers/fixtures.psql` (dati di prova).
Tutti i file tranne quello dei contatori sono una transazione annullata alla fine. Il
file dei contatori usa transazioni reali: crea i dati di prova, li controlla fra una
transazione e l'altra e alla fine li cancella con `helpers/cleanup.psql`, che si esegue
anche all'inizio per ripulire un'esecuzione interrotta.

**Isolamento dal seed:** i dati di prova hanno il prefisso `test-` (slug, nomi delle
famiglie) e le email `@test.local`; ogni conteggio su tabelle visibili oltre la famiglia
(catalogo, letture di `app_job`) si limita a quei dati. Il seed e altri dati locali non
cambiano l'esito.

Persone di prova: Anna (amministratrice di `test-Rossi`, membro di `test-Bianchi`),
Bruno (membro `test-Rossi`), Carla (amministratrice `test-Bianchi`), Dario (curatore
senza famiglia), Elena (`app_admin` senza famiglia), Franco (amministratore
`test-Verdi`).

Copertura:

- isolamento in lettura e scrittura per ogni tabella di famiglia, compresa Anna, in due
  famiglie, che non può spostare un pasto né una settimana fra le sue famiglie;
- colonne immutabili: famiglia e data delle settimane; settimana, data e pasto degli
  slot; contatori;
- catalogo leggibile da tutti, scritture rifiutate a chi non è curatore, bozze e
  cronologie invisibili ai non curatori, ricetta in bozza visibile solo ai membri delle
  famiglie con un pasto che la cita;
- ciclo di vita delle bozze: pubblicazione, scarto, nuova bozza della stessa ricetta,
  bozza chiusa immutabile, nessuna cancellazione di bozze, salvataggi, ricette,
  ingredienti e libri; cancellazione del creatore, dell'ultimo modificatore e di chi ha
  chiuso una bozza pubblicata e una scartata, con contenuto e salvataggi intatti;
- nomi degli autori: due curatori senza famiglie in comune leggono il nome l'uno
  dell'altro solo con `catalogue_author_names`; utenti ordinari, `anon`, `app_job` e un
  curatore revocato no;
- controllo della data dello slot con settimana propria, altrui e inesistente e data
  esterna: i due casi non autorizzati danno lo stesso errore;
- bozze collegate a un pasto da un membro, da un curatore membro e da un ex membro in
  un'altra famiglia, in inserimento e in modifica: rifiutate; scambio con una bozza già
  citata e modifica di porzioni e note permessi; l'import le collega;
- autore presente solo nello storico, cancellato dopo l'uscita: autore azzerato, modifica
  conservata, contatore della famiglia cresciuto;
- `undoes` fra slot diversi e fra famiglie rifiutato; cancellazione di una famiglia con
  una catena di annullamenti verificata prima;
- Anna non sposta un pasto né una settimana fra le sue due famiglie; la bozza citata
  sparisce dopo la rimozione del membro;
- revoca con gli stessi claim: rimozione dalla famiglia e revoca del ruolo di curatore
  hanno effetto alla query successiva;
- funzioni di autorizzazione con record propri, altrui, inesistenti e dopo la rimozione;
  funzioni interne rifiutate ad `anon` e `authenticated`; ACL di tutte le funzioni
  uguali alla tabella della sezione «Ruoli»;
- `app_job` limitato alle sue tabelle e colonne; `anon` solo con la funzione delle liste
  temporanee e solo per token validi; `app_server` senza poteri diretti;
- contatori con transazioni reali: un incremento per transazione, due transazioni due
  incrementi, rollback nessuno, generazione di 14 pasti uno; voti e nomi in tutte le
  famiglie dell'utente; bozze citate; ricettario solo per contenuti pubblicati;
- vincoli: lunedì, data nella settimana, ricetta o testo libero, attributi delle
  ricette pubblicate, reparti, testi bilingui, fuso valido, i tre casi delle quantità con
  tutte le combinazioni parziali, equivalenze per dimensione e preparazione;
- `meal_passed_at` anche nei giorni del cambio dell'ora legale; `recipe_version_at`
  prima della prima pubblicazione e per una ricetta mai pubblicata;
- trigger dei profili e `session_is_active`;
- RLS attiva su ogni tabella, nessun permesso di `anon` o PUBLIC sulle tabelle.

## Dati locali e script dei primi utenti

- `supabase/seed.sql`: solo per lo sviluppo locale (W1, W5): quattro persone con
  password nota, due famiglie, un curatore. Niente ricette né ingredienti: il catalogo
  locale arriva dall'import di W3. Non si applica al progetto remoto.
- `supabase/scripts/bootstrap.sql`: per il progetto vero. Gli utenti si creano prima a
  mano dalla dashboard (Authentication > Users > Add user). Lo script ha in testa due
  elenchi da compilare: le persone (email, nome, lingua, ruolo nella famiglia, ruoli
  globali) e la famiglia, **identificata da un UUID** scritto una volta nell'input (per
  esempio da `gen_random_uuid()`) e conservato per i rilanci. Se la famiglia con
  quell'UUID esiste, lo script la lascia com'è (nome e impostazioni compresi) e lo
  dice; altrimenti la crea con impostazioni `{}`. Le appartenenze si legano all'UUID,
  mai al nome: famiglie omonime non vengono toccate. Si ferma se un'email non esiste in
  `auth.users` o manca un amministratore della famiglia; si può rilanciare senza
  duplicati, anche dopo una rinomina. Lo esegue l'utente dall'editor SQL; il worker non
  lo esegue sul remoto senza una DOMANDA.
- `supabase/scripts/bootstrap_test.sh`: prova lo script sul database locale con una
  famiglia omonima preesistente, un rilancio dopo la rinomina e un'email mancante.
  Sostituisce solo i valori dell'input (il controllo del segnaposto resta e si prova);
  usa UUID espliciti e cancella solo quelli: una famiglia omonima estranea sopravvive.

## Passi remoti (tutti con DOMANDA, nessuno in questa attività senza via)

- applicazione delle migrazioni al progetto (dipende dall'integrazione GitHub, che W1
  verifica: potrebbe applicarle da sola al merge su `main`, va chiarito **prima** del
  merge di questa PR);
- password di `app_server` e stringa di connessione di Hyperdrive;
- disattivazione della Data API, oppure conferma che lo schema `app` non è esposto;
- esecuzione di `bootstrap.sql`.

## Interfaccia per W1

Nomi esatti, tutti nello schema `app` (le query del server li qualificano con `app.`):

| Uso | Oggetto |
|---|---|
| Profilo e lingua a ogni richiesta | `app.profiles` (`user_id` uuid PK = `auth.uid()`, `display_name` text, `locale` text `it-IT`/`en-GB`); nessuna riga = utente inesistente |
| Sessione ancora valida a ogni richiesta | `select app.session_is_active()` nel ruolo `authenticated` con i claim impostati |
| Ruoli globali | `app.user_roles` (`user_id` uuid, `role` text `recipe_curator`/`app_admin`), oppure `app.has_role('recipe_curator')` |
| Appartenenza e ruolo nella famiglia | `app.family_members` (`family_id` uuid, `user_id` uuid, `role` text `family_admin`/`member`), oppure `app.is_member(family_id)`, `app.is_family_admin(family_id)` |
| Contatore della famiglia | `app.families.data_version` (bigint) |
| Contatore del ricettario | `app.catalogue_state.version` (bigint, una sola riga) |
| Ruoli per rotta | `set local role authenticated` con `set_config('request.jwt.claims', …, true)`; `set local role app_job` per `/internal/jobs/*`; `set local role anon` per `/shopping-lists/<token>` |
| Login | `app_server` (password impostata a mano; Session pooler: `app_server.<project_ref>`) |

Prima di chiudere l'interfaccia, `session.whoami` di W1 va provato contro queste
migrazioni (richiesta della review).

## Interfacce con altri worker

| Con | Cosa |
|---|---|
| W1 | sezione «Interfaccia per W1»; contratto dei contatori; idempotenza con identificativi del client; job di CI per `supabase test db`; verifica dell'integrazione GitHub prima del merge |
| W3 | forma di `content`; proiezioni di `recipes` e `recipe_ingredients` come nella sua «Interfaccia per W2»; nome e descrizione delle bozze nuove in `recipes`; stagioni di `domain/src/planner`; `origin_slug`/`origin_type`; `books.slug`; `family_tried_recipes` per `triedUndated`; ingredienti e libri archiviati, mai cancellati |
| W4 | codici dei reparti; forma canonica di `quantity_at_check`; `app.unit_dimension` allineata a `domain/src/units/codes.ts`; equivalenze per ingrediente, ambito, dimensione e preparazione |

## Decisioni da riportare nella specifica

**Prodotto**

- Nel traguardo A le famiglie e i primi utenti si preparano con uno script dalla
  dashboard di Supabase; creazione ed eliminazione di famiglie da parte degli utenti
  arrivano con l'ondata 3 (sezioni 7 e 10).
- Attributi del pianificatore obbligatori per pubblicare, tranne stagioni e ingrediente
  principale (sezione 8; decisione dell'utente).
- R1: un pasto passato senza versione in vigore in quel momento usa la prima versione
  pubblicata; se la ricetta non è mai stata pubblicata, mostra solo nome e descrizione e
  non entra nella spesa (sezione 5).
- Bozze, salvataggi, ricette, ingredienti e libri non si cancellano mai: le bozze si
  chiudono (pubblicate o scartate), ingredienti e libri si archiviano (sezione 8).
- Ricette già provate senza data dall'import conservate per famiglia (R4, sezione 11).

**Tecniche**

- Tabelle e funzioni nello schema `app`, non esposto dalla Data API (sezioni 1 e 2).
- Ruoli: login unico `app_server` (NOINHERIT, membro di `authenticated`, `anon`,
  `app_job`); `app_job` per job e generazione; `anon` solo per le liste temporanee;
  `EXECUTE` revocato a PUBLIC su ogni funzione e concesso per ruolo (sezioni 1 e 4).
- Campi bilingui jsonb `{it-IT, en-GB}` nelle proiezioni al posto delle tabelle
  `*_translations` (sezioni 2, 12 e 15).
- Contatori di versione: `families.data_version` e `catalogue_state.version`, al
  massimo un incremento per transazione (una scrittura senza effetti può farlo crescere:
  invalidazione in più, mai dati sbagliati); voti e nomi fanno
  crescere tutte le famiglie dell'utente; le bozze citate fanno crescere le famiglie che
  le citano; le bozze non toccano il ricettario (sezioni 1 e 15).
- Idempotenza con identificativi del client sulle righe create, nessuna tabella
  generica (sezione 1).
- Proiezioni come nell'interfaccia di W3; nome e descrizione anche per le ricette in
  bozza; `variety_key` con `varietyKey` di W4; identità d'origine; `books.slug`
  (sezioni 2, 6 e 8).
- Colonne immutabili per gli utenti tranne quelle previste dalle operazioni; annullamento
  solo sullo stesso slot (sezioni 2 e 5).
- `families.measurement_system` in colonna; impostazioni salvate solo se cambiate,
  default dal dominio (sezione 2).
- Equivalenze: al massimo una per ingrediente, ambito, dimensione dell'unità di partenza
  e preparazione (o nessuna); `ingredient_versions.content` comprende le equivalenze
  (sezioni 2, 6 e 8).
- `channel` (`web`/`mcp`/`import`) su registro dei pasti, versioni, stati e salvataggi
  delle bozze (sezione 2, tracciamento).
- Chiavi esterne: autori `on delete set null` («ex membro»), dati personali e
  appartenenze `on delete cascade`, dati di famiglia con la famiglia, pasti che
  impediscono di cancellare una ricetta citata, nessuna cascata sullo storico (sezioni 2
  e 7).
- Funzioni SQL `meal_passed_at` e `recipe_version_at` per la R1 (sezione 5).
- Revoca immediata: `app.session_is_active()` a ogni richiesta; appartenenze e ruoli
  letti a ogni query (sezioni 1 e 17).
- Nomi degli autori del ricettario leggibili dai curatori con
  `app.catalogue_author_names()` (solo id e nome), senza aprire i profili (sezioni 2 e 8).
- Bozze chiuse immutabili tranne l'azzeramento degli autori cancellati (sezioni 2 e 8).
- Le ricette in bozza arrivano ai pasti solo dall'import; gli utenti non le collegano
  (sezioni 2, 5 e 8).
- Ambiente locale: CLI di Supabase su Podman, test pgTAP isolati dal seed (sezione 9).
- Tabelle dell'ondata 3 rimandate (sezione 15).
