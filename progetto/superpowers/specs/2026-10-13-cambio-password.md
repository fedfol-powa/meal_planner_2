# Cambio della password dal Profilo

Creato: 13 ottobre 2026 · Attività W7 · Issue #37 · Branch `traguardo/cambio-password`
Corretto il 13 ottobre 2026 dopo la review di spec e piano (9 rilievi, decisioni del
coordinatore in `progetto/coordinamento/messaggi/w7-01-review-spec.md`).

Spec di dettaglio subordinata alla specifica principale
(`progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`, sezioni 1, 7, 10, 13, 15 e
16). Design concordato con il coordinatore nel brainstorming del 13 ottobre 2026.

## Obiettivo e criteri di riuscita

Chi è entrato nell'app può cambiare la propria password dal Profilo, senza passare
dall'amministratore e senza email. Il 13 ottobre 2026 l'utente ha deciso che email e password
restano l'accesso principale in modo permanente: sull'iPhone la PWA installata non condivide la
sessione con Safari. Il cambio della password è quindi una funzione stabile.

Riuscita:

- dal Profilo si arriva a una pagina con password attuale, nuova password e conferma;
- una password attuale sbagliata non cambia nulla, anche con «Require current password»
  spento (il default di Supabase);
- il cambio riguarda sempre e solo l'account che l'ha chiesto, anche se nel frattempo un'altra
  scheda esce o cambia account;
- esito ed errori sono chiari e tradotti in it-IT e en-GB;
- la sessione del dispositivo resta aperta dopo il cambio; le altre sessioni si chiudono e
  la pagina lo dice prima della conferma;
- funziona senza email, senza migrazioni e senza nuove operazioni del Worker, a una
  condizione di produzione: «Secure password change» spento (sotto, «Precondizione del
  rilascio»);
- percorso completo provato sullo stack locale, anche montando la pagina con il backend
  reale, e interfaccia verificata nel browser anche a larghezza da telefono.

## Perimetro

Dentro: voce e pagina nella SPA, metodo `changePassword` dell'interfaccia di autenticazione,
minimo locale di Supabase a 8 caratteri, test unitari, prove sullo stack locale in CI, passo
facoltativo in dashboard e precondizione del rilascio descritti per l'utente.

Fuori: «password dimenticata» e link via email (ondata 3, servono le email); cambio
dell'email; Worker, schema `app`, contratto delle operazioni e strumenti MCP; impostazioni di
Supabase in produzione, che non si toccano in questa attività.

## Cosa fa Supabase Auth (verificato il 13 ottobre 2026)

Fonti: documentazione di Supabase via Context7 («Password security», «Password-based Auth»),
sorgente di `supabase/auth` v2.197.0 (la versione dello stack locale): `internal/api/user.go`,
`internal/api/password.go`, `internal/api/errors.go`, `internal/models/user.go`,
`internal/models/sessions.go`, `internal/conf/configuration.go`; sorgente di supabase-js
2.117.3 installato.

- `PUT /auth/v1/user` accetta `current_password` (supabase-js lo espone in `updateUser` dalla
  2.102.0).
- **Il server verifica `current_password` solo se nel progetto è attiva l'opzione «Require
  current password when changing password»** (`security_update_password_require_current_password`
  nella Management API). Se è spenta, che è il default, il campo viene ignorato e il cambio
  riesce anche con una password attuale sbagliata. La CLI 2.120.0 (quella della CI) non ha una
  chiave di `config.toml` per accenderla: in locale e in CI resta spenta.
- **«Secure password change»** (`secure_password_change`): con l'opzione accesa, se la
  sessione **della richiesta di cambio** ha più di 24 ore il server chiede un nonce mandato
  per email e senza nonce risponde `reauthentication_needed`. Un accesso di prova crea
  un'altra sessione e non ringiovanisce quella del dispositivo. In produzione non ci sono
  email: l'opzione deve restare spenta (precondizione del rilascio, sotto).
- Al cambio fatto dall'utente, Supabase cancella **tutte le sessioni dell'utente tranne quella
  del token della richiesta** (`LogoutAllExceptMe`), senza escludere quelle OAuth: gli altri
  dispositivi e, salvo prova contraria nel piano, le sessioni degli agenti MCP.
- supabase-js `updateUser()` legge la sessione corrente del client **al momento della
  chiamata**: se un'altra scheda ha cambiato account nel frattempo, userebbe il token del
  nuovo account. Per questo il cambio non passa da `updateUser()` (rilievo 1 della review).
- Errori: `same_password` (422) se la nuova è uguale all'attuale; `weak_password` (422) con i
  motivi (`length`, `characters`, `pwned`) se è debole; `current_password_mismatch` (400)
  quando l'opzione è accesa e la password attuale è sbagliata; `validation_failed` (400)
  oltre i 72 byte; `session_not_found` (403) se la sessione del token non esiste più;
  `reauthentication_needed` (400) nel caso sopra.
- Formato degli errori: con l'intestazione `X-Supabase-Api-Version: 2024-01-01` (la stessa che
  manda supabase-js) il corpo è `{ "code": "<codice>", "message": "…" }`, più
  `weak_password.reasons` per le password deboli; il codice è anche nell'intestazione
  `x-sb-error-code`.
- `/auth/v1/settings` non espone lunghezza minima né requisiti: la SPA non può leggerli.

## Scelte del brainstorming e della review

1. **Verifica della password attuale nella SPA** (approccio A, approvato). La SPA prova la
   password attuale con un accesso di prova, chiude subito quella sessione e solo dopo cambia
   la password, mandando anche `current_password`. Funziona con «Require current password»
   acceso o spento e il test della password errata gira davvero sullo stack locale. Scartate:
   solo l'opzione di produzione (non provabile in locale e silenziosamente assente se spenta)
   e nessuna verifica (il brief chiede la password attuale).
2. **Tutto legato alla sessione catturata all'inizio** (review, rilievo 1, bloccante). Il metodo
   legge una sola volta la sessione del dispositivo (id utente, email, access token) e fa il
   cambio con **quell'access token**. Prima e dopo il cambio controlla che sul dispositivo ci
   sia ancora lo stesso utente; se no, non manda il cambio (prima) o non tocca lo stato
   locale (dopo) e risponde con un esito neutro, `account_changed`.
3. **Tre richieste dirette a Supabase Auth, senza client supabase-js per la prova** (review,
   rilievi 1–3). `POST /auth/v1/token?grant_type=password` (verifica),
   `POST /auth/v1/logout?scope=local` con il token della prova (revoca della prova),
   `PUT /auth/v1/user` con il token catturato (cambio). È il meccanismo più semplice che
   rende impossibili gli errori trovati: il token del cambio non può cambiare sotto i piedi,
   la prova non ha archivio, eventi, `BroadcastChannel`, timer né ascoltatori da smaltire, e
   la revoca usa il token della prova, indipendente da qualsiasi stato locale. Lo stesso
   schema usa già il Worker per lo scollegamento degli agenti (`DELETE
   /auth/v1/user/oauth/grants`). Il coordinatore aveva indicato per la prova un client solo
   Auth di `@supabase/auth-js` con smaltimento in `finally`: la richiesta diretta ne è la
   versione minima (nessun client da smaltire, nessuna dipendenza da dichiarare); se il
   coordinatore preferisce comunque il client, il cambio resta una richiesta diretta per il
   rilievo 1.
4. **Revoca della prova con un nuovo tentativo; limite noto** (review, rilievo 2). Se la
   revoca fallisce si ritenta una volta subito. Se fallisce anche il secondo tentativo (rete
   assente), la sessione di prova **resta attiva sul server** fino alla scadenza del suo
   refresh token o al prossimo cambio riuscito, che la chiude con le altre. Non ha mai toccato
   il dispositivo e le sue credenziali non sono salvate da nessuna parte: si perdono alla fine
   della funzione. È un limite accettato dal coordinatore il 13 ottobre 2026.
5. **Minimo di 8 caratteri nella SPA** (approvato), uguale o più stretto del server; massimo
   72 byte. Il server resta l'arbitro: le sue risposte `weak_password` diventano messaggi
   tradotti per motivo, senza numeri. `supabase/config.toml` locale passa da 6 a 8.
6. **Altre sessioni**: non è una scelta dell'app, le chiude Supabase. La pagina lo dichiara
   prima della conferma e lo ripete nell'esito. La chiusura delle sessioni degli agenti si
   prova sullo stack locale; se la prova la smentisce, l'avviso si corregge.
7. **Passo facoltativo in dashboard** («Require current password» e minimo 8), indipendente
   dalla funzione, separato dalla precondizione del rilascio: lo porta il coordinatore
   all'utente.

## Web

### Voce nel Profilo

Nella scheda «Account» del Profilo, sotto «Account e preferenze» e prima di «Collega
un agente», una riga «Cambia password» con l'icona del lucchetto (nuova icona `lock` in
`Icon.tsx`, disegnata come le altre a tratto) e la freccia. Porta a `/profile/password`. In
modalità finta, senza Supabase, la riga non compare, come il pulsante «Esci».

### Pagina `/profile/password`

`PasswordPage` in `web/src/routes/profile/`, con `PageHeader`, titolo «Cambia password» e
ritorno al Profilo (`BackToProfile`), nella colonna delle altre sottopagine.

- Campi, in una `settings-card`, ognuno con etichetta stabile (`<label htmlFor>` e `id`
  fissi: `password-current`, `password-next`, `password-confirm`); suggerimenti ed errori
  stanno **fuori** dal `<label>` e sono collegati con `aria-describedby`, così il nome
  accessibile del campo resta lo stesso prima e dopo un errore (review, rilievo 6):
  - «Password attuale» (`type="password"`, `autocomplete="current-password"`);
  - «Nuova password» (`autocomplete="new-password"`), con l'aiuto «Almeno 8 caratteri.»;
  - «Conferma la nuova password» (`autocomplete="new-password"`).
- Avviso sempre visibile sopra il pulsante: «Dopo il cambio, gli altri dispositivi e gli
  agenti collegati dovranno accedere di nuovo. Su questo dispositivo resti dentro.»
- Pulsante principale «Cambia password»; durante l'invio «Cambio in corso…», con campi e
  pulsante bloccati. Un secondo tocco o Invio durante l'invio non manda nulla.
- Offline (`useOnline`): pulsante disattivato e la riga «Serve la connessione per cambiare la
  password.»

**Controlli prima dell'invio**, senza chiamate (`validatePasswordChange`): campi pieni, nuova
di almeno 8 caratteri e al massimo 72 byte (limite di bcrypt: oltre, Supabase risponde
`validation_failed`), conferma uguale alla nuova, nuova diversa dall'attuale. Ogni errore
compare sotto il proprio campo (`aria-describedby`, `aria-invalid`).

**Esito:**

- riuscito: i campi si svuotano e compare, con `role="status"`, «Password cambiata. Gli altri
  dispositivi e gli agenti collegati dovranno accedere di nuovo.» Si resta sulla pagina;
- errore: messaggio con `role="alert"`; l'errore della password attuale va sotto il suo
  campo, quelli della nuova sotto la nuova, gli altri sopra il pulsante. I campi restano
  com'erano, così si corregge solo ciò che serve;
- `session_expired`: messaggio e pulsante «Accedi di nuovo», che chiama la procedura comune
  di uscita (`useSignOut`: dati locali cancellati, pagina di accesso). Serve perché il cambio
  non passa dal client supabase-js e quindi nessun evento `SIGNED_OUT` arriva da solo;
- `account_changed`: i campi si svuotano (la password dell'account precedente non resta sullo
  schermo del nuovo) e compare un messaggio neutro. Se nel frattempo la pagina non c'è più
  (uscita, cambio d'utente), l'esito si scarta: la pagina conserva l'id dell'utente
  dell'invio e ignora una risposta arrivata per un utente diverso da quello mostrato.

Messaggi (it-IT; en-GB con lo stesso senso, nei file delle stringhe):

| Esito | Testo |
|---|---|
| `current_invalid` | La password attuale non è corretta. |
| `weak_length` | La nuova password è troppo corta. |
| `weak_characters` | La nuova password deve contenere altri tipi di caratteri (lettere, numeri o simboli). |
| `weak` | La nuova password non è abbastanza sicura: scegline un'altra. |
| `same_password` | La nuova password è uguale a quella attuale. |
| `session_expired` | La sessione è scaduta: accedi di nuovo e riprova. |
| `reauthentication_needed` | Il servizio chiede una conferma via email, che l'app non gestisce: avvisa l'amministratore. |
| `account_changed` | Il cambio si è interrotto perché l'account su questo dispositivo è cambiato. |
| `rate_limited` | Troppi tentativi: riprova tra qualche minuto. |
| `network` | Non riesco a raggiungere il servizio: controlla la connessione. |
| `unknown` | Cambio non riuscito: riprova tra poco. |

I testi seguono tono e parole di `design/percorsi.md` e delle stringhe esistenti
(`auth.ts`, `profile.ts`): si possono ritoccare nel piano senza cambiarne il senso. Le stringhe
vanno in un file nuovo `web/src/i18n/messages/password.ts`, aggiunto a `index.ts` come le
altre aree.

### Sessione dopo il cambio

Il cambio usa il token catturato e non passa dal client supabase-js: la sessione salvata sul
dispositivo non cambia (stesso access token, stesso refresh token, stesso id di sessione) e
nessun evento arriva ad `AuthProvider`. Supabase conserva proprio la sessione di quel token,
che è quella del dispositivo; lo verifica la prova sullo stack. Le altre schede dello stesso
dispositivo condividono la sessione e restano dentro. Gli altri dispositivi escono al rinnovo
successivo con la procedura comune, che cancella i dati locali (sezione 1 della specifica
principale), compresa la coda offline della spesa.

## Autenticazione

### Interfaccia

In `web/src/auth/backend.ts`:

```ts
export type ChangePasswordFailure =
  | 'current_invalid' | 'weak_length' | 'weak_characters' | 'weak' | 'same_password'
  | 'session_expired' | 'reauthentication_needed' | 'account_changed'
  | 'rate_limited' | 'network' | 'unknown';
export type ChangePasswordResult = { ok: true } | { ok: false; reason: ChangePasswordFailure };

interface AuthBackend {
  // …
  /** Checks `current` with a throwaway sign-in, then sets `next` with this device's captured session. */
  changePassword(current: string, next: string): Promise<ChangePasswordResult>;
}
```

Modalità finta: `{ ok: true }`. Lo `stubBackend` dei test ha un esito impostabile, uno
sospendibile e registra le chiamate.

### Implementazione Supabase

Modulo nuovo `web/src/auth/passwordChangeRequests.ts`, con `fetch` iniettabile, usato da
`supabaseBackend.ts`. Passi:

0. **Cattura.** `auth.getSession()` una volta sola. Prima si guarda l'errore, come fa già
   `check()` in `supabaseBackend.ts`: errore ritentabile di rete → `network` (il rinnovo non
   si può fare ora, la sessione resta salvata); altro errore o nessuna sessione →
   `session_expired`. Si conservano id utente, email e access token.
1. **Verifica.** `POST /auth/v1/token?grant_type=password` con `apikey`, intestazione della
   versione dell'API ed `{ email, password: current }`. Errore → esito della tabella (passo
   `verify`). Successo → si conserva solo l'access token della prova.
2. **Revoca della prova.** `POST /auth/v1/logout?scope=local` con `Authorization: Bearer
   <token della prova>`; se fallisce, un secondo tentativo subito. Gli esiti non cambiano
   l'esito del cambio (limite noto, scelta 4).
3. **Controllo dell'identità.** Nuova `auth.getSession()`: se l'utente non c'è più o è un altro,
   `account_changed` senza mandare il cambio. Lettura locale: nessuna chiamata di rete salvo
   il rinnovo che supabase-js farebbe comunque.
4. **Cambio.** `PUT /auth/v1/user` con `apikey`, `Authorization: Bearer <token catturato>` e
   `{ password: next, current_password: current }`. Errore → esito della tabella (passo
   `update`).
5. **Controllo finale.** Se dopo il cambio sul dispositivo c'è un altro utente o nessuno,
   `account_changed` (il cambio può essere avvenuto sull'account che l'ha chiesto, che lo
   scoprirà al prossimo accesso: l'esito resta neutro); altrimenti l'esito del passo 4.

Sul server, un'uscita da un'altra scheda chiude la sessione del token catturato (`signOut`
con scope `local`): un cambio partito dopo riceve `session_not_found` e non tocca nulla.

### Errori

`changePasswordFailure(error, step)`, funzione pura, testata come `signInFailure`. `error` è
`{ code?: string; status?: number; name?: string; reasons?: string[] }`: per le risposte HTTP
`code` viene da `x-sb-error-code` o dal corpo, `reasons` da `weak_password.reasons`; un
`fetch` che lancia dà `{ name: 'TypeError', status: 0 }`.

| Risposta | Esito |
|---|---|
| eccezione di `fetch` (`status` 0), `AuthRetryableFetchError` | `network` |
| 429, `over_request_rate_limit` | `rate_limited` |
| `current_password_mismatch` | `current_invalid` |
| passo `verify`: `invalid_credentials` o 400 | `current_invalid` |
| `weak_password` con `characters` fra i motivi | `weak_characters` |
| `weak_password` con solo `length` | `weak_length` |
| `weak_password` con altri motivi (per esempio `pwned`) | `weak` |
| `same_password` | `same_password` |
| `reauthentication_needed` | `reauthentication_needed` |
| `AuthSessionMissingError`, 401, `session_not_found`, `refresh_token_not_found`, `bad_jwt` | `session_expired` |
| altro (compreso `validation_failed`, che la SPA previene) | `unknown` |

### Validazione del modulo

`web/src/auth/passwordChange.ts`, modulo puro:

```ts
export const PASSWORD_MIN_LENGTH = 8; // characters (code points)
export const PASSWORD_MAX_BYTES = 72; // UTF-8 bytes, bcrypt's limit
export type PasswordField = 'current' | 'next' | 'confirm';
export type PasswordFieldError = 'required' | 'too_short' | 'too_long' | 'mismatch' | 'same_as_current';
export function validatePasswordChange(input: Record<PasswordField, string>): Partial<Record<PasswordField, PasswordFieldError>>;
```

Le password non si tagliano (`trim`): gli spazi fanno parte della password.

## Worker e database

Nessuna modifica: niente migrazioni, operazioni oRPC o strumenti MCP. La password passa solo
fra il browser e Supabase Auth. Un agente collegato via MCP resta nel rischio già
documentato nella sezione 13 della specifica principale (può cambiare la password senza
conoscerla); questa funzione non lo peggiora, e il passo facoltativo sotto lo riduce.

## Configurazione locale

`supabase/config.toml`: `minimum_password_length` da 6 a **8**, per allinearsi al minimo
della SPA e al valore proposto per la produzione. Gli utenti di prova usano `password123`
(11 caratteri); il minimo vale per le password nuove, non per l'accesso. `password_requirements`
resta vuoto e `secure_password_change` resta `false`, come richiesto in produzione.

## Precondizione del rilascio (la verifica il coordinatore con l'utente)

**«Secure password change» deve essere spento** nel progetto di produzione
(`lronuqvtjdhfyychnscr`). Con l'opzione accesa, chi ha una sessione di più di 24 ore (il caso
normale della PWA) riceverebbe `reauthentication_needed`, che senza email non ha rimedio:
l'app mostra il messaggio della tabella. Il valore attuale è **da verificare** (il default dei
progetti nuovi è spento). Se risulta acceso, non lo cambia questa attività: si torna al
coordinatore (`STATO: DOMANDA`), come prevede il brief.

## Passo facoltativo in produzione (lo fa l'utente)

Proposta separata, portata dal coordinatore, indipendente dalla funzione, che funziona anche
senza. Valori attuali **da verificare** in dashboard: il default dei progetti Supabase è minimo
6, senza requisiti sui caratteri.

Nella dashboard di Supabase, progetto `lronuqvtjdhfyychnscr`, Authentication → Sign In /
Providers → Email (o la pagina delle impostazioni delle password, dove la dashboard le mostra):

1. **«Require current password when changing password»: attivo.** Il server rifiuta un cambio
   senza la password attuale corretta: un agente con un token dell'utente non potrebbe più
   cambiarla senza conoscerla (riduce il rischio della sezione 13). La SPA manda già
   `current_password`, quindi nulla da cambiare nell'app.
2. **«Minimum password length»: 8.**
3. Lasciare spenti i requisiti sui caratteri.

Verifica dopo il passo: un cambio dalla app con password attuale corretta riesce; la
mappatura di `current_password_mismatch` è già coperta dai test.

## Test

**Unitari** (Vitest, senza rete):

- `passwordChange.test.ts`: campi vuoti, 7 e 8 caratteri, 72 e 73 byte, lettere accentate
  contate come un carattere, conferma diversa, nuova uguale all'attuale, più errori insieme,
  spazi conservati.
- `passwordChangeRequests.test.ts`, con `fetch` finto e `getSession` finta:
  - `changePasswordFailure` per ogni riga della tabella;
  - richieste esatte: percorsi, intestazioni (`apikey`, versione dell'API, `Authorization`
    col token giusto) e corpi; il cambio usa il token catturato, non quello del momento;
  - password attuale errata: nessun cambio e nessuna revoca (non c'è sessione di prova);
  - revoca della prova: inviata con il token della prova; un fallimento la ritenta una volta;
    il doppio fallimento non cambia l'esito;
  - `getSession()` con errore di rete → `network`; con errore definitivo o senza sessione →
    `session_expired`; in entrambi i casi nessuna richiesta;
  - **cambio d'account A→B durante la verifica sospesa**: nessun `PUT` parte, esito
    `account_changed`; **uscita** durante la verifica: stesso esito; **cambio d'account
    durante il `PUT` sospeso**: esito `account_changed`; in ogni caso nessuna richiesta porta
    il token di B;
  - corpi d'errore nei due formati (codice nel corpo o solo nell'intestazione) e risposta non
    JSON.
- `supabaseBackend.test.ts`: `changePassword` del backend usa la sessione del client del
  dispositivo e non chiama `updateUser`, `signInWithPassword` né `signOut` del client del
  dispositivo; archivio del dispositivo identico dopo un fallimento.
- `PasswordPage.test.tsx`, con `stubBackend`: nomi accessibili dei campi uguali prima e dopo
  gli errori, suggerimento ed errori collegati con `aria-describedby`, errori per campo,
  pulsante disattivato offline e durante l'invio, un solo invio con doppio tocco e Invio,
  esito riuscito con campi vuoti e messaggio, un messaggio per ogni esito, campi conservati
  dopo un errore, `session_expired` con «Accedi di nuovo» che porta all'accesso,
  `account_changed` con campi vuoti, esito scartato se l'utente cambia durante l'invio,
  messaggio che segue il cambio di lingua, it-IT ed en-GB.
- `ProfilePage.test.tsx`: la riga c'è con Supabase e manca in modalità finta.

**Sullo stack locale, backend reale** (`changePassword.stack.test.ts`, in CI dopo la prova
degli agenti). Ogni prova crea un utente suo con la registrazione (iscrizioni locali accese),
**usa la sessione della registrazione come sessione del dispositivo**, chiude
esplicitamente ogni altro accesso che apre e alla fine cancella gli utenti creati. Le
sessioni si confrontano per id (`session_id` dei token), non solo per numero:

- cambio riuscito: la nuova entra, la vecchia no; in `auth.sessions` resta esattamente la
  sessione del dispositivo, che si rinnova ancora;
- password attuale errata → `current_invalid`, password invariata, sessioni invariate;
- password debole (6 caratteri, sotto il minimo locale di 8, chiamando il backend senza la
  validazione della SPA) → `weak_length`; uguale all'attuale → `same_password`; in entrambi i
  casi resta solo la sessione del dispositivo (la prova è stata revocata);
- sessione del dispositivo chiusa altrove (righe di `auth.sessions` cancellate, l'access
  token resta firmato e non scaduto) → `session_expired`, password invariata;
- un secondo accesso web perde il refresh token dopo il cambio;
- sessione del dispositivo più vecchia di 24 ore (`created_at` spostato indietro): il cambio
  riesce con `secure_password_change = false`.

**Sullo stack locale, pagina con il backend reale** (`PasswordPage.stack.test.tsx`, Vitest con
jsdom, la stessa CI): l'app montata con `renderApp`, il backend Supabase vero e l'API finta
(il Worker non serve alla pagina):

- cambio riuscito: messaggio, identità invariata, sessione salvata sul dispositivo identica;
- password attuale errata: messaggio sul campo;
- rifiuto del server: con il minimo locale uguale a quello della SPA, password debole e
  uguale non sono raggiungibili dal modulo; il rifiuto del server provato dalla pagina è la
  password attuale errata (risposta del server al passo di verifica), mentre `weak_length` e
  `same_password` sono provati sul backend reale (sopra) e sulla pagina con lo stub;
- sessione revocata: messaggio, «Accedi di nuovo», pagina di accesso, dati della sessione
  cancellati dall'archivio.

**Agenti**, nella prova degli agenti (`scripts/oauth/agents-e2e.mjs`): un client OAuth
registrato e autorizzato; dopo il cambio il suo access token è rifiutato da MCP, RPC e REST e
il refresh token annullato; la sessione web che ha chiesto il cambio funziona ancora. Se
l'esito è diverso, si correggono avviso e decisioni.

**Browser** con la skill agent-browser sullo stack locale: percorso completo a 390 px e su
desktop, screenshot degli stati (vuoto, errori, invio, riuscito, offline). È la verifica
visiva; il comportamento lo provano le suite automatiche.

**Verifica finale:** `npm run typecheck`, `npm test`, `npm run build -w web`, le due prove
sullo stack.

## Cosa uso e cosa produco

Uso: `AuthBackend` e `AuthProvider` (app web di base), `useSignOut` (`SessionScope`),
`PageHeader`, `BackToProfile`, `settings-card`, `field`, `useOnline`, `stubBackend`,
`renderApp`, la prova degli agenti (`scripts/oauth/`). Produco: `changePassword`
nell'interfaccia di autenticazione, il modulo delle richieste, la rotta `/profile/password`,
l'icona `lock`. Nessuna dipendenza nuova.

## Decisioni da riportare nella specifica

### Prodotto

- **Cambio della password dal Profilo** (issue #37), funzione permanente del traguardo A:
  password attuale, nuova di almeno 8 caratteri e conferma; esito ed errori tradotti; nessuna
  email. Sezione 7 (Account) e Parte 1 («Chi la usa» o «Cosa l'app non fa»).
- **Dopo il cambio si chiudono le altre sessioni**, dispositivi e agenti collegati (da
  confermare con la prova sullo stack locale), per comportamento di Supabase; il dispositivo
  resta dentro e la pagina avvisa prima della conferma. Sezioni 7 e 13 (accanto a
  «Chiudere le altre sessioni dal web chiude anche gli agenti»).
- **Precondizione di produzione**: «Secure password change» spento, perché senza email non
  c'è riautenticazione. Sezioni 1 (Supabase in produzione) e 7.
- **Passo facoltativo in dashboard** proposto all'utente: «Require current password» attivo e
  minimo 8 caratteri in produzione. Sezioni 1 e 15 («MCP»: candidata «password attuale
  richiesta per cambiarla» realizzabile con un'impostazione).

### Tecniche

- Verifica della password attuale nella SPA con un accesso di prova diretto
  (`/auth/v1/token`), revocato con il suo token (un nuovo tentativo; limite noto con la rete
  assente), poi cambio con `PUT /auth/v1/user` e il token della sessione catturata
  all'inizio, con controllo dell'identità prima e dopo; il server riverifica la password
  attuale solo con l'opzione accesa, che la CLI non esprime in `config.toml`. Sezioni 1 e 7.
- Metodo `changePassword` di `AuthBackend` ed esiti tradotti; il cambio non passa dal client
  supabase-js e non emette eventi, `session_expired` porta all'uscita comune con un pulsante.
  Sezione 1 («Copia e sessione sul dispositivo»).
- `minimum_password_length = 8` nello stack locale. Sezione 1.
- Prove sullo stack locale in CI del cambio (backend e pagina) e della chiusura delle
  sessioni, agenti compresi. Sezione 9.
- Registro: riga del 13 ottobre 2026 nella sezione 16 e stato nella sezione 10.
