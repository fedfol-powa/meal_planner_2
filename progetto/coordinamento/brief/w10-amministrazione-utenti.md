# Brief W10: Amministrazione di utenti e ruoli (ondata 3, attività B, issue #38)

Segui `progetto/coordinamento/protocollo-worker.md` e, per la forma del lavoro verticale,
`progetto/coordinamento/brief/ondata2-comune.md` (proprietà dei file, migrazioni, MCP,
design, interfacce decise: valgono anche qui).

- **Branch:** `ondata3/amministrazione-utenti` · **Worktree:** `.worktrees/amministrazione`
- **Spec e piano:** `progetto/superpowers/specs/2026-10-15-amministrazione-utenti.md`,
  `progetto/superpowers/plans/2026-10-15-amministrazione-utenti.md`
- **Specifica principale:** Parte 1 («Amministrare l'app»), sezioni 1, 2 (`user_roles`,
  vincolo sull'ultimo amministratore dell'app), 7 («Amministrazione globale»), 13 (parità
  MCP), 14, 15 e 16. Piano generale: «Ordine dell'ondata 3» e «Interfacce decise»
  (voce «Inviti all'app, interfaccia per B e C definitiva»).
- **Spec di A da riusare:** `progetto/superpowers/specs/2026-10-13-inviti-app.md`,
  sezione 7 «Interfaccia per B e C».
- **Percorsi e prototipo:** `design/percorsi.md` e il sesto giro in `prototype/`
  (pagina `/admin`, sezione Utenti, dettaglio di un utente).

## Obiettivo

Federico (`app_admin`) apre «Amministrazione dell'app» dal Profilo, cerca un utente per
nome o email, apre il dettaglio e gli assegna o toglie il ruolo di curatore del
ricettario (`recipe_curator`) o di amministratore dell'app (`app_admin`). Le stesse
operazioni le fa un agente via MCP. Oggi i ruoli di chi ha già un account si cambiano
solo con SQL in produzione.

## Perimetro

1. Operazioni del contratto, gestori e strumenti MCP (solo `app_admin`): elencare e
   cercare gli utenti (nome, email, ruoli; dimensione dell'elenco e paginazione da
   decidere nella spec, gli utenti sono pochi); leggere il dettaglio di un utente con le
   sue famiglie **solo per nome e ruolo**, senza contenuti; assegnare e togliere
   `recipe_curator` e `app_admin`.
2. Vincoli sul server (e nel database se serve per la concorrenza): l'ultimo
   amministratore dell'app non può essere retrocesso; operazioni idempotenti; nessun
   accesso ai dati delle famiglie oltre a nome e ruolo.
3. Web: in `/admin` la sezione **Utenti sopra «Inviti all'app»** (forma del sesto giro:
   ricerca, ruoli come etichette, dettaglio con gli interruttori dei due ruoli; la
   nomina di un amministratore e la rinuncia al proprio ruolo chiedono conferma;
   l'interruttore dell'ultimo amministratore è bloccato con il motivo). Chi rinuncia al
   proprio `app_admin` perde l'accesso alla pagina: decidi nella spec cosa vede dopo.
4. Consegne di A: un account nato da un invito revocato dopo la prenotazione (senza
   ruoli né famiglia) compare nell'elenco e si gestisce da lì; `account_exists` alla
   creazione di un invito diventa un collegamento al dettaglio dell'utente.

## Fuori perimetro

- **Cancellazione degli utenti:** decisione dell'utente del 15 ottobre 2026, va
  nell'attività C insieme alla cancellazione dell'account (stessa pagina e stesse
  regole). Nessun segnaposto nel dettaglio dell'utente; nella spec scrivi dove C
  aggiungerà il comando («Interfaccia per C»).
- Ripristino del ricettario, inviti alla famiglia, email.

## Vincoli dal coordinamento

- **Dati degli utenti:** email e nome stanno in `auth.users` e nel profilo; il Worker
  parla con Postgres come `app_server` tramite Hyperdrive. Scegli nella spec come
  leggere l'email (funzione `security definer` nello schema `app`, vista, o la chiave
  segreta di `server/src/accounts/`) e motiva; niente scritture nello schema `auth`.
  Se usi la chiave segreta, resta letta solo da `server/src/accounts/`.
- **Ruoli e sessioni:** verifica come i ruoli arrivano al server e al web (profilo,
  eventuali claim nel token) e che una modifica valga subito, senza aspettare il
  rinnovo della sessione, anche per gli agenti MCP già collegati.
- **Concorrenza sull'ultimo amministratore:** due amministratori che si tolgono il ruolo
  a vicenda nello stesso momento non devono lasciare l'app senza amministratori; test
  che lo dimostra.
- **Migrazioni** solo additive (sezione 1, «Modifiche solo additive»).
- **Test:** pgTAP per schema e funzioni; server per le operazioni (non `app_admin`,
  ultimo amministratore, rinuncia al proprio ruolo, idempotenza, utente inesistente,
  famiglie senza contenuti); SPA sullo stack locale per il percorso dalla ricerca al
  cambio di ruolo. Verifica l'interfaccia con la skill agent-browser, anche a larghezza
  da telefono. Annota nella spec cosa resta da provare a mano sull'iPhone.
- Rilascio in produzione: **non lo fai tu**. Lo fa il coordinatore dopo il merge.
