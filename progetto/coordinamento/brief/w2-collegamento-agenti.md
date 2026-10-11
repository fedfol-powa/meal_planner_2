# Brief W2: Collegamento degli agenti

Segui `progetto/coordinamento/protocollo-worker.md` e `brief/ondata2-comune.md`.

- **Branch:** `traguardo/collegamento-agenti` (da `origin/main`) · **Worktree:**
  `.worktrees/agenti`
- **Area:** collegamento degli agenti MCP all'account: autorizzazione OAuth 2.1 di
  Supabase Auth, pagina «Collega un agente» nel Profilo, elenco «Agenti collegati» con
  «Scollega».
- **Specifica:** sezione 13 (autenticazione, separazione web/agenti con il claim
  `client_id`, pagina di istruzioni, agenti collegati, scollegamento), sezione 7 (Profilo),
  sezioni 1 e 2 per permessi e ruoli, parte 1 «Usare l'app attraverso il proprio agente»,
  `design/percorsi.md` (sesto giro) e il prototipo; più 15, 16, 17.

## Obiettivo

Un membro della famiglia collega il proprio agente (per primo Claude Code) seguendo la
pagina del Profilo, lo vede in «Agenti collegati» e lo scollega; dopo lo scollegamento i
token di quell'agente non valgono più su MCP, RPC e REST.

## Su cosa costruisci (tutto su `main`)

- Piattaforma: verifica dei token (`server/src/auth.ts`), server MCP (`server/src/mcp.ts`),
  metadati in `server/src/well-known.ts` (PR #5).
- Client reale e sessione del web (W5, PR #17); pagine del Profilo (tue, PR #18 e #21).
- Strumenti MCP di tutte le aree già unite: la guida di collegamento li usa negli esempi.

## Vincoli dal coordinamento

- **Prova della revoca prima di tutto:** la sezione 13 chiede di verificare che revocare un
  client (gestione dei grant di Supabase) renda inutilizzabile il suo access token non
  scaduto su MCP, RPC e REST. Fallo in locale nel brainstorming, prima della spec: dal
  risultato dipende il disegno dello scollegamento (per esempio un controllo del grant a
  ogni richiesta). Riporta l'esito nella spec.
- **Passi esterni:** l'attivazione del server OAuth e la registrazione dei client sul
  progetto di produzione `lronuqvtjdhfyychnscr` (confermato dall'utente l'11 ottobre) li
  fa l'utente. Scrivi nella spec l'elenco esatto (dove cliccare, valori) e fermati con
  `STATO: DOMANDA` quando servono: il coordinatore glieli porta. Nessuna modifica diretta
  alla produzione.
- Nella spec scrivi cosa **usi** e cosa **produci**, con le firme; tocca i file della
  piattaforma solo dove serve e dichiaralo: il coordinatore controlla i conflitti.
- Testi nelle due lingue; operazioni con strumento MCP salvo `webOnly` motivato.
