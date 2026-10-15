# W10: Amministrazione di utenti e ruoli (ondata 3, attività B, issue #38)

Creato: 15 ottobre 2026
Stato: spec di dettaglio dopo il brainstorming con il coordinatore (domande 1–3 e sezioni
1–3 del design approvate).
Branch: `ondata3/amministrazione-utenti` · Worktree: `.worktrees/amministrazione`

Subordinata alla specifica principale
(`progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`: Parte 1 «Amministrare
l'app», sezioni 1, 2, 7, 13, 14, 15 e 16), al piano generale
(`progetto/superpowers/plans/2026-10-11-piano-generale.md`, «Ordine dell'ondata 3» e
«Interfacce decise») e all'interfaccia di A
(`progetto/superpowers/specs/2026-10-13-inviti-app.md`, sezione 7).

## Obiettivo

Federico (`app_admin`) apre «Amministrazione dell'app» dal Profilo, cerca un utente per
nome o email, apre il dettaglio e gli assegna o toglie il ruolo di curatore del
ricettario (`recipe_curator`) o di amministratore dell'app (`app_admin`). Le stesse
operazioni le fa un agente via MCP. Oggi i ruoli di chi ha già un account si cambiano
solo con SQL in produzione.

## Perimetro

Dentro:

1. funzioni nel database per elencare e cercare gli utenti, leggerne il dettaglio con le
   famiglie solo per nome e ruolo, assegnare e togliere i due ruoli globali, con
   l'ultimo amministratore dell'app protetto anche sotto concorrenza;
2. area `users` del contratto e del server (`users.list`, `users.get`,
   `users.setRole`), solo `app_admin`, con gli strumenti MCP derivati;
3. web: sezione Utenti in `/admin` sopra «Inviti all'app», pagina del dettaglio
   `/admin/users/$userId` con gli interruttori dei ruoli e le conferme;
4. consegne di A: l'account nato da un invito revocato dopo la prenotazione compare
   nell'elenco; `account_exists` alla creazione di un invito diventa un collegamento al
   dettaglio dell'utente.

Fuori: cancellazione degli utenti (attività C, decisione dell'utente del 15 ottobre
2026; nessun segnaposto nel dettaglio, vedi «Interfaccia per C»), ripristino del
ricettario (E), inviti alla famiglia, email.

## Decisioni del brainstorming

| # | Decisione | Motivo |
|---|---|---|
| 1 | `users.list({ query? })` con ricerca sul server per nome o email, al più 50 righe ordinate per nome e `more: true` se ce ne sono altre; niente cursore | Gli utenti sono poche decine; l'agente MCP deve poter cercare un'email precisa; chi vede `more` restringe la ricerca |
| 2 | La ricerca ignora maiuscole e minuscole ma **non gli accenti** | `unaccent` non è installata e non si aggiunge un'estensione solo per questo (coordinatore) |
| 3 | Il dettaglio mostra nome, email, «Tu», i due interruttori, le famiglie per nome e ruolo e l'indicazione dell'ultimo amministratore; **tolto il numero di agenti collegati** del prototipo | `app.connected_agents()` legge solo le sessioni di chi chiama: contarle per un altro utente richiede una lettura nuova di `auth` per un dato che l'amministratore non può usare (dal dettaglio non si scollegano agenti). Se servirà, arriva con la cancellazione di C, che deve già revocare gli accessi |
| 4 | MCP: la conferma per nominare un amministratore e per rinunciare al proprio `app_admin` è affidata alle istruzioni dell'agente (descrizione dello strumento); il server non chiede campi in più | Coerente con la decisione dell'utente dell'11 ottobre sulla pubblicazione delle ricette e con la parità della sezione 13. L'ultimo amministratore resta protetto sul server |
| 5 | Lettura dell'email con funzioni `security definer` nello schema `app` che leggono `auth.users` e verificano `app_admin` al loro interno; niente chiave segreta | Stesso schema degli inviti di A (`app.create_app_invitation` legge già `auth.users`); nessuna scrittura in `auth`; la chiave segreta resta solo in `server/src/accounts/` per creare account |
| 6 | Ultimo amministratore protetto da un lucchetto consultivo preso da **ogni** percorso che toglie `app_admin`; sotto il lucchetto si ricontrollano chi chiama e il numero di amministratori. Le assegnazioni non lo prendono (eccezione documentata nella sezione 1) | Due amministratori che si tolgono il ruolo a vicenda si mettono in fila: il secondo, già retrocesso, riceve `forbidden`; due che rinunciano ciascuno al proprio: il secondo riceve `last_app_admin`. Portata decisa dal coordinatore dopo la revisione di spec e piano |
| 7 | Dopo la propria rinuncia il web rilegge il profilo e porta a `/profile`, senza avviso a comparsa | Il web non ha un componente generico per gli avvisi (c'è solo quello per annullare un pasto, legato al menu) e la conferma ha già spiegato la conseguenza. **Scostamento dal prototipo**, che mostrava un avviso |
| 8 | `account_exists` risolto nel web: dopo l'errore il foglio cerca l'email con `users.list` e collega al dettaglio; il contratto di A non cambia | Nessuna modifica all'interfaccia di A già rilasciata |

## 1. Database

Migrazione `supabase/migrations/20261015100000_user_admin.sql`, solo additiva.
**Nessuna tabella e nessuna colonna nuove**: si usano `app.user_roles` (con `granted_by`
e `granted_at` già presenti), `app.profiles`, `app.family_members`, `app.families` e,
in sola lettura dentro le funzioni, `auth.users`.

Tutte le funzioni sono nello schema `app`, `security definer`, `set search_path = ''`,
con `EXECUTE` revocato a `public` e concesso solo ad `authenticated`. Ognuna rifiuta per
prima cosa chi non è `app_admin` con `42501` (`app.has_role('app_admin')`).

### `app.admin_users(p_query text, p_limit int)`

Restituisce `(id uuid, display_name text, email text, roles jsonb)`.

- Parte da `auth.users` con `left join app.profiles`: compare ogni account, anche quello
  senza ruoli né famiglia nato da un invito revocato dopo la prenotazione (consegna di
  A). Senza profilo (non dovrebbe accadere: lo crea il trigger) il nome è la parte
  dell'email prima della chiocciola, come nel trigger.
- `roles` è un array jsonb ordinato (`[]` se nessuno): il client gira senza
  `fetch_types` e riceverebbe un array come testo (stessa scelta di
  `server/src/profile/views.ts`).
- Filtro: con `p_query` vuoto o nullo, tutti; altrimenti `display_name ilike` o
  `email ilike` sul modello `'%' || testo || '%'`, con `\`, `%` e `_` del testo resi
  letterali (`escape '\'`). Solo maiuscole e minuscole, non gli accenti (decisione 2).
- Ordine `lower(display_name), id`; limite `p_limit + 1` righe: il server usa la riga in
  più per `more` e non la restituisce.
- `p_limit` fuori da 1–200 è rifiutato con `22023`.

### `app.admin_user(p_user_id uuid)`

Restituisce `(id, display_name, email, roles jsonb, last_app_admin boolean)`; nessuna
riga se l'utente non esiste. `last_app_admin` è vero se l'utente ha `app_admin` e
nessun altro lo ha: è un'indicazione per l'interfaccia, la protezione vera è in
`set_user_role`.

### `app.admin_user_families(p_user_id uuid)`

Restituisce `(name text, role text)` delle famiglie dell'utente: **solo nome e ruolo**,
né id né altri dati (specifica, sezione 2: l'`app_admin` non vede i contenuti delle
famiglie). L'ordine lo decide il server con `Intl.Collator`, come per il profilo.

### `app.set_user_role(p_user_id uuid, p_role text, p_granted boolean)`

Restituisce `void`.

1. Chi chiama non è `app_admin`: `42501`.
2. `p_role` diverso da `recipe_curator` e `app_admin`, o `p_granted` nullo: `22023`.
3. **Solo per la rimozione di `app_admin`** (`p_granted = false` e
   `p_role = 'app_admin'`): `perform pg_advisory_xact_lock(hashtextextended('app_admin_roles', 0))`,
   poi, in istruzioni successive (le richieste degli utenti girano in `read committed`,
   quindi ognuna vede ciò che chi aveva il lucchetto prima ha confermato):
   - chi chiama non è più `app_admin` (retrocesso da un altro mentre aspettava):
     `42501`;
   - il bersaglio ha `app_admin` e nessun altro utente lo ha: `P0A08`.
4. Utente inesistente in `auth.users`: `P0A07`.
5. `p_granted = true`: `insert ... (user_id, role, granted_by) values (..., auth.uid())
   on conflict do nothing`. Idempotente.
6. `p_granted = false`: `delete`; se il ruolo era già tolto non fa nulla.

**Regola del lucchetto** (decisione del coordinatore, revisione di spec e piano): ogni
percorso che **toglie** `app_admin` (questa funzione, la cancellazione di un account in
C, qualunque script futuro) prende il lucchetto `app_admin_roles` e, sotto il lucchetto,
ricontrolla chi chiama e il numero di amministratori. È la stessa regola
dell'«Interfaccia per C» e va scritta come commento nella funzione.

**Eccezione delle assegnazioni:** assegnare `app_admin` o `recipe_curator` e togliere
`recipe_curator` non prendono il lucchetto, né qui né in `app.complete_app_invitation`
di A, che resta com'è (nessuna migrazione su A). Un'assegnazione può solo aumentare il
numero di amministratori, quindi non mette a rischio l'ultimo. Un amministratore
retrocesso nello stesso istante in cui assegna un ruolo equivale a uno che lo ha
assegnato un attimo prima della retrocessione.

Le scritture dirette su `app.user_roles` restano negate (`authenticated` ha solo
`SELECT`, con la politica `user_roles_select_own`).

Codici SQLSTATE nuovi: `P0A07` (utente inesistente), `P0A08` (ultimo amministratore
dell'app). Oggi sono in uso `P0A01`–`P0A06`.

## 2. Contratto, server e MCP

### Area `users` (nuova: `contract/src/users/`, `server/src/users/`)

Tutte le operazioni: `role: 'appAdmin'`, `offline: false`. Registrazione con una riga in
`contract/src/contract.ts`, `contract/src/index.ts` e `server/src/router.ts`.

Vista comune:

```ts
userRowSchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  email: z.string(),
  roles: z.array(globalRoleSchema),
});
userDetailSchema = z.object({
  user: userRowSchema.extend({ lastAppAdmin: z.boolean() }),
  families: z.array(z.object({ name: z.string(), role: familyRoleSchema })),
});
```

| Operazione | Metodo e percorso | MCP | Input | Output | Errori |
|---|---|---|---|---|---|
| `users.list` | `GET /users` | `readOnly: true` | `{ query?: string }` (trim, 0–100 caratteri) | `{ users: UserRow[], more: boolean }` (≤ 50) | — |
| `users.get` | `GET /users/{id}` | `readOnly: true` | `{ id }` | `UserDetail` | `not_found` |
| `users.setRole` | `POST /users/{id}/roles` | `readOnly: false` | `{ id, role: GlobalRole, granted: boolean }` | `UserDetail` aggiornato | `not_found`, `last_app_admin` |

- `globalRoleSchema` viene da `contract/src/app-invitations/` (già esportato),
  `familyRoleSchema` da `contract/src/profile/`.
- `users.setRole` è idempotente: ripetuta con lo stesso input dà lo stesso esito.
  Restituisce il dettaglio letto nella stessa transazione dopo la modifica.
- Descrizione MCP di `users.setRole` (in inglese, come le altre): assegna o toglie un
  ruolo globale; **prima di nominare un amministratore dell'app e prima di togliere a
  sé stessi `app_admin`, chiedi conferma esplicita all'utente**; chi rinuncia al proprio
  ruolo perde gli strumenti di amministrazione dalla chiamata successiva; l'ultimo
  amministratore non può essere tolto (decisione 4).
- Strumenti MCP derivati: `users_list`, `users_get`, `users_setRole`.
- `server/src/users/db-errors.ts` traduce `42501` → `forbidden`, `P0A07` →
  `not_found`, `P0A08` → `last_app_admin`, `22023` → `invalid`; il resto si rilancia.
  I testi di `last_app_admin` esistono già nel server (`server/src/messages.ts`) e nel
  web (`errors.last_app_admin`).

### Ruoli e sessioni

I ruoli non stanno nel token: `checkRole` (`server/src/permissions.ts`) chiama
`app.has_role` a ogni richiesta, e le funzioni del database rifanno il controllo.
Un ruolo assegnato o tolto vale **dalla richiesta successiva**, nel web e per gli
agenti MCP già collegati, senza rinnovo della sessione. Il web legge i propri ruoli da
`profile.get`: dopo una modifica il profilo diventa da rileggere (sezione 3).

## 3. Web (`web/src/features/admin/`)

Nessun componente condiviso nuovo; si usano `PageHeader`, `StateNotice`, `Loading`,
`QueryError`, `BottomSheet`, `useOnline`.

### Sezione Utenti (`UsersSection.tsx`)

In `AdminPage` sopra `InvitationsSection`, nella forma del sesto giro:

- titolo «Utenti», campo di ricerca (`type="search"`, segnaposto «Cerca per nome o
  email»); la query parte 250 ms dopo l'ultima battuta, chiave
  `['users', 'list', { query }]` (`usersQuery` in `api.ts`);
- righe come collegamenti a `/admin/users/$userId`: nome con « · Tu » per il proprio
  account, email, ruoli come etichette (stile delle etichette degli inviti);
- con `more`: «Ci sono altri utenti: restringi la ricerca»; senza risultati: «Nessun
  utente».

### Dettaglio (`UserPage.tsx`, rotta `/admin/users/$userId`)

- Registrata in `web/src/router.tsx` accanto ad `adminRoute`; la barra in basso tiene
  attivo «Profilo» anche qui (`BottomNav.tsx`, `underProfile` su `/admin` e
  sottopercorsi).
- Stesso controllo di `/admin`: `hasAppAdmin(profile)`, altrimenti «Non hai accesso a
  questa pagina» con il link al Profilo; utente inesistente: stato `not_found`.
- Intestazione con il nome e ritorno ad «Amministrazione dell'app»; sotto, l'email e,
  per il proprio account, la riga «Questo è il tuo account» («This is your account»),
  che rende riconoscibile il contesto della rinuncia.
- Card «Ruoli»: due interruttori (`input type="checkbox" role="switch"`) «Curatore del
  ricettario» e «Amministratore dell'app», ciascuno con una spiegazione breve. Per
  l'ultimo amministratore l'interruttore di `app_admin` è disattivato e la spiegazione
  diventa il motivo: «È l'unico amministratore dell'app: nominane un altro prima».
- Card «Famiglie»: nome e ruolo («Amministratore» o «Membro», testi esistenti del
  profilo), «Nessuna famiglia» se vuota, e la nota «Si vedono solo nome e ruolo».
- Nessuna area di cancellazione e nessun segnaposto (fuori perimetro).

Cambio di ruolo:

- **senza aggiornamento ottimistico** (interfacce decise): l'interruttore mostra solo
  stati confermati dal server;
- `users.setRole` entra nel registro di `web/src/api/mutations.ts` con un bersaglio
  `users` che, come `appInvitations`, non scrive la risposta nella cache in modo
  generico: rende da rileggere le query `['users']` (dettaglio ed elenco) e, con
  `stale: ['profile']`, il profilo (i propri ruoli possono essere cambiati);
- **interruttori bloccati fino allo stato confermato** (prima revisione, rilievo 5):
  dal tocco fino a quando lo stato confermato è disponibile, entrambi gli interruttori
  sono disattivati. Lo stato confermato è la risposta di `setRole`, che è già il
  dettaglio aggiornato: la pagina la scrive nella cache del dettaglio se è
  **applicata**, cioè sessione aperta e risposta più recente **per quell'utente**;
  altrimenti attende la rilettura del dettaglio. Gli interruttori si riattivano appena
  la risposta è scritta, senza aspettare la rilettura avviata dal registro, che può
  restare in corso o fallire senza toccare lo stato mostrato: se fallisce, compare
  l'errore con «Riprova» e gli interruttori restano sullo stato confermato. Un secondo
  tocco durante l'attesa non manda nulla;
- **risposte superate** (seconda revisione, rilievo 2): per `users.setRole`
  l'invalidazione di `['users']` e del profilo avviene **sempre** (sessione aperta),
  mentre l'autorizzazione a scrivere la risposta (`applied`) vale solo per la più
  recente dello stesso utente. Il tracciamento è per utente: `useAreaMutation` e
  `runAreaMutation` accettano un'opzione `track` (per gli utenti `users:<id>`), che
  sostituisce la chiave di tracciamento senza toccare `familyId` (usato dal gestore di
  sessione). Il comportamento degli inviti non cambia: per `appInvitations` `applied`
  resta «sessione aperta», come oggi. Il tracciamento appartiene alla sessione, non
  alla pagina, quindi vale anche dopo uscita e rientro nel dettaglio;
- errore della mutazione: avviso sotto la card con il testo del codice
  (`last_app_admin` se un altro amministratore ha tolto il ruolo nel frattempo);
- **accesso da verificare** (revisioni, rilievo 3 della prima e 1 della seconda): `/admin`
  e il dettaglio hanno uno stato esplicito dell'accesso (`AdminAccess`, in
  `web/src/features/admin/AdminAccess.tsx`), condiviso dalle sezioni e dal foglio del
  nuovo invito. Al primo `forbidden` di un'operazione `users` (elenco, dettaglio,
  `setRole`, **e la ricerca di `account_exists`**):
  - lo stato passa a «verifica»: sezioni, dati e comandi **non si montano più**
    (si vede solo il caricamento), senza fidarsi del profilo in cache; le query
    `['users']` e `['appInvitations']` escono dalla cache;
  - il profilo si rilegge con una lettura che segnala l'errore
    (`queryClient.fetchQuery` con `staleTime: 0`);
  - senza `app_admin`: «Non hai accesso a questa pagina», anche se una copia del
    profilo in memoria dicesse il contrario;
  - con `app_admin` ancora presente (un `forbidden` per altri motivi): lo stato torna
    normale e le sezioni si rimontano, quindi rileggono i dati da capo;
  - lettura del profilo fallita: errore con «Riprova», che ripete la verifica; nel
    frattempo nessun dato e nessun comando, e il permesso precedente non si riusa.

  Il gestore condiviso degli errori (`SessionScope.tsx`) non cambia;
- conferme con `BottomSheet`:
  - **nomina di un amministratore** (accendere `app_admin` di chiunque): «Nominare
    {name} amministratore dell'app?», testo «Potrà gestire utenti, ruoli e inviti
    dell'app, anche nominare o togliere altri amministratori.», pulsante «Nomina»;
  - **rinuncia al proprio ruolo** (spegnere il proprio `app_admin`): «Rinunciare al
    ruolo di amministratore?», testo «Non vedrai più questa pagina. Potrà ridartelo
    solo un altro amministratore.», pulsante «Rinuncia» in rosso;
  - le altre modifiche sono dirette, come nel prototipo;
- **dopo la propria rinuncia** (decisione 7): il profilo si rilegge e il web porta a
  `/profile`, dove la voce «Amministrazione dell'app» non c'è più.
- Senza connessione gli interruttori sono disattivati, come i comandi della sezione
  Inviti.

### `account_exists` nel foglio «Nuovo invito» (`InviteSheet.tsx`)

Dopo l'errore `not_allowed`/`account_exists` il foglio chiama
`users.list({ query: email })` e cerca la riga con la stessa email (confronto in
minuscolo). Se la trova, accanto a «Questa email ha già un account» compare il
collegamento «Apri l'utente» a `/admin/users/$userId`; se non la trova (concorrenza,
errore di rete) resta solo il testo.

La ricerca è **legata al tentativo** (revisione, rilievo 4): ogni invio ha un numero
progressivo e la risposta della ricerca si usa solo se appartiene ancora all'ultimo
tentativo e il foglio è aperto. Cambiare l'email toglie il collegamento. Così una
risposta lenta per un'email precedente non collega mai la persona sbagliata. Un
`forbidden` della ricerca non si scarta: passa ad `AdminAccess` come ogni altro
`forbidden` delle operazioni `users`; gli altri errori della ricerca lasciano solo il
testo.

### Modalità finta e testi

- `web/src/api/fake/fakeUsers.ts`: le tre operazioni sui dati demo (le persone del
  seed, compresa quella collegata, più l'account «Ospite» senza ruoli né famiglia),
  con `forbidden` per chi non è `app_admin`, `last_app_admin` e `not_found` come sul
  server; registrata in `fakeApi.ts`; `users` aggiunta a `SERVER_AREAS`.
- **Demo amministratore:** `fakeClients` accetta `globalRoles`, e solo la modalità
  finta dell'app (`web/src/main.tsx`) gli passa `recipe_curator` e `app_admin`, così
  `/admin` si prova senza stack. I predefiniti di `fakeClients` e `createFakeApi`
  restano solo curatore, perché i test (`renderApp`, Profilo senza amministrazione) li
  usano così.
- **`account_exists` nella modalità finta:** `fakeAppInvitations.ts` riceve una
  funzione che dice se un'email ha già un account (dagli utenti finti) e in quel caso
  risponde `not_allowed`/`account_exists` come il server.
- Testi nuovi in `web/src/i18n/messages/admin.ts`, in italiano e inglese britannico.
  Testi italiani senza genere dove possibile.

## 4. Test

### pgTAP (`supabase/tests/user_admin_test.sql`)

- Funzioni presenti, `security definer`, `EXECUTE` solo ad `authenticated`.
- Chi non è `app_admin`: `42501` su tutte e quattro.
- `admin_users`: l'account senza ruoli né famiglie compare; ricerca per nome
  e per email senza distinzione di maiuscole; `%` e `_` nel testo trattati come
  caratteri; `p_limit + 1` righe; `p_limit` fuori intervallo rifiutato.
- `admin_user`: `last_app_admin` vero e falso; nessuna riga per un id inesistente.
- `admin_user_families`: solo le colonne `name` e `role`.
- `set_user_role`: assegnazione e rimozione idempotenti per entrambi i ruoli;
  `granted_by` di chi assegna; ruolo non valido `22023`; utente inesistente `P0A07`;
  ultimo amministratore `P0A08` (nella transazione del test si tolgono prima gli altri
  `app_admin`; il rollback finale li rimette).

### Server

`server/test/users.test.ts`:

- le tre operazioni rifiutate (`forbidden`) a un utente senza `app_admin`, via REST e via
  MCP;
- strumenti `users_list`/`users_get` di sola lettura, `users_setRole` no;
- `list`: ricerca per email e per nome; account senza ruoli né famiglia presente; `more`
  oltre le 50 righe;
- `get`: famiglie con solo `name` e `role` (la risposta non ha altre chiavi);
  `not_found` per un id inesistente;
- `setRole`: assegnazione e rimozione, ripetute con lo stesso esito; `not_found`;
- ultimo amministratore: `last_app_admin` anche togliendo il ruolo a sé stessi;
- rinuncia al proprio ruolo con un altro amministratore presente: riesce, e la
  richiesta successiva dello stesso utente (web e agente MCP con il token già emesso) è
  `forbidden`: la modifica vale subito.

I test che dipendono dal numero di amministratori tolgono gli `app_admin` degli altri
utenti di prova e **li rimettono sempre**, anche se il test fallisce (`afterEach` o
`finally`). I file del server girano uno alla volta (`fileParallelism: false`).

`server/test/users-locks.test.ts` (revisione, rilievi 1 e 2). In ogni caso la prima
operazione tiene aperta la transazione con `holdTransaction`, la seconda gira su
un'altra connessione:

1. **rimozione incrociata**, A e B soli: A toglie il ruolo a B, B toglie il ruolo ad A.
   Rilasciata A, B riceve `42501` (ha già perso il ruolo) e resta esattamente un
   amministratore, A;
2. **due rinunce**, A e B soli: A rinuncia al proprio ruolo, B al proprio. Rilasciata A,
   B (ancora amministratore) riceve `P0A08` e resta esattamente un amministratore, B;
3. **retrocesso in fila**, A, B e C: A toglie il ruolo a B, B prova a toglierlo a C.
   Rilasciata A, B riceve `42501` e restano A e C.

Come si accerta l'attesa: la connessione della seconda operazione comunica il proprio
`pg_backend_pid()`; la connessione di controllo legge `pg_stat_activity` finché quel
processo ha `wait_event_type = 'Lock'` e `wait_event = 'advisory'`, con un tempo
massimo. L'attesa di 200 ms (`stillPending`) resta solo come controllo accessorio. In
`try/finally` la prima transazione si rilascia e l'esito della seconda si raccoglie
**sempre**, prima del ripristino degli `app_admin` di prova. Le asserzioni vengono
dopo, nell'ordine: numero finale di amministratori, codici, attesa accertata. Così la
prova senza lucchetto (funzione sostituita a mano, solo in locale) conclude entrambe le
transazioni e fallisce mostrando l'invariante violata (zero amministratori).

Nessuna attesa resta appesa (seconda revisione, rilievo 3): se la seconda connessione
fallisce prima di comunicare il PID, la promessa del PID rigetta; se il lavoro iniziale
della prima transazione fallisce, `holdTransaction` rigetta invece di aspettare per
sempre (`server/test/support/hold.ts`, modifica compatibile con
`app-invitations-locks.test.ts`); il rilascio e la raccolta dei due esiti avvengono
insieme e si completano anche se il rilascio rigetta. Due casi lo dimostrano: seconda
connessione verso un indirizzo irraggiungibile (errore prima del PID: il test termina,
la prima transazione è rilasciata) e lavoro iniziale che fallisce (chi non è
amministratore: `holdTransaction` rigetta con `42501`, nessuna seconda operazione).

Il test verifica anche l'isolamento: una transazione aperta con `withDbOn` di
`server/src/db.ts` come utente risponde `read committed` a `show transaction_isolation`.
Se un giorno la pipeline passasse a `repeatable read`, il ricontrollo dopo il lucchetto
non vedrebbe le modifiche confermate e il test lo segnalerebbe.

### Web

- Componenti con l'API simulata (`AdminPage.test.tsx`, `UsersSection.test.tsx`,
  `UserPage.test.tsx`): sezione Utenti sopra gli inviti, ricerca con ritardo,
  etichette, « · Tu », `more`, nessun utente; «Questo è il tuo account» nel dettaglio,
  in italiano e in inglese; interruttori senza ottimismo; conferma della nomina;
  conferma della rinuncia e uscita verso `/profile`; interruttore bloccato con il
  motivo; `not_found`; nessun accesso; collegamento «Apri l'utente» da
  `account_exists`.
- Revisione di spec e piano:
  - interruttori bloccati dal tocco fino alla risposta di `setRole`, poi attivi con lo
    stato della risposta mentre la rilettura del dettaglio è ancora sospesa; se poi la
    rilettura fallisce, compare l'errore con «Riprova» e lo stato resta quello della
    risposta; un tocco durante l'attesa non manda nulla;
  - due mutazioni sullo stesso utente con risposte in ordine inverso, anche dopo uscita
    e rientro nel dettaglio e con le riletture sospese: la risposta vecchia non
    sostituisce quella nuova (nel registro: `applied` falso per la vecchia, entrambe
    invalidano; gli inviti restano come prima);
  - accesso da verificare, con retrocessione effettiva nell'API simulata: dopo il
    `forbidden` dati e comandi spariscono **dal DOM** subito, mentre la rilettura del
    profilo è sospesa; se fallisce, errore con «Riprova» e ancora nessun dato; se il
    profilo dice ancora `app_admin`, le sezioni tornano e rileggono; se non lo dice,
    «Non hai accesso a questa pagina». In `/admin`, nel dettaglio e per un `forbidden`
    della ricerca di `account_exists` nel foglio del nuovo invito;
  - due tentativi di invito con email diverse e risposte della ricerca in ordine
    inverso: il collegamento è quello dell'ultimo tentativo; cambiare l'email lo toglie
    (rilievo 4);
  - modalità finta: `account_exists` per `ospite@example.com` e persona demo
    amministratrice nei client della modalità finta (rilievo 6).
- Registro delle mutazioni (`mutations.test.ts`): `users.setRole` rilegge `['users']` e
  il profilo, non scrive la cache.
- I test web sullo stack (`*.stack.test.tsx`) usano Auth vero ma dati finti per le
  pagine, senza Worker: non provano il percorso. Il percorso dalla ricerca al cambio di
  ruolo con Auth, Worker e database veri si prova in due modi, come in A:
  - `server/test/stack/users.stack.test.ts` (variabili `STACK_*`, contratto e pipeline
    veri con `createApp` e le chiavi JWKS dello stack): l'amministratore, creato con
    l'API di amministrazione di Auth e reso `app_admin` via SQL, entra con la password,
    cerca la persona per email con `users.list`, apre `users.get`, le assegna il
    curatore con `users.setRole`; la persona, con il proprio token già emesso, vede il
    ruolo in `profile.get` alla richiesta successiva, e dopo la rimozione non lo vede
    più. `scripts/invitations/invite-stack.sh` esegue l'intera cartella
    `test/stack/` invece del solo file degli inviti (modifica minima, già in CI);
  - la skill agent-browser su `wrangler dev` con lo stack locale (`server/README.md`,
    «Sviluppo locale»), a larghezza desktop e da telefono (390 px): da `/admin` ricerca,
    dettaglio, assegnazione del curatore ritrovata come etichetta nell'elenco, conferma
    della nomina, interruttore bloccato con il motivo, rinuncia con ritorno al Profilo,
    «Apri l'utente» da `account_exists`. Anche in modalità finta (`npm run dev -w web`).
  - In entrambe le prove: interfaccia **in italiano e in inglese** e un **nome lungo**
    (per esempio «Maria Alessandra Benedetta Castiglioni di Valdobbiadene» con un'email
    altrettanto lunga) nell'elenco, nell'intestazione del dettaglio e nel foglio della
    nomina, a 390 px, senza testo tagliato né scorrimento orizzontale
    (`design/design.md`).

### Da provare a mano sull'iPhone

- Interruttori del dettaglio: dimensione del tocco e stato disattivato leggibile.
- Foglio di conferma (nomina e rinuncia) con la tastiera chiusa e il pulsante rosso.
- Ricerca: tastiera con «Cerca», ritardo, nessun salto della pagina mentre l'elenco si
  aggiorna.
- Ritorno al Profilo dopo la rinuncia, in una PWA aggiunta alla schermata Home.
- Collegamento «Apri l'utente» dal foglio del nuovo invito: a 390 px va a capo su due
  righe dopo «Questa email ha già un account»; controllare che il tocco su entrambe le
  righe apra l'utente.
- Interruttori: nella prova sono caselle di spunta native con `role="switch"`, come nel
  prototipo; controllare che sull'iPhone si leggano come interruttori di un ruolo.

**Provato con agent-browser** (15 ottobre 2026):

- **Modalità finta** (`vite`, persona demo amministratrice), a 1280 e 390 px, in inglese
  (lingua del browser) e in italiano: Utenti sopra «App invitations», ricerca, « · You»,
  ruoli come etichette; dettaglio di «Ospite» senza famiglie; curatore assegnato e
  ritrovato come etichetta nell'elenco; foglio della nomina e nomina; interruttore
  bloccato con il motivo sul proprio account quando è l'unico amministratore; rinuncia
  con il foglio rosso e ritorno a `/profile` senza la voce «App administration»;
  «Open the user» dal foglio del nuovo invito con `OSPITE@example.com`; «Profilo»
  attivo nella barra in basso nel dettaglio. Nome lungo («Maria Alessandra Benedetta
  Castiglioni di Valdobbiadene», dalle Preferenze) nell'elenco e nell'intestazione del
  dettaglio a 390 px, in italiano: va a capo, nessuno scorrimento orizzontale
  (`scrollWidth` 390).
- **Stack locale** (`wrangler dev` con Auth, Worker e database veri), a 1280 e 390 px:
  accesso con password come `app_admin`; elenco con i molti utenti dei test e «Ci sono
  altri utenti: restringi la ricerca.»; ricerca per email in maiuscolo; dettaglio della
  persona con nome ed email lunghi; curatore assegnato e ritrovato come etichetta;
  foglio della nomina con il nome lungo (titolo su quattro righe, pulsanti visibili) e
  nomina; in inglese, rinuncia al proprio ruolo con ritorno a `/profile`, poi `/admin`
  risponde «You don’t have access to this page» e il database non ha più il ruolo;
  entrando come la nuova amministratrice, «Apri l'utente» da `account_exists` porta al
  dettaglio della persona giusta.
- Correzioni nate dalla prova: righe dell'elenco e delle famiglie con `row-list`, email
  non in grassetto e campo di ricerca con bordo e margini come nel prototipo.

## 5. Rilascio

Lo fa il coordinatore dopo il merge: migrazione `20261015100000_user_admin.sql` in
produzione, poi il Worker. Nessun segreto, binding o risorsa esterna nuovi.

## 6. Interfaccia per C

- **Lucchetto dell'ultimo amministratore dell'app:** la cancellazione di un account
  (proprio o di un altro utente) toglie `app_admin` per cascata. Prima di cancellare,
  C prende `pg_advisory_xact_lock(hashtextextended('app_admin_roles', 0))` nella stessa
  transazione e rifiuta con `last_app_admin` se l'account è l'ultimo amministratore.
  Vale per ogni percorso che toglie `app_admin`, presente o futuro.
- **Comando di cancellazione nel dettaglio:** C aggiunge in `UserPage.tsx`, sotto la
  card «Famiglie», l'area di pericolo del prototipo («Elimina l'utente» verso
  `/admin/users/$userId/delete`; per il proprio account il rimando alle Preferenze).
  B non lascia segnaposto.
- `users.get` dà già nome ed email per l'intestazione della pagina di cancellazione in
  terza persona.

## 7. File

**Miei:** `contract/src/users/`, `server/src/users/`, `web/src/features/admin/`
(`UsersSection.tsx`, `UserPage.tsx`, `api.ts`, test e CSS),
`web/src/api/fake/fakeUsers.ts` (e test), la migrazione e il test pgTAP nuovi,
`server/test/users.test.ts`, `server/test/users-locks.test.ts`,
`server/test/stack/users.stack.test.ts`.

**Condivisi, con modifiche minime:** `contract/src/contract.ts`,
`contract/src/index.ts`, `server/src/router.ts`, `web/src/router.tsx`,
`web/src/components/BottomNav.tsx` (`underProfile`), `web/src/api/types.ts`
(`SERVER_AREAS`), `web/src/api/mutations.ts` (bersaglio `users`),
`web/src/api/fake/fakeApi.ts` (registrazione, opzione `globalRoles` di `fakeClients`),
`web/src/main.tsx` (demo amministratore nella modalità finta),
`web/src/api/mutations.ts` anche per l'opzione `track` di `useAreaMutation` e
`runAreaMutation` e per `applied` dei soli `users` legato alla risposta più recente,
`server/test/support/hold.ts` (`holdTransaction` rigetta se il lavoro iniziale fallisce,
invece di restare in attesa),
`web/src/api/fake/fakeAppInvitations.ts` (`account_exists` dagli utenti finti),
`web/src/i18n/messages/admin.ts`,
`supabase/tests/coverage_test.sql` (le quattro funzioni nell'elenco di
`authenticated`), `scripts/invitations/invite-stack.sh` (cartella `test/stack/`).

**Tabelle e colonne:** nessuna nuova o cambiata. Funzioni nuove: `app.admin_users`,
`app.admin_user`, `app.admin_user_families`, `app.set_user_role`.

## Decisioni da riportare nella specifica

**Prodotto:**

- Sezione Utenti di `/admin` sopra «Inviti all'app»: ricerca per nome o email che
  ignora le maiuscole ma non gli accenti, al più 50 risultati con l'invito a restringere
  la ricerca (sezione 7, «Amministrazione globale»; Parte 1, «Amministrare l'app»).
- Dettaglio dell'utente senza il numero di agenti collegati del prototipo, perché
  contarli richiede una lettura nuova di `auth` per un dato che l'amministratore non
  può usare; eventualmente con C (sezione 7; `design/percorsi.md`, sesto giro).
- Dopo la rinuncia al proprio `app_admin` si torna al Profilo senza avviso a comparsa,
  scostamento dal prototipo (sezione 7; sezione 14).
- Conferma della nomina di un amministratore e della rinuncia via MCP affidata alle
  istruzioni dell'agente, come per la pubblicazione delle ricette (sezione 13).
- `account_exists` nel foglio del nuovo invito con il collegamento «Apri l'utente»
  (sezione 7).
- Nel dettaglio del proprio account la riga «Questo è il tuo account» (sezione 7).
- Un amministratore retrocesso altrove vede «Non hai accesso a questa pagina» alla
  prima risposta `forbidden`, senza i dati di prima (sezione 7).
- Dal rilascio di B i ruoli di chi ha già un account si cambiano dall'app e via MCP;
  la frase «fino ad allora i ruoli … non si cambiano dall'app» della Parte 1 e della
  sezione 7 va aggiornata.

**Tecniche:**

- Funzioni `app.admin_users`, `app.admin_user`, `app.admin_user_families`,
  `app.set_user_role` (`security definer`, solo `app_admin`, lettura di `auth.users`
  senza scritture) (sezione 2, «Funzioni»; sezione 1).
- Lucchetto consultivo `app_admin_roles` obbligatorio per ogni percorso che toglie
  `app_admin`, compresa la cancellazione di un account, con il ricontrollo di chi chiama
  e del numero di amministratori sotto il lucchetto; le assegnazioni (anche
  `app.complete_app_invitation`) non lo prendono perché possono solo aumentare gli
  amministratori (sezione 7, «Ultimo amministratore dell'app»; sezione 2).
- Isolamento `read committed` delle transazioni degli utenti come requisito del
  ricontrollo dopo il lucchetto, verificato da un test (sezione 1).
- Codici SQLSTATE `P0A07` e `P0A08` (sezione 1, «Errori a codici», solo come dettaglio
  della traduzione in `not_found` e `last_app_admin`).
- Area `users` del contratto e strumenti `users_list`, `users_get`, `users_setRole`
  (sezioni 1 e 13).
- Ruoli letti dal database a ogni richiesta, quindi validi subito anche per gli agenti
  già collegati (sezioni 1 e 13).
- Bersaglio `users` nel registro delle mutazioni del web, senza scrittura della risposta
  nella cache (sezione 1, interfacce del web).
