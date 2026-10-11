# Collegamento degli agenti

Creato: 11 ottobre 2026
Attività: W2 dell'ondata 2, branch `traguardo/collegamento-agenti`
Stato: scritta dopo il brainstorming; in attesa della review di spec e piano.

Spec di dettaglio subordinata alla specifica principale
(`progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`): parte 1 «Usare l'app
attraverso il proprio agente», sezioni 1, 2, 7, 13, 15, 16 e 17, `design/percorsi.md`
(sesto giro) e il prototipo (`prototype/src/routes/authorize`,
`prototype/src/routes/profile/agents`). Rispetta le «Interfacce decise» del piano
generale e le regole comuni dell'ondata 2.

## Obiettivo e criteri di riuscita

Un membro della famiglia collega il proprio agente MCP (per primo Claude Code) seguendo la
pagina «Collega un agente» del Profilo, lo vede in «Agenti collegati» e lo scollega. Dopo
lo scollegamento i token di quell'agente non valgono più su MCP, RPC e REST.

- La pagina di consenso `/authorize` è vera: l'agente la apre nel browser, la persona
  accede se serve, vede chi chiede l'accesso e con quale account, consente o annulla.
- «Agenti collegati» elenca i client autorizzati dalla persona, con data del collegamento
  e ultimo accesso; «Scollega» revoca l'autorizzazione con effetto immediato.
- Elenco e scollegamento sono operazioni del contratto con il loro strumento MCP
  (`agents_list`, `agents_disconnect`).
- Testi in italiano e inglese britannico, veritieri sui poteri dell'agente.
- Nessuna dipendenza nuova: `@supabase/supabase-js` 2.117.3, già nel web, ha
  `auth.oauth.getAuthorizationDetails`, `approveAuthorization`, `denyAuthorization`,
  `listGrants` e `revokeGrant`.

## Perimetro

Dentro: pagina di consenso, pagina «Collega un agente» con le guide dei quattro client,
elenco e scollegamento (contratto, server, MCP, web), voce nel Profilo, funzione SQL di
lettura, configurazione locale del server OAuth, passi esterni per la produzione.

Fuori:

- limitare i poteri dei token d'agente su Supabase Auth (decisione dell'utente: rischio
  aperto, vedi «Rischi aperti»);
- verifica di Claude Desktop e ChatGPT sui client reali (sezione 15, prima del rilascio);
- consegna delle esportazioni via MCP, raggruppamento degli strumenti, ritentativi
  (sezione 15);
- revoca degli accessi alla cancellazione di un account (ondata 3, sezione 7): qui si
  registra solo che i token degli agenti seguono le sessioni.

## Prova della revoca (brainstorming, 11 ottobre 2026)

Richiesta dalla sezione 13 prima della spec. Eseguita in locale con lo stack Supabase
(CLI 2.120.0, immagine `gotrue v2.197.0`) con il server OAuth e la registrazione
dinamica attivi, il Worker vero (`wrangler dev`) e client registrati dinamicamente; il
consenso è passato dalle API che userà la pagina `/authorize`.

**Revoca:** `DELETE /auth/v1/user/oauth/grants?client_id=<A>` con il token web di Anna
(è ciò che fa `supabase.auth.oauth.revokeGrant`).

| Token | MCP | RPC | REST `/api` | Auth `/user` | PostgREST |
|---|---|---|---|---|---|
| Agente A di Anna, non scaduto, dopo la revoca | 401 `invalid_token` | `unauthorized` | 401 | 403 | 200 |
| Agente B di Anna, web di Anna, web di Bruno, agente A di Bruno | 200 | ok | 200 | 200 | 200 |

Esito:

- **La revoca è immediata con il controllo già presente.** Supabase cancella le sessioni
  di quel client per quell'utente (`auth.sessions` con `oauth_client_id`); il server
  verifica a ogni richiesta che la sessione esista (`app.session_is_active()` in
  `loadSession`, all'ingresso di MCP e nel percorso delle operazioni). Non serve un
  controllo del grant a ogni richiesta.
- Il refresh token di A è annullato (`refresh_token_not_found`); B continua a rinnovarsi.
- La revoca vale per la coppia (utente, client): lo stesso client autorizzato da Bruno
  resta valido.
- Ricollegare A dopo la revoca chiede di nuovo il consenso.
- PostgREST accetta il token revocato fino alla scadenza (1 ora), perché verifica solo la
  firma; espone però solo `public` e `graphql_public`, vuoti: nessun dato raggiungibile.
- Riautorizzare un client con grant attivo **non** mostra il consenso:
  `getAuthorizationDetails` restituisce subito `redirect_url`, Supabase crea una seconda
  sessione e quella vecchia (con il suo refresh token) resta valida.
- Annullare (`denyAuthorization`) restituisce al client `error=access_denied`.
- Chiudere le «altre sessioni» dal web (`logout?scope=others`) chiude anche gli agenti;
  l'uscita del web usa già `scope: 'local'` e non li tocca.
- `auth.sessions.updated_at` si aggiorna a ogni rinnovo del token dell'agente: dà
  l'ultimo accesso con una precisione di circa un'ora (durata dell'access token).

**Poteri di un token d'agente su Supabase Auth** (stessa prova): il token vale come
quello dell'utente su tutti gli endpoint di Supabase Auth. Può elencare e revocare i
grant, anche di altri agenti (204), modificare `user_metadata` (200), cambiare la password
senza conoscere quella attuale (200 con la configurazione di default), chiudere le altre
sessioni dell'utente, web compreso (204). Cambiare l'email richiede la conferma su
entrambe le caselle (`double_confirm_changes = true`). Non può cancellare l'account.

Limitare questi poteri non è possibile con il server OAuth di Supabase: offre solo gli
scope OIDC (`openid email profile phone offline_access`), che decidono i dati inviati
all'agente e non gli endpoint; non ci sono restrizioni per client; un *custom access token
hook* in Postgres che cambia `aud` dei token d'agente non cambia nulla, perché Supabase
Auth non controlla `aud` (provato: cambio password 200, revoca di un altro grant 204).
Le opzioni (richiedere la password attuale, server di autorizzazione nel Worker,
accettare) sono state presentate al coordinatore; l'utente ha scelto di accettare e
documentare per ora.

Codice della prova usa e getta, fuori dal repository; il piano ne ricava uno script di
verifica ripetibile (`scripts/oauth/revocation-check.mjs`, solo sullo stack locale).

## Scelte del brainstorming

| Tema | Scelta | Motivo |
|---|---|---|
| Scollegamento | `revokeGrant` di Supabase, nessun controllo aggiuntivo del grant | La prova mostra che il controllo della sessione già presente basta |
| Riautorizzazione dello stesso client | Comportamento di Supabase: nessun nuovo consenso finché il grant è attivo, sessione aggiunta; «Scollega» revoca tutte le sessioni del client | Decisione del coordinatore (domanda 1, opzione A); sostituire l'accesso richiederebbe scritture nello schema `auth` |
| Poteri dei token d'agente su Supabase Auth | Accettati e documentati, limitazione in un secondo momento | Decisione dell'utente (domanda 2, opzione C) |
| Elenco e scollegamento | Operazioni del contratto `agents.list` e `agents.disconnect` con strumento MCP, usate anche dal web | Parità MCP (sezione 13); un agente può già revocare grant con il proprio token, quindi `webOnly` non proteggerebbe nulla |
| Lettura dell'elenco | Funzione SQL `app.connected_agents()` su `auth.oauth_consents`, `auth.oauth_clients`, `auth.sessions` | `listGrants` di Supabase non dà l'ultimo accesso; la funzione legge le stesse tabelle in una query |
| Esecuzione dello scollegamento | Il server chiama `DELETE /auth/v1/user/oauth/grants` con il token di chi chiede | Via supportata da Supabase; scrivere nelle tabelle `auth` dal database è sconsigliato |
| Ultimo accesso | `max(auth.sessions.updated_at)` delle sessioni del client | Costo zero; precisione di circa un'ora, dichiarata |
| Nome del client | Quello registrato dall'agente (`client_name`), mostrato come «si presenta come» | La registrazione dinamica è aperta: il nome non è verificato |
| Istruzioni per i curatori | La pagina rimanda alle istruzioni che il servizio dà all'agente (`catalogue_getGuide`), senza riportarne il testo | Il web non ha l'area `catalogue`; il testo è per l'agente, in inglese |

## Contratto

Nuova area `agents` in `contract/src/agents/` (file `operations.ts`, `index.ts`), registrata
in `contract/src/contract.ts` e riesportata da `contract/src/index.ts`.

```ts
// contract/src/agents/operations.ts
export const connectedAgentSchema = z.object({
  /** OAuth client id assigned by Supabase (`auth.oauth_clients.id`). */
  clientId: z.uuid(),
  /** Name the client registered with; not verified. */
  name: z.string(),
  /** When the person first allowed this client (`auth.oauth_consents.granted_at`). */
  connectedAt: z.iso.datetime({ offset: true }),
  /** Last token issue or renewal of any session of the client; null without sessions. */
  lastUsedAt: z.iso.datetime({ offset: true }).nullable(),
  /** The caller is this client (MCP channel with the same `client_id`). */
  current: z.boolean(),
});
export type ConnectedAgent = z.infer<typeof connectedAgentSchema>;

export const agentsContract = {
  list: op({ mcp: { readOnly: true }, offline: false, role: 'user' })
    .route({ method: 'GET', path: '/agents', summary: 'Agents (MCP clients) you have connected to your account, most recently used first' })
    .input(z.object({}))
    .output(z.array(connectedAgentSchema)),
  disconnect: op({ mcp: { readOnly: false }, offline: false, role: 'user' })
    .route({ method: 'POST', path: '/agents/disconnect', summary: 'Disconnect an agent: its access ends at once, including this agent if it is the caller' })
    .input(z.object({ clientId: z.uuid() }))
    .output(z.object({ clientId: z.uuid() })),
};
```

- `list` non è una lettura versionata (niente `reads`): i dati cambiano in Supabase Auth,
  fuori dai contatori di versione. Ordine: `lastUsedAt` decrescente, `null` in fondo, poi
  `connectedAt` decrescente.
- `disconnect` è a stato assoluto e idempotente: un client senza grant attivo (già
  scollegato, mai collegato, di un altro utente) restituisce comunque `{ clientId }`.
  Non rivela se il client esiste.
- Errori: solo quelli comuni (`unauthorized`, `invalid`, `internal`).

## Server

Nuovi file in `server/src/agents/`: `router.ts`, `grants.ts`, test accanto.

```ts
// server/src/agents/grants.ts
/** Revokes the caller's grant to an OAuth client through Supabase Auth (204 or 404 both mean "not connected"). */
export async function revokeGrant(options: {
  supabaseUrl: string;
  publishableKey: string;
  accessToken: string;
  clientId: string;
  fetch?: typeof fetch;
}): Promise<void>;

// server/src/agents/router.ts
export function agentsRouter(os: Implementer): { list: …; disconnect: … };
```

- `list`: `select * from app.connected_agents()` nella transazione dell'utente; `current`
  confronta `clientId` con `context.clientId`.
- `disconnect`: `revokeGrant` con il token della richiesta (`context.token`) e la chiave
  pubblica del progetto (`apikey`, richiesta dal gateway di Supabase in produzione).
  Esiti: 204 o 404 `oauth_consent_not_found` → successo; 401/403 → `unauthorized`; altro,
  rete o timeout di 5 secondi → errore normalizzato `internal` (registrato senza il
  messaggio, come le altre chiamate esterne).
- Registrazione in `server/src/router.ts` (`agents: agentsRouter(os)`).
- `server/src/env.ts`: nuovo campo `SUPABASE_PUBLISHABLE_KEY: string`; valore in
  `server/wrangler.jsonc` (`vars`, valore pubblico) e in `server/.env.example` per lo
  sviluppo locale.

Nessun cambiamento a `auth.ts`, `mcp.ts`, `session.ts`, `well-known.ts`: verifica dei token,
canale `client_id`, controllo della sessione e metadati di scoperta restano quelli della
piattaforma. Un agente scollegato riceve 401 con `WWW-Authenticate` e il client riparte
dall'autorizzazione.

## Database

Nuova migrazione `supabase/migrations/20261011200000_connected_agents.sql`, solo una
funzione; nessuna tabella o colonna nuova o cambiata.

```sql
-- Agents the caller has allowed: active grants, with the last token issue or renewal.
create function app.connected_agents()
returns table (client_id uuid, name text, connected_at timestamptz, last_used_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.client_id, coalesce(oc.client_name, ''), c.granted_at, max(s.updated_at)
  from auth.oauth_consents c
  join auth.oauth_clients oc on oc.id = c.client_id
  left join auth.sessions s on s.user_id = c.user_id and s.oauth_client_id = c.client_id
    and (s.not_after is null or s.not_after > now())
  where c.user_id = auth.uid() and c.revoked_at is null and oc.deleted_at is null
  group by c.client_id, oc.client_name, c.granted_at
$$;
revoke execute on function app.connected_agents() from public;
grant execute on function app.connected_agents() to authenticated;
```

Colonne verificate sullo schema locale (`gotrue v2.197.0`): `auth.oauth_clients(id,
client_name, deleted_at, …)`, `auth.oauth_consents(user_id, client_id, granted_at,
revoked_at)`, `auth.sessions(user_id, oauth_client_id, updated_at, not_after)`. La
funzione non restituisce mai righe di altri utenti.

Test pgTAP `supabase/tests/connected_agents_test.sql`: righe solo dell'utente corrente,
grant revocati esclusi, ultimo accesso dal massimo delle sessioni del client, `null` senza
sessioni, `execute` negato ad `anon`. Aggiornamento di `coverage_test.sql` se elenca le
funzioni.

La tabella `agent_authorizations` prevista per l'ondata 3 (piano generale, «Tabelle
dell'ondata 3») non serve: le autorizzazioni vivono in Supabase Auth.

## Web

Struttura: `web/src/features/agents/` (`AgentsPage.tsx`, `AuthorizePage.tsx`,
`clientGuides.ts`, `CopyField.tsx`, `ClientGuide.tsx`, CSS e test accanto) e
`web/src/i18n/messages/agents.ts`. `CopyField` e `ClientGuide` sono i componenti del
prototipo (sesto giro), riscritti in React con i token di `design/design.md`.

File condivisi toccati per registrare l'area: `web/src/router.tsx` (due rotte),
`web/src/api/types.ts` (`agents` in `SERVER_AREAS`), `web/src/api/fake/fakeApi.ts`
(agenti dimostrativi), `web/src/i18n/messages/index.ts`, `web/src/auth/backend.ts` e
`supabaseBackend.ts` (metodi del consenso), `web/src/routes/ProfilePage.tsx` (voce del
Profilo, area già mia).

### Pagina di consenso `/authorize`

Rotta figlia della radice, senza navbar. L'URL arriva da Supabase:
`<Site URL>/authorize?authorization_id=…`.

- Senza sessione: redirect a `/login?redirect=<url completo>` (stesso meccanismo delle
  rotte protette); dopo l'accesso si torna qui.
- Sessione non verificabile (offline): avviso che serve la connessione, nessun pulsante.
- `authorization_id` mancante, scaduto o già usato: «Richiesta non valida o scaduta.
  Riprova dall'agente.»
- `getAuthorizationDetails` con `redirect_url` (grant già attivo): la pagina mostra
  «Torno a {client}…» e va subito all'URL.
- Altrimenti la schermata del sesto giro:
  - titolo «{client} vuole usare Cosa si mangia con il tuo account»; sotto, in piccolo,
    «È il nome con cui l'agente si presenta.»;
  - riquadro account con nome ed email e «Non sei tu? Cambia account» (uscita locale, poi
    login con ritorno qui);
  - «Cosa potrà fare»: «Agirà con il tuo account, come se fossi tu: per esempio leggere e
    cambiare il menu, la spesa e la famiglia» più, secondo i ruoli globali del profilo,
    «e gestire il ricettario» (curatore) e «e amministrare l'app» (amministratore);
  - «Eliminare una famiglia resta possibile solo nell'app.»;
  - «Puoi bloccarlo quando vuoi: Profilo › Collega un agente › Scollega.»;
  - «Consenti» (primario) e «Annulla».
- Consenti → `approveAuthorization(id, { skipBrowserRedirect: true })` e navigazione a
  `redirect_url` (pagina di ritorno del client). Annulla → `denyAuthorization` allo stesso
  modo. Durante l'attesa i pulsanti sono disabilitati; un errore mostra il testo comune e
  lascia riprovare.

Interfaccia nuova di `AuthBackend` (fake e Supabase):

```ts
export type AgentAuthorization =
  | { kind: 'consent'; id: string; clientName: string }
  | { kind: 'redirect'; url: string; clientName: string | null };
export type AuthorizationFailure = 'not_found' | 'network' | 'unknown';

interface AuthBackend {
  // …existing members
  getAuthorization(id: string): Promise<{ ok: true; value: AgentAuthorization } | { ok: false; reason: AuthorizationFailure }>;
  decideAuthorization(id: string, decision: 'approve' | 'deny'): Promise<{ ok: true; url: string } | { ok: false; reason: AuthorizationFailure }>;
}
```

In modalità finta `getAuthorization` restituisce una richiesta dimostrativa di «Claude
Code» e `decideAuthorization` porta a `/profile/agents`, così la schermata si prova anche
senza Supabase.

### Pagina «Collega un agente» `/profile/agents`

Rotta dentro il layout dell'app. Ordine del sesto giro, senza paragrafo introduttivo:

1. **Indirizzo del servizio**: `${location.origin}/mcp` con «Copia».
2. **Il tuo agente**: Claude Code, Codex CLI, Claude Desktop e ChatGPT a fisarmonica, con
   passaggi numerati e comandi da copiare (nome del servizio `cosasimangia`):
   - Claude Code: `claude mcp add --transport http --scope user cosasimangia <url>`, poi
     `/mcp` › Authenticate;
   - Codex CLI: `codex mcp add cosasimangia --url <url>` (il login parte da solo; altrimenti
     `codex mcp login cosasimangia`);
   - Claude Desktop: connettore personalizzato con l'URL;
   - ChatGPT: connettore in modalità sviluppatore con l'URL.

   Claude Code e Codex CLI sono verificati l'11 ottobre 2026 (`spike/REPORT.md`) e si
   ricontrollano con Context7 nell'implementazione; Claude Desktop e ChatGPT portano la
   nota «Passaggi non ancora provati con questo servizio.» finché la verifica della sezione
   15 non è fatta.
3. **Accesso**: «Al primo uso l'agente apre il browser: accedi a Cosa si mangia e consenti
   l'accesso. Da quel momento l'agente agisce con il tuo account, finché non lo scolleghi
   qui sotto.»
4. **Prova il collegamento**: esempi da chiedere («Cosa mangiamo stasera?», «Aggiungi il
   latte alla lista della spesa di questa settimana.»); per i curatori l'esempio del
   ricettario e la frase «Le istruzioni sugli ingredienti l'agente le legge dal servizio.»;
   nota sull'eliminazione delle famiglie solo nell'app.
5. **Agenti collegati**: una riga per client con nome, «Collegato il {data}» e, se c'è,
   «ultimo accesso {quando}» («oggi alle 14:05», altrimenti data e ora); `current` non si
   mostra sul web. «Scollega» apre il foglio di conferma: «{client} non potrà
   più usare l'app con il tuo account finché non lo autorizzi di nuovo. Per toglierlo anche
   dal client: {istruzioni del client}». Conferma → `agents.disconnect`, poi rilettura
   dell'elenco (niente aggiornamento ottimistico) e avviso «{client} scollegato.».
   Offline: pulsanti disabilitati. Elenco vuoto: «Nessun agente collegato.».

Le istruzioni per togliere il servizio dal client si scelgono dal nome registrato quando
contiene «Claude Code», «Codex», «Claude» o «ChatGPT»; altrimenti un testo generico.

### Voce nel Profilo

Nella sezione «Account», sotto «Account e preferenze»: «Collega un agente» con
sottotitolo «{n} agenti collegati» / «1 agente collegato» oppure «Claude, ChatGPT o Codex
con MCP» senza agenti (lettura `agents.list`).

## Configurazione locale

`supabase/config.toml` (file condiviso, modifica dichiarata):

- `[auth] site_url = "http://127.0.0.1:5174"` (il Vite di sviluppo, dove vive `/authorize`)
  e `http://127.0.0.1:8787` in `additional_redirect_urls`;
- `[auth.oauth_server] enabled = true`, `authorization_url_path = "/authorize"`,
  `allow_dynamic_registration = true`.

`supabase/README.md` e `server/README.md`: come collegare Claude Code allo stack locale
(Worker su 8787 per `/mcp`, consenso sul Vite 5174) e il rimando a
`progetto/coordinamento/messaggi/w2-podman.md` per l'errore di Podman.

## Passi esterni per la produzione (li fa l'utente)

Progetto Supabase `lronuqvtjdhfyychnscr`; da chiedere con `STATO: DOMANDA` quando
l'implementazione è pronta per la prova sul Worker pubblicato. Nessuna modifica diretta
da parte degli agenti.

1. Dashboard › Authentication › OAuth Server: **Enable OAuth server**; *Authorization
   path* `/authorize`; **Allow dynamic client registration** attivo; salvare.
2. Dashboard › Authentication › URL Configuration: *Site URL* uguale all'origine pubblica
   dell'app (`https://cosasimangia.qunidi.it`, o l'URL `workers.dev` finché il dominio
   non è attivo); in *Redirect URLs* la stessa origine con `/**`.
3. Dashboard › Project Settings › API Keys: copiare la **Publishable key** e passarla al
   coordinatore per `SUPABASE_PUBLISHABLE_KEY` in `server/wrangler.jsonc` (valore
   pubblico).
4. Nessuna registrazione manuale di client: Claude Code e Codex CLI si registrano da soli
   (registrazione dinamica).
5. Prova sul Worker pubblicato: collegare Claude Code con i comandi della pagina,
   chiedere «chi sono?» (`session_whoami` → canale `mcp`), scollegarlo dall'app, verificare
   che la richiesta successiva chieda di nuovo l'accesso.

## Rischi aperti

- **Poteri dei token d'agente su Supabase Auth** (decisione dell'utente dell'11 ottobre:
  documentare ora, limitare in un secondo momento). Un agente collegato può, con il
  proprio token e senza passare dal Worker: cambiare la password dell'account senza
  conoscere quella attuale, e mantenere così l'accesso web anche dopo «Scollega»;
  revocare gli altri agenti; chiudere le sessioni web; modificare `user_metadata`.
  Cambiare l'email richiede la conferma su entrambe le caselle. Mitigazioni possibili
  quando si deciderà: richiedere la password attuale per cambiarla
  (`security_update_password_require_current_password`, non impostabile da
  `config.toml`), oppure un server di autorizzazione nel Worker. I testi dell'app non
  promettono limiti che non esistono.
- **Sessioni multiple dello stesso client:** riautorizzare aggiunge sessioni che restano
  valide fino a «Scollega» (o fino a quando l'agente smette di rinnovarle).
- **PostgREST** accetta un token revocato fino alla scadenza: innocuo finché `public` e
  `graphql_public` restano vuoti (vincolo da mantenere; disattivare la Data API resta un
  passo remoto a parte, piano generale).
- **Lettura delle tabelle `auth`** da una funzione `security definer`: funziona in locale
  come `app.session_is_active()`; va riverificata sul progetto dopo l'applicazione della
  migrazione (tabelle `oauth_*` di proprietà di `supabase_auth_admin`).
- **Nome del client non verificato:** un client può registrarsi con un nome qualunque;
  la schermata lo dice.

## Test

- Contratto: metadati delle due operazioni (MCP, ruolo, non offline), forma degli output.
- Server (Vitest, Postgres locale): `agents.list` con righe inserite nelle tabelle `auth`
  del database di test (solo dell'utente, `current` dal `client_id` del token, ordine);
  `agents.disconnect` con `fetch` finto: richiesta con token e `apikey`, 204 e 404 →
  successo, 401 → `unauthorized`, 500 e timeout → `internal`; strumenti `agents_list` e
  `agents_disconnect` presenti in MCP.
- pgTAP: `connected_agents_test.sql` (sopra).
- Web (Vitest e Testing Library): consenso nei suoi stati (senza sessione, richiesta non
  valida, redirect immediato, consenso con ruoli, consenti, annulla, errore di rete,
  offline); pagina agenti (copia, fisarmonica, elenco, conferma, scollegamento con
  rilettura, offline, vuoto); voce del Profilo con il conteggio.
- Verifica end-to-end ripetibile in locale: `scripts/oauth/revocation-check.mjs` contro
  lo stack locale e `wrangler dev` (registrazione dinamica, consenso via API, due client,
  revoca, controllo di MCP, RPC e REST, rinnovo rifiutato), più una prova manuale con
  Claude Code vero collegato al Worker locale.
- Prova visiva con agent-browser sulle due pagine (iPhone, porta 8767).

## Cosa uso e cosa produco

Uso (da `main`): `verifyAccessToken`, `channelOf`, `loadSession` e il percorso delle
operazioni (`createImplementer`, `context.token`, `context.clientId`), `createApp` con
`/mcp` e i metadati di scoperta, `collectTools` (gli strumenti nascono dal contratto), il
client oRPC del web e le sue `queryOptions`, `useAreaMutation`, `AuthBackend`,
`BottomSheet`, `PageHeader`, `Icon`, `useOnline`, `useProfile`, i dizionari per area.

Produco: area `agents` del contratto (`agentsContract`, `connectedAgentSchema`,
`ConnectedAgent`); `agentsRouter` e `revokeGrant` nel server; campo
`SUPABASE_PUBLISHABLE_KEY` di `Env`; funzione `app.connected_agents()`; metodi
`getAuthorization` e `decideAuthorization` di `AuthBackend`; rotte web `/authorize` e
`/profile/agents`; componenti `CopyField` e `ClientGuide`; configurazione locale del
server OAuth.

## Decisioni da riportare nella specifica

### Prodotto

- **Riautorizzazione dello stesso client** (sezione 13, «Schermata di autorizzazione»):
  sostituisce «Autorizzare di nuovo lo stesso client sostituisce l'accesso precedente»
  con: finché l'agente è collegato, autorizzarlo di nuovo non chiede un altro consenso e
  aggiunge un accesso; «Agenti collegati» mostra una riga per client; «Scollega» revoca
  tutti i suoi accessi. Decisione del coordinatore, 11 ottobre 2026.
- **Testi veritieri sui poteri dell'agente** (sezione 13, schermata di autorizzazione e
  pagina di istruzioni; parte 1 «Usare l'app attraverso il proprio agente»): la schermata
  dice che l'agente agisce con l'account della persona, che eliminare una famiglia resta
  solo nell'app e che «Scollega» lo blocca; tolto «vedere le credenziali» da ciò che
  l'agente non può fare. Decisione dell'utente, 11 ottobre 2026.
- **Ultimo accesso** al posto di «ultimo uso» negli agenti collegati (sezione 13; chiude
  la voce «ultimo uso degli agenti» della sezione 15): rinnovo più recente del token,
  precisione di circa un'ora.
- **Nome dell'agente** mostrato come quello con cui si presenta (sezione 13).
- **Istruzioni per i curatori** nella pagina: rimando alle istruzioni servite
  all'agente, senza il testo (sezione 13, che lo consente già: «rimanda alle istruzioni
  scritte»; diverge dal prototipo, che lo mostrava).

### Tecniche

- **Revoca verificata l'11 ottobre 2026** (sezioni 1, 13, 15 e 17): `revokeGrant` cancella
  le sessioni del client per quell'utente; il controllo della sessione a ogni richiesta
  rende inutilizzabile subito l'access token non scaduto su MCP, RPC e REST, con gli altri
  client e il web attivi; refresh token annullato; PostgREST lo accetta fino alla
  scadenza senza dati raggiungibili. Chiude «revoca dei grant di un client» nella sezione
  15 e la verifica della sezione 17 per la parte agenti.
- **Elenco e scollegamento come operazioni del contratto** `agents.list` e
  `agents.disconnect` con strumenti MCP (sezione 13, tabella «Accesso e contesto»): lo
  scollegamento passa da Supabase Auth con il token di chi chiede; nuova variabile del
  Worker `SUPABASE_PUBLISHABLE_KEY` (sezione 1).
- **Funzione `app.connected_agents()`** sulle tabelle `auth` (sezione 2); la tabella
  `agent_authorizations` dell'ondata 3 non serve (piano generale, «Tabelle dell'ondata 3»).
- **Rischio aperto sui poteri dei token d'agente** (sezioni 13 e 17): un token d'agente
  vale come quello dell'utente su Supabase Auth (password senza quella attuale, grant di
  altri agenti, chiusura delle sessioni, metadati); il server OAuth di Supabase non lo
  permette di limitare (solo scope OIDC, `aud` ignorato da Supabase Auth, provato con un
  hook). Decisione dell'utente dell'11 ottobre 2026: documentare ora, limitare in un
  secondo momento; mitigazioni candidate: password attuale richiesta per cambiarla,
  server di autorizzazione nel Worker.
- **Configurazione del server OAuth** (sezione 1): percorso di autorizzazione
  `/authorize`, registrazione dinamica attiva, Site URL sull'origine dell'app; in locale
  in `supabase/config.toml`.
