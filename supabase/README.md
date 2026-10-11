# Database (Supabase)

Schema del traguardo A, creato da codice: migrazioni, test delle policy, dati locali e
script dei primi utenti. Il design è in
`progetto/superpowers/specs/2026-10-11-schema-e-permessi.md`, subordinato alla specifica
principale.

## Prerequisiti

- VM Podman avviata (`podman machine start`; «already running» va bene). Podman espone
  l'API compatibile Docker, che la CLI usa senza configurazione.
- CLI di Supabase in `~/.local/bin` e Podman in `/opt/podman/bin`:

```bash
export PATH=/opt/podman/bin:$HOME/.local/bin:$PATH
```

## Comandi

Dalla radice del repository (o del worktree):

```bash
supabase db start     # avvia il Postgres locale (una volta)
supabase db reset     # riapplica tutte le migrazioni e seed.sql
supabase test db      # esegue i test pgTAP di supabase/tests
supabase stop         # ferma i container
```

Il container si chiama `supabase_db_meal_planner_2`; per una query a mano:
`podman exec -i supabase_db_meal_planner_2 psql -U postgres`.

**Nessun comando di questa cartella tocca il progetto remoto.** Niente `supabase link`,
`supabase db push` o esecuzioni sul remoto: ogni passo remoto passa da una domanda
all'utente (vedi «Passi remoti»).

## Schema `app`

Tabelle e funzioni stanno nello schema `app`, non in `public`. La Data API di Supabase
(PostgREST) espone solo `public` e `graphql_public` (`[api] schemas` in `config.toml`):
con un JWT valido nessuno può scrivere le tabelle saltando le operazioni del server, che
raggiunge il database direttamente.

## Ruoli

| Ruolo | Tipo | Poteri |
|---|---|---|
| `app_server` | LOGIN, NOINHERIT | membro di `authenticated`, `anon`, `app_job`; nessun permesso diretto: senza `set local role` non legge nulla |
| `authenticated` | di Supabase | permessi espliciti su `app`, sempre filtrati da RLS |
| `anon` | di Supabase | solo `usage` su `app` ed `execute` su `app.temporary_list_by_token(text)` |
| `app_job` | NOLOGIN | legge famiglie, preferenze, voti, settimane, pasti e catalogo pubblicato di tutte le famiglie; scrive `weeks`, i contenuti di `meal_slots` e `weekly_jobs` |

Il server sceglie il ruolo per transazione: richieste degli utenti con
`set local role authenticated` e `request.jwt.claims`; `/internal/jobs/*` con
`set local role app_job`; `/shopping-lists/<token>` con `set local role anon`. La
password di `app_server` non sta nelle migrazioni.

Funzioni eseguibili per ruolo:

| Ruolo | Funzioni |
|---|---|
| `anon` | `temporary_list_by_token` |
| `authenticated` | `is_localized_text`, `is_localized_list`, `unit_dimension`, `has_role`, `session_is_active`, `is_member`, `is_family_admin`, `shares_family`, `can_access_week`, `can_access_slot`, `can_access_list`, `catalogue_author_names`, `meal_passed_at`, `recipe_version_at` |
| `app_job` | `is_localized_text`, `is_localized_list`, `unit_dimension`, `meal_passed_at`, `recipe_version_at` |
| PUBLIC, `app_server` | nessuna |

**Regola per ogni funzione nuova:** Postgres concede `EXECUTE` a PUBLIC su ogni funzione
creata e `alter default privileges` non basta. Ogni migrazione esegue subito
`revoke execute on function … from public` e poi concede `execute` solo ai ruoli della
tabella. `coverage_test.sql` confronta la tabella con le ACL effettive.
