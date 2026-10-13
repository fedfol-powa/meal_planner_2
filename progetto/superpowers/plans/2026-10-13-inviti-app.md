# W9 Inviti all'app e famiglie nuove: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** un `app_admin` crea dall'app un invito all'app; la persona apre `/invite/app#<token>`, sceglie la password, il Worker crea l'account già confermato, la persona entra, crea la sua famiglia e trova il menu.

**Architecture:** tabella `app.app_invitations` con impronta del token e funzioni `security definer`; ruolo `public` nel contratto (pipeline in `anon`, senza token, con limitatore `ratelimit` per IP); modulo `server/src/accounts/` unico lettore di `SUPABASE_SECRET_KEY` che chiama `POST /auth/v1/admin/users`; `family.create` con `app.create_family`; pagine React per invito, wizard, scheda di benvenuto e `/admin`.

**Tech Stack:** Postgres (Supabase) con pgTAP, Cloudflare Worker con oRPC e zod, Postgres.js, React con TanStack Router e Query, Vitest.

**Spec:** `progetto/superpowers/specs/2026-10-13-inviti-app.md` (leggila tutta prima di ogni task).

## Global Constraints

- Codice, identificatori, commenti e test in inglese; documenti e commit in italiano; testi per l'utente in `it-IT` ed `en-GB`, quelli italiani senza genere.
- Nessuna dipendenza nuova (né npm né servizi oltre al binding `ratelimit`).
- Migrazioni solo additive: un file nuovo `supabase/migrations/20261013100000_app_invitations.sql`, nessuna modifica a quelle unite.
- `EXECUTE` revocato a PUBLIC su ogni funzione nuova; `anon` esegue solo `app_invitation_by_token`, `claim_app_invitation`, `complete_app_invitation` (oltre a `temporary_list_by_token`).
- Nessuna scrittura nello schema `auth`; letture solo dentro funzioni `security definer`.
- Password da 8 caratteri a 72 byte UTF-8; mai nei log, mai salvata; nei log nemmeno token, email, corpi.
- Token: 32 byte casuali base64url (43 caratteri), nel database solo SHA-256; link `<origin>/invite/app#<token>` con `origin = new URL(request.url).origin`.
- Messaggio e codice unici (`invitation_unavailable`, 410) per invito scaduto, revocato, usato o inesistente.
- Operazioni `public`: `mcp: false`, `rateLimit` obbligatorio, nessuna lettura del token.
- Nessun aggiornamento ottimistico nelle mutazioni web (interfacce decise).
- Comandi: `npm test -w contract`, `npm test -w server` (con `TEST_DATABASE_URL`), `npm test -w web`, `supabase test db`, `npm run typecheck`.
- Stack locale: `supabase start` (Podman, vedi memoria del progetto per il workaround), database per i test `TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

## Review Focus

- Doppio invio del modulo dell'invito (doppio tocco o rete lenta): la seconda `accept` deve finire con lo stesso account o con `invitation_unavailable`, mai con un secondo account → test in Task 6 (`accept` concorrenti).
- Email riscritta con maiuscole o spazi diversi da quelli dell'invito: deve essere accettata → test in Task 2 (pgTAP `claim`) e Task 6.
- Persona con un'altra sessione aperta che usa il link: il token di quella sessione non deve influire sull'operazione → test in Task 3 (token ignorato) e Task 10 («Esci e continua»).
- Fuso del browser assente o strano (`undefined`, `Etc/Unknown`): la famiglia nasce in `Europe/Rome` → test in Task 7.
- Ricarica della pagina dell'invito dopo «Crea l'account» riuscito ma prima dell'ingresso: la pagina mostra «non vale più» e il collegamento all'accesso funziona → test in Task 10.

---

### Task 1: Contratto della piattaforma: ruolo `public`, limiti, codici d'errore

**Files:**
- Modify: `contract/src/op.ts`
- Modify: `contract/src/errors.ts`
- Modify: `contract/src/check.ts`
- Modify: `contract/src/index.ts`
- Test: `contract/src/check.test.ts`, `contract/src/errors.test.ts`

**Interfaces:**
- Produces: `Role` con `'public'`; `RateLimitName = 'read' | 'accept'`; `OperationMeta.rateLimit?: RateLimitName`; codici `invitation_unavailable` (410) e `rate_limited` (429); motivi `account_exists`, `already_accepted` in `notAllowedData`.

- [ ] **Step 1: Test che falliscono** in `contract/src/check.test.ts` (aggiungi in fondo, usando lo stile esistente del file):

```ts
describe('public operations', () => {
	const route = { method: 'POST', path: '/x', summary: 'x' } as const;
	const input = z.object({ token: z.string() });
	const output = z.object({ ok: z.literal(true) });
	const check = (meta: Parameters<typeof op>[0]) => checkContract({ a: { b: op(meta).route(route).input(input).output(output) } });

	it('accepts a public operation without MCP and with a rate limit', () => {
		expect(check({ mcp: false, offline: false, role: 'public', rateLimit: 'read' })).toEqual([]);
	});
	it('refuses MCP exposure, a missing limit, versioned reads and webOnly', () => {
		expect(check({ mcp: { readOnly: true }, offline: false, role: 'public', rateLimit: 'read' })).toContain('a.b: public operation cannot be an MCP tool');
		expect(check({ mcp: false, offline: false, role: 'public' })).toContain('a.b: public operation needs rateLimit');
		expect(check({ mcp: false, offline: false, role: 'public', rateLimit: 'read', reads: ['family'] })).toContain('a.b: public operation cannot be a versioned read');
	});
	it('refuses a rate limit on a signed-in operation', () => {
		expect(check({ mcp: false, offline: false, role: 'user', rateLimit: 'accept' })).toContain('a.b: rateLimit only on public operations');
	});
});
```

In `contract/src/errors.test.ts`:

```ts
it('has the invitation and rate-limit codes', () => {
	expect(errorDefinitions.invitation_unavailable.status).toBe(410);
	expect(errorDefinitions.rate_limited.status).toBe(429);
	expect(notAllowedData.parse({ reason: 'account_exists' })).toEqual({ reason: 'account_exists' });
	expect(notAllowedData.parse({ reason: 'already_accepted' })).toEqual({ reason: 'already_accepted' });
});
```

- [ ] **Step 2: Esegui** `npm test -w contract` → FAIL (`role 'public'` non ammesso dal tipo, codici assenti).

- [ ] **Step 3: Implementa.** `contract/src/op.ts`:

```ts
export type Role = 'user' | 'familyMember' | 'familyAdmin' | 'curator' | 'appAdmin' | 'public';
/** Limiters of the public operations: bindings `INVITE_READ_LIMIT` and `INVITE_ACCEPT_LIMIT` of the Worker. */
export type RateLimitName = 'read' | 'accept';
```

e in `OperationMeta`:

```ts
	/** Public operations only: the per-IP limiter checked before any database access. */
	rateLimit?: RateLimitName;
```

`contract/src/errors.ts`: aggiungi `'invitation_unavailable'` e `'rate_limited'` a `errorCodes` (prima di `'internal'`); in `notAllowedData` aggiungi `'account_exists', 'already_accepted'` all'enum; in `errorDefinitions`:

```ts
	/** An app invitation that is expired, revoked, used or unknown: one answer for all (spec W9). */
	invitation_unavailable: { status: 410 },
	rate_limited: { status: 429 },
```

`contract/src/check.ts`, dentro `walk` dopo il controllo di `webOnly`:

```ts
		if (meta.role === 'public') {
			if (meta.mcp !== false) problems.push(`${name}: public operation cannot be an MCP tool`);
			if (!meta.rateLimit) problems.push(`${name}: public operation needs rateLimit`);
			if (meta.reads) problems.push(`${name}: public operation cannot be a versioned read`);
			if (meta.webOnly) problems.push(`${name}: public operation cannot be webOnly`);
		} else if (meta.rateLimit) {
			problems.push(`${name}: rateLimit only on public operations`);
		}
```

`contract/src/index.ts`: esporta anche `type RateLimitName` da `./op.ts`.

- [ ] **Step 4: Esegui** `npm test -w contract && npm run typecheck -w contract` → PASS. Poi `npm run typecheck` dalla radice: se il web traduce gli errori con una mappa esaustiva (`web/src/api/errors.ts`, `web/src/i18n/messages/errors.ts`), aggiungi lì i due codici con i testi della spec (§3): `invitation_unavailable` «Questo invito non vale più. Chiedi un link nuovo a chi ti ha invitato.» / «This invitation is no longer valid. Ask whoever invited you for a new link.»; `rate_limited` «Troppi tentativi. Riprova tra un minuto.» / «Too many attempts. Try again in a minute.»; e i testi MCP del server se `server/src/messages.ts` è esaustivo.

- [ ] **Step 5: Commit**

```bash
git add contract web/src/api/errors.ts web/src/i18n/messages/errors.ts server/src/messages.ts
git commit -m "W9: ruolo public, limiti e codici d'errore degli inviti nel contratto"
```

---

### Task 2: Migrazione `app_invitations`, funzioni e `create_family` con pgTAP

**Files:**
- Create: `supabase/migrations/20261013100000_app_invitations.sql`
- Create: `supabase/tests/app_invitations_test.sql`, `supabase/tests/create_family_test.sql`
- Modify: `supabase/tests/coverage_test.sql` (elenchi `anon` e `authenticated`)

**Interfaces:**
- Produces (SQL): le funzioni della spec §1 con queste firme e codici d'errore (SQLSTATE):
  - `app.create_app_invitation(p_id uuid, p_token_hash bytea, p_email text, p_roles text[]) returns app.app_invitations`
  - `app.revoke_app_invitation(p_id uuid) returns app.app_invitations`
  - `app.app_invitations_view() returns table(id uuid, email text, roles text[], status text, created_by uuid, created_by_name text, created_at timestamptz, expires_at timestamptz, accepted_by_name text, accepted_at timestamptz, revoked_at timestamptz)`
  - `app.app_invitation_by_token(p_token_hash bytea) returns table(invited_by_name text, roles text[])`
  - `app.claim_app_invitation(p_token_hash bytea, p_email text) returns table(user_id uuid, email text)`
  - `app.complete_app_invitation(p_token_hash bytea, p_user_id uuid) returns void`
  - `app.create_family(p_id uuid, p_name text, p_measurement_system text, p_time_zone text) returns uuid`
  - SQLSTATE: `42501` non autorizzato; `P0A01` invito non disponibile; `P0A02` email diversa; `P0A03` account esistente; `P0A04` già accettato; `P0A05` conflitto d'id; `P0A06` invito inesistente (solo `revoke`); `23514` dati non validi.

- [ ] **Step 1: Test pgTAP che falliscono.** `supabase/tests/app_invitations_test.sql` (fixtures: `elena` è `app_admin`, `dario` è curatore; vedi `helpers/fixtures.psql`):

```sql
begin;
\ir helpers/setup.psql
\ir helpers/fixtures.psql
select no_plan();

create function tests.h(p_token text) returns bytea language sql immutable as $$
	select extensions.digest(p_token, 'sha256');
$$;
grant execute on function tests.h(text) to authenticated, anon;

-- Creation: app admins only, normalised email, allowed roles
select tests.login('dario');
select throws_ok($$select app.create_app_invitation(gen_random_uuid(), tests.h('t0'), 'new@x.it', '{}')$$, '42501', null, 'only app admins create');
reset role;
select tests.login('elena');
select lives_ok($$select app.create_app_invitation('00000000-0000-4000-8000-000000000001', tests.h('t1'), '  New@X.it ', '{recipe_curator}')$$, 'app admin creates');
select is((select email from app.app_invitations where id = '00000000-0000-4000-8000-000000000001'), 'new@x.it', 'email normalised');
select throws_ok($$select app.create_app_invitation(gen_random_uuid(), tests.h('t2'), 'b@x.it', '{root}')$$, '23514', null, 'unknown role');
select throws_ok($$select app.create_app_invitation(gen_random_uuid(), tests.h('t3'), 'b@x.it', '{app_admin,app_admin}')$$, '23514', null, 'duplicate role');
select throws_ok($$select app.create_app_invitation(gen_random_uuid(), tests.h('t4'), 'DARIO@test.local', '{}')$$, 'P0A03', null, 'email with an account');

-- A new invitation to the same email replaces the pending one
select lives_ok($$select app.create_app_invitation('00000000-0000-4000-8000-000000000002', tests.h('t5'), 'new@x.it', '{}')$$, 'second invitation');
select is((select status from app.app_invitations where id = '00000000-0000-4000-8000-000000000001'), 'revoked', 'first one revoked');
-- Repeating the same id gives a new token, no duplicate
select lives_ok($$select app.create_app_invitation('00000000-0000-4000-8000-000000000002', tests.h('t6'), 'new@x.it', '{}')$$, 'repeat');
select is((select count(*) from app.app_invitations where email = 'new@x.it' and status = 'pending'), 1::bigint, 'one pending');
select is((select token_hash from app.app_invitations where id = '00000000-0000-4000-8000-000000000002'), tests.h('t6'), 'token replaced');
select throws_ok($$select app.create_app_invitation('00000000-0000-4000-8000-000000000002', tests.h('t7'), 'other@x.it', '{}')$$, 'P0A05', null, 'same id, other email');

-- RLS: only app admins read
reset role;
select tests.login('dario');
select is((select count(*) from app.app_invitations), 0::bigint, 'non admins read nothing');
select throws_ok($$update app.app_invitations set status = 'accepted'$$, '42501', null, 'no direct writes');

-- Public reading by token: no email
reset role;
select tests.become('anon');
select is((select roles from app.app_invitation_by_token(tests.h('t6'))), '{}'::text[], 'valid invitation is readable');
select is((select count(*) from app.app_invitation_by_token(tests.h('t1'))), 0::bigint, 'revoked: no row');
select is((select count(*) from app.app_invitation_by_token(tests.h('nope'))), 0::bigint, 'unknown: no row');
select throws_ok($$select * from app.app_invitations$$, '42501', null, 'anon has no table access');

-- Claim: email check, reservation reused
select throws_ok($$select * from app.claim_app_invitation(tests.h('t6'), 'other@x.it')$$, 'P0A02', null, 'other email');
select is((select email from app.claim_app_invitation(tests.h('t6'), ' NEW@x.it')), 'new@x.it', 'email compared normalised');
select is((select user_id from app.claim_app_invitation(tests.h('t6'), 'new@x.it')),
	(select reserved_user_id from app.app_invitations where id = '00000000-0000-4000-8000-000000000002'), 'same reservation');
select throws_ok($$select * from app.claim_app_invitation(tests.h('t1'), 'new@x.it')$$, 'P0A01', null, 'revoked cannot be claimed');

-- Expiry: before reservation refused, after reservation still valid
reset role;
update app.app_invitations set expires_at = now() - interval '1 minute' where id = '00000000-0000-4000-8000-000000000002';
select tests.become('anon');
select is((select count(*) from app.app_invitation_by_token(tests.h('t6'))), 1::bigint, 'reserved and expired is still valid');
select lives_ok($$select * from app.claim_app_invitation(tests.h('t6'), 'new@x.it')$$, 'reserved and expired can be claimed again');
reset role;
select tests.login('elena');
select app.create_app_invitation('00000000-0000-4000-8000-000000000003', tests.h('t8'), 'late@x.it', '{}');
reset role;
update app.app_invitations set expires_at = now() - interval '1 minute' where id = '00000000-0000-4000-8000-000000000003';
select tests.become('anon');
select is((select count(*) from app.app_invitation_by_token(tests.h('t8'))), 0::bigint, 'expired without reservation');
select throws_ok($$select * from app.claim_app_invitation(tests.h('t8'), 'late@x.it')$$, 'P0A01', null, 'expired cannot be claimed');

-- Completion: needs the reserved id existing in auth.users with the invitation email
reset role;
select set_config('tests.reserved', (select reserved_user_id::text from app.app_invitations where id = '00000000-0000-4000-8000-000000000002'), true);
select tests.become('anon');
select throws_ok($$select app.complete_app_invitation(tests.h('t6'), gen_random_uuid())$$, 'P0A01', null, 'other id');
select throws_ok($$select app.complete_app_invitation(tests.h('t6'), current_setting('tests.reserved')::uuid)$$, 'P0A01', null, 'reserved id not in auth.users yet');
reset role;
insert into auth.users (id, email, aud, role) values (current_setting('tests.reserved')::uuid, 'wrong@x.it', 'authenticated', 'authenticated');
select tests.become('anon');
select throws_ok($$select app.complete_app_invitation(tests.h('t6'), current_setting('tests.reserved')::uuid)$$, 'P0A01', null, 'reserved id with another email');
reset role;
update auth.users set email = 'new@x.it' where id = current_setting('tests.reserved')::uuid;
update app.app_invitations set roles = '{recipe_curator}' where id = '00000000-0000-4000-8000-000000000002';
select tests.become('anon');
select lives_ok($$select app.complete_app_invitation(tests.h('t6'), current_setting('tests.reserved')::uuid)$$, 'completes even though expired after the reservation');
select lives_ok($$select app.complete_app_invitation(tests.h('t6'), current_setting('tests.reserved')::uuid)$$, 'repeat is a no-op');
reset role;
select is((select status from app.app_invitations where id = '00000000-0000-4000-8000-000000000002'), 'accepted', 'accepted');
select is((select array_agg(role) from app.user_roles where user_id = current_setting('tests.reserved')::uuid), '{recipe_curator}'::text[], 'roles granted');
select is((select granted_by from app.user_roles where user_id = current_setting('tests.reserved')::uuid), tests.uid('elena'), 'granted by the author');
select tests.become('anon');
select is((select count(*) from app.app_invitation_by_token(tests.h('t6'))), 0::bigint, 'used: no row');
-- Revoked after the reservation: completion refused
reset role;
select tests.login('elena');
select app.create_app_invitation('00000000-0000-4000-8000-000000000004', tests.h('t9'), 'gone@x.it', '{}');
reset role;
select tests.become('anon');
select set_config('tests.r9', (select user_id::text from app.claim_app_invitation(tests.h('t9'), 'gone@x.it')), true);
reset role;
insert into auth.users (id, email, aud, role) values (current_setting('tests.r9')::uuid, 'gone@x.it', 'authenticated', 'authenticated');
select tests.login('elena');
select lives_ok($$select app.revoke_app_invitation('00000000-0000-4000-8000-000000000004')$$, 'revoke');
select lives_ok($$select app.revoke_app_invitation('00000000-0000-4000-8000-000000000004')$$, 'revoke again is a no-op');
select throws_ok($$select app.revoke_app_invitation('00000000-0000-4000-8000-000000000002')$$, 'P0A04', null, 'accepted cannot be revoked');
select throws_ok($$select app.revoke_app_invitation(gen_random_uuid())$$, 'P0A06', null, 'unknown');
reset role;
select tests.become('anon');
select throws_ok($$select app.complete_app_invitation(tests.h('t9'), current_setting('tests.r9')::uuid)$$, 'P0A01', null, 'revoked after reservation');

-- The admin view
reset role;
select tests.login('elena');
select is((select created_by_name from app.app_invitations_view() where id = '00000000-0000-4000-8000-000000000004'), 'Elena', 'author name');
reset role;
select tests.login('dario');
select throws_ok($$select * from app.app_invitations_view()$$, '42501', null, 'view for app admins only');

select * from finish();
rollback;
```


`supabase/tests/create_family_test.sql`:

```sql
begin;
\ir helpers/setup.psql
\ir helpers/fixtures.psql
select no_plan();

select tests.login('dario');
select is(app.create_family('00000000-0000-4000-8000-0000000000f1', 'test-Nuova', 'uk_imperial', 'Europe/London'),
	'00000000-0000-4000-8000-0000000000f1'::uuid, 'created');
reset role;
select is((select role from app.family_members where family_id = '00000000-0000-4000-8000-0000000000f1' and user_id = tests.uid('dario')), 'family_admin', 'creator is admin');
select is((select current_family_id from app.profile_preferences where user_id = tests.uid('dario')), '00000000-0000-4000-8000-0000000000f1'::uuid, 'shown family');
select is((select time_zone from app.families where id = '00000000-0000-4000-8000-0000000000f1'), 'Europe/London', 'time zone');
select is((select count(*) from app.weeks where family_id = '00000000-0000-4000-8000-0000000000f1'), 0::bigint, 'no generation inside the function');
select set_config('tests.v', (select data_version::text from app.families where id = '00000000-0000-4000-8000-0000000000f1'), true);
select tests.login('dario');
select lives_ok($$select app.create_family('00000000-0000-4000-8000-0000000000f1', 'test-Nuova', 'uk_imperial', 'Europe/London')$$, 'repeat');
reset role;
select is((select count(*) from app.family_members where family_id = '00000000-0000-4000-8000-0000000000f1'), 1::bigint, 'no duplicate');
select tests.login('elena');
select throws_ok($$select app.create_family('00000000-0000-4000-8000-0000000000f1', 'x', 'metric', 'Europe/Rome')$$, 'P0A05', null, 'someone else''s id');
select throws_ok($$select app.create_family(gen_random_uuid(), 'x', 'metric', 'Mars/Base')$$, '22023', null, 'invalid time zone');
select throws_ok($$select app.create_family(gen_random_uuid(), '  ', 'metric', 'Europe/Rome')$$, '23514', null, 'empty name');
reset role;
select tests.become('anon');
select throws_ok($$select app.create_family(gen_random_uuid(), 'x', 'metric', 'Europe/Rome')$$, '42501', null, 'anon cannot create');

select * from finish();
rollback;
```

(Prima di scrivere, controlla in `supabase/migrations/20261011100300_families.sql` lo SQLSTATE del trigger sul fuso e il check sul nome; se differiscono da `22023` e `23514`, allinea i test alle costanti esistenti.)

- [ ] **Step 2: Esegui** `supabase test db` → FAIL (funzioni inesistenti).

- [ ] **Step 3: Scrivi la migrazione** `supabase/migrations/20261013100000_app_invitations.sql`:

```sql
-- W9 (wave 3, activity A): app invitations and families created by their users.
-- Spec: progetto/superpowers/specs/2026-10-13-inviti-app.md, section 1.

create table app.app_invitations (
	id uuid primary key,
	token_hash bytea not null unique check (octet_length(token_hash) = 32),
	email text not null check (email = lower(btrim(email)) and email <> '' and length(email) <= 320),
	roles text[] not null default '{}'
		check (roles <@ array['recipe_curator', 'app_admin'] and cardinality(roles) = cardinality(array(select distinct unnest(roles)))),
	created_by uuid references auth.users (id) on delete set null,
	created_at timestamptz not null default now(),
	expires_at timestamptz not null,
	status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
	revoked_at timestamptz,
	revoked_by uuid references auth.users (id) on delete set null,
	reserved_user_id uuid,
	reserved_at timestamptz,
	accepted_by uuid references auth.users (id) on delete set null,
	accepted_at timestamptz,
	check (status <> 'accepted' or (accepted_at is not null and reserved_user_id is not null)),
	check (status <> 'revoked' or revoked_at is not null),
	check (status <> 'pending' or (accepted_at is null and revoked_at is null))
);
create unique index app_invitations_one_pending on app.app_invitations (email) where status = 'pending';

alter table app.app_invitations enable row level security;
create policy app_invitations_read on app.app_invitations for select to authenticated using (app.has_role('app_admin'));
grant select on app.app_invitations to authenticated;

-- Helpers kept private to the functions below.
create function app.app_invitation_roles_valid(p_roles text[]) returns boolean
language sql immutable set search_path = '' as $$
	select p_roles <@ array['recipe_curator', 'app_admin']
		and cardinality(p_roles) = cardinality(array(select distinct unnest(p_roles)));
$$;
revoke execute on function app.app_invitation_roles_valid(text[]) from public;

create function app.create_app_invitation(p_id uuid, p_token_hash bytea, p_email text, p_roles text[])
returns app.app_invitations language plpgsql security definer set search_path = '' as $$
declare
	v_email text := lower(btrim(p_email));
	v_row app.app_invitations;
begin
	if not app.has_role('app_admin') then
		raise exception 'app admins only' using errcode = '42501';
	end if;
	if p_roles is null or not app.app_invitation_roles_valid(p_roles) then
		raise exception 'invalid roles' using errcode = '23514';
	end if;
	if exists (select 1 from auth.users u where lower(u.email) = v_email) then
		raise exception 'account exists' using errcode = 'P0A03';
	end if;
	select * into v_row from app.app_invitations where id = p_id for update;
	if found then
		if v_row.created_by is distinct from auth.uid() or v_row.status <> 'pending'
			or v_row.email <> v_email or v_row.roles <> p_roles then
			raise exception 'id in use' using errcode = 'P0A05';
		end if;
		update app.app_invitations set token_hash = p_token_hash where id = p_id returning * into v_row;
		return v_row;
	end if;
	update app.app_invitations set status = 'revoked', revoked_at = now(), revoked_by = auth.uid()
		where email = v_email and status = 'pending';
	insert into app.app_invitations (id, token_hash, email, roles, created_by, expires_at)
		values (p_id, p_token_hash, v_email, p_roles, auth.uid(), now() + interval '7 days')
		returning * into v_row;
	return v_row;
end;
$$;

create function app.revoke_app_invitation(p_id uuid)
returns app.app_invitations language plpgsql security definer set search_path = '' as $$
declare
	v_row app.app_invitations;
begin
	if not app.has_role('app_admin') then
		raise exception 'app admins only' using errcode = '42501';
	end if;
	select * into v_row from app.app_invitations where id = p_id for update;
	if not found then raise exception 'unknown invitation' using errcode = 'P0A06'; end if;
	if v_row.status = 'accepted' then raise exception 'already accepted' using errcode = 'P0A04'; end if;
	if v_row.status = 'pending' then
		update app.app_invitations set status = 'revoked', revoked_at = now(), revoked_by = auth.uid()
			where id = p_id returning * into v_row;
	end if;
	return v_row;
end;
$$;

create function app.app_invitations_view()
returns table (id uuid, email text, roles text[], status text, created_by uuid, created_by_name text,
	created_at timestamptz, expires_at timestamptz, accepted_by_name text, accepted_at timestamptz, revoked_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
	if not app.has_role('app_admin') then
		raise exception 'app admins only' using errcode = '42501';
	end if;
	return query
		select i.id, i.email, i.roles, i.status, i.created_by, c.display_name, i.created_at, i.expires_at,
			a.display_name, i.accepted_at, i.revoked_at
		from app.app_invitations i
		left join app.profiles c on c.user_id = i.created_by
		left join app.profiles a on a.user_id = i.accepted_by
		order by i.created_at desc;
end;
$$;

-- Valid for the link: pending, not revoked, and not expired unless already reserved (spec W9, question 4).
create function app.app_invitation_usable(p_row app.app_invitations) returns boolean
language sql stable set search_path = '' as $$
	select p_row.status = 'pending' and (p_row.expires_at > now() or p_row.reserved_user_id is not null);
$$;
revoke execute on function app.app_invitation_usable(app.app_invitations) from public;

create function app.app_invitation_by_token(p_token_hash bytea)
returns table (invited_by_name text, roles text[])
language sql stable security definer set search_path = '' as $$
	select p.display_name, i.roles
	from app.app_invitations i left join app.profiles p on p.user_id = i.created_by
	where i.token_hash = p_token_hash and app.app_invitation_usable(i);
$$;

create function app.claim_app_invitation(p_token_hash bytea, p_email text)
returns table (user_id uuid, email text) language plpgsql security definer set search_path = '' as $$
declare
	v_email text := lower(btrim(p_email));
	v_row app.app_invitations;
begin
	select * into v_row from app.app_invitations i where i.token_hash = p_token_hash for update;
	if not found or not app.app_invitation_usable(v_row) then
		raise exception 'invitation unavailable' using errcode = 'P0A01';
	end if;
	if v_row.email <> v_email then
		raise exception 'email mismatch' using errcode = 'P0A02';
	end if;
	if exists (select 1 from auth.users u where lower(u.email) = v_email
		and u.id is distinct from v_row.reserved_user_id) then
		raise exception 'account exists' using errcode = 'P0A03';
	end if;
	if v_row.reserved_user_id is null then
		update app.app_invitations set reserved_user_id = gen_random_uuid(), reserved_at = now()
			where id = v_row.id returning * into v_row;
	end if;
	return query select v_row.reserved_user_id, v_row.email;
end;
$$;

create function app.complete_app_invitation(p_token_hash bytea, p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
	v_row app.app_invitations;
begin
	select * into v_row from app.app_invitations i where i.token_hash = p_token_hash for update;
	if not found or v_row.status = 'revoked' or v_row.reserved_user_id is distinct from p_user_id then
		raise exception 'invitation unavailable' using errcode = 'P0A01';
	end if;
	if v_row.status = 'accepted' then
		if v_row.accepted_by = p_user_id then return; end if;
		raise exception 'invitation unavailable' using errcode = 'P0A01';
	end if;
	if not exists (select 1 from auth.users u where u.id = p_user_id and lower(u.email) = v_row.email) then
		raise exception 'invitation unavailable' using errcode = 'P0A01';
	end if;
	with accepted as (
		update app.app_invitations set status = 'accepted', accepted_by = p_user_id, accepted_at = now()
		where id = v_row.id returning roles, created_by
	)
	insert into app.user_roles (user_id, role, granted_by)
		select p_user_id, r, a.created_by from accepted a, unnest(a.roles) r
		on conflict do nothing;
end;
$$;

create function app.create_family(p_id uuid, p_name text, p_measurement_system text, p_time_zone text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
	v_user uuid := auth.uid();
begin
	if v_user is null then raise exception 'sign-in required' using errcode = '42501'; end if;
	if exists (select 1 from app.families where id = p_id) then
		if app.is_family_admin(p_id) then return p_id; end if;
		raise exception 'id in use' using errcode = 'P0A05';
	end if;
	insert into app.families (id, name, measurement_system, time_zone)
		values (p_id, btrim(p_name), p_measurement_system, p_time_zone);
	insert into app.family_members (family_id, user_id, role) values (p_id, v_user, 'family_admin');
	insert into app.profile_preferences (user_id, current_family_id) values (v_user, p_id)
		on conflict (user_id) do update set current_family_id = excluded.current_family_id, updated_at = now();
	return p_id;
end;
$$;

revoke execute on function app.create_app_invitation(uuid, bytea, text, text[]) from public;
revoke execute on function app.revoke_app_invitation(uuid) from public;
revoke execute on function app.app_invitations_view() from public;
revoke execute on function app.app_invitation_by_token(bytea) from public;
revoke execute on function app.claim_app_invitation(bytea, text) from public;
revoke execute on function app.complete_app_invitation(bytea, uuid) from public;
revoke execute on function app.create_family(uuid, text, text, text) from public;
grant execute on function app.create_app_invitation(uuid, bytea, text, text[]) to authenticated;
grant execute on function app.revoke_app_invitation(uuid) to authenticated;
grant execute on function app.app_invitations_view() to authenticated;
grant execute on function app.create_family(uuid, text, text, text) to authenticated;
grant execute on function app.app_invitation_by_token(bytea) to anon;
grant execute on function app.claim_app_invitation(bytea, text) to anon;
grant execute on function app.complete_app_invitation(bytea, uuid) to anon;
```

Verifica in `20261011100300_families.sql` se `families.name` ha già un check di non vuoto; se no, il test «empty name» fallisce: aggiungi in `create_family` `if btrim(coalesce(p_name, '')) = '' or length(btrim(p_name)) > 60 then raise exception 'invalid name' using errcode = '23514'; end if;`. Verifica anche che `app.profile_preferences` abbia `updated_at` (se no togli quella colonna dall'`on conflict`).

`supabase/tests/coverage_test.sql`: l'elenco `anon` diventa `array['app_invitation_by_token', 'claim_app_invitation', 'complete_app_invitation', 'temporary_list_by_token']`; nell'elenco `authenticated` aggiungi in ordine alfabetico (`collate "C"`) `app_invitations_view`, `create_app_invitation`, `create_family`, `revoke_app_invitation`.

- [ ] **Step 4: Esegui** `supabase db reset && supabase test db` → PASS (tutti i file, compresi quelli esistenti).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261013100000_app_invitations.sql supabase/tests
git commit -m "W9: tabella degli inviti all'app, funzioni per token e creazione della famiglia"
```

---

### Task 3: Pipeline delle operazioni `public` e limitatori

**Files:**
- Modify: `server/src/pipeline.ts`, `server/src/env.ts`, `server/src/app.ts`, `server/wrangler.jsonc`
- Modify: `server/test/support/requests.ts`, `server/test/support/context.ts`, `server/test/support/test-contract.ts`
- Test: `server/test/pipeline.test.ts`

**Interfaces:**
- Consumes: `Role`, `RateLimitName` (Task 1).
- Produces: `RequestContext.clientIp: string`; `interface RateLimiter { limit(options: { key: string }): Promise<{ success: boolean }> }` in `env.ts`; `Env.INVITE_READ_LIMIT: RateLimiter`, `Env.INVITE_ACCEPT_LIMIT: RateLimiter`, `Env.SUPABASE_SECRET_KEY?: string`; `interface PublicOperationContext extends RequestContext { public: true; now: Date; tx: Tx }`; `publicContext(context: unknown): PublicOperationContext`; `allowAll: RateLimiter` e `refuseAll: RateLimiter` in `server/test/support/requests.ts`.

- [ ] **Step 1: Test che falliscono.** In `test-contract.ts` aggiungi un'operazione pubblica:

```ts
		open: op({ mcp: false, offline: false, role: 'public', rateLimit: 'read' })
			.route({ method: 'POST', path: '/test/open', summary: 'Public' })
			.input(z.object({ echo: z.string() }))
			.output(z.object({ echo: z.string(), role: z.string() })),
```

e il gestore (importa `publicContext` da `../../src/pipeline.ts`):

```ts
		open: os.test.open.handler(async ({ context, input }) => {
			const { tx } = publicContext(context);
			const [{ role }] = await tx<{ role: string }[]>`select current_user as role`;
			return { echo: input.echo, role };
		}),
```

In `server/test/pipeline.test.ts`:

```ts
describe.skipIf(!hasDatabase)('public operations', () => {
	let db: TestDatabase;
	beforeAll(async () => {
		db = await setupDatabase();
	});
	afterAll(() => db?.close());

	it('run as anon without a token', async () => {
		const result = await call(testRouter.test.open, { echo: 'hi' }, options(contextFor(keys, undefined, db.appServerUrl)));
		expect(result).toEqual({ echo: 'hi', role: 'anon' });
	});
	it('ignore a token, even an invalid one', async () => {
		const result = await call(testRouter.test.open, { echo: 'x' }, options(contextFor(keys, 'not-a-jwt', db.appServerUrl)));
		expect(result.role).toBe('anon');
	});
	it('answer rate_limited before touching the database', async () => {
		const context = contextFor(keys, undefined); // unreachable database
		context.env.INVITE_READ_LIMIT = refuseAll;
		expect((await errorOf(call(testRouter.test.open, { echo: 'x' }, options(context)))).code).toBe('rate_limited');
	});
	it('key the limiter on the client IP', async () => {
		const keysSeen: string[] = [];
		const context = contextFor(keys, undefined, db.appServerUrl);
		context.clientIp = '203.0.113.7';
		context.env.INVITE_READ_LIMIT = { limit: async ({ key }) => (keysSeen.push(key), { success: true }) };
		await call(testRouter.test.open, { echo: 'x' }, options(context));
		expect(keysSeen).toEqual(['203.0.113.7']);
	});
});

it('publicContext refuses a signed-in context', () => {
	expect(() => publicContext({ userId: 'x' })).toThrow();
});
```

In `contextFor` (`support/context.ts`) aggiungi all'`env` `INVITE_READ_LIMIT: allowAll, INVITE_ACCEPT_LIMIT: allowAll, SUPABASE_SECRET_KEY: 'sb_secret_test'` e al contesto `clientIp: '198.51.100.1'`; lo stesso in `testEnv()` di `requests.ts`, dove definisci:

```ts
export const allowAll: RateLimiter = { limit: async () => ({ success: true }) };
export const refuseAll: RateLimiter = { limit: async () => ({ success: false }) };
```

- [ ] **Step 2: Esegui** `npm test -w server -- pipeline` → FAIL.

- [ ] **Step 3: Implementa.** `server/src/env.ts`:

```ts
/** Workers `ratelimit` binding (spec W9): per-location counters, a brake not a guarantee. */
export interface RateLimiter {
	limit(options: { key: string }): Promise<{ success: boolean }>;
}
```

e in `Env`:

```ts
	/** Secret: Supabase secret API key for the Auth admin API, read only by server/src/accounts/. */
	SUPABASE_SECRET_KEY?: string;
	INVITE_READ_LIMIT: RateLimiter;
	INVITE_ACCEPT_LIMIT: RateLimiter;
```

`server/src/pipeline.ts`: in `RequestContext` aggiungi `/** CF-Connecting-IP, the key of the public limiters. */ clientIp: string;`. Poi:

```ts
/** Context of a `public` operation: no user, the transaction is `anon`. */
export interface PublicOperationContext extends RequestContext {
	public: true;
	now: Date;
	tx: Tx;
}

/** The context of a public handler; throws when used by a signed-in operation. */
export function publicContext(context: unknown): PublicOperationContext {
	if ((context as { public?: unknown }).public !== true) throw new Error('publicContext() used outside a public operation');
	return context as PublicOperationContext;
}

const LIMITERS = { read: 'INVITE_READ_LIMIT', accept: 'INVITE_ACCEPT_LIMIT' } as const;
```

e all'inizio del middleware, prima di `authenticate`:

```ts
		if (meta.role === 'public') {
			// Before any database access; the token, if any, is never read (spec W9).
			const limiter = context.env[LIMITERS[meta.rateLimit!]];
			if (!(await limiter.limit({ key: context.clientIp })).success) throw appError('rate_limited');
			return withDb(context.env.HYPERDRIVE.connectionString, { kind: 'anon' }, async (tx) => {
				const operation: PublicOperationContext = { ...context, public: true, now: context.clock?.() ?? new Date(), tx };
				return next({ context: operation as unknown as OperationContext });
			});
		}
```

Aggiorna il commento di `createImplementer` («public operations: limiter, anon transaction, nothing else»). Controlla in `server/src/db.ts` la firma di `withDb` con `{ kind: 'anon' }` (usata da `bring-page.ts`).

`server/src/app.ts`, in `contextFor`: `clientIp: request.headers.get('cf-connecting-ip') ?? 'unknown',`.

`server/wrangler.jsonc`, dopo `hyperdrive`:

```jsonc
	// Public invitation operations (spec W9): per-IP limits; namespace ids unique in the Cloudflare account.
	"ratelimits": [
		{ "name": "INVITE_READ_LIMIT", "namespace_id": "9101", "simple": { "limit": 30, "period": 60 } },
		{ "name": "INVITE_ACCEPT_LIMIT", "namespace_id": "9102", "simple": { "limit": 5, "period": 60 } }
	],
```

Se `server/worker-configuration.d.ts` o i tipi del Worker sono generati da `wrangler types`, rigenerali; altrimenti il tipo `RateLimiter` di `env.ts` basta. Aggiorna i test che costruiscono un `Env` a mano (`grep -rn "SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test'" server`) aggiungendo i limitatori.

- [ ] **Step 4: Esegui** `npm test -w server && npm run typecheck -w server` → PASS.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "W9: operazioni public nella pipeline, in anon e con limiti per IP"
```

---

### Task 4: Modulo `server/src/accounts/`

**Files:**
- Create: `server/src/accounts/index.ts`
- Test: `server/src/accounts/index.test.ts`

**Interfaces:**
- Produces:

```ts
export interface InvitedAccount { id: string; email: string; password: string; displayName: string; locale: Locale }
export type AccountOutcome = { status: 'created' } | { status: 'existing' } | { status: 'email_taken' };
export class AccountServiceError extends Error {}
export async function createInvitedAccount(env: Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>, account: InvitedAccount, options?: { fetch?: typeof fetch }): Promise<AccountOutcome>
```

- [ ] **Step 1: Test che falliscono** (`server/src/accounts/index.test.ts`):

```ts
import { describe, expect, it, vi } from 'vitest';
import { AccountServiceError, createInvitedAccount } from './index.ts';

const env = { SUPABASE_URL: 'https://auth.test', SUPABASE_SECRET_KEY: 'sb_secret_x' };
const account = { id: '11111111-1111-4111-8111-111111111111', email: 'new@x.it', password: 'segreta123', displayName: 'Nuova', locale: 'it-IT' as const };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('createInvitedAccount', () => {
	it('creates a confirmed user with the reserved id, the secret key in apikey and no bearer', async () => {
		const fetch = vi.fn(async () => json(200, { id: account.id }));
		expect(await createInvitedAccount(env, account, { fetch })).toEqual({ status: 'created' });
		const [url, init] = fetch.mock.calls[0]! as [string, RequestInit];
		expect(url).toBe('https://auth.test/auth/v1/admin/users');
		expect(init.method).toBe('POST');
		expect(new Headers(init.headers).get('apikey')).toBe('sb_secret_x');
		expect(new Headers(init.headers).get('authorization')).toBeNull();
		expect(JSON.parse(init.body as string)).toEqual({
			id: account.id, email: 'new@x.it', password: 'segreta123', email_confirm: true,
			user_metadata: { display_name: 'Nuova', locale: 'it-IT' },
		});
	});

	it('on email_exists with the same id and email updates password and name', async () => {
		const fetch = vi.fn()
			.mockResolvedValueOnce(json(422, { error_code: 'email_exists' }))
			.mockResolvedValueOnce(json(200, { id: account.id, email: 'new@x.it' }))
			.mockResolvedValueOnce(json(200, { id: account.id }));
		expect(await createInvitedAccount(env, account, { fetch })).toEqual({ status: 'existing' });
		expect(fetch.mock.calls[1]![0]).toBe(`https://auth.test/auth/v1/admin/users/${account.id}`);
		const [, put] = fetch.mock.calls[2]! as [string, RequestInit];
		expect(put.method).toBe('PUT');
		expect(JSON.parse(put.body as string)).toEqual({ password: 'segreta123', user_metadata: { display_name: 'Nuova', locale: 'it-IT' } });
	});

	it('on email_exists with another user answers email_taken', async () => {
		const fetch = vi.fn()
			.mockResolvedValueOnce(json(422, { error_code: 'email_exists' }))
			.mockResolvedValueOnce(json(404, { error_code: 'user_not_found' }));
		expect(await createInvitedAccount(env, account, { fetch })).toEqual({ status: 'email_taken' });
	});

	it('fails as a service error on other answers, network errors and a missing key', async () => {
		await expect(createInvitedAccount(env, account, { fetch: async () => json(500, {}) })).rejects.toBeInstanceOf(AccountServiceError);
		await expect(createInvitedAccount(env, account, { fetch: async () => { throw new TypeError('down'); } })).rejects.toBeInstanceOf(AccountServiceError);
		await expect(createInvitedAccount({ SUPABASE_URL: env.SUPABASE_URL }, account)).rejects.toThrow('auth_admin_key_missing');
	});

	it('never puts the password in the error', async () => {
		const error = await createInvitedAccount(env, account, { fetch: async () => json(500, { msg: 'segreta123' }) }).catch((e) => e);
		expect(String(error.message)).not.toContain('segreta123');
	});
});
```

- [ ] **Step 2: Esegui** `npm test -w server -- accounts` → FAIL.

- [ ] **Step 3: Implementa** `server/src/accounts/index.ts`:

```ts
import type { Locale } from '@app/contract';
import type { Env } from '../env.ts';

const TIMEOUT_MS = 10_000;

export interface InvitedAccount {
	id: string;
	email: string;
	password: string;
	displayName: string;
	locale: Locale;
}
export type AccountOutcome = { status: 'created' } | { status: 'existing' } | { status: 'email_taken' };

/** Supabase Auth could not be used: an outage, answered as `internal`. The message never carries data. */
export class AccountServiceError extends Error {
	override name = 'AccountServiceError';
	constructor(readonly reason: 'auth_admin_key_missing' | 'auth_admin_failed', readonly status: number | null = null) {
		super(reason);
	}
}

/**
 * The only module that reads the secret key (spec W9). Creates a confirmed account with the id
 * reserved on the invitation; a repeat after a half-finished acceptance finds the same user and
 * sets the password and name chosen now. The secret key goes in `apikey`: it is not a JWT.
 */
export async function createInvitedAccount(
	env: Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>,
	account: InvitedAccount,
	options: { fetch?: typeof fetch } = {},
): Promise<AccountOutcome> {
	const key = env.SUPABASE_SECRET_KEY;
	if (!key) throw new AccountServiceError('auth_admin_key_missing');
	const send = async (method: string, path: string, body?: unknown): Promise<Response> => {
		try {
			return await (options.fetch ?? fetch)(new URL(`/auth/v1/admin/users${path}`, env.SUPABASE_URL).toString(), {
				method,
				headers: { apikey: key, 'content-type': 'application/json' },
				body: body === undefined ? undefined : JSON.stringify(body),
				signal: AbortSignal.timeout(TIMEOUT_MS),
			});
		} catch {
			throw new AccountServiceError('auth_admin_failed');
		}
	};
	const metadata = { display_name: account.displayName, locale: account.locale };
	const created = await send('POST', '', {
		id: account.id,
		email: account.email,
		password: account.password,
		email_confirm: true,
		user_metadata: metadata,
	});
	if (created.ok) return { status: 'created' };
	if (created.status !== 422 || (await errorCode(created)) !== 'email_exists') {
		throw new AccountServiceError('auth_admin_failed', created.status);
	}
	const existing = await send('GET', `/${account.id}`);
	if (existing.status === 404) return { status: 'email_taken' };
	if (!existing.ok) throw new AccountServiceError('auth_admin_failed', existing.status);
	const user = (await existing.json()) as { id?: unknown; email?: unknown };
	if (user.id !== account.id || typeof user.email !== 'string' || user.email.toLowerCase() !== account.email) return { status: 'email_taken' };
	const updated = await send('PUT', `/${account.id}`, { password: account.password, user_metadata: metadata });
	if (!updated.ok) throw new AccountServiceError('auth_admin_failed', updated.status);
	return { status: 'existing' };
}

async function errorCode(response: Response): Promise<string | undefined> {
	try {
		const body = (await response.json()) as { error_code?: unknown } | null;
		return typeof body?.error_code === 'string' ? body.error_code : undefined;
	} catch {
		return undefined;
	}
}
```

In `server/src/errors.ts` (`normalizeError`): un `AccountServiceError` diventa `internal` e la riga di log usa `event: error.reason` con il solo `status` (controlla come `GrantRevocationError` è trattato e fai lo stesso; aggiungi un test in `server/test/errors.test.ts` che la riga non contenga altro).

- [ ] **Step 4: Esegui** `npm test -w server -- accounts errors` → PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/accounts server/src/errors.ts server/test/errors.test.ts
git commit -m "W9: creazione dell'account invitato con l'API di amministrazione di Supabase Auth"
```

---

### Task 5: Area `appInvitations`: contratto, `create`, `list`, `revoke`, MCP

**Files:**
- Create: `contract/src/app-invitations/index.ts`, `contract/src/app-invitations/app-invitations-contract.test.ts`
- Create: `server/src/app-invitations/router.ts`, `server/src/app-invitations/tokens.ts`, `server/src/app-invitations/db-errors.ts`, `server/src/app-invitations/views.ts`
- Modify: `contract/src/contract.ts`, `contract/src/index.ts`, `server/src/router.ts`
- Test: `server/test/app-invitations.test.ts`, `server/src/app-invitations/tokens.test.ts`

**Interfaces:**
- Consumes: SQL di Task 2; `publicContext` (Task 3, usato in Task 6).
- Produces:
  - contratto `appInvitationsContract` con `create`, `list`, `revoke`, `get`, `accept` (questi due completati in Task 6 ma dichiarati qui); schemi `globalRoleSchema = z.enum(['recipe_curator','app_admin'])`, `invitationEmailSchema`, `invitationTokenSchema` (`/^[A-Za-z0-9_-]{43}$/`), `invitationPasswordSchema`, `appInvitationViewSchema`, tipo `AppInvitationView`, costante `PASSWORD_MAX_BYTES = 72`;
  - `newToken(): string`, `hashToken(token: string): Promise<Uint8Array>`, `invitationUrl(origin: string, token: string): string`;
  - `mapInvitationError(error: unknown): never` (SQLSTATE → `appError`).

- [ ] **Step 1: Contratto e test.** `contract/src/app-invitations/index.ts`:

```ts
import { z } from 'zod';
import { errorDefinitions } from '../errors.ts';
import { localeSchema } from '../locale.ts';
import { op } from '../op.ts';
import { displayNameSchema } from '../profile/index.ts';

export const globalRoleSchema = z.enum(['recipe_curator', 'app_admin']);
export const PASSWORD_MAX_BYTES = 72;
export const invitationEmailSchema = z.string().trim().toLowerCase().pipe(z.email().max(320));
export const invitationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
/** 8 characters as the web app; at most 72 bytes, bcrypt's limit (spec W9). */
export const invitationPasswordSchema = z
	.string()
	.min(8)
	.refine((value) => new TextEncoder().encode(value).length <= PASSWORD_MAX_BYTES, { message: 'password_too_long' });

const rolesSchema = z.array(globalRoleSchema).max(2).refine((roles) => new Set(roles).size === roles.length, { message: 'duplicate' });

export const appInvitationViewSchema = z.object({
	id: z.uuid(),
	email: z.string(),
	roles: z.array(globalRoleSchema),
	status: z.enum(['pending', 'expired', 'accepted', 'revoked']),
	createdBy: z.uuid().nullable(),
	createdByName: z.string().nullable(),
	createdAt: z.iso.datetime(),
	expiresAt: z.iso.datetime(),
	acceptedByName: z.string().nullable(),
	acceptedAt: z.iso.datetime().nullable(),
	revokedAt: z.iso.datetime().nullable(),
});
export type AppInvitationView = z.infer<typeof appInvitationViewSchema>;

const adminOp = (readOnly: boolean) => op({ mcp: { readOnly }, offline: false, role: 'appAdmin' });

export const appInvitationsContract = {
	create: op({ mcp: { readOnly: false }, offline: false, role: 'appAdmin', creates: true })
		.route({
			method: 'POST',
			path: '/app-invitations',
			summary:
				'Invite a person to the app by email, optionally as recipe curator or app administrator (app administrators). Returns the link once: send it yourself; a new invitation to the same email replaces the pending one',
		})
		.errors({ not_allowed: errorDefinitions.not_allowed })
		.input(z.object({ id: z.uuid(), email: invitationEmailSchema, roles: rolesSchema }))
		.output(z.object({ invitation: appInvitationViewSchema, url: z.url() })),
	list: adminOp(true)
		.route({ method: 'GET', path: '/app-invitations', summary: 'App invitations with status and expiry, newest first (app administrators)' })
		.input(z.object({}))
		.output(z.object({ invitations: z.array(appInvitationViewSchema) })),
	revoke: adminOp(false)
		.route({ method: 'POST', path: '/app-invitations/{id}/revoke', summary: 'Revoke a pending app invitation (app administrators)' })
		.errors({ not_found: errorDefinitions.not_found, not_allowed: errorDefinitions.not_allowed })
		.input(z.object({ id: z.uuid() }))
		.output(z.object({ invitation: appInvitationViewSchema })),
	get: op({ mcp: false, offline: false, role: 'public', rateLimit: 'read' })
		.route({ method: 'POST', path: '/app-invitations/open', summary: 'Who invites and with which roles, from the link (no sign-in)' })
		.errors({ invitation_unavailable: errorDefinitions.invitation_unavailable, rate_limited: errorDefinitions.rate_limited })
		.input(z.object({ token: invitationTokenSchema }))
		.output(z.object({ invitedBy: z.string().nullable(), roles: z.array(globalRoleSchema) })),
	accept: op({ mcp: false, offline: false, role: 'public', rateLimit: 'accept' })
		.route({ method: 'POST', path: '/app-invitations/accept', summary: 'Accept an app invitation: creates the account (no sign-in)' })
		.errors({
			invitation_unavailable: errorDefinitions.invitation_unavailable,
			rate_limited: errorDefinitions.rate_limited,
			not_allowed: errorDefinitions.not_allowed,
		})
		.input(
			z.object({
				token: invitationTokenSchema,
				email: invitationEmailSchema,
				displayName: displayNameSchema,
				password: invitationPasswordSchema,
				locale: localeSchema,
			}),
		)
		.output(z.object({ email: z.string() })),
};
```

`get` e `accept` usano POST perché il token non deve stare in un URL (log). Registra l'area in `contract/src/contract.ts` (`appInvitations: appInvitationsContract`) e in `contract/src/index.ts` (`export * from './app-invitations/index.ts';`).

`contract/src/app-invitations/app-invitations-contract.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { checkContract, contract } from '../index.ts';
import { invitationPasswordSchema, invitationEmailSchema } from './index.ts';

describe('appInvitations contract', () => {
	it('follows the conventions', () => {
		expect(checkContract({ appInvitations: contract.appInvitations })).toEqual([]);
	});
	it('counts the password limit in bytes', () => {
		expect(invitationPasswordSchema.safeParse('a'.repeat(72)).success).toBe(true);
		expect(invitationPasswordSchema.safeParse('a'.repeat(73)).success).toBe(false);
		expect(invitationPasswordSchema.safeParse('è'.repeat(37)).success).toBe(false); // 74 bytes
		expect(invitationPasswordSchema.safeParse('1234567').success).toBe(false);
	});
	it('normalises the email', () => {
		expect(invitationEmailSchema.parse('  New@X.it ')).toBe('new@x.it');
	});
});
```

- [ ] **Step 2: Test del server che falliscono** (`server/test/app-invitations.test.ts`):

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorOf, setupActors, type Actors } from './support/actors.ts';
import { hasDatabase } from './support/db.ts';
import { mcp, toolBody } from './support/requests.ts';

describe.skipIf(!hasDatabase)('app invitations: administration', () => {
	let actors: Actors;
	beforeAll(async () => {
		actors = await setupActors();
	});
	afterAll(() => actors?.close());

	const admin = async () => {
		const person = await actors.user();
		await actors.db.grantGlobalRole(person.userId, 'app_admin');
		return person;
	};
	const email = () => `p${crypto.randomUUID().slice(0, 8)}@x.it`;

	it('creates an invitation and returns the link once, with the token in the fragment', async () => {
		const federico = await admin();
		const to = email();
		const { invitation, url } = await federico.client.appInvitations.create({ id: crypto.randomUUID(), email: ` ${to.toUpperCase()}`, roles: ['recipe_curator'] });
		expect(invitation).toMatchObject({ email: to, roles: ['recipe_curator'], status: 'pending' });
		expect(url).toMatch(/^https:\/\/app\.test\/invite\/app#[A-Za-z0-9_-]{43}$/);
		const [row] = await actors.db.admin<{ token_hash: Buffer }[]>`select token_hash from app.app_invitations where id = ${invitation.id}`;
		const token = url.split('#')[1]!;
		expect(Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))).toEqual(row!.token_hash);
	});

	it('repeating the same id gives a new link and no duplicate', async () => {
		const federico = await admin();
		const input = { id: crypto.randomUUID(), email: email(), roles: [] as [] };
		const first = await federico.client.appInvitations.create(input);
		const second = await federico.client.appInvitations.create(input);
		expect(second.url).not.toBe(first.url);
		expect((await federico.client.appInvitations.list({})).invitations.filter((i) => i.id === input.id)).toHaveLength(1);
	});

	it('refuses an email that has an account', async () => {
		const federico = await admin();
		const other = await actors.user();
		const error = await errorOf(federico.client.appInvitations.create({ id: crypto.randomUUID(), email: `${other.userId}@test.local`, roles: [] }));
		expect([error.code, error.data]).toEqual(['not_allowed', { reason: 'account_exists' }]);
	});

	it('lists with computed expiry and revokes', async () => {
		const federico = await admin();
		const { invitation } = await federico.client.appInvitations.create({ id: crypto.randomUUID(), email: email(), roles: [] });
		await actors.db.admin`update app.app_invitations set expires_at = now() - interval '1 second' where id = ${invitation.id}`;
		expect((await federico.client.appInvitations.list({})).invitations.find((i) => i.id === invitation.id)?.status).toBe('expired');
		const pending = await federico.client.appInvitations.create({ id: crypto.randomUUID(), email: email(), roles: [] });
		expect((await federico.client.appInvitations.revoke({ id: pending.invitation.id })).invitation.status).toBe('revoked');
		expect((await federico.client.appInvitations.revoke({ id: pending.invitation.id })).invitation.status).toBe('revoked');
		expect((await errorOf(federico.client.appInvitations.revoke({ id: crypto.randomUUID() }))).code).toBe('not_found');
	});

	it('is forbidden to non app admins', async () => {
		const anna = await actors.user();
		expect((await errorOf(anna.client.appInvitations.list({}))).code).toBe('forbidden');
		expect((await errorOf(anna.client.appInvitations.create({ id: crypto.randomUUID(), email: email(), roles: [] }))).code).toBe('forbidden');
	});

	it('exposes create, list and revoke as MCP tools, never get and accept', async () => {
		const federico = await admin();
		const agent = await actors.user({ agent: true });
		await actors.db.grantGlobalRole(agent.userId, 'app_admin');
		const tools = (await mcp(actors.app, actors.env, agent.token, 'tools/list')).body.result.tools.map((t: { name: string }) => t.name);
		expect(tools).toEqual(expect.arrayContaining(['appInvitations_create', 'appInvitations_list', 'appInvitations_revoke']));
		expect(tools).not.toContain('appInvitations_get');
		expect(tools).not.toContain('appInvitations_accept');
		const result = await mcp(actors.app, actors.env, agent.token, 'tools/call', { name: 'appInvitations_create', arguments: { id: crypto.randomUUID(), email: email(), roles: [] } });
		expect(toolBody(result).url).toMatch(/^https:\/\/app\.test\/invite\/app#/);
		void federico;
	});
});
```

`server/src/app-invitations/tokens.test.ts`:

```ts
import { expect, it } from 'vitest';
import { hashToken, invitationUrl, newToken } from './tokens.ts';

it('makes 43-character base64url tokens, different each time', () => {
	const a = newToken();
	expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
	expect(newToken()).not.toBe(a);
});
it('hashes with SHA-256 and builds the link from the origin with the token in the fragment', async () => {
	expect((await hashToken('x')).length).toBe(32);
	expect(invitationUrl('https://app.test', 'abc')).toBe('https://app.test/invite/app#abc');
});
```

- [ ] **Step 3: Esegui** `npm test -w contract && npm test -w server -- app-invitations tokens` → FAIL.

- [ ] **Step 4: Implementa.** `server/src/app-invitations/tokens.ts`:

```ts
/** 32 random bytes, base64url without padding (43 characters). */
export function newToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function hashToken(token: string): Promise<Uint8Array> {
	return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
}

/** The token in the fragment: never sent to a server, never in a log or a Referer (spec W9). */
export function invitationUrl(origin: string, token: string): string {
	return `${new URL('/invite/app', origin).toString()}#${token}`;
}
```

`server/src/app-invitations/db-errors.ts`:

```ts
import { appError } from '../errors.ts';

/** SQLSTATEs raised by the functions of 20261013100000_app_invitations.sql. */
export function mapInvitationError(error: unknown): never {
	const code = (error as { code?: unknown } | null)?.code;
	switch (code) {
		case '42501': throw appError('forbidden');
		case 'P0A01': throw appError('invitation_unavailable');
		case 'P0A02': throw appError('invalid', { issues: [{ path: ['email'], code: 'email_mismatch' }] });
		case 'P0A03': throw appError('not_allowed', { reason: 'account_exists' });
		case 'P0A04': throw appError('not_allowed', { reason: 'already_accepted' });
		case 'P0A06': throw appError('not_found');
		case 'P0A05':
		case '23514':
		case '22023':
			throw appError('invalid', { issues: [{ path: [], code: 'invalid' }] });
		default: throw error;
	}
}
```

(`P0A05`: un id riusato con dati diversi è un errore del client, quindi `invalid` e non `conflict`, che richiede i dati del catalogo.)

`server/src/app-invitations/views.ts`:

```ts
import type { AppInvitationView } from '@app/contract';

export interface InvitationRow {
	id: string; email: string; roles: string[]; status: 'pending' | 'accepted' | 'revoked';
	created_by: string | null; created_by_name: string | null; created_at: Date; expires_at: Date;
	accepted_by_name: string | null; accepted_at: Date | null; revoked_at: Date | null;
}

export function invitationView(row: InvitationRow, now: Date): AppInvitationView {
	return {
		id: row.id,
		email: row.email,
		roles: row.roles as AppInvitationView['roles'],
		status: row.status === 'pending' && row.expires_at <= now ? 'expired' : row.status,
		createdBy: row.created_by,
		createdByName: row.created_by_name,
		createdAt: row.created_at.toISOString(),
		expiresAt: row.expires_at.toISOString(),
		acceptedByName: row.accepted_by_name,
		acceptedAt: row.accepted_at?.toISOString() ?? null,
		revokedAt: row.revoked_at?.toISOString() ?? null,
	};
}
```

(Un invito `pending` già prenotato ma scaduto appare «scaduto» nell'elenco: per l'amministratore conta la data; la persona può comunque finire, spec §1.)

`server/src/app-invitations/router.ts`:

```ts
import type { Implementer } from '../pipeline.ts';
import { mapInvitationError } from './db-errors.ts';
import { hashToken, invitationUrl, newToken } from './tokens.ts';
import { invitationView, type InvitationRow } from './views.ts';

export function appInvitationsRouter(os: Implementer) {
	const viewOf = async (tx: Parameters<Parameters<Implementer['appInvitations']['list']['handler']>[0]>[0]['context']['tx'], id: string, now: Date) => {
		const [row] = await tx<InvitationRow[]>`select * from app.app_invitations_view() where id = ${id}`;
		return invitationView(row!, now);
	};
	return {
		create: os.appInvitations.create.handler(async ({ context, input }) => {
			const token = newToken();
			const hash = await hashToken(token);
			try {
				await context.tx`select app.create_app_invitation(${input.id}::uuid, ${hash}, ${input.email}, ${input.roles}::text[])`;
			} catch (error) {
				mapInvitationError(error);
			}
			return { invitation: await viewOf(context.tx, input.id, context.now), url: invitationUrl(context.origin, token) };
		}),
		list: os.appInvitations.list.handler(async ({ context }) => {
			try {
				const rows = await context.tx<InvitationRow[]>`select * from app.app_invitations_view()`;
				return { invitations: rows.map((row) => invitationView(row, context.now)) };
			} catch (error) {
				mapInvitationError(error);
			}
		}),
		revoke: os.appInvitations.revoke.handler(async ({ context, input }) => {
			try {
				await context.tx`select app.revoke_app_invitation(${input.id}::uuid)`;
			} catch (error) {
				mapInvitationError(error);
			}
			return { invitation: await viewOf(context.tx, input.id, context.now) };
		}),
		get: os.appInvitations.get.handler(async () => {
			throw new Error('implemented in task 6');
		}),
		accept: os.appInvitations.accept.handler(async () => {
			throw new Error('implemented in task 6');
		}),
	};
}
```

Il tipo del parametro `tx` di `viewOf` scrivilo come `Tx` importato da `../db.ts` (più leggibile del tipo derivato sopra). Gli stub di `get`/`accept` restano solo fino al Task 6 (che si esegue subito dopo, nello stesso branch). In `server/src/router.ts` aggiungi `appInvitations: appInvitationsRouter(os),`. Con il ruolo `appAdmin` la pipeline rifiuta già chi non è `app_admin` con `forbidden` (`checkRole`); il `42501` delle funzioni resta la seconda barriera.

- [ ] **Step 5: Esegui** `npm test -w contract && npm test -w server && npm run typecheck` → PASS.

- [ ] **Step 6: Commit**

```bash
git add contract server
git commit -m "W9: creazione, elenco e revoca degli inviti all'app, anche via MCP"
```

---

### Task 6: `get` e `accept`: lettura pubblica e accettazione in tre passi

**Files:**
- Modify: `server/src/app-invitations/router.ts`
- Create: `server/test/support/fake-auth.ts`
- Test: `server/test/app-invitations-accept.test.ts`

**Interfaces:**
- Consumes: `publicContext`, `PublicOperationContext` (Task 3); `createInvitedAccount`, `AccountServiceError` (Task 4); `hashToken`, `mapInvitationError` (Task 5); `withDb` di `server/src/db.ts`.
- Produces: `installFakeAuth(db: TestDatabase): { calls: string[]; failNext(step: 'create' | 'complete'): void; restore(): void }` per i test.

- [ ] **Step 1: Auth finta per i test** (`server/test/support/fake-auth.ts`): sostituisce `globalThis.fetch` solo per gli URL `TEST_SUPABASE_URL/auth/v1/admin/users…` e simula GoTrue sul database locale (inserisce in `auth.users` come owner, così il trigger crea il profilo):

```ts
import { vi } from 'vitest';
import type { TestDatabase } from './db.ts';
import { TEST_SUPABASE_URL } from './keys.ts';

export function installFakeAuth(db: TestDatabase) {
	const calls: string[] = [];
	let failCreate = false;
	const real = globalThis.fetch;
	const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
		if (!url.startsWith(`${TEST_SUPABASE_URL}/auth/v1/admin/users`)) return real(input, init);
		const method = init?.method ?? 'GET';
		const id = url.split('/admin/users/')[1];
		calls.push(`${method}${id ? ' id' : ''}`);
		const body = init?.body ? JSON.parse(String(init.body)) : {};
		if (method === 'POST') {
			if (failCreate) { failCreate = false; return new Response('{}', { status: 500 }); }
			const [taken] = await db.admin`select 1 from auth.users where lower(email) = ${body.email}`;
			if (taken) return Response.json({ error_code: 'email_exists' }, { status: 422 });
			await db.admin`insert into auth.users (id, email, aud, role, raw_user_meta_data, email_confirmed_at)
				values (${body.id}, ${body.email}, 'authenticated', 'authenticated', ${db.admin.json(body.user_metadata)}, now())`;
			return Response.json({ id: body.id, email: body.email });
		}
		const [user] = await db.admin<{ id: string; email: string }[]>`select id, email from auth.users where id = ${id!}`;
		if (!user) return Response.json({ error_code: 'user_not_found' }, { status: 404 });
		return Response.json(user);
	});
	return { calls, failNextCreate: () => { failCreate = true; }, restore: () => spy.mockRestore() };
}
```

(Firma prodotta: `installFakeAuth(db) → { calls, failNextCreate(), restore() }`.)

- [ ] **Step 2: Test che falliscono** (`server/test/app-invitations-accept.test.ts`):

```ts
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { errorOf, setupActors, type Actors } from './support/actors.ts';
import { hasDatabase } from './support/db.ts';
import { installFakeAuth } from './support/fake-auth.ts';
import { refuseAll, rpcClient } from './support/requests.ts';
import type { Contract } from '@app/contract';
import type { ContractRouterClient } from '@orpc/contract';

describe.skipIf(!hasDatabase)('app invitations: link and acceptance', () => {
	let actors: Actors;
	let auth: ReturnType<typeof installFakeAuth>;
	beforeAll(async () => {
		actors = await setupActors();
		auth = installFakeAuth(actors.db);
	});
	afterAll(async () => {
		auth?.restore();
		await actors?.close();
	});
	afterEach(() => { auth.calls.length = 0; });

	const anonymous = () => rpcClient<ContractRouterClient<Contract>>(actors.app, actors.env);
	const invite = async (roles: ('recipe_curator' | 'app_admin')[] = []) => {
		const admin = await actors.user();
		await actors.db.grantGlobalRole(admin.userId, 'app_admin');
		const email = `p${crypto.randomUUID().slice(0, 8)}@x.it`;
		const { invitation, url } = await admin.client.appInvitations.create({ id: crypto.randomUUID(), email, roles });
		return { admin, email, id: invitation.id, token: url.split('#')[1]! };
	};
	const form = (token: string, email: string) => ({ token, email, displayName: 'Giulia', password: 'segreta123', locale: 'it-IT' as const });

	it('reads who invites and the roles, never the email', async () => {
		const { token } = await invite(['recipe_curator']);
		const view = await anonymous().appInvitations.get({ token });
		expect(view.roles).toEqual(['recipe_curator']);
		expect(view.invitedBy).toMatch(/^Test /);
		expect(JSON.stringify(view)).not.toContain('@');
	});

	it('creates the account, marks the invitation used and grants the roles', async () => {
		const { email, id, token } = await invite(['recipe_curator']);
		expect(await anonymous().appInvitations.accept(form(token, ` ${email.toUpperCase()}`))).toEqual({ email });
		const [user] = await actors.db.admin<{ id: string }[]>`select id from auth.users where email = ${email}`;
		const [row] = await actors.db.admin<{ status: string; accepted_by: string }[]>`select status, accepted_by from app.app_invitations where id = ${id}`;
		expect(row).toEqual({ status: 'accepted', accepted_by: user!.id });
		expect((await actors.db.admin`select role from app.user_roles where user_id = ${user!.id}`).map((r) => r.role)).toEqual(['recipe_curator']);
		expect((await actors.db.admin`select display_name, locale from app.profiles where user_id = ${user!.id}`)[0]).toEqual({ display_name: 'Giulia', locale: 'it-IT' });
		expect((await errorOf(anonymous().appInvitations.get({ token }))).code).toBe('invitation_unavailable');
	});

	it('gives one answer for expired, revoked, used and unknown links', async () => {
		const expired = await invite();
		await actors.db.admin`update app.app_invitations set expires_at = now() - interval '1 second' where id = ${expired.id}`;
		const revoked = await invite();
		await revoked.admin.client.appInvitations.revoke({ id: revoked.id });
		const used = await invite();
		await anonymous().appInvitations.accept(form(used.token, used.email));
		for (const token of [expired.token, revoked.token, used.token, 'A'.repeat(43)]) {
			expect((await errorOf(anonymous().appInvitations.get({ token }))).code).toBe('invitation_unavailable');
			expect((await errorOf(anonymous().appInvitations.accept(form(token, 'x@x.it')))).code).toBe('invitation_unavailable');
		}
	});

	it('refuses another email on the field, without creating anything', async () => {
		const { token } = await invite();
		const error = await errorOf(anonymous().appInvitations.accept(form(token, 'other@x.it')));
		expect([error.code, error.data]).toEqual(['invalid', { issues: [{ path: ['email'], code: 'email_mismatch' }] }]);
		expect(auth.calls).toEqual([]);
	});

	it('refuses when an account with that email was created meanwhile', async () => {
		const { email, token } = await invite();
		await actors.db.admin`insert into auth.users (id, email, aud, role) values (gen_random_uuid(), ${email}, 'authenticated', 'authenticated')`;
		const error = await errorOf(anonymous().appInvitations.accept(form(token, email)));
		expect([error.code, error.data]).toEqual(['not_allowed', { reason: 'account_exists' }]);
	});

	it('repeats after Auth failed, with the same reserved id and no second account', async () => {
		const { email, token } = await invite();
		auth.failNextCreate();
		expect((await errorOf(anonymous().appInvitations.accept(form(token, email)))).code).toBe('internal');
		await anonymous().appInvitations.accept(form(token, email));
		expect((await actors.db.admin`select count(*)::int as n from auth.users where email = ${email}`)[0]!.n).toBe(1);
	});

	it('repeats after the account was created but the closing failed: same user, new password', async () => {
		const { email, id, token } = await invite(['app_admin']);
		// Simulate a stop after step 3: reserve and create through the fake Auth, then leave the invitation pending.
		const [{ user_id }] = await actors.db.admin<{ user_id: string }[]>`select user_id from app.claim_app_invitation(${await sha(token)}, ${email})`;
		await actors.db.admin`insert into auth.users (id, email, aud, role) values (${user_id}, ${email}, 'authenticated', 'authenticated')`;
		await actors.db.admin`update app.app_invitations set expires_at = now() - interval '1 second' where id = ${id}`;
		await anonymous().appInvitations.accept(form(token, email));
		expect(auth.calls).toEqual(['POST', 'GET id', 'PUT id']);
		expect((await actors.db.admin`select status from app.app_invitations where id = ${id}`)[0]!.status).toBe('accepted');
		expect((await actors.db.admin`select role from app.user_roles where user_id = ${user_id}`).map((r) => r.role)).toEqual(['app_admin']);
	});

	it('two submissions at once end with one account', async () => {
		const { email, token } = await invite();
		const results = await Promise.allSettled([anonymous().appInvitations.accept(form(token, email)), anonymous().appInvitations.accept(form(token, email))]);
		expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
		for (const r of results) if (r.status === 'rejected') expect((r.reason as { code: string }).code).toBe('invitation_unavailable');
		expect((await actors.db.admin`select count(*)::int as n from auth.users where email = ${email}`)[0]!.n).toBe(1);
	});

	it('ignores the token of a signed-in caller', async () => {
		const { email, token } = await invite();
		const someone = await actors.user();
		await someone.client.appInvitations.accept(form(token, email));
		expect((await actors.db.admin`select count(*)::int as n from auth.users where email = ${email}`)[0]!.n).toBe(1);
	});

	it('answers rate_limited from the accept limiter', async () => {
		const { email, token } = await invite();
		const env = { ...actors.env, INVITE_ACCEPT_LIMIT: refuseAll };
		const client = rpcClient<ContractRouterClient<Contract>>(actors.app, env);
		expect((await errorOf(client.appInvitations.accept(form(token, email)))).code).toBe('rate_limited');
	});

	it('refuses a 73-byte password before any work', async () => {
		const { email, token } = await invite();
		const error = await errorOf(anonymous().appInvitations.accept({ ...form(token, email), password: 'a'.repeat(73) }));
		expect(error.code).toBe('invalid');
		expect(auth.calls).toEqual([]);
	});
});

async function sha(token: string) {
	return Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
}
```

- [ ] **Step 3: Esegui** `npm test -w server -- app-invitations-accept` → FAIL.

- [ ] **Step 4: Implementa** in `server/src/app-invitations/router.ts` (importa `withDb` da `../db.ts`, `publicContext` da `../pipeline.ts`, `createInvitedAccount` da `../accounts/index.ts`, `appError` da `../errors.ts`):

```ts
		get: os.appInvitations.get.handler(async ({ context, input }) => {
			const { tx } = publicContext(context);
			const [row] = await tx<{ invited_by_name: string | null; roles: string[] }[]>`
				select invited_by_name, roles from app.app_invitation_by_token(${await hashToken(input.token)})`;
			if (!row) throw appError('invitation_unavailable');
			return { invitedBy: row.invited_by_name, roles: row.roles as ('recipe_curator' | 'app_admin')[] };
		}),

		// accept: see below.
```

La pipeline tiene aperta la transazione `anon` per tutto il gestore: la prenotazione deve essere confermata prima della chiamata ad Auth (altrimenti un errore di Auth la annulla e un tentativo concorrente prenota un altro id). Quindi `accept` **non** usa `ctx.tx` per i passi 2–4: fa la prenotazione con una transazione propria e confermata, poi la chiamata ad Auth, poi la chiusura con un'altra transazione. Forma finale del gestore:

```ts
		accept: os.appInvitations.accept.handler(async ({ context, input }) => {
			const ctx = publicContext(context);
			const hash = await hashToken(input.token);
			const anon = <T>(work: (tx: Tx) => Promise<T>) =>
				withDb(ctx.env.HYPERDRIVE.connectionString, { kind: 'anon' }, work).catch(mapInvitationError);
			const reserved = await anon(async (tx) => {
				const [row] = await tx<{ user_id: string; email: string }[]>`
					select user_id, email from app.claim_app_invitation(${hash}, ${input.email})`;
				return row!;
			});
			const outcome = await createInvitedAccount(ctx.env, {
				id: reserved.user_id,
				email: reserved.email,
				password: input.password,
				displayName: input.displayName,
				locale: input.locale,
			});
			if (outcome.status === 'email_taken') throw appError('not_allowed', { reason: 'account_exists' });
			await anon((tx) => tx`select app.complete_app_invitation(${hash}, ${reserved.user_id}::uuid)`);
			return { email: reserved.email };
		}),
```

La transazione della pipeline (`ctx.tx`) resta inutilizzata in `accept`: è accettabile (una connessione in più per la durata della richiesta). Il doppio invio concorrente: `claim` blocca la riga (`for update`), il secondo invio aspetta, trova la stessa prenotazione, chiama Auth (che risponde `email_exists`, poi `GET` e `PUT` con lo stesso id) e la chiusura ripetuta è un no-op: entrambi riescono, un solo account. Se invece il primo ha già chiuso, il secondo riceve `invitation_unavailable`. Il test «two submissions at once» ammette entrambi gli esiti.

- [ ] **Step 5: Esegui** `npm test -w server && npm run typecheck -w server` → PASS.

- [ ] **Step 6: Commit**

```bash
git add server
git commit -m "W9: lettura pubblica dell'invito e accettazione che crea l'account"
```

---

### Task 7: `family.create`

**Files:**
- Modify: `contract/src/family/index.ts`, `server/src/family/router.ts`
- Test: `server/test/family-create.test.ts`, `contract/src/family/family-contract.test.ts`

**Interfaces:**
- Consumes: `app.create_family` (Task 2); `profileView(tx, locale)` di `server/src/profile/views.ts`; `profileViewSchema`, `measurementSystemSchema` del contratto del profilo.
- Produces: `family.create({ id, name, measurementSystem, timeZone? }) → ProfileView`; `resolveTimeZone(value: string | undefined): string` in `server/src/family/time-zone.ts`.

- [ ] **Step 1: Test che falliscono.** `server/test/family-create.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorOf, setupActors, type Actors } from './support/actors.ts';
import { hasDatabase } from './support/db.ts';
import { mcp, toolBody } from './support/requests.ts';

describe.skipIf(!hasDatabase)('family.create', () => {
	let actors: Actors;
	beforeAll(async () => {
		actors = await setupActors();
	});
	afterAll(() => actors?.close());

	it('creates the family with the creator as admin and shows it', async () => {
		const giulia = await actors.user();
		const id = crypto.randomUUID();
		const view = await giulia.client.family.create({ id, name: ' Casa Giulia ', measurementSystem: 'metric', timeZone: 'Europe/London' });
		expect(view.currentFamilyId).toBe(id);
		expect(view.families).toEqual([{ id, name: 'Casa Giulia', role: 'family_admin', timeZone: 'Europe/London', measurementSystem: 'metric' }]);
		expect((await giulia.client.family.create({ id, name: 'Casa Giulia', measurementSystem: 'metric' })).families).toHaveLength(1);
	});

	it('falls back to Europe/Rome for a missing or invalid time zone', async () => {
		const ugo = await actors.user();
		for (const timeZone of [undefined, 'Etc/Unknown', 'Mars/Base']) {
			const id = crypto.randomUUID();
			const view = await ugo.client.family.create({ id, name: 'X', measurementSystem: 'metric', ...(timeZone ? { timeZone } : {}) });
			expect(view.families.find((f) => f.id === id)?.timeZone, String(timeZone)).toBe('Europe/Rome');
		}
	});

	it('refuses an id of someone else\'s family', async () => {
		const owner = await actors.user();
		const id = crypto.randomUUID();
		await owner.client.family.create({ id, name: 'Mia', measurementSystem: 'metric' });
		const other = await actors.user();
		expect((await errorOf(other.client.family.create({ id, name: 'Mia', measurementSystem: 'metric' }))).code).toBe('invalid');
	});

	it('the first menu read generates the week', async () => {
		const piero = await actors.user();
		const id = crypto.randomUUID();
		await piero.client.family.create({ id, name: 'Piero', measurementSystem: 'metric', timeZone: 'Europe/Rome' });
		await piero.client.menu.getOpening({ familyId: id });
		expect((await actors.db.admin`select count(*)::int as n from app.weeks where family_id = ${id}`)[0]!.n).toBeGreaterThan(0);
	});

	it('is an MCP tool that takes the agent time zone', async () => {
		const agent = await actors.user({ agent: true });
		const id = crypto.randomUUID();
		const result = await mcp(actors.app, actors.env, agent.token, 'tools/call', {
			name: 'family_create', arguments: { id, name: 'Agente', measurementSystem: 'uk_imperial', timeZone: 'Europe/Dublin' },
		});
		expect(toolBody(result).families[0]).toMatchObject({ id, timeZone: 'Europe/Dublin', measurementSystem: 'uk_imperial' });
	});
});
```

(Controlla la firma esatta di `menu.getOpening` nel contratto; se l'input porta anche `knownVersion` o una data, adegua la chiamata.)

- [ ] **Step 2: Esegui** `npm test -w server -- family-create` → FAIL.

- [ ] **Step 3: Implementa.** Nel contratto (`contract/src/family/index.ts`, importa `profileViewSchema` da `../profile/index.ts`):

```ts
	create: op({ mcp: { readOnly: false }, offline: false, role: 'user', creates: true })
		.route({
			method: 'POST',
			path: '/families',
			summary:
				'Create a family you will administer: name, metric or UK imperial units and an IANA time zone (default Europe/Rome). The menu is prepared at the first menu read. Returns your profile with the new family shown',
		})
		.input(z.object({ id: z.uuid(), name: z.string().trim().min(1).max(60), measurementSystem: measurementSystemSchema, timeZone: z.string().max(64).optional() }))
		.output(profileViewSchema),
```

`server/src/family/time-zone.ts`:

```ts
/** IANA zone accepted by the runtime, otherwise Europe/Rome (spec section 2). */
export function resolveTimeZone(value: string | undefined): string {
	if (!value) return 'Europe/Rome';
	try {
		return new Intl.DateTimeFormat('en-GB', { timeZone: value }).resolvedOptions().timeZone;
	} catch {
		return 'Europe/Rome';
	}
}
```

con test `server/src/family/time-zone.test.ts` (`'Europe/London'` → se stesso; `'Mars/Base'`, `''`, `undefined` → `'Europe/Rome'`). Se il trigger del database rifiuta un fuso che `Intl` accetta (per esempio un alias), il gestore riprova con `Europe/Rome`: cattura `22023` solo su questo campo.

In `server/src/family/router.ts`:

```ts
		create: os.family.create.handler(async ({ context, input }) => {
			try {
				await context.tx`select app.create_family(${input.id}::uuid, ${input.name}, ${input.measurementSystem}, ${resolveTimeZone(input.timeZone)})`;
			} catch (error) {
				if ((error as { code?: string }).code === 'P0A05') throw appError('invalid', { issues: [{ path: ['id'], code: 'in_use' }] });
				throw error;
			}
			return profileView(context.tx, context.locale);
		}),
```

- [ ] **Step 4: Esegui** `npm test -w contract && npm test -w server && npm run typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add contract server
git commit -m "W9: creazione della famiglia da parte di chi la amministrerà, anche via MCP"
```

---

### Task 8: Prova sullo stack locale con Auth vera

**Files:**
- Create: `scripts/invitations/invite-stack.sh`, `server/test/stack/invitations.stack.test.ts`
- Modify: `.github/workflows/ci.yml`, `server/vitest.config.ts` (escludere `*.stack.test.ts` dal giro normale, se non già escluso)
- In attesa del via del coordinatore: `supabase/config.toml`, `web/src/test/stack.ts`, `scripts/oauth/agents-e2e.mjs`

**Interfaces:**
- Consumes: Worker completo (Task 3–7).

- [ ] **Step 1: Decisione sulle iscrizioni in locale.** Prima di questo task chiedi al coordinatore (`STATO: DOMANDA`) se spegnere le iscrizioni anche nello stack locale (spec §4). Con il via: `supabase/config.toml` `[auth] enable_signup = false` e `[auth.email] enable_signup = false`; in `web/src/test/stack.ts` e `scripts/oauth/agents-e2e.mjs` sostituisci `POST /signup` con `POST /auth/v1/admin/users` (`apikey` = `SECRET_KEY` di `supabase status -o env`, `email_confirm: true`), poi `POST /auth/v1/token?grant_type=password` per la sessione. Senza il via: `invite-stack.sh` avvia un secondo stack con `supabase start --workdir "$TMP"` su una copia di `supabase/` con le iscrizioni spente e porte spostate (`[api] port`, `[db] port`, `[studio] port`, `[inbucket] port` +100), e lo ferma alla fine.

- [ ] **Step 2: Test dello stack** (`server/test/stack/invitations.stack.test.ts`), eseguito solo con `STACK_SUPABASE_URL`, `STACK_SUPABASE_SECRET_KEY`, `STACK_SUPABASE_PUBLISHABLE_KEY`, `STACK_DB_URL`:

```ts
import { describe, expect, it } from 'vitest';
import { createInvitedAccount } from '../../src/accounts/index.ts';

const env = process.env;
const url = env.STACK_SUPABASE_URL;
describe.skipIf(!url)('invitations against the local stack', () => {
	it('sign-ups are off', async () => {
		const settings = await (await fetch(`${url}/auth/v1/settings`, { headers: { apikey: env.STACK_SUPABASE_PUBLISHABLE_KEY! } })).json();
		expect(settings.disable_signup).toBe(true);
	});

	it('creates a confirmed account with the admin API, then signs in with the password', async () => {
		const id = crypto.randomUUID();
		const email = `stack-${id.slice(0, 8)}@x.it`;
		const account = { id, email, password: 'segreta123', displayName: 'Stack', locale: 'it-IT' as const };
		const keys = { SUPABASE_URL: url!, SUPABASE_SECRET_KEY: env.STACK_SUPABASE_SECRET_KEY! };
		expect(await createInvitedAccount(keys, account)).toEqual({ status: 'created' });
		expect(await createInvitedAccount(keys, { ...account, password: 'nuovapass1' })).toEqual({ status: 'existing' });
		const session = await fetch(`${url}/auth/v1/token?grant_type=password`, {
			method: 'POST',
			headers: { apikey: env.STACK_SUPABASE_PUBLISHABLE_KEY!, 'content-type': 'application/json' },
			body: JSON.stringify({ email, password: 'nuovapass1' }),
		});
		expect(session.status).toBe(200);
		expect((await session.json()).user.id).toBe(id);
	});

	it('the Data API does not reach the app schema', async () => {
		const response = await fetch(`${url}/rest/v1/rpc/app_invitation_by_token`, {
			method: 'POST',
			headers: { apikey: env.STACK_SUPABASE_PUBLISHABLE_KEY!, 'content-type': 'application/json', 'content-profile': 'app' },
			body: JSON.stringify({ p_token_hash: '\\x00' }),
		});
		expect(response.status).toBe(406);
		expect((await response.json()).code).toBe('PGRST106');
	});
});
```

(Il codice atteso dello schema non esposto è `PGRST106` con 406: verificalo sullo stack al primo giro e correggi l'asserzione se PostgREST risponde diversamente, sempre senza raggiungere la funzione.)

- [ ] **Step 3: Script** `scripts/invitations/invite-stack.sh` sul modello di `scripts/password/password-stack.sh`: legge `API_URL`, `DB_URL`, `PUBLISHABLE_KEY`, `SECRET_KEY` da `supabase status -o env` (verifica il nome della variabile con `supabase status -o env | cut -d= -f1`), esporta le `STACK_*` ed esegue `npm test -w server -- test/stack/invitations.stack.test.ts`. Nessun valore stampato.

- [ ] **Step 4: CI.** In `.github/workflows/ci.yml` aggiungi dopo il passo della password: `- name: Invitations against the local stack` con `run: scripts/invitations/invite-stack.sh`.

- [ ] **Step 5: Esegui** in locale `supabase start && scripts/invitations/invite-stack.sh` → PASS. Esegui anche `scripts/password/password-stack.sh` e `scripts/oauth/agents-e2e.sh` se sono stati toccati.

- [ ] **Step 6: Commit**

```bash
git add scripts/invitations server/test/stack .github/workflows/ci.yml supabase/config.toml web/src/test/stack.ts scripts/oauth/agents-e2e.mjs
git commit -m "W9: prova degli inviti sullo stack locale con le iscrizioni spente"
```

---

### Task 9: Web: client, API finta, testi

**Files:**
- Modify: `web/src/api/types.ts` (`SERVER_AREAS` con `'appInvitations'`), `web/src/api/clients.ts`, `web/src/api/fake/fakeApi.ts`
- Create: `web/src/api/fake/fakeAppInvitations.ts`, `web/src/features/app-invitations/client.ts`
- Create: `web/src/i18n/messages/invitations.ts`, `web/src/i18n/messages/admin.ts`, `web/src/i18n/messages/onboarding.ts`; Modify: `web/src/i18n/messages/index.ts`
- Test: `web/src/api/fake/fakeAppInvitations.test.ts`

**Interfaces:**
- Produces:
  - `Api.appInvitations` (create/list/revoke; get/accept non usati dalla sessione) e `Api.family.create`;
  - `invitationClient: { get(input: { token: string }): Promise<{ invitedBy: string | null; roles: GlobalRole[] }>; accept(input: AcceptInput): Promise<{ email: string }> }` e `setInvitationClient(client)` per i test, in `features/app-invitations/client.ts`;
  - fake: `createFakeAppInvitations(latencyMs?)`, con token demo `FAKE_INVITE_TOKEN = 'demo'.padEnd(43, 'x')` valido.

- [ ] **Step 1: Test che falliscono** (`fakeAppInvitations.test.ts`): `create` restituisce un link con `#`, `list` lo mostra `pending`, `revoke` lo segna `revoked`, `get(FAKE_INVITE_TOKEN)` dà `invitedBy: 'Federico'`, un token sconosciuto rifiuta con `new ApiError('invitation_unavailable')`; `family.create` della finta aggiunge la famiglia al profilo e la rende corrente.

- [ ] **Step 2: Esegui** `npm test -w web -- fakeAppInvitations` → FAIL.

- [ ] **Step 3: Implementa.** `features/app-invitations/client.ts`:

```ts
import { createRpcClient } from '../../api/rpc';
import { env } from '../../env';
import { createFakeAppInvitations } from '../../api/fake/fakeAppInvitations';

type Public = Pick<ReturnType<typeof createFakeAppInvitations>, 'get' | 'accept'>;

/** The link's operations, without a session (spec W9): no token is ever sent. */
function defaultClient(): Public {
	if (!env.supabase) return createFakeAppInvitations(150);
	return createRpcClient({ getCredentials: async () => null }).appInvitations;
}

export let invitationClient: Public = defaultClient();
/** Tests replace it, like `leavePage` in the agents' feature. */
export function setInvitationClient(client: Public): void {
	invitationClient = client;
}
```

(Controlla come `web/src/env.ts` espone la configurazione di Supabase e usa lo stesso nome.)

Testi (`invitations.ts`, `admin.ts`, `onboarding.ts`): tutte le chiavi delle pagine dei Task 10–12, con i testi italiani della spec §3 senza genere e quelli inglesi corrispondenti, per esempio:

```ts
export const it = {
  'invite.title': 'Hai un invito per Cosa si mangia?',
  'invite.from': 'Te l’ha mandato {name}',
  'invite.fromUnknown': 'Hai ricevuto un link d’invito',
  'invite.roles': 'Con questo invito diventi anche: {roles}',
  'invite.email': 'Email', 'invite.emailHelp': 'Quella a cui è arrivato l’invito',
  'invite.name': 'Nome', 'invite.nameHelp': 'Come ti vedranno in famiglia',
  'invite.password': 'Password', 'invite.passwordAgain': 'Ripeti la password',
  'invite.submit': 'Crea l’account',
  'invite.otherAccount': 'Hai aperto l’app come {name}. Per usare questo invito esci e torna qui.',
  'invite.signOut': 'Esci e continua',
  'invite.unavailable': 'Questo invito non vale più',
  'invite.askNew': 'Chiedi un link nuovo a chi ti ha invitato.',
  'invite.wrongEmail': 'Non è l’email di questo invito',
  'invite.accountExists': 'Esiste già un account con questa email: entra dalla pagina di accesso.',
  'invite.passwordShort': 'Almeno 8 caratteri',
  'invite.passwordLong': 'Password troppo lunga: al massimo 72 byte, e lettere accentate ed emoji ne usano più di uno',
  'invite.passwordMismatch': 'Le due password non coincidono',
  'invite.signInFailed': 'L’account è pronto, ma non è stato possibile entrare.',
  'invite.toLogin': 'Vai all’accesso',
  'invite.rolesGranted': 'Ora sei anche {roles}',
  'role.recipe_curator': 'curatore del ricettario', 'role.app_admin': 'amministratore dell’app'
} as const;
```

e `en` con le stesse chiavi («You have an invitation to Cosa si mangia?», «Sent by {name}», …, «Sign out and continue», «This invitation is no longer valid», «Ask whoever invited you for a new link.», «Password too long: at most 72 bytes, and accented letters and emoji use more than one», …). Registra i tre file in `messages/index.ts` (in `it` ed `en`).

In `fakeApi.ts` aggiungi `appInvitations: createFakeAppInvitations(options.latencyMs)` e `family.create` che aggiunge una famiglia allo stato finto (con il nome, `role: 'family_admin'`, il fuso e il sistema dati) e restituisce `profileView()`. In `clients.ts` (`realClients`) l'area arriva dal client RPC come le altre, aggiungendo `'appInvitations'` a `SERVER_AREAS`.

- [ ] **Step 4: Esegui** `npm test -w web && npm run typecheck -w web` → PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src
git commit -m "W9: client degli inviti, API finta e testi delle pagine nuove"
```

---

### Task 10: Web: pagina dell'invito `/invite/app`

**Files:**
- Create: `web/src/features/app-invitations/InvitePage.tsx`, `InvitePage.module.css`, `InvitePage.test.tsx`
- Modify: `web/src/router.tsx`, `web/src/routes/search.ts` (`LoginSearch.email`), `web/src/auth/LoginPage.tsx` (email iniziale), `web/public/_headers` (crea se manca)

**Interfaces:**
- Consumes: `invitationClient`, `setInvitationClient` (Task 9); `useAuth()` (`backend.signIn(email, password)` → `{ ok: true } | { ok: false; failure }`, controlla la forma in `auth/backend.ts`); `useSignOut()` e `useSession()` di `session/SessionScope.tsx` (possono essere assenti senza sessione: usa le varianti che restituiscono `null`, come `AuthorizePage`).
- Produces: rotta `/invite/app`; `LoginSearch = { redirect?: string; email?: string }`.

- [ ] **Step 1: Test che falliscono** (`InvitePage.test.tsx`, con `renderApp` e uno stub del client):

```tsx
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/errors';
import { renderApp } from '../../test/renderApp';
import { createStubBackend } from '../../test/stubBackend';
import { setInvitationClient } from './client';

const TOKEN = 'a'.repeat(43);
const valid = (overrides = {}) => ({
  get: vi.fn(async () => ({ invitedBy: 'Federico', roles: [] })),
  accept: vi.fn(async ({ email }: { email: string }) => ({ email })),
  ...overrides
});

function fill(password = 'segreta123', again = password) {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'giulia@x.it' } });
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Giulia' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Ripeti la password'), { target: { value: again } });
  fireEvent.click(screen.getByRole('button', { name: 'Crea l’account' }));
}

describe('/invite/app', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows who invites and creates the account, then signs in and opens the wizard', async () => {
    const client = valid();
    setInvitationClient(client);
    const backend = createStubBackend(null);
    const signIn = vi.spyOn(backend, 'signIn');
    const { history } = renderApp(`/invite/app#${TOKEN}`, { backend });
    expect(await screen.findByRole('heading', { name: 'Hai un invito per Cosa si mangia?' })).toBeTruthy();
    expect(screen.getByText('Te l’ha mandato Federico')).toBeTruthy();
    fill();
    await waitFor(() => expect(client.accept).toHaveBeenCalledWith({ token: TOKEN, email: 'giulia@x.it', displayName: 'Giulia', password: 'segreta123', locale: 'it-IT' }));
    await waitFor(() => expect(signIn).toHaveBeenCalledWith('giulia@x.it', 'segreta123'));
    await waitFor(() => expect(history.location.pathname).toBe('/family/new'));
  });

  it('one message for every unusable link', async () => {
    setInvitationClient(valid({ get: vi.fn(async () => { throw new ApiError('invitation_unavailable'); }) }));
    renderApp(`/invite/app#${TOKEN}`, { backend: createStubBackend(null) });
    expect(await screen.findByRole('heading', { name: 'Questo invito non vale più' })).toBeTruthy();
    expect(screen.getByText('Chiedi un link nuovo a chi ti ha invitato.')).toBeTruthy();
  });

  it('checks the passwords before sending', async () => {
    const client = valid();
    setInvitationClient(client);
    renderApp(`/invite/app#${TOKEN}`, { backend: createStubBackend(null) });
    await screen.findByLabelText('Email');
    fill('segreta123', 'diversa123');
    expect(await screen.findByText('Le due password non coincidono')).toBeTruthy();
    fill('è'.repeat(37));
    expect(await screen.findByText(/Password troppo lunga/)).toBeTruthy();
    expect(client.accept).not.toHaveBeenCalled();
  });

  it('shows the wrong email on the field', async () => {
    setInvitationClient(valid({ accept: vi.fn(async () => { throw new ApiError('invalid', { issues: [{ path: ['email'], code: 'email_mismatch' }] }); }) }));
    renderApp(`/invite/app#${TOKEN}`, { backend: createStubBackend(null) });
    await screen.findByLabelText('Email');
    fill();
    expect(await screen.findByText('Non è l’email di questo invito')).toBeTruthy();
  });

  it('when sign-in fails after the creation, leads to the login page with the email', async () => {
    setInvitationClient(valid());
    const backend = createStubBackend(null);
    vi.spyOn(backend, 'signIn').mockResolvedValue({ ok: false, failure: 'network' } as never);
    const { history } = renderApp(`/invite/app#${TOKEN}`, { backend });
    await screen.findByLabelText('Email');
    fill();
    expect(await screen.findByText('L’account è pronto, ma non è stato possibile entrare.')).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'Vai all’accesso' }));
    await waitFor(() => expect(history.location.href).toBe('/login?email=giulia%40x.it'));
  });

  it('with another account open, signs out and keeps the link', async () => {
    setInvitationClient(valid());
    const { history } = renderApp(`/invite/app#${TOKEN}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Esci e continua' }));
    expect(await screen.findByLabelText('Email')).toBeTruthy();
    expect(history.location.hash).toBe(TOKEN);
  });

  it('after a reload of a used link, the page says it is no longer valid and offers sign-in', async () => {
    setInvitationClient(valid({ get: vi.fn(async () => { throw new ApiError('invitation_unavailable'); }) }));
    renderApp(`/invite/app#${TOKEN}`, { backend: createStubBackend(null) });
    expect(await screen.findByRole('link', { name: 'Vai all’accesso' })).toBeTruthy();
  });
});
```

(Adatta `createStubBackend(null)` alla firma reale di `test/stubBackend.ts` per un utente non collegato e la forma del fallimento di `signIn` a `auth/backend.ts`.)

- [ ] **Step 2: Esegui** `npm test -w web -- InvitePage` → FAIL.

- [ ] **Step 3: Implementa.** Rotta in `router.tsx` sulla radice:

```tsx
// App invitation (spec W9): public, the token in the fragment; signs out another account on request.
const appInviteRoute = createRoute({ getParentRoute: () => rootRoute, path: '/invite/app', component: InvitePage });
```

e aggiungila a `rootRoute.addChildren([...])`. `validateLoginSearch` aggiunge `email: typeof raw.email === 'string' && raw.email.length <= 320 ? raw.email : undefined`; `LoginPage` usa `useState(search.email ?? '')`.

`InvitePage.tsx` (struttura; stessi stili della pagina di accesso: `entry-title`, colonna da 420 px):

```tsx
export function InvitePage() {
  const t = useT();
  const locale = useLocale();
  const { state, backend } = useAuth();
  const signOut = useOptionalSignOut(); // null without a session
  const navigate = useNavigate();
  const online = useOnline();
  const token = useMemo(() => location.hash.slice(1), []);
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  // Phase: loading | form {invitedBy, roles} | unavailable | limited | signInFailed {email} | offline
  useEffect(() => { /* invitationClient.get({ token }) → form | unavailable (invitation_unavailable o token malformato) | limited (rate_limited) */ }, [token]);
  // render: OfflineBanner; header con LanguageSwitch; per phase:
  //  - form && state.status === 'signedIn': testo invite.otherAccount con il nome del profilo e pulsante «Esci e continua» → await signOut()
  //    (prima `navigate({ to: '/invite/app', hash: token, replace: true })`, come AuthorizePage fa con `switched`)
  //  - form: modulo controllato (Email type=email autoComplete=email autoCapitalize=none; Nome autoComplete=name; Password e Ripeti autoComplete=new-password)
  //    submit: controlli locali (8 caratteri, 72 byte con TextEncoder, uguaglianza) → invitationClient.accept({token, email, displayName, password, locale})
  //            → backend.signIn(result.email, password) → ok: navigate({ to: '/family/new', replace: true }) + avviso ruoli; ko: signInFailed
  //    errori: invalid con path email → errore sul campo; not_allowed/account_exists → messaggio con <Link to="/login" search={{ email }}>; altri → errorKey
  //  - unavailable / signInFailed: titolo, testo e <Link to="/login" search={signInFailed ? { email } : {}}>Vai all’accesso</Link>
}
```

Scrivi il componente completo seguendo questa struttura e i test; usa `trackBusy` come `LoginPage` durante l'invio, e disattiva il pulsante offline o durante l'invio. Se `useSignOut` lancia senza sessione, aggiungi in `SessionScope.tsx` un `useOptionalSignOut()` che legge il contesto e restituisce `null` (modifica minima a un file condiviso).

`web/public/_headers`:

```
/invite/*
  Referrer-Policy: no-referrer
```

(Se `web/public/` non esiste, verifica dove Vite prende i file statici e che il file finisca in `web/dist/_headers`.)

- [ ] **Step 4: Esegui** `npm test -w web && npm run typecheck -w web && npm run build -w web` → PASS; controlla che `web/dist/_headers` esista.

- [ ] **Step 5: Commit**

```bash
git add web
git commit -m "W9: pagina dell'invito all'app con creazione dell'account e ingresso"
```

---

### Task 11: Web: «Crea la tua famiglia», wizard e scheda di benvenuto

**Files:**
- Create: `web/src/features/family-new/NewFamilyPage.tsx`, `NewFamilyPage.test.tsx`, `WelcomeCard.tsx`, `WelcomeCard.test.tsx`, `ios.ts`, `ios.test.ts`
- Modify: `web/src/components/FamilyGate.tsx`, `web/src/router.tsx`, `web/src/routes/search.ts` (`MenuSearch.welcome`), `web/src/routes/MenuPage.tsx`, `web/src/i18n/messages/family.ts` (testi di `family.none`)

**Interfaces:**
- Consumes: `api.family.create` (Task 9), `useAreaMutation` di `api/mutations.ts`, `useProfile()`/`useFamily()` di `session/useFamily.ts`.
- Produces: rotta `/family/new`; `MenuSearch = { day?: string; welcome?: true }`; `needsHomeScreenHint(nav?: Navigator, matchMedia?: (q: string) => { matches: boolean }): boolean`.

- [ ] **Step 1: Test che falliscono.**

`ios.test.ts`:

```ts
import { expect, it } from 'vitest';
import { needsHomeScreenHint } from './ios';

const media = (standalone: boolean) => () => ({ matches: standalone });
it('only on iOS outside the installed app', () => {
  expect(needsHomeScreenHint({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', standalone: false } as never, media(false))).toBe(true);
  expect(needsHomeScreenHint({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', standalone: true } as never, media(true))).toBe(false);
  expect(needsHomeScreenHint({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 } as never, media(false))).toBe(true); // iPad
  expect(needsHomeScreenHint({ userAgent: 'Mozilla/5.0 (Linux; Android 14)' } as never, media(false))).toBe(false);
});
```

`NewFamilyPage.test.tsx`: con `renderApp('/family/new', { api })` e `vi.spyOn(api.family, 'create')`: compila il nome, sceglie «Misure britanniche», preme «Crea la famiglia» due volte → `create` chiamata con lo stesso `id` (UUID) entrambe le volte, `timeZone` uguale a `Intl.DateTimeFormat().resolvedOptions().timeZone`, `measurementSystem: 'uk_imperial'`; poi `history.location.href === '/menu?welcome=true'` (o la forma serializzata dal router: verifica con `validateMenuSearch`). Con `locale: 'en-GB'` il sistema preselezionato è `uk_imperial`. Pulsante disattivato con nome vuoto e offline (`setOnline(false)`).

`WelcomeCard.test.tsx`: `renderApp('/menu?welcome=true')` con il profilo finto `family_admin` → la scheda «Il primo menu è pronto» compare solo dopo il titolo del giorno del menu (settimana caricata); con `latencyMs` alto non c'è mentre il menu carica; «Chiudi» → `history.location.search` senza `welcome` e `history.length` invariata (navigazione `replace`); un membro non amministratore non la vede; la nota della schermata Home compare solo con `needsHomeScreenHint` vero (`vi.mock('./ios')`).

FamilyGate: in `components/FamilyGate.test.tsx` aggiungi: con `status: 'none'` compaiono «Non fai ancora parte di una famiglia» e il link «Crea la tua famiglia» verso `/family/new`.

- [ ] **Step 2: Esegui** `npm test -w web -- family-new FamilyGate` → FAIL.

- [ ] **Step 3: Implementa.**

`ios.ts`:

```ts
/** iOS (iPhone, iPad also when it says Macintosh) in Safari, not the installed app (spec W9). */
export function needsHomeScreenHint(nav: Navigator & { standalone?: boolean } = navigator, media: (query: string) => { matches: boolean } = (q) => matchMedia(q)): boolean {
  const ios = /iPhone|iPad|iPod/.test(nav.userAgent) || (/Macintosh/.test(nav.userAgent) && (nav.maxTouchPoints ?? 0) > 1);
  if (!ios) return false;
  return !(nav.standalone === true || media('(display-mode: standalone)').matches);
}
```

`FamilyGate.tsx`, ramo `none`:

```tsx
      {state.status === 'none' && (
        <StateNotice title={t('family.none.title')} body={t('family.none.body')}>
          <Link to="/family/new" className="text-button primary">{t('family.none.create')}</Link>
        </StateNotice>
      )}
```

(Se `StateNotice` non accetta figli, aggiungi una prop `action?: ReactNode` con una modifica minima.) Testi in `messages/family.ts`: `family.none.title` «Non fai ancora parte di una famiglia» / «You’re not in a family yet»; `family.none.body` «Creane una: il menu si prepara da solo.» / «Create one: the menu prepares itself.»; `family.none.create` «Crea la tua famiglia» / «Create your family».

`NewFamilyPage.tsx`: `PageHeader` (indietro al Profilo se `profile.families.length > 0`, altrimenti al Menu); `const id = useState(() => crypto.randomUUID())[0]`; nome (`maxLength={60}`), due radio per il sistema (default da `useLocale() === 'en-GB' ? 'uk_imperial' : 'metric'`), nota `onboarding.later`; invio con `useAreaMutation('family.create', …)` che chiama `api.family.create({ id, name, measurementSystem, timeZone })`, scrive la vista del profilo nella chiave del profilo (come `profile.setCurrentFamily` in `ProfilePage`) e poi `navigate({ to: '/menu', search: { welcome: true }, replace: true })`. Rotta in `router.tsx` sotto `appRoute`: `createRoute({ getParentRoute: () => appRoute, path: '/family/new', component: NewFamilyPage })`.

`routes/search.ts`: `validateMenuSearch` aggiunge `welcome: raw.welcome === true || raw.welcome === 'true' ? true : undefined`.

`WelcomeCard.tsx`, montata in `MenuPage` dentro il ramo con la settimana pronta, solo se `search.welcome && family.role === 'family_admin'`:

```tsx
export function WelcomeCard({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <section className="setup-card" aria-labelledby="welcome-title">
      <h2 id="welcome-title">{t('onboarding.ready')}</h2>
      <Link to="/profile/family/settings" className="text-button" onClick={onClose}>{t('onboarding.settings')}</Link>
      {needsHomeScreenHint() && <p className="meta-line">{t('onboarding.homeScreen')}</p>}
      <button type="button" className="icon-button" aria-label={t('common.close')} onClick={onClose}><Icon name="close" /></button>
    </section>
  );
}
```

con `onClose = () => navigate({ search: (s) => ({ ...s, welcome: undefined }), replace: true })`. Lo stile riusa quello della scheda del prototipo (`prototype/src/lib/components/SetupCard.svelte`) con i token di `design/`; nessun componente nuovo oltre a questa scheda prevista dal quarto giro. Testi: `onboarding.ready` «Il primo menu è pronto» / «Your first menu is ready»; `onboarding.settings` «Sistema le impostazioni» / «Adjust the settings»; `onboarding.homeScreen` «Per usarla dalla schermata Home: Condividi › Aggiungi alla schermata Home, poi entra con email e password.» / «To use it from your Home Screen: Share › Add to Home Screen, then sign in with email and password.»

- [ ] **Step 4: Esegui** `npm test -w web && npm run typecheck -w web` → PASS.

- [ ] **Step 5: Commit**

```bash
git add web
git commit -m "W9: creazione della famiglia dal web e scheda di benvenuto nel menu"
```

---

### Task 12: Web: Profilo e `/admin` con gli inviti all'app

**Files:**
- Create: `web/src/features/admin/AdminPage.tsx`, `AdminPage.module.css`, `AdminPage.test.tsx`, `InvitationsSection.tsx`, `InviteSheet.tsx`, `access.ts`, `api.ts`
- Modify: `web/src/routes/ProfilePage.tsx`, `web/src/routes/ProfilePage.test.tsx`, `web/src/router.tsx`

**Interfaces:**
- Consumes: `api.appInvitations.create/list/revoke` (Task 9), `CopyField` da `features/agents/CopyField.tsx` (importato così com'è), `BottomSheet`, `useAreaMutation`.
- Produces: `hasAppAdmin(profile: ProfileView | undefined): boolean`; `appInvitationsQuery(deps)` con chiave `['appInvitations', 'list', {}]`; rotta `/admin`; `AdminPage` che rende le sezioni in sequenza (B aggiunge «Utenti» sopra).

- [ ] **Step 1: Test che falliscono.**

`ProfilePage.test.tsx`: «Crea un'altra famiglia» porta a `/family/new`; «Amministrazione dell'app» visibile solo con `globalRoles` che contiene `app_admin` (profilo finto modificato con un'API finta personalizzata), assente altrimenti.

`AdminPage.test.tsx`:

```tsx
it('creates an invitation, shows the link once with copy, and lists it', async () => {
  const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0, globalRoles: ['app_admin'] });
  const create = vi.spyOn(api.appInvitations, 'create');
  renderApp('/admin', { api });
  fireEvent.click(await screen.findByRole('button', { name: 'Nuovo invito' }));
  const sheet = await screen.findByRole('dialog', { name: 'Nuovo invito' });
  fireEvent.change(within(sheet).getByLabelText('Email'), { target: { value: 'nuova@x.it' } });
  fireEvent.click(within(sheet).getByLabelText('Curatore del ricettario'));
  fireEvent.click(within(sheet).getByRole('button', { name: 'Crea il link' }));
  await waitFor(() => expect(create).toHaveBeenCalledWith({ id: expect.any(String), email: 'nuova@x.it', roles: ['recipe_curator'] }));
  expect(await within(sheet).findByText(/\/invite\/app#/)).toBeTruthy();
  expect(within(sheet).getByText('Il link si vede solo ora: se lo perdi, crea un nuovo link.')).toBeTruthy();
  fireEvent.click(within(sheet).getByRole('button', { name: 'Chiudi' }));
  const row = (await screen.findByText('nuova@x.it')).closest('li')!;
  expect(within(row).getByText('curatore del ricettario')).toBeTruthy();
  expect(within(row).queryByText(/invite\/app#/)).toBeNull();
});

const adminApi = () => createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0, globalRoles: ['app_admin'] });

it('«Nuovo link» recreates the invitation with the same email and roles', async () => {
  const api = adminApi();
  const first = await api.appInvitations.create({ id: crypto.randomUUID(), email: 'zia@x.it', roles: ['app_admin'] });
  const create = vi.spyOn(api.appInvitations, 'create');
  renderApp('/admin', { api });
  const row = (await screen.findByText('zia@x.it')).closest('li')!;
  fireEvent.click(within(row).getByRole('button', { name: 'Nuovo link' }));
  await waitFor(() => expect(create).toHaveBeenCalledWith({ id: expect.any(String), email: 'zia@x.it', roles: ['app_admin'] }));
  expect(create.mock.calls[0]![0].id).not.toBe(first.invitation.id);
  const sheet = await screen.findByRole('dialog', { name: 'Nuovo invito' });
  expect(await within(sheet).findByText(/\/invite\/app#/)).toBeTruthy();
});

it('revokes after confirmation', async () => {
  const api = adminApi();
  const { invitation } = await api.appInvitations.create({ id: crypto.randomUUID(), email: 'via@x.it', roles: [] });
  const revoke = vi.spyOn(api.appInvitations, 'revoke');
  renderApp('/admin', { api });
  const row = (await screen.findByText('via@x.it')).closest('li')!;
  fireEvent.click(within(row).getByRole('button', { name: 'Revoca' }));
  const confirm = await screen.findByRole('dialog', { name: 'Revocare l’invito?' });
  fireEvent.click(within(confirm).getByRole('button', { name: 'Revoca' }));
  await waitFor(() => expect(revoke).toHaveBeenCalledWith({ id: invitation.id }));
  expect(await within((await screen.findByText('via@x.it')).closest('li')!).findByText(/^Revocato il /)).toBeTruthy();
});

it('says when the email already has an account', async () => {
  const api = adminApi();
  vi.spyOn(api.appInvitations, 'create').mockRejectedValue(new ApiError('not_allowed', { reason: 'account_exists' }));
  renderApp('/admin', { api });
  fireEvent.click(await screen.findByRole('button', { name: 'Nuovo invito' }));
  const sheet = await screen.findByRole('dialog', { name: 'Nuovo invito' });
  fireEvent.change(within(sheet).getByLabelText('Email'), { target: { value: 'gia@x.it' } });
  fireEvent.click(within(sheet).getByRole('button', { name: 'Crea il link' }));
  expect(await within(sheet).findByText('Questa email ha già un account')).toBeTruthy();
});

it('is closed to people without app_admin', async () => {
  const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
  const list = vi.spyOn(api.appInvitations, 'list');
  renderApp('/admin', { api });
  expect(await screen.findByText('Non hai accesso a questa pagina')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Profilo' })).toBeTruthy();
  expect(list).not.toHaveBeenCalled();
});

it('disables the commands offline', async () => {
  setOnline(false);
  renderApp('/admin', { api: adminApi() });
  expect((await screen.findByRole('button', { name: 'Nuovo invito' }) as HTMLButtonElement).disabled).toBe(true);
  setOnline(true);
});
```

Import in testa al file: `fireEvent, screen, waitFor, within` da `@testing-library/react`, `vi, it, expect` da `vitest`, `ApiError` da `../../api/errors`, `createFakeApi` da `../../api/fake/fakeApi`, `setOnline` da `../../test/connectivity`, `renderApp` da `../../test/renderApp`. Il link «Profilo» del test di accesso negato è quello della pagina (non della barra in basso): se il nome è ambiguo, usa `getAllByRole(...)[0]` sul link dentro `main`.

- [ ] **Step 2: Esegui** `npm test -w web -- AdminPage ProfilePage` → FAIL.

- [ ] **Step 3: Implementa.**

`access.ts`:

```ts
import type { ProfileView } from '@app/contract';
/** The web check of /admin (spec W9, interface for B); the server checks the role again. */
export const hasAppAdmin = (profile: ProfileView | undefined) => profile?.user.globalRoles.includes('app_admin') ?? false;
```

`api.ts`:

```ts
export function appInvitationsQuery({ api }: QueryDeps) {
  return queryOptions({ queryKey: ['appInvitations', 'list', {}] as const, queryFn: () => api.appInvitations.list({}) });
}
```

`AdminPage.tsx`: `PageHeader` con indietro al Profilo e titolo «Amministrazione dell'app»; senza `hasAppAdmin(profile)` mostra `StateNotice` «Non hai accesso a questa pagina» con il link al Profilo e non monta la sezione; altrimenti `<InvitationsSection />` (B aggiungerà la sua sezione prima).

`InvitationsSection.tsx`: titolo «Inviti all'app», pulsante «Nuovo invito» (apre `InviteSheet` vuoto), elenco da `appInvitationsQuery`: per ogni invito email, ruoli come etichette (`role.*` o «nessun ruolo»), riga di stato (`admin.expires`, `admin.expired`, `admin.acceptedBy`, `admin.revokedOn` con data in `Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' })`) e autore; «Nuovo link» per `pending`/`expired` apre `InviteSheet` precompilato e lo invia subito con un id nuovo; «Revoca» per `pending` apre la conferma (`BottomSheet` con `admin.revokeConfirm` e pulsante rosso). Le mutazioni (`useAreaMutation('appInvitations.create' | 'appInvitations.revoke', …)`) a risposta arrivata invalidano `['appInvitations']`; nessun aggiornamento ottimistico. Comandi disattivati con `!online`.

`InviteSheet.tsx`: `BottomSheet` «Nuovo invito»; fase modulo (Email, due caselle, «Crea il link»; id generato all'apertura del foglio, così un doppio tocco non crea due inviti); fase link (`CopyField value={url} label={t('admin.link')}`, «Condividi» se `navigator.share` esiste, nota `admin.linkOnce`); errori `not_allowed/account_exists` → `admin.accountExists`, altri con `errorKey`.

`ProfilePage.tsx`: nella sezione delle famiglie un `Link to="/family/new"` «Crea un'altra famiglia»; nella sezione Account, se `hasAppAdmin(profile)`, un `Link to="/admin"` «Amministrazione dell'app» con lo stesso stile delle altre righe (come «Collega un agente»). Rotta `/admin` sotto `appRoute` in `router.tsx`. Verifica che la barra in basso marchi Profilo attivo su `/admin` (in `BottomNav.tsx`, se l'attivo si calcola dal prefisso, aggiungi `/admin` a Profilo).

Testi in `admin.ts` (it/en): `admin.title` «Amministrazione dell’app» / «App administration»; `admin.invitations` «Inviti all’app» / «App invitations»; `admin.new` «Nuovo invito» / «New invitation»; `admin.curator` «Curatore del ricettario» / «Recipe curator»; `admin.appAdmin` «Amministratore dell’app» / «App administrator»; `admin.create` «Crea il link» / «Create the link»; `admin.linkOnce` «Il link si vede solo ora: se lo perdi, crea un nuovo link.» / «You can only see the link now: if you lose it, create a new link.»; `admin.newLink` «Nuovo link» / «New link»; `admin.revoke` «Revoca» / «Revoke»; `admin.revokeConfirm` «Revocare l’invito?» / «Revoke the invitation?»; `admin.noRoles` «nessun ruolo» / «no roles»; `admin.expires` «Scade il {date}» / «Expires on {date}»; `admin.expired` «Scaduto il {date}» / «Expired on {date}»; `admin.acceptedBy` «Accettato da {name} il {date}» / «Accepted by {name} on {date}»; `admin.revokedOn` «Revocato il {date}» / «Revoked on {date}»; `admin.accountExists` «Questa email ha già un account» / «This email already has an account»; `admin.noAccess` «Non hai accesso a questa pagina» / «You don’t have access to this page»; `admin.share` «Condividi» / «Share»; `admin.link` «Link d’invito» / «Invitation link»; `profile.newFamily` «Crea un’altra famiglia» / «Create another family»; `profile.admin` «Amministrazione dell’app» / «App administration».

- [ ] **Step 4: Esegui** `npm test -w web && npm run typecheck -w web` → PASS.

- [ ] **Step 5: Commit**

```bash
git add web
git commit -m "W9: pagina di amministrazione con gli inviti all'app e voci del Profilo"
```

---

### Task 13: Verifica completa e prova dell'interfaccia

**Files:**
- Modify (se servono correzioni): file dei task precedenti
- Modify: `progetto/superpowers/specs/2026-10-13-inviti-app.md` (sezione «Da provare a mano sull'iPhone» aggiornata con ciò che la prova automatica non copre)

- [ ] **Step 1: Suite completa.** `supabase db reset && supabase test db && npm run typecheck && npm test && npm run build -w web` con `TEST_DATABASE_URL` impostato. Tutto verde; annota il numero di test pgTAP.

- [ ] **Step 2: Stack.** `scripts/invitations/invite-stack.sh`, `scripts/password/password-stack.sh`, `scripts/oauth/agents-e2e.sh` → PASS.

- [ ] **Step 3: Prova con agent-browser** (skill `agent-browser`) su `wrangler dev` collegato allo stack locale (`server/.env` con `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` locali, come `agents-e2e.sh`), a 1280 px e a 390 px:
  1. entra come utente `app_admin` dello stack, apri Profilo › Amministrazione dell'app, crea un invito con il ruolo di curatore, copia il link;
  2. esci, apri il link: titolo, chi invita, ruolo; invia con un'email diversa (errore sul campo), poi con quella giusta;
  3. arrivi al wizard: crea la famiglia; il Menu genera la settimana e mostra la scheda; chiudila; il tasto indietro non la ripropone;
  4. Profilo: la famiglia nuova è corrente, «Crea un'altra famiglia» c'è, «Amministrazione dell'app» no (ruolo di curatore soltanto);
  5. riapri il link usato: «Questo invito non vale più»;
  6. `curl -sI http://127.0.0.1:8787/invite/app` mostra `Referrer-Policy: no-referrer`.
  Screenshot di ogni passo nella cartella temporanea della sessione; nessuno screenshot nel repository.

- [ ] **Step 4: Log.** Durante la prova controlla l'uscita di `wrangler dev`: nessuna riga contiene il token, la password o l'email.

- [ ] **Step 5: Commit** delle eventuali correzioni e della spec aggiornata:

```bash
git add -A
git commit -m "W9: verifica completa e note per la prova sull'iPhone"
```

Poi, come da protocollo: push del branch, PR verso `main` con `gh pr create` (descrizione in italiano: cosa fa, come è stato verificato, sezioni della specifica realizzate, passi di rilascio della spec §5), `STATO: PR_APERTA <url>`.
