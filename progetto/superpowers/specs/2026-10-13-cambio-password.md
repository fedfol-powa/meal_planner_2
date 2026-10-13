# Cambio della password dal Profilo

Creato: 13 ottobre 2026 · Attività W7 · Issue #37 · Branch `traguardo/cambio-password`

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
- una password attuale sbagliata non cambia nulla, anche con le impostazioni di default di
  Supabase;
- esito ed errori sono chiari e tradotti in it-IT e en-GB;
- la sessione del dispositivo resta aperta dopo il cambio; le altre sessioni si chiudono e
  la pagina lo dice prima della conferma;
- funziona senza email, senza migrazioni e senza nuove operazioni del Worker;
- percorso completo provato sullo stack locale, interfaccia verificata nel browser anche a
  larghezza da telefono.

## Perimetro

Dentro: voce e pagina nella SPA, metodo `changePassword` dell'interfaccia di autenticazione,
minimo locale di Supabase a 8 caratteri, test unitari, prova sullo stack locale in CI, passo
facoltativo in dashboard descritto per l'utente.

Fuori: «password dimenticata» e link via email (ondata 3, servono le email); cambio
dell'email; Worker, schema `app`, contratto delle operazioni e strumenti MCP; impostazioni di
Supabase in produzione, che non si toccano in questa attività.

## Cosa fa Supabase Auth (verificato il 13 ottobre 2026)

Fonti: documentazione di Supabase via Context7 («Password security», «Password-based Auth»),
sorgente di `supabase/auth` v2.197.0 (la versione dello stack locale): `internal/api/user.go`,
`internal/models/user.go`, `internal/models/sessions.go`, `internal/conf/configuration.go`.

- `updateUser({ password, current_password })` è supportato da supabase-js 2.102.0. Nel
  repository c'è la 2.117.3.
- **Il server verifica `current_password` solo se nel progetto è attiva l'opzione «Require
  current password when changing password»** (`security_update_password_require_current_password`
  nella Management API). Se è spenta, che è il default, il campo viene ignorato e il cambio
  riesce anche con una password attuale sbagliata. La CLI 2.120.0 (quella della CI) non ha una
  chiave di `config.toml` per accenderla: in locale e in CI resta spenta.
- «Secure password change» (`secure_password_change`) chiede una sessione con meno di 24 ore
  oppure un nonce mandato per email (`reauthenticate`). In produzione non ci sono email (né
  SMTP né Resend), quindi la si scarta.
- Al cambio fatto dall'utente, Supabase cancella **tutte le sessioni dell'utente tranne quella
  della richiesta** (`LogoutAllExceptMe`): gli altri dispositivi e, salvo prova contraria nel
  piano, anche le sessioni dei client OAuth degli agenti MCP.
- Errori: `same_password` (422) se la nuova è uguale all'attuale; `weak_password` con i motivi
  (`length`, `characters`, `pwned`) se è debole; `current_password_mismatch` quando l'opzione
  è accesa e la password attuale è sbagliata.
- `/auth/v1/settings` non espone lunghezza minima né requisiti: la SPA non può leggerli.

## Scelte del brainstorming

1. **Verifica della password attuale nella SPA** (approccio A, approvato). La SPA prova la
   password attuale con un accesso di prova in un client separato, chiude subito quella
   sessione e solo dopo cambia la password sulla sessione del dispositivo, mandando anche
   `current_password`. Funziona con qualunque impostazione del progetto, in locale, in CI e in
   produzione, e il test della password errata gira davvero sullo stack locale. Scartate: solo
   l'opzione di produzione (non provabile in locale e silenziosamente assente se spenta) e
   nessuna verifica (il brief chiede la password attuale).
2. **Minimo di 8 caratteri nella SPA** (approvato), uguale o più stretto del server. Il server
   resta l'arbitro: le sue risposte `weak_password` diventano messaggi tradotti per motivo,
   senza numeri. `supabase/config.toml` locale passa da 6 a 8 (vedi «Configurazione locale»).
3. **Altre sessioni**: non è una scelta dell'app, le chiude Supabase. La pagina lo dichiara
   prima della conferma e lo ripete nell'esito. La chiusura delle sessioni degli agenti si
   prova sullo stack locale; se la prova la smentisce, l'avviso si corregge.
4. **Passo facoltativo in dashboard**, indipendente dalla funzione: lo porta il coordinatore
   all'utente come proposta separata (sotto, «Passo facoltativo in produzione»).

## Web

### Voce nel Profilo

Nella scheda «Account» del Profilo, sotto «Account e preferenze» e prima di «Collega
un agente», una riga «Cambia password» con l'icona del lucchetto (nuova icona `lock` in
`Icon.tsx`, disegnata come le altre a tratto) e la freccia. Porta a `/profile/password`. In
modalità finta, senza Supabase, la riga non compare, come il pulsante «Esci».

### Pagina `/profile/password`

`PasswordPage` in `web/src/routes/profile/`, con `PageHeader`, titolo «Cambia password» e
ritorno al Profilo (`BackToProfile`), nella colonna delle altre sottopagine.

- Campi, in una `settings-card`:
  - «Password attuale» (`type="password"`, `autocomplete="current-password"`);
  - «Nuova password» (`autocomplete="new-password"`), con l'aiuto «Almeno 8 caratteri.»;
  - «Conferma la nuova password» (`autocomplete="new-password"`).
- Avviso sempre visibile sopra il pulsante: «Dopo il cambio, gli altri dispositivi e gli
  agenti collegati dovranno accedere di nuovo. Su questo dispositivo resti dentro.»
- Pulsante principale «Cambia password»; durante l'invio «Cambio in corso…», con campi e
  pulsante bloccati.
- Offline (`useOnline`): pulsante disattivato e la riga «Serve la connessione per cambiare la
  password.»

**Controlli prima dell'invio**, senza chiamate (`validatePasswordChange`): campi pieni, nuova
di almeno 8 caratteri e al massimo 72 byte (limite di bcrypt, oltre il quale Supabase rifiuta
con un errore generico), conferma uguale alla nuova, nuova diversa dall'attuale. Ogni errore
compare sotto il proprio campo (`aria-describedby`, `aria-invalid`).

**Esito:**

- riuscito: i campi si svuotano e compare, con `role="status"`, «Password cambiata. Gli altri
  dispositivi e gli agenti collegati dovranno accedere di nuovo.» Si resta sulla pagina;
- errore: messaggio con `role="alert"`; l'errore della password attuale va sul suo campo, quelli
  della nuova sotto la nuova, gli altri sopra il pulsante. La password attuale resta nel campo,
  la nuova e la conferma pure, così si corregge solo ciò che serve.

Messaggi (it-IT; en-GB con lo stesso senso, nei file delle stringhe):

| Esito | Testo |
|---|---|
| `current_invalid` | La password attuale non è corretta. |
| `weak_length` | La nuova password è troppo corta. |
| `weak_characters` | La nuova password deve contenere altri tipi di caratteri (lettere, numeri o simboli). |
| `same_password` | La nuova password è uguale a quella attuale. |
| `session_expired` | La sessione è scaduta: accedi di nuovo e riprova. |
| `rate_limited` | Troppi tentativi: riprova tra qualche minuto. |
| `network` | Non riesco a raggiungere il servizio: controlla la connessione. |
| `unknown` | Cambio non riuscito: riprova tra poco. |

I testi seguono tono e parole di `design/percorsi.md` e delle stringhe esistenti
(`auth.ts`, `profile.ts`): si possono ritoccare nel piano senza cambiarne il senso. Le stringhe
vanno in un file nuovo `web/src/i18n/messages/password.ts`, aggiunto a `index.ts` come le
altre aree.

### Sessione dopo il cambio

Supabase emette `USER_UPDATED` per lo stesso utente: `AuthProvider` lo tratta come lo stesso
stato e non ridisegna nulla. Le altre schede dello stesso dispositivo condividono la sessione
e restano dentro. Con `session_expired` la pagina mostra il messaggio; il flusso esistente
(`unauthorized`, `SIGNED_OUT`) porta al login, senza logica nuova di uscita. Gli altri
dispositivi escono al rinnovo successivo con la procedura comune, che cancella i dati locali
(sezione 1 della specifica principale), compresa la coda offline della spesa.

## Autenticazione

### Interfaccia

In `web/src/auth/backend.ts`:

```ts
export type ChangePasswordFailure =
  | 'current_invalid' | 'weak_length' | 'weak_characters' | 'same_password'
  | 'session_expired' | 'rate_limited' | 'network' | 'unknown';
export type ChangePasswordResult = { ok: true } | { ok: false; reason: ChangePasswordFailure };

interface AuthBackend {
  // …
  /** Checks `current` with a throwaway sign-in, then sets `next` on this device's session. */
  changePassword(current: string, next: string): Promise<ChangePasswordResult>;
}
```

Modalità finta: `{ ok: true }`. Lo `stubBackend` dei test ha un esito impostabile e registra
le chiamate.

### Implementazione Supabase

In `supabaseBackend.ts`, tre passi:

1. **Verifica.** Un client di prova, creato a ogni cambio con `persistSession: false`,
   `autoRefreshToken: false`, `detectSessionInUrl: false`, una `storageKey` propria
   (`cosasimangia-auth-check`) e un archivio in memoria. Non scrive nell'archivio del
   dispositivo, non condivide il `BroadcastChannel` (che supabase-js nomina dalla
   `storageKey`) e non ha ascoltatori collegati ad `AuthProvider`. Fa `signInWithPassword` con
   l'email della sessione del dispositivo e la password attuale. Senza sessione del
   dispositivo: `session_expired` senza chiamate.
2. **Pulizia.** Il client di prova chiude la sua sessione con `signOut({ scope: 'local' })`,
   che sul server cancella solo quella. Un fallimento non blocca: il passo 3, se riesce, la
   chiude insieme alle altre.
3. **Cambio.** Sul client del dispositivo `updateUser({ password: next, current_password: current })`.

Iniezione per i test: `deps.createCheckClient?: () => AuthClient` accanto a `deps.auth`, con lo
stesso schema di oggi.

### Errori

`changePasswordFailure(error, step)`, funzione pura esportata e testata come
`signInFailure`:

| Risposta di Supabase | Esito |
|---|---|
| passo 1: `invalid_credentials` o 400 | `current_invalid` |
| passo 3: `current_password_mismatch` | `current_invalid` |
| `weak_password` con `characters` fra i motivi | `weak_characters` |
| `weak_password` con altri motivi | `weak_length` |
| `same_password` | `same_password` |
| `AuthSessionMissingError`, 401, `session_not_found`, `refresh_token_not_found` | `session_expired` |
| 429, `over_request_rate_limit` | `rate_limited` |
| `AuthRetryableFetchError` o stato 0 | `network` |
| altro | `unknown` |

`pwned` non si attiva sul piano gratuito; se comparisse ricade in `weak_length`, che dice
comunque di sceglierne un'altra. Nel piano si valuta un messaggio generico «debole» al posto di
«troppo corta» per quel caso.

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
resta vuoto e `secure_password_change` resta `false`.

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
3. Lasciare spenti «Secure password change» (richiede email) e i requisiti sui caratteri.

Verifica dopo il passo: un cambio dalla app con password attuale corretta riesce; la
mappatura di `current_password_mismatch` è già coperta dai test.

## Test

**Unitari** (Vitest, senza rete):

- `passwordChange.test.ts`: campi vuoti, 7 e 8 caratteri, 72 e 73 byte, lettere accentate
  contate come un carattere, conferma diversa, nuova uguale
  all'attuale, più errori insieme, spazi conservati.
- `supabaseBackend.test.ts`, con client finti iniettati:
  - `changePasswordFailure` per ogni riga della tabella;
  - ordine dei passi (verifica, chiusura della prova, `updateUser` con `current_password`);
  - password attuale errata: nessun `updateUser`;
  - chiusura della prova fallita: il cambio prosegue;
  - nessuna sessione del dispositivo: `session_expired` senza chiamate;
  - **isolamento del client di prova**: `storageKey` diversa da `AUTH_STORAGE_KEY`, nessuna
    scrittura nell'archivio del dispositivo, nessun evento agli ascoltatori di `onChange` del
    dispositivo, nessun messaggio sul `BroadcastChannel` del dispositivo (con il client vero
    di supabase-js e `fetch` finto, non solo con i finti);
  - **passo 3 fallito**: archivio e `getSession` del dispositivo identici a prima, nessun
    `signOut`.
- `PasswordPage.test.tsx`, con `stubBackend`: errori per campo, pulsante disattivato offline e
  durante l'invio, esito riuscito con campi vuoti e messaggio, un messaggio per ogni esito,
  campi conservati dopo un errore, it-IT ed en-GB.
- `ProfilePage.test.tsx`: la riga c'è con Supabase e manca in modalità finta.

**Sullo stack locale**, in CI dopo la prova degli agenti, con il `changePassword` vero e un
utente creato per la prova (le iscrizioni locali sono accese):

- cambio riuscito: la nuova entra, la vecchia no, la sessione del dispositivo è ancora valida;
- password attuale errata → `current_invalid`, password invariata;
- password debole (6 caratteri, sotto il minimo locale di 8, chiamando il backend senza la
  validazione della SPA) → `weak_length`; uguale all'attuale → `same_password`;
- sessione scaduta: sessione del dispositivo chiusa altrove (righe di `auth.sessions`
  cancellate, l'access token resta firmato e non scaduto) → `session_expired`, password
  invariata;
- un secondo accesso web perde il refresh token dopo il cambio;
- **agenti**: un client OAuth registrato e autorizzato come nella prova degli agenti; dopo il
  cambio il suo access token è rifiutato da `/mcp` e il refresh token annullato. Se l'esito è
  diverso, si correggono avviso e decisioni;
- nessuna sessione di prova resta in `auth.sessions` dopo un cambio fallito al passo 3.

**Browser** con la skill agent-browser sullo stack locale: percorso completo a 390 px e su
desktop, screenshot degli stati (vuoto, errori, invio, riuscito, offline).

**Verifica finale:** `npm run typecheck`, `npm test`, `npm run build -w web`.

## Cosa uso e cosa produco

Uso: `AuthBackend` e `AuthProvider` (app web di base), `PageHeader`, `BackToProfile`,
`settings-card`, `field`, `useOnline`, `stubBackend`, la prova degli agenti
(`scripts/oauth/`). Produco: `changePassword` nell'interfaccia di autenticazione, la rotta
`/profile/password`, l'icona `lock`. Nessuna dipendenza nuova.

## Decisioni da riportare nella specifica

### Prodotto

- **Cambio della password dal Profilo** (issue #37), funzione permanente del traguardo A:
  password attuale, nuova di almeno 8 caratteri e conferma; esito ed errori tradotti; nessuna
  email. Sezione 7 (Account) e Parte 1 («Chi la usa» o «Cosa l'app non fa»).
- **Dopo il cambio si chiudono le altre sessioni**, dispositivi e agenti collegati (da
  confermare con la prova sullo stack locale), per comportamento di Supabase; il dispositivo
  resta dentro e la pagina avvisa prima della conferma. Sezioni 7 e 13 (accanto a
  «Chiudere le altre sessioni dal web chiude anche gli agenti»).
- **Passo facoltativo in dashboard** proposto all'utente: «Require current password» attivo e
  minimo 8 caratteri in produzione. Sezioni 1 (Supabase in produzione) e 15 («MCP»: candidata
  «password attuale richiesta per cambiarla» realizzabile con un'impostazione).

### Tecniche

- Verifica della password attuale nella SPA con un client di prova isolato
  (`signInWithPassword`, poi `signOut` locale), poi `updateUser` con `current_password` sulla
  sessione del dispositivo; il server la riverifica solo con l'opzione accesa, che la CLI non
  esprime in `config.toml`. Sezioni 1 e 7.
- Metodo `changePassword` di `AuthBackend` ed esiti tradotti. Sezione 1 («Copia e sessione sul
  dispositivo»).
- `minimum_password_length = 8` nello stack locale. Sezione 1.
- Prova sullo stack locale in CI del cambio e della chiusura delle sessioni, agenti compresi.
  Sezione 9.
- Registro: riga del 13 ottobre 2026 nella sezione 16 e stato nella sezione 10.
