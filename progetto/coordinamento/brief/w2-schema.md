# Brief W2: Schema e permessi

Segui `progetto/coordinamento/protocollo-worker.md`.

- **Branch:** `fondamenta/schema` · **Worktree:** `.worktrees/schema`
- **Proprietà:** `supabase/` (migrazioni, test, dati iniziali, configurazione).
- **Specifica:** sezioni 2, 5, 7, 8 (parte dati), 12, 15, 16, 17 (R1, R2, verifiche
  tecniche); sezione 1 per il ruolo dell'utente nelle transazioni; `spike/sql/`.

## Obiettivo

Lo schema completo del traguardo A in `supabase/migrations/`, creato da codice:

- tabelle della sezione 2 necessarie al traguardo A (catalogo con proiezioni, bozze,
  cronologia delle bozze, versioni, storico degli stati, ingredienti con versioni ed
  equivalenze, profili, ruoli globali, famiglie, membri, impostazioni, settimane,
  pasti, modifiche, voti, esclusioni, spesa, job); inviti e tabelle dell'ondata 3 solo
  se costa poco prevederle ora, altrimenti segnalale;
- RLS: isolamento fra famiglie, ruoli globali, catalogo leggibile, scritture del
  catalogo solo ai curatori; test automatici delle policy con più utenti;
- ruolo tecnico del server (assume `authenticated`, nient'altro) e ruolo del job;
- contatori di versione per famiglia e per il ricettario (in accordo con W1);
- ambiente di test locale: Docker non c'è, c'è Podman (`/opt/podman/bin/podman`) e la
  CLI di Supabase in `~/.local/bin`. Valuta la strada più semplice (Supabase locale con
  Podman, oppure un Postgres locale con lo schema `auth` simulato) e proponila;
- script per creare a mano i primi utenti e la famiglia (decisione dell'utente: i
  primi accessi si preparano da Supabase, senza inviti).

## Vincoli dal coordinamento

- Il contenuto delle ricette (`content` di versioni e bozze) segue il documento
  ricetta di W3: accordati tramite il coordinatore su colonne di proiezione e forma.
- Campi bilingui o tabelle `*_translations`: proposta aperta nella sezione 15, la
  decide l'utente su proposta di W3; progetta in modo da applicarla senza rifare tutto.
- Nessuna modifica al progetto Supabase remoto senza `STATO: DOMANDA`.
