# W10 Amministrazione di utenti e ruoli: piano di implementazione

> **Per gli agenti:** SKILL RICHIESTA: usa superpowers:subagent-driven-development
> (consigliata) o superpowers:executing-plans per eseguire il piano un compito alla volta.
> I passi usano le caselle (`- [ ]`).

**Obiettivo:** un `app_admin` cerca gli utenti, ne apre il dettaglio e assegna o toglie
`recipe_curator` e `app_admin`, dal web e via MCP, con l'ultimo amministratore protetto
anche sotto concorrenza.

**Architettura:** quattro funzioni `security definer` nello schema `app` (lettura di
`auth.users`, solo `app_admin`, lucchetto consultivo `app_admin_roles` per ogni modifica
di ruolo); area `users` del contratto con tre operazioni e strumenti MCP derivati; nel
web la sezione Utenti di `/admin`, la pagina `/admin/users/$userId` e il collegamento da
`account_exists`.

**Stack:** Postgres (Supabase locale, pgTAP), oRPC + zod nel Worker, Postgres.js, React
con TanStack Router e Query, Vitest.

**Spec:** `progetto/superpowers/specs/2026-10-15-amministrazione-utenti.md` (leggila
prima di cominciare; vale su questo piano in caso di dubbio).

## Vincoli globali

- Codice, identificatori, commenti e test in inglese; documenti in italiano; testi per
  l'utente in `it-IT` ed `en-GB` (AGENTS.md).
- Migrazioni solo additive: una nuova, `20261015100000_user_admin.sql`; nessuna modifica
  a quelle unite.
- Nessuna scrittura nello schema `auth`; la chiave segreta resta solo in
  `server/src/accounts/` (qui non si usa).
- Errori a codici: `forbidden`, `not_found`, `invalid`, `last_app_admin` (409, già
  definito).
- Nessun aggiornamento ottimistico nelle mutazioni web.
- Ricerca: ignora maiuscole e minuscole, **non gli accenti** (niente `unaccent`).
- Elenco: al più 50 righe, `more` se ce ne sono altre.
- Dettaglio: famiglie **solo per nome e ruolo**; niente numero di agenti; niente comando
  di cancellazione né segnaposto.
- Nessuna dipendenza nuova.
- Lucchetto `app_admin_roles`: lo prende **ogni percorso che toglie `app_admin`**, che
  sotto il lucchetto ricontrolla chi chiama e il numero di amministratori. Le
  assegnazioni non lo prendono (eccezione documentata nella spec, sezione 1).
- Il ricontrollo dopo il lucchetto vale solo in `read committed`: il Compito 4 lo
  verifica.
- I test che tolgono gli `app_admin` di prova li **rimettono sempre** (`afterEach` o
  `finally`), anche se falliscono.
- Commit piccoli in italiano, come nella storia del repository, con la riga
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Comandi

- Stack locale: `supabase start` (serve Podman; se la copia dei segreti fallisce, vedi il
  wrapper in `~/.cache/podwrap`).
- pgTAP: `supabase test db`.
- Server: `TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm test -w server -- <file>`.
- Web: `npm test -w web -- <file>`.
- Contratto: `npm test -w contract -- <file>`.
- Tutto: `npm run typecheck` e `npm test` (con `TEST_DATABASE_URL`).

## Punti da tenere d'occhio nella revisione

1. **Ricerca con caratteri speciali** (`%`, `_`, `\`, apostrofi come in «D'Angelo»):
   devono valere come testo, mai come caratteri jolly o errore. Test nel Compito 1 e nel
   Compito 3.
2. **Account senza profilo** (riga di `auth.users` senza `app.profiles`, possibile se il
   trigger mancasse): deve comparire con il nome preso dall'email, senza far fallire
   l'elenco. Test nel Compito 1.
3. **Doppio tocco sull'interruttore** durante una mutazione: una sola chiamata, nessuno
   stato a metà. Test nel Compito 9.
4. **Ricerca scritta in fretta**: una sola richiesta dopo il ritardo, e l'elenco
   precedente resta visibile durante il caricamento (niente salto della pagina
   sull'iPhone). Test nel Compito 8.
5. **Dettaglio dopo che l'utente ha perso `app_admin` da un'altra parte** (un altro
   amministratore lo ha retrocesso): la risposta `forbidden` porta a «Non hai accesso a
   questa pagina» senza i dati di prima, nel dettaglio e in `/admin`. Test nei Compiti 8
   e 9.

---

### Compito 1: migrazione e test pgTAP

**File:**
- Crea: `supabase/migrations/20261015100000_user_admin.sql`
- Crea: `supabase/tests/user_admin_test.sql`
- Modifica: `supabase/tests/coverage_test.sql` (elenco delle funzioni di `authenticated`)

**Interfacce:**
- Produce: `app.admin_users(p_query text, p_limit int) → table (id uuid, display_name text, email text, roles jsonb)`;
  `app.admin_user(p_user_id uuid) → table (id, display_name, email, roles jsonb, last_app_admin boolean)`;
  `app.admin_user_families(p_user_id uuid) → table (name text, role text)`;
  `app.set_user_role(p_user_id uuid, p_role text, p_granted boolean) → void`.
  SQLSTATE: `42501` non amministratore, `22023` argomento non valido, `P0A07` utente
  inesistente, `P0A08` ultimo amministratore.

- [ ] **Passo 1: scrivi il test pgTAP (fallisce: funzioni assenti)**

`supabase/tests/user_admin_test.sql`:

```sql
begin;
\ir helpers/setup.psql
\ir helpers/fixtures.psql
select no_plan();

-- The local database also holds users of the server tests: the checks below look only
-- at the fixture people, except where the test first removes other administrators.

-- Permissions: app admins only
select tests.login('dario');
select throws_ok($$select * from app.admin_users('', 50)$$, '42501', null, 'list: app admins only');
select throws_ok($$select * from app.admin_user(tests.uid('anna'))$$, '42501', null, 'detail: app admins only');
select throws_ok($$select * from app.admin_user_families(tests.uid('anna'))$$, '42501', null, 'families: app admins only');
select throws_ok($$select app.set_user_role(tests.uid('anna'), 'recipe_curator', true)$$, '42501', null, 'set role: app admins only');
reset role;

-- An account with no profile, no roles and no family (spec W10, delivery of A)
insert into auth.users (id, email, aud, role) values ('00000000-0000-4000-8000-0000000000a1', 'orphan_100%@test.local', 'authenticated', 'authenticated');
delete from app.profiles where user_id = '00000000-0000-4000-8000-0000000000a1';

select tests.login('elena');
select is((select display_name from app.admin_users('orphan', 50)), 'orphan_100%', 'no profile: name from the email');
select is((select roles from app.admin_users('orphan', 50)), '[]'::jsonb, 'no roles: empty array');

-- Search: name or email, case only, %, _ and \ as text
select is((select count(*) from app.admin_users('ANNA', 50) where id = tests.uid('anna')), 1::bigint, 'name, any case');
select is((select count(*) from app.admin_users('anna@TEST', 50) where id = tests.uid('anna')), 1::bigint, 'email, any case');
select is((select count(*) from app.admin_users('100%', 50)), 1::bigint, '% is text');
select is((select count(*) from app.admin_users('n_a', 50) where id = tests.uid('anna')), 0::bigint, '_ is text, not a wildcard');
select is((select count(*) from app.admin_users('\', 50)), 0::bigint, 'a backslash is text');
select is((select count(*) from app.admin_users('D''Angelo', 50)), 0::bigint, 'an apostrophe is text');
select is((select roles from app.admin_users('elena', 50)), '["app_admin"]'::jsonb, 'roles as a jsonb array');

-- Limit: one row more than asked, so the server knows there are more
select is((select count(*) from app.admin_users('', 2)), 3::bigint, 'limit + 1 rows');
select throws_ok($$select * from app.admin_users('', 0)$$, '22023', null, 'limit too small');
select throws_ok($$select * from app.admin_users('', 201)$$, '22023', null, 'limit too large');

-- Detail and families: name and role only
select is((select last_app_admin from app.admin_user(tests.uid('anna'))), false, 'not an admin: not the last one');
select is((select count(*) from app.admin_user(gen_random_uuid())), 0::bigint, 'unknown user: no row');
select is(
	array(select name || ':' || role from app.admin_user_families(tests.uid('anna')) order by 1),
	array['test-Bianchi:member', 'test-Rossi:family_admin'], 'families by name and role');
reset role;
-- proargnames holds p_user_id, then the output columns: nothing but name and role.
select is(
	(select array_agg(a order by n) from unnest((select proargnames from pg_proc where proname = 'admin_user_families')) with ordinality as x(a, n) where n > 1),
	array['name', 'role'], 'families: only name and role');

-- Set role: idempotent both ways, granted_by recorded, bad role refused, unknown user refused
select tests.login('elena');
select lives_ok($$select app.set_user_role(tests.uid('anna'), 'recipe_curator', true)$$, 'grant curator');
select lives_ok($$select app.set_user_role(tests.uid('anna'), 'recipe_curator', true)$$, 'grant again');
reset role;
select is((select count(*) from app.user_roles where user_id = tests.uid('anna') and role = 'recipe_curator'), 1::bigint, 'one row');
select is((select granted_by from app.user_roles where user_id = tests.uid('anna') and role = 'recipe_curator'), tests.uid('elena'), 'granted_by is the caller');
select tests.login('elena');
select lives_ok($$select app.set_user_role(tests.uid('anna'), 'recipe_curator', false)$$, 'remove curator');
select lives_ok($$select app.set_user_role(tests.uid('anna'), 'recipe_curator', false)$$, 'remove again');
select throws_ok($$select app.set_user_role(tests.uid('anna'), 'root', true)$$, '22023', null, 'unknown role');
select throws_ok($$select app.set_user_role(tests.uid('anna'), 'app_admin', null)$$, '22023', null, 'null granted');
select throws_ok($$select app.set_user_role(gen_random_uuid(), 'recipe_curator', true)$$, 'P0A07', null, 'unknown user');
reset role;
select is((select count(*) from app.user_roles where user_id = tests.uid('anna')), 0::bigint, 'anna has no roles');

-- Last app admin: the other administrators of the database go first (rolled back at the end)
delete from app.user_roles where role = 'app_admin' and user_id <> tests.uid('elena');
select tests.login('elena');
select is((select last_app_admin from app.admin_user(tests.uid('elena'))), true, 'elena is the last admin');
select throws_ok($$select app.set_user_role(tests.uid('elena'), 'app_admin', false)$$, 'P0A08', null, 'the last admin keeps the role');
select lives_ok($$select app.set_user_role(tests.uid('anna'), 'app_admin', true)$$, 'appoint anna');
select is((select last_app_admin from app.admin_user(tests.uid('elena'))), false, 'no longer the last');
select lives_ok($$select app.set_user_role(tests.uid('elena'), 'app_admin', false)$$, 'elena gives up her role');
select throws_ok($$select * from app.admin_users('', 50)$$, '42501', null, 'and loses access at once');
reset role;
select tests.login('anna');
select throws_ok($$select app.set_user_role(tests.uid('anna'), 'app_admin', false)$$, 'P0A08', null, 'anna is now the last admin');
reset role;

-- No direct writes for users
select tests.login('anna');
select throws_ok($$insert into app.user_roles (user_id, role) values (tests.uid('bruno'), 'app_admin')$$, '42501', null, 'no direct insert');
select throws_ok($$delete from app.user_roles$$, '42501', null, 'no direct delete');
reset role;

select * from finish();
rollback;
```

- [ ] **Passo 2: esegui e verifica che fallisce**

Run: `supabase test db`
Atteso: FAIL in `user_admin_test.sql` («function app.admin_users(unknown, integer) does not exist»).

- [ ] **Passo 3: scrivi la migrazione**

`supabase/migrations/20261015100000_user_admin.sql`:

```sql
-- App administration of users and global roles (spec W10, section 1). Additive: functions only.
-- Every function is for app admins: it reads auth.users (email) and never writes there.

-- Users with email and global roles, by name or email. Case only: no unaccent (spec W10, decision 2).
-- One row more than p_limit: the server answers `more` from it.
create function app.admin_users(p_query text, p_limit int)
returns table (id uuid, display_name text, email text, roles jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare
	v_text text := coalesce(btrim(p_query), '');
	v_pattern text;
begin
	if not app.has_role('app_admin') then
		raise exception 'app admins only' using errcode = '42501';
	end if;
	if p_limit is null or p_limit < 1 or p_limit > 200 then
		raise exception 'limit out of range' using errcode = '22023';
	end if;
	-- The person's \, % and _ are text, not wildcards.
	v_pattern := '%' || replace(replace(replace(v_text, '\', '\\'), '%', '\%'), '_', '\_') || '%';
	return query
		select u.id,
			coalesce(p.display_name, nullif(split_part(coalesce(u.email, ''), '@', 1), ''), 'User'),
			coalesce(u.email, '')::text,
			coalesce((select jsonb_agg(r.role order by r.role) from app.user_roles r where r.user_id = u.id), '[]'::jsonb)
		from auth.users u
		left join app.profiles p on p.user_id = u.id
		where v_text = '' or p.display_name ilike v_pattern escape '\' or u.email ilike v_pattern escape '\'
		order by lower(coalesce(p.display_name, u.email, '')), u.id
		limit p_limit + 1;
end;
$$;

-- One user; last_app_admin is a hint for the interface, set_user_role is the guarantee.
create function app.admin_user(p_user_id uuid)
returns table (id uuid, display_name text, email text, roles jsonb, last_app_admin boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
	if not app.has_role('app_admin') then
		raise exception 'app admins only' using errcode = '42501';
	end if;
	return query
		select u.id,
			coalesce(p.display_name, nullif(split_part(coalesce(u.email, ''), '@', 1), ''), 'User'),
			coalesce(u.email, '')::text,
			coalesce((select jsonb_agg(r.role order by r.role) from app.user_roles r where r.user_id = u.id), '[]'::jsonb),
			exists (select 1 from app.user_roles r where r.user_id = u.id and r.role = 'app_admin')
				and not exists (select 1 from app.user_roles r where r.user_id <> u.id and r.role = 'app_admin')
		from auth.users u
		left join app.profiles p on p.user_id = u.id
		where u.id = p_user_id;
end;
$$;

-- The families of a user by name and role only: app admins never see family contents (spec, section 2).
create function app.admin_user_families(p_user_id uuid)
returns table (name text, role text)
language plpgsql stable security definer set search_path = '' as $$
begin
	if not app.has_role('app_admin') then
		raise exception 'app admins only' using errcode = '42501';
	end if;
	return query
		select f.name, m.role
		from app.family_members m
		join app.families f on f.id = m.family_id
		where m.user_id = p_user_id;
end;
$$;

-- Gives or removes a global role; idempotent. The last app admin keeps the role.
create function app.set_user_role(p_user_id uuid, p_role text, p_granted boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
	if not app.has_role('app_admin') then
		raise exception 'app admins only' using errcode = '42501';
	end if;
	if p_role is null or p_role not in ('recipe_curator', 'app_admin') or p_granted is null then
		raise exception 'unknown role' using errcode = '22023';
	end if;
	if not p_granted and p_role = 'app_admin' then
		-- RULE: every path that removes app_admin (this function, the account deletion of activity C,
		-- any future script) takes this same lock and, under it, checks again both the caller and
		-- the number of administrators. Otherwise two administrators removing each other at the
		-- same moment can leave the app without one. Assignments (here and in
		-- app.complete_app_invitation) do not take it: they can only add administrators.
		perform pg_advisory_xact_lock(hashtextextended('app_admin_roles', 0));
		-- New statements after the lock: under read committed they see what the previous holder
		-- committed. A caller demoted while waiting is refused.
		if not app.has_role('app_admin') then
			raise exception 'app admins only' using errcode = '42501';
		end if;
		if exists (select 1 from app.user_roles r where r.user_id = p_user_id and r.role = 'app_admin')
			and not exists (select 1 from app.user_roles r where r.user_id <> p_user_id and r.role = 'app_admin') then
			raise exception 'last app admin' using errcode = 'P0A08';
		end if;
	end if;
	if not exists (select 1 from auth.users u where u.id = p_user_id) then
		raise exception 'unknown user' using errcode = 'P0A07';
	end if;
	if p_granted then
		insert into app.user_roles (user_id, role, granted_by) values (p_user_id, p_role, auth.uid())
			on conflict (user_id, role) do nothing;
	else
		delete from app.user_roles r where r.user_id = p_user_id and r.role = p_role;
	end if;
end;
$$;

revoke execute on function app.admin_users(text, int) from public;
revoke execute on function app.admin_user(uuid) from public;
revoke execute on function app.admin_user_families(uuid) from public;
revoke execute on function app.set_user_role(uuid, text, boolean) from public;
grant execute on function app.admin_users(text, int) to authenticated;
grant execute on function app.admin_user(uuid) to authenticated;
grant execute on function app.admin_user_families(uuid) to authenticated;
grant execute on function app.set_user_role(uuid, text, boolean) to authenticated;
```

`app.has_role` è `stable`: chiamata in un'istruzione nuova dentro una funzione
`volatile` usa la fotografia di quell'istruzione, quindi dopo il lucchetto vede la
retrocessione appena confermata.

- [ ] **Passo 4: aggiorna `coverage_test.sql`**

Nell'asserzione «authenticated executes only authorisation and pure functions»
aggiungi in ordine alfabetico (`collate "C"`): `admin_user`, `admin_user_families`,
`admin_users` all'inizio e `set_user_role` dopo `session_is_active`:

```sql
	array['admin_user', 'admin_user_families', 'admin_users', 'app_invitations_view', 'can_access_list', 'can_access_slot', 'can_access_week', 'catalogue_author_names', 'connected_agents', 'create_app_invitation', 'create_family', 'has_role', 'is_family_admin',
		'is_localized_list', 'is_localized_text', 'is_member', 'meal_action_restores_closed_draft', 'meal_passed_at', 'recipe_is_cited', 'recipe_version_at',
		'revoke_app_invitation', 'session_is_active', 'set_user_role', 'shares_family', 'unit_dimension'],
```

- [ ] **Passo 5: applica e riesegui**

Run: `supabase db reset` (applica la migrazione al database locale), poi `supabase test db`
Atteso: PASS di tutti i file, compresi `user_admin_test.sql` e `coverage_test.sql`.
Se `admin_users('', 2)` non dà 3 righe perché il database ha pochi utenti, la
fixture ha comunque sette persone più l'orfano: deve passare.

- [ ] **Passo 6: commit**

```bash
git add supabase/migrations/20261015100000_user_admin.sql supabase/tests/user_admin_test.sql supabase/tests/coverage_test.sql
git commit -m "Database: funzioni dell'amministrazione di utenti e ruoli (W10)"
```

---

### Compito 2: area `users` del contratto

**File:**
- Crea: `contract/src/users/index.ts`
- Crea: `contract/src/users/users-contract.test.ts`
- Modifica: `contract/src/contract.ts` (registrazione), `contract/src/index.ts` (export)

**Interfacce:**
- Consuma: `globalRoleSchema` (`contract/src/app-invitations/index.ts`), `familyRoleSchema`
  (`contract/src/profile/index.ts`), `op`, `errorDefinitions`.
- Produce: `usersContract` con `list`, `get`, `setRole`; tipi `UserRow`, `UserDetail`;
  costante `USERS_LIST_LIMIT = 50`; `userQuerySchema`.

- [ ] **Passo 1: test del contratto (fallisce)**

`contract/src/users/users-contract.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { checkContract, contract } from '../index.ts';
import { userQuerySchema } from './index.ts';

describe('users contract', () => {
	it('follows the conventions', () => {
		expect(checkContract({ users: contract.users })).toEqual([]);
	});
	it('trims the query and keeps it short', () => {
		expect(userQuerySchema.parse('  Anna ')).toBe('Anna');
		expect(userQuerySchema.safeParse('a'.repeat(100)).success).toBe(true);
		expect(userQuerySchema.safeParse('a'.repeat(101)).success).toBe(false);
	});
	it('accepts only the two global roles', () => {
		const input = contract.users.setRole['~orpc'].inputSchema!;
		const id = crypto.randomUUID();
		expect(input['~standard'].validate({ id, role: 'recipe_curator', granted: true })).not.toHaveProperty('issues');
		expect(input['~standard'].validate({ id, role: 'root', granted: true })).toHaveProperty('issues');
	});
	it('marks reads and writes for MCP', () => {
		expect(contract.users.list['~orpc'].meta.mcp).toEqual({ readOnly: true });
		expect(contract.users.get['~orpc'].meta.mcp).toEqual({ readOnly: true });
		expect(contract.users.setRole['~orpc'].meta.mcp).toEqual({ readOnly: false });
	});
});
```

- [ ] **Passo 2: esegui**

Run: `npm test -w contract -- src/users/users-contract.test.ts`
Atteso: FAIL («Failed to resolve import "./index.ts"»).

- [ ] **Passo 3: scrivi l'area**

`contract/src/users/index.ts`:

```ts
import { z } from 'zod';
import { globalRoleSchema } from '../app-invitations/index.ts';
import { errorDefinitions } from '../errors.ts';
import { op } from '../op.ts';
import { familyRoleSchema } from '../profile/index.ts';

/** At most this many users per answer; `more` says there are others (spec W10, decision 1). */
export const USERS_LIST_LIMIT = 50;
export const userQuerySchema = z.string().trim().max(100);

export const userRowSchema = z.object({
	id: z.uuid(),
	displayName: z.string(),
	email: z.string(),
	roles: z.array(globalRoleSchema),
});
export type UserRow = z.infer<typeof userRowSchema>;

/** Families by name and role only: app admins never see family contents (spec, section 2). */
export const userDetailSchema = z.object({
	user: userRowSchema.extend({ lastAppAdmin: z.boolean() }),
	families: z.array(z.object({ name: z.string(), role: familyRoleSchema })),
});
export type UserDetail = z.infer<typeof userDetailSchema>;

const adminOp = (readOnly: boolean) => op({ mcp: { readOnly }, offline: false, role: 'appAdmin' });

export const usersContract = {
	list: adminOp(true)
		.route({
			method: 'GET',
			path: '/users',
			summary: `Users with email and global roles, by name or email (case-insensitive, accents count), at most ${USERS_LIST_LIMIT}; \`more\` means narrow the search (app administrators)`,
		})
		.input(z.object({ query: userQuerySchema.optional() }))
		.output(z.object({ users: z.array(userRowSchema), more: z.boolean() })),
	get: adminOp(true)
		.route({ method: 'GET', path: '/users/{id}', summary: 'One user: email, global roles, whether they are the last app administrator, families by name and role only (app administrators)' })
		.errors({ not_found: errorDefinitions.not_found })
		.input(z.object({ id: z.uuid() }))
		.output(userDetailSchema),
	setRole: adminOp(false)
		.route({
			method: 'POST',
			path: '/users/{id}/roles',
			summary:
				'Give (granted: true) or remove (granted: false) a global role; repeating it changes nothing. Before appointing an app administrator, and before removing app_admin from yourself, ask the user for explicit confirmation. Removing your own app_admin ends your administration tools from the next call. The last app administrator cannot lose the role (app administrators)',
		})
		.errors({ not_found: errorDefinitions.not_found, last_app_admin: errorDefinitions.last_app_admin })
		.input(z.object({ id: z.uuid(), role: globalRoleSchema, granted: z.boolean() }))
		.output(userDetailSchema),
};
```

In `contract/src/contract.ts` aggiungi l'import e la riga `users: usersContract,` accanto
ad `appInvitations`. In `contract/src/index.ts` aggiungi `export * from './users/index.ts';`
dopo la riga di `app-invitations`.

Se `errorDefinitions.last_app_admin` non esiste in `contract/src/errors.ts`, controlla
il nome con `grep -n last_app_admin contract/src/errors.ts`: il codice c'è (riga 12) e va
usato come gli altri.

- [ ] **Passo 4: esegui**

Run: `npm test -w contract` e `npm run typecheck -w contract`
Atteso: PASS.

- [ ] **Passo 5: commit**

```bash
git add contract/src/users contract/src/contract.ts contract/src/index.ts
git commit -m "Contratto: area users per l'amministrazione di utenti e ruoli (W10)"
```

---

### Compito 3: gestori del server e test

**File:**
- Crea: `server/src/users/router.ts`, `server/src/users/db-errors.ts`
- Crea: `server/test/users.test.ts`
- Crea: `server/test/support/app-admins.ts`
- Modifica: `server/src/router.ts`

**Interfacce:**
- Consuma: le funzioni del Compito 1, `usersContract` del Compito 2, `Implementer`
  (`server/src/pipeline.ts`), `appError` (`server/src/errors.ts`).
- Produce: `usersRouter(os)`; supporto dei test `onlyAppAdmins(db, keep: string[])` che
  toglie gli altri `app_admin` e restituisce `restore()`.

- [ ] **Passo 1: supporto dei test per gli amministratori**

`server/test/support/app-admins.ts`:

```ts
import type postgres from 'postgres';

/**
 * Leaves `keep` as the only app admins of the shared test database and returns how to put the
 * others back. Callers restore in `finally` or `afterEach`, also when the test fails (spec W10).
 */
export async function onlyAppAdmins(admin: postgres.Sql, keep: string[]): Promise<() => Promise<void>> {
	const removed = await admin<{ user_id: string; granted_by: string | null; granted_at: Date }[]>`
		delete from app.user_roles where role = 'app_admin' and not (user_id = any(${keep}::uuid[]))
		returning user_id, granted_by, granted_at`;
	return async () => {
		for (const row of removed) {
			await admin`insert into app.user_roles (user_id, role, granted_by, granted_at)
				values (${row.user_id}, 'app_admin', ${row.granted_by}, ${row.granted_at})
				on conflict (user_id, role) do nothing`;
		}
	};
}
```

- [ ] **Passo 2: test del server (fallisce)**

`server/test/users.test.ts`:

```ts
import { USERS_LIST_LIMIT } from '@app/contract';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { collectTools } from '../src/mcp.ts';
import { contract } from '@app/contract';
import { errorOf, setupActors, type Actors } from './support/actors.ts';
import { onlyAppAdmins } from './support/app-admins.ts';
import { hasDatabase } from './support/db.ts';
import { mcp, toolBody } from './support/requests.ts';

describe('users tools', () => {
	it('exposes list and get as read-only tools and setRole as a write', () => {
		const tools = new Map(collectTools(contract).map((tool) => [tool.name, tool.readOnly]));
		expect(tools.get('users_list')).toBe(true);
		expect(tools.get('users_get')).toBe(true);
		expect(tools.get('users_setRole')).toBe(false);
	});
});

describe.skipIf(!hasDatabase)('users administration', () => {
	let actors: Actors;
	let restore: (() => Promise<void>) | undefined;
	beforeAll(async () => {
		actors = await setupActors();
	});
	afterEach(async () => {
		await restore?.();
		restore = undefined;
	});
	afterAll(() => actors?.close());

	const admin = async (options: { agent?: boolean } = {}) => {
		const person = await actors.user(options);
		await actors.db.grantGlobalRole(person.userId, 'app_admin');
		return person;
	};
	const emailOf = (userId: string) => `${userId}@test.local`;
	const call = (token: string, name: string, args: unknown) => mcp(actors.app, actors.env, token, 'tools/call', { name, arguments: args });

	it('is forbidden to non app admins, on every operation and over MCP', async () => {
		const anna = await actors.user();
		const id = anna.userId;
		expect((await errorOf(anna.client.users.list({}))).code).toBe('forbidden');
		expect((await errorOf(anna.client.users.get({ id }))).code).toBe('forbidden');
		expect((await errorOf(anna.client.users.setRole({ id, role: 'recipe_curator', granted: true }))).code).toBe('forbidden');
		const agent = await actors.user({ agent: true });
		const result = await call(agent.token, 'users_list', {});
		expect(result.body.result.isError).toBe(true);
	});

	it('finds people by email and by name, including an account with no roles and no family', async () => {
		const federico = await admin();
		const orphan = await actors.user();
		const byEmail = await federico.client.users.list({ query: emailOf(orphan.userId).toUpperCase() });
		expect(byEmail.users).toEqual([{ id: orphan.userId, displayName: expect.any(String), email: emailOf(orphan.userId), roles: [] }]);
		expect(byEmail.more).toBe(false);
		const [{ display_name }] = await actors.db.admin<{ display_name: string }[]>`select display_name from app.profiles where user_id = ${orphan.userId}`;
		expect((await federico.client.users.list({ query: display_name })).users.map((u) => u.id)).toContain(orphan.userId);
	});

	it('treats % and _ in the query as text', async () => {
		const federico = await admin();
		expect((await federico.client.users.list({ query: '%' })).users).toEqual([]);
		expect((await federico.client.users.list({ query: '_' })).users).toEqual([]);
	});

	it('answers at most the limit and says there are more', async () => {
		const federico = await admin();
		const [{ n }] = await actors.db.admin<{ n: number }[]>`select count(*)::int as n from auth.users`;
		for (let i = n; i <= USERS_LIST_LIMIT; i++) await actors.user();
		const page = await federico.client.users.list({});
		expect(page.users).toHaveLength(USERS_LIST_LIMIT);
		expect(page.more).toBe(true);
	});

	it('reads one user with families by name and role only', async () => {
		const federico = await admin();
		const anna = await actors.user();
		await actors.db.createFamily([{ userId: anna.userId, role: 'family_admin' }]);
		const detail = await federico.client.users.get({ id: anna.userId });
		expect(detail).toEqual({
			user: { id: anna.userId, displayName: expect.any(String), email: emailOf(anna.userId), roles: [], lastAppAdmin: false },
			families: [{ name: 'Test', role: 'family_admin' }],
		});
		expect(Object.keys(detail.families[0]!)).toEqual(['name', 'role']);
		expect((await errorOf(federico.client.users.get({ id: crypto.randomUUID() }))).code).toBe('not_found');
	});

	it('gives and removes roles, idempotently, answering the new detail', async () => {
		const federico = await admin();
		const anna = await actors.user();
		const given = await federico.client.users.setRole({ id: anna.userId, role: 'recipe_curator', granted: true });
		expect(given.user.roles).toEqual(['recipe_curator']);
		expect((await federico.client.users.setRole({ id: anna.userId, role: 'recipe_curator', granted: true })).user.roles).toEqual(['recipe_curator']);
		const both = await federico.client.users.setRole({ id: anna.userId, role: 'app_admin', granted: true });
		expect(both.user.roles).toEqual(['app_admin', 'recipe_curator']);
		await federico.client.users.setRole({ id: anna.userId, role: 'app_admin', granted: false });
		const removed = await federico.client.users.setRole({ id: anna.userId, role: 'recipe_curator', granted: false });
		expect(removed.user.roles).toEqual([]);
		expect((await federico.client.users.setRole({ id: anna.userId, role: 'recipe_curator', granted: false })).user.roles).toEqual([]);
		expect((await errorOf(federico.client.users.setRole({ id: crypto.randomUUID(), role: 'recipe_curator', granted: true }))).code).toBe('not_found');
	});

	it('protects the last app admin, also from themselves', async () => {
		const federico = await admin();
		restore = await onlyAppAdmins(actors.db.admin, [federico.userId]);
		expect((await federico.client.users.get({ id: federico.userId })).user.lastAppAdmin).toBe(true);
		const error = await errorOf(federico.client.users.setRole({ id: federico.userId, role: 'app_admin', granted: false }));
		expect(error.code).toBe('last_app_admin');
		expect((await federico.client.users.get({ id: federico.userId })).user.roles).toContain('app_admin');
	});

	it('giving up one’s own role works with another admin and counts at once, on the web and for a connected agent', async () => {
		const federico = await admin();
		const lucia = await admin();
		const agent = await actors.user({ agent: true });
		await actors.db.grantGlobalRole(agent.userId, 'app_admin');
		// The agent's token was issued before the change: no new session is needed for it to count.
		expect(toolBody(await call(agent.token, 'users_get', { id: lucia.userId })).user.id).toBe(lucia.userId);
		await federico.client.users.setRole({ id: agent.userId, role: 'app_admin', granted: false });
		expect((await call(agent.token, 'users_get', { id: lucia.userId })).body.result.isError).toBe(true);
		const after = await federico.client.users.setRole({ id: federico.userId, role: 'app_admin', granted: false });
		expect(after.user.roles).toEqual([]);
		expect((await errorOf(federico.client.users.list({}))).code).toBe('forbidden');
	});

	it('lets an administrator agent give a role over MCP', async () => {
		const agent = await admin({ agent: true });
		const anna = await actors.user();
		const result = await call(agent.token, 'users_setRole', { id: anna.userId, role: 'recipe_curator', granted: true });
		expect(toolBody(result).user.roles).toEqual(['recipe_curator']);
	});
});
```

Nota sul test di `more`: conta gli account già presenti nel database dei test e ne
crea solo quanti servono per superare il limite.

- [ ] **Passo 3: esegui**

Run: `TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm test -w server -- test/users.test.ts`
Atteso: FAIL (`users_list` assente; il client non ha `users`).

- [ ] **Passo 4: scrivi i gestori**

`server/src/users/db-errors.ts`:

```ts
import { appError } from '../errors.ts';

/** SQLSTATEs raised by the functions of 20261015100000_user_admin.sql. */
export function mapUsersError(error: unknown): never {
	const code = (error as { code?: unknown } | null)?.code;
	switch (code) {
		case '42501': throw appError('forbidden');
		case '22023': throw appError('invalid', { issues: [{ path: ['role'], code: 'invalid_value' }] });
		case 'P0A07': throw appError('not_found');
		case 'P0A08': throw appError('last_app_admin');
		default: throw error;
	}
}
```

`server/src/users/router.ts`:

```ts
import { USERS_LIST_LIMIT, type GlobalRole, type Locale, type UserDetail } from '@app/contract';
import type { Tx } from '../db.ts';
import { appError } from '../errors.ts';
import type { Implementer } from '../pipeline.ts';
import { mapUsersError } from './db-errors.ts';

interface UserRowDb { id: string; display_name: string; email: string; roles: GlobalRole[] }

const rowView = (row: UserRowDb) => ({ id: row.id, displayName: row.display_name, email: row.email, roles: row.roles });

/** One user, read in the caller's transaction (after a change, the changed state). */
async function detail(tx: Tx, id: string, locale: Locale): Promise<UserDetail> {
	const [row] = await tx<(UserRowDb & { last_app_admin: boolean })[]>`
		select id, display_name, email, roles, last_app_admin from app.admin_user(${id}::uuid)`.catch(mapUsersError);
	if (!row) throw appError('not_found');
	const families = await tx<{ name: string; role: 'family_admin' | 'member' }[]>`
		select name, role from app.admin_user_families(${id}::uuid)`.catch(mapUsersError);
	const collator = new Intl.Collator(locale);
	return {
		user: { ...rowView(row), lastAppAdmin: row.last_app_admin },
		families: families.map(({ name, role }) => ({ name, role })).sort((a, b) => collator.compare(a.name, b.name)),
	};
}

/** App administration of users and global roles (spec W10). The database checks app_admin again. */
export function usersRouter(os: Implementer) {
	return {
		list: os.users.list.handler(async ({ context, input }) => {
			const rows = await context.tx<UserRowDb[]>`
				select id, display_name, email, roles from app.admin_users(${input.query ?? ''}, ${USERS_LIST_LIMIT})`.catch(mapUsersError);
			return { users: rows.slice(0, USERS_LIST_LIMIT).map(rowView), more: rows.length > USERS_LIST_LIMIT };
		}),
		get: os.users.get.handler(({ context, input }) => detail(context.tx, input.id, context.locale)),
		setRole: os.users.setRole.handler(async ({ context, input }) => {
			// The detail first: after giving up one's own app_admin the reading functions refuse.
			const before = await detail(context.tx, input.id, context.locale);
			await context.tx`select app.set_user_role(${input.id}::uuid, ${input.role}, ${input.granted})`.catch(mapUsersError);
			if (input.id === context.userId && input.role === 'app_admin' && !input.granted) {
				return { ...before, user: { ...before.user, roles: before.user.roles.filter((role) => role !== 'app_admin'), lastAppAdmin: false } };
			}
			return detail(context.tx, input.id, context.locale);
		}),
	};
}
```


Perché `setRole` legge il dettaglio **prima** della modifica: dopo la rinuncia al
proprio `app_admin`, nella stessa transazione `admin_user` rifiuterebbe con `42501`
perché chi chiama non è più amministratore; in quel caso la risposta si costruisce dal
dettaglio letto prima. La lettura preliminare dà anche `not_found` per un id
inesistente prima di mettersi in fila sul lucchetto. `context.userId` è nel contesto
della pipeline (`server/src/pipeline.ts`, riga 36).

In `server/src/router.ts` aggiungi `import { usersRouter } from './users/router.ts';` e la
riga `users: usersRouter(os),` dopo `appInvitations`.

- [ ] **Passo 5: esegui**

Run: `TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm test -w server -- test/users.test.ts`
Atteso: PASS. Poi `npm run typecheck -w server`: PASS.

- [ ] **Passo 6: commit**

```bash
git add server/src/users server/src/router.ts server/test/users.test.ts server/test/support/app-admins.ts
git commit -m "Server: operazioni e strumenti MCP dell'amministrazione degli utenti (W10)"
```

---

### Compito 4: concorrenza sull'ultimo amministratore

**File:**
- Crea: `server/test/users-locks.test.ts`

**Interfacce:**
- Consuma: `holdTransaction`, `asUser`, `stillPending` (`server/test/support/hold.ts`),
  `withDbOn` (`server/src/db.ts`), `onlyAppAdmins` (Compito 3), `app.set_user_role`
  (Compito 1).

- [ ] **Passo 1: scrivi il test**

`server/test/users-locks.test.ts`:

```ts
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { withDbOn } from '../src/db.ts';
import { setupActors, type Actors } from './support/actors.ts';
import { onlyAppAdmins } from './support/app-admins.ts';
import { hasDatabase } from './support/db.ts';
import { asUser, holdTransaction, stillPending } from './support/hold.ts';

const adminUrl = process.env.TEST_DATABASE_URL!;
const LOCK_WAIT_TIMEOUT_MS = 3000;

describe.skipIf(!hasDatabase)('last app admin under concurrency', () => {
	let actors: Actors;
	let restore: (() => Promise<void>) | undefined;
	beforeAll(async () => {
		actors = await setupActors();
	});
	afterEach(async () => {
		await restore?.();
		restore = undefined;
	});
	afterAll(() => actors?.close());

	const admins = async (count: number) => {
		const people: string[] = [];
		for (let i = 0; i < count; i++) {
			const person = await actors.user();
			await actors.db.grantGlobalRole(person.userId, 'app_admin');
			people.push(person.userId);
		}
		restore = await onlyAppAdmins(actors.db.admin, people);
		return people;
	};
	const appAdmins = async () =>
		(await actors.db.admin<{ user_id: string }[]>`select user_id from app.user_roles where role = 'app_admin'`).map((r) => r.user_id).sort();

	/**
	 * Starts `target`'s app_admin removal as `caller` on a connection of its own. `pid` resolves
	 * with the backend before the call; `outcome` with 'ok' or the SQLSTATE, never rejecting.
	 */
	function removeAs(caller: string, target: string) {
		const sql = postgres(adminUrl, { max: 1, onnotice: () => {} });
		let gotPid!: (pid: number) => void;
		const pid = new Promise<number>((resolve) => (gotPid = resolve));
		const outcome = sql
			.begin(async (tx) => {
				const [{ pid: backend }] = await tx<{ pid: number }[]>`select pg_backend_pid() as pid`;
				gotPid(backend);
				await asUser(tx, caller);
				await tx`select app.set_user_role(${target}::uuid, 'app_admin', false)`;
			})
			.then(() => 'ok', (error: { code?: string }) => String(error.code))
			.finally(() => sql.end());
		return { pid, outcome };
	}
	/** True once the backend waits on an advisory lock (the reliable check); false after the timeout. */
	async function waitsOnAdvisoryLock(pid: number): Promise<boolean> {
		const deadline = Date.now() + LOCK_WAIT_TIMEOUT_MS;
		while (Date.now() < deadline) {
			const [row] = await actors.db.admin<{ wait_event_type: string | null; wait_event: string | null }[]>`
				select wait_event_type, wait_event from pg_stat_activity where pid = ${pid}`;
			if (row?.wait_event_type === 'Lock' && row.wait_event === 'advisory') return true;
			await new Promise((r) => setTimeout(r, 20));
		}
		return false;
	}
	/**
	 * First removal held open, second one on its own connection. Release and outcome are collected
	 * in `finally`, before the fixtures are restored, also when an assertion would fail: without the
	 * lock both transactions still end and the final count shows the broken invariant.
	 */
	async function race(first: [string, string], second: [string, string]) {
		const held = await holdTransaction(adminUrl, async (tx) => {
			await asUser(tx, first[0]);
			await tx`select app.set_user_role(${first[1]}::uuid, 'app_admin', false)`;
		});
		const removal = removeAs(...second);
		let waited = false;
		let pendingAfter200ms = false;
		let code = '';
		try {
			pendingAfter200ms = await stillPending(removal.outcome);
			waited = await waitsOnAdvisoryLock(await removal.pid);
		} finally {
			await held.release();
			code = await removal.outcome;
		}
		return { code, waited, pendingAfter200ms };
	}

	it('runs user transactions in read committed, which the check after the lock relies on', async () => {
		const sql = postgres(process.env.TEST_DATABASE_URL!, { max: 1, onnotice: () => {} });
		try {
			const person = await actors.user();
			const claims = { sub: person.userId, role: 'authenticated' as const, session_id: person.sessionId, exp: Math.floor(Date.now() / 1000) + 60 };
			const level = await withDbOn(sql, { kind: 'user', claims }, async (tx) => (await tx<{ transaction_isolation: string }[]>`show transaction_isolation`)[0]!.transaction_isolation);
			expect(level).toBe('read committed');
		} finally {
			await sql.end();
		}
	});

	it('two admins removing each other: the second, already demoted, is refused; one admin remains', async () => {
		const [a, b] = await admins(2);
		const result = await race([a!, b!], [b!, a!]);
		expect(await appAdmins()).toEqual([a]);
		expect(result.code).toBe('42501');
		expect(result.waited).toBe(true);
		expect(result.pendingAfter200ms).toBe(true);
	});

	it('two admins each giving up their own role: the second gets P0A08; one admin remains', async () => {
		const [a, b] = await admins(2);
		const result = await race([a!, a!], [b!, b!]);
		expect(await appAdmins()).toEqual([b]);
		expect(result.code).toBe('P0A08');
		expect(result.waited).toBe(true);
	});

	it('an admin demoted while waiting can no longer remove app_admin', async () => {
		const [a, b, c] = await admins(3);
		const result = await race([a!, b!], [b!, c!]);
		expect(await appAdmins()).toEqual([a, c].sort());
		expect(result.code).toBe('42501');
		expect(result.waited).toBe(true);
	});
});
```

Nota: se `Claims` di `server/src/auth.ts` richiede altri campi obbligatori, costruiscili
come nel tipo (gli unici obbligatori sono `sub`, `role`, `session_id`, `exp`).

- [ ] **Passo 2: esegui e verifica**

Run: `TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm test -w server -- test/users-locks.test.ts`
Atteso: PASS dei quattro casi.

- [ ] **Passo 3: prova che il test dimostra qualcosa (solo in locale, senza commit)**

Da `psql "$TEST_DATABASE_URL"` sostituisci la funzione con una copia identica senza la
riga `perform pg_advisory_xact_lock(...)` (`create or replace function app.set_user_role ...`).
Riesegui il file: il caso «removing each other» deve fallire **sulla prima
asserzione** con `[]` (zero amministratori) al posto di `[a]`, e il processo di Vitest
deve terminare senza transazioni appese (nessun timeout). Poi `supabase db reset` per
tornare alla migrazione vera e riesegui: PASS.

- [ ] **Passo 4: commit**

```bash
git add server/test/users-locks.test.ts
git commit -m "Test: concorrenza sull'ultimo amministratore dell'app (W10)"
```

---

### Compito 5: percorso sullo stack locale

**File:**
- Crea: `server/test/stack/users.stack.test.ts`
- Modifica: `scripts/invitations/invite-stack.sh` (ultima riga: cartella `test/stack/`)

**Interfacce:**
- Consuma: lo schema di `server/test/stack/invitations.stack.test.ts` (variabili
  `STACK_*`, `createApp`, `rpcClient`, Auth reale).

- [ ] **Passo 1: scrivi il test**

`server/test/stack/users.stack.test.ts`:

```ts
import { contract, type Contract } from '@app/contract';
import type { ContractRouterClient } from '@orpc/contract';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.ts';
import type { Env } from '../../src/env.ts';
import { router } from '../../src/router.ts';
import { allowAll, rpcClient, testEnv } from '../support/requests.ts';

const NAMES = ['STACK_SUPABASE_URL', 'STACK_SUPABASE_PUBLISHABLE_KEY', 'STACK_SUPABASE_SECRET_KEY', 'STACK_DB_URL'] as const;
const present = NAMES.every((name) => process.env[name]);

describe.skipIf(!present)('user administration against the local stack', () => {
	let url: string;
	let publishable: string;
	let secret: string;
	let admin: postgres.Sql | undefined;
	let workerEnv: Env;
	let app: ReturnType<typeof createApp>;
	const emails: string[] = [];

	beforeAll(() => {
		url = process.env.STACK_SUPABASE_URL!;
		publishable = process.env.STACK_SUPABASE_PUBLISHABLE_KEY!;
		secret = process.env.STACK_SUPABASE_SECRET_KEY!;
		admin = postgres(process.env.STACK_DB_URL!, { max: 1, onnotice: () => {} });
		const appServer = new URL(process.env.STACK_DB_URL!);
		appServer.username = 'app_server';
		appServer.password = 'app_server_test';
		workerEnv = { ...testEnv(appServer.toString()), SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: publishable, SUPABASE_SECRET_KEY: secret, INVITE_READ_LIMIT: allowAll, INVITE_ACCEPT_LIMIT: allowAll };
		app = createApp({ contract, router, resourceName: 'stack' });
	});
	afterAll(async () => {
		if (!admin) return;
		if (emails.length) await admin`delete from auth.users where email = any(${emails})`;
		await admin.end();
	});

	const client = (token: string) => rpcClient<ContractRouterClient<Contract>>(app, workerEnv, token);
	/** A confirmed person created with the Auth admin API, signed in with the password. */
	async function person(prefix: string) {
		const email = `${prefix}-${crypto.randomUUID().slice(0, 8)}@x.it`;
		emails.push(email);
		const created = await fetch(`${url}/auth/v1/admin/users`, {
			method: 'POST', headers: { apikey: secret, 'content-type': 'application/json' },
			body: JSON.stringify({ email, password: 'stack-password', email_confirm: true, user_metadata: { display_name: prefix } }),
		});
		if (!created.ok) throw new Error(`admin create: ${created.status}`);
		const { id } = (await created.json()) as { id: string };
		const signedIn = await fetch(`${url}/auth/v1/token?grant_type=password`, {
			method: 'POST', headers: { apikey: publishable, 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'stack-password' }),
		});
		const { access_token } = (await signedIn.json()) as { access_token: string };
		return { id, email, token: access_token };
	}

	it('from the search to the role change, counted at once for a token already issued', async () => {
		const federico = await person('federico');
		await admin!`insert into app.user_roles (user_id, role) values (${federico.id}, 'app_admin')`;
		const giulia = await person('giulia');
		const found = await client(federico.token).users.list({ query: giulia.email.toUpperCase() });
		expect(found.users).toEqual([{ id: giulia.id, displayName: 'giulia', email: giulia.email, roles: [] }]);
		expect((await client(federico.token).users.get({ id: giulia.id })).families).toEqual([]);
		await client(federico.token).users.setRole({ id: giulia.id, role: 'recipe_curator', granted: true });
		expect((await client(giulia.token).profile.get({})).user.globalRoles).toEqual(['recipe_curator']);
		await client(federico.token).users.setRole({ id: giulia.id, role: 'recipe_curator', granted: false });
		expect((await client(giulia.token).profile.get({})).user.globalRoles).toEqual([]);
	});
});
```

Se `profile.get` ha un input diverso da `{}`, controlla in
`contract/src/profile/index.ts` e adegua la chiamata.

- [ ] **Passo 2: script dello stack**

In `scripts/invitations/invite-stack.sh` sostituisci l'ultima riga
`npm test -w server -- test/stack/invitations.stack.test.ts` con
`npm test -w server -- test/stack/` e il commento in testa con «app invitations and user
administration against the local stack».

- [ ] **Passo 3: esegui**

Run: `scripts/invitations/invite-stack.sh` (con `supabase start` attivo)
Atteso: PASS di `invitations.stack.test.ts` e `users.stack.test.ts`.

- [ ] **Passo 4: commit**

```bash
git add server/test/stack/users.stack.test.ts scripts/invitations/invite-stack.sh
git commit -m "Test: amministrazione degli utenti sullo stack locale (W10)"
```

---

### Compito 6: registro delle mutazioni e API del web

**File:**
- Modifica: `web/src/api/mutations.ts` (bersaglio `users`, voce `users.setRole`)
- Modifica: `web/src/api/mutations.test.ts`
- Modifica: `web/src/api/types.ts` (`SERVER_AREAS` con `users`)
- Modifica: `web/src/features/admin/api.ts` (`usersQuery`, `userQuery`)

**Interfacce:**
- Consuma: `UserRow`, `UserDetail` del contratto.
- Produce: `usersQuery(deps, query: string)` con chiave `['users', 'list', { query }]`;
  `userQuery(deps, id: string)` con chiave `['users', 'get', { id }]`; nome di mutazione
  `'users.setRole'`.

- [ ] **Passo 1: test del registro (fallisce)**

In fondo a `web/src/api/mutations.test.ts`:

```ts
describe('user role mutations', () => {
  const detailKey = ['users', 'get', { id: 'u' }];
  const listKey = ['users', 'list', { query: '' }];
  const profileKey = ['profile', 'get', { locale: 'it-IT' }];

  it('read the users and the profile again, never writing the answer', async () => {
    const { client, run } = harness();
    client.setQueryData(detailKey, { user: { id: 'u', roles: [] }, families: [] });
    client.setQueryData(listKey, { users: [], more: false });
    client.setQueryData(profileKey, { user: { globalRoles: ['app_admin'] } });
    const outcome = await run('users.setRole', undefined, async () => ({ user: { id: 'u', roles: ['recipe_curator'] }, families: [] }));
    expect(outcome.applied).toBe(true);
    expect(client.getQueryData(detailKey)).toEqual({ user: { id: 'u', roles: [] }, families: [] });
    expect(client.getQueryState(detailKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(listKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(profileKey)?.isInvalidated).toBe(true);
  });

  it('a late answer after the session closed is not applied', async () => {
    const { session, run } = harness();
    const outcome = await run('users.setRole', undefined, async () => {
      await session.close();
      return { user: { id: 'u', roles: [] }, families: [] };
    });
    expect(outcome.applied).toBe(false);
  });
});
```

- [ ] **Passo 2: esegui**

Run: `npm test -w web -- src/api/mutations.test.ts`
Atteso: FAIL (tipo: `'users.setRole'` non è un `MutationName`).

- [ ] **Passo 3: implementa**

In `web/src/api/mutations.ts`:

```ts
/** The view a mutation answers with: the profile, one of the versioned views of a family, a week of the menu, the app invitations or the users. */
export type MutationTarget = 'profile' | 'family' | 'settings' | 'exclusions' | 'week' | 'appInvitations' | 'users';
/** Lists read again instead of written: their answer is never put in the cache. */
const LIST_TARGETS = ['appInvitations', 'users'] as const;
type ListTarget = (typeof LIST_TARGETS)[number];
const isListTarget = (target: MutationTarget): target is ListTarget => (LIST_TARGETS as readonly string[]).includes(target);
/** The targets whose answer is written in the cache. */
type CachedTarget = Exclude<MutationTarget, ListTarget>;
```

Nel registro, dopo le voci `appInvitations`:

```ts
  // Not written: the users are read again; the profile too, as one's own roles may have changed (spec W10).
  'users.setRole': { target: 'users', stale: ['profile'] },
```

In `applyMutation` sostituisci il ramo `if (target === 'appInvitations') { ... }` con:

```ts
  if (isListTarget(target)) {
    // Not written: the list is read again for every answer, also a superseded one. Only a
    // closed session drops it; showing a link is the sheet's decision (its own attempt).
    if (!options.sessionOpen()) return false;
    void queryClient.invalidateQueries({ queryKey: [target] });
    if (stale.length) void queryClient.invalidateQueries({ predicate: (query) => stale.some((scope) => matches(scope, options.familyId)(query)) });
    return true;
  }
```

In `runAreaMutation` la chiave di tracciamento:

```ts
  const trackKey = target === 'profile' || isListTarget(target) ? target : `${target}:${familyId}`;
```

In `web/src/api/types.ts` aggiungi `'users'` in fondo a `SERVER_AREAS`.

In `web/src/features/admin/api.ts` aggiungi:

```ts
/** Not versioned: read again after every role change (spec W10). */
export function usersQuery({ api }: QueryDeps, query: string) {
  return queryOptions({ queryKey: ['users', 'list', { query }] as const, queryFn: () => api.users.list(query ? { query } : {}) });
}

export function userQuery({ api }: QueryDeps, id: string) {
  return queryOptions({ queryKey: ['users', 'get', { id }] as const, queryFn: () => api.users.get({ id }) });
}
```

- [ ] **Passo 4: esegui**

Run: `npm test -w web -- src/api/mutations.test.ts`
Atteso: PASS. `npm run typecheck -w web` fallirà finché il client finto non ha `users`
(Compito 7): è previsto, non fare commit separato del solo typecheck rotto; procedi al
Compito 7 e fai il commit insieme.

---

### Compito 7: modalità finta

**File:**
- Crea: `web/src/api/fake/fakeUsers.ts`, `web/src/api/fake/fakeUsers.test.ts`
- Modifica: `web/src/api/fake/fakeApi.ts` (stato, registrazione, ruoli del profilo,
  `withTransport`, opzione `globalRoles` di `fakeClients`)
- Modifica: `web/src/api/fake/fakeAppInvitations.ts` (`account_exists`) e
  `web/src/api/fake/fakeAppInvitations.test.ts`
- Modifica: `web/src/main.tsx` (demo amministratore nella modalità finta)

**Interfacce:**
- Consuma: `DEMO_PEOPLE`, `DEMO_USER_ID` (`seed.ts`); `ApiError`; `USERS_LIST_LIMIT`.
- Produce: `createFakeUsers(options: { self: { id: string; displayName: () => string; email: string; roles: GlobalRole[]; family: 'family_admin' | 'member' }; familyName: () => string; latencyMs?: number })`
  → `{ area: Api['users']; rolesOf(id: string): GlobalRole[]; hasEmail(email: string): boolean }`;
  `createFakeAppInvitations(latencyMs?: number, accountExists?: (email: string) => boolean)`;
  `fakeClients(options: { latencyMs?: number; globalRoles?: GlobalRole[] })`;
  id fisso dell'account «Ospite»: `FAKE_GUEST_ID = '00000000-0000-4000-8000-00000000a5e1'`.

- [ ] **Passo 1: test (fallisce)**

`web/src/api/fake/fakeUsers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ApiError } from '../errors';
import { FAKE_GUEST_ID, createFakeUsers } from './fakeUsers';
import { DEMO_USER_ID } from './seed';

/** The signed-in person is the seed's Federico, as in the fake API. */
const make = (roles: ('recipe_curator' | 'app_admin')[] = ['app_admin']) =>
  createFakeUsers({
    self: { id: DEMO_USER_ID, displayName: () => 'Federico', email: 'federico@example.com', roles, family: 'family_admin' },
    familyName: () => 'Famiglia Folloni'
  });

describe('fake users', () => {
  it('lists the seed people once, the signed-in one included, and the account with no roles and no family', async () => {
    const { area } = make();
    expect((await area.list({ query: 'FEDERICO' })).users.map((u) => u.id)).toEqual([DEMO_USER_ID]);
    expect((await area.list({})).users.map((u) => u.displayName)).toEqual(['Anna', 'Federico', 'Ospite', 'Tom']);
    expect((await area.list({ query: 'ospite@' })).users).toEqual([{ id: FAKE_GUEST_ID, displayName: 'Ospite', email: 'ospite@example.com', roles: [] }]);
    expect((await area.list({})).more).toBe(false);
  });
  it('protects the last app admin and is idempotent', async () => {
    const users = make();
    await expect(users.area.setRole({ id: DEMO_USER_ID, role: 'app_admin', granted: false })).rejects.toEqual(new ApiError('last_app_admin'));
    await users.area.setRole({ id: FAKE_GUEST_ID, role: 'app_admin', granted: true });
    await users.area.setRole({ id: FAKE_GUEST_ID, role: 'app_admin', granted: true });
    expect((await users.area.get({ id: FAKE_GUEST_ID })).user.roles).toEqual(['app_admin']);
    await users.area.setRole({ id: DEMO_USER_ID, role: 'app_admin', granted: false });
    expect(users.rolesOf(DEMO_USER_ID)).toEqual([]);
  });
  it('refuses a signed-in person without app_admin, as the server', async () => {
    const { area } = make(['recipe_curator']);
    await expect(area.list({})).rejects.toEqual(new ApiError('forbidden'));
    await expect(area.get({ id: FAKE_GUEST_ID })).rejects.toEqual(new ApiError('forbidden'));
  });
  it('answers not_found for an unknown id and shows families by name and role', async () => {
    const { area } = make();
    await expect(area.get({ id: 'nobody' })).rejects.toEqual(new ApiError('not_found'));
    expect((await area.get({ id: DEMO_USER_ID })).families).toEqual([{ name: 'Famiglia Folloni', role: 'family_admin' }]);
    expect((await area.get({ id: FAKE_GUEST_ID })).families).toEqual([]);
  });
  it('knows which emails have an account', () => {
    const users = make();
    expect(users.hasEmail(' OSPITE@example.com')).toBe(true);
    expect(users.hasEmail('nuova@x.it')).toBe(false);
  });
});
```

In `web/src/api/fake/fakeAppInvitations.test.ts` aggiungi:

```ts
it('refuses an email that has an account, as the server', async () => {
  const area = createFakeAppInvitations(0, (email) => email === 'ospite@example.com');
  await expect(area.create({ id: crypto.randomUUID(), email: ' Ospite@example.com', roles: [] })).rejects.toEqual(new ApiError('not_allowed', { reason: 'account_exists' }));
});
```

(con gli import di `ApiError` e `createFakeAppInvitations` se mancano; se il file
esistente usa un'altra forma per creare l'area, segui quella).

- [ ] **Passo 2: esegui**

Run: `npm test -w web -- src/api/fake/`
Atteso: FAIL (modulo `fakeUsers` assente; `create` non rifiuta).

- [ ] **Passo 3: implementa**

`web/src/api/fake/fakeUsers.ts`:

```ts
import { USERS_LIST_LIMIT, type GlobalRole, type UserDetail, type UserRow } from '@app/contract';
import { ApiError } from '../errors';
import type { Api } from '../types';
import { DEMO_PEOPLE } from './seed';

type Area = Api['users'];
type FamilyRole = 'family_admin' | 'member';
interface Person { id: string; displayName: () => string; email: string; roles: GlobalRole[]; family: FamilyRole | null }

/** The account born from an invitation revoked after the reservation: no roles, no family (delivery of A). */
export const FAKE_GUEST_ID = '00000000-0000-4000-8000-00000000a5e1';
/** The server's order: jsonb_agg(role order by role). */
const ROLE_ORDER: GlobalRole[] = ['app_admin', 'recipe_curator'];
const sorted = (roles: Iterable<GlobalRole>) => ROLE_ORDER.filter((role) => [...roles].includes(role));

/** Users and global roles of the fake mode (spec W10): the server's rules, in memory. */
export function createFakeUsers(options: {
  self: { id: string; displayName: () => string; email: string; roles: GlobalRole[]; family: FamilyRole };
  familyName: () => string;
  latencyMs?: number;
}) {
  const people: Person[] = [
    { ...options.self, roles: sorted(options.self.roles) },
    ...DEMO_PEOPLE.filter((p) => p.id !== options.self.id).map((p) => ({ id: p.id, displayName: () => p.displayName, email: p.email, roles: [] as GlobalRole[], family: p.role })),
    { id: FAKE_GUEST_ID, displayName: () => 'Ospite', email: 'ospite@example.com', roles: [], family: null }
  ];
  const delayed = async <T,>(value: T): Promise<T> => {
    if (options.latencyMs) await new Promise((resolve) => setTimeout(resolve, options.latencyMs));
    return structuredClone(value);
  };
  const self = people[0]!;
  /** As the database functions: the signed-in person must be an app admin at the moment of the call. */
  const guard = () => {
    if (!self.roles.includes('app_admin')) throw new ApiError('forbidden');
  };
  const row = (p: Person): UserRow => ({ id: p.id, displayName: p.displayName(), email: p.email, roles: [...p.roles] });
  const find = (id: string) => {
    const person = people.find((p) => p.id === id);
    if (!person) throw new ApiError('not_found');
    return person;
  };
  const admins = () => people.filter((p) => p.roles.includes('app_admin'));
  const detail = (p: Person): UserDetail => ({
    user: { ...row(p), lastAppAdmin: p.roles.includes('app_admin') && admins().length === 1 },
    families: p.family ? [{ name: options.familyName(), role: p.family }] : []
  });
  const area = {
    async list({ query }: { query?: string }) {
      guard();
      const text = (query ?? '').trim().toLowerCase();
      const found = people
        .filter((p) => !text || p.displayName().toLowerCase().includes(text) || p.email.toLowerCase().includes(text))
        .sort((a, b) => a.displayName().toLowerCase().localeCompare(b.displayName().toLowerCase()) || a.id.localeCompare(b.id));
      return delayed({ users: found.slice(0, USERS_LIST_LIMIT).map(row), more: found.length > USERS_LIST_LIMIT });
    },
    async get({ id }: { id: string }) {
      guard();
      return delayed(detail(find(id)));
    },
    async setRole({ id, role, granted }: { id: string; role: GlobalRole; granted: boolean }) {
      guard();
      const person = find(id);
      if (!granted && role === 'app_admin' && person.roles.includes('app_admin') && admins().length === 1) throw new ApiError('last_app_admin');
      person.roles = sorted(granted ? [...person.roles, role] : person.roles.filter((r) => r !== role));
      return delayed(detail(person));
    }
  } as unknown as Area;
  return {
    area,
    rolesOf: (id: string) => [...(people.find((p) => p.id === id)?.roles ?? [])],
    hasEmail: (email: string) => people.some((p) => p.email.toLowerCase() === email.trim().toLowerCase())
  };
}
```

In `web/src/api/fake/fakeAppInvitations.ts`:

```ts
export function createFakeAppInvitations(latencyMs = 0, accountExists: (email: string) => boolean = () => false) {
```

e in `create`, subito dopo `const normalized = ...`:

```ts
      // As app.create_app_invitation: an email with an account gets no invitation (spec W10, fake mode).
      if (accountExists(normalized)) throw new ApiError('not_allowed', { reason: 'account_exists' });
```

In `web/src/api/fake/fakeApi.ts`:

1. import: `import { createFakeUsers } from './fakeUsers';` e il tipo `GlobalRole` da
   `@app/contract` se non c'è.
2. in `FakeData`, dopo `appInvitations?`:
   ```ts
     /** Users and global roles (W10), made by the first client of the session. */
     users?: ReturnType<typeof createFakeUsers>;
   ```
3. `fakeClients` accetta e inoltra i ruoli:
   ```ts
   export function fakeClients(options: { latencyMs?: number; globalRoles?: GlobalRole[] } = {}) {
     return (user: { id: string; email: string } | null) => {
       const shared = createFakeData(user ?? undefined);
       return (locale: Locale) => createFakeApi({ getLocale: () => locale, data: shared, latencyMs: options.latencyMs, globalRoles: options.globalRoles });
     };
   }
   ```
4. in `createFakeApi`, dopo `const memberIds = ...`:
   ```ts
     const seedPerson = DEMO_PEOPLE.find((p) => p.id === userId);
     state.users ??= createFakeUsers({
       self: {
         id: userId,
         displayName: () => profileView().user.displayName,
         email: user?.email ?? seedPerson?.email ?? '',
         // The demo user curates the recipe book, so the fake mode shows drafts and archived recipes.
         roles: options.globalRoles ?? (userId === DEMO_USER_ID ? ['recipe_curator'] : []),
         family: seedPerson?.role ?? 'member'
       },
       familyName: () => state.family.name,
       latencyMs: options.latencyMs
     });
   ```
   (`profileView` è una dichiarazione di funzione: è già disponibile; il nome si legge
   solo quando serve, quindi non c'è ricorsione con `globalRoles`.)
5. in `profileView()`, al posto della riga `globalRoles: options.globalRoles ?? (...)` e
   del suo commento: `globalRoles: state.users!.rolesOf(userId)`.
6. nell'oggetto `api`: `appInvitations: (state.appInvitations ??= createFakeAppInvitations(options.latencyMs, (email) => state.users!.hasEmail(email))),`
   e dopo, `users: state.users!.area,`.
7. in `withTransport`, aggiungi `users: wrap(api.users),`.

In `web/src/main.tsx`:

```ts
  : fakeClients({ latencyMs: 150, globalRoles: ['recipe_curator', 'app_admin'] });
```

con il commento sopra la riga: `// Fake mode: the demo person is also an app admin, so /admin can be tried without the stack (spec W10).`

- [ ] **Passo 4: esegui**

Run: `npm test -w web` e `npm run typecheck -w web`
Atteso: PASS (i test del Profilo e di `/admin` restano verdi: i ruoli predefiniti di
`fakeClients` e `createFakeApi` non cambiano). Se un test di `/admin` creava un invito
per un'email del seed (per esempio `anna@example.com`) e ora riceve `account_exists`,
cambia l'email del test in una nuova.

- [ ] **Passo 5: commit (Compiti 6 e 7)**

```bash
git add web/src/api web/src/features/admin/api.ts web/src/main.tsx
git commit -m "Web: registro delle mutazioni, letture e modalità finta degli utenti (W10)"
```

---

### Compito 8: testi e sezione Utenti in `/admin`

**File:**
- Modifica: `web/src/i18n/messages/admin.ts`
- Crea: `web/src/features/admin/UsersSection.tsx`
- Modifica: `web/src/features/admin/AdminPage.tsx`, `web/src/features/admin/AdminPage.module.css`
- Modifica: `web/src/features/admin/access.ts` (`onAdminForbidden`)
- Crea: `web/src/features/admin/UsersSection.test.tsx`

**Interfacce:**
- Consuma: `usersQuery` (Compito 6), API finta (Compito 7), rotta `/admin/users/$userId`
  (Compito 9: il `Link` tipato richiede la rotta; scrivi prima la registrazione della
  rotta del Compito 9, Passo 3, punto 1, con un `UserPage` provvisorio che restituisce
  `null`, e completalo nel Compito 9).
- Produce: chiavi di testo usate anche nel Compito 9 e 10;
  `onAdminForbidden(queryClient: QueryClient, error: unknown): Promise<boolean>` in
  `web/src/features/admin/access.ts` (vero se l'errore era `forbidden` ed è stato
  gestito), usata anche nel Compito 9.

- [ ] **Passo 1: testi**

In `web/src/i18n/messages/admin.ts`, nell'oggetto `it` (prima di `profile.newFamily`):

```ts
  'admin.users': 'Utenti',
  'admin.search': 'Cerca per nome o email',
  'admin.you': 'Tu',
  'admin.yourAccount': 'Questo è il tuo account',
  'admin.noUsers': 'Nessun utente',
  'admin.moreUsers': 'Ci sono altri utenti: restringi la ricerca.',
  'admin.roles': 'Ruoli',
  'admin.curatorHint': 'Aggiunge e modifica le ricette del ricettario.',
  'admin.appAdminHint': 'Gestisce utenti, ruoli e inviti dell’app.',
  'admin.lastAppAdmin': 'È l’unico amministratore dell’app: nominane un altro prima.',
  'admin.families': 'Famiglie',
  'admin.noFamilies': 'Nessuna famiglia',
  'admin.familiesNote': 'Si vedono solo nome e ruolo.',
  'admin.appointTitle': 'Nominare {name} amministratore dell’app?',
  'admin.appointBody': 'Potrà gestire utenti, ruoli e inviti dell’app, anche nominare o togliere altri amministratori.',
  'admin.appoint': 'Nomina',
  'admin.dropSelfTitle': 'Rinunciare al ruolo di amministratore?',
  'admin.dropSelfBody': 'Non vedrai più questa pagina. Potrà ridartelo solo un altro amministratore.',
  'admin.dropSelf': 'Rinuncia',
  'admin.cancel': 'Annulla',
  'admin.openUser': 'Apri l’utente',
```

e cambia `'profile.adminHint': 'Inviti all’app'` in `'profile.adminHint': 'Utenti, ruoli e inviti'`.

Nell'oggetto `en`:

```ts
  'admin.users': 'Users',
  'admin.search': 'Search by name or email',
  'admin.you': 'You',
  'admin.yourAccount': 'This is your account',
  'admin.noUsers': 'No users',
  'admin.moreUsers': 'There are more users: narrow the search.',
  'admin.roles': 'Roles',
  'admin.curatorHint': 'Adds and edits the recipes of the recipe book.',
  'admin.appAdminHint': 'Manages the app’s users, roles and invitations.',
  'admin.lastAppAdmin': 'This is the app’s only administrator: appoint another one first.',
  'admin.families': 'Families',
  'admin.noFamilies': 'No families',
  'admin.familiesNote': 'Only the name and role are shown.',
  'admin.appointTitle': 'Make {name} an app administrator?',
  'admin.appointBody': 'They will manage the app’s users, roles and invitations, including appointing or removing other administrators.',
  'admin.appoint': 'Appoint',
  'admin.dropSelfTitle': 'Give up the administrator role?',
  'admin.dropSelfBody': 'You will no longer see this page. Only another administrator can give it back.',
  'admin.dropSelf': 'Give up',
  'admin.cancel': 'Cancel',
  'admin.openUser': 'Open the user',
```

e `'profile.adminHint': 'Users, roles and invitations'`.

Controlla con `grep -rn "'Inviti all’app'" web/src --include=*.test.tsx` se un test
del Profilo cercava la vecchia descrizione e aggiornalo.

- [ ] **Passo 2: test della sezione (fallisce)**

`web/src/features/admin/UsersSection.test.tsx`:

```tsx
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi } from '../../api/fake/fakeApi';
import { renderApp } from '../../test/renderApp';

const adminApi = () => createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0, globalRoles: ['app_admin'] });

describe('/admin users', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows Utenti above the invitations, with roles as labels and «Tu»', async () => {
    renderApp('/admin', { api: adminApi() });
    const users = await screen.findByRole('heading', { name: 'Utenti' });
    const invitations = screen.getByRole('heading', { name: 'Inviti all’app' });
    expect(users.compareDocumentPosition(invitations) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const me = (await screen.findByText(/· Tu/)).closest('a')!;
    expect(within(me).getByText('amministratore dell’app')).toBeTruthy();
    expect(await screen.findByText('ospite@example.com')).toBeTruthy();
  });

  it('searches once after typing stops, keeping the previous list meanwhile', async () => {
    const api = adminApi();
    const list = vi.spyOn(api.users, 'list');
    renderApp('/admin', { api });
    await screen.findByText('ospite@example.com');
    list.mockClear();
    const search = screen.getByRole('searchbox', { name: 'Cerca per nome o email' });
    fireEvent.change(search, { target: { value: 'o' } });
    fireEvent.change(search, { target: { value: 'osp' } });
    expect(screen.getByText('ospite@example.com')).toBeTruthy();
    await waitFor(() => expect(list).toHaveBeenCalledWith({ query: 'osp' }, expect.anything()));
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('says when nobody matches and when there are more', async () => {
    const api = adminApi();
    renderApp('/admin', { api });
    fireEvent.change(await screen.findByRole('searchbox', { name: 'Cerca per nome o email' }), { target: { value: 'zzz' } });
    expect(await screen.findByText('Nessun utente')).toBeTruthy();
    vi.spyOn(api.users, 'list').mockResolvedValue({ users: [], more: true });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Cerca per nome o email' }), { target: { value: 'z' } });
    expect(await screen.findByText('Ci sono altri utenti: restringi la ricerca.')).toBeTruthy();
  });

  it('after a demotion made elsewhere, the next search shows «Non hai accesso» and no user data', async () => {
    const api = adminApi();
    renderApp('/admin', { api });
    await screen.findByText('ospite@example.com');
    // Another administrator appears and takes the role away from the signed-in person.
    await api.users.setRole({ id: '00000000-0000-4000-8000-00000000a5e1', role: 'app_admin', granted: true });
    await api.users.setRole({ id: 'user-federico', role: 'app_admin', granted: false });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Cerca per nome o email' }), { target: { value: 'o' } });
    expect(await screen.findByText('Non hai accesso a questa pagina')).toBeTruthy();
    expect(screen.queryByText('ospite@example.com')).toBeNull();
  });

  it('opens the detail of a user', async () => {
    const { history } = renderApp('/admin', { api: adminApi() });
    fireEvent.click((await screen.findByText('ospite@example.com')).closest('a')!);
    await waitFor(() => expect(history.location.pathname).toBe('/admin/users/00000000-0000-4000-8000-00000000a5e1'));
  });
});
```

- [ ] **Passo 3: esegui**

Run: `npm test -w web -- src/features/admin/UsersSection.test.tsx`
Atteso: FAIL (nessun titolo «Utenti»).

- [ ] **Passo 4: implementa**

Prima registra la rotta (Compito 9, Passo 3, punto 1) con un `UserPage` provvisorio
(`export function UserPage() { return null; }` in `web/src/features/admin/UserPage.tsx`).

In `web/src/features/admin/access.ts` aggiungi (con gli import di `QueryClient` da
`@tanstack/react-query` e `toApiError` da `../../api/errors`):

```ts
/**
 * A users or invitations operation answered `forbidden` (spec W10): the administration data
 * leave the cache and the profile is read again. Without app_admin the pages show «Non hai
 * accesso a questa pagina»; with it (forbidden for another reason) they read again and show the
 * error. The shared error handler (SessionScope) is not involved.
 */
export async function onAdminForbidden(queryClient: QueryClient, error: unknown): Promise<boolean> {
  if (toApiError(error).code !== 'forbidden') return false;
  queryClient.removeQueries({ queryKey: ['users'] });
  queryClient.removeQueries({ queryKey: ['appInvitations'] });
  await queryClient.refetchQueries({ queryKey: ['profile'] }).catch(() => undefined);
  return true;
}
```

`web/src/features/admin/UsersSection.tsx`:

```tsx
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useQueryDeps } from '../../api/queries';
import { Icon } from '../../components/Icon';
import { Loading } from '../../components/Loading';
import { QueryError } from '../../components/QueryError';
import { useT } from '../../i18n/LocaleProvider';
import { useProfile } from '../../session/useFamily';
import { onAdminForbidden } from './access';
import { usersQuery } from './api';
import styles from './AdminPage.module.css';

/** The search starts this long after the last keystroke. */
export const SEARCH_DELAY_MS = 250;

/** «Utenti» (spec W10): search by name or email, roles as labels, a row per user. */
export function UsersSection() {
  const t = useT();
  const deps = useQueryDeps();
  const me = useProfile().data?.user.id;
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text]);
  // The previous answer stays while the next one loads: the page does not jump on the phone.
  const list = useQuery({ ...usersQuery(deps, query), placeholderData: keepPreviousData });
  useEffect(() => {
    if (list.error) void onAdminForbidden(deps.queryClient, list.error);
  }, [list.error, deps.queryClient]);

  return (
    <section className="settings-card" aria-labelledby="users-title">
      <h2 id="users-title">{t('admin.users')}</h2>
      <input
        className={styles.search}
        type="search"
        enterKeyHint="search"
        autoCapitalize="none"
        placeholder={t('admin.search')}
        aria-label={t('admin.search')}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      {list.isError && <QueryError error={list.error} onRetry={() => void list.refetch()} />}
      {!list.data && !list.isError && <Loading />}
      {list.data && list.data.users.length === 0 && <p className="meta-line">{t('admin.noUsers')}</p>}
      {list.data && list.data.users.length > 0 && (
        <ul className={styles.list}>
          {list.data.users.map((user) => (
            <li key={user.id}>
              <Link to="/admin/users/$userId" params={{ userId: user.id }} className="row-link">
                <span className="row-main">
                  <span>{user.displayName}{user.id === me && <span className={styles.you}>{` · ${t('admin.you')}`}</span>}</span>
                  <small className={styles.email}>{user.email}</small>
                  {user.roles.length > 0 && (
                    <span className={styles.roles}>{user.roles.map((role) => <span key={role} className={styles.role}>{t(`role.${role}`)}</span>)}</span>
                  )}
                </span>
                <Icon name="chevron-right" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {list.data?.more && <p className="meta-line">{t('admin.moreUsers')}</p>}
    </section>
  );
}
```

In `AdminPage.module.css` aggiungi:

```css
.search { width: 100%; min-height: 44px; margin: 8px 0 4px; }
.you { color: var(--muted); font-weight: 400; }
.switch { display: flex; align-items: flex-start; gap: 12px; min-height: 44px; padding: 8px 0; cursor: pointer; }
.switch input { flex: none; width: 20px; height: 20px; margin: 2px 0 0; accent-color: var(--green); }
.switch small { display: block; color: var(--muted); }
.sheetActions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
```

(Gli ultimi quattro servono al Compito 9. Se `.search` stona con i campi di ricerca
esistenti, riusa la classe del ricettario: `grep -rn 'type="search"' web/src`.)

In `AdminPage.tsx`: importa `UsersSection`, aggiorna il commento in testa («Utenti (B),
poi Inviti all'app; il ripristino (E) dopo») e sostituisci
`{hasAppAdmin(profile.data) && <InvitationsSection />}` con:

```tsx
        {hasAppAdmin(profile.data) && (
          <>
            <UsersSection />
            <InvitationsSection />
          </>
        )}
```

- [ ] **Passo 5: esegui**

Run: `npm test -w web -- src/features/admin/`
Atteso: PASS (anche `AdminPage.test.tsx`; se un suo test trova due «amministratore
dell’app» per via delle etichette degli utenti, restringi la ricerca con `within` della
sezione degli inviti).

- [ ] **Passo 6: commit**

```bash
git add web/src/i18n/messages/admin.ts web/src/features/admin web/src/router.tsx
git commit -m "Web: sezione Utenti in /admin (W10)"
```

---

### Compito 9: dettaglio dell'utente

**File:**
- Modifica: `web/src/router.tsx` (rotta), `web/src/components/BottomNav.tsx` (`underProfile`)
- Modifica: `web/src/features/admin/UserPage.tsx` (da provvisorio a completo)
- Crea: `web/src/features/admin/UserPage.test.tsx`

**Interfacce:**
- Consuma: `userQuery` e `'users.setRole'` (Compito 6), `FAKE_GUEST_ID` (Compito 7),
  `hasAppAdmin` e `onAdminForbidden` (Compito 8), testi del Compito 8.

- [ ] **Passo 1: test (fallisce)**

`web/src/features/admin/UserPage.test.tsx`:

```tsx
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/errors';
import { createFakeApi } from '../../api/fake/fakeApi';
import { FAKE_GUEST_ID } from '../../api/fake/fakeUsers';
import { DEMO_USER_ID } from '../../api/fake/seed';
import { renderApp } from '../../test/renderApp';

const adminApi = (locale: 'it-IT' | 'en-GB' = 'it-IT') => createFakeApi({ getLocale: () => locale, latencyMs: 0, globalRoles: ['app_admin'] });
const curator = () => screen.findByRole('switch', { name: /Curatore del ricettario/ }) as Promise<HTMLInputElement>;
const appAdmin = () => screen.findByRole('switch', { name: /Amministratore dell’app/ }) as Promise<HTMLInputElement>;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

describe('/admin/users/$userId', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows email, roles, and no families for the invited account, with no deletion', async () => {
    renderApp(`/admin/users/${FAKE_GUEST_ID}`, { api: adminApi() });
    expect(await screen.findByRole('heading', { name: 'Ospite', level: 1 })).toBeTruthy();
    expect(screen.getByText('ospite@example.com')).toBeTruthy();
    expect((await curator()).checked).toBe(false);
    expect(screen.getByText('Nessuna famiglia')).toBeTruthy();
    expect(screen.getByText('Si vedono solo nome e ruolo.')).toBeTruthy();
    expect(screen.queryByText('Questo è il tuo account')).toBeNull();
    expect(screen.queryByText(/Elimina/)).toBeNull();
  });

  it('marks one’s own account, in Italian and in English', async () => {
    const first = renderApp(`/admin/users/${DEMO_USER_ID}`, { api: adminApi() });
    expect(await screen.findByText('Questo è il tuo account')).toBeTruthy();
    first.unmount();
    renderApp(`/admin/users/${DEMO_USER_ID}`, { api: adminApi('en-GB'), locale: 'en-GB' });
    expect(await screen.findByText('This is your account')).toBeTruthy();
  });

  it('keeps both switches locked until the confirmed state is shown, then keeps it if the reread fails', async () => {
    const api = adminApi();
    const realGet = api.users.get.bind(api.users);
    const reread = deferred<never>();
    let gets = 0;
    // The first read is real; every later one (the reread the registry starts) hangs, then fails.
    vi.spyOn(api.users, 'get').mockImplementation((input) => (gets++ === 0 ? realGet(input) : reread.promise));
    const answer = deferred<void>();
    const realSet = api.users.setRole.bind(api.users);
    const setRole = vi.spyOn(api.users, 'setRole').mockImplementation(async (input) => {
      await answer.promise;
      return realSet(input);
    });
    renderApp(`/admin/users/${FAKE_GUEST_ID}`, { api });
    const box = await curator();
    fireEvent.click(box);
    fireEvent.click(box);
    await waitFor(() => expect(setRole).toHaveBeenCalledTimes(1));
    expect(box.checked).toBe(false);
    expect(box.disabled).toBe(true);
    expect((await appAdmin()).disabled).toBe(true);
    answer.resolve();
    // The answer of setRole is the confirmed state: shown at once, while the reread still hangs.
    await waitFor(async () => expect((await curator()).checked).toBe(true));
    expect((await curator()).disabled).toBe(false);
    reread.reject(new ApiError('internal'));
    expect(await screen.findByRole('button', { name: 'Riprova' })).toBeTruthy();
    expect((await curator()).checked).toBe(true);
    expect(setRole).toHaveBeenCalledTimes(1);
    expect(setRole).toHaveBeenCalledWith({ id: FAKE_GUEST_ID, role: 'recipe_curator', granted: true }, expect.anything());
  });

  it('asks before appointing an administrator', async () => {
    const api = adminApi();
    const setRole = vi.spyOn(api.users, 'setRole');
    renderApp(`/admin/users/${FAKE_GUEST_ID}`, { api });
    fireEvent.click(await appAdmin());
    const sheet = await screen.findByRole('dialog', { name: 'Nominare Ospite amministratore dell’app?' });
    expect(setRole).not.toHaveBeenCalled();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Nomina' }));
    await waitFor(async () => expect((await appAdmin()).checked).toBe(true));
  });

  it('locks the last administrator’s switch with the reason', async () => {
    renderApp(`/admin/users/${DEMO_USER_ID}`, { api: adminApi() });
    const box = await appAdmin();
    expect(box.disabled).toBe(true);
    expect(screen.getByText('È l’unico amministratore dell’app: nominane un altro prima.')).toBeTruthy();
  });

  it('giving up one’s own role asks, then leads to the profile without the administration', async () => {
    const api = adminApi();
    await api.users.setRole({ id: FAKE_GUEST_ID, role: 'app_admin', granted: true });
    const { history } = renderApp(`/admin/users/${DEMO_USER_ID}`, { api });
    fireEvent.click(await appAdmin());
    const sheet = await screen.findByRole('dialog', { name: 'Rinunciare al ruolo di amministratore?' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Rinuncia' }));
    await waitFor(() => expect(history.location.pathname).toBe('/profile'));
    await waitFor(() => expect(screen.queryByText('Amministrazione dell’app')).toBeNull());
  });

  it('after a demotion made elsewhere, the next tap shows «Non hai accesso» and hides the user', async () => {
    const api = adminApi();
    renderApp(`/admin/users/${FAKE_GUEST_ID}`, { api });
    const box = await curator();
    // Another administrator appears and takes the role away from the signed-in person.
    await api.users.setRole({ id: FAKE_GUEST_ID, role: 'app_admin', granted: true });
    await api.users.setRole({ id: DEMO_USER_ID, role: 'app_admin', granted: false });
    fireEvent.click(box);
    expect(await screen.findByText('Non hai accesso a questa pagina')).toBeTruthy();
    expect(screen.queryByText('ospite@example.com')).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('shows not found for an unknown id', async () => {
    renderApp('/admin/users/00000000-0000-4000-8000-000000000000', { api: adminApi() });
    expect(await screen.findByText('Contenuto non trovato.')).toBeTruthy();
  });

  it('refuses people without app_admin', async () => {
    renderApp(`/admin/users/${FAKE_GUEST_ID}`, { api: createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0, globalRoles: [] }) });
    expect(await screen.findByText('Non hai accesso a questa pagina')).toBeTruthy();
  });
});
```

Note sui test:
- nel test della rinuncia, «Ospite» diventa amministratore chiamando l'API finta
  direttamente (la persona collegata è ancora amministratrice, quindi passa la guardia);
- `Riprova` è il testo di `common.retry` (`QueryError`); se il testo è diverso, usa
  quello del dizionario;
- `ApiError('internal')`: un codice che `persister.ts` non ritenta (ritenta solo
  `network`), così il test non aspetta.

- [ ] **Passo 2: esegui**

Run: `npm test -w web -- src/features/admin/UserPage.test.tsx`
Atteso: FAIL (la pagina provvisoria non mostra nulla).

- [ ] **Passo 3: implementa**

1. In `web/src/router.tsx`, dopo `adminRoute`:

   ```ts
   const userRoute = createRoute({ getParentRoute: () => appRoute, path: '/admin/users/$userId', component: UserPage });
   ```

   con `import { UserPage } from './features/admin/UserPage';` e `userRoute` dopo
   `adminRoute` in `appRoute.addChildren([...])`.

2. In `web/src/components/BottomNav.tsx`:

   ```ts
   const underProfile = (pathname: string) => pathname === '/admin' || pathname.startsWith('/admin/') || pathname === '/family/new';
   ```

3. `web/src/features/admin/UserPage.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import type { GlobalRole } from '@app/contract';
import { errorKey, toApiError } from '../../api/errors';
import { useAreaMutation } from '../../api/mutations';
import { useQueryDeps } from '../../api/queries';
import { BottomSheet } from '../../components/BottomSheet';
import { Icon } from '../../components/Icon';
import { Loading } from '../../components/Loading';
import { useOnline } from '../../components/OfflineBanner';
import { PageHeader } from '../../components/PageHeader';
import { QueryError } from '../../components/QueryError';
import { StateNotice } from '../../components/StateNotice';
import { useT } from '../../i18n/LocaleProvider';
import { useProfile } from '../../session/useFamily';
import { hasAppAdmin, onAdminForbidden } from './access';
import { userQuery } from './api';
import styles from './AdminPage.module.css';

type Change = { role: GlobalRole; granted: boolean };
const route = getRouteApi('/_app/admin/users/$userId');

/**
 * One user (spec W10): the two global roles, families by name and role only. Appointing an
 * administrator and giving up one's own role ask first; the last administrator's switch is locked.
 * The switches show only confirmed states and stay locked from the tap until one is shown.
 * No deletion here: activity C adds it below the families.
 */
export function UserPage() {
  const t = useT();
  const deps = useQueryDeps();
  const online = useOnline();
  const navigate = useNavigate();
  const profile = useProfile();
  const { userId } = route.useParams();
  const allowed = hasAppAdmin(profile.data);
  const detailQuery = userQuery(deps, userId);
  const user = useQuery({ ...detailQuery, enabled: allowed });
  const [confirming, setConfirming] = useState<'appoint' | 'dropSelf' | null>(null);
  // From the tap until a confirmed state is shown; the ref also blocks taps before the next render.
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  // A forbidden answer: nothing of this user is shown until the profile says whether access remains.
  const [checkingAccess, setCheckingAccess] = useState(false);
  const setRole = useAreaMutation('users.setRole', undefined, (change: Change) => deps.api.users.setRole({ id: userId, ...change }));
  const isSelf = profile.data?.user.id === userId;

  async function lostAccess(error: unknown): Promise<boolean> {
    if (toApiError(error).code !== 'forbidden') return false;
    setCheckingAccess(true);
    await onAdminForbidden(deps.queryClient, error);
    setCheckingAccess(false);
    return true;
  }
  useEffect(() => {
    if (user.error) void lostAccess(user.error);
    // lostAccess only reads stable values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.error]);

  async function apply(change: Change) {
    setConfirming(null);
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    try {
      const outcome = await setRole.mutateAsync(change);
      if (outcome.applied) {
        // The answer is the confirmed detail: shown at once, whatever the reread started by the registry does.
        deps.queryClient.setQueryData(detailQuery.queryKey, outcome.view);
      } else {
        await deps.queryClient.refetchQueries({ queryKey: detailQuery.queryKey }).catch(() => undefined);
      }
      // Giving up one's own app_admin closes this page: the profile, read again, no longer offers it.
      if (outcome.applied && isSelf && change.role === 'app_admin' && !change.granted) void navigate({ to: '/profile' });
    } catch (error) {
      await lostAccess(error);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  function toggle(role: GlobalRole, granted: boolean) {
    if (sending.current) return;
    if (role === 'app_admin' && granted) return setConfirming('appoint');
    if (role === 'app_admin' && !granted && isSelf) return setConfirming('dropSelf');
    void apply({ role, granted });
  }

  const back = (
    <Link to="/admin" className="page-back"><Icon name="chevron-left" />{t('admin.title')}</Link>
  );
  if (profile.data && !allowed) {
    return (
      <section className="secondary-view app-view">
        <div className="page-column">
          <PageHeader back={back} title={t('admin.users')} />
          <StateNotice title={t('admin.noAccess')}><Link to="/profile" className="text-button">{t('nav.profile')}</Link></StateNotice>
        </div>
      </section>
    );
  }
  const notFound = user.isError && toApiError(user.error).code === 'not_found';
  const detail = checkingAccess ? undefined : user.data;
  const mutationError = setRole.isError && toApiError(setRole.error).code !== 'forbidden';
  return (
    <section className="secondary-view app-view">
      <div className="page-column">
        <PageHeader back={back} title={detail?.user.displayName ?? t('admin.users')} />
        {profile.isError && <QueryError error={profile.error} onRetry={() => void profile.refetch()} />}
        {!profile.isError && (checkingAccess || !profile.data || (!detail && !user.isError)) && <Loading />}
        {!checkingAccess && notFound && <StateNotice title={t('errors.not_found')} />}
        {/* A failed (re)read: with a confirmed detail the switches keep it, and the error offers a retry. */}
        {!checkingAccess && user.isError && !notFound && <QueryError error={user.error} onRetry={() => void user.refetch()} />}
        {detail && (
          <>
            <p className={`meta-line ${styles.email}`}>{detail.user.email}</p>
            {isSelf && <p className="meta-line">{t('admin.yourAccount')}</p>}
            <section className="settings-card" aria-labelledby="roles-title">
              <h2 id="roles-title">{t('admin.roles')}</h2>
              {(['recipe_curator', 'app_admin'] as const).map((role) => {
                const locked = role === 'app_admin' && detail.user.lastAppAdmin;
                const on = detail.user.roles.includes(role);
                return (
                  <label key={role} className={styles.switch}>
                    <input type="checkbox" role="switch" checked={on} disabled={locked || !online || busy} onChange={() => toggle(role, !on)} />
                    <span>
                      {t(role === 'app_admin' ? 'admin.appAdmin' : 'admin.curator')}
                      <small>{locked ? t('admin.lastAppAdmin') : t(role === 'app_admin' ? 'admin.appAdminHint' : 'admin.curatorHint')}</small>
                    </span>
                  </label>
                );
              })}
              {mutationError && <p className="form-error" role="alert">{t(errorKey(setRole.error))}</p>}
            </section>
            <section className="settings-card" aria-labelledby="families-title">
              <h2 id="families-title">{t('admin.families')}</h2>
              {detail.families.length === 0 ? (
                <p>{t('admin.noFamilies')}</p>
              ) : (
                <ul className={styles.list}>
                  {detail.families.map((family, index) => (
                    <li key={index} className="row-main">{family.name}<small>{t(`profile.role.${family.role}`)}</small></li>
                  ))}
                </ul>
              )}
              <p className="meta-line">{t('admin.familiesNote')}</p>
            </section>
            <BottomSheet
              open={confirming !== null}
              title={confirming === 'dropSelf' ? t('admin.dropSelfTitle') : t('admin.appointTitle', { name: detail.user.displayName })}
              onClose={() => setConfirming(null)}
            >
              <p>{t(confirming === 'dropSelf' ? 'admin.dropSelfBody' : 'admin.appointBody')}</p>
              <div className={styles.sheetActions}>
                <button type="button" className="text-button" onClick={() => setConfirming(null)}>{t('admin.cancel')}</button>
                <button
                  type="button"
                  className={`text-button ${confirming === 'dropSelf' ? styles.danger : 'primary'}`}
                  disabled={!online || busy}
                  onClick={() => void apply({ role: 'app_admin', granted: confirming === 'appoint' })}
                >
                  {t(confirming === 'dropSelf' ? 'admin.dropSelf' : 'admin.appoint')}
                </button>
              </div>
            </BottomSheet>
          </>
        )}
      </div>
    </section>
  );
}
```

Note per l'implementatore:
- `getRouteApi('/_app/admin/users/$userId')` come `RecipePage.tsx`
  (`getRouteApi('/_app/recipes/$recipeId')`).
- Ordine degli eventi dopo una mutazione riuscita: il registro (`applyMutation`)
  invalida `['users']` e il profilo, e TanStack Query annulla la lettura in corso e ne
  avvia una nuova (`cancelRefetch` predefinito); poi la pagina scrive la risposta con
  `setQueryData`. Una rilettura che arriva dopo porta lo stato del server, uguale o più
  recente; una che fallisce lascia i dati scritti e mette la query in errore, e la
  pagina mostra dettaglio confermato più `QueryError`.
- Se il linter del progetto non usa `react-hooks/exhaustive-deps`, togli il commento
  `eslint-disable`.
- `errors.not_found` esiste già nei dizionari (`'Contenuto non trovato.'`).

- [ ] **Passo 4: esegui**

Run: `npm test -w web -- src/features/admin/` e `npm run typecheck -w web`
Atteso: PASS.

- [ ] **Passo 5: commit**

```bash
git add web/src/features/admin web/src/router.tsx web/src/components/BottomNav.tsx
git commit -m "Web: dettaglio dell'utente con i ruoli e le conferme (W10)"
```

---

### Compito 10: `account_exists` diventa un collegamento all'utente

**File:**
- Modifica: `web/src/features/admin/InviteSheet.tsx`
- Modifica: `web/src/features/admin/AdminPage.test.tsx`

**Interfacce:**
- Consuma: `api.users.list` (Compito 7, che dà anche `account_exists` nella modalità
  finta), `FAKE_GUEST_ID` (Compito 7), rotta `/admin/users/$userId` (Compito 9).

- [ ] **Passo 1: test (fallisce)**

In `AdminPage.test.tsx`, accanto al test esistente di `account_exists` (riga ~146),
aggiungi (con l'import di `FAKE_GUEST_ID` da `../../api/fake/fakeUsers`):

```tsx
it('turns «Questa email ha già un account» into a link to the user (fake mode answers account_exists)', async () => {
  const { history } = renderApp('/admin', { api: adminApi() });
  fireEvent.click(await screen.findByRole('button', { name: 'Nuovo invito' }));
  const sheet = await screen.findByRole('dialog', { name: 'Nuovo invito' });
  fireEvent.change(within(sheet).getByLabelText('Email'), { target: { value: 'OSPITE@example.com' } });
  fireEvent.click(within(sheet).getByRole('button', { name: 'Crea il link' }));
  expect(await within(sheet).findByText('Questa email ha già un account')).toBeTruthy();
  fireEvent.click(await within(sheet).findByRole('link', { name: 'Apri l’utente' }));
  await waitFor(() => expect(history.location.pathname).toBe(`/admin/users/${FAKE_GUEST_ID}`));
});

it('keeps only the text when the user cannot be found', async () => {
  const api = adminApi();
  vi.spyOn(api.appInvitations, 'create').mockRejectedValue(new ApiError('not_allowed', { reason: 'account_exists' }));
  vi.spyOn(api.users, 'list').mockResolvedValue({ users: [], more: false });
  renderApp('/admin', { api });
  fireEvent.click(await screen.findByRole('button', { name: 'Nuovo invito' }));
  const sheet = await screen.findByRole('dialog', { name: 'Nuovo invito' });
  fireEvent.change(within(sheet).getByLabelText('Email'), { target: { value: 'altro@example.com' } });
  fireEvent.click(within(sheet).getByRole('button', { name: 'Crea il link' }));
  expect(await within(sheet).findByText('Questa email ha già un account')).toBeTruthy();
  await new Promise((r) => setTimeout(r, 20));
  expect(within(sheet).queryByRole('link', { name: 'Apri l’utente' })).toBeNull();
});

it('links the user of the latest attempt even when the searches answer in reverse order, and drops the link when the email changes', async () => {
  const api = adminApi();
  vi.spyOn(api.appInvitations, 'create').mockRejectedValue(new ApiError('not_allowed', { reason: 'account_exists' }));
  const answers = new Map<string, (value: { users: { id: string; displayName: string; email: string; roles: [] }[]; more: boolean }) => void>();
  vi.spyOn(api.users, 'list').mockImplementation((input) => new Promise((resolve) => answers.set(input.query ?? '', resolve)));
  const row = (id: string, email: string) => ({ users: [{ id, displayName: email, email, roles: [] as [] }], more: false });
  renderApp('/admin', { api });
  fireEvent.click(await screen.findByRole('button', { name: 'Nuovo invito' }));
  const sheet = await screen.findByRole('dialog', { name: 'Nuovo invito' });
  const field = within(sheet).getByLabelText('Email');
  fireEvent.change(field, { target: { value: 'a@x.it' } });
  fireEvent.click(within(sheet).getByRole('button', { name: 'Crea il link' }));
  await waitFor(() => expect(answers.has('a@x.it')).toBe(true));
  fireEvent.change(field, { target: { value: 'b@x.it' } });
  fireEvent.click(within(sheet).getByRole('button', { name: 'Crea il link' }));
  await waitFor(() => expect(answers.has('b@x.it')).toBe(true));
  answers.get('b@x.it')!(row('00000000-0000-4000-8000-0000000000b0', 'b@x.it'));
  const link = await within(sheet).findByRole('link', { name: 'Apri l’utente' });
  answers.get('a@x.it')!(row('00000000-0000-4000-8000-0000000000a0', 'a@x.it'));
  await new Promise((r) => setTimeout(r, 20));
  expect(within(sheet).getByRole('link', { name: 'Apri l’utente' }).getAttribute('href')).toBe('/admin/users/00000000-0000-4000-8000-0000000000b0');
  expect(link.getAttribute('href')).toBe('/admin/users/00000000-0000-4000-8000-0000000000b0');
  fireEvent.change(field, { target: { value: 'c@x.it' } });
  expect(within(sheet).queryByRole('link', { name: 'Apri l’utente' })).toBeNull();
});
```

Il test esistente di `account_exists` (con `mockRejectedValue`) resta valido: controlla
solo il testo.

- [ ] **Passo 2: esegui**

Run: `npm test -w web -- src/features/admin/AdminPage.test.tsx`
Atteso: FAIL (nessun link).

- [ ] **Passo 3: implementa**

In `InviteSheet.tsx` (import di `Link` da `@tanstack/react-router`):

```tsx
  /** The user who has the email of the latest attempt; only the latest attempt's search may set it (spec W10). */
  const [existingUser, setExistingUser] = useState<string | null>(null);
  const attemptNumber = useRef(0);
```

All'inizio di `send()`, dopo il controllo di `sending.current`:

```tsx
    const attemptNow = ++attemptNumber.current;
    setExistingUser(null);
```

Nel `catch` di `send()`:

```tsx
    } catch (error) {
      if (!alive.current) return;
      setFailure(error);
      const apiError = toApiError(error);
      if (apiError.code === 'not_allowed' && (apiError.data as { reason?: string } | undefined)?.reason === 'account_exists') {
        // The account is found by its email; an answer of an older attempt is dropped.
        const wanted = email.trim().toLowerCase();
        void deps.api.users
          .list({ query: wanted })
          .then(({ users }) => {
            if (!alive.current || attemptNow !== attemptNumber.current) return;
            setExistingUser(users.find((user) => user.email.toLowerCase() === wanted)?.id ?? null);
          })
          .catch(() => undefined);
      }
    }
```

Nel campo email, l'`onChange` toglie il collegamento e rende superata la ricerca in
corso:

```tsx
<input id={`${ids}-email`} type="email" autoComplete="off" autoCapitalize="none" value={email}
  onChange={(e) => {
    setEmail(e.target.value);
    attemptNumber.current += 1;
    setExistingUser(null);
  }} />
```

Nel messaggio d'errore:

```tsx
          {failure !== null && (
            <p className="form-error" role="alert">
              {accountExists ? t('admin.accountExists') : t(errorKey(failure))}
              {accountExists && existingUser && (
                <> <Link to="/admin/users/$userId" params={{ userId: existingUser }} className="link-inline" onClick={onClose}>{t('admin.openUser')}</Link></>
              )}
            </p>
          )}
```

`ApiError` espone il motivo in `data` (`new ApiError('not_allowed', { reason: 'account_exists' })`,
`web/src/api/errors.ts`). Nota: `email` letto nel `catch` è quello del rendering in cui
`send()` è partito, cioè l'email del tentativo.

- [ ] **Passo 4: esegui**

Run: `npm test -w web -- src/features/admin/`
Atteso: PASS.

- [ ] **Passo 5: commit**

```bash
git add web/src/features/admin
git commit -m "Web: «Questa email ha già un account» porta all'utente (W10)"
```

---

### Compito 11: verifica completa e interfaccia

**File:**
- Modifica: `progetto/superpowers/specs/2026-10-15-amministrazione-utenti.md` (sezione
  «Provato con agent-browser», da aggiungere in fondo alla sezione 4)

- [ ] **Passo 1: test e controlli**

Run, con lo stack locale attivo:

```bash
supabase test db
npm run typecheck
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm test
scripts/invitations/invite-stack.sh
npm run build -w web
```

Atteso: tutto verde. Annota i numeri (test pgTAP, server, web) per la descrizione della PR.

- [ ] **Passo 2: interfaccia con agent-browser (modalità finta)**

`npm run dev -w web` (la modalità finta rende la persona demo amministratrice, Compito
7), poi con la skill agent-browser, a 1280 e a 390 px di larghezza:
`/admin` (Utenti sopra gli inviti, ricerca, «Tu», etichette, `more` non visibile con i
dati demo), dettaglio di «Ospite» (nessuna famiglia), assegnazione del curatore,
conferma della nomina, interruttore bloccato del proprio account, rinuncia dopo aver
nominato un altro amministratore con ritorno al Profilo, «Apri l'utente» dal foglio
«Nuovo invito» con `ospite@example.com`, barra in basso con «Profilo» attivo. Se gli
screenshot si bloccano, il Mac ha spento lo schermo: `caffeinate -d` e una sessione
nuova.

- [ ] **Passo 2b: lingue e nomi lunghi**

Sia in modalità finta sia sullo stack, ripeti a 390 px con l'interfaccia in inglese
(lingua cambiata dalle Preferenze) e con un nome lungo: in modalità finta cambia il
proprio nome nelle Preferenze in «Maria Alessandra Benedetta Castiglioni di
Valdobbiadene»; sullo stack crea la persona con quel nome e un'email lunga
(`maria.alessandra.benedetta.castiglioni@example.com`). Controlla elenco, intestazione
del dettaglio, «Questo è il tuo account»/«This is your account» e il foglio della nomina:
nessun testo tagliato, nessuno scorrimento orizzontale (`design/design.md`). Se qualcosa
va a capo male, correggi il CSS in `AdminPage.module.css` (per esempio
`overflow-wrap: anywhere` sul nome) e fai un commit a parte.

- [ ] **Passo 3: interfaccia sullo stack locale**

`server/.env` come in `server/README.md` («Sviluppo locale»), `npm run build -w web`,
`npm run dev -w server`; persona `app_admin` creata con l'API di amministrazione di Auth
e il ruolo via SQL; un'altra persona. Con agent-browser, a 1280 e 390 px: accesso,
`/admin`, ricerca per email, dettaglio, assegnazione del curatore ritrovata come
etichetta nell'elenco, conferma della nomina, rinuncia con ritorno al Profilo.

- [ ] **Passo 4: annota nella spec**

In fondo alla sezione 4 della spec aggiungi «**Provato con agent-browser** (data,
modalità, larghezze): …» con ciò che hai visto, come ha fatto A, e correggi l'elenco
«Da provare a mano sull'iPhone» se la prova ha mostrato altro.

- [ ] **Passo 5: commit**

```bash
git add progetto/superpowers/specs/2026-10-15-amministrazione-utenti.md
git commit -m "Spec: esito della prova dell'interfaccia (W10)"
```

---

## Copertura della spec

| Spec | Compito |
|---|---|
| 1 Database (quattro funzioni, lucchetto, codici, permessi) | 1 |
| 2 Contratto, MCP, descrizione con le conferme | 2, 3 |
| 2 Ruoli validi subito, anche per agenti già collegati | 3, 5 |
| 3 Sezione Utenti, ricerca con ritardo, `more`, «Tu» | 8 |
| 3 Dettaglio, conferme, interruttore bloccato, rinuncia → Profilo | 9 |
| 3 `account_exists` → «Apri l'utente» | 10 |
| 3 Modalità finta (demo amministratore, `account_exists`) | 7 |
| 3 Interruttori bloccati fino allo stato confermato; perdita di `app_admin` | 8, 9 |
| 3 «Questo è il tuo account» in due lingue | 8, 9 |
| 3 Ricerca di `account_exists` legata al tentativo | 10 |
| 4 Verifica in inglese e con nomi lunghi | 11 |
| 4 pgTAP, server, concorrenza, stack, web, agent-browser | 1, 3, 4, 5, 6–10, 11 |
| 6 Interfaccia per C (regola del lucchetto nel commento) | 1 |
