# Prove tecniche: esito

Piano: `progetto/superpowers/plans/2026-10-11-prove-tecniche-server-e-oauth.md`.
Codice usa e getta in `spike/`, sul branch `prove-tecniche`.

## Prova 1: oRPC sul Worker (11 ottobre 2026)

Scelta dell'utente prima della prova: oRPC senza Hono, senza ORM, MCP con il solo SDK
ufficiale. Dipendenze del Worker: `@orpc/*`, `zod`, `postgres`, `jose`,
`@modelcontextprotocol/server` (più `wrangler` e `typescript` per lo sviluppo).

**Funziona tutto dal contratto unico** (`src/contract.ts`, due operazioni):

- RPC su `/rpc`, REST su `/api`, OpenAPI 3.1.1 su `/api/openapi.json`, strumenti MCP
  su `/mcp` generati percorrendo il contratto (`src/mcp.ts`, circa 50 righe, nessuno
  strumento scritto a mano). Lo schema di input degli strumenti è quello zod del
  contratto, la chiamata passa per il router con lo stesso contesto del web.
- Errori di validazione con lo stesso formato su tutti i canali (`BAD_REQUEST` con il
  dettaglio zod); senza token o con token falso 401; su `/mcp` il 401 porta
  `WWW-Authenticate` con il collegamento ai metadati della risorsa protetta.
- Canale riconosciuto dal claim `client_id`: un token dell'app web risulta `web`.

**RLS nel ruolo dell'utente tramite Hyperdrive**: transazione con
`set_config('request.jwt.claims', …, true)` e `set local role authenticated`.
Verificato con due utenti (A con 2 ricette, B con 1): 20 richieste alternate in
sequenza in locale e 120 concorrenti in produzione (due raffiche da 60, A e B
alternati), nessuna risposta con dati dell'altro utente.

**Due problemi trovati e risolti**:

1. *Limite di connessioni.* Con la configurazione di default Hyperdrive apre fino a 20
   connessioni verso l'origine, il Session pooler di Supabase sul piano gratuito ne
   regge circa 15: sotto raffica un terzo delle richieste restava appeso e Workers le
   annullava (errore 1101). Con `origin_connection_limit` a 10, 0 errori su 120.
   **Da portare in M1**: limite esplicito nella configurazione di Hyperdrive e
   allineato alla dimensione del pool di Supabase.
2. *Promesse condivise fra richieste.* Workers non permette di attendere un I/O avviato
   da un'altra richiesta. La cache di `createRemoteJWKSet` di `jose` e quella dei
   metadati OAuth condividevano la promessa del `fetch`; ora si condividono solo i dati
   già risolti (`src/auth.ts`). Regola da seguire in M1 per ogni cache di modulo.

In locale (`wrangler dev`) Hyperdrive non fa da pool: ogni richiesta apre una connessione
al Session pooler, quindi le raffiche locali falliscono per esaurimento delle
connessioni. Le prove di concorrenza vanno fatte sul Worker pubblicato.

**Misure** (Worker su `workers.dev`, database Supabase a Londra, client in Italia):

| Misura | Valore |
|---|---|
| Pacchetto | 1,5 MiB, 275 KiB compressi; avvio 58-71 ms |
| Peso per libreria | zod 763 KiB, SDK MCP 414 KiB, postgres 83 KiB, oRPC circa 130 KiB, jose 34 KiB (non compressi) |
| CPU `GET /api/recipes` | mediana 7 ms, massimo 20 ms |
| CPU chiamata MCP | mediana 13 ms, massimo 32 ms |
| Latenza in sequenza | mediana 0,28 s (REST e MCP), massimo 0,48 s |
| Latenza sotto raffica di 60 | mediana 0,6 s, massimo 1,5 s |

La CPU di MCP è più alta perché ogni richiesta costruisce il server e registra gli
strumenti; con molte operazioni andrà misurata di nuovo. Il peso di zod è il pacchetto
completo con le traduzioni; si può ridurre in M1 se l'avvio diventa un problema.

**Note per M1**:

- I token di Supabase hanno `aud: authenticated`, non l'indirizzo del server MCP:
  lo stesso token vale su web e MCP. La separazione dei canali si regge solo su
  `client_id` (meccanismo già deciso, sezione 13), da verificare nella prova 2.
- `traverseContractProcedures` e `createRouterClient` di oRPC bastano per generare gli
  strumenti; nessuna integrazione MCP di oRPC necessaria.
- oRPC 1.15.5: l'opzione del generatore OpenAPI si chiama `schemaConverters`
  (la documentazione più recente la chiama `converters`): fissare le versioni.
- L'SDK MCP v2 (`@modelcontextprotocol/server` 2.3.1) gestisce già 401, metadati
  RFC 9728 e verifica del bearer per i runtime web standard.

## Prova 2: OAuth per MCP

**Server OAuth 2.1 di Supabase disponibile sul piano gratuito** (attivato l'11 ottobre
dalla dashboard: server, registrazione dinamica, percorso di autorizzazione
`/authorize`, Site URL sul Worker di prova). I metadati espongono registrazione
dinamica, PKCE con `S256`, `authorization_code` e `refresh_token`, client pubblici
(`none`). **Non c'è un endpoint di revoca né di introspezione** (RFC 7009/7662): lo
scollegamento di un agente dall'app dovrà passare dalle API di Supabase sui grant.

Metadati della risorsa protetta serviti dal Worker con l'SDK MCP
(`/.well-known/oauth-protected-resource/mcp`), più la copia dei metadati del server di
autorizzazione su `/.well-known/oauth-authorization-server` per i client che li
cercano sull'origine.

| Client | Registrazione dinamica | Consenso | Lettura | Canale `mcp` con `client_id` | Note |
|---|---|---|---|---|---|
| Claude Code | sì | sì, pagina `/authorize` | sì, solo le ricette dell'utente | sì | `claude mcp add --transport http`, poi `/mcp` > Authenticate |
| Codex CLI | sì | sì, consenso separato | sì, solo le ricette dell'utente | sì, `client_id` diverso | `codex mcp add --url` avvia da solo il login; chiede `openid profile email phone offline_access` e passa `resource` (RFC 8707) |
| Claude Desktop | non provato | | | | L'utente ha ritenuto sufficienti i due client provati; da verificare prima del rilascio |
| ChatGPT | non provato | | | | Come sopra (modalità sviluppatore dei connettori) |

**Revoca non provata**: senza endpoint di revoca, lo scollegamento dall'app passerà
dalla gestione dei grant di Supabase; da provare in M1 insieme alla pagina degli
agenti collegati.

## Decisioni per M1

- Contratto con oRPC senza Hono; Postgres.js senza ORM; `jose`; SDK ufficiale di MCP.
- Hyperdrive con limite di connessioni esplicito sotto il pool del Session pooler.
- Cache di modulo solo con dati risolti.
- Strumenti MCP generati dal contratto con `traverseContractProcedures`.
- Canale MCP dal claim `client_id`, unico elemento che distingue i token degli agenti.

