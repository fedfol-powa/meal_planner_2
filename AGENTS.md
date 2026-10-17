# AGENTS.md - Cosa si mangia (meal_planner_2)

Regole comuni a tutti gli agenti (Claude Code, Codex, sottoagenti) che lavorano qui.

## Cos'è

App web per famiglie: ogni settimana prepara il menu, lo fa rivedere ai membri e genera la
lista della spesa; ricettario unico nel database, curato anche via agenti MCP. È in
produzione su `cosasimangia.app` e la usa ogni giorno la famiglia dell'utente.

## Fonti e ordine di lettura

- Specifica principale `progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`:
  fonte unica di requisiti e decisioni. Chi lavora sul codice legge almeno le sezioni 1, 15
  e 16. Spec di dettaglio, piani e brief la estendono, non diventano fonti parallele.
- `design/design.md` (e `design/index.html`) prima di progettare o toccare una schermata;
  il linguaggio visivo cambia solo con l'accordo dell'utente (specifica, sezione 14).
- Piano generale `progetto/superpowers/plans/2026-10-11-piano-generale.md`: ondate,
  interfacce decise, registro delle decisioni tecniche.
- `spike/REPORT.md` se tocchi server, database o MCP.
- Stato corrente del lavoro: `progetto/coordinamento/registro.md`.

## Ruoli

Il ruolo si decide in quest'ordine, al primo punto che si applica:

1. Un incarico esplicito decide, prima della cartella in cui ti trovi:
   - prompt di revisione (da `avvia-revisore.sh`, cita `brief/revisore.md`) → sei un
     revisore: segui `progetto/coordinamento/brief/revisore.md`;
   - brief di un worker, o messaggio di ripresa che cita un brief → sei un worker:
     segui il brief e `progetto/coordinamento/protocollo-worker.md`;
   - delega da un'altra sessione (coordinatore o worker) → sei un sottoagente: fai solo
     il lavoro della delega, sui file indicati, e riferisci a chi ti ha delegato.
2. Senza incarico, se sei una sessione Claude nel checkout principale sei il coordinatore.
   Il criterio è che `.git` sia una directory, non il percorso (oggi il checkout è
   `/Users/fedfol/Projects/meal_planner_2`, ma una copia completa vale allo stesso modo).
   Parli con l'utente e coordini il lavoro con la skill `coordinamento`, da usare anche
   quando l'utente dice solo «riprendiamo», «continuiamo» o «quali sono i prossimi passi».
3. Senza incarico in un worktree collegato (`.worktrees/<nome>`, `.claude/worktrees/…`:
   lì `.git` è un file), o se non sei Claude, non scegliere un ruolo da solo: chiedi
   all'utente quale ruolo e quale brief hai.

### Confine del coordinatore

Fa da sé brief, registro, piano generale, aggiornamenti della
specifica principale dopo un merge, anteprime dei rilasci, revisioni Codex e merge. Ogni
modifica a codice dell'app, test, migrazioni o script va a un worker herdr, anche di una
riga; i suoi sottoagenti lavorano solo su documenti, mai sul codice. Perché: il contesto
del coordinatore resta libero per l'utente e per lo stato del lavoro, e ogni modifica al
codice passa da un worker e da una revisione separata (l'utente lo ha chiesto più volte).

## Proprietà dei file

- Specifica principale, `design/percorsi.md`, `AGENTS.md`, `CLAUDE.md`, `.claude/`, piano
  generale e `progetto/coordinamento/` li modifica solo il coordinatore.
- Un worker li tocca solo se il suo brief glielo delega esplicitamente; l'eccezione vale
  solo per quel brief.
- Gli script di `progetto/coordinamento/` (`eventi.py`, `attendi.py`, `avvia-revisore.sh`)
  sono codice: li modifica un worker con un brief che li delega, non il coordinatore.
- I revisori non modificano nulla.

## Lingua

Documenti e risposte in italiano, con gli accenti. Codice in inglese: identificatori, nomi
tecnici di file, schema, API, strumenti MCP, commenti e test. Testi per gli utenti
localizzabili in italiano e inglese britannico.

## Regole per tutti

- Documentazione di librerie e servizi (React, oRPC, Supabase, Cloudflare…) con Context7,
  non a memoria: le API cambiano più in fretta dei dati di addestramento.
- Dipendenze al minimo: per ogni libreria nuova scrivi cosa sostituisce e cosa costa farne
  a meno; prima le API della piattaforma o il codice già presente. La approva il
  coordinatore. Pochi utenti, architettura semplice.
- Ingredienti delle ricette solo verificati sulla fonte o dati dall'utente, mai dedotti dal
  nome del piatto: un ingrediente inventato finisce nella spesa della famiglia.
- Prove sullo stack locale, mai credenziali di prova verso la produzione. `web/.env.production`
  è versionato e punta alla produzione: una `vite build` normale parla con l'Auth di
  produzione. Per le prove passa le variabili dello stack locale (`VITE_SUPABASE_URL`,
  chiave pubblicabile locale) o usa il server di sviluppo, e controlla l'URL di Auth nelle
  richieste prima di accedere (15/10: due accessi di prova sono arrivati in produzione).
- Nessuna scrittura in produzione (dati, migrazioni, segreti, rilasci) senza anteprima e
  «vai» dell'utente: è l'app che la famiglia usa davvero.
- Il rilascio lo prepara il coordinatore e parte solo dopo il «vai» dell'utente; i worker no.
- Il progetto di origine `../meal_planner` si legge soltanto: è attivo e separato. Le sue
  regole di merito (`progetto/REGOLE.md`) sono il punto di partenza dei default, non di qui.

## Stack in breve

SPA React (Vite, TanStack) servita da un Worker di Cloudflare con oRPC, da cui derivano API
web, OpenAPI e strumenti MCP; Supabase (Postgres con RLS, Auth, pg_cron) via Hyperdrive,
migrazioni in `supabase/migrations/`; Resend; backup in R2; dominio puro in `domain/`;
`prototype/` (Svelte) solo come riferimento dei percorsi. Dettagli: specifica, sezioni 1, 13, 15.

## Git

Un branch e un worktree per attività, PR verso `main`, commit piccoli in italiano come nella
storia del repository. Chi fa merge e quando sta nella skill `coordinamento` e nel
protocollo dei worker.
