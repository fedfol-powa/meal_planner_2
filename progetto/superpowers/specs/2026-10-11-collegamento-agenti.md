# Collegamento degli agenti

Creato: 11 ottobre 2026
Attività: W2 dell'ondata 2, branch `traguardo/collegamento-agenti`
Stato: corretta dopo la review di spec e piano (rilievi in
`progetto/coordinamento/revisioni/w2-agenti-spec-piano.md`, decisioni del coordinatore in
`progetto/coordinamento/messaggi/w2-agenti-01-review-spec.md`); in attesa della seconda review.

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
  e ultimo rinnovo dell'accesso; «Scollega» revoca l'autorizzazione e le sessioni di quel
  client con effetto immediato.
- Elenco e scollegamento sono operazioni del contratto con il loro strumento MCP
  (`agents_list`, `agents_disconnect`).
- Testi in italiano e inglese britannico, veritieri sui poteri dell'agente: dicono che
  agisce con l'account della persona, che può anche cambiare la password e chiudere le
  sessioni, e che «Scollega» revoca l'autorizzazione e le sessioni di quell'agente, non
  accessi ottenuti in altro modo.
- Il percorso reale (token veri del server OAuth locale, Worker vero, scollegamento con
  `agents.disconnect`) è provato in CI a ogni PR.
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
- `auth.sessions.updated_at` si aggiorna all'emissione e a ogni rinnovo del token
  dell'agente. Misura il rinnovo, non l'uso: un client può rinnovare senza fare
  operazioni, o usare un token per un'ora senza rinnovarlo. Da qui «Ultimo rinnovo
  dell'accesso» (decisione del coordinatore dopo la review).

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
| Lettura dell'elenco | Funzione SQL `app.connected_agents()` su `auth.oauth_consents`, `auth.oauth_clients`, `auth.sessions` | `listGrants` di Supabase non dà l'ultimo rinnovo; la funzione legge le stesse tabelle in una query |
| Esecuzione dello scollegamento | Il server chiama `DELETE /auth/v1/user/oauth/grants` con il token di chi chiede | Via supportata da Supabase; scrivere nelle tabelle `auth` dal database è sconsigliato |
| Ultimo rinnovo dell'accesso | `max(auth.sessions.updated_at)` delle sessioni del client, chiamato «Ultimo rinnovo dell'accesso» con una riga che spiega cosa misura | Costo zero, nessuna registrazione aggiuntiva; non è l'ultimo uso e non lo dice (decisione del coordinatore, rilievo 10) |
| Testi sui poteri | Consenso e conferma di «Scollega» dicono che l'agente agisce con l'account, che può cambiare la password e chiudere le sessioni, e che «Scollega» non chiude accessi ottenuti in altro modo | Decisione del coordinatore dopo la review (rilievo 1): niente promesse di blocco totale |
| Indirizzo MCP mostrato | Origine della pagina; sul Vite di sviluppo l'origine del Worker a cui Vite inoltra `/api` | In produzione SPA e MCP stanno sullo stesso Worker; in sviluppo no (rilievo 9) |
| Confini delle PR | Una sola PR | Contratto e gestori insieme; ogni controllo di `main` passa; la prova finale con Claude Code vero usa server e web insieme |
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
  /**
   * Last token issue or renewal of any live session of the client; null without sessions.
   * Not the last use: a client may renew without calling the app, or call it without renewing.
   */
  lastRenewedAt: z.iso.datetime({ offset: true }).nullable(),
  /** The caller is this client (MCP channel with the same `client_id`). */
  current: z.boolean(),
});
export type ConnectedAgent = z.infer<typeof connectedAgentSchema>;

export const agentsContract = {
  list: op({ mcp: { readOnly: true }, offline: false, role: 'user' })
    .route({ method: 'GET', path: '/agents', summary: 'Agents (MCP clients) you have connected to your account, with the last renewal of their access (not their last use), most recently renewed first' })
    .input(z.object({}))
    .output(z.array(connectedAgentSchema)),
  disconnect: op({ mcp: { readOnly: false }, offline: false, role: 'user' })
    .route({ method: 'POST', path: '/agents/disconnect', summary: 'Disconnect an agent: revokes its authorisation and ends its sessions at once, including this agent if it is the caller. Access obtained otherwise (for example with a changed password) is not affected' })
    .input(z.object({ clientId: z.uuid() }))
    .output(z.object({ clientId: z.uuid() })),
};
```

- `list` non è una lettura versionata (niente `reads`): i dati cambiano in Supabase Auth,
  fuori dai contatori di versione. Ordine: `lastRenewedAt` decrescente, `null` in fondo,
  poi `connectedAt` decrescente.
- `disconnect` è a stato assoluto e idempotente: un client senza grant attivo (già
  scollegato, mai collegato, di un altro utente) restituisce comunque `{ clientId }`.
  Non rivela se il client esiste.
- Errori: solo quelli comuni (`unauthorized`, `invalid`, `internal`).

## Server

Nuovi file in `server/src/agents/`: `router.ts`, `grants.ts`, test accanto.

```ts
// server/src/agents/grants.ts
/** Revokes the caller's grant to an OAuth client through Supabase Auth (204, or 404 with error_code oauth_consent_not_found, mean "not connected"). */
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
  Esiti: 204, oppure 404 con corpo JSON il cui `error_code` è `oauth_consent_not_found`
  (nessun grant attivo) → successo; 401/403 → `unauthorized`; qualunque altro 404 (corpo
  HTML, JSON malformato, codice diverso, endpoint assente), altri stati, rete o timeout di
  5 secondi → errore normalizzato `internal` (registrato senza il messaggio, come le altre
  chiamate esterne). Mai «scollegato» senza la conferma di Supabase. Se la revoca fallisce
  le sessioni dell'agente restano e i suoi token continuano a valere: l'elenco lo mostra
  ancora.
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
returns table (client_id uuid, name text, connected_at timestamptz, last_renewed_at timestamptz)
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
grant revocati esclusi, ultimo rinnovo dal massimo delle sessioni vive del client, `null` senza
sessioni, `execute` negato ad `anon`. Aggiornamento di `coverage_test.sql` se elenca le
funzioni.

La tabella `agent_authorizations` prevista per l'ondata 3 (piano generale, «Tabelle
dell'ondata 3») non serve: le autorizzazioni vivono in Supabase Auth.

## Web

Struttura: `web/src/features/agents/` (`AgentsPage.tsx`, `AuthorizePage.tsx`,
`clientGuides.ts`, `CopyField.tsx`, `ClientGuide.tsx`, `scopes.ts`, CSS e test accanto) e
`web/src/i18n/messages/agents.ts`. `CopyField` e `ClientGuide` sono i componenti del
prototipo (sesto giro), riscritti in React con i token di `design/design.md`.

File condivisi toccati per registrare l'area: `web/src/router.tsx` (due rotte),
`web/src/api/types.ts` (`agents` in `SERVER_AREAS`), `web/src/api/fake/fakeApi.ts`
(agenti dimostrativi), `web/src/i18n/messages/index.ts`, `web/src/auth/backend.ts` e
`supabaseBackend.ts` (metodi del consenso), `web/src/test/stubBackend.ts` e
`web/src/test/renderApp.tsx` (opzione `channel` per i test fra schede), `web/vite.config.ts`,
`web/src/vite-env.d.ts` ed `web/src/env.ts` (origine del servizio in sviluppo),
`web/src/routes/ProfilePage.tsx` (voce del Profilo, area già mia),
`web/src/components/Icon.tsx` (icona `link`).

### Pagina di consenso `/authorize`

Rotta figlia della radice, senza navbar. L'URL arriva da Supabase:
`<Site URL>/authorize?authorization_id=…`.

- Senza sessione: redirect a `/login?redirect=<url completo>` (stesso meccanismo delle
  rotte protette); dopo l'accesso si torna qui.
- Sessione non verificabile (offline): avviso che serve la connessione, nessun pulsante.
- `authorization_id` mancante, scaduto o già usato: «Richiesta non valida o scaduta.
  Riprova dall'agente.»
- `getAuthorizationDetails` con `redirect_url` (grant già attivo): la pagina mostra
  «Torno all'agente…» e va subito all'URL.
- Altrimenti la schermata del sesto giro, con i testi decisi dopo la review:
  - titolo «{client} vuole usare Cosa si mangia con il tuo account»; sotto, in piccolo,
    «È il nome con cui l'agente si presenta: non è verificato.»;
  - riquadro account con nome ed email e «Non sei tu? Cambia account»;
  - «Cosa potrà fare»: «Agirà con il tuo account, come se fossi tu: per esempio leggere e
    cambiare il menu, la spesa e la famiglia.» più, secondo i ruoli globali del profilo,
    «Potrà anche gestire il ricettario.» (curatore) e «Potrà anche amministrare l'app.»
    (amministratore); poi «Potrà anche cambiare la password del tuo account e chiudere le
    tue sessioni, anche nel browser e degli altri agenti. Consenti solo agli agenti di cui
    ti fidi.»; «Eliminare una famiglia resta possibile solo nell'app.»;
  - «Dati che riceverà»: gli scope richiesti, ciascuno con la sua frase (`openid` «un
    identificativo del tuo account», `email` «il tuo indirizzo email», `profile` «il nome
    del tuo profilo di accesso», `phone` «il numero di telefono, se c'è»,
    `offline_access` «restare collegato senza chiederti di nuovo l'accesso»; uno scope
    sconosciuto si mostra così com'è). Sotto: «Riguardano i dati che l'agente riceve
    all'accesso, non ciò che può fare.»;
  - «Dettagli dell'agente» (chiuso di default): identificativo del client e pagina di
    ritorno forniti da Supabase, per distinguere agenti con lo stesso nome;
  - «Scollega»: «Puoi scollegarlo da Profilo › Collega un agente: revoca questa
    autorizzazione e le sessioni dell'agente. Non chiude accessi ottenuti in altro modo:
    se l'agente ha cambiato la password, cambiala.»;
  - «Consenti» (primario) e «Annulla».
- «Consenti» è attivo solo quando il profilo dell'identità corrente è letto (ruoli noti).
  Profilo in caricamento: la sezione «Cosa potrà fare» mostra il caricamento e «Consenti»
  resta disabilitato; profilo in errore: errore comune con «Riprova» (rilettura del
  profilo), «Consenti» disabilitato, «Annulla» disponibile.
- Consenti → `approveAuthorization(id, { skipBrowserRedirect: true })` e navigazione a
  `redirect_url` (pagina di ritorno del client). Annulla → `denyAuthorization` allo stesso
  modo. Durante l'attesa i pulsanti sono disabilitati; un errore mostra il testo comune e
  lascia riprovare.
- **Generazioni.** Ogni coppia (utente, `authorization_id`) è una generazione: lettura
  della richiesta e decisione appartengono a quella in cui sono partite. Uscita dalla
  pagina, cambio account, cambio della richiesta e un nuovo caricamento la chiudono.
  Prima di aggiornare lo stato o di navigare, ogni risposta controlla che la sua
  generazione sia ancora quella corrente; altrimenti viene ignorata. Così una risposta
  arrivata tardi non manda il browser al callback di una richiesta abbandonata e due
  caricamenti sovrapposti non si sovrascrivono.
- **Cambia account** usa la chiusura comune della sessione (`useSignOut()` di
  `SessionScope`, come «Esci»): chiude subito l'identità locale, cancella i dati della
  persona (compresa la coda della spesa) e avvisa le altre schede prima della chiamata a
  Supabase, anche se questa fallisce. Lo stato `signedOut` fa scattare la guardia della
  rotta, che porta a `/login?redirect=<url della richiesta>`: chi accede dopo torna alla
  stessa richiesta con il proprio account.
- Il nome del client e gli altri dati di Supabase sono testo semplice (React li inserisce
  come testo; nomi lunghi vanno a capo).

Interfaccia nuova di `AuthBackend` (fake e Supabase):

```ts
export type AgentAuthorization =
  | {
      kind: 'consent';
      id: string;
      /** Name the client registered with; not verified. */
      clientName: string;
      /** OAuth client id and registered return page, to tell same-named clients apart. */
      clientId: string;
      redirectUri: string;
      /** Requested scopes (OIDC): data sent to the agent, not limits on what it can do. */
      scopes: string[];
    }
  | { kind: 'redirect'; url: string };
export type AuthorizationFailure = 'not_found' | 'network' | 'unknown';
export type AuthorizationResult<T> = { ok: true; value: T } | { ok: false; reason: AuthorizationFailure };

interface AuthBackend {
  // …existing members
  getAuthorization(id: string): Promise<AuthorizationResult<AgentAuthorization>>;
  decideAuthorization(id: string, decision: 'approve' | 'deny'): Promise<AuthorizationResult<string>>;
}
```

In modalità finta `getAuthorization` restituisce una richiesta dimostrativa di «Claude
Code» e `decideAuthorization` porta a `/profile/agents`, così la schermata si prova anche
senza Supabase.

### Pagina «Collega un agente» `/profile/agents`

Rotta dentro il layout dell'app. Ordine del sesto giro, senza paragrafo introduttivo:

1. **Indirizzo del servizio**: `${serviceOrigin}/mcp` con «Copia». `serviceOrigin` è
   l'origine della pagina (in produzione il Worker serve SPA, `/mcp` e i metadati di
   scoperta); sul Vite di sviluppo, che inoltra solo `/api`, è l'origine del Worker a cui
   inoltra (`VITE_API_TARGET`, default `http://localhost:8787`), fissata da
   `vite.config.ts` solo in modalità `development`.
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
   l'accesso. Da quel momento l'agente agisce con il tuo account e può anche cambiare la
   password e chiudere le tue sessioni. «Scollega» qui sotto revoca la sua autorizzazione
   e le sue sessioni.»
4. **Prova il collegamento**: esempi da chiedere («Cosa mangiamo stasera?», «Aggiungi il
   latte alla lista della spesa di questa settimana.»); per i curatori l'esempio del
   ricettario e la frase «Le istruzioni sugli ingredienti l'agente le legge dal servizio.»;
   nota sull'eliminazione delle famiglie solo nell'app.
5. **Agenti collegati**: una riga per client con nome, «Collegato il {data}» e, se c'è,
   «ultimo rinnovo dell'accesso {quando}» («oggi alle 14:05», altrimenti data e ora); sotto
   l'elenco la riga «L'ultimo rinnovo è l'ultima volta che l'agente ha rinnovato il suo
   accesso: non dice quando ha usato l'app.»; `current` non si mostra sul web. «Scollega»
   apre il foglio di conferma: «Revoca l'autorizzazione di {client} e chiude le sue
   sessioni: da subito non potrà più usare l'app con questo collegamento. Non chiude
   accessi ottenuti in altro modo: se l'agente ha cambiato la password, cambiala. Per
   toglierlo anche dal client: {istruzioni del client}». Conferma → `agents.disconnect`,
   poi rilettura dell'elenco (niente aggiornamento ottimistico) e avviso «{client}
   scollegato.». Errore: il foglio resta aperto con il testo comune, l'agente resta
   nell'elenco. Offline: pulsanti disabilitati. Elenco vuoto: «Nessun agente collegato.».

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

`web/vite.config.ts`: costante `__SERVICE_ORIGIN__` (origine di `VITE_API_TARGET` in
modalità `development`, `null` altrimenti), letta da `env.serviceOrigin()`.

`supabase/README.md` e `server/README.md`: come collegare Claude Code allo stack locale
(indirizzo e comando copiati dalla pagina sul Vite 5174, che puntano al Worker; consenso
sul Vite 5174), la prova end-to-end e il rimando a
`progetto/coordinamento/messaggi/w2-podman.md` per l'errore di Podman.

## Prova end-to-end in CI

`.github/workflows/ci.yml` (modifica mia, minima, dichiarata nella PR; nessuna credenziale
di produzione): il job `check` avvia lo stack locale con Auth (`supabase start` con i
servizi non necessari esclusi, al posto di `supabase db start`), e dopo i test esegue
`scripts/oauth/agents-e2e.sh`: build del web, `server/.env` per lo stack locale (utente
`app_server`, URL e chiave pubblica da `supabase status`), `wrangler dev` sulla 8787,
attesa che risponda, poi `node scripts/oauth/agents-e2e.mjs`. Se il tempo del job cresce
di oltre qualche minuto, la prova passa in un job separato ma obbligatorio.

Lo script usa solo client registrati dinamicamente e i due utenti del seed, rifiuta URL
non locali, e verifica:

- **Flusso e confini OAuth** (responsabilità di Supabase: si prova l'integrazione, non si
  duplica nel Worker): `authorize` porta alla Site URL con `/authorize?authorization_id=…`;
  `state` torna invariato con il codice e con `error=access_denied` dopo l'annullamento;
  `code_verifier` errato rifiutato; codice già usato rifiutato; `redirect_uri` non
  registrato rifiutato senza redirect verso di esso; codice di un client scambiato con un
  altro `client_id` rifiutato; richiesta scaduta (scadenza forzata nel database locale)
  rifiutata da `getAuthorizationDetails`.
- **Canale**: i token reali portano `client_id` anche dopo il rinnovo; con il token
  d'agente `session.whoami` risponde `channel: 'mcp'` su MCP, RPC e REST (prima e dopo il
  rinnovo), con il token web `channel: 'web'`. Il controllo `webOnly` della pipeline
  dipende solo dal canale ed è già provato dai test della piattaforma: nel contratto
  attuale non c'è un'operazione `webOnly` da chiamare.
- **Scollegamento tramite `agents.disconnect`**, mai con il DELETE diretto: Anna collega
  gli agenti A e B; Bruno collega A. A è autorizzato due volte da Anna (seconda volta
  senza consenso, seconda sessione). `agents.list` di Anna mostra A una volta, con
  l'ultimo rinnovo. Anna scollega A dal web (RPC): entrambi gli access token e entrambi i
  refresh token di A per Anna non valgono più (MCP 401 con `WWW-Authenticate`, RPC e REST
  401, rinnovo rifiutato); B, la sessione web di Anna e A di Bruno continuano (MCP con il
  corpo controllato: risultato senza `isError` e canale `mcp`). Ricollegare A chiede di
  nuovo il consenso. Poi B si scollega da sé via MCP (`agents_disconnect` con il proprio
  `clientId`): la risposta arriva senza errore, la richiesta successiva di B prende 401.
  Scollegare di nuovo un client già scollegato risponde comunque `{ clientId }` (404
  `oauth_consent_not_found` reale).

## Passi esterni per la produzione (li fa l'utente)

Progetto Supabase `lronuqvtjdhfyychnscr`; da chiedere con `STATO: DOMANDA` quando
l'implementazione è pronta per la prova sul Worker pubblicato. Nessuna modifica diretta
da parte degli agenti. Prima i prerequisiti verificabili, poi l'attivazione, poi la prova.

**Prerequisiti (verifiche, con i passi della piattaforma dove già esistono):**

1. **Firma asimmetrica.** Dashboard › Project Settings › JWT Keys: la chiave in uso
   (*Current key*) è ECC (P-256) o RSA, non la *Legacy JWT secret* HS256 (Supabase la
   richiede per gli ID token `openid`; il Worker accetta solo ES256 e RS256). Controllo:
   `curl https://lronuqvtjdhfyychnscr.supabase.co/auth/v1/.well-known/jwks.json` mostra
   almeno una chiave con `alg` `ES256` o `RS256`.
2. **Migrazione applicata.** Dopo il merge, Dashboard › Database › Migrations elenca
   `20261011200000_connected_agents`.
3. **Lettura delle tabelle `auth` dalla funzione** (tabelle `oauth_*` di proprietà di
   `supabase_auth_admin`). Dashboard › SQL Editor, dopo l'attivazione del passo 6 e un
   primo collegamento:

   ```sql
   begin;
   set local role authenticated;
   select set_config('request.jwt.claims', json_build_object('sub', '<id utente>', 'role', 'authenticated')::text, true);
   select * from app.connected_agents();
   rollback;
   ```

   Atteso: nessun errore di permesso, una riga per agente collegato. Con un errore
   `permission denied` ci si ferma con `STATO: DOMANDA` (alternativa: elenco da
   `GET /auth/v1/user/oauth/grants` senza l'ultimo rinnovo).
4. **Schema `app` non esposto.** Dashboard › Project Settings › Data API: *Exposed
   schemas* contiene solo `public` e `graphql_public` (oppure la Data API è disattivata);
   `app` non c'è.
5. **Chiave pubblica.** Dashboard › Project Settings › API Keys: copiare la **Publishable
   key** e passarla al coordinatore, che la scrive in `SUPABASE_PUBLISHABLE_KEY` di
   `server/wrangler.jsonc` al posto del segnaposto `sb_publishable_REPLACE_ME` prima della
   pubblicazione (con il segnaposto «Scollega» risponde `internal`, mai un falso successo).

**Attivazione:**

6. Dashboard › Authentication › OAuth Server: **Enable OAuth server**; *Authorization
   path* `/authorize`; **Allow dynamic client registration** attivo; salvare.
7. Dashboard › Authentication › URL Configuration: *Site URL* uguale all'origine pubblica
   dell'app (`https://cosasimangia.qunidi.it`, o l'URL `workers.dev` finché il dominio
   non è attivo); in *Redirect URLs* la stessa origine con `/**`.
8. Pubblicazione del Worker con la SPA (`npm run deploy`, coordinatore). Controllo:
   `<Site URL>/authorize?authorization_id=prova` mostra «Richiesta non valida o scaduta» e
   `<Site URL>/.well-known/oauth-protected-resource/mcp` indica come `resource`
   `<Site URL>/mcp`.
9. Nessuna registrazione manuale di client: Claude Code e Codex CLI si registrano da soli
   (registrazione dinamica).

**Prova:**

10. Sul Worker pubblicato: collegare Claude Code con l'indirizzo e il comando copiati dalla
    pagina, chiedere «chi sono?» (`session_whoami` → canale `mcp`), scollegarlo dall'app,
    verificare che la richiesta successiva chieda di nuovo l'accesso; poi il passo 3.

## Rischi aperti

- **Poteri dei token d'agente su Supabase Auth** (decisione dell'utente dell'11 ottobre:
  documentare ora, limitare in un secondo momento). Un agente collegato può, con il
  proprio token e senza passare dal Worker: cambiare la password dell'account senza
  conoscere quella attuale, e mantenere così l'accesso web anche dopo «Scollega»;
  revocare gli altri agenti; chiudere le sessioni web; modificare `user_metadata`.
  Cambiare l'email richiede la conferma su entrambe le caselle. Mitigazioni possibili
  quando si deciderà: richiedere la password attuale per cambiarla
  (`security_update_password_require_current_password`, non impostabile da
  `config.toml`), oppure un server di autorizzazione nel Worker. I testi del consenso,
  della pagina e della conferma di «Scollega» lo dicono in parole semplici e non
  promettono un blocco totale.
- **Sessioni multiple dello stesso client:** riautorizzare aggiunge sessioni che restano
  valide fino a «Scollega» (o fino a quando l'agente smette di rinnovarle); la prova in CI
  verifica che «Scollega» le chiuda tutte.
- **PostgREST** accetta un token revocato fino alla scadenza: innocuo finché `public` e
  `graphql_public` restano vuoti e `app` non è esposto (prerequisito 4).
- **Lettura delle tabelle `auth`** da una funzione `security definer`: funziona in locale
  come `app.session_is_active()`; sul progetto si verifica con il prerequisito 3.
- **Nome del client non verificato:** un client può registrarsi con un nome qualunque;
  la schermata lo dice e mostra identificativo e pagina di ritorno.
- **Ultimo rinnovo, non ultimo uso:** chi cerca accessi sospetti vede quando l'agente ha
  rinnovato l'accesso, non quando l'ha usato; la pagina lo spiega.

## Test

- Contratto: metadati delle due operazioni (MCP, ruolo, non offline), forma degli output.
- Server (Vitest, Postgres locale con `TEST_DATABASE_URL` esplicito): `agents.list` con
  righe inserite nelle tabelle `auth` del database di test (solo dell'utente, `current` dal
  `client_id` del token, ordine); `agents.disconnect` con `fetch` finto: richiesta con
  token e `apikey`; 204 e 404 `oauth_consent_not_found` → successo; 404 generico, HTML,
  JSON malformato, codice diverso, 500 e timeout → `internal`; 401 → `unauthorized`; con
  la revoca fallita l'agente resta attivo e nell'elenco; strumenti `agents_list` e
  `agents_disconnect` presenti in MCP.
- pgTAP: `connected_agents_test.sql` (sopra).
- Web (Vitest e Testing Library): consenso nei suoi stati (senza sessione, richiesta non
  valida, redirect immediato, consenso con i ruoli, testi sui poteri e su «Scollega»,
  scope, dettagli dell'agente, nome ostile e lunghissimo come testo, profilo lento o in
  errore con «Consenti» disabilitato, consenti, annulla, errore di rete, offline);
  generazioni (risposte invertite di due caricamenti, smontaggio e cambio account durante
  la lettura e durante la decisione: nessuna navigazione); cambia account (chiusura
  comune con Supabase in errore, coda della spesa cancellata, altra scheda avvisata,
  accesso di un'altra persona che torna alla richiesta); pagina agenti (indirizzo dal
  `serviceOrigin`, copia, fisarmonica, elenco con ultimo rinnovo e spiegazione, conferma
  con i testi sui poteri, scollegamento con rilettura, errore, offline, vuoto); voce del
  Profilo con il conteggio.
- CI: prova end-to-end (sezione «Prova end-to-end in CI»).
- Prova manuale con Claude Code vero collegato allo stack locale, con indirizzo e comando
  copiati dalla pagina, e controllo dei metadati di scoperta.
- Prova visiva con agent-browser sulle due pagine (iPhone, porta 8767).

## Cosa uso e cosa produco

Uso (da `main`): `verifyAccessToken`, `channelOf`, `loadSession` e il percorso delle
operazioni (`createImplementer`, `context.token`, `context.clientId`), `createApp` con
`/mcp` e i metadati di scoperta, `collectTools` (gli strumenti nascono dal contratto), il
client oRPC del web e le sue `queryOptions`, `AuthBackend`, `useSignOut` di
`SessionScope`, `BottomSheet`, `PageHeader`, `Icon`, `useOnline`, `useProfile`, i
dizionari per area.

Produco: area `agents` del contratto (`agentsContract`, `connectedAgentSchema`,
`ConnectedAgent`); `agentsRouter`, `revokeGrant` e `GrantRevocationError` nel server;
campo `SUPABASE_PUBLISHABLE_KEY` di `Env`; funzione `app.connected_agents()`; metodi
`getAuthorization` e `decideAuthorization` di `AuthBackend` con i tipi
`AgentAuthorization`, `AuthorizationFailure`, `AuthorizationResult`; `env.serviceOrigin()`;
rotte web `/authorize` e `/profile/agents`; componenti `CopyField` e `ClientGuide`;
configurazione locale del server OAuth; prova end-to-end `scripts/oauth/agents-e2e.sh` e
`agents-e2e.mjs` nella CI.

Una sola PR verso `main`: contratto e gestori stanno insieme; ogni commit intermedio
lascia typecheck e test verdi.

## Decisioni da riportare nella specifica

### Prodotto

- **Riautorizzazione dello stesso client** (sezione 13, «Schermata di autorizzazione»):
  sostituisce «Autorizzare di nuovo lo stesso client sostituisce l'accesso precedente»
  con: finché l'agente è collegato, autorizzarlo di nuovo non chiede un altro consenso e
  aggiunge un accesso; «Agenti collegati» mostra una riga per client; «Scollega» revoca
  tutti i suoi accessi. Decisione del coordinatore, 11 ottobre 2026.
- **Testi veritieri sui poteri dell'agente** (sezione 13, schermata di autorizzazione,
  pagina di istruzioni e agenti collegati; parte 1 «Usare l'app attraverso il proprio
  agente»): consenso, pagina e conferma di «Scollega» dicono in modo semplice che l'agente
  agisce con l'account della persona, che può anche cambiare la password e chiudere le sue
  sessioni, che eliminare una famiglia resta solo nell'app e che «Scollega» revoca
  l'autorizzazione e le sessioni di quell'agente, non accessi ottenuti in altro modo (con
  una password cambiata si cambia la password). Niente promesse di blocco totale; tolto
  «vedere le credenziali» da ciò che l'agente non può fare. Decisioni dell'utente e del
  coordinatore, 11 ottobre 2026.
- **Ultimo rinnovo dell'accesso** al posto di «ultimo uso» negli agenti collegati
  (sezione 13; voce «ultimo uso degli agenti» della sezione 15): la voce «ultimo uso» è
  **sostituita**, non chiusa. Si mostra il rinnovo più recente dell'accesso, dal rinnovo
  della sessione, senza registrazioni aggiuntive, con una riga che spiega che non dice
  quando l'agente ha usato l'app. Se servisse l'ultimo uso vero, andrebbero registrate le
  richieste autenticate. Decisione del coordinatore dopo la review.
- **Nome dell'agente** mostrato come quello con cui si presenta, non verificato, con
  identificativo e pagina di ritorno consultabili; il consenso mostra anche i dati
  richiesti (scope) precisando che non limitano ciò che l'agente può fare (sezione 13).
- **Istruzioni per i curatori** nella pagina: rimando alle istruzioni servite
  all'agente, senza il testo (sezione 13, che lo consente già: «rimanda alle istruzioni
  scritte»; diverge dal prototipo, che lo mostrava).

### Tecniche

- **Revoca verificata l'11 ottobre 2026** (sezioni 1, 13, 15 e 17): `revokeGrant` cancella
  le sessioni del client per quell'utente; il controllo della sessione a ogni richiesta
  rende inutilizzabile subito l'access token non scaduto su MCP, RPC e REST, con gli altri
  client e il web attivi; refresh token annullati, anche di più sessioni dello stesso
  client; PostgREST lo accetta fino alla scadenza senza dati raggiungibili. Provata a ogni
  PR dalla CI con token reali e `agents.disconnect`. Chiude «revoca dei grant di un
  client» nella sezione 15 e la verifica della sezione 17 per la parte agenti.
- **Elenco e scollegamento come operazioni del contratto** `agents.list` e
  `agents.disconnect` con strumenti MCP (sezione 13, tabella «Accesso e contesto»): lo
  scollegamento passa da Supabase Auth con il token di chi chiede e dichiara il successo
  solo con 204 o con il 404 `oauth_consent_not_found`; nuova variabile del Worker
  `SUPABASE_PUBLISHABLE_KEY` (sezione 1).
- **Funzione `app.connected_agents()`** sulle tabelle `auth` (sezione 2); la tabella
  `agent_authorizations` dell'ondata 3 non serve (piano generale, «Tabelle dell'ondata 3»).
- **Rischio aperto sui poteri dei token d'agente** (sezioni 13 e 17): un token d'agente
  vale come quello dell'utente su Supabase Auth (password senza quella attuale, grant di
  altri agenti, chiusura delle sessioni, metadati); il server OAuth di Supabase non lo
  permette di limitare (solo scope OIDC, `aud` ignorato da Supabase Auth, provato con un
  hook). Decisione dell'utente dell'11 ottobre 2026: documentare ora, nei testi per la
  persona e nella specifica, limitare in un secondo momento; mitigazioni candidate:
  password attuale richiesta per cambiarla, server di autorizzazione nel Worker.
- **Configurazione del server OAuth** (sezione 1): percorso di autorizzazione
  `/authorize`, registrazione dinamica attiva, Site URL sull'origine dell'app; in locale
  in `supabase/config.toml`. Prerequisiti di produzione verificabili: firma asimmetrica,
  migrazione applicata e leggibile dalla funzione, schema `app` non esposto, chiave
  pubblica reale, SPA con `/authorize` pubblicata sulla Site URL.
- **Prova end-to-end degli agenti in CI** (sezioni 15 e 17): stack locale con server OAuth
  e Worker, token reali, confini PKCE e redirect, canale dopo il rinnovo, scollegamento
  con `agents.disconnect` anche dall'agente stesso.
- **Indirizzo MCP in sviluppo** (sezione 1, sviluppo locale): sul Vite di sviluppo la
  pagina mostra l'origine del Worker; in produzione SPA e MCP condividono l'origine.
