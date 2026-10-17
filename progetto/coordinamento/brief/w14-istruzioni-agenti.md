# Brief W14: ristrutturare le istruzioni per gli agenti (CLAUDE.md e AGENTS.md)

Segui `progetto/coordinamento/protocollo-worker.md`, con le eccezioni scritte qui.

- **Branch:** `docs/istruzioni-agenti` · **Worktree:** `.worktrees/istruzioni`
- **Richiesta dell'utente (17/10/2026):** «dobbiamo rivedere il claude.md di questo
  progetto in modo che sia più chiaro per te e per i worker come lavoriamo senza che
  debba ripetertelo tutte le volte», seguendo le linee guida di Anthropic sul prompting
  di Claude Opus 5.5 e le best practice dei file di istruzioni.
- **Eccezione alla proprietà dei file:** per questa attività l'utente ti autorizza a
  modificare `AGENTS.md`, `CLAUDE.md`, `progetto/coordinamento/README.md`,
  `progetto/coordinamento/protocollo-worker.md` e a creare file in `.claude/`
  (per esempio `.claude/rules/` o skill di progetto), se il design lo prevede. La
  specifica principale e il piano generale restano del coordinatore.

## Il problema

Oggi `CLAUDE.md` rimanda soltanto ad `AGENTS.md` (125 righe), che è soprattutto stato e
storia del progetto e dice poco su **come si lavora**. Il metodo è sparso tra
`progetto/coordinamento/README.md`, `protocollo-worker.md`, i brief e la memoria
personale del coordinatore, che i worker non vedono. Per questo l'utente deve ripetere
le stesse regole. Esempi recenti, tutti del 17/10:

- il coordinatore ha cominciato a scrivere codice da solo invece di avviare un worker
  herdr; l'utente gli ha dovuto ricordare che è un coordinatore;
- l'utente ha chiesto se i worker partono con le skill superpowers;
- regole su push, PR e «mergia» (PR del coordinatore solo con «mergia» esplicito, PR dei
  worker unite dal coordinatore dopo revisione e CI verde), sul rilascio (anteprima del
  coordinatore, «vai» dell'utente, lancio dell'utente con `!`), sui revisori Codex e sul
  limite di worker Claude si ritrovano solo in file sparsi o nella memoria.

## Fase 1: studio (prima del brainstorming)

1. **Documentazione di Anthropic** (leggila davvero, con WebFetch):
   - https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5
   - https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
   - https://code.claude.com/docs/en/memory (CLAUDE.md, AGENTS.md, `.claude/rules/`, import, commenti HTML)
   - https://code.claude.com/docs/en/best-practices
   - https://code.claude.com/docs/en/sub-agents e https://code.claude.com/docs/en/skills se pensi di usare agenti o skill di progetto.
   Punti già emersi: file brevi (sotto le 200 righe), solo ciò che l'agente non può
   ricavare dal codice, istruzioni verificabili, poca enfasi (niente MAIUSCOLE ovunque),
   procedure lunghe o regole di un'area spostate in skill o regole con percorso, spiegare
   il perché delle regole. Nota anche: Codex legge `AGENTS.md` (i revisori sono Codex),
   Claude Code legge `CLAUDE.md`: decidi come servire entrambi.
2. **Stato attuale del metodo:** `AGENTS.md`, `CLAUDE.md`,
   `progetto/coordinamento/README.md`, `protocollo-worker.md`, `brief/revisore.md`,
   `brief/ondata2-comune.md`, un paio di brief recenti (`w12-foto-ricette.md`,
   `w13-somiglianza-e-zoom.md`), `registro.md` (sezioni «Decisioni dell'utente da
   ricordare» e «Prossima azione»), e la memoria del coordinatore in
   `/Users/fedfol/.claude/projects/-Users-fedfol-Projects-meal-planner-2/memory/`
   (sola lettura: contiene le correzioni dell'utente sul metodo). Guarda anche le
   istruzioni globali dell'utente in `~/.claude/CLAUDE.md` e `~/.claude/rules/` (sola
   lettura) per non duplicarle.
3. Annota in un file di lavoro: regole presenti, dove stanno, duplicati, contraddizioni,
   regole che esistono solo nella memoria personale, cose superate.

## Fase 2: brainstorming con l'utente

Con la skill `superpowers:brainstorming`. Le domande arrivano al coordinatore, una alla
volta, con un'opzione consigliata; il coordinatore le gira all'utente o ti dice di
aspettarlo nel tuo pane (Remote Control). Temi da chiarire, per esempio: struttura
(un file per tutti o parti per ruolo: coordinatore, worker, revisore), cosa resta in
`AGENTS.md` e cosa va nella specifica o nel registro, uso di `.claude/rules/` o di skill
di progetto, lingua delle istruzioni, cosa fare della memoria personale.

## Fasi successive

Poi come da protocollo: spec di design (con «Decisioni da riportare nella specifica»
se tocca la specifica principale), piano, `STATO: SPEC_E_PIANO_PRONTI` e revisione
Codex, implementazione, PR, `STATO: PR_APERTA <url>`. Niente codice dell'app.

**Verifica:** prima della PR prova le istruzioni nuove: per esempio una sessione Claude
nuova nel worktree (`claude -p`) a cui chiedi «come si avvia un worker?» o «chi unisce
una PR?», e controlla che risponda dalle istruzioni senza cercarle in giro. Riporta
domande e risposte nella PR.
