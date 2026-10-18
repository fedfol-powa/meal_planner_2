# Brief W17: skill per Claude da scaricare in «Collega un agente»

Segui `progetto/coordinamento/protocollo-worker.md`, con le eccezioni scritte qui.

- **Branch:** `evolutive/skill-claude` (da `origin/main`) · **Worktree:** `.worktrees/skill-claude`
- **Richiesta dell'utente (18/10/2026):** una skill che insegni agli agenti, in particolare a
  Claude, a usare le funzioni dell'app come membro della famiglia, come curatore del
  ricettario e come amministratore; un file da scaricare nella pagina degli agenti, con le
  istruzioni per caricarlo su claude.ai e usarlo dall'app Claude sull'iPhone.
- **Specifica principale:** sezioni 1, 8 (ricettario e curatori), 13 (MCP, «Collega un
  agente»), 14 e 15; `design/design.md`; `design/percorsi.md`, settimo giro (MCP).
- **Eccezione al protocollo:** niente brainstorming né spec di design: le decisioni sono
  sotto, prese dall'utente con il coordinatore. Scrivi un piano breve in
  `progetto/superpowers/plans/2026-10-18-skill-claude.md` (file, contenuto della skill,
  impacchettamento, testi della pagina, test, «Decisioni da riportare nella specifica»), fai
  commit e vai avanti senza fermarti fino alla PR. La revisione Codex sarà sulla PR.
  **Niente prototipo** (decisione dell'utente: intervento minimo).

## Decisioni dell'utente (18/10/2026)

1. **Una sola skill**, `cosa-si-mangia`, per tutti i ruoli: l'agente capisce il ruolo
   dell'account (`session_whoami` o `profile_get`) e usa solo le parti che gli spettano.
2. **Un solo file `SKILL.md`**, senza cartella `references/`: le regole di dettaglio sulle
   ricette **non si copiano**, la skill rimanda a `catalogue_getGuide` (unica fonte, servita
   dal server: sezione 8).
3. **Inglese** come la guida del curatore; la skill dice all'agente di rispondere nella
   lingua dell'utente.
4. **Casi d'uso:** menu della settimana (lettura, pasti, scambi, porzioni, note,
   suggerimenti, annulla, voti); impostazioni della famiglia (pasti attivi, regole,
   esclusioni, ingredienti limitati, libri posseduti, membri, ruoli e inviti alla famiglia);
   ricette per i curatori (bozza, controllo, revisione, foto, ingredienti, archivio,
   versioni); amministrazione (utenti, ruoli globali, inviti all'app). **La lista della spesa
   resta fuori** per scelta dell'utente.
5. **Formato di caricamento:** claude.ai accetta uno **zip** che contiene la cartella della
   skill (`cosa-si-mangia/SKILL.md`) in cima; un `SKILL.md` alla radice dello zip non viene
   riconosciuto (guide ufficiali verificate dal coordinatore, caricamento dello zip
   confermato dall'utente). Percorso: Customize → Skills → «+» → «Create skill» →
   «Upload a skill»; serve «Code execution and file creation» attivo in Settings →
   Capabilities. Limiti: nome al massimo 64 caratteri (minuscole e trattini), descrizione
   al massimo 200 caratteri.

## Perimetro

1. **Sorgente della skill** in una cartella del repository a tua scelta (motivala nel piano;
   per esempio `agent-skill/cosa-si-mangia/SKILL.md`), con il frontmatter `name` e
   `description`. La descrizione deve far scattare la skill quando l'utente parla di menu,
   pasti, ricette o famiglia nell'app Cosa si mangia. Contenuto minimo:
   - cos'è l'app e che la skill presuppone il connettore MCP già collegato (se gli
     strumenti mancano, dire all'utente di collegarlo dalla pagina «Collega un agente»);
   - all'inizio: chi sono, quale famiglia è attiva (`profile_setCurrentFamily` solo se
     l'utente lo chiede o se ce n'è più di una e non è chiaro), ruoli di famiglia e
     globali; date e «questa settimana» nel fuso della famiglia;
   - per ogni caso d'uso: quali strumenti, in che ordine, cosa leggere prima di scrivere,
     come riferire l'esito; il dettaglio dei parametri lo dà lo schema degli strumenti, non
     va ripetuto;
   - **conferme:** «sì» esplicito prima di pubblicare una ricetta, impostare una foto,
     ripristinare una versione, rimuovere membri, cambiare ruoli, revocare inviti,
     cancellare utenti o account, uscire o eliminare una famiglia; le modifiche ordinarie
     al menu chieste dall'utente si fanno e si riferiscono (con `meals_undo` per tornare
     indietro). Password e sessioni solo su richiesta esplicita (sezione 13, «i testi dicono
     la verità sui poteri dell'agente»). Controlla nel contratto quali di queste operazioni
     sono davvero esposte via MCP e quali `webOnly`: per quelle solo web la skill rimanda
     all'app;
   - **ingredienti mai dedotti dal nome del piatto**, solo dalla fonte o dall'utente
     (`AGENTS.md`, «Regole per tutti»); prima di ogni lavoro sul ricettario leggere
     `catalogue_getGuide`;
   - errori e conflitti: cosa dire all'utente quando lo strumento rifiuta (codici) o c'è un
     conflitto di versione;
   - una riga con la data o la versione della skill, la stessa mostrata nella pagina, così
     l'utente sa quando ricaricarla.
   Usa i nomi veri degli strumenti MCP (`<gruppo>_<operazione>`, generati dal contratto in
   `server/src/mcp.ts`). Segui le indicazioni di Anthropic sulla scrittura delle skill
   (Context7 o la documentazione ufficiale): istruzioni brevi, il perché delle regole, poca
   enfasi.
2. **Impacchettamento:** lo zip `cosa-si-mangia.zip` (cartella `cosa-si-mangia/` in cima) si
   genera nella build della SPA, per esempio estendendo `web/scripts/sync-assets.mjs`
   (`prebuild`), e viene servito come file statico dal Worker. Lo zip **non** si versiona.
   Niente dipendenze nuove: Node ha `zlib` (anche `crc32`) e uno zip con pochi file si
   scrive in poche righe; se ritieni serva una libreria, chiedila al coordinatore con cosa
   sostituisce e cosa costa farne a meno. Il server di sviluppo deve servire lo zip anche
   lui.
3. **Pagina «Collega un agente»** (`web/src/features/agents/AgentsPage.tsx`): una sezione
   breve «Skill per Claude» con il pulsante per scaricare lo zip e i passaggi per
   claude.ai (attivare l'esecuzione del codice, caricare lo zip, attivare la skill; dopo
   il caricamento è disponibile anche nell'app sul telefono, con il connettore già
   collegato). Testi in italiano e inglese britannico nei file di traduzione esistenti,
   veritieri e brevi; stile da `design/design.md`, componenti già presenti. La sezione è
   visibile a tutti; la skill stessa distingue i ruoli.
4. **Test:**
   - ogni nome di strumento citato nel `SKILL.md` esiste fra gli strumenti MCP generati dal
     contratto (il test fallisce se uno strumento viene rinominato o tolto);
   - frontmatter valido (nome uguale alla cartella, limiti di lunghezza);
   - lo zip generato ha la cartella in cima e si legge (per esempio con `unzip -l` o
     leggendo l'indice nel test);
   - test della pagina per la sezione nuova (link di scaricamento, testi nelle due lingue).
5. **Prova d'uso:** sullo stack locale, una sessione Claude (`claude -p` con il server MCP
   locale e la skill caricata) esegue almeno: «cosa mangiamo mercoledì a cena?», «sposta la
   pizza di venerdì a sabato», «aggiungi un'esclusione», e da curatore «crea la bozza di
   questa ricetta» con ingredienti forniti nel prompt, fermandosi prima di pubblicare.
   Riporta domande, strumenti chiamati e risposte nella PR. Verifica la pagina con la
   skill agent-browser, anche a larghezza da telefono, e allega lo screenshot alla PR
   (il coordinatore lo mostra all'utente).

## Vincoli

- Prove solo sullo stack locale (`AGENTS.md`, «Regole per tutti»): mai `claude -p` o il
  browser contro `cosasimangia.app`.
- Niente modifiche al contratto o al server, salvo ciò che serve a servire lo zip; se
  serve cambiare un'operazione per far funzionare la skill, fermati con `STATO: DOMANDA`.
- Il caricamento su claude.ai e la prova sull'iPhone li fa l'utente dopo il rilascio:
  scrivi nel piano cosa resta da provare a mano.
- Rilascio in produzione: **non lo fai tu**. Alla fine: push, PR verso `main`,
  `STATO: PR_APERTA <url>`.
