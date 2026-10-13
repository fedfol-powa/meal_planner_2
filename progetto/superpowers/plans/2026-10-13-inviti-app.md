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
- Operazioni `public`: `mcp: false`, `rateLimit` obbligatorio, nessuna lettura del token, nessuna transazione aperta dalla pipeline; nessuna connessione occupata durante le chiamate ad Auth.
- Il server non riscrive mai credenziali o metadati di un account esistente: niente `PUT` sull'API di amministrazione.
- Valori dal e verso Postgres con `fetch_types: false`: ruoli come `jsonb`, impronta del token come esadecimale con `decode(…, 'hex')`.
- Nessun aggiornamento ottimistico nelle mutazioni web (interfacce decise).
- Comandi: `npm test -w contract`, `npm test -w server` (con `TEST_DATABASE_URL`), `npm test -w web`, `supabase test db`, `npm run typecheck`.
- Stack locale: `supabase start` (Podman, vedi memoria del progetto per il workaround), database per i test `TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

## Review Focus

- Doppio invio del modulo dell'invito (doppio tocco o rete lenta), anche con password diverse: un solo account, credenziali del primo tentativo, la seconda richiesta riesce senza effetti o riceve `invitation_unavailable` → test con barriere in Task 6 e contro Auth reale in Task 8.
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
- Modify: `server/src/permissions.ts` (caso `public`, perché il typecheck resti verde)
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

`server/src/permissions.ts`: con `public` in `Role` lo `switch` di `checkRole` non assegna più `rows` in ogni ramo. Aggiungi il caso esplicito (il test arriva nel Task 3):

```ts
		case 'public':
			// Public operations leave the pipeline before the role check: reaching it is a bug.
			throw new Error('public operation reached the signed-in role check');
```

- [ ] **Step 4: Esegui** `npm test -w contract && npm run typecheck -w contract` → PASS. Poi `npm run typecheck` dalla radice: se il web traduce gli errori con una mappa esaustiva (`web/src/api/errors.ts`, `web/src/i18n/messages/errors.ts`), aggiungi lì i due codici con i testi della spec (§3): `invitation_unavailable` «Questo invito non vale più. Chiedi un link nuovo a chi ti ha invitato.» / «This invitation is no longer valid. Ask whoever invited you for a new link.»; `rate_limited` «Troppi tentativi. Riprova tra un minuto.» / «Too many attempts. Try again in a minute.»; e i testi MCP del server se `server/src/messages.ts` è esaustivo.

- [ ] **Step 5: Commit**

```bash
git add contract server/src/permissions.ts web/src/api/errors.ts web/src/i18n/messages/errors.ts server/src/messages.ts
git commit -m "W9: ruolo public, limiti e codici d'errore degli inviti nel contratto"
```

---

### Task 2: Migrazione `app_invitations`, funzioni e `create_family` con pgTAP

**Files:**
- Create: `supabase/migrations/20261013100000_app_invitations.sql`
- Create: `supabase/tests/app_invitations_test.sql`, `supabase/tests/create_family_test.sql`
- Modify: `supabase/tests/coverage_test.sql` (elenchi `anon` e `authenticated`)

**Interfaces:**
- Produces (SQL), firme e SQLSTATE usati dai task successivi:
  - `app.create_app_invitation(p_id uuid, p_token_hash bytea, p_email text, p_roles jsonb) returns app.app_invitations`
  - `app.revoke_app_invitation(p_id uuid) returns app.app_invitations`
  - `app.app_invitations_view() returns table(id uuid, email text, roles jsonb, status text, created_by uuid, created_by_name text, created_at timestamptz, expires_at timestamptz, accepted_by_name text, accepted_at timestamptz, revoked_at timestamptz)`
  - `app.app_invitation_by_token(p_token_hash bytea) returns table(invited_by_name text, roles jsonb)`
  - `app.claim_app_invitation(p_token_hash bytea, p_email text) returns table(user_id uuid, email text)`
  - `app.complete_app_invitation(p_token_hash bytea, p_user_id uuid) returns void`
  - `app.create_family(p_id uuid, p_name text, p_measurement_system text, p_time_zone text) returns uuid`
  - SQLSTATE: `42501` non autorizzato; `P0A01` invito non disponibile; `P0A02` email diversa; `P0A03` account esistente; `P0A04` già accettato; `P0A05` id già usato con dati diversi; `P0A06` invito inesistente (solo `revoke`); `23514` dati non validi.
  - Ruoli scambiati come `jsonb` (array di stringhe): il Worker lavora con `fetch_types: false` e non ha parser né serializzatore di `text[]` (come in `server/src/profile/views.ts`).

- [ ] **Step 1: Test pgTAP che falliscono.** `supabase/tests/app_invitations_test.sql` (fixtures di `helpers/fixtures.psql`: `elena` è `app_admin`, `dario` è curatore). Nel ruolo `anon` si usano solo le funzioni per token; i valori di confronto si salvano con `set_config` prima di cambiare ruolo.

```sql
begin;
\ir helpers/setup.psql
\ir helpers/fixtures.psql
select no_plan();

create function tests.h(p_token text) returns bytea language sql immutable as $$
	select sha256(convert_to(p_token, 'UTF8'));
$$;
grant execute on function tests.h(text) to authenticated, anon;

-- Creation: app admins only, normalised email, allowed roles as jsonb
select tests.login('dario');
select throws_ok($$select app.create_app_invitation(gen_random_uuid(), tests.h('t0'), 'new@x.it', '[]')$$, '42501', null, 'only app admins create');
reset role;
select tests.login('elena');
select lives_ok($$select app.create_app_invitation('00000000-0000-4000-8000-000000000001', tests.h('t1'), '  New@X.it ', '["recipe_curator"]')$$, 'app admin creates');
reset role;
select is((select email from app.app_invitations where id = '00000000-0000-4000-8000-000000000001'), 'new@x.it', 'email normalised');
select is((select roles from app.app_invitations where id = '00000000-0000-4000-8000-000000000001'), '{recipe_curator}'::text[], 'roles stored');
select tests.login('elena');
select throws_ok($$select app.create_app_invitation(gen_random_uuid(), tests.h('t2'), 'b@x.it', '["root"]')$$, '23514', null, 'unknown role');
select throws_ok($$select app.create_app_invitation(gen_random_uuid(), tests.h('t3'), 'b@x.it', '["app_admin","app_admin"]')$$, '23514', null, 'duplicate role');
select throws_ok($$select app.create_app_invitation(gen_random_uuid(), tests.h('t3'), 'b@x.it', '{"a":1}')$$, '23514', null, 'roles not an array');
select throws_ok($$select app.create_app_invitation(gen_random_uuid(), tests.h('t3'), 'b@x.it', '[1]')$$, '23514', null, 'roles not strings');
select throws_ok($$select app.create_app_invitation(gen_random_uuid(), tests.h('t4'), 'DARIO@test.local', '[]')$$, 'P0A03', null, 'email with an account');
select lives_ok($$select app.create_app_invitation(gen_random_uuid(), tests.h('t4b'), 'two@x.it', '["recipe_curator","app_admin"]')$$, 'two roles');

-- A new invitation to the same email replaces the pending one
select lives_ok($$select app.create_app_invitation('00000000-0000-4000-8000-000000000002', tests.h('t5'), 'new@x.it', '[]')$$, 'second invitation');
reset role;
select is((select status from app.app_invitations where id = '00000000-0000-4000-8000-000000000001'), 'revoked', 'first one revoked');
select tests.login('elena');
-- Repeating the same id gives a new token, no duplicate
select lives_ok($$select app.create_app_invitation('00000000-0000-4000-8000-000000000002', tests.h('t6'), 'new@x.it', '[]')$$, 'repeat');
reset role;
select is((select count(*) from app.app_invitations where email = 'new@x.it' and status = 'pending'), 1::bigint, 'one pending');
select is((select token_hash from app.app_invitations where id = '00000000-0000-4000-8000-000000000002'), tests.h('t6'), 'token replaced');
select tests.login('elena');
select throws_ok($$select app.create_app_invitation('00000000-0000-4000-8000-000000000002', tests.h('t7'), 'other@x.it', '[]')$$, 'P0A05', null, 'same id, other email');
select is((select roles from app.app_invitations_view() where id = '00000000-0000-4000-8000-000000000002'), '[]'::jsonb, 'view gives jsonb roles');

-- RLS: only app admins read
reset role;
select tests.login('dario');
select is((select count(*) from app.app_invitations), 0::bigint, 'non admins read nothing');
select throws_ok($$update app.app_invitations set status = 'accepted'$$, '42501', null, 'no direct writes');
select throws_ok($$select app.claim_app_invitation(tests.h('t6'), 'new@x.it')$$, '42501', null, 'authenticated cannot claim');

-- Public reading by token: no email
reset role;
select tests.become('anon');
select is((select roles from app.app_invitation_by_token(tests.h('t6'))), '[]'::jsonb, 'valid invitation is readable');
select is((select count(*) from app.app_invitation_by_token(tests.h('t1'))), 0::bigint, 'revoked: no row');
select is((select count(*) from app.app_invitation_by_token(tests.h('nope'))), 0::bigint, 'unknown: no row');
select throws_ok($$select * from app.app_invitations$$, '42501', null, 'anon has no table access');

-- Claim: email check, reservation reused (values compared through set_config, never a table read as anon)
select throws_ok($$select * from app.claim_app_invitation(tests.h('t6'), 'other@x.it')$$, 'P0A02', null, 'other email');
select is((select email from app.claim_app_invitation(tests.h('t6'), ' NEW@x.it')), 'new@x.it', 'email compared normalised');
select set_config('tests.first', (select user_id::text from app.claim_app_invitation(tests.h('t6'), 'new@x.it')), true);
select is((select user_id::text from app.claim_app_invitation(tests.h('t6'), 'new@x.it')), current_setting('tests.first'), 'same reservation');
select throws_ok($$select * from app.claim_app_invitation(tests.h('t1'), 'new@x.it')$$, 'P0A01', null, 'revoked cannot be claimed');

-- Expiry: before reservation refused, after reservation still valid
reset role;
update app.app_invitations set expires_at = now() - interval '1 minute' where id = '00000000-0000-4000-8000-000000000002';
select tests.become('anon');
select is((select count(*) from app.app_invitation_by_token(tests.h('t6'))), 1::bigint, 'reserved and expired is still valid');
select lives_ok($$select * from app.claim_app_invitation(tests.h('t6'), 'new@x.it')$$, 'reserved and expired can be claimed again');
reset role;
select tests.login('elena');
select app.create_app_invitation('00000000-0000-4000-8000-000000000003', tests.h('t8'), 'late@x.it', '[]');
reset role;
update app.app_invitations set expires_at = now() - interval '1 minute' where id = '00000000-0000-4000-8000-000000000003';
select tests.become('anon');
select is((select count(*) from app.app_invitation_by_token(tests.h('t8'))), 0::bigint, 'expired without reservation');
select throws_ok($$select * from app.claim_app_invitation(tests.h('t8'), 'late@x.it')$$, 'P0A01', null, 'expired cannot be claimed');

-- Completion: needs the reserved id existing in auth.users with the invitation email
select throws_ok($$select app.complete_app_invitation(tests.h('t6'), gen_random_uuid())$$, 'P0A01', null, 'other id');
select throws_ok($$select app.complete_app_invitation(tests.h('t6'), current_setting('tests.first')::uuid)$$, 'P0A01', null, 'reserved id not in auth.users yet');
reset role;
insert into auth.users (id, email, aud, role) values (current_setting('tests.first')::uuid, 'wrong@x.it', 'authenticated', 'authenticated');
select tests.become('anon');
select throws_ok($$select app.complete_app_invitation(tests.h('t6'), current_setting('tests.first')::uuid)$$, 'P0A01', null, 'reserved id with another email');
reset role;
update auth.users set email = 'new@x.it' where id = current_setting('tests.first')::uuid;
update app.app_invitations set roles = '{recipe_curator}' where id = '00000000-0000-4000-8000-000000000002';
select tests.become('anon');
select lives_ok($$select app.complete_app_invitation(tests.h('t6'), current_setting('tests.first')::uuid)$$, 'completes even though expired after the reservation');
select lives_ok($$select app.complete_app_invitation(tests.h('t6'), current_setting('tests.first')::uuid)$$, 'repeat is a no-op');
select is((select count(*) from app.app_invitation_by_token(tests.h('t6'))), 0::bigint, 'used: no row');
reset role;
select is((select status from app.app_invitations where id = '00000000-0000-4000-8000-000000000002'), 'accepted', 'accepted');
select is((select array_agg(role) from app.user_roles where user_id = current_setting('tests.first')::uuid), '{recipe_curator}'::text[], 'roles granted');
select is((select granted_by from app.user_roles where user_id = current_setting('tests.first')::uuid), tests.uid('elena'), 'granted by the author');

-- Revoked after the reservation, also when already expired: completion refused
select tests.login('elena');
select app.create_app_invitation('00000000-0000-4000-8000-000000000004', tests.h('t9'), 'gone@x.it', '[]');
reset role;
select tests.become('anon');
select set_config('tests.r9', (select user_id::text from app.claim_app_invitation(tests.h('t9'), 'gone@x.it')), true);
reset role;
insert into auth.users (id, email, aud, role) values (current_setting('tests.r9')::uuid, 'gone@x.it', 'authenticated', 'authenticated');
update app.app_invitations set expires_at = now() - interval '1 minute' where id = '00000000-0000-4000-8000-000000000004';
select tests.login('elena');
select lives_ok($$select app.revoke_app_invitation('00000000-0000-4000-8000-000000000004')$$, 'revoke an expired pending invitation');
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

Prima di scrivere, controlla in `supabase/migrations/20261011100300_families.sql` lo SQLSTATE del trigger sul fuso, il check sul nome e le colonne di `profile_preferences` (`updated_at`); allinea test e funzione a ciò che esiste.

- [ ] **Step 2: Esegui** `supabase test db` → FAIL (funzioni inesistenti).

- [ ] **Step 3: Scrivi la migrazione** `supabase/migrations/20261013100000_app_invitations.sql`. Le funzioni d'appoggio stanno **prima** della tabella, perché un `CHECK` non ammette sottoquery ma può chiamare una funzione immutabile:

```sql
-- W9 (wave 3, activity A): app invitations and families created by their users.
-- Spec: progetto/superpowers/specs/2026-10-13-inviti-app.md, section 1.

-- Allowed global roles, no duplicates. Used by the CHECK below: a CHECK cannot hold a subquery.
create function app.app_invitation_roles_valid(p_roles text[]) returns boolean
language sql immutable set search_path = '' as $$
	select p_roles is not null
		and p_roles <@ array['recipe_curator', 'app_admin']::text[]
		and cardinality(p_roles) = (select count(distinct r) from unnest(p_roles) r);
$$;

-- Roles arrive from the Worker as a jsonb array of strings (no text[] serializer without fetch_types).
create function app.app_invitation_roles_from_jsonb(p_roles jsonb) returns text[]
language plpgsql immutable set search_path = '' as $$
declare
	v_roles text[];
begin
	if p_roles is null or jsonb_typeof(p_roles) <> 'array'
		or exists (select 1 from jsonb_array_elements(p_roles) e where jsonb_typeof(e) <> 'string') then
		raise exception 'roles must be an array of strings' using errcode = '23514';
	end if;
	v_roles := array(select jsonb_array_elements_text(p_roles));
	if not app.app_invitation_roles_valid(v_roles) then
		raise exception 'invalid roles' using errcode = '23514';
	end if;
	return v_roles;
end;
$$;

create table app.app_invitations (
	id uuid primary key,
	token_hash bytea not null unique check (octet_length(token_hash) = 32),
	email text not null check (email = lower(btrim(email)) and email <> '' and length(email) <= 320),
	roles text[] not null default '{}' check (app.app_invitation_roles_valid(roles)),
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

-- Valid for the link: pending, and not expired unless already reserved (spec W9, question 4).
create function app.app_invitation_usable(p_row app.app_invitations) returns boolean
language sql stable set search_path = '' as $$
	select p_row.status = 'pending' and (p_row.expires_at > now() or p_row.reserved_user_id is not null);
$$;

create function app.create_app_invitation(p_id uuid, p_token_hash bytea, p_email text, p_roles jsonb)
returns app.app_invitations language plpgsql security definer set search_path = '' as $$
declare
	v_email text := lower(btrim(p_email));
	v_roles text[];
	v_row app.app_invitations;
begin
	if not app.has_role('app_admin') then
		raise exception 'app admins only' using errcode = '42501';
	end if;
	v_roles := app.app_invitation_roles_from_jsonb(p_roles);
	-- FOR UPDATE cannot lock a row that does not exist yet: serialise on the id, then the email.
	perform pg_advisory_xact_lock(hashtextextended('app_invitation:id:' || p_id::text, 0));
	perform pg_advisory_xact_lock(hashtextextended('app_invitation:email:' || v_email, 0));
	if exists (select 1 from auth.users u where lower(u.email) = v_email) then
		raise exception 'account exists' using errcode = 'P0A03';
	end if;
	select * into v_row from app.app_invitations where id = p_id;
	if found then
		if v_row.created_by is distinct from auth.uid() or v_row.status <> 'pending'
			or v_row.email <> v_email or v_row.roles <> v_roles then
			raise exception 'id in use' using errcode = 'P0A05';
		end if;
		update app.app_invitations set token_hash = p_token_hash where id = p_id returning * into v_row;
		return v_row;
	end if;
	update app.app_invitations set status = 'revoked', revoked_at = now(), revoked_by = auth.uid()
		where email = v_email and status = 'pending';
	insert into app.app_invitations (id, token_hash, email, roles, created_by, expires_at)
		values (p_id, p_token_hash, v_email, v_roles, auth.uid(), now() + interval '7 days')
		returning * into v_row;
	return v_row;
end;
$$;

-- Any pending row, expired or not: a reserved and expired invitation can still be closed, so it must be stoppable.
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
returns table (id uuid, email text, roles jsonb, status text, created_by uuid, created_by_name text,
	created_at timestamptz, expires_at timestamptz, accepted_by_name text, accepted_at timestamptz, revoked_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
	if not app.has_role('app_admin') then
		raise exception 'app admins only' using errcode = '42501';
	end if;
	return query
		select i.id, i.email, to_jsonb(i.roles), i.status, i.created_by, c.display_name, i.created_at, i.expires_at,
			a.display_name, i.accepted_at, i.revoked_at
		from app.app_invitations i
		left join app.profiles c on c.user_id = i.created_by
		left join app.profiles a on a.user_id = i.accepted_by
		order by i.created_at desc;
end;
$$;

create function app.app_invitation_by_token(p_token_hash bytea)
returns table (invited_by_name text, roles jsonb)
language sql stable security definer set search_path = '' as $$
	select p.display_name, to_jsonb(i.roles)
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
	if btrim(coalesce(p_name, '')) = '' or length(btrim(p_name)) > 60 then
		raise exception 'invalid name' using errcode = '23514';
	end if;
	-- Two creations with the same id wait for each other instead of colliding on the key.
	perform pg_advisory_xact_lock(hashtextextended('family:create:' || p_id::text, 0));
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

revoke execute on function app.app_invitation_roles_valid(text[]) from public;
revoke execute on function app.app_invitation_roles_from_jsonb(jsonb) from public;
revoke execute on function app.app_invitation_usable(app.app_invitations) from public;
revoke execute on function app.create_app_invitation(uuid, bytea, text, jsonb) from public;
revoke execute on function app.revoke_app_invitation(uuid) from public;
revoke execute on function app.app_invitations_view() from public;
revoke execute on function app.app_invitation_by_token(bytea) from public;
revoke execute on function app.claim_app_invitation(bytea, text) from public;
revoke execute on function app.complete_app_invitation(bytea, uuid) from public;
revoke execute on function app.create_family(uuid, text, text, text) from public;
grant execute on function app.create_app_invitation(uuid, bytea, text, jsonb) to authenticated;
grant execute on function app.revoke_app_invitation(uuid) to authenticated;
grant execute on function app.app_invitations_view() to authenticated;
grant execute on function app.create_family(uuid, text, text, text) to authenticated;
grant execute on function app.app_invitation_by_token(bytea) to anon;
grant execute on function app.claim_app_invitation(bytea, text) to anon;
grant execute on function app.complete_app_invitation(bytea, uuid) to anon;
```

Le tre funzioni d'appoggio non hanno `EXECUTE` per i ruoli dell'app: le chiamano solo le funzioni `security definer` (owner) e il `CHECK` durante le scritture fatte da quelle funzioni o dall'owner. Se `profile_preferences` non ha `updated_at`, togli la colonna dall'`on conflict`; se `families` ha già un check sul nome, lascia comunque il controllo esplicito (codice stabile per il test).

`supabase/tests/coverage_test.sql`: l'elenco `anon` diventa `array['app_invitation_by_token', 'claim_app_invitation', 'complete_app_invitation', 'temporary_list_by_token']`; nell'elenco `authenticated` aggiungi in ordine (`collate "C"`) `app_invitations_view`, `create_app_invitation`, `create_family`, `revoke_app_invitation`.

- [ ] **Step 4: Applica davvero la migrazione ed esegui i test:** `supabase db reset` (deve finire senza errori: la migrazione si applica intera) poi `supabase test db` → PASS, compresi i file esistenti.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261013100000_app_invitations.sql supabase/tests
git commit -m "W9: tabella degli inviti all'app, funzioni per token e creazione della famiglia"
```

---

### Task 3: Pipeline delle operazioni `public`, limitatori e controllo dei ruoli

**Files:**
- Modify: `server/src/pipeline.ts`, `server/src/env.ts`, `server/src/app.ts`, `server/wrangler.jsonc`
- Modify: `server/test/support/requests.ts`, `server/test/support/context.ts`, `server/test/support/test-contract.ts`
- Test: `server/test/pipeline.test.ts`

**Interfaces:**
- Consumes: `Role`, `RateLimitName` (Task 1); `withDb(connectionString, { kind: 'anon' }, work)` di `server/src/db.ts`.
- Produces: `RequestContext.clientIp: string`; `interface RateLimiter { limit(options: { key: string }): Promise<{ success: boolean }> }` in `env.ts`; `Env.INVITE_READ_LIMIT`, `Env.INVITE_ACCEPT_LIMIT: RateLimiter`, `Env.SUPABASE_SECRET_KEY?: string`;

```ts
export interface PublicOperationContext extends RequestContext {
	public: true;
	now: Date;
	/** One short `anon` transaction, opened and closed here: the pipeline opens none for public operations. */
	anonDb<T>(work: (tx: Tx) => Promise<T>): Promise<T>;
}
export function publicContext(context: unknown): PublicOperationContext
```

  e `allowAll`, `refuseAll: RateLimiter` in `server/test/support/requests.ts`.

- [ ] **Step 1: Test che falliscono.** In `test-contract.ts` un'operazione pubblica:

```ts
		open: op({ mcp: false, offline: false, role: 'public', rateLimit: 'read' })
			.route({ method: 'POST', path: '/test/open', summary: 'Public' })
			.input(z.object({ echo: z.string() }))
			.output(z.object({ echo: z.string(), role: z.string(), inTransaction: z.boolean() })),
```

con il gestore (importa `publicContext`):

```ts
		open: os.test.open.handler(async ({ context, input }) => {
			const ctx = publicContext(context);
			// Before anonDb: the pipeline must not hold a transaction of its own.
			const outside = await ctx.anonDb((tx) => tx<{ n: number }[]>`
				select count(*)::int as n from pg_stat_activity
				where usename = 'app_server' and xact_start is not null and pid <> pg_backend_pid()`);
			const [{ role }] = await ctx.anonDb((tx) => tx<{ role: string }[]>`select current_user as role`);
			return { echo: input.echo, role, inTransaction: outside[0]!.n > 0 };
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

	it('run as anon without a token and without a transaction of the pipeline', async () => {
		const result = await call(testRouter.test.open, { echo: 'hi' }, options(contextFor(keys, undefined, db.appServerUrl)));
		expect(result).toEqual({ echo: 'hi', role: 'anon', inTransaction: false });
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
		const seen: string[] = [];
		const context = contextFor(keys, undefined, db.appServerUrl);
		context.clientIp = '203.0.113.7';
		context.env.INVITE_READ_LIMIT = { limit: async ({ key }) => (seen.push(key), { success: true }) };
		await call(testRouter.test.open, { echo: 'x' }, options(context));
		expect(seen).toEqual(['203.0.113.7']);
	});
});

it('publicContext refuses a signed-in context', () => {
	expect(() => publicContext({ userId: 'x' })).toThrow();
});

it('checkRole refuses the public role: it never reaches the signed-in checks', async () => {
	await expect(checkRole({} as Tx, 'public', {})).rejects.toThrow('public operation');
});
```

(`checkRole` da `../src/permissions.ts`, `Tx` da `../src/db.ts`.) In `contextFor` (`support/context.ts`) aggiungi all'`env` `INVITE_READ_LIMIT: allowAll, INVITE_ACCEPT_LIMIT: allowAll, SUPABASE_SECRET_KEY: 'sb_secret_test'` e al contesto `clientIp: '198.51.100.1'`; lo stesso in `testEnv()` di `requests.ts`, dove definisci:

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
/** Context of a `public` operation: no user, no transaction held by the pipeline (spec W9). */
export interface PublicOperationContext extends RequestContext {
	public: true;
	now: Date;
	/** One short `anon` transaction, opened and closed here: nothing stays busy while the handler waits on Auth. */
	anonDb<T>(work: (tx: Tx) => Promise<T>): Promise<T>;
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
			const operation: PublicOperationContext = {
				...context,
				public: true,
				now: context.clock?.() ?? new Date(),
				anonDb: (work) => withDb(context.env.HYPERDRIVE.connectionString, { kind: 'anon' }, work),
			};
			return next({ context: operation as unknown as OperationContext });
		}
```

Aggiorna il commento di `createImplementer` («public operations: limiter, then the handler opens its own short anon transactions»).

(`server/src/permissions.ts` ha già il caso `public` dal Task 1; qui c'è il suo test.)

`server/src/app.ts`, in `contextFor`: `clientIp: request.headers.get('cf-connecting-ip') ?? 'unknown',`.

`server/wrangler.jsonc`, dopo `hyperdrive`:

```jsonc
	// Public invitation operations (spec W9): per-IP limits; namespace ids unique in the Cloudflare account.
	"ratelimits": [
		{ "name": "INVITE_READ_LIMIT", "namespace_id": "9101", "simple": { "limit": 30, "period": 60 } },
		{ "name": "INVITE_ACCEPT_LIMIT", "namespace_id": "9102", "simple": { "limit": 5, "period": 60 } }
	],
```

Aggiorna i test che costruiscono un `Env` a mano (`grep -rn "SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test'" server`) aggiungendo i limitatori.

- [ ] **Step 4: Esegui** `npm test -w server && npm run typecheck` → PASS (il typecheck della radice copre anche `permissions.ts`).

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "W9: operazioni public nella pipeline, senza transazione e con limiti per IP"
```

---

### Task 4: Modulo `server/src/accounts/`

**Files:**
- Create: `server/src/accounts/index.ts`
- Test: `server/src/accounts/index.test.ts`
- Modify: `server/src/errors.ts`, `server/test/errors.test.ts`

**Interfaces:**
- Produces:

```ts
export interface InvitedAccount { id: string; email: string; password: string; displayName: string; locale: Locale }
export type AccountOutcome = { status: 'created' } | { status: 'existing' } | { status: 'email_taken' };
export class AccountServiceError extends Error { readonly reason: 'auth_admin_key_missing' | 'auth_admin_failed'; readonly status: number | null }
export async function createInvitedAccount(env: Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>, account: InvitedAccount, options?: { fetch?: typeof fetch }): Promise<AccountOutcome>
```

  Regola: **mai un `PUT`**; credenziali e metadati di un account esistente non si toccano (decisione del coordinatore, rilievi 1, 5, 11).

- [ ] **Step 1: Test che falliscono** (`server/src/accounts/index.test.ts`):

```ts
import { describe, expect, it, vi } from 'vitest';
import { AccountServiceError, createInvitedAccount } from './index.ts';

const env = { SUPABASE_URL: 'https://auth.test', SUPABASE_SECRET_KEY: 'sb_secret_x' };
const account = { id: '11111111-1111-4111-8111-111111111111', email: 'new@x.it', password: 'segreta123', displayName: 'Nuova', locale: 'it-IT' as const };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const sameUser = () => json(200, { id: account.id, email: 'new@x.it' });
const methods = (fetch: ReturnType<typeof vi.fn>) => fetch.mock.calls.map(([, init]) => (init as RequestInit).method);

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

	it('email_exists with the reserved id and the invitation email is the earlier creation: existing, never a PUT', async () => {
		const fetch = vi.fn().mockResolvedValueOnce(json(422, { error_code: 'email_exists' })).mockResolvedValueOnce(sameUser());
		expect(await createInvitedAccount(env, account, { fetch })).toEqual({ status: 'existing' });
		expect(fetch.mock.calls[1]![0]).toBe(`https://auth.test/auth/v1/admin/users/${account.id}`);
		expect(methods(fetch)).toEqual(['POST', 'GET']);
	});

	it('an ambiguous answer (500, timeout) is reconciled by reading the reserved id', async () => {
		const after500 = vi.fn().mockResolvedValueOnce(json(500, {})).mockResolvedValueOnce(sameUser());
		expect(await createInvitedAccount(env, account, { fetch: after500 })).toEqual({ status: 'existing' });
		const afterTimeout = vi.fn().mockRejectedValueOnce(new DOMException('timeout', 'TimeoutError')).mockResolvedValueOnce(sameUser());
		expect(await createInvitedAccount(env, account, { fetch: afterTimeout })).toEqual({ status: 'existing' });
		expect(methods(afterTimeout)).toEqual(['POST', 'GET']);
	});

	it('email_taken: email_exists and no user with the id, or the id with another email', async () => {
		const missing = vi.fn().mockResolvedValueOnce(json(422, { error_code: 'email_exists' })).mockResolvedValueOnce(json(404, { error_code: 'user_not_found' }));
		expect(await createInvitedAccount(env, account, { fetch: missing })).toEqual({ status: 'email_taken' });
		const other = vi.fn().mockResolvedValueOnce(json(500, {})).mockResolvedValueOnce(json(200, { id: account.id, email: 'else@x.it' }));
		expect(await createInvitedAccount(env, account, { fetch: other })).toEqual({ status: 'email_taken' });
	});

	it('a service error when the creation did not happen or cannot be checked', async () => {
		const notCreated = vi.fn().mockResolvedValueOnce(json(500, {})).mockResolvedValueOnce(json(404, {}));
		await expect(createInvitedAccount(env, account, { fetch: notCreated })).rejects.toBeInstanceOf(AccountServiceError);
		const unreadable = vi.fn().mockResolvedValueOnce(json(500, {})).mockRejectedValueOnce(new TypeError('down'));
		await expect(createInvitedAccount(env, account, { fetch: unreadable })).rejects.toBeInstanceOf(AccountServiceError);
		await expect(createInvitedAccount({ SUPABASE_URL: env.SUPABASE_URL }, account)).rejects.toThrow('auth_admin_key_missing');
	});

	it('never puts the password in the error', async () => {
		const fetch = vi.fn().mockResolvedValueOnce(json(500, { msg: 'segreta123' })).mockResolvedValueOnce(json(404, {}));
		const error = await createInvitedAccount(env, account, { fetch }).catch((e) => e);
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
 * reserved on the invitation. Any answer but 200 is ambiguous (two creations can both pass Auth's
 * email check; a creation can succeed and time out): the reserved id is read back. An existing
 * account is never rewritten: no PUT, so password, name and language stay those of the first
 * successful attempt. The secret key goes in `apikey`: it is not a JWT.
 */
export async function createInvitedAccount(
	env: Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>,
	account: InvitedAccount,
	options: { fetch?: typeof fetch } = {},
): Promise<AccountOutcome> {
	const key = env.SUPABASE_SECRET_KEY;
	if (!key) throw new AccountServiceError('auth_admin_key_missing');
	/** null: the request did not get an answer (network, timeout). */
	const send = async (method: 'POST' | 'GET', path: string, body?: unknown): Promise<Response | null> => {
		try {
			return await (options.fetch ?? fetch)(new URL(`/auth/v1/admin/users${path}`, env.SUPABASE_URL).toString(), {
				method,
				headers: { apikey: key, 'content-type': 'application/json' },
				body: body === undefined ? undefined : JSON.stringify(body),
				signal: AbortSignal.timeout(TIMEOUT_MS),
			});
		} catch {
			return null;
		}
	};
	const created = await send('POST', '', {
		id: account.id,
		email: account.email,
		password: account.password,
		email_confirm: true,
		user_metadata: { display_name: account.displayName, locale: account.locale },
	});
	if (created?.ok) return { status: 'created' };
	const emailExists = created?.status === 422 && (await errorCode(created)) === 'email_exists';
	const read = await send('GET', `/${account.id}`);
	if (!read) throw new AccountServiceError('auth_admin_failed', created?.status ?? null);
	if (read.status === 404) {
		if (emailExists) return { status: 'email_taken' };
		throw new AccountServiceError('auth_admin_failed', created?.status ?? null);
	}
	if (!read.ok) throw new AccountServiceError('auth_admin_failed', read.status);
	const user = (await read.json()) as { id?: unknown; email?: unknown };
	const same = user.id === account.id && typeof user.email === 'string' && user.email.toLowerCase() === account.email;
	return same ? { status: 'existing' } : { status: 'email_taken' };
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

In `server/src/errors.ts` (`normalizeError`): un `AccountServiceError` diventa `internal` e la riga di log usa `event: error.reason` con il solo `status` (fai come per `GrantRevocationError`); test in `server/test/errors.test.ts` che la riga non contenga altri campi.

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
- Create: `server/src/app-invitations/router.ts`, `server/src/app-invitations/tokens.ts`, `server/src/app-invitations/tokens.test.ts`, `server/src/app-invitations/db-errors.ts`, `server/src/app-invitations/views.ts`
- Modify: `contract/src/contract.ts`, `contract/src/index.ts`, `server/src/router.ts`
- Test: `server/test/app-invitations.test.ts`

**Interfaces:**
- Consumes: SQL di Task 2 (ruoli `jsonb`, impronta `bytea`).
- Produces:
  - contratto `appInvitationsContract` (`create`, `list`, `revoke`, `get`, `accept`), `globalRoleSchema`, `invitationEmailSchema`, `invitationTokenSchema`, `invitationPasswordSchema`, `appInvitationViewSchema`, `AppInvitationView`, `GlobalRole`, `PASSWORD_MAX_BYTES = 72`;
  - `newToken(): string`, `hashTokenHex(token: string): Promise<string>` (64 caratteri esadecimali), `invitationUrl(origin: string, token: string): string`;
  - `mapInvitationError(error: unknown): never`.
  - Convenzione SQL del Worker: impronta come `decode(${hex}, 'hex')`, ruoli come `${JSON.stringify(roles)}::jsonb`, letture dei ruoli già `jsonb` (array JavaScript).

- [ ] **Step 1: Contratto e test.** `contract/src/app-invitations/index.ts`:

```ts
import { z } from 'zod';
import { errorDefinitions } from '../errors.ts';
import { localeSchema } from '../locale.ts';
import { op } from '../op.ts';
import { displayNameSchema } from '../profile/index.ts';

export const globalRoleSchema = z.enum(['recipe_curator', 'app_admin']);
export type GlobalRole = z.infer<typeof globalRoleSchema>;
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
	/** `expired`: still pending in the database, so it can be revoked (a reserved one can still be closed). */
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
		.route({ method: 'POST', path: '/app-invitations/{id}/revoke', summary: 'Revoke a pending or expired app invitation (app administrators)' })
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

`get` e `accept` usano POST: il token non sta mai in un URL. Registra l'area in `contract/src/contract.ts` (`appInvitations: appInvitationsContract`) e in `contract/src/index.ts` (`export * from './app-invitations/index.ts';`).

`contract/src/app-invitations/app-invitations-contract.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { checkContract, contract } from '../index.ts';
import { invitationEmailSchema, invitationPasswordSchema } from './index.ts';

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

`server/src/app-invitations/tokens.test.ts`:

```ts
import { expect, it } from 'vitest';
import { hashTokenHex, invitationUrl, newToken } from './tokens.ts';

it('makes 43-character base64url tokens, different each time', () => {
	const a = newToken();
	expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
	expect(newToken()).not.toBe(a);
});
it('hashes with SHA-256 to hex and builds the link with the token in the fragment', async () => {
	expect(await hashTokenHex('x')).toMatch(/^[0-9a-f]{64}$/);
	expect(invitationUrl('https://app.test', 'abc')).toBe('https://app.test/invite/app#abc');
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

	it('carries no role, one role and two roles through the real withDb', async () => {
		const federico = await admin();
		for (const roles of [[], ['app_admin'], ['recipe_curator', 'app_admin']] as const) {
			const { invitation } = await federico.client.appInvitations.create({ id: crypto.randomUUID(), email: email(), roles: [...roles] });
			expect(invitation.roles).toEqual(roles);
			expect((await federico.client.appInvitations.list({})).invitations.find((i) => i.id === invitation.id)?.roles).toEqual(roles);
		}
	});

	it('repeating the same id gives a new link and no duplicate', async () => {
		const federico = await admin();
		const input = { id: crypto.randomUUID(), email: email(), roles: [] as [] };
		const first = await federico.client.appInvitations.create(input);
		const second = await federico.client.appInvitations.create(input);
		expect(second.url).not.toBe(first.url);
		expect((await federico.client.appInvitations.list({})).invitations.filter((i) => i.id === input.id)).toHaveLength(1);
	});

	it('concurrent creations: same id gives one row, same email gives one pending invitation, no error', async () => {
		const federico = await admin();
		const same = { id: crypto.randomUUID(), email: email(), roles: [] as [] };
		await Promise.all([federico.client.appInvitations.create(same), federico.client.appInvitations.create(same)]);
		const to = email();
		const results = await Promise.all([1, 2, 3].map(() => federico.client.appInvitations.create({ id: crypto.randomUUID(), email: to, roles: [] })));
		const rows = await actors.db.admin<{ status: string }[]>`select status from app.app_invitations where email = ${to}`;
		expect(rows.filter((r) => r.status === 'pending')).toHaveLength(1);
		expect(rows).toHaveLength(results.length);
		expect((await actors.db.admin`select count(*)::int as n from app.app_invitations where id = ${same.id}`)[0]!.n).toBe(1);
	});

	it('refuses an email that has an account', async () => {
		const federico = await admin();
		const other = await actors.user();
		const error = await errorOf(federico.client.appInvitations.create({ id: crypto.randomUUID(), email: `${other.userId}@test.local`, roles: [] }));
		expect([error.code, error.data]).toEqual(['not_allowed', { reason: 'account_exists' }]);
	});

	it('lists with computed expiry and revokes pending and expired invitations', async () => {
		const federico = await admin();
		const { invitation } = await federico.client.appInvitations.create({ id: crypto.randomUUID(), email: email(), roles: [] });
		await actors.db.admin`update app.app_invitations set expires_at = now() - interval '1 second' where id = ${invitation.id}`;
		expect((await federico.client.appInvitations.list({})).invitations.find((i) => i.id === invitation.id)?.status).toBe('expired');
		expect((await federico.client.appInvitations.revoke({ id: invitation.id })).invitation.status).toBe('revoked');
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
		const agent = await actors.user({ agent: true });
		await actors.db.grantGlobalRole(agent.userId, 'app_admin');
		const tools = (await mcp(actors.app, actors.env, agent.token, 'tools/list')).body.result.tools.map((t: { name: string }) => t.name);
		expect(tools).toEqual(expect.arrayContaining(['appInvitations_create', 'appInvitations_list', 'appInvitations_revoke']));
		expect(tools).not.toContain('appInvitations_get');
		expect(tools).not.toContain('appInvitations_accept');
		const result = await mcp(actors.app, actors.env, agent.token, 'tools/call', { name: 'appInvitations_create', arguments: { id: crypto.randomUUID(), email: email(), roles: [] } });
		expect(toolBody(result).url).toMatch(/^https:\/\/app\.test\/invite\/app#/);
	});
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

/** SHA-256 as hex: sent as `decode(hex, 'hex')`, so no bytea serializer is needed. */
export async function hashTokenHex(token: string): Promise<string> {
	const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
	return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
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
		// An id reused with other data is the client's mistake: invalid, not conflict (which carries catalogue data).
		case 'P0A05':
		case '23514':
			throw appError('invalid', { issues: [{ path: ['id'], code: 'in_use' }] });
		default: throw error;
	}
}
```

`server/src/app-invitations/views.ts`:

```ts
import type { AppInvitationView, GlobalRole } from '@app/contract';

/** A row of app.app_invitations_view(); roles arrive as jsonb, already an array. */
export interface InvitationRow {
	id: string; email: string; roles: GlobalRole[]; status: 'pending' | 'accepted' | 'revoked';
	created_by: string | null; created_by_name: string | null; created_at: Date; expires_at: Date;
	accepted_by_name: string | null; accepted_at: Date | null; revoked_at: Date | null;
}

export function invitationView(row: InvitationRow, now: Date): AppInvitationView {
	return {
		id: row.id,
		email: row.email,
		roles: row.roles,
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

`server/src/app-invitations/router.ts` (le operazioni d'amministrazione; `get` e `accept` le scrive il Task 6, che si esegue subito dopo nello stesso branch: fino ad allora rispondono `internal`):

```ts
import type { Tx } from '../db.ts';
import type { Implementer } from '../pipeline.ts';
import { mapInvitationError } from './db-errors.ts';
import { hashTokenHex, invitationUrl, newToken } from './tokens.ts';
import { invitationView, type InvitationRow } from './views.ts';

async function viewOf(tx: Tx, id: string, now: Date) {
	const [row] = await tx<InvitationRow[]>`select * from app.app_invitations_view() where id = ${id}`;
	return invitationView(row!, now);
}

export function appInvitationsRouter(os: Implementer) {
	return {
		create: os.appInvitations.create.handler(async ({ context, input }) => {
			const token = newToken();
			try {
				await context.tx`select app.create_app_invitation(
					${input.id}::uuid, decode(${await hashTokenHex(token)}, 'hex'), ${input.email}, ${JSON.stringify(input.roles)}::jsonb)`;
			} catch (error) {
				mapInvitationError(error);
			}
			return { invitation: await viewOf(context.tx, input.id, context.now), url: invitationUrl(context.origin, token) };
		}),
		list: os.appInvitations.list.handler(async ({ context }) => {
			const rows = await context.tx<InvitationRow[]>`select * from app.app_invitations_view()`.catch(mapInvitationError);
			return { invitations: rows.map((row) => invitationView(row, context.now)) };
		}),
		revoke: os.appInvitations.revoke.handler(async ({ context, input }) => {
			await context.tx`select app.revoke_app_invitation(${input.id}::uuid)`.catch(mapInvitationError);
			return { invitation: await viewOf(context.tx, input.id, context.now) };
		}),
		get: os.appInvitations.get.handler(async () => {
			throw new Error('appInvitations.get: written in task 6');
		}),
		accept: os.appInvitations.accept.handler(async () => {
			throw new Error('appInvitations.accept: written in task 6');
		}),
	};
}
```

Nota: un errore dentro `context.tx` annulla la transazione di Postgres.js; per `create` l'errore si mappa e si rilancia subito, senza altre query nella stessa transazione. In `server/src/router.ts` aggiungi `appInvitations: appInvitationsRouter(os),`.

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
- Consumes: `publicContext`, `PublicOperationContext.anonDb` (Task 3); `createInvitedAccount` (Task 4); `hashTokenHex`, `mapInvitationError` (Task 5).
- Produces (solo test): `installFakeAuth(db: TestDatabase)` →

```ts
{
	calls: string[];                       // 'POST', 'GET id'
	passwords: Map<string, string>;        // email → password stored at creation
	openTransactionsAtCreate: number[];    // app_server transactions open when each POST arrived
	holdNextCreate(): { reached: Promise<void>; release(): void };      // POST waits before doing anything
	holdAfterNextCreate(): { reached: Promise<void>; release(): void }; // POST inserts the user, then waits before answering
	failAfterNextCreate(): void;           // POST inserts the user, then answers 500
	restore(): void;
}
```

- [ ] **Step 1: Auth finta per i test** (`server/test/support/fake-auth.ts`). Simula GoTrue sul database locale, con l'inserimento atomico (un solo statement con il controllo dell'email), e registra le transazioni aperte di `app_server` nel momento di ogni creazione:

```ts
import { vi } from 'vitest';
import type { TestDatabase } from './db.ts';
import { TEST_SUPABASE_URL } from './keys.ts';

function barrier() {
	let release!: () => void;
	let arrived!: () => void;
	const released = new Promise<void>((r) => (release = r));
	const reached = new Promise<void>((r) => (arrived = r));
	return { reached, release, released, arrived };
}

export function installFakeAuth(db: TestDatabase) {
	const calls: string[] = [];
	const passwords = new Map<string, string>();
	const openTransactionsAtCreate: number[] = [];
	let before: ReturnType<typeof barrier> | null = null;
	let after: ReturnType<typeof barrier> | null = null;
	let failAfter = false;
	const real = globalThis.fetch;
	const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
		if (!url.startsWith(`${TEST_SUPABASE_URL}/auth/v1/admin/users`)) return real(input, init);
		const method = init?.method ?? 'GET';
		const id = url.split('/admin/users/')[1];
		calls.push(`${method}${id ? ' id' : ''}`);
		if (method === 'POST') {
			const body = JSON.parse(String(init!.body));
			const [{ n }] = await db.admin<{ n: number }[]>`
				select count(*)::int as n from pg_stat_activity where usename = 'app_server' and xact_start is not null`;
			openTransactionsAtCreate.push(n);
			const hold = before; before = null;
			if (hold) { hold.arrived(); await hold.released; }
			const inserted = await db.admin`
				insert into auth.users (id, email, aud, role, raw_user_meta_data, email_confirmed_at)
				select ${body.id}, ${body.email}, 'authenticated', 'authenticated', ${db.admin.json(body.user_metadata)}, now()
				where not exists (select 1 from auth.users where lower(email) = lower(${body.email}) or id = ${body.id})
				on conflict do nothing returning id`;
			if (inserted.length === 0) return Response.json({ error_code: 'email_exists' }, { status: 422 });
			passwords.set(body.email, body.password);
			const wait = after; after = null;
			if (wait) { wait.arrived(); await wait.released; }
			if (failAfter) { failAfter = false; return new Response('{}', { status: 500 }); }
			return Response.json({ id: body.id, email: body.email });
		}
		const [user] = await db.admin<{ id: string; email: string }[]>`select id, email from auth.users where id = ${id!}`;
		return user ? Response.json(user) : Response.json({ error_code: 'user_not_found' }, { status: 404 });
	});
	const hold = (set: (b: ReturnType<typeof barrier>) => void) => {
		const b = barrier();
		set(b);
		return { reached: b.reached, release: b.release };
	};
	return {
		calls,
		passwords,
		openTransactionsAtCreate,
		holdNextCreate: () => hold((b) => (before = b)),
		holdAfterNextCreate: () => hold((b) => (after = b)),
		failAfterNextCreate: () => { failAfter = true; },
		restore: () => spy.mockRestore(),
	};
}
```

- [ ] **Step 2: Test che falliscono** (`server/test/app-invitations-accept.test.ts`):

```ts
import type { Contract } from '@app/contract';
import type { ContractRouterClient } from '@orpc/contract';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { errorOf, setupActors, type Actors } from './support/actors.ts';
import { hasDatabase } from './support/db.ts';
import { installFakeAuth } from './support/fake-auth.ts';
import { refuseAll, rpcClient } from './support/requests.ts';

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
	afterEach(() => {
		auth.calls.length = 0;
		auth.openTransactionsAtCreate.length = 0;
	});

	const anonymous = () => rpcClient<ContractRouterClient<Contract>>(actors.app, actors.env);
	const invite = async (roles: ('recipe_curator' | 'app_admin')[] = []) => {
		const admin = await actors.user();
		await actors.db.grantGlobalRole(admin.userId, 'app_admin');
		const email = `p${crypto.randomUUID().slice(0, 8)}@x.it`;
		const { invitation, url } = await admin.client.appInvitations.create({ id: crypto.randomUUID(), email, roles });
		return { admin, email, id: invitation.id, token: url.split('#')[1]! };
	};
	const form = (token: string, email: string, over: Partial<{ displayName: string; password: string; locale: 'it-IT' | 'en-GB' }> = {}) =>
		({ token, email, displayName: 'Giulia', password: 'segreta123', locale: 'it-IT' as const, ...over });
	const accounts = async (email: string) => (await actors.db.admin<{ n: number }[]>`select count(*)::int as n from auth.users where email = ${email}`)[0]!.n;
	const profile = async (email: string) =>
		(await actors.db.admin<{ display_name: string; locale: string }[]>`
			select p.display_name, p.locale from app.profiles p join auth.users u on u.id = p.user_id where u.email = ${email}`)[0];

	it('reads who invites and the roles, never the email', async () => {
		const { token } = await invite(['recipe_curator']);
		const view = await anonymous().appInvitations.get({ token });
		expect(view.roles).toEqual(['recipe_curator']);
		expect(view.invitedBy).toMatch(/^Test /);
		expect(JSON.stringify(view)).not.toContain('@');
	});

	it('creates the account, marks the invitation used and grants the roles', async () => {
		const { email, id, token } = await invite(['recipe_curator', 'app_admin']);
		expect(await anonymous().appInvitations.accept(form(token, ` ${email.toUpperCase()}`))).toEqual({ email });
		const [user] = await actors.db.admin<{ id: string }[]>`select id from auth.users where email = ${email}`;
		const [row] = await actors.db.admin<{ status: string; accepted_by: string }[]>`select status, accepted_by from app.app_invitations where id = ${id}`;
		expect(row).toEqual({ status: 'accepted', accepted_by: user!.id });
		expect((await actors.db.admin`select role from app.user_roles where user_id = ${user!.id} order by role`).map((r) => r.role)).toEqual(['app_admin', 'recipe_curator']);
		expect(await profile(email)).toEqual({ display_name: 'Giulia', locale: 'it-IT' });
		expect((await errorOf(anonymous().appInvitations.get({ token }))).code).toBe('invitation_unavailable');
	});

	it('holds no app_server transaction while Auth is called', async () => {
		const { email, token } = await invite();
		await anonymous().appInvitations.accept(form(token, email));
		expect(auth.openTransactionsAtCreate).toEqual([0]);
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

	it('refuses another email on the field, without calling Auth', async () => {
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

	it('a creation that succeeded but answered 500 is reconciled as done', async () => {
		const { email, id, token } = await invite(['recipe_curator']);
		auth.failAfterNextCreate();
		expect(await anonymous().appInvitations.accept(form(token, email))).toEqual({ email });
		expect(auth.calls).toEqual(['POST', 'GET id']);
		expect((await actors.db.admin`select status from app.app_invitations where id = ${id}`)[0]!.status).toBe('accepted');
	});

	it('a second submission held until after the first one closed changes nothing', async () => {
		const { email, token } = await invite(['app_admin']);
		const hold = auth.holdNextCreate();
		const second = anonymous().appInvitations.accept(form(token, email, { password: 'seconda123', displayName: 'Altra', locale: 'en-GB' }));
		await hold.reached; // the second one has claimed and waits at Auth
		await anonymous().appInvitations.accept(form(token, email)); // the first one creates and closes
		hold.release();
		expect(await second).toEqual({ email });
		expect(await accounts(email)).toBe(1);
		expect(auth.passwords.get(email)).toBe('segreta123');
		expect(await profile(email)).toEqual({ display_name: 'Giulia', locale: 'it-IT' });
		expect(auth.calls.filter((c) => c.startsWith('PUT'))).toEqual([]);
	});

	it('a second submission arriving after the first creation but before its closing changes nothing', async () => {
		const { email, id, token } = await invite(['recipe_curator']);
		const hold = auth.holdAfterNextCreate();
		const first = anonymous().appInvitations.accept(form(token, email));
		await hold.reached; // the account exists, the first one has not closed yet
		expect(await anonymous().appInvitations.accept(form(token, email, { password: 'seconda123', displayName: 'Altra', locale: 'en-GB' }))).toEqual({ email });
		hold.release();
		expect(await first).toEqual({ email });
		expect(await accounts(email)).toBe(1);
		expect(auth.passwords.get(email)).toBe('segreta123');
		expect(await profile(email)).toEqual({ display_name: 'Giulia', locale: 'it-IT' });
		expect((await actors.db.admin`select status from app.app_invitations where id = ${id}`)[0]!.status).toBe('accepted');
	});

	it('a revocation between the creation and the closing stops the invitation: account without roles', async () => {
		const { admin, email, id, token } = await invite(['app_admin']);
		const hold = auth.holdAfterNextCreate();
		const pending = anonymous().appInvitations.accept(form(token, email));
		await hold.reached;
		await actors.db.admin`update app.app_invitations set expires_at = now() - interval '1 second' where id = ${id}`;
		await admin.client.appInvitations.revoke({ id }); // expired but pending: revocable
		hold.release();
		expect((await errorOf(pending)).code).toBe('invitation_unavailable');
		const [user] = await actors.db.admin<{ id: string }[]>`select id from auth.users where email = ${email}`;
		expect(await actors.db.admin`select role from app.user_roles where user_id = ${user!.id}`).toHaveLength(0);
	});

	it('ignores the token of a signed-in caller', async () => {
		const { email, token } = await invite();
		const someone = await actors.user();
		await someone.client.appInvitations.accept(form(token, email));
		expect(await accounts(email)).toBe(1);
	});

	it('answers rate_limited from the accept limiter', async () => {
		const { email, token } = await invite();
		const client = rpcClient<ContractRouterClient<Contract>>(actors.app, { ...actors.env, INVITE_ACCEPT_LIMIT: refuseAll });
		expect((await errorOf(client.appInvitations.accept(form(token, email)))).code).toBe('rate_limited');
	});

	it('refuses a 73-byte password before any work', async () => {
		const { email, token } = await invite();
		expect((await errorOf(anonymous().appInvitations.accept(form(token, email, { password: 'a'.repeat(73) })))).code).toBe('invalid');
		expect(auth.calls).toEqual([]);
	});
});
```

- [ ] **Step 3: Esegui** `npm test -w server -- app-invitations-accept` → FAIL.

- [ ] **Step 4: Implementa** in `server/src/app-invitations/router.ts` (importa `publicContext` da `../pipeline.ts`, `createInvitedAccount` da `../accounts/index.ts`, `appError` da `../errors.ts`, il tipo `GlobalRole` dal contratto):

```ts
		get: os.appInvitations.get.handler(async ({ context, input }) => {
			const ctx = publicContext(context);
			const hex = await hashTokenHex(input.token);
			const [row] = await ctx.anonDb((tx) => tx<{ invited_by_name: string | null; roles: GlobalRole[] }[]>`
				select invited_by_name, roles from app.app_invitation_by_token(decode(${hex}, 'hex'))`);
			if (!row) throw appError('invitation_unavailable');
			return { invitedBy: row.invited_by_name, roles: row.roles };
		}),

		/**
		 * Spec W9, «Accettazione»: reserve the id (short anon transaction, committed), create the
		 * account with no connection held, close in a second short transaction. Each step repeats;
		 * an existing account is never rewritten.
		 */
		accept: os.appInvitations.accept.handler(async ({ context, input }) => {
			const ctx = publicContext(context);
			const hex = await hashTokenHex(input.token);
			const reserved = await ctx
				.anonDb(async (tx) => {
					const [row] = await tx<{ user_id: string; email: string }[]>`
						select user_id, email from app.claim_app_invitation(decode(${hex}, 'hex'), ${input.email})`;
					return row!;
				})
				.catch(mapInvitationError);
			const outcome = await createInvitedAccount(ctx.env, {
				id: reserved.user_id,
				email: reserved.email,
				password: input.password,
				displayName: input.displayName,
				locale: input.locale,
			});
			if (outcome.status === 'email_taken') throw appError('not_allowed', { reason: 'account_exists' });
			await ctx
				.anonDb((tx) => tx`select app.complete_app_invitation(decode(${hex}, 'hex'), ${reserved.user_id}::uuid)`)
				.catch(mapInvitationError);
			return { email: reserved.email };
		}),
```

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
- Create: `server/src/family/time-zone.ts`, `server/src/family/time-zone.test.ts`
- Test: `server/test/family-create.test.ts`

**Interfaces:**
- Consumes: `app.create_family` (Task 2); `profileView(tx, locale)` di `server/src/profile/views.ts`; `profileViewSchema`, `measurementSystemSchema`.
- Produces: `family.create({ id, name, measurementSystem, timeZone? }) → ProfileView`; `resolveTimeZone(value: string | undefined): string`.

- [ ] **Step 1: Test che falliscono.** `server/src/family/time-zone.test.ts`:

```ts
import { expect, it } from 'vitest';
import { resolveTimeZone } from './time-zone.ts';

it('keeps a valid IANA zone and falls back to Europe/Rome', () => {
	expect(resolveTimeZone('Europe/London')).toBe('Europe/London');
	for (const value of [undefined, '', 'Mars/Base', 'Etc/Unknown']) expect(resolveTimeZone(value), String(value)).toBe('Europe/Rome');
});
```

`server/test/family-create.test.ts`:

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

	it('two concurrent creations with the same id give one family', async () => {
		const ada = await actors.user();
		const id = crypto.randomUUID();
		const input = { id, name: 'Ada', measurementSystem: 'metric' as const };
		await Promise.all([ada.client.family.create(input), ada.client.family.create(input)]);
		expect((await actors.db.admin`select count(*)::int as n from app.family_members where family_id = ${id}`)[0]!.n).toBe(1);
	});

	it('falls back to Europe/Rome for a missing or invalid time zone', async () => {
		const ugo = await actors.user();
		for (const timeZone of [undefined, 'Etc/Unknown', 'Mars/Base']) {
			const id = crypto.randomUUID();
			const view = await ugo.client.family.create({ id, name: 'X', measurementSystem: 'metric', ...(timeZone ? { timeZone } : {}) });
			expect(view.families.find((f) => f.id === id)?.timeZone, String(timeZone)).toBe('Europe/Rome');
		}
	});

	it("refuses the id of someone else's family", async () => {
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

(Controlla l'input di `menu.getOpening` nel contratto e adegua la chiamata se porta altri campi.)

- [ ] **Step 2: Esegui** `npm test -w server -- family-create time-zone` → FAIL.

- [ ] **Step 3: Implementa.** Contratto (`contract/src/family/index.ts`, importa `profileViewSchema`):

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

Se il trigger del database rifiutasse un fuso che `Intl` accetta (un alias), `create_family` risponde `22023`: in quel caso il gestore non può riprovare nella stessa transazione (annullata); per evitarlo `resolveTimeZone` restituisce il nome canonico di `resolvedOptions()`, che è quello che il trigger accetta. Se il test di un alias fallisse, valida il fuso con la stessa funzione del trigger in una query prima della creazione.

- [ ] **Step 4: Esegui** `npm test -w contract && npm test -w server && npm run typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add contract server
git commit -m "W9: creazione della famiglia da parte di chi la amministrerà, anche via MCP"
```

---

### Task 8: Stack locale con le iscrizioni spente e prova del percorso completo

**Files:**
- Modify: `supabase/config.toml` (`[auth] enable_signup = false`, `[auth.email] enable_signup = false`)
- Modify: `web/src/test/stack.ts` (`person()` con l'API di amministrazione), `scripts/password/password-stack.sh` e `scripts/oauth/agents-e2e.sh` (passano la chiave segreta locale), `scripts/oauth/agents-e2e.mjs` (prova del cambio di password)
- Create: `scripts/invitations/invite-stack.sh`, `server/test/stack/invitations.stack.test.ts`
- Modify: `.github/workflows/ci.yml`

Modifiche ai file di altre aree approvate dal coordinatore (w9-05, punto 2): minime e dichiarate nella PR.

**Interfaces:**
- Consumes: Worker completo (Task 3–7).
- Produces: variabili `STACK_SUPABASE_SECRET_KEY` (web e server) e `SUPABASE_SECRET_KEY` (per `agents-e2e.mjs`).

- [ ] **Step 1: Nome della chiave locale.** Con lo stack avviato: `supabase status -o env | cut -d= -f1`. Usa il nome che contiene la chiave `sb_secret_…` (atteso `SECRET_KEY`); se la CLI espone solo `SERVICE_ROLE_KEY`, usa quella: l'API di amministrazione accetta entrambe in `apikey` sullo stack locale. Nessun valore stampato.

- [ ] **Step 2: Iscrizioni spente** in `supabase/config.toml`, con un commento: «Off as in production (spec W9): test people are created with the admin API». Riavvia lo stack (`supabase stop && supabase start`).

- [ ] **Step 3: Helper delle prove esistenti.**

`web/src/test/stack.ts`: legge anche `process.env.STACK_SUPABASE_SECRET_KEY` (obbligatoria quando c'è lo stack) e `person()` diventa:

```ts
    /** A fresh person, created with the admin API (sign-ups are off locally too), then signed in on this device. */
    async person(password = 'first-password'): Promise<StackPerson> {
      const email = `password-${crypto.randomUUID()}@example.test`;
      const made = await fetch(`${base}/auth/v1/admin/users`, {
        method: 'POST',
        headers: { apikey: secret, 'content-type': 'application/json' },
        body: JSON.stringify({ email, password, email_confirm: true })
      });
      if (!made.ok) throw new Error(`admin create: ${made.status}`);
      const response = await post('/token?grant_type=password', { email, password });
      const session = (await response.json()) as StackPerson['session'] & { user: { id: string } };
      if (!response.ok || !session.access_token) throw new Error(`sign-in: ${response.status}`);
      created.push(session.user.id);
      return { email, id: session.user.id, session };
    },
```

In testa al file: `const secret = process.env.STACK_SUPABASE_SECRET_KEY;`, aggiunto a `stack` (`url && key && db && secret ? { url, key, db, secret } : null`) e letto in `createStack()` accanto agli altri.

`scripts/password/password-stack.sh`: legge `SECRET=$(value SECRET_KEY)` (o il nome trovato allo Step 1), lo aggiunge al controllo delle variabili mancanti e lo passa come `STACK_SUPABASE_SECRET_KEY="$SECRET"`.

`scripts/oauth/agents-e2e.sh`: legge `SECRET` allo stesso modo e lo passa a `node scripts/oauth/agents-e2e.mjs` come `SUPABASE_SECRET_KEY="$SECRET"` (non nel file `server/.env`).

`scripts/oauth/agents-e2e.mjs`, prova del cambio di password: sostituisci `POST ${AUTH}/signup` con la creazione amministrativa e l'accesso:

```js
	const created = await fetch(`${AUTH}/admin/users`, {
		method: 'POST',
		headers: { apikey: process.env.SUPABASE_SECRET_KEY, 'content-type': 'application/json' },
		body: JSON.stringify({ email, password: 'first-password', email_confirm: true }),
	});
	if (!created.ok) throw new Error(`admin create for the password check: ${created.status}`);
	const signin = await read(await fetch(`${AUTH}/token?grant_type=password`, {
		method: 'POST',
		headers: { apikey: KEY, 'content-type': 'application/json' },
		body: JSON.stringify({ email, password: 'first-password' }),
	}));
	if (signin.status !== 200 || !signin.body.access_token) throw new Error(`sign-in for the password check: ${signin.status}`);
	const web = signin.body;
```

e in testa al file un controllo che `SUPABASE_SECRET_KEY` sia presente.

- [ ] **Step 4: Test dello stack del server** (`server/test/stack/invitations.stack.test.ts`). Sta nella configurazione normale di Vitest (`test/**/*.test.ts` lo include) e si salta senza le variabili, come i test dello stack del web: nessuna esclusione. Usa l'app vera (`createApp` con contratto e router dell'app, chiavi JWKS dello stack, nessun `keys` di prova):

```ts
import { contract, type Contract } from '@app/contract';
import type { ContractRouterClient } from '@orpc/contract';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.ts';
import { router } from '../../src/router.ts';
import { allowAll, rpcClient, testEnv } from '../support/requests.ts';

const env = process.env;
const url = env.STACK_SUPABASE_URL;
const publishable = env.STACK_SUPABASE_PUBLISHABLE_KEY!;
const secret = env.STACK_SUPABASE_SECRET_KEY!;

describe.skipIf(!url)('invitations against the local stack', () => {
	const admin = postgres(env.STACK_DB_URL!, { max: 1, onnotice: () => {} });
	const appServer = new URL(env.STACK_DB_URL!);
	appServer.username = 'app_server';
	appServer.password = 'app_server_test';
	const workerEnv = { ...testEnv(appServer.toString()), SUPABASE_URL: url!, SUPABASE_PUBLISHABLE_KEY: publishable, SUPABASE_SECRET_KEY: secret, INVITE_READ_LIMIT: allowAll, INVITE_ACCEPT_LIMIT: allowAll };
	const app = createApp({ contract, router, resourceName: 'stack' });
	const client = (token?: string) => rpcClient<ContractRouterClient<Contract>>(app, workerEnv, token);
	const emails: string[] = [];
	afterAll(async () => {
		if (emails.length) await admin`delete from auth.users where email = any(${emails})`;
		await admin.end();
	});
	const signIn = async (email: string, password: string) => {
		const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
			method: 'POST', headers: { apikey: publishable, 'content-type': 'application/json' }, body: JSON.stringify({ email, password }),
		});
		return response.ok ? ((await response.json()) as { access_token: string }).access_token : null;
	};
	const newAdmin = async () => {
		const email = `admin-${crypto.randomUUID().slice(0, 8)}@x.it`;
		emails.push(email);
		const made = await fetch(`${url}/auth/v1/admin/users`, {
			method: 'POST', headers: { apikey: secret, 'content-type': 'application/json' },
			body: JSON.stringify({ email, password: 'admin-pass-1', email_confirm: true, user_metadata: { display_name: 'Federico' } }),
		});
		const { id } = (await made.json()) as { id: string };
		await admin`insert into app.user_roles (user_id, role) values (${id}, 'app_admin')`;
		return client((await signIn(email, 'admin-pass-1'))!);
	};

	it('sign-ups are off', async () => {
		const settings = await (await fetch(`${url}/auth/v1/settings`, { headers: { apikey: publishable } })).json();
		expect(settings.disable_signup).toBe(true);
	});

	it('the whole path: invitation, account, roles, family and menu', async () => {
		const federico = await newAdmin();
		const email = `giulia-${crypto.randomUUID().slice(0, 8)}@x.it`;
		emails.push(email);
		const { url: link } = await federico.appInvitations.create({ id: crypto.randomUUID(), email, roles: ['recipe_curator'] });
		const token = link.split('#')[1]!;
		expect((await client().appInvitations.get({ token })).invitedBy).toBe('Federico');
		expect(await client().appInvitations.accept({ token, email, displayName: 'Giulia', password: 'segreta123', locale: 'it-IT' })).toEqual({ email });
		const access = await signIn(email, 'segreta123');
		expect(access).not.toBeNull();
		const giulia = client(access!);
		expect((await giulia.profile.get({})).user).toMatchObject({ displayName: 'Giulia', globalRoles: ['recipe_curator'] });
		const familyId = crypto.randomUUID();
		await giulia.family.create({ id: familyId, name: 'Casa Giulia', measurementSystem: 'metric', timeZone: 'Europe/Rome' });
		await giulia.menu.getOpening({ familyId });
		expect((await admin`select count(*)::int as n from app.weeks where family_id = ${familyId}`)[0]!.n).toBeGreaterThan(0);
	});

	it('two concurrent acceptances with different passwords: one account, one password works', async () => {
		const federico = await newAdmin();
		const email = `twice-${crypto.randomUUID().slice(0, 8)}@x.it`;
		emails.push(email);
		const token = (await federico.appInvitations.create({ id: crypto.randomUUID(), email, roles: [] })).url.split('#')[1]!;
		const accept = (password: string) => client().appInvitations.accept({ token, email, displayName: 'Due', password, locale: 'it-IT' });
		const results = await Promise.allSettled([accept('prima-pass-1'), accept('seconda-pass-2')]);
		expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
		for (const r of results) if (r.status === 'rejected') expect((r.reason as { code: string }).code).toBe('invitation_unavailable');
		expect((await admin`select count(*)::int as n from auth.users where email = ${email}`)[0]!.n).toBe(1);
		const works = [await signIn(email, 'prima-pass-1'), await signIn(email, 'seconda-pass-2')].filter(Boolean);
		expect(works).toHaveLength(1);
	});

	it('the Data API does not reach the app schema', async () => {
		const response = await fetch(`${url}/rest/v1/rpc/app_invitation_by_token`, {
			method: 'POST',
			headers: { apikey: publishable, 'content-type': 'application/json', 'content-profile': 'app' },
			body: JSON.stringify({ p_token_hash: '\\x00' }),
		});
		expect(response.ok).toBe(false);
		expect((await response.json()).code).toBe('PGRST106');
	});
});
```

(`PGRST106` è il codice di PostgREST per uno schema non esposto: verificalo al primo giro e adegua l'asserzione sul codice se la versione locale risponde diversamente, sempre con `response.ok === false`.)

- [ ] **Step 5: Script** `scripts/invitations/invite-stack.sh`, sul modello di `password-stack.sh`:

```bash
#!/usr/bin/env bash
# scripts/invitations/invite-stack.sh — app invitations against the local stack (sign-ups off):
# the whole path through the real contract and pipeline with Supabase Auth. Used by CI.
set -euo pipefail
cd "$(dirname "$0")/../.."

status=$(${SUPABASE:-supabase} status -o env)
value() { printf '%s\n' "$status" | sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}$/\1/p"; }
API_URL=$(value API_URL)
DB_URL=$(value DB_URL)
KEY=$(value PUBLISHABLE_KEY)
SECRET=$(value SECRET_KEY)
[ -n "$API_URL" ] && [ -n "$DB_URL" ] && [ -n "$KEY" ] && [ -n "$SECRET" ] || { echo "supabase status: API_URL, DB_URL, PUBLISHABLE_KEY or SECRET_KEY missing (is Auth running?)"; exit 1; }

TEST_DATABASE_URL="$DB_URL" STACK_SUPABASE_URL="$API_URL" STACK_SUPABASE_PUBLISHABLE_KEY="$KEY" \
  STACK_SUPABASE_SECRET_KEY="$SECRET" STACK_DB_URL="$DB_URL" \
  npm test -w server -- test/stack/invitations.stack.test.ts
```

(`TEST_DATABASE_URL` serve al setup globale del server, che imposta la password di `app_server`.) `chmod +x`.

- [ ] **Step 6: CI.** In `.github/workflows/ci.yml`, dopo il passo della password: `- name: Invitations against the local stack` con `run: scripts/invitations/invite-stack.sh`. Controlla che i passi esistenti di password e OAuth ricevano la chiave tramite i loro script (Step 3), senza variabili nuove nel workflow.

- [ ] **Step 7: Esegui** in locale, con lo stack riavviato: `scripts/invitations/invite-stack.sh`, `scripts/password/password-stack.sh`, `scripts/oauth/agents-e2e.sh` → tutti PASS. Poi `npm test` dalla radice (i test dello stack si saltano senza variabili).

- [ ] **Step 8: Commit**

```bash
git add supabase/config.toml web/src/test/stack.ts scripts/password/password-stack.sh scripts/oauth scripts/invitations server/test/stack .github/workflows/ci.yml
git commit -m "W9: iscrizioni spente anche in locale e prova del percorso completo degli inviti"
```

---

### Task 9: Web: client, API finta, testi

**Files:**
- Modify: `web/src/api/types.ts` (`SERVER_AREAS` con `'appInvitations'`), `web/src/api/clients.ts`, `web/src/api/fake/fakeApi.ts`
- Create: `web/src/api/fake/fakeAppInvitations.ts`, `web/src/features/app-invitations/client.ts`
- Create: `web/src/i18n/messages/invitations.ts`, `web/src/i18n/messages/admin.ts`, `web/src/i18n/messages/onboarding.ts`; Modify: `web/src/i18n/messages/index.ts`
- Modify: `web/src/api/mutations.ts` (registro `INVALIDATIONS` e destinazione `appInvitations`)
- Test: `web/src/api/fake/fakeAppInvitations.test.ts`, `web/src/api/mutations.test.ts`

**Interfaces:**
- Produces:
  - `Api.appInvitations` (create/list/revoke; get/accept non usati dalla sessione) e `Api.family.create`;
  - `invitationClient: { get(input: { token: string }): Promise<{ invitedBy: string | null; roles: GlobalRole[] }>; accept(input: AcceptInput): Promise<{ email: string }> }` e `setInvitationClient(client)` per i test, in `features/app-invitations/client.ts`;
  - fake: `createFakeAppInvitations(latencyMs?)` ed `expireFakeInvitation(api, id)` per i test (sposta `expiresAt` nel passato; la finta calcola `expired` come il server e ammette la revoca), con token demo `FAKE_INVITE_TOKEN = 'demo'.padEnd(43, 'x')` valido;
  - `MutationName` con `'family.create'`, `'appInvitations.create'`, `'appInvitations.revoke'`; `MutationTarget` con `'appInvitations'`: `runAreaMutation` per queste due restituisce `{ view, applied }` con `applied` vero solo se la sessione che ha inviato è ancora aperta.

- [ ] **Step 1: Test che falliscono** (`fakeAppInvitations.test.ts`): `create` restituisce un link con `#`, `list` lo mostra `pending`, `revoke` lo segna `revoked`, `get(FAKE_INVITE_TOKEN)` dà `invitedBy: 'Federico'`, un token sconosciuto rifiuta con `new ApiError('invitation_unavailable')`; `family.create` della finta aggiunge la famiglia al profilo e la rende corrente.

In `web/src/api/mutations.test.ts` (sul modello dei test esistenti di `runAreaMutation`, con la sessione e il `QueryClient` di prova del file):

```ts
describe('app invitation mutations', () => {
  it('invalidate the list and are applied while the session is open, also after a change of language', async () => {
    const { deps, queryClient, setLocale } = setup(); // helper of this file: session, client, current language
    queryClient.setQueryData(['appInvitations', 'list', {}], { invitations: [] });
    const outcome = await runAreaMutation(deps, 'appInvitations.create', undefined, async () => {
      setLocale('en-GB'); // the language changes while the request runs
      return { invitation: { id: 'i' }, url: 'https://app.test/invite/app#t' };
    });
    expect(outcome.applied).toBe(true);
    expect(queryClient.getQueryState(['appInvitations', 'list', {}])?.isInvalidated).toBe(true);
  });

  it('a late answer after the session closed is not applied: no link shown, nothing touched', async () => {
    const { deps, queryClient, closeSession } = setup();
    queryClient.setQueryData(['appInvitations', 'list', {}], { invitations: [] });
    const outcome = await runAreaMutation(deps, 'appInvitations.revoke', undefined, async () => {
      closeSession();
      return { invitation: { id: 'i' } };
    });
    expect(outcome.applied).toBe(false);
  });

  it('two creations in a row are both applied', async () => {
    const { deps } = setup();
    const call = async () => ({ invitation: { id: crypto.randomUUID() }, url: 'https://app.test/invite/app#t' });
    const [a, b] = await Promise.all([runAreaMutation(deps, 'appInvitations.create', undefined, call), runAreaMutation(deps, 'appInvitations.create', undefined, call)]);
    expect([a.applied, b.applied]).toEqual([true, true]);
  });

  it('family.create writes the profile view', async () => {
    const { deps, queryClient } = setup();
    const view = { user: { id: 'u' }, families: [{ id: 'f' }], currentFamilyId: 'f' };
    await runAreaMutation(deps, 'family.create', undefined, async () => view);
    expect(queryClient.getQueryData(['profile', 'get', { locale: 'it-IT' }])).toEqual(view);
  });
});
```

(Se il file non ha già un aiuto come `setup()`, scrivilo accanto ai test con gli stessi oggetti che usano i test esistenti di `runAreaMutation`: `createSession` di prova, `QueryClient`, `currentLocale` modificabile.)

- [ ] **Step 2: Esegui** `npm test -w web -- fakeAppInvitations mutations` → FAIL.

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
  'invite.signInFailed': 'Il tuo account è pronto: entra con la password che hai scelto la prima volta.',
  'invite.toLogin': 'Vai all’accesso',
  'invite.rolesGranted': 'Ora sei anche {roles}',
  'role.recipe_curator': 'curatore del ricettario', 'role.app_admin': 'amministratore dell’app'
} as const;
```

e `en` con le stesse chiavi («You have an invitation to Cosa si mangia?», «Sent by {name}», …, «Sign out and continue», «This invitation is no longer valid», «Ask whoever invited you for a new link.», «Password too long: at most 72 bytes, and accented letters and emoji use more than one», …). Registra i tre file in `messages/index.ts` (in `it` ed `en`).

`web/src/api/mutations.ts`:

```ts
export type MutationTarget = 'profile' | 'family' | 'settings' | 'exclusions' | 'week' | 'appInvitations';
```

nel registro `INVALIDATIONS`:

```ts
  // The answer is the profile with the new family shown (spec W9).
  'family.create': { target: 'profile', stale: [] },
  // Not written in the cache: the list is read again; the link only reaches a session still open.
  'appInvitations.create': { target: 'appInvitations', stale: [] },
  'appInvitations.revoke': { target: 'appInvitations', stale: [] },
```

`TARGET_KEY` diventa `Record<Exclude<MutationTarget, 'profile' | 'appInvitations'>, [string, string]>`; in `applyMutation`, all'inizio:

```ts
  if (target === 'appInvitations') {
    // The link does not depend on the language: only a closed session drops the answer.
    if (!options.sessionOpen()) return false;
    void queryClient.invalidateQueries({ queryKey: ['appInvitations'] });
    return true;
  }
```

e in `runAreaMutation` la chiave di tracciamento è il nome della destinazione per `profile` e `appInvitations` (nessuna famiglia), altrimenti quella di oggi con la famiglia. Le pagine usano `useAreaMutation('appInvitations.create', undefined, …)` e leggono `outcome.applied` per mostrare il link.

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
    expect(await screen.findByText('Il tuo account è pronto: entra con la password che hai scelto la prima volta.')).toBeTruthy();
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

it('revokes an expired invitation too', async () => {
  const api = adminApi();
  const { invitation } = await api.appInvitations.create({ id: crypto.randomUUID(), email: 'old@x.it', roles: [] });
  expireFakeInvitation(api, invitation.id); // helper of fakeAppInvitations: moves expiresAt to the past
  const revoke = vi.spyOn(api.appInvitations, 'revoke');
  renderApp('/admin', { api });
  const row = (await screen.findByText('old@x.it')).closest('li')!;
  expect(within(row).getByText(/^Scaduto il /)).toBeTruthy();
  fireEvent.click(within(row).getByRole('button', { name: 'Revoca' }));
  fireEvent.click(within(await screen.findByRole('dialog', { name: 'Revocare l’invito?' })).getByRole('button', { name: 'Revoca' }));
  await waitFor(() => expect(revoke).toHaveBeenCalledWith({ id: invitation.id }));
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

`InvitationsSection.tsx`: titolo «Inviti all'app», pulsante «Nuovo invito» (apre `InviteSheet` vuoto), elenco da `appInvitationsQuery`: per ogni invito email, ruoli come etichette (`role.*` o «nessun ruolo»), riga di stato (`admin.expires`, `admin.expired`, `admin.acceptedBy`, `admin.revokedOn` con data in `Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' })`) e autore; «Nuovo link» e «Revoca» per `pending` **ed `expired`** (uno scaduto è ancora `pending` nel database e, se prenotato, può ancora essere chiuso: deve potersi fermare). «Nuovo link» apre `InviteSheet` precompilato e lo invia subito con un id nuovo; «Revoca» apre la conferma (`BottomSheet` con `admin.revokeConfirm` e pulsante rosso). Le mutazioni passano da `useAreaMutation('appInvitations.create' | 'appInvitations.revoke', undefined, …)` (registro del Task 9): l'elenco si rilegge, nessun aggiornamento ottimistico, e il foglio mostra il link solo se `outcome.applied` (una risposta arrivata dopo l'uscita non mostra nulla). Comandi disattivati con `!online`.

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
