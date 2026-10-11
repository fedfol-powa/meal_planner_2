# Schema e permessi (W2): piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** lo schema del traguardo A in `supabase/migrations/`, con RLS, ruoli del server e del job, contatori di versione, test pgTAP con più utenti, dati locali e script dei primi utenti.

**Architecture:** tutto nello schema privato `app`, non esposto dalla Data API. Il server si collega come `app_server` e in ogni transazione assume `authenticated` (con i claim dell'utente), `app_job` o `anon`. L'RLS garantisce isolamento fra famiglie e confine dei ruoli globali; le regole dei flussi restano nel server. I contatori crescono con trigger, una volta per transazione.

**Tech Stack:** Postgres 17 di Supabase, CLI di Supabase 2.120.0 su Podman 5.7.1, pgTAP con `supabase test db`. Nessuna dipendenza npm.

**Spec:** `progetto/superpowers/specs/2026-10-11-schema-e-permessi.md` (leggila prima di iniziare), subordinata a `progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`.

## Global Constraints

- Codice, identificatori, commenti e test in inglese; documenti (README, commit) in italiano.
- Tutte le tabelle e funzioni nello schema `app`; nessun oggetto in `public`.
- Ogni tabella di `app` ha RLS attiva; ogni `grant` è esplicito; `execute` revocato a `public` sulle funzioni di `app`.
- Funzioni SECURITY DEFINER sempre con `set search_path = ''` e nomi qualificati (`app.`, `auth.`, `pg_catalog.`).
- Nelle policy le funzioni di aiuto si chiamano dentro `(select …)` quando non dipendono dalla riga.
- Testi localizzati in jsonb con le sole chiavi `it-IT` e `en-GB`.
- Reparti: `produce`, `butcher`, `fish`, `chilled`, `bakery`, `pasta_grains`, `tinned`, `frozen`, `condiments`, `other`.
- Canale: `web`, `mcp`, `import`.
- Nessuna modifica al progetto Supabase remoto: niente `supabase link`, `db push`, esecuzioni sul remoto.
- Nessuna dipendenza nuova.
- Commit piccoli in italiano, che terminano con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- Persona in due famiglie (Anna): vede entrambe, ma ogni scrittura resta confinata alla famiglia giusta (Task 4 e 5).
- Lista della spesa che punta alla settimana di un'altra famiglia: deve essere rifiutata, non solo nascosta (Task 6).
- Pasto passato nei giorni del cambio dell'ora legale: l'istante deve restare 15:30 o 23:00 locali (Task 5).
- Ricetta in bozza citata da un pasto: visibile solo ai membri di quella famiglia e ai curatori, non alle altre famiglie (Task 5).
- Cancellazione di un utente che ha scritto il registro dei pasti o pubblicato versioni: le righe restano con autore nullo (Task 5 e 3).

---

## Ambiente e comandi

Prerequisiti (già pronti sul Mac dell'utente dall'11 ottobre 2026):

```bash
export PATH=/opt/podman/bin:$HOME/.local/bin:$PATH
podman machine start            # se la VM è ferma; "already running" va bene
```

Comandi usati in ogni compito, dalla radice del worktree:

```bash
supabase db start               # avvia il Postgres locale (una volta)
supabase db reset               # riapplica tutte le migrazioni e seed.sql
supabase test db                # esegue tutti i test in supabase/tests
```

Il container si chiama `supabase_db_meal_planner_2`; per una query a mano:
`podman exec -i supabase_db_meal_planner_2 psql -U postgres`.

## File

```
supabase/
├── config.toml                                    Task 1
├── README.md                                      Task 1, completato nel Task 9
├── migrations/
│   ├── 20261011100000_foundation.sql              Task 1
│   ├── 20261011100100_identity.sql                Task 2
│   ├── 20261011100200_catalogue.sql               Task 3
│   ├── 20261011100300_families.sql                Task 4
│   ├── 20261011100400_meals.sql                   Task 5
│   ├── 20261011100500_shopping.sql                Task 6
│   ├── 20261011100600_jobs.sql                    Task 7
│   ├── 20261011100700_versions.sql                Task 8
│   └── 20261011100800_cron.sql                    Task 9
├── seed.sql                                       Task 9
├── scripts/bootstrap.sql                          Task 9
└── tests/
    ├── helpers/setup.psql                         Task 1
    ├── helpers/fixtures.psql                      Task 2, esteso nei Task 3-6
    ├── foundation_test.sql                        Task 1
    ├── identity_test.sql                          Task 2
    ├── catalogue_test.sql                         Task 3
    ├── families_test.sql                          Task 4
    ├── meals_test.sql                             Task 5
    ├── shopping_test.sql                          Task 6
    ├── jobs_test.sql                              Task 7
    ├── versions_test.sql                          Task 8
    └── coverage_test.sql                          Task 9
```

I file in `tests/helpers/` hanno estensione `.psql`, così `pg_prove` non li esegue
come test; ogni test li include con `\ir` dentro la propria transazione, che alla fine
si annulla (verificato l'11 ottobre 2026).

Schema di ogni file di test:

```sql
begin;
\ir helpers/setup.psql
\ir helpers/fixtures.psql
select no_plan();

-- assertions

select * from finish();
rollback;
```

Regole per i test: prima di cambiare identità si scrive sempre `reset role;` (torna a
`postgres`, che è proprietario delle tabelle e quindi non filtrato dall'RLS); poi
`select tests.login('nome');` oppure `select tests.become('app_job');`. Le scritture
bloccate dall'RLS in `update`/`delete` non danno errore: si controllano con
`tests.affected(sql)`, che restituisce il numero di righe toccate.

---

### Task 1: Ambiente, fondamenta e funzioni di aiuto dei test

**Files:**
- Create: `supabase/config.toml` (con `supabase init`), `supabase/README.md`
- Create: `supabase/migrations/20261011100000_foundation.sql`
- Create: `supabase/tests/helpers/setup.psql`, `supabase/tests/helpers/fixtures.psql` (vuoto con un commento)
- Test: `supabase/tests/foundation_test.sql`

**Interfaces:**
- Produces: schema `app`; ruoli `app_server` (LOGIN NOINHERIT, membro di `authenticated`, `anon`, `app_job`) e `app_job` (NOLOGIN); `app.is_localized_text(jsonb) returns boolean`, `app.is_localized_list(jsonb) returns boolean`; funzioni dei test `tests.create_user(name text, locale text default 'it-IT') returns uuid`, `tests.uid(name text) returns uuid`, `tests.login(name text, session_id uuid default null)`, `tests.login_with_claims(claims jsonb)`, `tests.become(role text)`, `tests.affected(sql text) returns bigint`, `tests.create_session(name text, not_after timestamptz default null) returns uuid`, `tests.family(name text) returns uuid`, `tests.recipe(slug text) returns uuid`, `tests.ingredient(slug text) returns uuid`, `tests.week(family text) returns uuid`, `tests.shopping_list(family text) returns uuid`, `tests.family_version(name text) returns bigint`, `tests.catalogue_version() returns bigint`, `tests.new_transaction()`.

- [ ] **Step 1: Inizializza la CLI**

```bash
export PATH=/opt/podman/bin:$HOME/.local/bin:$PATH
supabase init
```

In `supabase/config.toml` imposta `project_id = "meal_planner_2"` (la CLI propone il nome
della cartella, qui `schema`). Lascia `[api] schemas = ["public", "graphql_public"]`:
lo schema `app` non va esposto. Verifica `[db] major_version = 17`.

- [ ] **Step 2: Scrivi le funzioni di aiuto dei test**

`supabase/tests/helpers/setup.psql`:

```sql
-- Test helpers, created inside each test transaction and rolled back with it.
set local check_function_bodies = off;

create schema tests;
grant usage on schema tests to authenticated, anon, app_job;

create function tests.create_user(p_name text, p_locale text default 'it-IT')
returns uuid language sql security definer set search_path = '' as $$
	insert into auth.users (id, email, aud, role, raw_user_meta_data)
	values (
		gen_random_uuid(), p_name || '@test.local', 'authenticated', 'authenticated',
		jsonb_build_object('display_name', initcap(p_name), 'locale', p_locale)
	)
	returning id;
$$;

create function tests.uid(p_name text)
returns uuid language sql stable security definer set search_path = '' as $$
	select id from auth.users where email = p_name || '@test.local';
$$;

create function tests.create_session(p_name text, p_not_after timestamptz default null)
returns uuid language sql security definer set search_path = '' as $$
	insert into auth.sessions (id, user_id, not_after)
	values (gen_random_uuid(), tests.uid(p_name), p_not_after)
	returning id;
$$;

create function tests.login_with_claims(p_claims jsonb)
returns void language plpgsql as $$
begin
	perform set_config('request.jwt.claims', p_claims::text, true);
	perform set_config('role', 'authenticated', true);
end;
$$;

create function tests.login(p_name text, p_session_id uuid default null)
returns void language plpgsql as $$
begin
	perform tests.login_with_claims(jsonb_build_object(
		'sub', tests.uid(p_name), 'role', 'authenticated', 'session_id', p_session_id
	));
end;
$$;

create function tests.become(p_role text)
returns void language plpgsql as $$
begin
	perform set_config('request.jwt.claims', '{}', true);
	perform set_config('role', p_role, true);
end;
$$;

-- Rows touched by an update or delete, as the current role (RLS applies).
create function tests.affected(p_sql text)
returns bigint language plpgsql as $$
declare
	v_count bigint;
begin
	execute p_sql;
	get diagnostics v_count = row_count;
	return v_count;
end;
$$;

create function tests.family(p_name text)
returns uuid language sql stable security definer set search_path = '' as $$
	select id from app.families where name = p_name;
$$;

create function tests.recipe(p_slug text)
returns uuid language sql stable security definer set search_path = '' as $$
	select id from app.recipes where slug = p_slug;
$$;

create function tests.ingredient(p_slug text)
returns uuid language sql stable security definer set search_path = '' as $$
	select id from app.ingredients where slug = p_slug;
$$;

-- Week of 12 October 2026 and its shopping list, read as owner.
create function tests.week(p_family text)
returns uuid language sql stable security definer set search_path = '' as $$
	select w.id from app.weeks w join app.families f on f.id = w.family_id
	where f.name = p_family and w.starts_on = '2026-10-12';
$$;

create function tests.shopping_list(p_family text)
returns uuid language sql stable security definer set search_path = '' as $$
	select l.id from app.shopping_lists l join app.families f on f.id = l.family_id where f.name = p_family;
$$;

create function tests.family_version(p_name text)
returns bigint language sql stable security definer set search_path = '' as $$
	select data_version from app.families where name = p_name;
$$;

create function tests.catalogue_version()
returns bigint language sql stable security definer set search_path = '' as $$
	select version from app.catalogue_state;
$$;

-- The whole test runs in one transaction: forget which counters it already bumped.
create function tests.new_transaction()
returns void language sql security definer set search_path = '' as $$
	update app.families set data_version_xid = null;
	update app.catalogue_state set version_xid = null;
$$;

grant execute on all functions in schema tests to authenticated, anon, app_job;
```

`supabase/tests/helpers/fixtures.psql`:

```sql
-- Shared test data, extended task by task. Runs as postgres, before any login.
```

- [ ] **Step 3: Scrivi il test che fallisce**

`supabase/tests/foundation_test.sql`:

```sql
begin;
\ir helpers/setup.psql
\ir helpers/fixtures.psql
select no_plan();

select has_schema('app');
select ok(not has_schema_privilege('public', 'app', 'USAGE'), 'PUBLIC has no usage on app');
select ok(has_schema_privilege('authenticated', 'app', 'USAGE'), 'authenticated uses app');
select ok(has_schema_privilege('anon', 'app', 'USAGE'), 'anon uses app');
select ok(has_schema_privilege('app_job', 'app', 'USAGE'), 'app_job uses app');

select ok(pg_has_role('app_server', 'authenticated', 'SET'), 'app_server can become authenticated');
select ok(pg_has_role('app_server', 'anon', 'SET'), 'app_server can become anon');
select ok(pg_has_role('app_server', 'app_job', 'SET'), 'app_server can become app_job');
select ok(not pg_has_role('app_server', 'authenticated', 'USAGE'), 'app_server does not inherit authenticated');
select ok((select rolcanlogin from pg_roles where rolname = 'app_server'), 'app_server can log in');
select ok(not (select rolcanlogin from pg_roles where rolname = 'app_job'), 'app_job cannot log in');

select ok(app.is_localized_text('{"it-IT": "Pomodori", "en-GB": "Tomatoes"}'), 'both locales');
select ok(app.is_localized_text('{"it-IT": "Pomodori", "en-GB": null}'), 'missing translation is the domain''s business');
select ok(app.is_localized_text(null), 'null is allowed');
select ok(not app.is_localized_text('{"fr-FR": "Tomates"}'), 'unknown locale');
select ok(not app.is_localized_text('"Pomodori"'), 'not an object');
select ok(not app.is_localized_text('{"it-IT": 3}'), 'not a string');

select ok(app.is_localized_list('{"it-IT": ["pomodoro"], "en-GB": []}'), 'lists of strings');
select ok(not app.is_localized_list('{"it-IT": [1]}'), 'list of numbers');
select ok(not app.is_localized_list('{"it-IT": "pomodoro"}'), 'not a list');
select ok(not app.is_localized_list('[]'), 'not an object');

select ok(not has_function_privilege('public', 'app.is_localized_text(jsonb)', 'EXECUTE'), 'PUBLIC cannot execute app functions');

select * from finish();
rollback;
```

- [ ] **Step 4: Esegui il test e verifica che fallisca**

```bash
supabase db start && supabase db reset && supabase test db
```

Atteso: `foundation_test.sql` fallisce (`schema app does not exist` o test non superati).

- [ ] **Step 5: Scrivi la migrazione**

`supabase/migrations/20261011100000_foundation.sql`:

```sql
-- Foundation: private schema, roles of the server and of the weekly job.
-- The app schema is not exposed by the Data API: the server reaches it directly.

create schema app;
revoke all on schema app from public;

do $$
begin
	if not exists (select 1 from pg_roles where rolname = 'app_job') then
		create role app_job nologin;
	end if;
	if not exists (select 1 from pg_roles where rolname = 'app_server') then
		-- Password set by hand on each project, never in migrations.
		create role app_server login noinherit;
	end if;
end;
$$;

grant authenticated, anon, app_job to app_server;
grant usage on schema app to authenticated, anon, app_job;

-- Functions get EXECUTE for PUBLIC by default: in app every grant is explicit.
alter default privileges in schema app revoke execute on functions from public;

-- {"it-IT": text, "en-GB": text}; completeness is checked by the domain on publish.
create function app.is_localized_text(value jsonb)
returns boolean language sql immutable set search_path = '' as $$
	select case
		when value is null then true
		when jsonb_typeof(value) <> 'object' then false
		else not exists (
			select 1 from jsonb_each(value) e
			where e.key not in ('it-IT', 'en-GB') or jsonb_typeof(e.value) not in ('string', 'null')
		)
	end;
$$;

-- {"it-IT": [text], "en-GB": [text]}
create function app.is_localized_list(value jsonb)
returns boolean language sql immutable set search_path = '' as $$
	select case
		when value is null then true
		when jsonb_typeof(value) <> 'object' then false
		else not exists (
			select 1 from jsonb_each(value) e
			where e.key not in ('it-IT', 'en-GB')
				or case
					when jsonb_typeof(e.value) <> 'array' then true
					else exists (select 1 from jsonb_array_elements(e.value) x where jsonb_typeof(x) <> 'string')
				end
		)
	end;
$$;

grant execute on function app.is_localized_text(jsonb), app.is_localized_list(jsonb)
	to authenticated, app_job;
```

- [ ] **Step 6: Esegui i test e verifica che passino**

```bash
supabase db reset && supabase test db
```

Atteso: `foundation_test.sql .. ok`, `Result: PASS`.

- [ ] **Step 7: Scrivi il README**

`supabase/README.md`, in italiano: a cosa serve la cartella; prerequisiti (VM Podman,
`PATH`); i comandi della sezione «Ambiente e comandi» di questo piano; la regola che
nessun comando tocca il progetto remoto; lo schema `app` non esposto e perché; i ruoli e
come li usa il server (tabella della spec, sezione «Ruoli Postgres»). Le sezioni su
`seed.sql` e `bootstrap.sql` si aggiungono nel Task 9.

- [ ] **Step 8: Commit**

```bash
git add supabase
git commit -m "Schema: fondamenta, ruoli del server e del job, ambiente di test locale

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Identità, ruoli globali e sessioni

**Files:**
- Create: `supabase/migrations/20261011100100_identity.sql`
- Modify: `supabase/tests/helpers/fixtures.psql`
- Test: `supabase/tests/identity_test.sql`

**Interfaces:**
- Consumes: Task 1.
- Produces: `app.profiles(user_id, display_name, locale, created_at, updated_at)`, `app.user_roles(user_id, role, granted_by, granted_at)`, `app.has_role(text) returns boolean`, `app.session_is_active() returns boolean`; trigger su `auth.users`; persone di prova anna, bruno, carla, dario (curatore), elena (`app_admin`), franco (`en-GB`).

- [ ] **Step 1: Aggiungi le persone di prova**

In fondo a `supabase/tests/helpers/fixtures.psql`:

```sql
-- People: Anna (Rossi admin, Bianchi member), Bruno (Rossi), Carla (Bianchi admin),
-- Dario (curator, no family), Elena (app admin, no family), Franco (Verdi admin).
do $$
begin
	perform tests.create_user('anna');
	perform tests.create_user('bruno');
	perform tests.create_user('carla');
	perform tests.create_user('dario');
	perform tests.create_user('elena');
	perform tests.create_user('franco', 'en-GB');
	insert into app.user_roles (user_id, role) values
		(tests.uid('dario'), 'recipe_curator'),
		(tests.uid('elena'), 'app_admin');
end;
$$;
```

- [ ] **Step 2: Scrivi il test che fallisce**

`supabase/tests/identity_test.sql`:

```sql
begin;
\ir helpers/setup.psql
\ir helpers/fixtures.psql
select no_plan();

-- Profile created by the trigger
select is((select display_name from app.profiles where user_id = tests.uid('dario')), 'Dario', 'name from metadata');
select is((select locale from app.profiles where user_id = tests.uid('franco')), 'en-GB', 'locale from metadata');
insert into auth.users (id, email, aud, role) values (gen_random_uuid(), 'no.meta@test.local', 'authenticated', 'authenticated');
select is((select p.display_name from app.profiles p join auth.users u on u.id = p.user_id where u.email = 'no.meta@test.local'), 'no.meta', 'name from email');
select is((select p.locale from app.profiles p join auth.users u on u.id = p.user_id where u.email = 'no.meta@test.local'), 'it-IT', 'default locale');
insert into auth.users (id, email, aud, role, raw_user_meta_data)
	values (gen_random_uuid(), 'fr@test.local', 'authenticated', 'authenticated', '{"locale": "fr-FR"}');
select is((select p.locale from app.profiles p join auth.users u on u.id = p.user_id where u.email = 'fr@test.local'), 'it-IT', 'unsupported locale falls back');

-- Profiles: people without a family see only themselves
reset role;
select tests.login('dario');
select is((select count(*) from app.profiles), 1::bigint, 'Dario sees only his profile');
select is(tests.affected($$update app.profiles set display_name = 'Dario R.' where user_id = tests.uid('dario')$$), 1::bigint, 'Dario renames himself');
select is(tests.affected($$update app.profiles set display_name = 'Hacked' where user_id = tests.uid('elena')$$), 0::bigint, 'Dario cannot rename Elena');
select throws_ok($$update app.profiles set locale = 'fr-FR' where user_id = tests.uid('dario')$$, '23514', null, 'locale is checked');
select throws_ok($$update app.profiles set user_id = tests.uid('elena') where user_id = tests.uid('dario')$$, '42501', null, 'user_id is not writable');
select throws_ok($$insert into app.profiles (user_id, display_name) values (gen_random_uuid(), 'X')$$, '42501', null, 'profiles are created only by the trigger');

-- Global roles
select is((select count(*) from app.user_roles), 1::bigint, 'Dario sees only his role');
select ok(app.has_role('recipe_curator'), 'Dario is a curator');
select ok(not app.has_role('app_admin'), 'Dario is not an app admin');
select throws_ok($$insert into app.user_roles (user_id, role) values (tests.uid('dario'), 'app_admin')$$, '42501', null, 'roles are not self-assigned');
reset role;
select tests.login('elena');
select is((select role from app.user_roles), 'app_admin', 'Elena sees only her role');
select ok(not app.has_role('recipe_curator'), 'app admin is not a curator');

-- Sessions (immediate revocation)
reset role;
select tests.login('dario', tests.create_session('dario'));
select ok(app.session_is_active(), 'active session');
reset role;
select tests.login('dario', tests.create_session('elena'));
select ok(not app.session_is_active(), 'session of another user');
reset role;
select tests.login('dario', tests.create_session('dario', now() - interval '1 minute'));
select ok(not app.session_is_active(), 'expired session');
reset role;
select tests.login('dario', gen_random_uuid());
select ok(not app.session_is_active(), 'unknown session');
reset role;
select tests.login('dario');
select ok(not app.session_is_active(), 'no session_id claim');
reset role;
select tests.login_with_claims(jsonb_build_object('sub', tests.uid('dario'), 'role', 'authenticated', 'session_id', 'abc'));
select ok(not app.session_is_active(), 'malformed session_id');

-- Deleting a user removes profile and roles
reset role;
delete from auth.users where id = tests.uid('dario');
select is((select count(*) from app.profiles where display_name like 'Dario%'), 0::bigint, 'profile deleted with the user');
select is((select count(*) from app.user_roles where role = 'recipe_curator'), 0::bigint, 'roles deleted with the user');

select * from finish();
rollback;
```

- [ ] **Step 3: Esegui e verifica che fallisca**

Run: `supabase db reset && supabase test db`
Atteso: FAIL, `relation "app.user_roles" does not exist` già nelle fixture.

- [ ] **Step 4: Scrivi la migrazione**

`supabase/migrations/20261011100100_identity.sql`:

```sql
-- Identity: profiles, global roles, session check for immediate revocation.

create table app.profiles (
	user_id uuid primary key references auth.users (id) on delete cascade,
	display_name text not null check (btrim(display_name) <> ''),
	locale text not null default 'it-IT' check (locale in ('it-IT', 'en-GB')),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create table app.user_roles (
	user_id uuid not null references auth.users (id) on delete cascade,
	role text not null check (role in ('recipe_curator', 'app_admin')),
	granted_by uuid references auth.users (id) on delete set null,
	granted_at timestamptz not null default now(),
	primary key (user_id, role)
);

alter table app.profiles enable row level security;
alter table app.user_roles enable row level security;

-- New auth user → profile. Name and locale from the metadata, if any.
create function app.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
	insert into app.profiles (user_id, display_name, locale)
	values (
		new.id,
		coalesce(
			nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
			nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
			'User'
		),
		case
			when new.raw_user_meta_data ->> 'locale' in ('it-IT', 'en-GB') then new.raw_user_meta_data ->> 'locale'
			else 'it-IT'
		end
	)
	on conflict (user_id) do nothing;
	return new;
end;
$$;

create trigger create_profile_after_insert
	after insert on auth.users
	for each row execute function app.create_profile_for_new_user();

create function app.has_role(p_role text)
returns boolean language sql stable security definer set search_path = '' as $$
	select exists (
		select 1 from app.user_roles
		where user_id = (select auth.uid()) and role = p_role
	);
$$;

-- The token's session still exists and has not expired: a JWT of a closed session
-- (sign out, deleted account, revoked agent) is refused by the server.
create function app.session_is_active()
returns boolean language sql stable security definer set search_path = '' as $$
	select case
		when coalesce(auth.jwt() ->> 'session_id', '') !~ '^[0-9a-fA-F-]{36}$' then false
		else exists (
			select 1 from auth.sessions s
			where s.id = (auth.jwt() ->> 'session_id')::uuid
				and s.user_id = auth.uid()
				and (s.not_after is null or s.not_after > now())
		)
	end;
$$;

grant select on app.profiles to authenticated;
grant update (display_name, locale, updated_at) on app.profiles to authenticated;
grant select on app.user_roles to authenticated;
grant execute on function app.has_role(text), app.session_is_active() to authenticated;

-- Replaced in the families migration: co-members see each other.
create policy profiles_select_own on app.profiles
	for select to authenticated using (user_id = (select auth.uid()));
create policy profiles_update_own on app.profiles
	for update to authenticated
	using (user_id = (select auth.uid()))
	with check (user_id = (select auth.uid()));

create policy user_roles_select_own on app.user_roles
	for select to authenticated using (user_id = (select auth.uid()));
```

- [ ] **Step 5: Esegui e verifica che passino**

Run: `supabase db reset && supabase test db`
Atteso: PASS per `foundation_test.sql` e `identity_test.sql`. Se l'inserimento in
`auth.sessions` fallisce per una colonna obbligatoria, aggiungila in
`tests.create_session` con un valore neutro e annotalo nel commit.

- [ ] **Step 6: Commit**

```bash
git add supabase
git commit -m "Schema: profili, ruoli globali e verifica della sessione

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Catalogo

**Files:**
- Create: `supabase/migrations/20261011100200_catalogue.sql`
- Modify: `supabase/tests/helpers/fixtures.psql`
- Test: `supabase/tests/catalogue_test.sql`

**Interfaces:**
- Consumes: `app.has_role`, `app.is_localized_text`, `app.is_localized_list`.
- Produces: `app.books`, `app.ingredients`, `app.ingredient_versions`, `app.ingredient_unit_equivalences`, `app.recipes`, `app.recipe_ingredients`, `app.recipe_drafts`, `app.recipe_draft_saves`, `app.recipe_versions`, `app.recipe_status_changes` con le colonne della spec, allineate all'«Interfaccia per W2» di W3 (`progetto/superpowers/specs/2026-10-11-ricetta-import.md`); ricette di prova `pasta-al-pomodoro` (pubblicata, versione 2), `old-minestrone` (archiviata), `new-draft` (bozza); ingredienti `pasta`, `tomatoes`, `salt`.

- [ ] **Step 1: Aggiungi il catalogo di prova**

In fondo a `fixtures.psql`:

```sql
-- Catalogue: one published recipe with two versions, one archived, one new draft.
do $$
declare
	v_book uuid;
	v_pasta uuid;
	v_tomatoes uuid;
	v_salt uuid;
	v_recipe uuid;
	v_draft_recipe uuid;
	v_draft uuid;
begin
	insert into app.books (slug, title) values ('il-cucchiaio-d-argento', 'Il cucchiaio d''argento') returning id into v_book;
	insert into app.ingredients (slug, name, department) values
		('pasta', '{"it-IT": "Pasta", "en-GB": "Pasta"}', 'pasta_grains') returning id into v_pasta;
	insert into app.ingredients (slug, name, synonyms, department) values
		('tomatoes', '{"it-IT": "Pomodori", "en-GB": "Tomatoes"}', '{"it-IT": ["pomodoro"], "en-GB": ["tomato"]}', 'produce')
		returning id into v_tomatoes;
	insert into app.ingredients (slug, name, department, is_pantry) values
		('salt', '{"it-IT": "Sale", "en-GB": "Salt"}', 'condiments', true) returning id into v_salt;

	insert into app.recipes (
		slug, status, version, name, description, source_type, duration_minutes, base_servings,
		protein_group, is_fresh_fish, carbohydrate_group, has_vegetables, category, meal_type, is_heavy
	) values (
		'pasta-al-pomodoro', 'published', 2,
		'{"it-IT": "Pasta al pomodoro", "en-GB": "Tomato pasta"}',
		'{"it-IT": "Classica", "en-GB": "A classic"}',
		'home', 20, 2, 'vegetarian', false, 'pasta', true, 'pan', 'both', false
	) returning id into v_recipe;
	insert into app.recipe_ingredients (recipe_id, position, ingredient_id, quantity_kind, quantity, unit, source_text, is_primary) values
		(v_recipe, 0, v_pasta, 'amount', 200, 'g', 'Pasta: 200 g', true),
		(v_recipe, 1, v_tomatoes, 'amount', 400, 'g', 'Pomodori: 400 g', false),
		(v_recipe, 2, v_salt, 'to_taste', null, null, 'Sale: q.b.', false);
	insert into app.recipe_versions (recipe_id, version, content, published_by, published_at, channel) values
		(v_recipe, 1, '{}', tests.uid('dario'), '2026-10-01 10:00+02', 'import'),
		(v_recipe, 2, '{}', tests.uid('dario'), '2026-10-10 10:00+02', 'mcp');

	insert into app.recipes (
		slug, status, version, name, description, source_type, book_id, book_pages, duration_minutes, base_servings,
		protein_group, is_fresh_fish, carbohydrate_group, has_vegetables, category, meal_type, is_heavy, archived_at
	) values (
		'old-minestrone', 'archived', 1,
		'{"it-IT": "Minestrone", "en-GB": "Minestrone"}', '{"it-IT": "Di verdure", "en-GB": "Vegetable soup"}',
		'book', v_book, '120', 60, 4, 'legumes', false, 'none', true, 'soup', 'dinner', false, now()
	);

	insert into app.recipes (slug, name) values
		('new-draft', '{"it-IT": "Bozza nuova", "en-GB": null}') returning id into v_draft_recipe;
	insert into app.recipe_drafts (recipe_id, kind, content, revision, created_by, updated_by)
		values (v_draft_recipe, 'new', '{}', 1, tests.uid('dario'), tests.uid('dario')) returning id into v_draft;
	insert into app.recipe_draft_saves (draft_id, revision, content, saved_by, channel)
		values (v_draft, 1, '{}', tests.uid('dario'), 'mcp');
	insert into app.recipe_status_changes (recipe_id, status, changed_by, channel)
		values (v_recipe, 'published', tests.uid('dario'), 'import');
	insert into app.ingredient_versions (ingredient_id, version, content, changed_by, channel)
		values (v_pasta, 1, '{}', tests.uid('dario'), 'import');
end;
$$;
```

- [ ] **Step 2: Scrivi il test che fallisce**

`supabase/tests/catalogue_test.sql`:

```sql
begin;
\ir helpers/setup.psql
\ir helpers/fixtures.psql
select no_plan();

-- Reading: Elena (app admin, no family, not a curator) sees the published catalogue only
reset role;
select tests.login('elena');
select is((select count(*) from app.recipes), 2::bigint, 'published and archived recipes, no drafts');
select is((select count(*) from app.recipe_ingredients), 3::bigint, 'recipe ingredients');
select is((select count(*) from app.ingredients), 3::bigint, 'ingredients');
select is((select count(*) from app.books), 1::bigint, 'books');
select is((select count(*) from app.recipe_versions), 2::bigint, 'published versions');
select is((select count(*) from app.recipe_drafts), 0::bigint, 'no drafts');
select is((select count(*) from app.recipe_draft_saves), 0::bigint, 'no draft saves');
select is((select count(*) from app.recipe_status_changes), 0::bigint, 'no status history');
select is((select count(*) from app.ingredient_versions), 0::bigint, 'no ingredient history');

-- Writing: refused to non-curators
select throws_ok($$insert into app.recipes (slug) values ('sneaky')$$, '42501', null, 'non-curator cannot create recipes');
select is(tests.affected($$update app.recipes set slug = 'renamed' where slug = 'pasta-al-pomodoro'$$), 0::bigint, 'non-curator cannot edit recipes');
select is(tests.affected($$delete from app.recipe_ingredients$$), 0::bigint, 'non-curator cannot delete projections');
select throws_ok($$insert into app.ingredients (slug, name, department) values ('x', '{}', 'other')$$, '42501', null, 'non-curator cannot create ingredients');
select throws_ok($$insert into app.recipe_versions (recipe_id, version, content, channel) values (tests.recipe('pasta-al-pomodoro'), 3, '{}', 'web')$$, '42501', null, 'non-curator cannot publish');

-- Curator
reset role;
select tests.login('dario');
select is((select count(*) from app.recipes), 3::bigint, 'curator sees drafts');
select is((select count(*) from app.recipe_drafts), 1::bigint, 'curator sees draft');
select is((select count(*) from app.recipe_draft_saves), 1::bigint, 'curator sees draft history');
select lives_ok($$insert into app.recipes (slug, name) values ('another-draft', '{"it-IT": "Altra"}')$$, 'curator creates a draft recipe');
select is(tests.affected($$update app.recipes set tags = '{quick}' where slug = 'pasta-al-pomodoro'$$), 1::bigint, 'curator edits any recipe');
select is(tests.affected($$delete from app.recipes where slug = 'pasta-al-pomodoro'$$), 0::bigint, 'published recipes are never deleted');
select is(tests.affected($$delete from app.recipes where slug = 'another-draft'$$), 1::bigint, 'never-published draft can be deleted');
select lives_ok($$insert into app.recipe_versions (recipe_id, version, content, published_by, channel) values (tests.recipe('pasta-al-pomodoro'), 3, '{}', tests.uid('dario'), 'mcp')$$, 'curator publishes');

-- Append-only history
select throws_ok($$update app.recipe_versions set content = '{"x": 1}'$$, '42501', null, 'versions are immutable');
select throws_ok($$delete from app.recipe_versions$$, '42501', null, 'versions are never deleted');
select throws_ok($$update app.recipe_status_changes set status = 'archived'$$, '42501', null, 'status history is immutable');
select throws_ok($$delete from app.ingredient_versions$$, '42501', null, 'ingredient history is never deleted');
select throws_ok($$update app.recipe_draft_saves set content = '{}'$$, '42501', null, 'draft saves keep their content');
select is(tests.affected($$update app.recipe_draft_saves set overwritten = true$$), 1::bigint, 'a save can be marked as overwritten');
select throws_ok($$delete from app.recipe_draft_saves$$, '42501', null, 'draft saves are never deleted one by one');

-- Integrity, as owner
reset role;
select throws_ok($$insert into app.recipes (slug, status, version, name, description, source_type, duration_minutes, base_servings, carbohydrate_group, is_fresh_fish, has_vegetables, category, meal_type, is_heavy)
	values ('incomplete', 'published', 1, '{"it-IT": "X", "en-GB": "X"}', '{"it-IT": "X", "en-GB": "X"}', 'home', 10, 2, 'none', false, false, 'pan', 'lunch', false)$$,
	'23514', null, 'published recipe needs the planner attributes');
select throws_ok($$insert into app.recipes (slug, status, version) values ('bad-status', 'draft', 1)$$, '23514', null, 'draft means never published');
select throws_ok($$insert into app.recipes (slug, status, version) values ('bad-status-2', 'published', 0)$$, '23514', null, 'published means version > 0');
select throws_ok($$insert into app.recipes (slug, name) values ('fr', '{"fr-FR": "Pâtes"}')$$, '23514', null, 'only it-IT and en-GB');
select throws_ok($$insert into app.recipes (slug, seasons) values ('monsoon', '{monsoon}')$$, '23514', null, 'seasons vocabulary');
select throws_ok($$insert into app.recipes (slug, protein_group) values ('meat', 'meat')$$, '23514', null, 'protein vocabulary');
select throws_ok($$insert into app.recipes (slug) values ('Bad Slug')$$, '23514', null, 'slug format');
select throws_ok($$insert into app.ingredients (slug, name, department) values ('x', '{"it-IT": "X"}', 'garden')$$, '23514', null, 'departments of W4');
select throws_ok($$insert into app.recipe_ingredients (recipe_id, position, ingredient_id, variety_key, quantity_kind, source_text, is_primary) values (tests.recipe('pasta-al-pomodoro'), 9, tests.ingredient('salt'), 'grosso', 'to_taste', 'x', true)$$, '23505', null, 'one primary ingredient');
select throws_ok($$insert into app.recipe_ingredients (recipe_id, position, ingredient_id, quantity_kind, source_text) values (tests.recipe('pasta-al-pomodoro'), 9, tests.ingredient('pasta'), 'to_taste', 'x')$$, '23505', null, 'same ingredient only with another variety');
select lives_ok($$insert into app.recipe_ingredients (recipe_id, position, ingredient_id, variety, variety_key, quantity_kind, quantity, unit, source_text) values (tests.recipe('pasta-al-pomodoro'), 9, tests.ingredient('tomatoes'), '{"it-IT": "Roma", "en-GB": "Roma"}', 'roma', 'amount', 2, 'piece', 'Pomodori Roma: 2')$$, 'same ingredient with a variety');
select throws_ok($$insert into app.recipe_ingredients (recipe_id, position, ingredient_id, variety_key, quantity_kind, source_text) values (tests.recipe('pasta-al-pomodoro'), 10, tests.ingredient('tomatoes'), 'cuore di bue', 'amount', 'x')$$, '23514', null, 'amount needs quantity and unit');
select throws_ok($$insert into app.recipe_ingredients (recipe_id, position, ingredient_id, variety_key, quantity_kind, quantity, unit, source_text) values (tests.recipe('pasta-al-pomodoro'), 10, tests.ingredient('tomatoes'), 'cuore di bue', 'to_taste', 1, 'g', 'x')$$, '23514', null, 'to taste has no quantity');
select throws_ok($$insert into app.recipe_ingredients (recipe_id, position, ingredient_id, variety_key, quantity_kind, quantity_text, source_text) values (tests.recipe('pasta-al-pomodoro'), 10, tests.ingredient('tomatoes'), 'cuore di bue', 'to_taste', '{"it-IT": "un po''"}', 'x')$$, '23514', null, 'quantity text only for text quantities');
select throws_ok($$insert into app.recipe_ingredients (recipe_id, position, ingredient_id, variety_key, quantity_kind, source_text) values (tests.recipe('pasta-al-pomodoro'), 10, tests.ingredient('tomatoes'), 'cuore di bue', 'to_taste', '  ')$$, '23514', null, 'source text required');
select throws_ok($$insert into app.recipes (slug, origin_type) values ('origin', 'casetta')$$, '23514', null, 'origin type vocabulary');
select throws_ok($$insert into app.books (slug, title) values ('il-cucchiaio-d-argento', 'Copia')$$, '23505', null, 'book slug unique');
select throws_ok($$insert into app.ingredient_unit_equivalences (ingredient_id, from_unit, to_unit, factor, scope) values (tests.ingredient('tomatoes'), 'piece', 'g', 0, 'shopping')$$, '23514', null, 'positive factor');
select lives_ok($$insert into app.ingredient_unit_equivalences (ingredient_id, from_unit, to_unit, factor, scope, source) values (tests.ingredient('tomatoes'), 'g', 'piece', 0.008, 'shopping', 'test')$$, 'one equivalence');
select throws_ok($$insert into app.ingredient_unit_equivalences (ingredient_id, from_unit, to_unit, factor, scope) values (tests.ingredient('tomatoes'), 'kg', 'piece', 8, 'shopping')$$, '23505', null, 'one per ingredient, scope and dimension');
select lives_ok($$insert into app.ingredient_unit_equivalences (ingredient_id, from_unit, to_unit, factor, scope) values (tests.ingredient('tomatoes'), 'kg', 'piece', 8, 'recipe')$$, 'another scope is fine');
select throws_ok($$insert into app.ingredient_unit_equivalences (ingredient_id, from_unit, to_unit, factor, scope) values (tests.ingredient('pasta'), 'cup', 'g', 100, 'recipe')$$, '23502', null, 'unknown from unit');
select throws_ok($$insert into app.ingredient_unit_equivalences (ingredient_id, from_unit, to_unit, factor, scope) values (tests.ingredient('pasta'), 'us_cup', 'grams', 100, 'recipe')$$, '23514', null, 'unknown to unit');
select is(app.unit_dimension('uk_pint'), 'volume', 'British pint is a volume');
select is(app.unit_dimension('lb'), 'mass', 'every mass unit is mass');
select is(app.unit_dimension('tbsp'), 'tbsp', 'tbsp is a dimension of its own');
select is(app.unit_dimension('clove'), 'clove', 'each counted unit is a dimension of its own');
select lives_ok($$insert into app.ingredient_unit_equivalences (ingredient_id, from_unit, to_unit, factor, scope) values (tests.ingredient('tomatoes'), 'piece', 'g', 120, 'shopping')$$, 'piece next to a mass equivalence');
select lives_ok($$insert into app.ingredient_unit_equivalences (ingredient_id, from_unit, to_unit, factor, scope) values (tests.ingredient('tomatoes'), 'slice', 'g', 20, 'shopping')$$, 'slice next to piece');
select lives_ok($$insert into app.ingredient_unit_equivalences (ingredient_id, from_unit, to_unit, factor, scope) values (tests.ingredient('tomatoes'), 'tbsp', 'g', 15, 'shopping')$$, 'tbsp on its own');
select lives_ok($$insert into app.ingredient_unit_equivalences (ingredient_id, from_unit, to_unit, factor, scope) values (tests.ingredient('tomatoes'), 'tsp', 'g', 5, 'shopping')$$, 'tsp apart from tbsp');
select throws_ok($$insert into app.recipe_drafts (recipe_id, kind, content, revision) values (tests.recipe('new-draft'), 'revision', '{}', 1)$$, '23505', null, 'one draft per recipe');

-- Deleting an author keeps the catalogue
delete from auth.users where id = tests.uid('dario');
select is((select count(*) from app.recipe_versions where published_by is null), 3::bigint, 'versions kept, author cleared');

select * from finish();
rollback;
```

- [ ] **Step 3: Esegui e verifica che fallisca**

Run: `supabase db reset && supabase test db`
Atteso: FAIL, `relation "app.books" does not exist`.

- [ ] **Step 4: Scrivi la migrazione**

`supabase/migrations/20261011100200_catalogue.sql`:

```sql
-- Catalogue: recipes as documents (drafts, versions) with projections of the current
-- version used to search, plan and shop. Spec sections 2 and 8.

create table app.books (
	id uuid primary key default gen_random_uuid(),
	-- The import recognises books by slug (W3).
	slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	title text not null check (btrim(title) <> ''),
	created_by uuid references auth.users (id) on delete set null,
	created_at timestamptz not null default now()
);

create table app.ingredients (
	id uuid primary key default gen_random_uuid(),
	slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	name jsonb not null check (app.is_localized_text(name)),
	synonyms jsonb not null default '{"it-IT": [], "en-GB": []}' check (app.is_localized_list(synonyms)),
	department text not null check (department in (
		'produce', 'butcher', 'fish', 'chilled', 'bakery', 'pasta_grains', 'tinned', 'frozen', 'condiments', 'other'
	)),
	is_pantry boolean not null default false,
	version integer not null default 1 check (version >= 1),
	created_by uuid references auth.users (id) on delete set null,
	created_at timestamptz not null default now(),
	updated_by uuid references auth.users (id) on delete set null,
	updated_at timestamptz not null default now()
);

-- Append-only: full content of each ingredient version, equivalences included.
create table app.ingredient_versions (
	ingredient_id uuid not null references app.ingredients (id) on delete cascade,
	version integer not null check (version >= 1),
	content jsonb not null check (jsonb_typeof(content) = 'object'),
	changed_by uuid references auth.users (id) on delete set null,
	changed_at timestamptz not null default now(),
	channel text not null check (channel in ('web', 'mcp', 'import')),
	primary key (ingredient_id, version)
);

-- Dimension of a unit code for the equivalence constraint (W4): every mass unit is
-- 'mass', every volume unit is 'volume'; tbsp, tsp, each counted unit and us_cup are
-- each a dimension of their own. Codes as in domain/src/units/codes.ts: a new unit
-- code needs a migration updating this function. Unknown codes give null.
create function app.unit_dimension(p_unit text)
returns text language sql immutable set search_path = '' as $$
	select case
		when p_unit in ('g', 'kg', 'oz', 'lb') then 'mass'
		when p_unit in ('ml', 'l', 'uk_fl_oz', 'uk_pint') then 'volume'
		when p_unit in ('tbsp', 'tsp', 'piece', 'clove', 'slice', 'pinch', 'sprig', 'bunch', 'leaf', 'us_cup') then p_unit
	end;
$$;
grant execute on function app.unit_dimension(text) to authenticated, app_job;

create table app.ingredient_unit_equivalences (
	id uuid primary key default gen_random_uuid(),
	ingredient_id uuid not null references app.ingredients (id) on delete cascade,
	from_unit text not null,
	to_unit text not null check (app.unit_dimension(to_unit) is not null),
	from_dimension text not null generated always as (app.unit_dimension(from_unit)) stored,
	factor numeric not null check (factor > 0),
	scope text not null check (scope in ('recipe', 'shopping')),
	source text,
	-- At most one equivalence per ingredient, scope and dimension (W4 review).
	unique (ingredient_id, scope, from_dimension)
);

create table app.recipes (
	id uuid primary key default gen_random_uuid(),
	slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	-- Identity in the origin project (W3): the import recognises its recipes by
	-- origin_slug only; origin_type is the type as it was there.
	origin_slug text unique,
	origin_type text check (origin_type in ('web', 'youtube', 'libro', 'casa')),
	status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
	version integer not null default 0 check (version >= 0),
	-- Projection of the current RecipeDocument (W3 interface).
	name jsonb check (app.is_localized_text(name)),
	description jsonb check (app.is_localized_text(description)),
	source_type text check (source_type in ('web', 'youtube', 'book', 'home')),
	source_url text,
	book_id uuid references app.books (id),
	book_pages text,
	duration_minutes integer check (duration_minutes > 0),
	base_servings integer check (base_servings > 0),
	protein_group text check (protein_group in (
		'fish', 'white_meat', 'red_meat', 'cured_meat', 'legumes', 'eggs', 'cheese', 'vegetarian'
	)),
	is_fresh_fish boolean,
	carbohydrate_group text check (carbohydrate_group in ('pasta', 'rice', 'potatoes', 'bread', 'cereals', 'none')),
	has_vegetables boolean,
	category text check (category in (
		'wok', 'skottle', 'oven_bake', 'grill', 'pan', 'soup', 'salad', 'savoury_pie', 'wrap_sandwich', 'burger', 'other'
	)),
	meal_type text check (meal_type in ('lunch', 'dinner', 'both')),
	seasons text[] not null default '{}' check (seasons <@ array['spring', 'summer', 'autumn', 'winter']),
	is_heavy boolean,
	tags text[] not null default '{}',
	archived_at timestamptz,
	archived_by uuid references auth.users (id) on delete set null,
	created_by uuid references auth.users (id) on delete set null,
	created_at timestamptz not null default now(),
	updated_by uuid references auth.users (id) on delete set null,
	updated_at timestamptz not null default now(),
	constraint recipes_draft_never_published check ((status = 'draft') = (version = 0)),
	-- Required to publish (user decision of 11 October 2026): all planner attributes
	-- except seasons and the primary ingredient.
	constraint recipes_published_complete check (version = 0 or (
		name is not null and description is not null and source_type is not null
		and duration_minutes is not null and base_servings is not null
		and protein_group is not null and is_fresh_fish is not null
		and carbohydrate_group is not null and has_vegetables is not null
		and category is not null and meal_type is not null and is_heavy is not null
	))
);

-- Projection of the ingredient lines of the current RecipeDocument (W3 interface).
create table app.recipe_ingredients (
	recipe_id uuid not null references app.recipes (id) on delete cascade,
	position smallint not null check (position >= 0),
	ingredient_id uuid not null references app.ingredients (id),
	variety jsonb check (app.is_localized_text(variety)),
	-- varietyKey(variety['it-IT']) of the domain (W4); empty without variety.
	variety_key text not null default '',
	quantity_kind text not null check (quantity_kind in ('amount', 'to_taste', 'text')),
	quantity numeric check (quantity > 0),
	unit text,
	quantity_text jsonb check (app.is_localized_text(quantity_text)),
	source_text text not null check (btrim(source_text) <> '' and char_length(source_text) <= 200),
	preparation jsonb check (app.is_localized_text(preparation)),
	is_optional boolean not null default false,
	is_primary boolean not null default false,
	primary key (recipe_id, position),
	unique (recipe_id, ingredient_id, variety_key),
	check ((quantity_kind = 'amount') = (quantity is not null and unit is not null)),
	check (quantity_text is null or quantity_kind = 'text')
);
create unique index recipe_ingredients_one_primary on app.recipe_ingredients (recipe_id) where is_primary;
create index recipe_ingredients_ingredient on app.recipe_ingredients (ingredient_id);

create table app.recipe_drafts (
	id uuid primary key default gen_random_uuid(),
	recipe_id uuid not null unique references app.recipes (id) on delete cascade,
	kind text not null check (kind in ('new', 'revision')),
	base_version integer,
	content jsonb not null check (jsonb_typeof(content) = 'object'),
	revision integer not null check (revision >= 1),
	created_by uuid references auth.users (id) on delete set null,
	created_at timestamptz not null default now(),
	updated_by uuid references auth.users (id) on delete set null,
	updated_at timestamptz not null default now()
);

-- Append-only history of a draft; an overwritten save stays recoverable.
create table app.recipe_draft_saves (
	draft_id uuid not null references app.recipe_drafts (id) on delete cascade,
	revision integer not null check (revision >= 1),
	content jsonb not null check (jsonb_typeof(content) = 'object'),
	saved_by uuid references auth.users (id) on delete set null,
	saved_at timestamptz not null default now(),
	channel text not null check (channel in ('web', 'mcp', 'import')),
	overwritten boolean not null default false,
	primary key (draft_id, revision)
);

create table app.recipe_versions (
	recipe_id uuid not null references app.recipes (id),
	version integer not null check (version >= 1),
	content jsonb not null check (jsonb_typeof(content) = 'object'),
	published_by uuid references auth.users (id) on delete set null,
	published_at timestamptz not null default now(),
	channel text not null check (channel in ('web', 'mcp', 'import')),
	restored_from integer,
	-- Set when the version comes from a whole-catalogue restore: the instant restored.
	restored_instant timestamptz,
	primary key (recipe_id, version)
);

create table app.recipe_status_changes (
	id uuid primary key default gen_random_uuid(),
	recipe_id uuid not null references app.recipes (id),
	status text not null check (status in ('draft', 'published', 'archived')),
	changed_by uuid references auth.users (id) on delete set null,
	changed_at timestamptz not null default now(),
	channel text not null check (channel in ('web', 'mcp', 'import'))
);
create index recipe_status_changes_recipe on app.recipe_status_changes (recipe_id, changed_at);

alter table app.books enable row level security;
alter table app.ingredients enable row level security;
alter table app.ingredient_versions enable row level security;
alter table app.ingredient_unit_equivalences enable row level security;
alter table app.recipes enable row level security;
alter table app.recipe_ingredients enable row level security;
alter table app.recipe_drafts enable row level security;
alter table app.recipe_draft_saves enable row level security;
alter table app.recipe_versions enable row level security;
alter table app.recipe_status_changes enable row level security;

grant select, insert, update, delete on app.books, app.ingredients, app.ingredient_unit_equivalences,
	app.recipes, app.recipe_ingredients, app.recipe_drafts to authenticated;
grant select, insert on app.recipe_versions, app.recipe_status_changes, app.ingredient_versions,
	app.recipe_draft_saves to authenticated;
grant update (overwritten) on app.recipe_draft_saves to authenticated;

-- Everyone signed in reads the published catalogue.
create policy books_read on app.books for select to authenticated using (true);
create policy ingredients_read on app.ingredients for select to authenticated using (true);
create policy equivalences_read on app.ingredient_unit_equivalences for select to authenticated using (true);
create policy recipe_ingredients_read on app.recipe_ingredients for select to authenticated using (true);
create policy recipe_versions_read on app.recipe_versions for select to authenticated using (true);
create policy recipes_read on app.recipes for select to authenticated
	using (status <> 'draft' or (select app.has_role('recipe_curator')));

-- Curators write the whole catalogue.
create policy books_curate on app.books for all to authenticated
	using ((select app.has_role('recipe_curator'))) with check ((select app.has_role('recipe_curator')));
create policy ingredients_curate on app.ingredients for all to authenticated
	using ((select app.has_role('recipe_curator'))) with check ((select app.has_role('recipe_curator')));
create policy equivalences_curate on app.ingredient_unit_equivalences for all to authenticated
	using ((select app.has_role('recipe_curator'))) with check ((select app.has_role('recipe_curator')));
create policy recipe_ingredients_curate on app.recipe_ingredients for all to authenticated
	using ((select app.has_role('recipe_curator'))) with check ((select app.has_role('recipe_curator')));
create policy recipe_drafts_curate on app.recipe_drafts for all to authenticated
	using ((select app.has_role('recipe_curator'))) with check ((select app.has_role('recipe_curator')));
create policy recipes_insert on app.recipes for insert to authenticated
	with check ((select app.has_role('recipe_curator')));
create policy recipes_update on app.recipes for update to authenticated
	using ((select app.has_role('recipe_curator'))) with check ((select app.has_role('recipe_curator')));
-- Only a never-published draft can be deleted; meal_slots block it if a meal cites it.
create policy recipes_delete on app.recipes for delete to authenticated
	using (status = 'draft' and (select app.has_role('recipe_curator')));

-- History: curators read and append.
create policy recipe_versions_insert on app.recipe_versions for insert to authenticated
	with check ((select app.has_role('recipe_curator')));
create policy recipe_status_changes_curate on app.recipe_status_changes for all to authenticated
	using ((select app.has_role('recipe_curator'))) with check ((select app.has_role('recipe_curator')));
create policy ingredient_versions_curate on app.ingredient_versions for all to authenticated
	using ((select app.has_role('recipe_curator'))) with check ((select app.has_role('recipe_curator')));
create policy recipe_draft_saves_curate on app.recipe_draft_saves for all to authenticated
	using ((select app.has_role('recipe_curator'))) with check ((select app.has_role('recipe_curator')));
```

Le policy `for all` sulle tabelle di storico non concedono `update` o `delete`: lo
impediscono i `grant`, che le escludono (salvo `overwritten`).

- [ ] **Step 5: Esegui e verifica che passino**

Run: `supabase db reset && supabase test db`
Atteso: PASS per tutti i file.

- [ ] **Step 6: Commit**

```bash
git add supabase
git commit -m "Schema: catalogo con proiezioni, bozze, versioni e storico

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Famiglie

**Files:**
- Create: `supabase/migrations/20261011100300_families.sql`
- Modify: `supabase/tests/helpers/fixtures.psql`
- Test: `supabase/tests/families_test.sql`

**Interfaces:**
- Consumes: Task 2 e 3.
- Produces: `app.families(id, name, settings, measurement_system, time_zone, data_version, data_version_xid, created_at)`, `app.family_members(family_id, user_id, role, joined_at)`, `app.family_books`, `app.family_ingredients`, `app.recipe_exclusions`; `app.is_member(uuid)`, `app.is_family_admin(uuid)`, `app.shares_family(uuid)` (tutte `returns boolean`); famiglie di prova Rossi (Anna admin, Bruno), Bianchi (Carla admin, Anna), Verdi (Franco admin).

- [ ] **Step 1: Aggiungi le famiglie di prova**

In fondo a `fixtures.psql`:

```sql
-- Families: Rossi (Anna admin, Bruno), Bianchi (Carla admin, Anna), Verdi (Franco admin).
do $$
declare
	v_rossi uuid;
	v_bianchi uuid;
	v_verdi uuid;
begin
	insert into app.families (name) values ('Rossi') returning id into v_rossi;
	insert into app.families (name, measurement_system, time_zone) values ('Bianchi', 'uk_imperial', 'Europe/London')
		returning id into v_bianchi;
	insert into app.families (name) values ('Verdi') returning id into v_verdi;
	insert into app.family_members (family_id, user_id, role) values
		(v_rossi, tests.uid('anna'), 'family_admin'),
		(v_rossi, tests.uid('bruno'), 'member'),
		(v_bianchi, tests.uid('carla'), 'family_admin'),
		(v_bianchi, tests.uid('anna'), 'member'),
		(v_verdi, tests.uid('franco'), 'family_admin');
	insert into app.family_books (family_id, book_id) select v_rossi, id from app.books;
	insert into app.family_ingredients (family_id, ingredient_id, restriction)
		values (v_rossi, tests.ingredient('tomatoes'), 'avoid');
	insert into app.recipe_exclusions (family_id, recipe_id, created_by)
		values (v_verdi, tests.recipe('old-minestrone'), tests.uid('franco'));
end;
$$;
```

- [ ] **Step 2: Scrivi il test che fallisce**

`supabase/tests/families_test.sql`:

```sql
begin;
\ir helpers/setup.psql
\ir helpers/fixtures.psql
select no_plan();

-- Visibility
reset role;
select tests.login('bruno');
select is((select array_agg(name order by name) from app.families), array['Rossi'], 'Bruno sees Rossi only');
select is((select count(*) from app.family_members), 2::bigint, 'Bruno sees the Rossi members');
select is((select count(*) from app.profiles), 2::bigint, 'Bruno sees himself and Anna');
select is((select count(*) from app.family_books), 1::bigint, 'Rossi books');
select is((select count(*) from app.family_ingredients), 1::bigint, 'Rossi avoided ingredients');
select is((select count(*) from app.recipe_exclusions), 0::bigint, 'Verdi exclusions are hidden');
reset role;
select tests.login('anna');
select is((select array_agg(name order by name) from app.families), array['Bianchi', 'Rossi'], 'Anna sees both her families');
select is((select count(*) from app.family_members), 4::bigint, 'Anna sees members of both');
select is((select count(*) from app.profiles), 3::bigint, 'Anna sees Bruno and Carla');
reset role;
select tests.login('elena');
select is((select count(*) from app.families), 0::bigint, 'app admin sees no family');
select is((select count(*) from app.family_members), 0::bigint, 'app admin sees no members');
reset role;
select tests.login('dario');
select is((select count(*) from app.families), 0::bigint, 'curator sees no family');

-- Settings: family admins only, and only their own family
reset role;
select tests.login('bruno');
select is(tests.affected($$update app.families set settings = '{"x": 1}'$$), 0::bigint, 'member cannot change settings');
select throws_ok($$insert into app.families (name) values ('Nuova')$$, '42501', null, 'families are created by the bootstrap script for now');
reset role;
select tests.login('anna');
select is(tests.affected($$update app.families set settings = '{"x": 1}' where name = 'Rossi'$$), 1::bigint, 'admin changes settings');
select is(tests.affected($$update app.families set settings = '{"x": 1}' where name = 'Bianchi'$$), 0::bigint, 'Anna is only a member of Bianchi');
select throws_ok($$update app.families set data_version = 99$$, '42501', null, 'counter is not writable');
select throws_ok($$update app.families set settings = '[]' where name = 'Rossi'$$, '23514', null, 'settings is an object');
select throws_ok($$update app.families set time_zone = 'Mars/Olympus' where name = 'Rossi'$$, '22023', null, 'valid IANA time zone');
select lives_ok($$update app.families set time_zone = 'Europe/London' where name = 'Rossi'$$, 'time zone change');
select throws_ok($$delete from app.families where name = 'Rossi'$$, '42501', null, 'family deletion is not in milestone A');

-- Membership
select is(tests.affected($$update app.family_members set role = 'family_admin' where user_id = tests.uid('bruno')$$), 1::bigint, 'admin promotes a member');
select is(tests.affected($$update app.family_members set role = 'family_admin' where user_id = tests.uid('carla')$$), 0::bigint, 'Anna cannot change Bianchi roles');
reset role;
select tests.login('carla');
select is(tests.affected($$delete from app.family_members where user_id = tests.uid('bruno')$$), 0::bigint, 'Carla cannot remove Rossi members');
reset role;
select tests.login('bruno');
select is(tests.affected($$delete from app.family_members where user_id = tests.uid('anna') and family_id = tests.family('Bianchi')$$), 0::bigint, 'Bruno cannot touch Bianchi');
select is(tests.affected($$delete from app.family_members where user_id = tests.uid('bruno')$$), 1::bigint, 'Bruno leaves Rossi');
select is((select count(*) from app.families), 0::bigint, 'after leaving, Rossi is hidden');

-- Books and avoided ingredients: admins; exclusions: members
reset role;
select tests.login('anna');
select lives_ok($$delete from app.family_books where family_id = tests.family('Rossi')$$, 'admin manages books');
select throws_ok($$insert into app.family_ingredients (family_id, ingredient_id, restriction) values (tests.family('Bianchi'), tests.ingredient('salt'), 'avoid')$$, '42501', null, 'Anna is not a Bianchi admin');
select lives_ok($$insert into app.recipe_exclusions (family_id, recipe_id, created_by) values (tests.family('Bianchi'), tests.recipe('pasta-al-pomodoro'), tests.uid('anna'))$$, 'members manage exclusions');
select throws_ok($$insert into app.recipe_exclusions (family_id, recipe_id) values (tests.family('Verdi'), tests.recipe('pasta-al-pomodoro'))$$, '42501', null, 'not in another family');

-- Integrity, as owner
reset role;
select throws_ok($$insert into app.family_ingredients (family_id, ingredient_id, restriction) values (tests.family('Verdi'), tests.ingredient('pasta'), 'limit')$$, '23514', null, 'limit needs weekly_max');
select throws_ok($$insert into app.family_members (family_id, user_id, role) values (tests.family('Verdi'), tests.uid('anna'), 'owner')$$, '23514', null, 'family role vocabulary');
delete from auth.users where id = tests.uid('carla');
select is((select count(*) from app.family_members where family_id = tests.family('Bianchi')), 1::bigint, 'membership deleted with the user');

select * from finish();
rollback;
```

- [ ] **Step 3: Esegui e verifica che fallisca**

Run: `supabase db reset && supabase test db`
Atteso: FAIL, `relation "app.families" does not exist`.

- [ ] **Step 4: Scrivi la migrazione**

`supabase/migrations/20261011100300_families.sql`:

```sql
-- Families, members, family preferences. Spec sections 2 and 7.

create table app.families (
	id uuid primary key default gen_random_uuid(),
	name text not null check (btrim(name) <> ''),
	-- Only the values the family changed; the server fills in the domain defaults.
	settings jsonb not null default '{}' check (jsonb_typeof(settings) = 'object'),
	measurement_system text not null default 'metric' check (measurement_system in ('metric', 'uk_imperial')),
	time_zone text not null default 'Europe/Rome',
	data_version bigint not null default 1,
	data_version_xid xid8,
	created_at timestamptz not null default now()
);

create function app.check_time_zone()
returns trigger language plpgsql set search_path = '' as $$
begin
	if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.time_zone) then
		raise exception 'invalid time zone: %', new.time_zone using errcode = '22023';
	end if;
	return new;
end;
$$;

create trigger families_check_time_zone
	before insert or update of time_zone on app.families
	for each row execute function app.check_time_zone();

create table app.family_members (
	family_id uuid not null references app.families (id) on delete cascade,
	user_id uuid not null references auth.users (id) on delete cascade,
	role text not null check (role in ('family_admin', 'member')),
	joined_at timestamptz not null default now(),
	primary key (family_id, user_id)
);
create index family_members_user on app.family_members (user_id);

create table app.family_books (
	family_id uuid not null references app.families (id) on delete cascade,
	book_id uuid not null references app.books (id),
	primary key (family_id, book_id)
);

create table app.family_ingredients (
	family_id uuid not null references app.families (id) on delete cascade,
	ingredient_id uuid not null references app.ingredients (id),
	restriction text not null check (restriction in ('avoid', 'limit')),
	weekly_max integer check (weekly_max > 0),
	primary key (family_id, ingredient_id),
	check ((restriction = 'limit') = (weekly_max is not null))
);

create table app.recipe_exclusions (
	family_id uuid not null references app.families (id) on delete cascade,
	recipe_id uuid not null references app.recipes (id) on delete cascade,
	reason text,
	created_by uuid references auth.users (id) on delete set null,
	created_at timestamptz not null default now(),
	primary key (family_id, recipe_id)
);

alter table app.families enable row level security;
alter table app.family_members enable row level security;
alter table app.family_books enable row level security;
alter table app.family_ingredients enable row level security;
alter table app.recipe_exclusions enable row level security;

create function app.is_member(p_family_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
	select exists (
		select 1 from app.family_members
		where family_id = p_family_id and user_id = (select auth.uid())
	);
$$;

create function app.is_family_admin(p_family_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
	select exists (
		select 1 from app.family_members
		where family_id = p_family_id and user_id = (select auth.uid()) and role = 'family_admin'
	);
$$;

create function app.shares_family(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
	select exists (
		select 1
		from app.family_members mine
		join app.family_members theirs on theirs.family_id = mine.family_id
		where mine.user_id = (select auth.uid()) and theirs.user_id = p_user_id
	);
$$;

grant execute on function app.is_member(uuid), app.is_family_admin(uuid), app.shares_family(uuid)
	to authenticated;

grant select on app.families to authenticated;
grant update (name, settings, measurement_system, time_zone) on app.families to authenticated;
grant select, delete on app.family_members to authenticated;
grant update (role) on app.family_members to authenticated;
grant select, insert, update, delete on app.family_books, app.family_ingredients, app.recipe_exclusions
	to authenticated;

create policy families_read on app.families for select to authenticated
	using (app.is_member(id));
create policy families_update on app.families for update to authenticated
	using (app.is_family_admin(id)) with check (app.is_family_admin(id));

create policy family_members_read on app.family_members for select to authenticated
	using (app.is_member(family_id));
-- The last-admin rule lives in the operations (spec section 2).
create policy family_members_update on app.family_members for update to authenticated
	using (app.is_family_admin(family_id)) with check (app.is_family_admin(family_id));
create policy family_members_delete on app.family_members for delete to authenticated
	using (app.is_family_admin(family_id) or user_id = (select auth.uid()));

create policy family_books_read on app.family_books for select to authenticated
	using (app.is_member(family_id));
create policy family_books_admin on app.family_books for all to authenticated
	using (app.is_family_admin(family_id)) with check (app.is_family_admin(family_id));
create policy family_ingredients_read on app.family_ingredients for select to authenticated
	using (app.is_member(family_id));
create policy family_ingredients_admin on app.family_ingredients for all to authenticated
	using (app.is_family_admin(family_id)) with check (app.is_family_admin(family_id));
create policy recipe_exclusions_member on app.recipe_exclusions for all to authenticated
	using (app.is_member(family_id)) with check (app.is_member(family_id));

-- Co-members see each other's names.
drop policy profiles_select_own on app.profiles;
create policy profiles_read on app.profiles for select to authenticated
	using (user_id = (select auth.uid()) or app.shares_family(user_id));
```

- [ ] **Step 5: Esegui e verifica che passino**

Run: `supabase db reset && supabase test db`
Atteso: PASS per tutti i file (`identity_test.sql` resta verde: Dario non ha famiglie).

- [ ] **Step 6: Commit**

```bash
git add supabase
git commit -m "Schema: famiglie, membri e preferenze con isolamento

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Settimane, pasti, registro e voti

**Files:**
- Create: `supabase/migrations/20261011100400_meals.sql`
- Modify: `supabase/tests/helpers/fixtures.psql`
- Test: `supabase/tests/meals_test.sql`

**Interfaces:**
- Consumes: Task 3 e 4.
- Produces: `app.weeks(id, family_id, starts_on, generated_at)`, `app.meal_slots(id, week_id, date, meal_type, recipe_id, free_text, servings, note, updated_by, updated_at)`, `app.meal_changes(id, meal_slot_id, actor_id, channel, before, after, undoes, created_at)`, `app.ratings(user_id, recipe_id, stars, updated_at)`; viste `app.family_scores(family_id, recipe_id, average, votes)`, `app.global_scores(recipe_id, average, votes)`; `app.week_family_id(uuid) returns uuid`, `app.slot_family_id(uuid) returns uuid`, `app.meal_passed_at(date, text, text) returns timestamptz`, `app.recipe_version_at(uuid, timestamptz) returns integer`; settimana di prova 12 ottobre 2026 per Rossi e Verdi.

- [ ] **Step 1: Aggiungi pasti e voti di prova**

In fondo a `fixtures.psql`:

```sql
-- Week of Monday 12 October 2026: Rossi with the pasta and the new draft, Verdi free.
do $$
declare
	v_rossi_week uuid;
	v_verdi_week uuid;
begin
	insert into app.weeks (family_id, starts_on, generated_at)
		values (tests.family('Rossi'), '2026-10-12', now()) returning id into v_rossi_week;
	insert into app.weeks (family_id, starts_on)
		values (tests.family('Verdi'), '2026-10-12') returning id into v_verdi_week;
	insert into app.meal_slots (week_id, date, meal_type, recipe_id, servings) values
		(v_rossi_week, '2026-10-12', 'lunch', tests.recipe('pasta-al-pomodoro'), 2),
		(v_rossi_week, '2026-10-12', 'dinner', tests.recipe('new-draft'), 2);
	insert into app.meal_slots (week_id, date, meal_type, free_text, servings)
		values (v_verdi_week, '2026-10-12', 'lunch', 'Pizza', 3);
	insert into app.meal_changes (meal_slot_id, actor_id, channel, before, after)
		select id, tests.uid('anna'), 'web', '{}', '{}'
		from app.meal_slots where week_id = v_rossi_week and meal_type = 'lunch';
	insert into app.ratings (user_id, recipe_id, stars) values
		(tests.uid('anna'), tests.recipe('pasta-al-pomodoro'), 5),
		(tests.uid('bruno'), tests.recipe('pasta-al-pomodoro'), 3),
		(tests.uid('carla'), tests.recipe('pasta-al-pomodoro'), 4),
		(tests.uid('franco'), tests.recipe('pasta-al-pomodoro'), 1);
end;
$$;
```

- [ ] **Step 2: Scrivi il test che fallisce**

`supabase/tests/meals_test.sql`:

```sql
begin;
\ir helpers/setup.psql
\ir helpers/fixtures.psql
select no_plan();

-- Visibility
reset role;
select tests.login('bruno');
select is((select count(*) from app.weeks), 1::bigint, 'Bruno sees the Rossi week');
select is((select count(*) from app.meal_slots), 2::bigint, 'Bruno sees the Rossi meals');
select is((select count(*) from app.meal_changes), 1::bigint, 'Bruno sees the Rossi change log');
select is((select count(*) from app.recipes), 3::bigint, 'the draft cited by a Rossi meal is visible');
reset role;
select tests.login('franco');
select is((select count(*) from app.meal_slots), 1::bigint, 'Franco sees the Verdi meal');
select is((select count(*) from app.meal_changes), 0::bigint, 'Franco sees no Rossi changes');
select is((select count(*) from app.recipes), 2::bigint, 'the draft cited by Rossi stays hidden from Verdi');
reset role;
select tests.login('carla');
select is((select count(*) from app.weeks), 0::bigint, 'Bianchi has no week');
select is((select count(*) from app.recipes), 2::bigint, 'and no cited draft');
reset role;
select tests.login('elena');
select is((select count(*) from app.weeks), 0::bigint, 'app admin sees no week');

-- Writing meals
reset role;
select tests.login('bruno');
select lives_ok($$insert into app.meal_slots (week_id, date, meal_type, free_text, servings)
	select id, '2026-10-13', 'lunch', 'Avanzi', 2 from app.weeks$$, 'member adds a meal');
select throws_ok($$insert into app.meal_slots (week_id, date, meal_type, servings)
	values ((select w.id from app.weeks w where w.family_id = tests.family('Verdi')), '2026-10-13', 'lunch', 2)$$,
	'42501', null, 'not in another family');
select is(tests.affected($$update app.meal_slots set servings = 4 where free_text = 'Pizza'$$), 0::bigint, 'cannot change Verdi meals');
select is(tests.affected($$update app.meal_slots set servings = 3, updated_by = tests.uid('bruno') where meal_type = 'dinner'$$), 1::bigint, 'member changes a Rossi meal');
select throws_ok($$delete from app.meal_slots$$, '42501', null, 'meals are changed, not deleted');
select lives_ok($$insert into app.meal_changes (meal_slot_id, actor_id, channel, before, after)
	select id, tests.uid('bruno'), 'mcp', '{}', '{}' from app.meal_slots where meal_type = 'dinner'$$, 'member logs a change');
select throws_ok($$insert into app.meal_changes (meal_slot_id, actor_id, channel, before, after)
	select id, tests.uid('anna'), 'web', '{}', '{}' from app.meal_slots where meal_type = 'dinner'$$, '42501', null, 'only as oneself');
select throws_ok($$update app.meal_changes set after = '{"x": 1}'$$, '42501', null, 'change log is immutable');
select throws_ok($$delete from app.meal_changes$$, '42501', null, 'change log is never deleted');
select lives_ok($$insert into app.meal_changes (id, meal_slot_id, actor_id, channel, before, after)
	select '7d1f6f39-6f0e-4c4b-9b67-2f6c0c8a0001', id, tests.uid('bruno'), 'web', '{}', '{}' from app.meal_slots where meal_type = 'dinner'
	on conflict (id) do nothing$$, 'client id');
select lives_ok($$insert into app.meal_changes (id, meal_slot_id, actor_id, channel, before, after)
	select '7d1f6f39-6f0e-4c4b-9b67-2f6c0c8a0001', id, tests.uid('bruno'), 'web', '{}', '{}' from app.meal_slots where meal_type = 'dinner'
	on conflict (id) do nothing$$, 'repeating it is harmless');
select is((select count(*) from app.meal_changes where id = '7d1f6f39-6f0e-4c4b-9b67-2f6c0c8a0001'), 1::bigint, 'no duplicate');

-- Ratings
select is((select count(*) from app.ratings), 2::bigint, 'Bruno sees Rossi ratings');
select throws_ok($$insert into app.ratings (user_id, recipe_id, stars) values (tests.uid('anna'), tests.recipe('old-minestrone'), 2)$$, '42501', null, 'not on behalf of others');
select throws_ok($$insert into app.ratings (user_id, recipe_id, stars) values (tests.uid('bruno'), tests.recipe('new-draft'), 2)$$, '42501', null, 'drafts cannot be rated');
select lives_ok($$insert into app.ratings (user_id, recipe_id, stars) values (tests.uid('bruno'), tests.recipe('old-minestrone'), 2)$$, 'archived recipes can be rated');
select is(tests.affected($$update app.ratings set stars = 4 where user_id = tests.uid('bruno') and recipe_id = tests.recipe('pasta-al-pomodoro')$$), 1::bigint, 'own rating');
select is(tests.affected($$update app.ratings set stars = 5 where user_id = tests.uid('anna')$$), 0::bigint, 'not Anna''s');
select throws_ok($$update app.ratings set stars = 6 where user_id = tests.uid('bruno')$$, '23514', null, 'stars 1-5');
select is((select average from app.family_scores where family_id = tests.family('Rossi') and recipe_id = tests.recipe('pasta-al-pomodoro')), 4.50::numeric, 'family average (5 and 4)');
select is((select count(*) from app.family_scores where family_id <> tests.family('Rossi')), 0::bigint, 'no other family scores');
reset role;
select tests.login('anna');
select is((select count(*) from app.ratings), 4::bigint, 'Anna sees Rossi and Bianchi ratings');
reset role;
select tests.login('elena');
select is((select average from app.global_scores where recipe_id = tests.recipe('pasta-al-pomodoro')), 3.50::numeric, 'anonymous global average (5, 4, 4, 1)');

-- Integrity, as owner
reset role;
select throws_ok($$insert into app.weeks (family_id, starts_on) values (tests.family('Rossi'), '2026-10-13')$$, '23514', null, 'weeks start on Monday');
select throws_ok($$insert into app.weeks (family_id, starts_on) values (tests.family('Rossi'), '2026-10-12')$$, '23505', null, 'one week per family and Monday');
select throws_ok($$insert into app.meal_slots (week_id, date, meal_type, servings) select id, '2026-10-19', 'lunch', 2 from app.weeks where family_id = tests.family('Rossi')$$, '23514', null, 'date inside the week');
select throws_ok($$insert into app.meal_slots (week_id, date, meal_type, servings) select id, '2026-10-12', 'lunch', 2 from app.weeks where family_id = tests.family('Rossi')$$, '23505', null, 'one slot per date and meal');
select throws_ok($$insert into app.meal_slots (week_id, date, meal_type, recipe_id, free_text, servings) select id, '2026-10-14', 'lunch', tests.recipe('pasta-al-pomodoro'), 'Pizza', 2 from app.weeks where family_id = tests.family('Rossi')$$, '23514', null, 'recipe or free text, not both');
select throws_ok($$insert into app.meal_slots (week_id, date, meal_type, note, servings) select id, '2026-10-14', 'dinner', repeat('x', 201), 2 from app.weeks where family_id = tests.family('Rossi')$$, '23514', null, 'note up to 200 characters');
select throws_ok($$delete from app.recipes where slug = 'new-draft'$$, '23503', null, 'a cited draft cannot be deleted');

-- R1: passed instant and version shown
select is(app.meal_passed_at('2026-10-12', 'lunch', 'Europe/Rome'), '2026-10-12 13:30:00+00'::timestamptz, 'lunch passes at 15:30 Rome');
select is(app.meal_passed_at('2026-10-12', 'dinner', 'Europe/Rome'), '2026-10-12 21:00:00+00'::timestamptz, 'dinner passes at 23:00 Rome');
select is(app.meal_passed_at('2026-10-25', 'lunch', 'Europe/Rome'), '2026-10-25 14:30:00+00'::timestamptz, 'day summer time ends');
select is(app.meal_passed_at('2026-03-29', 'lunch', 'Europe/Rome'), '2026-03-29 13:30:00+00'::timestamptz, 'day summer time starts');
select is(app.meal_passed_at('2026-10-12', 'dinner', 'Europe/London'), '2026-10-12 22:00:00+00'::timestamptz, 'another time zone');
select is(app.recipe_version_at(tests.recipe('pasta-al-pomodoro'), '2026-10-05 12:00+02'), 1, 'version in force then');
select is(app.recipe_version_at(tests.recipe('pasta-al-pomodoro'), '2026-10-11 12:00+02'), 2, 'current version');
select is(app.recipe_version_at(tests.recipe('pasta-al-pomodoro'), '2026-09-01 12:00+02'), null::integer, 'not yet published');

-- Deleting a user keeps the log as "former member"
delete from auth.users where id = tests.uid('anna');
select is((select count(*) from app.meal_changes where actor_id is null), 1::bigint, 'change kept, actor cleared');

select * from finish();
rollback;
```

- [ ] **Step 3: Esegui e verifica che fallisca**

Run: `supabase db reset && supabase test db`
Atteso: FAIL, `relation "app.weeks" does not exist`.

- [ ] **Step 4: Scrivi la migrazione**

`supabase/migrations/20261011100400_meals.sql`:

```sql
-- Weeks, meals, change log, ratings and scores. Spec sections 2, 3 and 5.

create table app.weeks (
	id uuid primary key default gen_random_uuid(),
	family_id uuid not null references app.families (id) on delete cascade,
	starts_on date not null check (extract(isodow from starts_on) = 1),
	generated_at timestamptz,
	unique (family_id, starts_on),
	unique (id, family_id)
);

create table app.meal_slots (
	id uuid primary key default gen_random_uuid(),
	week_id uuid not null references app.weeks (id) on delete cascade,
	date date not null,
	meal_type text not null check (meal_type in ('lunch', 'dinner')),
	recipe_id uuid references app.recipes (id) on delete restrict,
	free_text text,
	servings smallint not null check (servings >= 0),
	note text check (char_length(note) <= 200),
	-- null = the app (generation)
	updated_by uuid references auth.users (id) on delete set null,
	updated_at timestamptz not null default now(),
	unique (week_id, date, meal_type),
	check (recipe_id is null or free_text is null)
);
create index meal_slots_recipe on app.meal_slots (recipe_id);

create function app.check_meal_slot_date()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
	v_starts_on date;
begin
	select starts_on into v_starts_on from app.weeks where id = new.week_id;
	if new.date < v_starts_on or new.date > v_starts_on + 6 then
		raise exception 'meal date % outside the week starting %', new.date, v_starts_on using errcode = '23514';
	end if;
	return new;
end;
$$;

create trigger meal_slots_check_date
	before insert or update of date, week_id on app.meal_slots
	for each row execute function app.check_meal_slot_date();

create table app.meal_changes (
	id uuid primary key default gen_random_uuid(),
	meal_slot_id uuid not null references app.meal_slots (id) on delete cascade,
	actor_id uuid references auth.users (id) on delete set null,
	channel text not null check (channel in ('web', 'mcp', 'import')),
	before jsonb not null,
	after jsonb not null,
	undoes uuid references app.meal_changes (id),
	created_at timestamptz not null default now()
);
create index meal_changes_slot on app.meal_changes (meal_slot_id, created_at);

create table app.ratings (
	user_id uuid not null references auth.users (id) on delete cascade,
	recipe_id uuid not null references app.recipes (id) on delete cascade,
	stars smallint not null check (stars between 1 and 5),
	updated_at timestamptz not null default now(),
	primary key (user_id, recipe_id)
);
create index ratings_recipe on app.ratings (recipe_id);

alter table app.weeks enable row level security;
alter table app.meal_slots enable row level security;
alter table app.meal_changes enable row level security;
alter table app.ratings enable row level security;

create function app.week_family_id(p_week_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
	select family_id from app.weeks where id = p_week_id;
$$;

create function app.slot_family_id(p_slot_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
	select w.family_id from app.meal_slots s join app.weeks w on w.id = s.week_id where s.id = p_slot_id;
$$;

grant execute on function app.week_family_id(uuid), app.slot_family_id(uuid) to authenticated, app_job;

grant select, insert, update on app.weeks, app.meal_slots to authenticated;
grant select, insert on app.meal_changes to authenticated;
grant select, insert, update, delete on app.ratings to authenticated;

create policy weeks_member on app.weeks for all to authenticated
	using (app.is_member(family_id)) with check (app.is_member(family_id));
create policy meal_slots_member on app.meal_slots for all to authenticated
	using (app.is_member(app.week_family_id(week_id))) with check (app.is_member(app.week_family_id(week_id)));
create policy meal_changes_read on app.meal_changes for select to authenticated
	using (app.is_member(app.slot_family_id(meal_slot_id)));
create policy meal_changes_insert on app.meal_changes for insert to authenticated
	with check (actor_id = (select auth.uid()) and app.is_member(app.slot_family_id(meal_slot_id)));

create policy ratings_read on app.ratings for select to authenticated
	using (user_id = (select auth.uid()) or app.shares_family(user_id));
create policy ratings_write on app.ratings for all to authenticated
	using (user_id = (select auth.uid()))
	with check (
		user_id = (select auth.uid())
		and exists (select 1 from app.recipes r where r.id = recipe_id and r.status <> 'draft')
	);

-- A meal may cite a never-published recipe (imported history): its members see it.
create policy recipes_read_cited_draft on app.recipes for select to authenticated
	using (
		status = 'draft'
		and exists (
			select 1 from app.meal_slots s
			where s.recipe_id = recipes.id and app.is_member(app.week_family_id(s.week_id))
		)
	);

-- Average of the current members' ratings, per family and recipe.
create view app.family_scores with (security_invoker = true) as
	select m.family_id, r.recipe_id, round(avg(r.stars), 2) as average, count(*) as votes
	from app.ratings r
	join app.family_members m on m.user_id = r.user_id
	group by m.family_id, r.recipe_id;

-- Anonymous average over everyone, for the cold start of the planner. Owned by
-- postgres and not security_invoker on purpose: it aggregates past RLS.
create view app.global_scores as
	select recipe_id, round(avg(stars), 2) as average, count(*) as votes
	from app.ratings
	group by recipe_id;

grant select on app.family_scores, app.global_scores to authenticated, app_job;

-- R1: when a meal becomes past (15:30 lunch, 23:00 dinner, family time zone)...
create function app.meal_passed_at(p_date date, p_meal_type text, p_time_zone text)
returns timestamptz language sql stable set search_path = '' as $$
	select (p_date + case p_meal_type when 'lunch' then time '15:30' when 'dinner' then time '23:00' end)
		at time zone p_time_zone;
$$;

-- ...and which version of the recipe was in force at that instant.
create function app.recipe_version_at(p_recipe_id uuid, p_instant timestamptz)
returns integer language sql stable set search_path = '' as $$
	select max(version) from app.recipe_versions
	where recipe_id = p_recipe_id and published_at <= p_instant;
$$;

grant execute on function app.meal_passed_at(date, text, text), app.recipe_version_at(uuid, timestamptz)
	to authenticated, app_job;
```

- [ ] **Step 5: Esegui e verifica che passino**

Run: `supabase db reset && supabase test db`
Atteso: PASS per tutti i file. Se `catalogue_test.sql` ora conta 3 ricette per qualcuno,
controlla che usi Elena (nessuna famiglia), come scritto.

- [ ] **Step 6: Commit**

```bash
git add supabase
git commit -m "Schema: settimane, pasti, registro delle modifiche e voti

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Spesa e liste temporanee

**Files:**
- Create: `supabase/migrations/20261011100500_shopping.sql`
- Modify: `supabase/tests/helpers/fixtures.psql`
- Test: `supabase/tests/shopping_test.sql`

**Interfaces:**
- Consumes: Task 4 e 5 (`weeks` ha già `unique (id, family_id)`).
- Produces: `app.shopping_lists(id, family_id, week_id, updated_by, updated_at)`, `app.shopping_list_checks(shopping_list_id, ingredient_id, variety_key, quantity_at_check, checked_by, checked_at)`, `app.shopping_list_added_back(shopping_list_id, ingredient_id, variety_key, added_by, added_at)`, `app.shopping_list_items(id, shopping_list_id, text, checked, created_by, created_at, updated_by, updated_at)`, `app.temporary_lists(token, family_id, items, created_by, expires_at)`, `app.list_family_id(uuid) returns uuid`, `app.temporary_list_by_token(text) returns jsonb`.

- [ ] **Step 1: Aggiungi la spesa di prova**

In fondo a `fixtures.psql`:

```sql
-- Rossi shopping list for the week of 12 October, two temporary lists for Bring!.
do $$
declare
	v_list uuid;
begin
	insert into app.shopping_lists (family_id, week_id, updated_by)
		select family_id, id, tests.uid('anna') from app.weeks where family_id = tests.family('Rossi')
		returning id into v_list;
	insert into app.shopping_list_checks (shopping_list_id, ingredient_id, variety_key, quantity_at_check, checked_by)
		values (v_list, tests.ingredient('tomatoes'), '', '{"mass_g": 400}', tests.uid('anna'));
	insert into app.shopping_list_items (shopping_list_id, text, created_by)
		values (v_list, 'Caffè', tests.uid('bruno'));
	insert into app.temporary_lists (token, family_id, items, created_by, expires_at) values
		('valid-token', tests.family('Rossi'), '["400 g Pomodori"]', tests.uid('anna'), now() + interval '30 minutes'),
		('expired-token', tests.family('Rossi'), '["1 Caffè"]', tests.uid('anna'), now() - interval '1 minute');
end;
$$;
```

- [ ] **Step 2: Scrivi il test che fallisce**

`supabase/tests/shopping_test.sql`:

```sql
begin;
\ir helpers/setup.psql
\ir helpers/fixtures.psql
select no_plan();

reset role;
select tests.login('bruno');
select is((select count(*) from app.shopping_lists), 1::bigint, 'Rossi list');
select is((select count(*) from app.shopping_list_checks), 1::bigint, 'Rossi checks');
select is((select count(*) from app.shopping_list_items), 1::bigint, 'Rossi items');
select is((select count(*) from app.temporary_lists), 2::bigint, 'Rossi temporary lists');
select lives_ok($$insert into app.shopping_list_checks (shopping_list_id, ingredient_id, variety_key, quantity_at_check, checked_by)
	select id, tests.ingredient('tomatoes'), '', '{"mass_g": 600}', tests.uid('bruno') from app.shopping_lists
	on conflict (shopping_list_id, ingredient_id, variety_key) do update set quantity_at_check = excluded.quantity_at_check, checked_by = excluded.checked_by$$,
	'setChecked is an upsert');
select is((select quantity_at_check from app.shopping_list_checks), '{"mass_g": 600}'::jsonb, 'last save wins');
select throws_ok($$update app.shopping_list_checks set quantity_at_check = '600'$$, '23514', null, 'canonical quantity is an object');
select lives_ok($$insert into app.shopping_list_added_back (shopping_list_id, ingredient_id, variety_key, added_by)
	select id, tests.ingredient('salt'), '', tests.uid('bruno') from app.shopping_lists$$, 'put an excluded ingredient back');
select lives_ok($$insert into app.shopping_list_items (id, shopping_list_id, text, created_by)
	select '5b0c4f3e-1111-4c4b-9b67-2f6c0c8a0002', id, 'Latte', tests.uid('bruno') from app.shopping_lists on conflict (id) do nothing$$, 'free item with client id');
select lives_ok($$insert into app.shopping_list_items (id, shopping_list_id, text, created_by)
	select '5b0c4f3e-1111-4c4b-9b67-2f6c0c8a0002', id, 'Latte', tests.uid('bruno') from app.shopping_lists on conflict (id) do nothing$$, 'replayed from the offline queue');
select is((select count(*) from app.shopping_list_items), 2::bigint, 'no duplicate item');
select throws_ok($$insert into app.shopping_list_items (shopping_list_id, text) select id, '  ' from app.shopping_lists$$, '23514', null, 'item text not blank');

reset role;
select tests.login('franco');
select is((select count(*) from app.shopping_lists), 0::bigint, 'Franco sees no Rossi list');
select is((select count(*) from app.shopping_list_checks), 0::bigint, 'nor its checks');
select is((select count(*) from app.temporary_lists), 0::bigint, 'nor its temporary lists');
select throws_ok(format($$insert into app.shopping_list_checks (shopping_list_id, ingredient_id, variety_key, quantity_at_check) values (%L, %L, '', '{}')$$,
	tests.shopping_list('Rossi'), tests.ingredient('pasta')), '42501', null, 'cannot check items of another family');
select throws_ok(format($$insert into app.shopping_lists (family_id, week_id) values (%L, %L)$$,
	tests.family('Verdi'), tests.week('Rossi')), '23503', null, 'a list cannot point to a week of another family');
select throws_ok(format($$insert into app.shopping_lists (family_id, week_id) values (%L, %L)$$,
	tests.family('Rossi'), tests.week('Rossi')), '42501', null, 'cannot create lists for another family');

-- Bring!: the public page reads one list by token, nothing else
reset role;
select tests.become('anon');
select is(app.temporary_list_by_token('valid-token'), '["400 g Pomodori"]'::jsonb, 'valid token');
select is(app.temporary_list_by_token('expired-token'), null::jsonb, 'expired token');
select is(app.temporary_list_by_token('unknown'), null::jsonb, 'unknown token');
select throws_ok($$select * from app.temporary_lists$$, '42501', null, 'anon cannot read the table');
select throws_ok($$select * from app.recipes$$, '42501', null, 'anon cannot read the catalogue');

-- Integrity, as owner
reset role;
select throws_ok(format($$insert into app.shopping_lists (family_id, week_id) values (%L, %L)$$,
	tests.family('Rossi'), tests.week('Rossi')), '23505', null, 'one list per week');
insert into app.temporary_lists (family_id, items) values (tests.family('Rossi'), '["x"]');
select is((select length(token) from app.temporary_lists where items = '["x"]'), 48, 'random token by default');

select * from finish();
rollback;
```

- [ ] **Step 3: Esegui e verifica che fallisca**

Run: `supabase db reset && supabase test db`
Atteso: FAIL, `relation "app.shopping_lists" does not exist`.

- [ ] **Step 4: Scrivi la migrazione**

`supabase/migrations/20261011100500_shopping.sql`:

```sql
-- Shopping: one list per week, shared checks, free items, temporary lists for Bring!.
-- Quantities are not stored: they are recomputed from the meals. Spec section 6.

create table app.shopping_lists (
	id uuid primary key default gen_random_uuid(),
	family_id uuid not null references app.families (id) on delete cascade,
	week_id uuid not null,
	updated_by uuid references auth.users (id) on delete set null,
	updated_at timestamptz not null default now(),
	unique (family_id, week_id),
	-- The week must belong to the same family.
	foreign key (week_id, family_id) references app.weeks (id, family_id) on delete cascade
);

create table app.shopping_list_checks (
	shopping_list_id uuid not null references app.shopping_lists (id) on delete cascade,
	ingredient_id uuid not null references app.ingredients (id),
	variety_key text not null default '',
	-- Canonical quantity of the domain (W4): {mass_g, volume_ml, counts, texts: [{key, text}],
	-- to_taste}, validated by the server with the domain's zod schema.
	quantity_at_check jsonb not null check (jsonb_typeof(quantity_at_check) = 'object'),
	checked_by uuid references auth.users (id) on delete set null,
	checked_at timestamptz not null default now(),
	primary key (shopping_list_id, ingredient_id, variety_key)
);

create table app.shopping_list_added_back (
	shopping_list_id uuid not null references app.shopping_lists (id) on delete cascade,
	ingredient_id uuid not null references app.ingredients (id),
	variety_key text not null default '',
	added_by uuid references auth.users (id) on delete set null,
	added_at timestamptz not null default now(),
	primary key (shopping_list_id, ingredient_id, variety_key)
);

create table app.shopping_list_items (
	-- Generated by the device: replaying the offline queue does not duplicate.
	id uuid primary key default gen_random_uuid(),
	shopping_list_id uuid not null references app.shopping_lists (id) on delete cascade,
	text text not null check (btrim(text) <> ''),
	checked boolean not null default false,
	created_by uuid references auth.users (id) on delete set null,
	created_at timestamptz not null default now(),
	updated_by uuid references auth.users (id) on delete set null,
	updated_at timestamptz not null default now()
);

create table app.temporary_lists (
	token text primary key default encode(extensions.gen_random_bytes(24), 'hex'),
	family_id uuid not null references app.families (id) on delete cascade,
	items jsonb not null check (jsonb_typeof(items) = 'array'),
	created_by uuid references auth.users (id) on delete set null,
	expires_at timestamptz not null default now() + interval '30 minutes'
);

alter table app.shopping_lists enable row level security;
alter table app.shopping_list_checks enable row level security;
alter table app.shopping_list_added_back enable row level security;
alter table app.shopping_list_items enable row level security;
alter table app.temporary_lists enable row level security;

create function app.list_family_id(p_list_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
	select family_id from app.shopping_lists where id = p_list_id;
$$;

-- The only access of anon: the public Bring! page reads one unexpired list.
create function app.temporary_list_by_token(p_token text)
returns jsonb language sql stable security definer set search_path = '' as $$
	select items from app.temporary_lists where token = p_token and expires_at > now();
$$;

grant execute on function app.list_family_id(uuid) to authenticated;
grant execute on function app.temporary_list_by_token(text) to anon;

grant select, insert, update, delete on app.shopping_lists, app.shopping_list_checks,
	app.shopping_list_added_back, app.shopping_list_items to authenticated;
grant select, insert on app.temporary_lists to authenticated;

create policy shopping_lists_member on app.shopping_lists for all to authenticated
	using (app.is_member(family_id)) with check (app.is_member(family_id));
create policy shopping_list_checks_member on app.shopping_list_checks for all to authenticated
	using (app.is_member(app.list_family_id(shopping_list_id)))
	with check (app.is_member(app.list_family_id(shopping_list_id)));
create policy shopping_list_added_back_member on app.shopping_list_added_back for all to authenticated
	using (app.is_member(app.list_family_id(shopping_list_id)))
	with check (app.is_member(app.list_family_id(shopping_list_id)));
create policy shopping_list_items_member on app.shopping_list_items for all to authenticated
	using (app.is_member(app.list_family_id(shopping_list_id)))
	with check (app.is_member(app.list_family_id(shopping_list_id)));
create policy temporary_lists_member on app.temporary_lists for all to authenticated
	using (app.is_member(family_id)) with check (app.is_member(family_id));
```

- [ ] **Step 5: Esegui e verifica che passino**

Run: `supabase db reset && supabase test db`
Atteso: PASS per tutti i file.

- [ ] **Step 6: Commit**

```bash
git add supabase
git commit -m "Schema: lista della spesa, voci libere e liste temporanee per Bring!

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Job settimanale e ruolo `app_job`

**Files:**
- Create: `supabase/migrations/20261011100600_jobs.sql`
- Test: `supabase/tests/jobs_test.sql`

**Interfaces:**
- Consumes: Task 3-5.
- Produces: `app.weekly_jobs(family_id, target_week, status, attempts, error, updated_at)`; permessi di `app_job`.

- [ ] **Step 1: Scrivi il test che fallisce**

`supabase/tests/jobs_test.sql`:

```sql
begin;
\ir helpers/setup.psql
\ir helpers/fixtures.psql
select no_plan();

reset role;
select tests.become('app_job');
select is((select count(*) from app.families), 3::bigint, 'job reads every family');
select is((select count(*) from app.family_members), 5::bigint, 'and their members');
select is((select count(*) from app.family_books), 1::bigint, 'books');
select is((select count(*) from app.family_ingredients), 1::bigint, 'avoided ingredients');
select is((select count(*) from app.recipe_exclusions), 1::bigint, 'exclusions');
select is((select count(*) from app.weeks), 2::bigint, 'weeks');
select is((select count(*) from app.meal_slots), 3::bigint, 'meals, as planner history');
select is((select count(*) from app.ratings), 4::bigint, 'ratings');
select is((select count(*) from app.recipes), 2::bigint, 'published and archived recipes, no drafts');
select is((select count(*) from app.recipe_ingredients), 3::bigint, 'recipe ingredients');
select is((select count(*) from app.ingredients), 3::bigint, 'ingredients');
select ok((select count(*) from app.family_scores) > 0, 'family scores');

select throws_ok($$select * from app.profiles$$, '42501', null, 'no profiles');
select throws_ok($$select * from app.user_roles$$, '42501', null, 'no global roles');
select throws_ok($$select * from app.recipe_drafts$$, '42501', null, 'no drafts');
select throws_ok($$select * from app.meal_changes$$, '42501', null, 'no change log');
select throws_ok($$select * from app.shopping_lists$$, '42501', null, 'no shopping');
select throws_ok($$select * from app.temporary_lists$$, '42501', null, 'no temporary lists');

select lives_ok($$insert into app.weekly_jobs (family_id, target_week) values (tests.family('Bianchi'), '2026-10-19')
	on conflict do nothing$$, 'dispatcher is idempotent');
select lives_ok($$insert into app.weekly_jobs (family_id, target_week) values (tests.family('Bianchi'), '2026-10-19')
	on conflict do nothing$$, 'twice');
select is(tests.affected($$update app.weekly_jobs set status = 'done', attempts = attempts + 1$$), 1::bigint, 'job updates its rows');
select lives_ok($$insert into app.weeks (family_id, starts_on, generated_at) values (tests.family('Bianchi'), '2026-10-19', now())$$, 'job creates a week');
select lives_ok($$insert into app.meal_slots (week_id, date, meal_type, recipe_id, servings)
	select id, '2026-10-19', 'lunch', tests.recipe('pasta-al-pomodoro'), 2 from app.weeks where family_id = tests.family('Bianchi')$$, 'and its meals');
select throws_ok($$insert into app.weeks (family_id, starts_on) values (tests.family('Bianchi'), '2026-10-19')$$, '23505', null, 'concurrent runs cannot duplicate a week');
select throws_ok($$update app.families set settings = '{}'$$, '42501', null, 'job does not change families');
select throws_ok($$delete from app.weeks$$, '42501', null, 'job does not delete weeks');

reset role;
select tests.login('anna');
select throws_ok($$select * from app.weekly_jobs$$, '42501', null, 'users do not see the jobs');

reset role;
select throws_ok($$insert into app.weekly_jobs (family_id, target_week, status) values (tests.family('Rossi'), '2026-10-19', 'lost')$$, '23514', null, 'status vocabulary');
select throws_ok($$insert into app.weekly_jobs (family_id, target_week) values (tests.family('Rossi'), '2026-10-20')$$, '23514', null, 'target is a Monday');

select * from finish();
rollback;
```

- [ ] **Step 2: Esegui e verifica che fallisca**

Run: `supabase db reset && supabase test db`
Atteso: FAIL in `jobs_test.sql` (`permission denied` sulle letture del job).

- [ ] **Step 3: Scrivi la migrazione**

`supabase/migrations/20261011100600_jobs.sql`:

```sql
-- Weekly job: dispatcher rows and the app_job role, which reads every family and
-- writes only weeks, meals and its own rows. Spec section 4.

create table app.weekly_jobs (
	family_id uuid not null references app.families (id) on delete cascade,
	target_week date not null check (extract(isodow from target_week) = 1),
	status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
	attempts integer not null default 0 check (attempts >= 0),
	error text,
	updated_at timestamptz not null default now(),
	primary key (family_id, target_week)
);
alter table app.weekly_jobs enable row level security;

grant select on app.families, app.family_members, app.family_books, app.family_ingredients,
	app.recipe_exclusions, app.ratings, app.weeks, app.meal_slots, app.recipes, app.recipe_ingredients,
	app.ingredients, app.ingredient_unit_equivalences, app.books, app.recipe_versions to app_job;
grant insert, update on app.weeks, app.meal_slots to app_job;
grant select, insert, update on app.weekly_jobs to app_job;

create policy families_job on app.families for select to app_job using (true);
create policy family_members_job on app.family_members for select to app_job using (true);
create policy family_books_job on app.family_books for select to app_job using (true);
create policy family_ingredients_job on app.family_ingredients for select to app_job using (true);
create policy recipe_exclusions_job on app.recipe_exclusions for select to app_job using (true);
create policy ratings_job on app.ratings for select to app_job using (true);
create policy weeks_job on app.weeks for all to app_job using (true) with check (true);
create policy meal_slots_job on app.meal_slots for all to app_job using (true) with check (true);
create policy recipes_job on app.recipes for select to app_job using (status <> 'draft');
create policy recipe_ingredients_job on app.recipe_ingredients for select to app_job using (true);
create policy ingredients_job on app.ingredients for select to app_job using (true);
create policy equivalences_job on app.ingredient_unit_equivalences for select to app_job using (true);
create policy books_job on app.books for select to app_job using (true);
create policy recipe_versions_job on app.recipe_versions for select to app_job using (true);
create policy weekly_jobs_job on app.weekly_jobs for all to app_job using (true) with check (true);
```

- [ ] **Step 4: Esegui e verifica che passino**

Run: `supabase db reset && supabase test db`
Atteso: PASS per tutti i file.

- [ ] **Step 5: Commit**

```bash
git add supabase
git commit -m "Schema: job settimanale e ruolo app_job

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Contatori di versione

**Files:**
- Create: `supabase/migrations/20261011100700_versions.sql`
- Test: `supabase/tests/versions_test.sql`

**Interfaces:**
- Consumes: Task 2-7.
- Produces: `app.catalogue_state(id, version, version_xid)`, `app.bump_family_version(uuid)`, `app.bump_families_of_user(uuid)`, `app.bump_catalogue_version()`; W1 legge `app.families.data_version` e `app.catalogue_state.version`.

- [ ] **Step 1: Scrivi il test che fallisce**

`supabase/tests/versions_test.sql`:

```sql
begin;
\ir helpers/setup.psql
\ir helpers/fixtures.psql
select no_plan();

-- Meals: only the family concerned, once per transaction
select tests.new_transaction();
create temp table v0 as select tests.family_version('Rossi') as rossi, tests.family_version('Bianchi') as bianchi,
	tests.family_version('Verdi') as verdi, tests.catalogue_version() as catalogue;
grant select on v0 to authenticated, app_job;
reset role;
select tests.login('bruno');
select ok(tests.affected($$update app.meal_slots set servings = 5 where meal_type = 'lunch'$$) > 0, 'setup change applied');
select ok(tests.affected($$update app.meal_slots set servings = 6 where meal_type = 'lunch'$$) > 0, 'setup change applied');
select is(tests.family_version('Rossi'), (select rossi + 1 from v0), 'Rossi grows once per transaction');
select is(tests.family_version('Verdi'), (select verdi from v0), 'Verdi unchanged');
select is(tests.family_version('Bianchi'), (select bianchi from v0), 'Bianchi unchanged');
select is(tests.catalogue_version(), (select catalogue from v0), 'catalogue unchanged');

-- A whole generated week grows the counter by one
reset role;
select tests.new_transaction();
select tests.become('app_job');
insert into app.weeks (family_id, starts_on) values (tests.family('Verdi'), '2026-10-19');
insert into app.meal_slots (week_id, date, meal_type, servings)
	select w.id, w.starts_on + d, m, 2
	from app.weeks w, generate_series(0, 6) d, unnest(array['lunch', 'dinner']) m
	where w.family_id = tests.family('Verdi') and w.starts_on = '2026-10-19';
select is(tests.family_version('Verdi'), (select verdi + 1 from v0), 'one bump for 14 meals');

-- Ratings and names grow every family of the user
reset role;
select tests.new_transaction();
truncate v0;
insert into v0 select tests.family_version('Rossi'), tests.family_version('Bianchi'), tests.family_version('Verdi'), tests.catalogue_version();
select tests.login('anna');
select ok(tests.affected($$update app.ratings set stars = 4 where user_id = tests.uid('anna')$$) > 0, 'setup change applied');
select is(tests.family_version('Rossi'), (select rossi + 1 from v0), 'Anna''s rating: Rossi');
select is(tests.family_version('Bianchi'), (select bianchi + 1 from v0), 'Anna''s rating: Bianchi');
select is(tests.family_version('Verdi'), (select verdi from v0), 'not Verdi');
reset role;
select tests.new_transaction();
select tests.login('franco');
select ok(tests.affected($$update app.profiles set locale = 'it-IT' where user_id = tests.uid('franco')$$) > 0, 'setup change applied');
select is(tests.family_version('Verdi'), (select verdi from v0), 'locale is personal: no bump');
select ok(tests.affected($$update app.profiles set display_name = 'Frank' where user_id = tests.uid('franco')$$) > 0, 'setup change applied');
select is(tests.family_version('Verdi'), (select verdi + 1 from v0), 'a new name is shown to the family');

-- Catalogue: published content grows it, drafts do not
reset role;
select tests.new_transaction();
truncate v0;
insert into v0 select tests.family_version('Rossi'), tests.family_version('Bianchi'), tests.family_version('Verdi'), tests.catalogue_version();
select tests.login('dario');
select ok(tests.affected($$update app.recipe_drafts set content = '{"x": 1}', revision = 2$$) > 0, 'setup change applied');
select ok(tests.affected($$insert into app.recipe_draft_saves (draft_id, revision, content, channel) select id, 2, '{}', 'mcp' from app.recipe_drafts$$) > 0, 'setup change applied');
select ok(tests.affected($$update app.recipes set name = '{"it-IT": "Bozza rinominata"}' where slug = 'new-draft'$$) > 0, 'setup change applied');
select is(tests.catalogue_version(), (select catalogue from v0), 'drafts do not touch the catalogue');
select ok(tests.affected($$update app.recipes set tags = '{quick}' where slug = 'pasta-al-pomodoro'$$) > 0, 'setup change applied');
select ok(tests.affected($$update app.ingredients set is_pantry = true where slug = 'pasta'$$) > 0, 'setup change applied');
select is(tests.catalogue_version(), (select catalogue + 1 from v0), 'published changes: one bump');
select is(tests.family_version('Rossi'), (select rossi from v0), 'catalogue changes do not touch families');

-- Reading the counters; writing them is not possible
select ok(tests.catalogue_version() = (select version from app.catalogue_state), 'catalogue counter is readable');
select throws_ok($$update app.catalogue_state set version = 0$$, '42501', null, 'catalogue counter is not writable');

-- Rows that do not change what families see
reset role;
select tests.new_transaction();
truncate v0;
insert into v0 select tests.family_version('Rossi'), tests.family_version('Bianchi'), tests.family_version('Verdi'), tests.catalogue_version();
insert into app.temporary_lists (family_id, items) values (tests.family('Rossi'), '[]');
insert into app.weekly_jobs (family_id, target_week) values (tests.family('Rossi'), '2026-10-19');
select is(tests.family_version('Rossi'), (select rossi from v0), 'temporary lists and jobs do not bump');

-- Shopping and membership do
select ok(tests.affected($$update app.shopping_list_items set checked = true$$) > 0, 'setup change applied');
select is(tests.family_version('Rossi'), (select rossi + 1 from v0), 'shopping bumps');
select tests.new_transaction();
delete from app.family_members where user_id = tests.uid('carla');
select is(tests.family_version('Bianchi'), (select bianchi + 1 from v0), 'membership bumps');

-- Deleting a family cascades without errors
select lives_ok($$delete from app.families where name = 'Rossi'$$, 'family deletion with every trigger');

select * from finish();
rollback;
```

- [ ] **Step 2: Esegui e verifica che fallisca**

Run: `supabase db reset && supabase test db`
Atteso: FAIL, `relation "app.catalogue_state" does not exist` nelle funzioni dei test.

- [ ] **Step 3: Scrivi la migrazione**

`supabase/migrations/20261011100700_versions.sql`:

```sql
-- Version counters for the "unchanged" reads (spec section 1): one per family, one
-- for the catalogue. Triggers grow them at most once per transaction.

create table app.catalogue_state (
	id boolean primary key default true check (id),
	version bigint not null default 1,
	version_xid xid8
);
insert into app.catalogue_state default values;
alter table app.catalogue_state enable row level security;
grant select (id, version) on app.catalogue_state to authenticated, app_job;
create policy catalogue_state_read on app.catalogue_state for select to authenticated, app_job using (true);

create function app.bump_family_version(p_family_id uuid)
returns void language sql security definer set search_path = '' as $$
	update app.families
	set data_version = data_version + 1, data_version_xid = pg_catalog.pg_current_xact_id()
	where id = p_family_id and data_version_xid is distinct from pg_catalog.pg_current_xact_id();
$$;

create function app.bump_families_of_user(p_user_id uuid)
returns void language sql security definer set search_path = '' as $$
	select app.bump_family_version(family_id) from app.family_members where user_id = p_user_id;
$$;

create function app.bump_catalogue_version()
returns void language sql security definer set search_path = '' as $$
	update app.catalogue_state
	set version = version + 1, version_xid = pg_catalog.pg_current_xact_id()
	where version_xid is distinct from pg_catalog.pg_current_xact_id();
$$;

-- Family of a changed row, whatever the table; old and new rows for updates that move.
create function app.touch_family_version()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
	v_row jsonb;
	v_family_id uuid;
begin
	foreach v_row in array array[
		case when tg_op <> 'INSERT' then to_jsonb(old) end,
		case when tg_op <> 'DELETE' then to_jsonb(new) end
	] loop
		continue when v_row is null;
		v_family_id := case tg_table_name
			when 'families' then (v_row ->> 'id')::uuid
			when 'meal_slots' then app.week_family_id((v_row ->> 'week_id')::uuid)
			when 'meal_changes' then app.slot_family_id((v_row ->> 'meal_slot_id')::uuid)
			when 'shopping_list_checks' then app.list_family_id((v_row ->> 'shopping_list_id')::uuid)
			when 'shopping_list_added_back' then app.list_family_id((v_row ->> 'shopping_list_id')::uuid)
			when 'shopping_list_items' then app.list_family_id((v_row ->> 'shopping_list_id')::uuid)
			else (v_row ->> 'family_id')::uuid
		end;
		if v_family_id is not null then
			perform app.bump_family_version(v_family_id);
		end if;
	end loop;
	return null;
end;
$$;

create function app.touch_families_of_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
	perform app.bump_families_of_user(coalesce(new.user_id, old.user_id));
	return null;
end;
$$;

create function app.touch_catalogue_version()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
	perform app.bump_catalogue_version();
	return null;
end;
$$;

-- Family data
create trigger families_version after update of name, settings, measurement_system, time_zone on app.families
	for each row execute function app.touch_family_version();
create trigger family_members_version after insert or update or delete on app.family_members
	for each row execute function app.touch_family_version();
create trigger family_books_version after insert or update or delete on app.family_books
	for each row execute function app.touch_family_version();
create trigger family_ingredients_version after insert or update or delete on app.family_ingredients
	for each row execute function app.touch_family_version();
create trigger recipe_exclusions_version after insert or update or delete on app.recipe_exclusions
	for each row execute function app.touch_family_version();
create trigger weeks_version after insert or update or delete on app.weeks
	for each row execute function app.touch_family_version();
create trigger meal_slots_version after insert or update or delete on app.meal_slots
	for each row execute function app.touch_family_version();
create trigger meal_changes_version after insert on app.meal_changes
	for each row execute function app.touch_family_version();
create trigger shopping_lists_version after insert or update or delete on app.shopping_lists
	for each row execute function app.touch_family_version();
create trigger shopping_list_checks_version after insert or update or delete on app.shopping_list_checks
	for each row execute function app.touch_family_version();
create trigger shopping_list_added_back_version after insert or update or delete on app.shopping_list_added_back
	for each row execute function app.touch_family_version();
create trigger shopping_list_items_version after insert or update or delete on app.shopping_list_items
	for each row execute function app.touch_family_version();

-- Personal data shown to every family of the user
create trigger ratings_version after insert or update or delete on app.ratings
	for each row execute function app.touch_families_of_user();
create trigger profiles_version after update of display_name on app.profiles
	for each row execute function app.touch_families_of_user();

-- Catalogue: published content only; drafts and their history never bump it.
create trigger recipes_version_insert after insert on app.recipes
	for each row when (new.status <> 'draft') execute function app.touch_catalogue_version();
create trigger recipes_version_update after update on app.recipes
	for each row when (old.status <> 'draft' or new.status <> 'draft') execute function app.touch_catalogue_version();
create trigger recipes_version_delete after delete on app.recipes
	for each row when (old.status <> 'draft') execute function app.touch_catalogue_version();
create trigger recipe_ingredients_version after insert or update or delete on app.recipe_ingredients
	for each statement execute function app.touch_catalogue_version();
create trigger ingredients_version after insert or update or delete on app.ingredients
	for each statement execute function app.touch_catalogue_version();
create trigger equivalences_version after insert or update or delete on app.ingredient_unit_equivalences
	for each statement execute function app.touch_catalogue_version();
create trigger books_version after insert or update or delete on app.books
	for each statement execute function app.touch_catalogue_version();
```

- [ ] **Step 4: Esegui e verifica che passino**

Run: `supabase db reset && supabase test db`
Atteso: PASS per tutti i file.

- [ ] **Step 5: Commit**

```bash
git add supabase
git commit -m "Schema: contatori di versione della famiglia e del ricettario

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Pulizia con pg_cron, controllo complessivo, dati locali, script dei primi utenti

**Files:**
- Create: `supabase/migrations/20261011100800_cron.sql`, `supabase/seed.sql`, `supabase/scripts/bootstrap.sql`
- Modify: `supabase/README.md`
- Test: `supabase/tests/coverage_test.sql`

**Interfaces:**
- Consumes: tutto.
- Produces: job `purge-temporary-lists`; dati locali per W1 e W5 (persone con password `password123` e famiglie); script dei primi utenti.

- [ ] **Step 1: Scrivi il test che fallisce**

`supabase/tests/coverage_test.sql`:

```sql
begin;
\ir helpers/setup.psql
select no_plan();

select is(
	array(select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
		where n.nspname = 'app' and c.relkind = 'r' and not c.relrowsecurity order by 1),
	array[]::text[], 'every app table has RLS');
select is(
	array(select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
		where n.nspname = 'app' and c.relkind in ('r', 'v')
			and (has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
				or has_table_privilege('public', c.oid, 'SELECT,INSERT,UPDATE,DELETE'))
		order by 1),
	array[]::text[], 'anon and PUBLIC have no table privileges');
select is(
	array(select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
		where n.nspname = 'app' and c.relkind in ('r', 'v')
			and has_table_privilege('app_server', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
		order by 1),
	array[]::text[], 'app_server has no privileges without switching role');
select is(
	array(select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'app' and has_function_privilege('anon', p.oid, 'EXECUTE') order by 1),
	array['temporary_list_by_token'], 'anon executes only the Bring! function');
select is(
	array(select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'app' and p.prosecdef
			and not exists (select 1 from unnest(p.proconfig) c where c = 'search_path=""')
		order by 1),
	array[]::text[], 'every security definer function pins an empty search_path');
select is(
	(select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'v')),
	0::bigint, 'nothing in public');
select ok(exists (select 1 from cron.job where jobname = 'purge-temporary-lists'), 'expired temporary lists are purged');

select * from finish();
rollback;
```

Se il test su `search_path` fallisce perché Postgres registra il valore come
`search_path=""` con un'altra forma, stampa `proconfig` di una funzione e adegua il
confronto, non le funzioni.

- [ ] **Step 2: Esegui e verifica che fallisca**

Run: `supabase db reset && supabase test db`
Atteso: FAIL solo su `expired temporary lists are purged`. Se fallisce anche un altro
controllo, correggi la migrazione responsabile prima di proseguire.

- [ ] **Step 3: Scrivi la migrazione del cron**

`supabase/migrations/20261011100800_cron.sql`:

```sql
-- Housekeeping with pg_cron: temporary Bring! lists expire after 30 minutes.
-- The hourly weekly job comes with the "Menu e job" activity (wave 2).
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
	'purge-temporary-lists',
	'*/15 * * * *',
	$$delete from app.temporary_lists where expires_at < now()$$
);
```

- [ ] **Step 4: Esegui e verifica che passino**

Run: `supabase db reset && supabase test db`
Atteso: PASS per tutti i file.

- [ ] **Step 5: Scrivi i dati locali**

`supabase/seed.sql` (solo sviluppo locale; `db reset` lo applica dopo le migrazioni):

```sql
-- Local development data only. Never applied to the real project.
-- Password of every user: password123
do $$
declare
	v_person record;
	v_id uuid;
begin
	for v_person in
		select * from (values
			('anna@example.test', 'Anna', 'it-IT'),
			('bruno@example.test', 'Bruno', 'it-IT'),
			('carla@example.test', 'Carla', 'en-GB'),
			('dario@example.test', 'Dario', 'it-IT')
		) as p (email, display_name, locale)
	loop
		v_id := gen_random_uuid();
		insert into auth.users (
			instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
			raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
			confirmation_token, recovery_token, email_change_token_new, email_change
		) values (
			'00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_person.email,
			extensions.crypt('password123', extensions.gen_salt('bf')), now(),
			'{"provider": "email", "providers": ["email"]}',
			jsonb_build_object('display_name', v_person.display_name, 'locale', v_person.locale),
			now(), now(), '', '', '', ''
		);
		insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
		values (gen_random_uuid(), v_id, v_id::text,
			jsonb_build_object('sub', v_id::text, 'email', v_person.email), 'email', now(), now(), now());
	end loop;
end;
$$;

insert into app.user_roles (user_id, role)
	select id, 'recipe_curator' from auth.users where email = 'dario@example.test';

with family as (
	insert into app.families (name) values ('Famiglia Rossi') returning id
)
insert into app.family_members (family_id, user_id, role)
	select family.id, u.id, case u.email when 'anna@example.test' then 'family_admin' else 'member' end
	from family, auth.users u
	where u.email in ('anna@example.test', 'bruno@example.test');

with family as (
	insert into app.families (name, measurement_system, time_zone) values ('Carla''s family', 'uk_imperial', 'Europe/London') returning id
)
insert into app.family_members (family_id, user_id, role)
	select family.id, u.id, 'family_admin' from family, auth.users u where u.email = 'carla@example.test';
```

Il catalogo locale arriva dall'import di W3; il seed non inventa ricette né ingredienti
(regola di `AGENTS.md`).

- [ ] **Step 6: Verifica i dati locali e l'accesso**

```bash
supabase db reset
podman exec -i supabase_db_meal_planner_2 psql -U postgres -tAc \
  "select count(*) from app.profiles; select count(*) from app.family_members;"
```

Atteso: `4` e `3`. Poi verifica che un utente del seed possa accedere con la password:
avvia lo stack con Auth (`supabase start`, escludendo con `-x` i servizi che non
servono: vedi `supabase start --help`), leggi l'URL dell'API e la chiave pubblica da
`supabase status`, ed esegui:

```bash
curl -s -X POST "$API_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"anna@example.test","password":"password123"}' | head -c 200
```

Atteso: una risposta con `access_token`. Se Auth rifiuta l'utente, confronta le colonne
di `auth.users` con un utente creato da `supabase` (Studio locale) e correggi il seed.
Poi `supabase stop` e di nuovo `supabase db start`.

- [ ] **Step 7: Scrivi lo script dei primi utenti**

`supabase/scripts/bootstrap.sql`:

```sql
-- First users and family of the real project (milestone A: no invitations yet).
-- 1. Create the users by hand: Authentication > Users > Add user (email, password,
--    "Auto Confirm User").
-- 2. Fill in the two lists below.
-- 3. Run the whole script in the SQL editor. Safe to run again.
begin;

create temporary table input_people (
	email text not null,
	display_name text not null,
	locale text not null,          -- 'it-IT' or 'en-GB'
	family_role text not null,     -- 'family_admin' or 'member'
	global_roles text[] not null   -- any of 'recipe_curator', 'app_admin'
) on commit drop;

insert into input_people values
	('person@example.com', 'Name', 'it-IT', 'family_admin', array['app_admin', 'recipe_curator']);

create temporary table input_family (
	name text not null,
	measurement_system text not null,  -- 'metric' or 'uk_imperial'
	time_zone text not null
) on commit drop;

insert into input_family values ('Family name', 'metric', 'Europe/Rome');

do $$
declare
	v_missing text;
begin
	if (select count(*) from input_family) <> 1 then
		raise exception 'input_family must have exactly one row';
	end if;
	select string_agg(i.email, ', ') into v_missing
	from input_people i
	where not exists (select 1 from auth.users u where lower(u.email) = lower(i.email));
	if v_missing is not null then
		raise exception 'create these users first: %', v_missing;
	end if;
	if not exists (select 1 from input_people where family_role = 'family_admin') then
		raise exception 'the family needs at least one family_admin';
	end if;
end;
$$;

insert into app.profiles (user_id, display_name, locale)
	select u.id, i.display_name, i.locale
	from input_people i join auth.users u on lower(u.email) = lower(i.email)
on conflict (user_id) do update set display_name = excluded.display_name, locale = excluded.locale, updated_at = now();

insert into app.user_roles (user_id, role)
	select u.id, r.role
	from input_people i
	join auth.users u on lower(u.email) = lower(i.email)
	cross join lateral unnest(i.global_roles) as r (role)
on conflict do nothing;

insert into app.families (name, measurement_system, time_zone)
	select f.name, f.measurement_system, f.time_zone from input_family f
	where not exists (select 1 from app.families x where x.name = f.name);

insert into app.family_members (family_id, user_id, role)
	select fam.id, u.id, i.family_role
	from input_people i
	join auth.users u on lower(u.email) = lower(i.email)
	join input_family f on true
	join app.families fam on fam.name = f.name
on conflict (family_id, user_id) do update set role = excluded.role;

select u.email, p.display_name, p.locale, m.role as family_role,
	(select string_agg(r.role, ', ') from app.user_roles r where r.user_id = u.id) as global_roles
from input_people i
join auth.users u on lower(u.email) = lower(i.email)
join app.profiles p on p.user_id = u.id
left join app.family_members m on m.user_id = u.id;

commit;
```

- [ ] **Step 8: Prova lo script in locale**

```bash
supabase db reset
sed -e "s/person@example.com/dario@example.test/; s/'Family name'/'Famiglia di prova'/" \
  supabase/scripts/bootstrap.sql | podman exec -i supabase_db_meal_planner_2 psql -U postgres -v ON_ERROR_STOP=1
sed -e "s/person@example.com/dario@example.test/; s/'Family name'/'Famiglia di prova'/" \
  supabase/scripts/bootstrap.sql | podman exec -i supabase_db_meal_planner_2 psql -U postgres -v ON_ERROR_STOP=1
sed -e "s/person@example.com/nobody@example.test/" \
  supabase/scripts/bootstrap.sql | podman exec -i supabase_db_meal_planner_2 psql -U postgres -v ON_ERROR_STOP=1
podman exec -i supabase_db_meal_planner_2 psql -U postgres -tAc \
  "select count(*) from app.families where name = 'Famiglia di prova'; select count(*) from app.user_roles r join auth.users u on u.id = r.user_id where u.email = 'dario@example.test';"
```

Atteso: le prime due esecuzioni stampano Dario con ruolo `family_admin` e i due ruoli
globali; la terza si ferma con `create these users first: nobody@example.test`; la query
finale stampa `1` e `2` (nessun duplicato).

- [ ] **Step 9: Completa il README**

Aggiungi a `supabase/README.md`: `seed.sql` (persone, password, famiglie, solo locale);
`scripts/bootstrap.sql` (passi 1-3 del commento, eseguito dall'utente sul progetto vero
dopo l'applicazione delle migrazioni); l'elenco dei passi remoti della spec (sezione
«Passi remoti»), ciascuno con DOMANDA; la nota sull'integrazione GitHub da verificare
prima del merge.

- [ ] **Step 10: Verifica finale**

```bash
supabase db reset && supabase test db
git status --short
```

Atteso: `All tests successful`, `Result: PASS`; nessun file fuori da `supabase/` e dai
documenti di spec e piano.

- [ ] **Step 11: Commit**

```bash
git add supabase
git commit -m "Schema: pulizia delle liste temporanee, controlli complessivi, dati locali e script dei primi utenti

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
