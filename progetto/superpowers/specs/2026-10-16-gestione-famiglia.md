# W11: Gestione della famiglia (ondata 3, attività C)

Creato: 16 ottobre 2026
Stato: spec di dettaglio dopo il brainstorming con il coordinatore (decisione dell'utente
sull'account nato da un invito alla famiglia; riepilogo del design approvato con le
precisazioni del messaggio `w11-01-riepilogo-design.md`); corretta dopo la revisione di
spec e piano (`revisioni/w11-spec-piano.md`, rilievi 1–12, e decisioni del coordinatore
in `w11-02-revisione-spec.md`).
Branch: `ondata3/gestione-famiglia` · Worktree: `.worktrees/famiglia`

Subordinata alla specifica principale
(`progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`: Parte 1 «Chi la usa»,
«Amministrare l'app», «Usare l'app attraverso il proprio agente»; sezioni 1, 2, 4, 7, 8,
13, 14, 15 e 16), al piano generale (`progetto/superpowers/plans/2026-10-11-piano-generale.md`,
«Ordine dell'ondata 3», riga C, e «Interfacce decise») e alle interfacce di A
(`specs/2026-10-13-inviti-app.md`, sezione 7, «Per C») e di B
(`specs/2026-10-15-amministrazione-utenti.md`, sezione 6).

## Obiettivo

Un amministratore della famiglia invita altre persone con un link, anche chi non ha un
account; gestisce membri e ruoli; chi vuole esce dalla famiglia. Un amministratore della
famiglia può eliminarla dall'app. Ogni utente può cancellare il proprio account, e un
amministratore dell'app può cancellare un altro utente dal dettaglio di B. Oggi nessuna di
queste cose si fa dall'app: si fanno con SQL in produzione o non si fanno.

## Perimetro

Dentro:

1. **Inviti alla famiglia**: tabelle `family_invitations`, `family_invitation_reservations`, `family_joins`
   e `family_removals`; creazione, elenco, revoca dalla pagina dei membri; pagina
   pubblica `/invite#<token>`; ingresso con un account esistente o con un account nuovo
   creato dal link (al più 10 persone registrate per link); registro degli ingressi;
   rientro dopo la rimozione bloccato per i link
   creati prima; «Invita la famiglia» nella scheda di benvenuto; rimando agli inviti
   nello stato «Non fai ancora parte di una famiglia».
2. **Membri e ruoli**: rimozione, cambio di ruolo, uscita con successore, ultimo
   amministratore della famiglia protetto sotto concorrenza.
3. **Eliminazione della famiglia** dall'app web (`/profile/family/delete?family=<id>`);
   via MCP solo il collegamento.
4. **Cancellazione dell'account** (Preferenze, `/profile/account/delete`) e **degli
   utenti** (amministrazione, `/admin/users/$userId/delete`), con prima transazione,
   cancellazione in Auth, chiusura e ripresa dal Cron Trigger orario.
5. Strumenti MCP per ogni operazione, con i rimandi all'app previsti dalla sezione 7.

Fuori: email (D), Google, ripristino del ricettario, foto, PDF (E).

## Decisioni del brainstorming

| # | Decisione | Motivo |
|---|---|---|
| 1 | **Account nato da un invito alla famiglia** (decisione dell'utente del 16/10, opzione 2): con un link riusabile si registrano **al più 10 persone**; superato il tetto la creazione risponde come un link non valido. Creazione dell'account e ingresso in famiglia sono un solo passaggio con conferma esplicita («Crea l'account ed entra»). L'email scritta nel modulo non è verificata fino a D; un'email presa da altri si rimedia cancellando quell'account dall'amministrazione | Tiene il caso d'uso della specifica (un link nel gruppo WhatsApp, tutti dentro) e limita il danno di un link finito in giro senza passaggi in più |
| 2 | Il tetto conta le **prenotazioni** (decisione del coordinatore, 16/10): le email distinte che hanno iniziato a registrarsi da quel link, riuscite o no; un `weak_password` riprovato con la stessa email non consuma una seconda quota. Non conta gli ingressi di chi ha già un account, che entra anche a tetto raggiunto. Nei testi: «persone registrate con questo link» | Il rischio da limitare è la creazione di account; un account esistente che entra non costa nulla di nuovo |
| 3 | **Il link si vede solo alla creazione** (impronta SHA-256 nel database, come in A): l'elenco mostra autore, scadenza e persone registrate, con «Revoca»; per ricondividere si crea un link nuovo. **Scostamento dal prototipo**, che condivideva dall'elenco | Vincolo del coordinamento (token nel frammento, funzioni per impronta); un link che fa entrare in una famiglia non deve essere ricostruibile dal database |
| 4 | **«Ex membro» e voti**: nessuna regola nuova. Il server mostra il nome di un autore solo finché è membro (`family/views.ts`, `menu/week-view.ts`, `shopping/read.ts`) e la media conta solo i membri attuali (`app.family_ratings`): rimozione e uscita valgono già. Alla cancellazione dell'account i voti si cancellano (cascata), alla rimozione restano ma escono dalla media | Già nel codice e nella sezione 7; il lavoro è provarlo con test |
| 5 | **Ricettario**: bozze aperte, salvataggi e versioni di un curatore cancellato restano; gli autori diventano nulli per cascata (`on delete set null`) e le bozze restano agli altri curatori, che possono riprenderle, pubblicarle o scartarle. Le ricette pubblicate restano nel catalogo | Sezione 8: le bozze sono condivise fra curatori e non si cancellano mai; sezione 7: niente cancellazioni implicite dei contributi pubblicati |
| 6 | **Link creati da una persona** (scelta di prodotto del coordinatore, 16/10): si revocano quando quella persona esce dalla famiglia, viene rimossa, perde il ruolo di amministratore o cancella l'account. Il dialogo di conferma di ognuno di questi passaggi lo dice quando ci sono link attivi creati da quella persona («I 2 link d'invito creati da Anna smetteranno di valere») | «Te l'ha mandato X» resta vero, e un link resta sotto il controllo di un amministratore attuale |
| 7 | **Ultimo amministratore della famiglia**: ogni percorso che può togliere amministratori a una famiglia (uscita, cambio di ruolo, rimozione, cancellazione di un account, ingresso che cambia i membri di una famiglia in cancellazione) prende `select … for update` sulla riga di `app.families` e solo dopo riconta | Lucchetto sulla riga esistente, nessuna tabella nuova; serializza anche con l'eliminazione della famiglia e con gli ingressi (la chiave esterna di `family_members` prende `for key share`, che confligge con `for update`) |
| 8 | **Ordine dei lucchetti** (coordinatore; completato dopo la revisione, rilievo 6): `app_admin_roles` → lucchetto dell'utente (`user_memberships:<id>`, seconda revisione) → lucchetto dell'email (`registration_email:<email>`, terza revisione) → righe delle famiglie in ordine di id → link di quelle famiglie → prenotazioni → resto. I percorsi della famiglia non prendono `app_admin_roles`. Anche i lucchetti impliciti dei trigger di versione (che aggiornano la riga della famiglia) rispettano l'ordine, perché la riga è già presa (sezione 1, «Ordine dei lucchetti») | Nessun ciclo fra i percorsi nuovi; il ciclo residuo con le modifiche ordinarie di una famiglia che si sta eliminando è trattato con una ripetizione (decisione 19) |
| 9 | **Cancellazione dell'account in tre passi**: prima transazione nel database (tutti i dati dell'app, riga `account_deletions` in attesa), cancellazione definitiva in Auth dopo il commit, chiusura. Ripresa dal Cron Trigger orario esistente | Le due scritture non sono atomiche fra loro: la prima transazione è il punto di non ritorno e tutto ciò che segue è idempotente (sezione 4 sotto) |
| 10 | **Revoca degli accessi**: la cancellazione definitiva in Auth (`DELETE /auth/v1/admin/users/{id}` senza `should_soft_delete`) elimina a cascata `auth.sessions`, `auth.identities`, `auth.oauth_consents` e `auth.oauth_authorizations` (verificato con Context7 su `/supabase/auth` e sulle chiavi esterne dello stack locale); i token già emessi li rifiuta subito `loadSession`, perché il profilo non c'è più dalla prima transazione | Nessuna scrittura nello schema `auth`; un token non scaduto non serve a nulla |
| 11 | **Numero di agenti collegati**: sulla pagina del proprio account sì («Si scollegano anche i tuoi 2 agenti»), da `app.connected_agents()`; sulla pagina in terza persona no, solo «anche quelli degli agenti collegati» | Per sé il dato c'è già e aiuta a capire; per un altro utente servirebbe una lettura nuova di `auth` per un dato che non cambia la decisione (motivo di B) |
| 12 | **Account in attesa di cancellazione**: compare nell'elenco degli utenti con l'etichetta «Cancellazione in corso» e nel dettaglio con l'avviso e «Completa la cancellazione»; `account_exists` degli inviti all'app resta vero finché la riga non è completata, perché l'account in Auth esiste ancora | L'amministratore deve poterlo vedere e sbloccare; la regola di A legge `auth.users` e resta coerente da sé |
| 13 | **Accesso con un account in attesa**: l'accesso con password riesce in Auth, ma ogni operazione risponde `unauthorized` (niente profilo) e il web chiude la sessione dopo il rinnovo; la pagina di accesso mostra «Questo account è stato cancellato» invece di tornare in silenzio al modulo | Nessuno stato strano: la sessione esiste per un istante, non apre dati e il motivo si legge |
| 14 | `family.join` (ingresso con un account esistente) ha il suo strumento MCP; la pagina pubblica e l'accettazione con un account nuovo no (`role: 'public'`, regola di A) | Un agente che riceve il link può far entrare la persona dopo la sua conferma; creare account resta solo sulla pagina |
| 15 | Una sola PR (decisione dell'utente del 16/10) | Le regole comuni (successore, «ex membro», lucchetti) restano coerenti |
| 16 | **Prenotazione con stato terminale** (rilievo 1): `reserved` → `joined` o `closed`. Una ripetizione dopo `joined` o `closed` non chiama Auth, non scrive appartenenze e non cambia la famiglia mostrata: per rientrare dopo una rimozione serve il percorso con accesso (`family.join`) e le regole sulle rimozioni | Una ripetizione dell'operazione pubblica non deve mai far rientrare un rimosso né ricreare un account |
| 17 | **Ingresso diventato impossibile** fra prenotazione e chiusura (link revocato, autore retrocesso, famiglia eliminata; decisione del coordinatore, 16/10): l'account eventualmente già creato in Auth **resta**, senza compensazione; la prenotazione passa a `closed` e resta rintracciabile anche senza la famiglia (impronta del token ed email salvate sulla prenotazione). La pagina dice che l'invito non vale più e porta all'accesso con l'email già scritta; dopo l'accesso c'è «Non fai ancora parte di una famiglia» con «Crea la tua famiglia». L'account compare nell'elenco degli utenti di B. La scadenza non chiude una prenotazione già fatta (regola di A), la revoca sì (rilievo 4) | Come l'account senza ruoli di A dopo una revoca; nessun account preesistente si cancella |
| 18 | **Account in cancellazione senza ruoli nuovi** (rilievo 2): un trigger `before insert` su `app.user_roles` prende `for key share` sul profilo del destinatario e rifiuta (`P0A07`) se non c'è; `begin_account_deletion` cancella il profilo **prima** dei ruoli. Un'assegnazione in corso e una cancellazione si mettono in fila sulla riga del profilo | La cascata di Auth non deve mai togliere un `app_admin` comparso dopo la prima transazione senza il lucchetto `app_admin_roles` |
| 19 | **Cicli con i percorsi esistenti**: eliminazione della famiglia e cancellazione dell'account bloccano la famiglia e poi cancellano a cascata righe che una modifica ordinaria concorrente può aver già bloccato prima di aggiornare la famiglia nel trigger di versione. Postgres risolve con `40P01`: le tre operazioni di cancellazione (`family.delete`, `account.delete`, `users.delete`) ripetono la transazione una volta su `40P01`; la modifica ordinaria che perde riceve il suo errore, e la sua famiglia sta sparendo | I percorsi esistenti non si possono riordinare con modifiche solo additive; il caso è raro e l'esito è quello voluto |
| 20 | **Divieto MCP sotto i lucchetti** (rilievo 3): `begin_account_deletion` ricava il canale dal token (`auth.jwt() ->> 'client_id'`, la stessa regola di `channelOf`) e, se la richiesta viene da un agente e il piano definitivo elimina almeno una famiglia, rifiuta con `P0A15` (`web_only`) prima di qualsiasi scrittura. Il controllo preliminare del gestore resta solo come scorciatoia | `deletedFamilies` è un input del chiamante; il piano che conta è quello sotto i lucchetti |
| 21 | **Registro degli ingressi** (rilievo 7, decisione del coordinatore): ogni ingresso da link, con account nuovo o esistente, scrive link, persona e momento in `app.family_joins`; l'amministratore della famiglia li vede nella pagina dei membri. Una ripetizione senza effetti non scrive; un rientro dopo un'uscita scrive una riga nuova. Alla cancellazione dell'account le righe della persona si cancellano | Chi è entrato, con quale link e quando |
| 22 | **Dati personali delle prenotazioni** (rilievo 8): alla cancellazione dell'account le prenotazioni della persona perdono l'email e passano a `closed`; restano solo invito, id prenotato e date, che servono al tetto e all'idempotenza. Una nuova registrazione con la stessa email crea un account nuovo con un id nuovo, se il tetto lo permette | Nessuna email resta dopo la cancellazione; liberare la quota permetterebbe nuove creazioni |
| 23 | **Revoca locale annullabile** (rilievo 9): la revoca di una famiglia sul dispositivo si annulla solo con una conferma del server partita **dopo** la revoca (risposta di `family.join` o un profilo letto che contiene di nuovo la famiglia). Non torna nessun dato vecchio: le viste e la coda della spesa sono già state tolte | Un rientro autorizzato deve funzionare nella stessa sessione, senza che una risposta tardiva annulli una revoca più recente |
| 24 | **Email negli inviti all'app** (revisione della PR, rilievo 1): la prima transazione della cancellazione revoca anche gli inviti all'app ancora aperti per l'email dell'account e toglie l'email (`email = null`) da quelli che l'account ha accettato e da tutti quelli indirizzati alla sua email; le righe restano, con ruoli, autore e date. L'amministrazione mostra «account cancellato» al posto dell'email. Unica modifica a una tabella esistente, solo additiva: `app.app_invitations.email` ammette `null`, con il vincolo che un invito `pending` ha sempre l'email | La conferma promette «nome, email, voti e accessi»; dopo la cascata di Auth `accepted_by` diventa nullo e la riga non sarebbe più riconducibile all'account |

## 1. Database

Migrazione `supabase/migrations/20261016100000_family_management.sql`, **solo additiva**:
tabelle e funzioni nuove, nessuna modifica a tabelle o funzioni esistenti salvo una,
additiva: `app.app_invitations.email` ammette `null` per gli inviti di un account
cancellato, con il vincolo `app_invitations_pending_email` (un invito `pending` ha sempre
l'email; decisione 24). Tutte le
funzioni nello schema `app`, `security definer`, `set search_path = ''`, `EXECUTE`
revocato a `public` e concesso solo ai ruoli indicati. Le funzioni per gli utenti
ricontrollano l'autorizzazione al loro interno.

### Tabelle nuove

**`app.family_invitations`**

| Colonna | Tipo e vincoli |
|---|---|
| `id` | `uuid primary key` (scelto dal client, idempotenza) |
| `family_id` | `uuid not null references app.families (id) on delete cascade` |
| `token_hash` | `bytea not null unique check (octet_length(token_hash) = 32)` |
| `created_by` | `uuid references auth.users (id) on delete set null` |
| `created_at` | `timestamptz not null default now()` |
| `expires_at` | `timestamptz not null` (7 giorni dalla creazione) |
| `revoked_at`, `revoked_by` | `timestamptz`, `uuid references auth.users (id) on delete set null` |
| `revoke_reason` | `text check (in ('manual','creator_left','creator_removed','creator_demoted','creator_deleted'))`, non nullo se e solo se `revoked_at` non è nullo |

Indice su `(family_id, created_at desc)`. RLS attiva, nessun privilegio diretto a
`authenticated` o `anon`: tutto passa dalle funzioni. Un link è **usabile** se
`revoked_at is null and expires_at > now()`.

**`app.family_invitation_reservations`**: prenotazioni degli account nuovi, rintracciabili
anche dopo l'eliminazione della famiglia (rilievo 5).

| Colonna | Tipo e vincoli |
|---|---|
| `user_id` | `uuid primary key` (id prenotato, **senza** chiave esterna: l'account nasce dopo e può essere cancellato) |
| `invitation_id` | `uuid references app.family_invitations (id) on delete set null` |
| `family_id` | `uuid references app.families (id) on delete set null` |
| `token_hash` | `bytea not null` (impronta del link al momento della prenotazione: la ripetizione dallo stesso link la ritrova anche senza invito) |
| `email` | `text` (minuscolo e senza spazi, `check`); nullo solo dopo la cancellazione dell'account (decisione 22) |
| `status` | `text not null check (in ('reserved','joined','closed'))` |
| `reserved_at` | `timestamptz not null default now()` |
| `finished_at` | `timestamptz` (non nullo se e solo se `status <> 'reserved'`) |

Indice univoco su `(token_hash, email)` dove `email is not null`; indice su
`invitation_id`. Il numero di righe per `invitation_id` è il contatore del tetto
(`FAMILY_INVITATION_ACCOUNT_LIMIT = 10`, costante nella funzione e nel contratto): ogni
stato conta, anche `closed`. RLS attiva, nessun privilegio diretto.

**`app.family_joins`**: registro degli ingressi da link (decisione 21).

| Colonna | Tipo e vincoli |
|---|---|
| `id` | `uuid primary key default gen_random_uuid()` |
| `family_id` | `uuid not null references app.families (id) on delete cascade` |
| `invitation_id` | `uuid not null references app.family_invitations (id) on delete cascade` |
| `user_id` | `uuid not null references auth.users (id) on delete cascade` |
| `mode` | `text not null check (in ('new_account','existing_account'))` |
| `joined_at` | `timestamptz not null default clock_timestamp()` |

Indice su `(family_id, joined_at desc)`. RLS attiva, nessun privilegio diretto; nessun
nome né email nella tabella (i nomi si leggono dal profilo, solo per i membri attuali).

**Trigger su `app.profiles`** (seconda revisione, rilievo 1):
`profiles_reject_deleted_ids`, `before insert`, rifiuta (`P0A01`) un `user_id` presente
in `app.account_deletions`: un id cancellato non torna mai, nemmeno da una richiesta di
creazione già in volo (sezione 2, «Ricreazione di un id cancellato»).

**Trigger su `app.user_roles`** (decisione 18): `user_roles_require_profile`, `before
insert`, funzione `app.user_roles_require_profile()` (`security definer`, non eseguibile
dagli utenti): `perform 1 from app.profiles where user_id = new.user_id for key share`;
nessuna riga → `P0A07`. Vale per `set_user_role` di B e per `complete_app_invitation` di
A senza toccarli (il profilo di un account nuovo lo crea il trigger su `auth.users`).

**`app.family_removals`** (specifica, sezione 2)

| Colonna | Tipo e vincoli |
|---|---|
| `family_id` | `uuid not null references app.families (id) on delete cascade` |
| `user_id` | `uuid not null references auth.users (id) on delete cascade` |
| `removed_by` | `uuid references auth.users (id) on delete set null` |
| `removed_at` | `timestamptz not null default clock_timestamp()` |

Indice su `(family_id, user_id, removed_at desc)`. Una rimozione blocca i link della
stessa famiglia con `created_at <= removed_at`. L'uscita volontaria non scrive nulla.
RLS attiva, nessun privilegio diretto.

**`app.account_deletions`**: cancellazioni avviate.

| Colonna | Tipo e vincoli |
|---|---|
| `user_id` | `uuid primary key` (**senza** chiave esterna: la riga sopravvive all'utente) |
| `requested_by` | `uuid` (senza chiave esterna: può essere lo stesso utente) |
| `requested_at` | `timestamptz not null default now()` |
| `attempts` | `int not null default 0` (tentativi falliti della cancellazione in Auth) |
| `last_error` | `text` (solo un codice: `auth_admin_failed`, `auth_admin_key_missing`, `status_<n>`) |
| `last_attempt_at` | `timestamptz` |
| `completed_at` | `timestamptz` |

Nessun dato personale (né email né nome): la riga serve solo a riprendere e a mostrare lo
stato. RLS attiva; lettura solo dalle funzioni. Le righe completate restano
(conservazione minima, nessun dato personale).

### Contatori di versione

Trigger esistenti: `family_members_version` fa crescere la versione della famiglia a ogni
cambio dei membri, quindi la vista dei membri resta corretta. **Nessun trigger di
versione nuovo** (seconda revisione, rilievo 8): l'elenco dei link e il registro degli
ingressi sono letture **non versionate** (piccole, solo per gli amministratori), perché
dipendono anche da prenotazioni e scadenze che non toccano la famiglia. L'eliminazione di
una famiglia non incrementa nulla (la riga non c'è più): i client lo scoprono con
`forbidden` o dal profilo (sezione 3, «Dati sul dispositivo»).

### Ordine dei lucchetti

Regola per ogni funzione nuova (prima revisione, rilievo 6; seconda revisione, rilievi 1
e 2), nell'ordine:

1. `pg_advisory_xact_lock(hashtextextended('app_admin_roles', 0))`, solo per chi può
   togliere `app_admin` (la cancellazione di un account);
2. **lucchetto dell'utente**:
   `pg_advisory_xact_lock(hashtextextended('user_memberships:' || user_id, 0))`, preso da
   ogni percorso che crea un'appartenenza o una prenotazione per quell'utente
   (`app.create_family` di A, `join_family`, `complete_family_invitation`) e dalla
   cancellazione dell'account, che così stabilizza
   l'insieme delle famiglie prima di enumerarlo. Chi tocca più utenti li prende in
   ordine di id. **Subito dopo questo lucchetto** ogni percorso che crea un'appartenenza
   ricontrolla che l'utente abbia ancora il profilo e non abbia una riga in
   `account_deletions` (`create_family` e `join_family`: `42501`; `complete`: `P0A01`),
   perché la cancellazione che lo teneva può aver appena cancellato il profilo;
3. **lucchetto dell'email** (terza revisione, rilievi 1 e 2):
   `pg_advisory_xact_lock(hashtextextended('registration_email:' || email, 0))` con
   l'email normalizzata, preso da `claim_family_invitation` come **primo** lucchetto
   (l'email è nell'input; `claim` non prende il lucchetto dell'utente) e dalla
   cancellazione dell'account per l'email dell'account, subito dopo il lucchetto
   dell'utente. Serializza le registrazioni della stessa email fra loro e con la
   cancellazione, così l'insieme delle prenotazioni da anonimizzare è stabile;
4. `select … from app.families where id = … for update`, una o più righe **in ordine di
   id**, prima di qualunque scrittura su righe della famiglia;
5. righe di `app.family_invitations` di quelle famiglie (`for update`, in ordine di id);
6. righe di `app.family_invitation_reservations` (`for update`, in ordine di `user_id`);
7. il resto (membri, profili, ruoli, voti), che si scrive solo dopo.

Chi parte da un'impronta o da una prenotazione (`claim`, `complete`, `join_family`) legge
prima senza lucchetto per sapere utente e famiglia, prende i lucchetti nell'ordine e
**rilegge e ricontrolla** sotto i lucchetti (stato del link, della prenotazione, dei
membri, rimozioni, autorizzazione di chi chiama). Le transazioni sono `read committed`,
quindi ogni istruzione dopo un lucchetto vede ciò che chi lo teneva ha confermato.

`app.create_family` di A si ridefinisce nella migrazione (`create or replace`, stessa
firma e stesso comportamento) per prendere il lucchetto dell'utente prima del suo
lucchetto sull'id: è l'unica funzione esistente toccata, richiesta dal coordinatore.

**Percorsi esistenti**: le modifiche ordinarie di una famiglia (pasti, spesa,
impostazioni, esclusioni) bloccano le proprie righe e poi la famiglia nel trigger di
versione. Contro `delete_family` e `begin_account_deletion`, che bloccano la famiglia e
poi cancellano quelle righe, può nascere un ciclo che Postgres interrompe con `40P01`,
scegliendo lui la vittima: decisione 19 (le cancellazioni ripetono una volta; se la
vittima è la modifica, riceve il suo errore). Fra i percorsi nuovi non c'è ciclo: lo
prova il test «revoca contro retrocessione e rimozione» (sezione 5), che esclude
`40P01`.

### Link utilizzabili e link da fermare

Un link è **usabile** (nuovi ingressi e nuove prenotazioni) se `revoked_at is null and
expires_at > now()`. Un link è **aperto** se `revoked_at is null`: anche scaduto, può
ancora chiudere una prenotazione `reserved` (regola di A). La perdita del ruolo, la
rimozione, l'uscita e la cancellazione dell'autore revocano i suoi link **aperti**, non
solo gli usabili (seconda revisione, rilievo 3); la revoca manuale vale per i link
aperti; l'elenco degli amministratori mostra i link usabili e quelli scaduti con
prenotazioni `reserved`.

### Funzioni per gli inviti alla famiglia

Codici SQLSTATE nuovi, dopo quelli in uso (`P0A01`–`P0A08`):

| Codice | Significato | Errore del contratto |
|---|---|---|
| `P0A09` | ultimo amministratore della famiglia | `last_admin` |
| `P0A10` | unico membro (serve eliminare la famiglia) | `sole_member` |
| `P0A11` | piano di cancellazione cambiato | `conflict` |
| `P0A12` | il proprio account dall'amministrazione | `not_allowed` `{ reason: 'own_account' }` |
| `P0A13` | successore non valido | `invalid` sul campo `successors` (o `successorId`) |
| `P0A14` | persona non membro della famiglia | `not_found` |
| `P0A15` | cancellazione via agente che eliminerebbe una famiglia | `web_only` con l'URL della pagina |

Si riusano `P0A01` (invito non disponibile → `invitation_unavailable`), `P0A03` (email
con un account → `not_allowed` `account_exists`), `P0A05` (id in uso → `invalid` `in_use`)
e `42501` (`forbidden`).

- `app.create_family_invitation(p_family_id uuid, p_id uuid, p_token_hash bytea)
  returns app.family_invitations` — `authenticated`. `for update` sulla famiglia
  (inesistente: `42501`), poi chi chiama deve essere `family_admin` (`42501`). Se l'id
  esiste per la stessa famiglia, non revocato, creato da chi chiama: sostituisce solo
  `token_hash` (ripetizione dopo una risposta persa: il nuovo link vale, come in A; il
  link precedente non è mai stato mostrato, quindi non ha prenotazioni); se l'id esiste
  in altro modo: `P0A05`. Altrimenti inserisce con `expires_at = now() + 7 days`.
- `app.revoke_family_invitation(p_family_id uuid, p_id uuid) returns void` —
  `authenticated`. `for update` sulla famiglia, poi `family_admin` (`42501`), poi `for
  update` sull'invito; id di un'altra famiglia o inesistente: `P0A06` (riuso di A,
  «invito inesistente» → `not_found`). Già revocato: nessun effetto. Vale anche per un
  link scaduto ma aperto. Imposta `revoked_at`, `revoked_by`, `revoke_reason =
  'manual'`.
- `app.family_invitations_view(p_family_id uuid)` — `authenticated`, `family_admin`
  (`42501`). Restituisce, dal più recente, i link usabili e quelli scaduti ma aperti con
  almeno una prenotazione `reserved`: `id, created_by, created_by_name` (nome solo se
  l'autore è ancora membro), `created_at, expires_at, registrations` (prenotazioni del
  link, ogni stato), `pending_registrations` (prenotazioni `reserved`).
- `app.family_joins_view(p_family_id uuid)` — `authenticated`, `family_admin` (`42501`).
  Gli ultimi 50 ingressi, dal più recente: `joined_at, mode, user_name` (nullo se la
  persona non è più membro: «ex membro»), `invitation_id`, `invitation_created_by_name`
  (stessa regola), `invitation_created_at`.
- `app.family_invitation_by_token(p_token_hash bytea) returns table (family_name text,
  invited_by_name text, accounts_available boolean)` — `anon`. Nessuna riga se il link
  non è usabile. `accounts_available` è falso a tetto raggiunto. Nessun altro dato della
  famiglia.
- `app.claim_family_invitation(p_token_hash bytea, p_email text) returns table (user_id
  uuid, email text, state text, member boolean)` — `anon`. `state` è `create` (l'account
  va creato), `joined` o `closed` (prenotazione terminale: il server non chiama Auth e
  non scrive nulla) oppure `unavailable` (il server risponde `invitation_unavailable`).
  La funzione **non solleva** per gli esiti che scrivono uno stato, così la transazione
  conferma (seconda revisione, rilievo 9). Passi, in quest'ordine (terza revisione,
  rilievo 2):
  1. email normalizzata, poi **lucchetto dell'email**: due richieste della stessa email
     si mettono in fila qui, prima di ogni altra lettura che decide; la seconda, dopo
     l'attesa, vede la prenotazione confermata dalla prima;
  2. **prenotazione esistente** per `(p_token_hash, email)`, letta dopo il lucchetto: se
     c'è, `for update` sulla sua famiglia (se c'è), sul suo invito (se c'è), sulla
     prenotazione, e rilettura; poi:
     - `joined` o `closed`: la restituisce com'è (`member` dice se l'utente prenotato è
       membro adesso); `closed` senza account in `auth.users` → `unavailable`;
     - `reserved` con il link revocato o senza famiglia (eliminata): passa a `closed`
       (`finished_at`); con l'account già in `auth.users` restituisce `closed`,
       altrimenti `unavailable` (lo stato `closed` resta scritto);
     - `reserved` con l'utente già membro della famiglia (entrato con `join_family`):
       passa a `joined` e lo restituisce, senza scrivere altro;
     - `reserved` altrimenti, anche a link scaduto (regola di A): `create`.
     Nessun riavvio serve: sotto il lucchetto dell'email la prenotazione non può
     comparire dopo questa lettura;
  3. **solo se non c'è**, i controlli di una registrazione nuova: invito per impronta
     (nessuno: `unavailable`, senza scritture); `for update` sulla famiglia, poi
     sull'invito; link non usabile → `unavailable`; un account con quell'email in
     `auth.users` → `P0A03`; prenotazioni dell'invito ≥ 10 → `unavailable`; poi
     `insert … on conflict (token_hash, email) where email is not null do nothing` (difesa
     in più, non necessaria con il lucchetto) e rilettura della riga: `create`. Un id
     prenotato altrove per la stessa email (in `app_invitations`) non blocca: vince chi
     crea l'account per primo, l'altro riceve `account_exists` alla creazione; un'altra
     prenotazione della stessa email su un altro link è in fila sullo stesso lucchetto.
- `app.account_id_deleted(p_user_id uuid) returns boolean` — `anon`. Vero se
  `account_deletions` ha una riga per quell'id. La usa il server subito prima del `POST`
  di creazione (sezione 2, «Ricreazione di un id cancellato»).
- `app.complete_family_invitation(p_user_id uuid) returns table (family_id uuid, joined
  boolean)` — `anon`. Per prenotazione, non per impronta, così funziona anche dopo
  l'eliminazione della famiglia. Prenotazione inesistente: `P0A01`; utente non in
  `auth.users` con l'email prenotata, o con una riga in `account_deletions`: `P0A01`.
  Lucchetto dell'utente, poi famiglia se c'è, invito se c'è, prenotazione; riletture.
  Poi:
  - `joined` o `closed`: restituisce l'esito senza scrivere (`joined` = membro adesso);
  - `reserved` con link revocato, famiglia sparita o **rimozione della persona da quella
    famiglia posteriore alla creazione del link** (`family_removals`; seconda revisione,
    rilievo 1): `closed`, `joined` falso (l'account resta, decisione 17);
  - `reserved` con la persona già membro (entrata con `join_family` nel frattempo):
    `joined`, nessuna riga nuova in `family_members` né in `family_joins`, famiglia
    mostrata invariata;
  - `reserved` altrimenti: inserisce `family_members (role 'member')`, la riga di
    `family_joins` (`new_account`), imposta `profile_preferences.current_family_id`
    (upsert), passa a `joined`; `joined` vero. Il registro si scrive solo quando nasce
    davvero un'appartenenza.
- `app.family_invitation_status(p_token_hash bytea) returns table (family_id uuid,
  family_name text, invited_by_name text, already_member boolean)` — `authenticated`.
  Per chi ha già un account: `already_member` vero se chi chiama è membro (anche con il
  link non più usabile); altrimenti nessuna riga se il link non è usabile **o** chi
  chiama è stato rimosso da quella famiglia dopo la creazione del link (stesso esito,
  specifica sezione 7).
- `app.join_family(p_token_hash bytea) returns uuid` — `authenticated`. Invito per
  impronta senza lucchetto, poi lucchetto di chi chiama, `for update` sulla famiglia e
  sull'invito, ricontrollo; già membro: restituisce l'id senza cambiare nulla (né ruolo
  né famiglia mostrata né registro); link non usabile o rimozione posteriore al link:
  `P0A01`. Inserisce il membro come `member`, la riga di `family_joins`
  (`existing_account`) e imposta la famiglia mostrata. Le prenotazioni `reserved` di chi
  chiama per la stessa famiglia passano a `joined` (seconda revisione, rilievo 1): una
  ripetizione di `accept` non trova più nulla da completare.

### Funzioni per membri e ruoli

Tutte `authenticated`. Ognuna prende per prima cosa `select 1 from app.families where id
= p_family_id for update` (famiglia inesistente: `42501`, come oggi per una famiglia
altrui), poi ricontrolla chi chiama sotto il lucchetto.

- `app.set_family_member_role(p_family_id uuid, p_user_id uuid, p_role text) returns
  void` — chi chiama `family_admin` (`42501`); bersaglio non membro: `P0A14`; ruolo non
  valido: `22023`; stesso ruolo: nessun effetto. Retrocessione: se il bersaglio è
  l'ultimo `family_admin`, `P0A09`; altrimenti aggiorna e revoca i link aperti creati
  dal bersaglio in quella famiglia (`creator_demoted`). Si può retrocedere sé stessi se
  c'è un altro amministratore.
- `app.remove_family_member(p_family_id uuid, p_user_id uuid) returns void` — chi chiama
  `family_admin` (`42501`); bersaglio = chi chiama: `22023` (si usa l'uscita); bersaglio
  già fuori: nessun effetto (idempotente). Altrimenti: inserisce `family_removals`,
  revoca i link aperti del bersaglio (`creator_removed`), cancella l'appartenenza. Chi chiama
  resta amministratore, quindi l'ultimo amministratore non è mai in gioco.
- `app.leave_family(p_family_id uuid, p_successor_id uuid) returns void` — chi chiama
  membro (`42501`; già uscito per una ripetizione: `42501`, che il web tratta come
  uscita avvenuta, sezione 3). Unico membro: `P0A10`. Ultimo amministratore con altri
  membri: `p_successor_id` deve essere un altro membro (`P0A13` se manca o non lo è),
  che diventa `family_admin`; per gli altri `p_successor_id` deve essere nullo
  (`P0A13`). Poi revoca i link aperti di chi esce (`creator_left`) e cancella l'appartenenza.
  Nessuna riga in `family_removals`.

### Funzioni per l'eliminazione della famiglia

- `app.family_deletion_view(p_family_id uuid) returns table (name text, member_names
  jsonb, week_count int, can_delete boolean)` — `authenticated`, membro (`42501`).
  `can_delete` è `is_family_admin`.
- `app.delete_family(p_family_id uuid) returns void` — `authenticated`. `for update`
  sulla famiglia, poi `family_admin` (`42501`); poi `delete from app.families`: la
  cascata toglie appartenenze, settimane, pasti, registri, liste, esclusioni,
  impostazioni, link, ingressi (`family_joins`), rimozioni, job (`weekly_jobs`) e liste
  temporanee; `profile_preferences.current_family_id` diventa nullo. Le **prenotazioni
  restano** con `family_id` e `invitation_id` nulli (decisione 17: servono a ritrovare
  l'account creato e al tetto). Restano account, voti, altre famiglie, ricettario e ruoli
  globali. Il job settimanale che trovasse la famiglia sparita (riga cancellata fra la
  selezione e la sua transazione) passa oltre (sezione 2, «Job settimanale»).

### Funzioni per la cancellazione dell'account

Il piano di cancellazione è lo stesso per sé e per un altro utente.

- `app.account_deletion_plan(p_user_id uuid) returns jsonb` — `authenticated`. Chi
  chiama è `p_user_id` oppure `app_admin` (`42501`); utente inesistente: `P0A07`.
  Restituisce:
  - `families`: per ogni famiglia dell'utente `{ familyId, name, outcome, candidates }`,
    con `outcome` `stays` (altri membri e un altro amministratore, o l'utente non è
    amministratore), `needs_successor` (unico `family_admin` con altri membri:
    `candidates` sono gli altri membri, `{ userId, displayName }`) o `deleted` (unico
    membro);
  - `lastAppAdmin`: ha `app_admin` e nessun altro lo ha;
  - `openInvitations`: link alla famiglia aperti creati dall'utente più inviti all'app
    `pending` creati dall'utente;
  - `pending`: c'è già una riga `account_deletions` non completata.
- `app.begin_account_deletion(p_user_id uuid, p_successors jsonb, p_deleted_families
  uuid[]) returns void` — `authenticated`. In questo ordine, nella stessa transazione:
  1. `pg_advisory_xact_lock(hashtextextended('app_admin_roles', 0))`;
  2. **autorizzazione sotto il lucchetto**: `p_user_id = auth.uid()` (nessun ruolo
     globale richiesto) oppure chi chiama è ancora `app_admin` (`42501`); un
     amministratore che indica sé stesso passa dal primo caso solo se chiama come
     utente (il percorso dell'amministrazione rifiuta prima con `P0A12`, sezione 2);
  3. riga `account_deletions` già presente: nessun effetto (la riprende il passo in
     Auth, sezione 4); utente inesistente in `auth.users`: `P0A07`;
  4. ultimo amministratore dell'app: `P0A08`;
  5. lucchetti nell'ordine della regola: **lucchetto dell'utente** (da qui nessuna
     appartenenza nuova per lui; seconda revisione, rilievo 2), poi **lucchetto della sua
     email** normalizzata, letta da `auth.users` (da qui nessuna prenotazione nuova per
     quell'email; terza revisione, rilievo 1), poi `for update` sulle righe delle famiglie
     dell'utente **e** di quelle delle prenotazioni con il suo id o la sua email, tutte in
     ordine di id, lette dopo i due lucchetti;
     poi i link aperti creati dall'utente e i link di quelle famiglie; poi quelle
     prenotazioni; infine, fra il «resto», le righe di `app.app_invitations` che il
     passo 8 tocca (aperte create dall'utente, accettate dall'account, indirizzate alla
     sua email), in ordine di id e con il solo lucchetto di riga: questo percorso non
     aspetta mai i lucchetti consultivi di A, quindi i percorsi di A (lucchetti
     consultivi, poi la riga) non possono formare un ciclo con lui (revisione della PR,
     rilievo 1);
  6. ricalcola il piano sotto i lucchetti: l'insieme delle famiglie `deleted` deve
     coincidere con `p_deleted_families` e per ogni famiglia `needs_successor`
     `p_successors[familyId]` deve esserci; insieme diverso: `P0A11`; successore
     mancante o non membro: `P0A13`; chiavi di `p_successors` per famiglie che non ne
     hanno bisogno: ignorate. **Canale** (decisione 20): se `auth.jwt() ->> 'client_id'`
     non è nullo (richiesta di un agente) e l'insieme definitivo delle famiglie
     `deleted` non è vuoto: `P0A15`, prima di qualsiasi scrittura;
  7. nomina i successori (`family_admin`);
  8. revoca i link alla famiglia aperti creati dall'utente (`creator_deleted`) e gli
     inviti all'app `pending` creati dall'utente **o indirizzati alla sua email**
     (`status = 'revoked'`, `revoked_by = auth.uid()`); toglie l'email (`email = null`)
     dagli inviti all'app accettati dall'account e da tutti quelli indirizzati alla sua
     email (decisione 24); anonimizza le prenotazioni con il suo id **o con la sua email**, anche
     su altri link e con id diversi (`email = null`, `status = 'closed'` se erano
     `reserved`, `finished_at`; decisione 22, seconda revisione, rilievo 4), e cancella
     le sue righe di `family_joins`;
  9. elimina le famiglie `deleted` (come `delete_family`);
  10. cancella i dati dell'app dell'utente in quest'ordine: `app.profiles` (con
      `profile_preferences` per cascata) **prima** di `user_roles`, così un'assegnazione
      in corso, che tiene `for key share` sul profilo, si conclude prima e il suo ruolo
      si cancella nell'istruzione successiva, mentre una che arriva dopo trova il
      profilo assente e riceve `P0A07` (decisione 18); poi `user_roles`, `ratings`,
      `family_members`. Le colonne d'autore restano fino alla cancellazione in Auth, che
      le rende nulle; nel frattempo i nomi non si leggono più perché il profilo non c'è;
  11. inserisce `account_deletions (user_id, requested_by)`.
- `app.pending_account_deletions(p_older_than interval) returns table (user_id uuid,
  attempts int)` — `app_job`. Righe non completate con `requested_at` (o
  `last_attempt_at`, se c'è) più vecchio di `p_older_than`.
- `app.record_account_deletion_attempt(p_user_id uuid, p_error text) returns int` —
  `app_job`. `p_error` nullo: segna `completed_at` solo se l'utente non è più in
  `auth.users` (altrimenti solleva `55000`, «oggetto non nello stato atteso»: un errore
  di programmazione, non un esito per l'utente); `p_error` non nullo: `attempts + 1`, `last_error`, `last_attempt_at`.
  Restituisce `attempts`.
- `app.admin_account_deletions() returns table (user_id uuid, requested_at timestamptz,
  attempts int, last_error text)` — `authenticated`, `app_admin` (`42501`): righe non
  completate, per l'elenco e il dettaglio di B.

Le funzioni `app_job` si eseguono con l'identità `job` di `server/src/db.ts`; `coverage_test`
riceve le nuove funzioni negli elenchi di `anon`, `authenticated` e `app_job`.

## 2. Contratto, server e MCP

Aree e file: le operazioni sui membri e sull'eliminazione stanno nell'area `family`
(`contract/src/family/members.ts`, `server/src/family/members.ts`, unite all'indice e al
router dell'area con una riga ciascuno); inviti alla famiglia nell'area nuova
`familyInvitations` (`contract/src/family-invitations/`,
`server/src/family-invitations/`); cancellazione dell'account nell'area nuova `account`
(`contract/src/account/`, `server/src/account/`); cancellazione degli utenti nell'area
`users` di B.

### Pipeline: lavoro dopo il commit

Serve alla cancellazione dell'account: la chiamata ad Auth non può stare dentro la
transazione che ha bloccato le righe che la cascata di Auth deve toccare (si
attenderebbero a vicenda), e la risposta dipende dal suo esito. Il gestore può
restituire, al posto del valore, un **seguito** che il pipeline esegue dopo il commit e
prima di validare l'output:

```ts
// server/src/pipeline.ts
export function afterCommit<T>(next: () => Promise<T>): AfterCommit<T>;
```

Se il gestore restituisce un `AfterCommit`, il pipeline conferma la transazione, poi
chiama `next()` senza connessioni aperte e usa il suo risultato come output; un errore
di `next()` segue la gestione ordinaria degli errori (log e codice), con la transazione
già confermata. Le altre operazioni non cambiano.

### Area `familyInvitations`

```ts
familyInvitationSchema = z.object({
  id: z.uuid(),
  createdBy: z.uuid().nullable(),
  createdByName: z.string().nullable(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  registrations: z.number().int().min(0).max(FAMILY_INVITATION_ACCOUNT_LIMIT),
  pendingRegistrations: z.number().int().min(0),
  expired: z.boolean(),                       // scaduto ma aperto, con prenotazioni in sospeso
});
familyJoinSchema = z.object({
  joinedAt: z.iso.datetime(),
  mode: z.enum(['new_account', 'existing_account']),
  userName: z.string().nullable(),            // null: «ex membro»
  invitationId: z.uuid(),
  invitationCreatedByName: z.string().nullable(),
  invitationCreatedAt: z.iso.datetime(),
});
```

| Operazione | Metodo e percorso | Ruolo | MCP | Input | Output | Errori |
|---|---|---|---|---|---|---|
| `list` | `GET /families/{familyId}/invitations` | `familyAdmin`, non versionata | lettura | `{ familyId }` | `{ invitations }` | — |
| `create` | `POST /families/{familyId}/invitations` | `familyAdmin`, `creates` | scrittura | `{ familyId, id }` | `{ invitation, url }` | `invalid` (`in_use`) |
| `revoke` | `DELETE /families/{familyId}/invitations/{id}` | `familyAdmin` | scrittura | `{ familyId, id }` | `{ invitations }` | `not_found` |
| `listJoins` | `GET /families/{familyId}/joins` | `familyAdmin`, non versionata | lettura | `{ familyId }` | `{ joins }` (al più 50) | — |
| `get` | `POST /family-invitations/read` | `public`, `rateLimit: 'read'` | no | `{ token }` | `{ familyName, invitedBy, accountsAvailable }` | `invitation_unavailable`, `rate_limited` |
| `status` | `POST /family-invitations/status` | `user` | lettura | `{ token }` | `{ familyId, familyName, invitedBy, alreadyMember }` | `invitation_unavailable` |
| `accept` | `POST /family-invitations/accept` | `public`, `rateLimit: 'accept'` | no | `{ token, email, displayName, password, locale }` (come A) | `{ email, joined: boolean }` | `invitation_unavailable`, `invalid` (email, password), `not_allowed` (`account_exists`), `rate_limited` |

- Token: 32 byte casuali base64url (`newToken`, `hashTokenHex` di A, spostati o
  reimportati da `server/src/app-invitations/tokens.ts` senza cambiarli); link
  `${origin}/invite#<token>`; `url` solo nella risposta di `create`.
- `create` è idempotente sull'`id` (ripetuta restituisce un link nuovo per la stessa
  riga, come A).
- `accept` segue A passo per passo: `claim_family_invitation` in una transazione
  `anonDb`; con `state = 'create'` `createInvitedAccount` di `server/src/accounts/`
  senza connessioni aperte, poi `complete_family_invitation(user_id)` in un'altra
  `anonDb`. Con `state` `joined` o `closed` il server **non** chiama Auth né
  `complete`: risponde `{ email, joined: member }` (decisione 16). Stesse
  riconciliazioni di A (`email_taken` → `account_exists`, `weak_password` → `invalid`
  con la prenotazione che resta e nessuna quota in più, esiti ambigui riletti per id).
  Il server non riscrive mai un account esistente. `joined: false` vuol dire «account
  pronto, ingresso non più possibile» (decisione 17): la pagina lo dice e porta
  all'accesso con l'email. `state = 'unavailable'` → `invitation_unavailable`, dopo il
  commit dello stato scritto.
- **Ricreazione di un id cancellato** (seconda revisione, rilievo 1). Due accettazioni
  in volo possono aver ricevuto entrambe `create`; se la prima completa e l'account viene
  poi cancellato, il `POST` della seconda ricreerebbe l'id vecchio. Tre difese:
  1. `createInvitedAccount` riceve l'opzione `beforeCreate: () => Promise<boolean>` e la
     chiama subito prima del `POST`; il gestore le passa la lettura di
     `app.account_id_deleted(id)` in una `anonDb` breve: vero → nessun `POST`, risposta
     `invitation_unavailable`;
  2. `complete_family_invitation` rifiuta (`P0A01`) un id con una riga in
     `account_deletions`, quindi l'account ricreato non entra in nessuna famiglia;
  3. **la finestra è chiusa nel database**: un trigger nuovo `before insert` su
     `app.profiles`, `profiles_reject_deleted_ids` (funzione
     `app.profiles_reject_deleted_ids()`), rifiuta un `user_id` presente in
     `account_deletions`. Il profilo nasce dal trigger esistente `after insert on
     auth.users` (`create_profile_for_new_user`), nella stessa transazione
     dell'inserimento di Auth: se la cancellazione è confermata fra la lettura del passo
     1 e il `POST`, Auth riceve l'errore e **non crea** l'account. `createInvitedAccount`
     vede un esito ambiguo, rilegge l'utente (`404`) e lancia `auth_admin_failed`
     (`internal`); una ripetizione trova la prenotazione `closed` senza email e non
     ricrea nulla. Nessuna scrittura nello schema `auth`: il trigger è su una tabella
     dell'app. Il passo 1 resta perché evita la chiamata ad Auth nel caso normale.
- Limitatori: si riusano `INVITE_READ_LIMIT` e `INVITE_ACCEPT_LIMIT` (stessa natura delle
  operazioni di A, nessun binding nuovo).
- Strumenti MCP: `familyInvitations_list`, `familyInvitations_create`,
  `familyInvitations_revoke`, `familyInvitations_listJoins`, `familyInvitations_status`. La descrizione di `create`
  dice che il link si vede solo ora e che chi lo riceve entra come membro.
- `family.join` (sotto) usa lo stesso token.

### Area `family`: membri ed eliminazione

| Operazione | Metodo e percorso | Ruolo | MCP | Input | Output | Errori |
|---|---|---|---|---|---|---|
| `join` | `POST /family-invitations/join` | `user` | scrittura | `{ token }` | `profileViewSchema` (nuova famiglia mostrata) | `invitation_unavailable` |
| `setMemberRole` | `PUT /families/{familyId}/members/{userId}/role` | `familyAdmin` | scrittura | `{ familyId, userId, role }` | `familyViewSchema` | `not_found`, `last_admin` |
| `removeMember` | `DELETE /families/{familyId}/members/{userId}` | `familyAdmin` | scrittura | `{ familyId, userId }` | `familyViewSchema` | `invalid` |
| `leave` | `POST /families/{familyId}/leave` | `familyMember` | scrittura | `{ familyId, successorId? }` | `profileViewSchema` | `sole_member`, `invalid` (`successorId`, anche quando il successore è diventato necessario nel frattempo) |
| `getDeletion` | `GET /families/{familyId}/deletion` | `familyMember`, `reads: ['family']` | lettura | `{ familyId }` | `{ name, memberNames, weekCount, canDelete }` | — |
| `delete` | `DELETE /families/{familyId}` | `familyAdmin`, `webOnly: { path: '/profile/family/delete?family=:familyId' }` | rimando | `{ familyId }` | `profileViewSchema` | — |

- `join` restituisce il profilo, così il web cambia famiglia senza un'altra lettura
  (come `family.create`). Strumento `family_join`: descrizione «chiedi conferma prima di
  far entrare la persona nella famiglia».
- `leave` ripetuta dopo un'uscita riuscita risponde `forbidden` (non è più membro): il
  web, che ha già la risposta o la rilegge, la tratta come uscita avvenuta.
- `delete` via MCP: il pipeline risponde `web_only` con l'URL della pagina prima del
  controllo del ruolo (comportamento esistente), senza eliminare.
- Strumenti: `family_join`, `family_setMemberRole`, `family_removeMember`, `family_leave`,
  `family_getDeletion`, `family_delete` (rimando). Le descrizioni di `removeMember` e di
  `leave` riportano gli effetti (voti fuori dalla media, «ex membro», link revocati).

### Area `account`

```ts
deletionFamilySchema = z.object({
  familyId: z.uuid(),
  name: z.string(),
  outcome: z.enum(['stays', 'needs_successor', 'deleted']),
  candidates: z.array(z.object({ userId: z.uuid(), displayName: z.string() })),
});
deletionPlanSchema = z.object({
  families: z.array(deletionFamilySchema),
  lastAppAdmin: z.boolean(),
  openInvitations: z.number().int().min(0),
  pending: z.boolean(),
});
deletionInputSchema = z.object({
  successors: z.record(z.uuid(), z.uuid()),     // familyId → userId
  deletedFamilies: z.array(z.uuid()),           // ciò che la pagina ha mostrato
});
```

| Operazione | Metodo e percorso | Ruolo | MCP | Input | Output | Errori |
|---|---|---|---|---|---|---|
| `getDeletionPlan` | `GET /account/deletion` | `user` | lettura | `{}` | `deletionPlanSchema.extend({ connectedAgents: z.number().int() })` | — |
| `delete` | `POST /account/deletion` | `user` | scrittura (con rimando condizionato) | `deletionInputSchema` | `{ completed: boolean }` | `last_app_admin`, `conflict`, `invalid` (`successors`), `web_only` |

- **Rimando MCP condizionato** (sezione 7; decisione 20): la regola vera è in
  `begin_account_deletion`, che sotto i lucchetti rifiuta con `P0A15` una richiesta di
  agente il cui piano definitivo elimina almeno una famiglia; il gestore traduce `P0A15`
  in `web_only` con `${origin}/profile/account/delete`. Prima, come scorciatoia, il
  gestore legge il piano e, con `context.channel === 'mcp'` e una famiglia `deleted`,
  risponde subito `web_only`. Nessuna scrittura in entrambi i casi. Lo strumento non
  dichiara `webOnly` nei metadati (non sempre rimanda); la descrizione lo spiega.
- **`40P01`** (decisione 19): `account.delete`, `users.delete` e `family.delete`
  ripetono la transazione una volta se Postgres la interrompe per un ciclo di attesa; al
  secondo `40P01` la risposta è `internal`. La transazione è del pipeline, quindi la
  ripetizione sta lì, per le operazioni elencate in `RETRY_ON_DEADLOCK`
  (`server/src/pipeline.ts`, metadato del server, non del contratto). **Confini**
  (seconda revisione, rilievo 7): il primo tentativo si annulla per intero; il secondo
  rifà da capo sessione (`loadSession`), ruolo, piano e gestore; si usano solo risultato
  e seguito (`afterCommit`) del tentativo confermato, quindi Auth si chiama una sola
  volta, dopo il commit riuscito; un errore del seguito, anche con codice `40P01`, non
  ripete nulla (la transazione è già confermata); le operazioni fuori dall'elenco non si
  ripetono mai.
- Flusso del gestore: `begin_account_deletion` nella transazione dell'utente; con
  `afterCommit` la cancellazione in Auth (`deleteAccount`, sotto) e la chiusura con
  l'identità `job`; risposta `{ completed: true }`, oppure `{ completed: false }` se la
  cancellazione in Auth è fallita (la riga resta in attesa e la riprende il Cron
  Trigger). In entrambi i casi l'utente è già fuori: il web chiude la sessione.
- Ripetizione: dopo la prima transazione il token dell'utente non passa più
  `loadSession` (`unauthorized`); il web non ripete.

### Area `users`: cancellazione dall'amministrazione

`userRowSchema` e `userDetailSchema` di B ricevono un campo facoltativo:

```ts
deletion: z.object({ requestedAt: z.iso.datetime(), attempts: z.number().int() }).nullable()
```

valorizzato da `app.admin_account_deletions()` (una lettura in più nel gestore, nessuna
modifica alle funzioni di B). Il nome di un account in attesa è quello di ripiego di
`admin_users` (parte dell'email prima della chiocciola), perché il profilo non c'è più.

| Operazione | Metodo e percorso | Ruolo | MCP | Input | Output | Errori |
|---|---|---|---|---|---|---|
| `getDeletionPlan` | `GET /users/{id}/deletion` | `appAdmin` | lettura | `{ id }` | `deletionPlanSchema.extend({ user: { id, displayName, email } })` | `not_found`, `not_allowed` (`own_account`) |
| `delete` | `POST /users/{id}/deletion` | `appAdmin` | scrittura (rimando condizionato) | `{ id } & deletionInputSchema` | `{ completed: boolean }` | `not_found`, `not_allowed` (`own_account`), `last_app_admin`, `conflict`, `invalid`, `web_only` |

- `own_account`: il server rifiuta `id === auth.uid()` (`P0A12`) prima di chiamare
  `begin_account_deletion`; la pagina del web non arriva a chiamarla (rimando alle
  Preferenze).
- `delete` su un account con la riga già in attesa: salta la prima transazione e ripete
  solo la cancellazione in Auth e la chiusura («Completa la cancellazione»); su un
  account già completato (non più in `auth.users`, riga completata): `{ completed: true
  }` (idempotente).
- Rimando MCP: come `account.delete` (scorciatoia nel gestore, regola in
  `begin_account_deletion` con `P0A15`), con `${origin}/admin/users/<id>/delete`.
- `users.setRole` su un account in attesa: il trigger `user_roles_require_profile`
  rifiuta l'assegnazione (`P0A07` → `not_found`, decisione 18); la rimozione non trova
  ruoli (già cancellati) e non fa nulla.
- `notAllowedData.reason` riceve `own_account` (`contract/src/errors.ts`, modifica
  minima).
- Strumenti: `users_getDeletionPlan`, `users_delete`; la descrizione chiede conferma
  esplicita all'utente prima di cancellare (decisione 4 di B).

### Modulo `server/src/accounts/`: `deleteAccount`

```ts
export async function deleteAccount(env, userId: string, options?: { fetch? }): Promise<'deleted' | 'absent'>
```

`DELETE /auth/v1/admin/users/{id}` con l'intestazione `apikey` (mai `Bearer`), corpo
vuoto (cancellazione definitiva), tempo massimo 10 s. `200`/`204` → `deleted`; `404`
`user_not_found` → `absent` (già cancellato: successo); ogni altro esito →
`AccountServiceError('auth_admin_failed', status)`; chiave assente →
`auth_admin_key_missing`. Il `send` interno di `createInvitedAccount` diventa una
funzione del modulo con `DELETE` fra i metodi; `createInvitedAccount` non cambia
comportamento. Resta l'unico punto che legge `SUPABASE_SECRET_KEY`.

### Job: ripresa delle cancellazioni (Cron Trigger orario)

Nel ramo `HOURLY_CRON` di `server/src/scheduled.ts`, dopo `runWeeklyJob`, in un `try`
proprio (un errore qui non tocca il job settimanale e viceversa):
`resumeAccountDeletions(env, now)` in `server/src/account/resume.ts`:

1. con l'identità `job`, `app.pending_account_deletions('5 minutes')`: righe non
   completate ferme da almeno 5 minuti (non si sovrappone a una richiesta in corso);
2. per ognuna, fuori da transazioni: `deleteAccount`; poi
   `record_account_deletion_attempt(user, null)` (successo o `absent`) oppure
   `record_account_deletion_attempt(user, code)`;
3. log: `account_deletion_resumed` (info) a ogni successo;
   `account_deletion_failed` (info) a ogni fallimento con `attempts`;
   **dopo 3 tentativi falliti** (cioè almeno tre ore) `account_deletion_overdue` a
   livello `error`, come `weekly_job_overdue`, e di nuovo a ogni tentativo successivo.
   Nessun abbandono: i dati dell'app sono già cancellati e l'account va chiuso; le
   righe si riprovano ogni ora finché non riescono.

Nei log solo id utente, codici e numeri: mai email, nomi, token.

L'amministratore vede le righe in attesa nell'elenco degli utenti («Cancellazione in
corso») e nel dettaglio (avviso con la data di avvio, il numero di tentativi falliti e
«Completa la cancellazione», che chiama `users.delete` e ripete subito il passo in Auth).

### Job settimanale e famiglie eliminate

`runWeeklyJobOn` seleziona i job con un `join` su `families` e lavora una transazione
per famiglia. Una famiglia eliminata dopo la selezione fa fallire l'inserimento delle
settimane per chiave esterna (`23503`) o non trova più il job: il job tratta `23503`
come «famiglia eliminata», scrive `weekly_job_family_gone` (info) e passa alla
successiva, senza `markFailed` (la riga del job è sparita con la famiglia). Modifica
minima in `server/src/menu/job.ts`, con un test.

## 3. Web

Prima di ogni schermata: `design/design.md` e `design/index.html` (sezione 14 della
specifica), con il confronto con i riferimenti approvati in
`design/references/hellofresh/` e con le schermate del quarto giro (`profile/family`,
`profile/family/delete`, `profile/account/delete`, `invite/[token]`) e del sesto giro
(`admin/users/[id]`, `admin/users/[id]/delete`) in `prototype/`. Si riusano token,
classi e componenti esistenti (`settings-card`, `row-list`, etichette di ruolo, pulsante
`danger`, `BottomSheet`); nessun linguaggio visivo nuovo (rilievo 12).

Componenti esistenti: `PageHeader`, `StateNotice`, `Loading`, `QueryError`, `BottomSheet`,
`useOnline`, il foglio di condivisione dei link di A (`ShareLinkSheet` o il suo
equivalente in `web/src/features/app-invitations/`, riusato). Componenti nuovi previsti
dal prototipo: `DeletionFamilies` (esito famiglia per famiglia con la scelta del
successore, in `web/src/features/account/`), pulsante rosso per le azioni irreversibili
(stile `danger` già usato da B). Niente aggiornamenti ottimistici: le mutazioni
applicano la risposta del server e marcano da rileggere le viste che ne dipendono
(registro di `web/src/api/mutations.ts`). Tutti i comandi sono disattivati senza
connessione.

### Pagina dell'invito `/invite#<token>` (`web/src/features/family-invitations/InvitePage.tsx`)

Rotta pubblica `/invite`, senza barra di navigazione, con il marchio; token letto dal
frammento (`/^[A-Za-z0-9_-]{43}$/`), come A; risposte superate scartate con lo stesso
contatore di generazione di A. `web/public/_headers` riceve anche `/invite` (oggi copre
solo `/invite/*`); il meta `no-referrer` di `index.html` c'è già.

| Stato | Contenuto |
|---|---|
| Caricamento | `Loading` |
| Non valido (link scaduto, revocato, inesistente, rimozione posteriore) | «Questo invito non vale più» e «Chiedi un link nuovo a un amministratore della famiglia» (stesso testo per tutti i casi, come A) |
| Troppi tentativi | «Troppi tentativi. Riprova tra un minuto» |
| Valido, nessun accesso | «Entra in {famiglia}», «{nome} ti invita a condividere menu e spesa della famiglia» (senza nome: «Hai ricevuto un link d'invito»). Con `accountsAvailable`: modulo di A (Email, Nome, Password, Ripeti la password) con il pulsante «Crea l'account ed entra». Sotto: «Hai già un account? Accedi per entrare» verso `/login?redirect=/invite#<token>` (il token nel frammento della pagina di accesso, mai nella query). Senza `accountsAvailable`: niente modulo, il messaggio dei link non validi per la creazione («Questo invito non vale più per creare un account: chiedi un link nuovo») e il collegamento per accedere |
| Valido, con accesso | da `familyInvitations.status`: «Entra in {famiglia}», «Entri come {nome}», pulsante «Entra nella famiglia» (`family.join`); dopo: la famiglia diventa quella mostrata e la pagina porta a `/menu`. Con un altro account aperto vale «Esci e continua» di A |
| Già membro | «Fai già parte di {famiglia}» con «Apri il menu» |

Dopo «Crea l'account ed entra»: con `joined: false` (decisione 17) la pagina mostra
«Questo invito non vale più, ma il tuo account è pronto: entra con email e password» e
porta a `/login` con l'email già scritta; dopo l'accesso c'è «Non fai ancora parte di
una famiglia» con «Crea la tua famiglia». Con `joined: true`, come A, accesso con email e
password (`signInWithPassword`); se riesce, la pagina porta a `/menu` con la famiglia
mostrata (l'ha impostata `complete_family_invitation`); se fallisce, `/login` con l'email scritta e
i testi di A («Il tuo account è pronto: entra con la password che hai scelto la prima
volta»). Errori del modulo come A (`account_exists` con il collegamento all'accesso).

Il ritorno dall'accesso: `LoginPage` accetta già `redirect`; il token resta nel frammento
della pagina di accesso (`/login?redirect=/invite#<token>`) e la rotta lo riporta su un
`redirect` che non ne ha uno. Nella query andrebbe al server a ogni ricarica (revisione
del branch); `/login` ha anche `Referrer-Policy: no-referrer`.

### Membri e inviti (`/profile/family`, `web/src/routes/profile/MembersPage.tsx`)

Estende la pagina oggi in sola lettura, nella forma del quarto giro:

- **Membri**: righe esistenti (nome, «(tu)», «Dal {data}», ruolo). Per gli amministratori,
  sulle altre persone il pulsante «Azioni per {nome}» apre un `BottomSheet` con il nome
  come titolo e:
  - «Rendi amministratore» (diretto) o «Rendi membro»: diretto se la persona non ha link
    attivi, altrimenti con conferma «I {n} link d'invito creati da {nome} smetteranno di
    valere» e pulsante «Rendi membro». Non c'è conferma per la nomina perché non
    revoca nulla (scostamento minimo dal prototipo, che non chiedeva conferme). `last_admin`: «Serve almeno un altro
    amministratore: nominane uno prima.»;
  - «Rimuovi dalla famiglia» (rosso) → conferma nello stesso foglio: «I voti di {nome}
    non conteranno più nella media della famiglia e le sue modifiche resteranno come
    «ex membro». Per rientrare servirà un link d'invito nuovo.», più la riga sui link
    attivi se ce ne sono; pulsante «Rimuovi {nome}».
  Sul proprio nome nessun pulsante: per sé si usano «Esci dalla famiglia» e, per un
  amministratore con altri amministratori, «Rendi membro» non serve (esce o resta).
- **Link d'invito** (solo amministratori): «Chi apre il link entra come membro. Ogni link
  vale 7 giorni e si può usare più volte; con lo stesso link si possono registrare al
  massimo 10 persone nuove.»; righe dei link usabili «Link di {nome}» (o «ex membro»),
  «Scade {data}», «{n} persone registrate con questo link» quando n > 0; i link scaduti
  con registrazioni in sospeso compaiono con «Scaduto: {n} registrazioni da completare»
  e lo stesso «Revoca» (seconda revisione, rilievo 3), pulsante «Revoca» con conferma breve («Revocare il link? Chi lo ha
  ricevuto non potrà più usarlo.»); «Crea un link d'invito» crea il link (`id` nato
  all'apertura del comando) e apre il foglio di condivisione con «Copia» e «Condividi»
  (Web Share con titolo «Entra in {famiglia}») e la nota di A «Il link si vede solo ora:
  se lo perdi, crea un nuovo link».
- **Ingressi con i link** (solo amministratori, decisione 21): card sotto i link con gli
  ultimi ingressi da `familyInvitations.listJoins`, uno per riga: «{nome}» (o «ex
  membro»), «{data e ora}», «con il link di {autore} del {data}», e l'etichetta
  «Account nuovo» quando `mode = 'new_account'`. Vuota: «Nessuno è ancora entrato con
  un link.».
- **Membri non amministratori**: la riga esistente «Per invitare qualcuno chiedi un link
  a: {nomi}».
- **Esci dalla famiglia** (bordo rosso) → foglio «Esci da {famiglia}» con i tre casi del
  prototipo: unico membro («Sei l'unico membro: per uscire elimina la famiglia» e il
  collegamento alla pagina di eliminazione); ultimo amministratore con altri membri
  (scelta del successore, «Nomina ed esci» disattivato finché manca); altrimenti «Non
  vedrai più il menu e la spesa di questa famiglia. Per rientrare servirà un link
  d'invito.» e «Esci». In tutti i casi con link attivi propri, la riga «I tuoi {n} link
  d'invito smetteranno di valere». Se il server risponde `invalid` su `successorId`
  (un altro amministratore è uscito nel frattempo e ora serve un successore, rilievo
  11), il foglio rilegge la famiglia e passa al caso «ultimo amministratore» con il
  testo «Ora sei l'unico amministratore: scegli chi lo diventa al tuo posto.». Dopo
  l'uscita: dati della famiglia tolti dal
  dispositivo (sotto) e `/profile` se resta un'altra famiglia, altrimenti `/menu` (che
  mostra «Non fai ancora parte di una famiglia»).

Il numero di link attivi per persona viene dall'elenco dei link (`createdBy`), che solo
gli amministratori leggono; chi non è amministratore non ha link attivi (decisione 6).

### Eliminazione della famiglia (`/profile/family/delete?family=<id>`)

`web/src/features/family-delete/FamilyDeletePage.tsx`; collegamento «Elimina la famiglia»
in fondo alle impostazioni della famiglia, per gli amministratori. Riepilogo del
prototipo da `family.getDeletion`: nome; «Vengono cancellati per tutti i membri
({nomi}):» menu e storico ({n} settimane); note, liste della spesa, impostazioni, «non
proporre più» e link d'invito. «Restano gli account, i voti personali, le altre famiglie
e il ricettario.» Pulsante rosso «Elimina {famiglia}»; per un membro, al suo posto
«Solo un amministratore della famiglia può eliminarla.». Il link è solo navigazione:
nulla si cancella all'apertura; i permessi si ricontrollano alla conferma (server). Dopo:
dati tolti dal dispositivo, `/profile` o `/menu` come per l'uscita. Famiglia non più
accessibile (`forbidden`): lo stato esistente di accesso revocato.

### Cancellazione dell'account (`/profile/account/delete`)

`web/src/features/account/AccountDeletePage.tsx`; collegamento «Cancella l'account» nella
zona di pericolo delle Preferenze. Dati da `account.getDeletionPlan`:

- ultimo amministratore dell'app: `StateNotice` «Non puoi ancora cancellare l'account» /
  «Sei l'unico amministratore dell'app: nomina prima un altro amministratore
  dall'amministrazione.»;
- `DeletionFamilies` «Le tue famiglie»: «La famiglia continua senza di te.»; «Sei l'unico
  amministratore: prima scegli chi lo diventa.» con la scelta; «Sei l'unico membro: la
  famiglia e tutti i suoi dati vengono eliminati.»;
- «Cosa viene cancellato»: «Nome, email, voti e accessi, compresi quelli degli agenti
  collegati.» più, con agenti, «Si scollegano anche i tuoi {n} agenti.» (decisione 11);
  con link: «I tuoi {n} inviti ancora attivi smettono di funzionare.»;
- «Restano le ricette pubblicate e le modifiche ai menu, mostrate come «ex membro».»;
- pulsante rosso «Cancella l'account», disattivato senza connessione, con l'ultimo
  amministratore dell'app o con un successore mancante;
- `conflict`: «Qualcosa è cambiato nelle tue famiglie: controlla di nuovo», con la
  rilettura del piano e le scelte dei successori ancora valide conservate;
- dopo la risposta (`completed` vero o falso): chiusura della sessione con
  cancellazione della copia sul dispositivo (`session.close()` e uscita da Supabase),
  poi `/login` con l'avviso «Account cancellato.».

### Cancellazione di un utente (`/admin/users/$userId/delete`)

`web/src/features/admin/UserDeletePage.tsx` (area di B, file nuovo), stessa struttura in
terza persona da `users.getDeletionPlan`: titolo «Cancella {nome}», email; «È l'unico
amministratore dell'app: nomina prima un altro amministratore.»; «Le sue famiglie» con
«La famiglia continua senza {nome}.», «{nome} è l'unico amministratore: prima scegli chi
lo diventa.», «{nome} è l'unico membro: la famiglia e tutti i suoi dati vengono
eliminati.»; «Si cancellano nome, email, voti e accessi, anche quelli degli agenti
collegati.»; link aperti «I suoi {n} inviti ancora attivi smettono di funzionare.»;
pulsante rosso «Cancella {nome} definitivamente». Dopo: `/admin` (sostituendo la voce
della cronologia) con l'avviso «{nome} è stato cancellato.» (testo senza genere da
fissare nel dizionario: «Utente cancellato: {nome}.»). Per il proprio account
(`own_account`): «Per cancellare il tuo account usa le tue preferenze.» con il
collegamento. Stesso controllo d'accesso di B (`AdminAccessGate`).

Nel **dettaglio** (`UserPage.tsx`) sotto la card «Famiglie»: per gli altri il pulsante
rosso «Cancella l'utente» verso la pagina; per sé la riga «Per cancellare il tuo account
usa le tue preferenze.» con «Account e preferenze». Con `deletion` non nullo: avviso
«Cancellazione in corso dal {data}» (con «{n} tentativi non riusciti» se `attempts > 0`)
e il pulsante «Completa la cancellazione» (`users.delete` con piano vuoto), al posto
degli interruttori dei ruoli. Nell'**elenco** (`UsersSection.tsx`) l'etichetta
«Cancellazione in corso».

### Benvenuto e stato senza famiglia

- `WelcomeCard`: «Invita la famiglia» verso `/profile/family` (solo per chi amministra,
  com'è già la scheda), accanto a «Sistema le impostazioni».
- `FamilyGate` con `status === 'none'`: sotto «Crea la tua famiglia», la riga «Hai un
  link d'invito? Aprilo per entrare nella famiglia di chi te l'ha mandato.».

### Dati sul dispositivo

Un accesso revocato a una famiglia ne toglie subito i dati (specifica, sezione 1). Oggi
il web lo fa al primo `forbidden` (`session.revoke`). Si aggiunge:

- dopo `family.leave`, `family.delete` e la propria rimozione scoperta: `session.revoke(
  familyId)` subito, prima di navigare;
- a ogni profilo letto (`profile.get` o profilo restituito da una mutazione): ogni
  famiglia presente nel profilo precedente e assente nel nuovo è revocata
  (`session.revoke`), così chi è stato rimosso o ha visto eliminare la famiglia da un
  altro perde i dati anche senza aver letto quella famiglia. Il punto è il gestore
  della sessione (`SessionScope.tsx` o `session.ts`), con una modifica minima;
- cancellazione dell'account: `session.close()` (copia persistita e segni cancellati).

**Ripristino dopo un rientro autorizzato** (decisione 23; prima revisione, rilievo 9;
seconda e terza revisione, rilievi 6 e 3). Il server resta la sola fonte dell'accesso;
il dispositivo conserva solo quanto serve a non mostrare dati vecchi. Stato **persistito**
per utente e famiglia, nello stesso record di oggi (`revokedKey`), che diventa
`{ revokedAt, restoredAt }` (istanti dell'orologio del dispositivo; un numero salvato
dalla versione precedente vale `{ revokedAt: n, restoredAt: 0 }`):

- **fusione col massimo, atomica**: ogni scrittura del record passa da `store.transact`
  (già atomica fra le schede) e prende il massimo di ciascun campo fra il valore salvato
  e quello nuovo. Il record **non si cancella al ripristino** (solo alla chiusura della
  sessione), quindi una scheda in ritardo che riscrive una revoca vecchia non perde il
  ripristino già salvato;
- **accesso**: la famiglia è revocata sul dispositivo se `revokedAt > restoredAt`,
  calcolato sempre dal record (in memoria se ne tiene una copia aggiornata dalle
  scritture e dai messaggi);
- **freschezza di una vista** (quarta revisione, rilievo 1): `dataUpdatedAt` di TanStack
  Query non basta, perché si rinnova anche con una risposta «invariato». La vista in
  cache (`Versioned<T>` di `web/src/api/queries.ts`) riceve il campo `producedAt`:
  l'istante di **inizio** della richiesta che ha prodotto i dati. `readThrough` lo fissa
  prima di chiamare il server; una risposta «invariato» restituisce la vista in cache
  **con il suo `producedAt`**, senza rinnovarlo; una vista scritta da una mutazione prende
  l'istante di inizio della mutazione. Una copia salvata da una versione precedente,
  senza il campo, vale `producedAt = 0`;
- **risposte iniziate prima di una revoca**: alla fine di `readThrough`, e prima che una
  mutazione scriva una vista, se la famiglia ha `revokedAt >= startedAt` la risposta si
  scarta (errore interno `stale_after_revocation`, che il gestore della sessione non
  mostra e che fa solo ripetere la lettura): non entra né nella cache né nella copia
  salvata, anche se arriva dopo il ripristino;
- **conferme della spesa** (revisione della PR, rilievo 2): la coda fissa `startedAt`
  con l'orologio della sessione prima di spedire ogni operazione e lo porta con la
  risposta (`ConfirmedResult`), anche nel messaggio `confirmed` fra le schede;
  `applyConfirmedList` scrive la vista con `producedAt = startedAt`. Una conferma con
  `revokedAt >= startedAt` per la famiglia non si scrive, anche se la famiglia è già
  stata ripristinata; un messaggio di una scheda della versione precedente, senza
  `startedAt`, vale come iniziato prima di qualsiasi revoca;
- **pulizia, separata dall'accesso**: ogni revoca, propria o ricevuta (messaggio
  `{ type: 'revoked', userId, familyId, revokedAt }` con l'istante originale), **toglie
  sempre** dalla scheda le viste della famiglia con `producedAt <= revokedAt` e le
  operazioni della sua coda della spesa nate fino a `revokedAt`, anche se un ripristino
  successivo è già arrivato. Il persister non scrive e non ripristina mai viste di una
  famiglia con `producedAt <= revokedAt` del record, né alcuna vista di una famiglia
  revocata. Se, dopo la pulizia, l'accesso risulta ripristinato (`restoredAt >=
  revokedAt`), le query della famiglia si invalidano e quelle in uso si rileggono dal
  server: la rilettura non dipende da una transizione locale da revocata ad
  accessibile, che nella consegna inversa non c'è;
- **ripristino**: `session.restore(familyId, startedAt)` scrive `restoredAt =
  max(restoredAt, startedAt)` e annuncia `{ type: 'restored', userId, familyId,
  startedAt }`; chi riceve fa la stessa fusione; se la famiglia smette di essere revocata,
  le sue query si invalidano e si rileggono;
- **avvio**: una sessione nuova legge i record prima di ripristinare la copia persistita
  e applica le stesse due regole (accesso e `producedAt <= revokedAt`);
- `restore` lo chiamano la risposta di `family.join` (e di `family.create`) con la
  famiglia nel profilo restituito, e ogni profilo letto che contiene la famiglia, con
  l'istante di inizio di quella richiesta;
- **ogni conferma si salva subito** (revisione della PR, rilievo 3, e seconda
  revisione): ogni conferma valida del server (profilo letto che contiene la famiglia,
  risposta di `family.join`/`family.create`) chiama `restore(familyId, startedAt)`, che
  scrive `restoredAt = max(restoredAt, startedAt)` nel record con `store.transact` e
  annuncia `restored`, **anche se la scheda non conosce nessuna revoca**: una revoca
  scritta da un'altra scheda, il cui messaggio è in ritardo o non arriva prima di un
  ricaricamento, è più vecchia e la fusione col massimo la supera. Nessuna conferma resta
  solo in memoria. Restano i controlli sulle risposte superate (un profilo partito prima
  dell'ultimo applicato, o non più recente di `revokedAt`/`restoredAt` del record, non
  scrive) e il limite dei ripristini da profilo letto, che vale solo per una famiglia
  revocata sulla scheda.

Alternativa scartata: far solo pulire e rileggere il profilo a ogni messaggio. Lascerebbe
il problema della copia persistita riscritta da una scheda in ritardo e non direbbe a una
sessione riavviata offline se la famiglia è accessibile; con due istanti fusi col
massimo bastano poche righe in `persister.ts` e `session.ts`.

### Accesso con un account in cancellazione

`LoginPage` (modifica minima): dopo un accesso con password riuscito, se la prima
lettura del profilo risponde `unauthorized` anche dopo il rinnovo e la sessione viene
chiusa, la pagina mostra «Questo account è stato cancellato.» invece del modulo vuoto
(decisione 13). Il motivo arriva dal gestore della sessione come esito di chiusura
(`ended: 'unauthorized'`), senza leggere nulla di nuovo dal server.

### Modalità finta e testi

- `web/src/api/fake/`: `fakeFamilyInvitations.ts`, operazioni nuove di `family` in
  `family.ts`, `fakeAccount.ts`, cancellazione in `fakeUsers.ts`, sui dati del seed
  (Marco ex membro con un link creato prima della rimozione; un link valido, uno
  scaduto, uno revocato), con gli stessi errori del server; aree in `SERVER_AREAS`.
- Testi nuovi in `web/src/i18n/messages/` (`family.ts`, `account.ts`, `admin.ts`), in
  italiano e inglese britannico, senza genere dove possibile («Sei uscito» del
  prototipo diventa «Non fai più parte di {famiglia}»).

## 4. Cancellazione dell'account: stati parziali e ripresa

| Momento dell'interruzione | Stato | Ripresa |
|---|---|---|
| Durante la prima transazione | rollback: nulla è cambiato | l'utente riprova dalla pagina |
| Dopo il commit, prima della chiamata ad Auth | dati dell'app cancellati, riga in attesa, account Auth presente ma inutilizzabile (`loadSession` rifiuta) | Cron Trigger entro un'ora (righe ferme da 5 minuti), o «Completa la cancellazione» dall'amministrazione |
| Chiamata ad Auth fallita o senza risposta | come sopra, `attempts` incrementato | come sopra; `absent` alla ripresa vale successo |
| Auth ha cancellato, chiusura non scritta | account sparito, riga in attesa | la ripresa riceve `404` → `absent` → chiusura |

Non esiste uno stato con l'account Auth cancellato e i dati dell'app ancora presenti,
perché i dati si cancellano prima; e uno stato con dati cancellati e account
utilizzabile non esiste perché `loadSession` dipende dal profilo. La prima transazione è
completa o assente: nessuna famiglia senza amministratore, nessun successore a metà.

Coerenza con A durante l'attesa: `create_app_invitation` e `claim_*` leggono
`auth.users`, quindi l'email resta occupata (`account_exists`) finché Auth non ha
cancellato; dopo, un nuovo invito per quell'email crea un account nuovo con id nuovo.

### Accettazione di un invito alla famiglia: stati intermedi (rilievo 5)

| Momento | Stato | Ripetizione dallo stesso link con la stessa email |
|---|---|---|
| Dopo `claim`, prima di Auth | prenotazione `reserved`, nessun account | `create` di nuovo (stesso id), nessuna quota in più |
| Auth ha rifiutato la password | come sopra | come sopra, con un'altra password |
| Auth ha creato, `complete` non arrivato | account senza famiglia, prenotazione `reserved` | `create` → Auth riconcilia (`existing`) → `complete` → `joined` |
| Link revocato (o autore retrocesso, rimosso, uscito o cancellato; anche se il link era già scaduto) prima di `complete` | come sopra | `claim` chiude (`closed`, confermato) e, con l'account, risponde `joined: false`; senza account `invitation_unavailable` |
| La persona entra con `family.join` prima di `complete` | membro, prenotazione `joined` (chiusa da `join`) | nessuna scrittura; dopo una rimozione resta fuori |
| Persona rimossa dopo la creazione del link, `complete` ancora da fare | account senza famiglia | `complete` → `closed`, `joined: false` |
| Due richieste in volo, account cancellato fra le due | id in `account_deletions` | la seconda non ricrea l'account (`beforeCreate`, trigger su `app.profiles`) |
| Famiglia eliminata durante la chiamata ad Auth o dopo | prenotazione con `family_id` e `invitation_id` nulli, ritrovata per impronta ed email | come la riga sopra |
| `complete` riuscito | `joined` | nessuna scrittura, `{ email, joined: membro adesso }` (un rimosso resta fuori) |
| Account cancellato | prenotazione `closed` senza email | nessuna prenotazione per quell'email: se il link vale e c'è quota, una nuova, con un id nuovo |

L'account rimasto senza famiglia (righe 4 e 5) compare nell'elenco degli utenti di B e,
dopo l'accesso, vede «Non fai ancora parte di una famiglia» (decisione 17). Nessuno stato
porta a cancellare un account.

## 5. Test

### pgTAP (`supabase/tests/family_management_test.sql`)

- Tabelle nuove con RLS e senza privilegi diretti; funzioni `security definer`, `EXECUTE`
  solo ai ruoli previsti (anche `coverage_test.sql` aggiornato).
- Inviti: creazione solo `family_admin`; idempotenza sull'id e sostituzione
  dell'impronta; revoca; elenco solo dei link usabili, con il nome dell'autore solo da
  membro e `registrations`; `by_token` senza riga per link scaduto o revocato e con
  `accounts_available` falso alla decima prenotazione; `claim` ripetuto per la stessa
  email (stesso id, nessuna riga in più), `account_exists`, undicesima email `P0A01`;
  prenotazione `reserved` a link scaduto → `create`; a link revocato → `closed` (con
  l'account) o `P0A01` (senza); `complete` → membro `member`, famiglia mostrata, riga di
  `family_joins` `new_account`; `complete` a link revocato o famiglia eliminata →
  `closed`, nessuna appartenenza; famiglia eliminata: prenotazione con `family_id` e
  `invitation_id` nulli, ritrovata da `claim` per impronta ed email.
- **Stato terminale** (rilievo 1): accettazione → rimozione → `claim` con la stessa email
  → `joined` con `member` falso, nessuna appartenenza nuova, famiglia mostrata invariata;
  accettazione → cancellazione dell'account → `claim` con la stessa email → prenotazione
  nuova con un id diverso (l'id vecchio non si riusa), oppure `P0A01` a tetto raggiunto.
- Registro: `join_family` scrive `existing_account`; ripetizione da membro senza riga;
  uscita e rientro con una riga nuova; `family_joins_view` solo `family_admin`, nome nullo
  per chi non è più membro.
- Cancellazione e dati personali (rilievo 8): con la famiglia che continua, dopo
  `begin_account_deletion` nessuna prenotazione ha l'email della persona e nessuna riga di
  `family_joins` è sua; il conteggio del link non cambia.
- Ruoli (rilievo 2): `set_user_role` che assegna un ruolo a un utente in attesa di
  cancellazione → `P0A07`; `complete_app_invitation` per un account nuovo continua a
  funzionare (profilo creato dal trigger).
- Seconda revisione:
  - **ingresso con `join` e prenotazione ancora `reserved`** (rilievo 1): Auth crea,
    `complete` non arriva, la persona entra con `join_family` → la prenotazione è
    `joined`; poi rimozione; poi `claim` → `joined` con `member` falso, nessuna scrittura;
    variante senza `join`: rimozione posteriore al link e `complete` → `closed`, nessuna
    appartenenza; `complete` con la persona già membro → nessuna seconda riga in
    `family_joins`, famiglia mostrata invariata;
  - **id cancellato** (rilievo 1): inserire in `auth.users` un id presente in
    `account_deletions` fallisce (trigger su `app.profiles`) e la riga non resta;
    `complete_family_invitation` per quell'id → `P0A01`; `account_id_deleted` vero;
  - **link scaduto e autore** (rilievo 3): prenotazione, scadenza (spostata indietro),
    poi retrocessione, rimozione, uscita o cancellazione dell'autore → link revocato,
    `claim` della prenotazione → `closed`/`unavailable`; revoca manuale di un link
    scaduto ma aperto; vista con il link scaduto finché ha prenotazioni `reserved`;
  - **email su due link** (rilievo 4): la stessa email prenotata su L1 (id U1) e su L2
    (id U2), account creato solo per U2, cancellazione di U2 → nessuna prenotazione con
    quell'email, conteggi di L1 e L2 invariati;
  - **stato persistito** (rilievo 9): `claim` di una prenotazione `reserved` a link
    revocato senza account restituisce `unavailable` e, letta in una transazione
    successiva, la prenotazione è `closed`;
  - `create_family` ridefinita: stessa firma, stesso comportamento dei test esistenti
    (`create_family_test.sql` verde senza modifiche).
- Rimozione posteriore al link: `status` senza riga e `join` `P0A01` per la persona
  rimossa, mentre il link vale per gli altri; link creato dopo la rimozione: entra.
  Uscita volontaria: il link vale ancora.
- Ruoli: retrocessione dell'ultimo amministratore `P0A09`; autoretrocessione con un
  altro amministratore; revoca dei link alla retrocessione, alla rimozione, all'uscita
  e alla cancellazione con il motivo giusto.
- Uscita: unico membro `P0A10`; ultimo amministratore senza successore `P0A13`, con
  successore promosso; membro semplice con successore indicato `P0A13`.
- Eliminazione: solo `family_admin`; nessuna riga della famiglia in `family_members`,
  `weeks`, `meal_slots`, `meal_changes`, `meal_actions`, `shopping_lists` (e righe
  figlie), `recipe_exclusions`, `family_ingredients`, `family_books`,
  `family_tried_recipes`, `weekly_jobs`, `temporary_lists`, `family_invitations`,
  `family_joins`, `family_removals`; le prenotazioni di quella famiglia **restano** con
  `family_id` e `invitation_id` nulli (decisione 17); restano voti, altre famiglie,
  account.
- Cancellazione: piano (`stays`, `needs_successor` con i candidati, `deleted`,
  `lastAppAdmin`, `openInvitations`); `begin` con insieme diverso `P0A11`, successore
  mancante `P0A13`, ultimo `app_admin` `P0A08`, amministratore retrocesso `42501`;
  effetti (successori, link e inviti all'app revocati, famiglie con un solo membro
  eliminate, voti, ruoli, appartenenze e profilo cancellati, riga in attesa); seconda
  chiamata senza effetti; `record_account_deletion_attempt` che non chiude finché
  l'utente è in `auth.users`.
- Inviti all'app e cancellazione (decisione 24): l'invito accettato dall'account, quello
  ancora aperto per la sua email e quello revocato restano senza email (l'aperto
  revocato); l'invito di un'altra persona non cambia; un invito `pending` senza email
  viola il vincolo; la vista dell'amministrazione li elenca senza email, prima e dopo la
  cancellazione in Auth.
- Nomi «ex membro»: dopo la rimozione, autore del registro dei pasti, delle esclusioni e
  della spesa senza nome; media dei voti senza il rimosso, voto ancora presente.

### Server

- `server/test/account-deletion.test.ts`, inviti all'app (decisione 24): invito all'app →
  accettazione → `users.delete`; nessuna riga di `app.app_invitations` con l'email,
  `appInvitations.list` con l'invito accettato senza email né nome.
- `server/test/family-invitations.test.ts`: permessi (membro semplice `forbidden` su
  `list`, `create`, `revoke`); `create` restituisce `url` con il token nel frammento;
  `get` pubblico senza dati oltre a nome e chi invita; `accept` con account nuovo (con
  `installFakeAuth`): account creato, membro, famiglia mostrata; ripetizione senza
  doppioni; `weak_password` e riprova; `account_exists`; tetto di 10; link scaduto,
  revocato, dopo una rimozione (`invitation_unavailable` uguale per tutti); `status` e
  `join` per chi ha un account, già membro senza cambiamenti; limitatori
  (`rate_limited`); MCP: `familyInvitations_*` e `family_join` presenti, `get` e `accept`
  assenti.
- `server/test/family-members.test.ts`: `setMemberRole`, `removeMember`, `leave` con
  tutti gli esiti; effetto immediato con lo stesso token (il rimosso riceve `forbidden`
  sulla lettura successiva, web e MCP); voti fuori dalla media dopo la rimozione,
  presenti dopo una ripetizione dell'ingresso; `family_delete` via MCP risponde
  `web_only` con l'URL e la famiglia resta; `family.delete` dal web elimina.
- `server/test/family-locks.test.ts` (modello di `users-locks.test.ts`, con
  `holdTransaction`, `pg_backend_pid()` e attesa accertata su `pg_stat_activity` con
  `wait_event_type = 'Lock'`, qui `wait_event = 'tuple'` o `'transactionid'`):
  1. **due amministratori che escono insieme** (A e B soli amministratori, più un
     membro C): entrambi escono senza successore, perché prima dei lucchetti ognuno vede
     l'altro come amministratore. Rilasciata A, B (ora unico amministratore con C
     membro) riceve `P0A13` (`invalid` su `successorId`, rilievo 11) e la famiglia ha
     esattamente un amministratore;
  2. **retrocessione incrociata**: A retrocede B mentre B retrocede A. Rilasciata A, B
     riceve `forbidden` (non è più amministratore) e resta A;
  3. **uscita contro cancellazione dell'account**: A cancella il proprio account (unico
     amministratore, successore B) mentre B esce. Le due operazioni si mettono in fila
     sulla riga della famiglia; in nessun ordine la famiglia resta con membri e senza
     amministratore;
  4. **ingresso contro cancellazione** di una famiglia con un solo membro: C entra con un
     link mentre A cancella l'account indicando la famiglia fra quelle da eliminare. Se
     passa prima l'ingresso, la cancellazione riceve `conflict`; se passa prima la
     cancellazione, l'ingresso riceve `invitation_unavailable`;
  5. **revoca contro retrocessione e rimozione** (rilievo 6): A revoca a mano il link
     creato da B mentre un altro amministratore retrocede B (e, in una seconda prova,
     lo rimuove), in entrambi gli ordini di partenza: nessun `40P01`, link revocato una
     volta sola (motivo di chi arriva primo), B retrocesso o rimosso;
  6. **eliminazione contro modifica ordinaria** (decisione 19): `family.delete` contro
     una modifica di un pasto della stessa famiglia tenuta a metà. Sono validi **entrambi
     gli esiti** dello stallo (Postgres sceglie la vittima): la modifica fallisce,
     oppure la modifica conferma e la cancellazione ripetuta elimina la famiglia. In ogni
     caso alla fine la famiglia non esiste e `family.delete` non risponde mai `40P01`
     (seconda revisione, rilievo 7);
  6b. **creazione di una famiglia contro cancellazione dell'account** (seconda
     revisione, rilievo 2): `begin_account_deletion` tenuta dopo il ricalcolo del piano,
     poi lo stesso utente chiama `app.create_family` (e, in una seconda prova, un altro
     membro entra con un link in quella famiglia appena creata): la creazione attende il
     lucchetto dell'utente e, rilasciata la cancellazione, fallisce perché il profilo non
     c'è più (`42501`); nessuna famiglia senza membri o senza amministratore resta;
  7. isolamento `read committed` verificato come in B.
  La prova senza lucchetto (funzione sostituita a mano, solo in locale) deve far vedere
  l'invariante violata (zero amministratori), come in B.
- `server/test/family-invitations-locks.test.ts` (rilievo 10): nove prenotazioni sul
  link, poi due `claim` con email diverse, il primo tenuto con `holdTransaction` dopo il
  suo lucchetto, il secondo in attesa accertata: una sola prenotazione nuova, l'altro
  `P0A01`, totale finale 10; stesso schema con la **stessa email**: un solo id
  prenotato, restituito a entrambi **senza errori**: la prima richiesta è tenuta dopo il
  suo inserimento e prima del commit, la seconda parte quando la prima ha già fatto la
  sua lettura iniziale e aspetta il lucchetto dell'email (attesa accertata); rilasciata
  la prima, la seconda rilegge la prenotazione e restituisce lo stesso id (terza
  revisione, rilievo 2), anche con nove prenotazioni di partenza, cioè alla decima
  quota. **Prenotazione in corso contro cancellazione** (terza revisione, rilievo 1; ordine
  eseguibile della quarta revisione, rilievo 2), con due famiglie diverse: 1) `claim` di
  E su L2 confermato (prenotazione U2), senza creare ancora l'account; 2) `claim` di E su
  L1 tenuto dopo il suo inserimento e prima del commit (tiene il lucchetto dell'email);
  3) U2 creato in Auth dalla prenotazione già confermata su L2 (la creazione non prende il
  lucchetto dell'email); 4) `begin_account_deletion(U2)` avviata, con l'attesa sul
  lucchetto dell'email accertata in `pg_stat_activity`; 5) rilasciato L1, la
  cancellazione prosegue: alla fine nessuna prenotazione ha E in chiaro (né quella di L1
  né quella di L2) e i conteggi di L1 e L2 sono invariati (una prenotazione ciascuno). **Prova negativa**
  (seconda revisione, rilievo 5), solo in locale e senza commit: una variante della
  funzione senza **nessuna** serializzazione del conteggio (né famiglia, né invito, né
  utente), con i vincoli dello schema intatti, e una barriera di prova dopo il conteggio
  (lucchetto consultivo tenuto dal test finché entrambe le richieste lo aspettano,
  accertato in `pg_stat_activity`), così entrambe leggono nove prenotazioni prima di
  inserire. Il test termina e fallisce sulle asserzioni finali: 11 prenotazioni.
- `server/test/account-deletion.test.ts` (con `installFakeAuth`, esteso con `DELETE` e
  con i fallimenti a comando): piano; cancellazione completa (riga chiusa, account
  sparito, token già emesso rifiutato su RPC, REST e MCP); `conflict` dopo un ingresso
  nel frattempo; MCP con famiglia da eliminare → `web_only` e nessuna scrittura; MCP
  senza famiglie da eliminare → cancella; Auth che fallisce → `{ completed: false }`,
  riga in attesa, account inutilizzabile; ripresa con `resumeAccountDeletions` (riga
  troppo recente ignorata; `404` → chiusa; tre fallimenti → `account_deletion_overdue`
  nel log); amministrazione: `own_account`, `last_app_admin`, «Completa la
  cancellazione» su una riga in attesa, ripetizione dopo il completamento; `users.list`
  e `users.get` con `deletion`; un invito all'app per l'email in attesa risponde
  `account_exists`. **Canale sotto i lucchetti** (rilievo 3): per `account.delete` e per
  `users.delete` via MCP, piano letto con F condivisa con un altro membro (nessun
  rimando), poi quel membro esce mentre la richiesta aspetta il lucchetto (tenuto con
  `holdTransaction`): la risposta è `web_only`, F e l'account restano. **Ruoli durante
  l'attesa** (rilievo 2): A cancellato con Auth indisponibile (fallimento a comando), B
  prova ad assegnare `app_admin` ad A (API e MCP) → `not_found`; B rinuncia al proprio
  ruolo → `last_app_admin`; la ripresa cancella A e B resta amministratore.
- `server/test/account-deletion-locks.test.ts`: due amministratori dell'app che
  cancellano ciascuno il proprio account, o l'uno l'altro, nello stesso momento: il
  secondo riceve `last_app_admin` o `forbidden` e resta un amministratore (come B,
  attesa sul lucchetto `advisory`); cancellazione contro `set_user_role` che toglie
  `app_admin` all'altro; **assegnazione in corso** contro cancellazione dello stesso
  utente (rilievo 2): `set_user_role` che assegna `app_admin` tenuto a metà, poi
  `begin_account_deletion`: alla fine l'utente non ha ruoli, in entrambi gli ordini.
- `server/src/accounts/index.test.ts`: `deleteAccount` (`200`, `204`, `404`, `500`,
  rete, chiave assente, intestazione `apikey` e nessun `Authorization`);
  `createInvitedAccount` con `beforeCreate` che risponde vero → nessun `POST`.
- Accettazione con richieste in volo (seconda revisione, rilievo 1), con Auth e
  completamento sospendibili separatamente (`holdNextCreate`, `holdAfterNextCreate` di
  `fake-auth.ts` e una `holdTransaction` su `complete`): (a) creazione riuscita e
  `complete` sospeso, la persona entra con `family.join`, poi viene rimossa, poi
  `complete` riparte → nessun rientro, una sola riga in `family_joins`; (b) due `accept`
  con la stessa email ottengono `create`; la prima completa, l'account viene cancellato,
  poi la seconda arriva al `POST` → nessun account ricreato (con `beforeCreate` e, in una
  variante in cui la cancellazione è confermata dopo `beforeCreate`, con il trigger su
  `app.profiles`).
- Ripetizione su `40P01` (seconda revisione, rilievo 7), in `pipeline.test.ts` con
  un'operazione di prova in `RETRY_ON_DEADLOCK`: il primo tentativo è annullato per
  intero (le sue scritture non ci sono); il secondo rilegge sessione, ruolo e dati (una
  sessione chiusa fra i due tentativi dà `unauthorized`); il seguito di `afterCommit`
  gira una volta sola, con il risultato del tentativo confermato; un `40P01` lanciato
  dal seguito non ripete la transazione; due `40P01` di fila → `internal`;
  un'operazione fuori elenco con `40P01` non si ripete.
- Letture non versionate (seconda revisione, rilievo 8): `familyInvitations.list` dopo
  una prenotazione con `weak_password` mostra `registrations` aggiornato; dopo la
  scadenza di un link (spostata indietro) il link non c'è più, senza altre scritture
  sulla famiglia.
- `server/test/scheduled.test.ts` (o il test esistente del job): il ramo orario chiama
  anche la ripresa, e un errore di una parte non ferma l'altra; famiglia eliminata
  durante il job settimanale (`weekly_job_family_gone`).

### Stack (`server/test/stack/family.stack.test.ts`)

Con Auth, database e pipeline veri (`STACK_*`, come A e B): amministratore crea un link;
una persona nuova lo accetta (account vero), entra con la password e legge il menu;
retrocessione e rimozione con effetto immediato; un'altra persona con un account entra
con `join`; cancellazione dell'account della persona: in Auth non ci sono più sessioni,
identità, consensi OAuth (letti con la connessione di prova), il token già emesso è
rifiutato, il rinnovo con il refresh token fallisce; cancellazione con un agente MCP
autorizzato (consenso creato con il flusso OAuth dello stack, come nelle prove di
collegamento) rifiutato dopo. Eseguito da `scripts/invitations/invite-stack.sh`
(cartella `test/stack/`, già così).

### Web

- Componenti con l'API simulata: pagina dell'invito in tutti gli stati (senza accesso,
  con accesso, già membro, non valido, tetto raggiunto, troppi tentativi, altro account
  aperto), creazione dell'account e ingresso; pagina dei membri (azioni solo per gli
  amministratori, conferme con e senza link attivi, `last_admin`, foglio del link con la
  nota, revoca, uscita nei tre casi); eliminazione della famiglia (amministratore e
  membro); cancellazione dell'account (tre esiti, successore obbligatorio, ultimo
  `app_admin`, agenti, `conflict` con le scelte conservate, chiusura della sessione);
  pagina in terza persona, `own_account`, area di pericolo e «Cancellazione in corso» nel
  dettaglio e nell'elenco; scheda di benvenuto con «Invita la famiglia»; riga degli
  inviti nello stato senza famiglia.
- Dati sul dispositivo: famiglia sparita dal profilo → revocata (query rimosse, segno
  scritto, coda della spesa svuotata); uscita ed eliminazione → revoca prima della
  navigazione; cancellazione dell'account → copia persistita cancellata.
- Ripristino (rilievo 9): uscita → rientro con un link nella stessa sessione → la
  famiglia torna (`useFamily` non dice più `revoked`, segno cancellato), senza dati
  vecchi; rimozione → link nuovo → `join` → rientro; con due schede, la seconda riceve
  `restored` e mostra la famiglia; una lettura del profilo partita prima di una revoca
  più recente e arrivata dopo non annulla la revoca. Seconda revisione, rilievo 6:
  consegna ritardata alla seconda scheda di `revoked` e poi `restored`, e anche in ordine
  inverso → la famiglia è visibile; revoca reale dopo il rientro (`revoked` con istante
  successivo) → la famiglia resta revocata in entrambe le schede. Terza revisione,
  rilievo 3: la scheda B ha già viste della famiglia e operazioni della spesa in coda;
  consegna inversa → nessuna vista con `producedAt <= t1` né operazione anteriore a t1
  resta in B, e la famiglia si rilegge; **quarta revisione, rilievo 1**: B ha una vista
  prodotta prima di t1 e avvia una rilettura prima di t1; A revoca a t1; la risposta
  «invariato» arriva a B dopo t1 (la vista resta con il `producedAt` vecchio e la
  risposta iniziata prima di t1 si scarta); A rientra a t2; B riceve `restored(t2)` e poi
  `revoked(t1)` → la vista vecchia sparisce dalla cache e dalla copia salvata, la
  famiglia si rilegge dal server, e una sessione avviata dopo non ripristina la vista
  vecchia; una vista scritta da una mutazione iniziata prima della revoca non entra; una scheda in ritardo riscrive `revokedAt = t1`
  dopo il ripristino → il record resta `{ t1, t2 }`, famiglia visibile; una terza sessione
  avviata dopo, con una copia persistita che contiene viste della famiglia anteriori a
  t1, non le ripristina e mostra la famiglia; record numerico della versione precedente
  letto come `revokedAt`. Revisione della PR, rilievi 2 e 3 (`familyAccess.test.ts`, con
  la vera `applyConfirmedList` e la coda): revoca a 100, ripristino a 200, lettura a 250,
  modifica della spesa confermata a 260 → la vista ha `producedAt = 260` e la copia
  salvata la tiene; conferma di un'altra scheda partita a 50 e consegnata dopo il
  ripristino → la lista fresca resta; la scheda B legge il profilo a 200 prima di
  ricevere `revoked(100)` di A → resta accessibile in entrambe le schede e il record è
  `{ 100, 200 }`, mentre una revoca a 400 vince; una sessione che legge il profilo prima
  dei record del dispositivo tiene la famiglia confermata. Seconda revisione: A revoca a
  100 e il messaggio non arriva; B conferma a 200 e legge la settimana a 250 → record
  `{ 100, 200 }` salvato e `restored` annunciato subito, copia salvata con la vista a
  250; una sessione nuova sullo stesso archivio, prima della consegna, mostra la
  famiglia con la vista fresca.
- Pagina dell'invito con `joined: false`: testo dell'account pronto e accesso con
  l'email; uscita con `invalid` su `successorId`: il foglio passa alla scelta del
  successore; card «Ingressi con i link» con «ex membro» e «Account nuovo».
- `LoginPage`: «Questo account è stato cancellato.» dopo un accesso con profilo assente.
- Registro delle mutazioni: invalidazioni delle operazioni nuove.
- **Prova con agent-browser** su `wrangler dev` con lo stack locale (variabili dello
  stack passate esplicitamente, URL di Auth controllato nelle richieste prima di
  accedere: mai la produzione) e in modalità finta, a 1280 e 390 px, in italiano e in
  inglese, con un nome lungo: invito → account → famiglia; ingresso con un account
  esistente; uscita con successore; rimozione e retrocessione con le conferme;
  eliminazione della famiglia; cancellazione dell'account; cancellazione di un utente
  dall'amministrazione; nessuno scorrimento orizzontale.

### Provato con agent-browser (16 ottobre 2026)

- **Stack locale** (`wrangler dev` sulla 8797 con Auth, Worker e database dello stack
  `w11-famiglia`; SPA costruita con le variabili dello stack, nessun riferimento
  all'Auth di produzione nel pacchetto, richieste di accesso verso `127.0.0.1:58621`),
  a 1280 e 390 px, in italiano e in inglese, con il nome lungo «Maria Alessandra
  Benedetta Castiglioni di Valdobbiadene»; nessuno scorrimento orizzontale
  (`scrollWidth` 390):
  - Anna crea un link; da un browser senza accesso la pagina dell'invito (famiglia e
    chi invita), creazione dell'account in italiano ed ingresso nel Menu;
  - Carla, già amministratrice di un'altra famiglia, «Accedi per entrare» → ritorno
    alla pagina dell'invito dopo l'accesso → «Entra nella famiglia»: due famiglie nel
    Profilo;
  - Anna: «Ingressi con i link» con le due persone; rimozione di Bruno con la conferma
    sui voti e «ex membro»; promozione di Carla, retrocessione con «Il link d'invito
    creato da Carla smetterà di valere» e link revocato;
  - uscita di Anna, unica amministratrice, con la scelta del successore (Maria) →
    Menu con «Non fai ancora parte di una famiglia» e la riga del link d'invito;
  - Carla elimina la propria famiglia dalla pagina di eliminazione → Profilo con la
    famiglia rimasta;
  - Maria cancella l'account nominando Carla → accesso con l'avviso, `localStorage`
    vuoto; nel database Maria è sparita da Auth e Carla amministra la famiglia;
  - Anna `app_admin` cancella Bruno da `/admin/users/<id>/delete` → `/admin` con
    «Utente cancellato: Bruno.»;
  - Anna rientra con un link nuovo di Carla nella stessa sessione (la famiglia torna);
    rimossa di nuovo, lo stesso link risponde «Questo invito non vale più».
- **Modalità finta** (`vite`), a 1280 e 390 px: scheda di benvenuto con «Invite your
  family» e «Adjust the settings»; famiglia creata con la procedura: Menu senza
  settimane, Membri, uscita da unico membro con «Delete the family» e eliminazione
  (prima della correzione le sue letture rispondevano `forbidden`).
- **Correzioni nate dalla prova:** pulsanti «Entra nella famiglia» ed «Esci e continua»
  distanziati; titolo del foglio del link al singolare in inglese («Invitation link»);
  ritorno dalla cancellazione di un utente con il nome della persona, come nel
  prototipo.
- **Revisione del branch:** il token del ritorno dall'accesso stava nella query di
  `/login`; ora resta nel frammento (vedi «Pagina dell'invito»). Un `forbidden` su
  un'operazione riservata agli amministratori della famiglia (dopo una retrocessione) non
  revoca più la famiglia né la coda della spesa: rilegge profilo e famiglia.

### Da provare a mano sull'iPhone

- Pagina dell'invito aperta da WhatsApp in Safari e, dopo l'accesso, nella PWA installata
  (il link non apre la PWA: la persona entra in Safari, poi aggiunge l'app alla
  schermata Home; il testo di A lo dice già).
- Foglio di condivisione del link (Web Share) e copia.
- Fogli di conferma con il pulsante rosso; scelta del successore con i pulsanti di
  opzione.
- Cancellazione dell'account nella PWA installata: ritorno alla pagina di accesso con
  l'avviso e nessun dato rimasto.

## 6. Rilascio e collaudo

Lo fa il coordinatore dopo il merge: migrazione `20261016100000_family_management.sql`
in produzione, poi il Worker. Nessun segreto, binding, Cron Trigger o risorsa esterna
nuovi (`SUPABASE_SECRET_KEY` c'è già).

**Collaudo con l'account e la famiglia di prova di A** (li ha tenuti l'utente):

1. con l'account di prova, `/profile/family` della famiglia di prova: crea un link e lo
   apre in un'altra finestra privata (pagina dell'invito, senza accedere), poi lo revoca;
2. se nella famiglia di prova c'è anche Federico: rimozione o uscita con i dialoghi;
3. **eliminazione della famiglia di prova**: dall'account di prova, impostazioni della
   famiglia › «Elimina la famiglia» › «Elimina {famiglia}»;
4. **cancellazione dell'account di prova**: due strade, una da provare per sé e una per
   l'amministrazione: dall'account di prova, Preferenze › «Cancella l'account»; oppure,
   da Federico, Amministrazione dell'app › utente › «Cancella l'utente» › «Cancella
   {nome} definitivamente». Se si salta il passo 3 e l'account è l'unico membro, la
   cancellazione elimina anche la famiglia (e via MCP rimanda alla pagina);
5. controllo: l'utente non compare più nell'elenco (o compare con «Cancellazione in
   corso», da completare); `account_deletions` ha la riga completata.

## 7. Interfaccia

- **Ordine dei lucchetti** (regola per ogni percorso presente e futuro, sezione 1):
  `pg_advisory_xact_lock(hashtextextended('app_admin_roles', 0))` per chi può togliere
  `app_admin` → lucchetto dell'utente `user_memberships:<id>` (sotto) → lucchetto
  dell'email `registration_email:<email>` (sotto) → `select … for update` sulle righe di
  `app.families` in ordine di id,
  prima di ogni scrittura su righe della famiglia (anche quelle che fanno scattare il
  trigger di versione) → link (`family_invitations`) → prenotazioni → il resto. I
  percorsi della famiglia non prendono mai `app_admin_roles`. Chi parte da un'impronta o
  da una prenotazione legge senza lucchetto, prende i lucchetti nell'ordine e
  ricontrolla. Sotto i lucchetti si ricontrollano chi chiama e le condizioni (`read
  committed`). Cicli residui con le modifiche ordinarie di una famiglia in
  eliminazione: ripetizione su `40P01` (decisione 19). Dimostrato da
  `family-locks.test.ts`, `family-invitations-locks.test.ts` e
  `account-deletion-locks.test.ts`.
- **Ruoli e cancellazione**: ogni inserimento in `app.user_roles` richiede il profilo del
  destinatario (trigger `user_roles_require_profile`); chi cancella un account cancella
  il profilo prima dei ruoli. Un id in `account_deletions` non riottiene mai un profilo
  (trigger `profiles_reject_deleted_ids`), quindi Auth non può ricrearlo.
- **Lucchetto dell'utente** `user_memberships:<user_id>`
  (`pg_advisory_xact_lock(hashtextextended('user_memberships:' || user_id, 0))`): ogni
  percorso presente e futuro che crea un'appartenenza o una prenotazione per un utente lo
  prende prima delle righe delle famiglie e poi ricontrolla profilo e
  `account_deletions`; la cancellazione dell'account lo prende dopo `app_admin_roles`.
  `app.create_family` di A è ridefinita per prenderlo.
- **Lucchetto dell'email** `registration_email:<email normalizzata>`
  (`pg_advisory_xact_lock(hashtextextended('registration_email:' || email, 0))`): ogni
  percorso che crea o modifica prenotazioni per un'email lo prende come primo lucchetto
  (oggi `claim_family_invitation`); la cancellazione dell'account lo prende per l'email
  dell'account subito dopo il lucchetto dell'utente, così l'insieme delle prenotazioni da
  anonimizzare è stabile. **Ordine completo:** `app_admin_roles` → utente → email →
  famiglie per id → link → prenotazioni → resto.
- **`afterCommit`** (`server/src/pipeline.ts`): un gestore restituisce un seguito che il
  pipeline esegue dopo il commit, senza connessioni aperte, e il cui risultato è
  l'output; un errore del seguito non annulla né ripete la transazione.
- **`RETRY_ON_DEADLOCK`** (`server/src/pipeline.ts`): elenco, nel server, delle
  operazioni la cui transazione si ripete una volta su `40P01` (oggi `family.delete`,
  `account.delete`, `users.delete`), con i confini della sezione 2: tentativo annullato
  per intero, secondo tentativo che rilegge tutto, seguito solo del tentativo confermato,
  nessuna ripetizione per errori del seguito. Da riportare nel piano generale, «Interfacce
  decise», insieme al lucchetto dell'utente e ad `afterCommit`.
- **Ultimo amministratore della famiglia**: protetto in ogni funzione che toglie un
  `family_admin` o un membro (`set_family_member_role`, `leave_family`,
  `begin_account_deletion`); le scritture dirette su `family_members` restano possibili
  solo dalle politiche esistenti, che il server non usa per questi percorsi (nessuna
  migrazione le restringe: modifiche solo additive). Un'attività futura che tocchi i
  membri usa queste funzioni.
- **`deleteAccount`** in `server/src/accounts/`, accanto a `createInvitedAccount`.
- **D (email)**: `familyInvitations.create` potrà spedire il link; l'accettazione resta
  questa, come per A.

## 8. File

**Miei:** `contract/src/family-invitations/`, `contract/src/account/`,
`contract/src/family/members.ts`, `server/src/family-invitations/`,
`server/src/account/` (compreso `resume.ts`), `server/src/family/members.ts`,
`web/src/features/family-invitations/`, `web/src/features/account/`,
`web/src/features/family-delete/`, `web/src/features/admin/UserDeletePage.tsx`,
`web/src/api/fake/fakeFamilyInvitations.ts`, `web/src/api/fake/fakeAccount.ts`, i
dizionari nuovi, la migrazione e il test pgTAP nuovi, i test del server elencati.

**Condivisi, con modifiche minime:** `contract/src/contract.ts`, `contract/src/index.ts`,
`contract/src/family/index.ts` (registrazione di `members.ts`), `contract/src/errors.ts`
(`own_account`), `contract/src/users/index.ts` (`deletion`, operazioni nuove),
`server/src/router.ts`, `server/src/family/router.ts`, `server/src/users/router.ts` e
`db-errors.ts`, `server/src/pipeline.ts` (`afterCommit`), `server/src/accounts/index.ts`
(`deleteAccount`, `send` del modulo), `server/src/scheduled.ts`, `server/src/menu/job.ts`
(`23503`), `server/src/messages.ts`, `server/test/support/fake-auth.ts` (`DELETE`),
`web/src/router.tsx`, `web/public/_headers` (`/invite`),
`web/src/routes/profile/MembersPage.tsx`, `web/src/routes/profile/PreferencesPage.tsx`,
la pagina delle impostazioni della famiglia (collegamento), `web/src/features/admin/UserPage.tsx`
e `UsersSection.tsx`, `web/src/features/family-new/WelcomeCard.tsx`,
`web/src/components/FamilyGate.tsx`, `web/src/auth/LoginPage.tsx`,
`web/src/session/SessionScope.tsx` e/o `session.ts` (revoca delle famiglie sparite,
esito di chiusura), `web/src/api/mutations.ts`, `web/src/api/types.ts` (`SERVER_AREAS`),
`web/src/api/fake/fakeApi.ts`, `family.ts`, `fakeUsers.ts`, `seed.ts`,
`web/src/i18n/messages/*`, `supabase/tests/coverage_test.sql`.

**Tabelle nuove:** `app.family_invitations`, `app.family_invitation_reservations`, `app.family_joins`,
`app.family_removals`, `app.account_deletions`. **Colonne cambiate:** nessuna. **Trigger
nuovi:** `user_roles_require_profile` su `app.user_roles` e `profiles_reject_deleted_ids` su
`app.profiles` (tabelle esistenti, solo trigger in più). **Funzione esistente
ridefinita:** `app.create_family` (stessa firma, lucchetto dell'utente e ricontrollo del
profilo). **Funzioni nuove:** `app.family_joins_view`, `app.user_roles_require_profile`,
`app.profiles_reject_deleted_ids`, `app.account_id_deleted`,
`app.revoke_invitations_of` (interna),
`app.create_family_invitation`, `app.revoke_family_invitation`,
`app.family_invitations_view`, `app.family_invitation_by_token`,
`app.claim_family_invitation`, `app.complete_family_invitation`,
`app.family_invitation_status`, `app.join_family`, `app.set_family_member_role`,
`app.remove_family_member`, `app.leave_family`, `app.family_deletion_view`,
`app.delete_family`, `app.account_deletion_plan`, `app.begin_account_deletion`,
`app.pending_account_deletions`, `app.record_account_deletion_attempt`,
`app.admin_account_deletions`.

## Decisioni da riportare nella specifica

**Prodotto:**

- Account nato da un invito alla famiglia: il link crea al più 10 account nuovi, poi
  risponde come un link non valido per la creazione; creazione e ingresso in un solo
  passaggio; email non verificata fino a D, rimedio con la cancellazione
  dall'amministrazione (decisione dell'utente del 16/10; sezione 7, «Prima della
  verifica del dominio di invio» e «Inviti alla famiglia»; Parte 1, «Chi la usa»).
- Link alla famiglia visibile solo alla creazione; elenco con autore, scadenza e persone
  registrate, più i link scaduti con registrazioni in sospeso, revocabili; scostamento
  dal prototipo (sezione 7; sezione 14).
- Link creati da una persona revocati quando esce, viene rimossa, perde il ruolo di
  amministratore o cancella l'account, e i dialoghi di conferma lo dicono (scelta di
  prodotto del coordinatore del 16/10; sezione 7, «Inviti alla famiglia»,
  «Rimozione», «Uscita»).
- Cambio di ruolo diretto, con conferma solo per la retrocessione di chi ha link attivi
  (sezione 7; sezione 14).
- Pagina dell'invito alla famiglia `/invite#<token>` (token nel frammento) con i suoi
  stati; ingresso con un account esistente anche via MCP (`family_join`) (sezioni 7 e
  13).
- Tetto di 10 contato sulle prenotazioni (email distinte che iniziano a registrarsi),
  «persone registrate con questo link» (decisione del coordinatore del 16/10; sezione 7).
- Ingresso diventato impossibile durante l'accettazione: l'account resta senza famiglia,
  la pagina porta all'accesso con l'email (decisione del coordinatore del 16/10;
  sezione 7, «Inviti alla famiglia»).
- Registro degli ingressi da link (persona, link, momento, account nuovo o esistente)
  visibile all'amministratore della famiglia (decisione del coordinatore del 16/10;
  sezione 7; sezione 2).
- Bozze e contributi di un curatore cancellato: restano, senza autore; bozze aperte agli
  altri curatori (sezione 7, «Cancellazione dell'account»; sezione 8).
- Numero di agenti collegati solo sulla pagina di cancellazione del proprio account
  (sezione 7; `design/percorsi.md`, sesto giro).
- Account in attesa di cancellazione visibile all'amministratore con «Cancellazione in
  corso» e «Completa la cancellazione»; accesso a un account in attesa con l'avviso
  «Questo account è stato cancellato.» (sezione 7).
- «Invita la famiglia» nella scheda di benvenuto verso la pagina dei membri; riga degli
  inviti nello stato senza famiglia (sezione 7, «Wizard» e «Primo accesso»).
- Dopo l'uscita o l'eliminazione senza altre famiglie si va al Menu con «Non fai ancora
  parte di una famiglia» (il prototipo andava a `/welcome`, che l'app non ha).

- Inviti all'app di un account cancellato: restano senza email, con «account cancellato»
  nell'amministrazione; gli aperti per la sua email si revocano (revisione della PR,
  rilievo 1; sezione 7, «Cancellazione dell'account»; inviti all'app).

**Tecniche:**

- `app.app_invitations.email` nullo per gli inviti di un account cancellato, vincolo
  `app_invitations_pending_email`; righe bloccate dalla cancellazione dopo le
  prenotazioni, senza i lucchetti consultivi di A (sezione 2; sezione 7).
- Tabelle `family_invitations` (con `token_hash`, `revoke_reason`, senza `token` in
  chiaro: cambia la riga della sezione 2), `family_invitation_reservations` (con stato
  terminale, rintracciabili senza la famiglia), `family_joins`,
  `family_removals`, `account_deletions`; funzioni elencate nella sezione 8 (sezione 2).
- Ultimo amministratore della famiglia con `for update` sulla riga della famiglia;
  ordine dei lucchetti (`app_admin_roles`, poi famiglie per id) (sezione 7; sezione 2).
- Cancellazione dell'account in tre passi (prima transazione, `DELETE` di Auth dopo il
  commit, chiusura) con ripresa dal Cron Trigger orario dopo 5 minuti, segnalazione dopo
  3 tentativi, nessun abbandono (sezione 7; sezione 4).
- `afterCommit` nel pipeline (sezione 1).
- Revoca degli accessi: cascata della cancellazione definitiva di Auth su sessioni,
  identità, consensi e autorizzazioni OAuth; token rifiutati da `loadSession` (sezioni 1
  e 13).
- Codici SQLSTATE `P0A09`–`P0A15`; `not_allowed` `own_account` (sezione 1).
- Rimando MCP condizionato per `account.delete` e `users.delete`; `family.delete`
  `webOnly` (sezione 13).
- Revoca locale delle famiglie sparite dal profilo, oltre al `forbidden` (sezione 1,
  dati sul dispositivo).
- Job settimanale tollerante a una famiglia eliminata durante l'esecuzione (sezione 4).
- Prenotazioni con stato terminale (`reserved` → `joined`/`closed`), conservate senza
  la famiglia eliminata, anonimizzate (anche per email) alla cancellazione dell'account;
  `join` che chiude la prenotazione della stessa persona; `complete` che ricontrolla
  rimozioni e appartenenza (sezione 2; sezione 7).
- Lucchetto dell'utente `user_memberships:<id>` nell'ordine `app_admin_roles` → utente →
  famiglie → link → prenotazioni, anche in `app.create_family` (sezione 7; sezione 1).
- Trigger `profiles_reject_deleted_ids`: un id cancellato non si ricrea (sezione 7).
- Revoca dei link aperti (anche scaduti con prenotazioni) alla perdita del ruolo
  dell'autore (sezione 7).
- Elenco dei link e registro degli ingressi non versionati (sezione 1).
- Trigger `user_roles_require_profile`: nessun ruolo nuovo per un account in
  cancellazione (sezione 7, «Ultimo amministratore dell'app»; sezione 2).
- Divieto MCP della cancellazione che elimina famiglie verificato nel database sotto i
  lucchetti, dal `client_id` del token (sezione 13).
- Ripetizione una volta su `40P01` per le tre operazioni di cancellazione (sezione 1).
- Revoca locale di una famiglia annullabile solo da una conferma del server successiva,
  anche se la conferma arriva nella scheda prima della revoca; conferme della spesa con
  l'istante d'inizio della richiesta (sezione 1, dati sul dispositivo).
