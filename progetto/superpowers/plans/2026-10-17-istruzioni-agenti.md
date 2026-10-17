# Istruzioni per gli agenti: piano di implementazione (W14)

> **Per gli agenti che eseguono:** usa superpowers:executing-plans (esecuzione nella
> sessione di W14) compito per compito. I passi usano le caselle (`- [ ]`).

**Obiettivo:** ogni sessione Claude carica davvero le regole comuni, riconosce il proprio
ruolo con una precedenza unica, e il coordinatore riprende il lavoro da solo con la skill
`coordinamento`.

**Architettura:** `CLAUDE.md` importa `AGENTS.md` (base comune per Claude e Codex, con ruoli e
proprietà dei file); il metodo del coordinatore va in una skill di progetto; worker e
revisori restano sui loro file in `progetto/coordinamento/`. Solo istruzioni, nessun hook.

**Strumenti:** Markdown, skill di Claude Code (`.claude/skills/`), `claude -p` (con
`/context` e `--output-format stream-json --verbose`) e `codex exec` per la verifica.

**Spec:** `progetto/superpowers/specs/2026-10-17-istruzioni-agenti.md` (sezioni «Matrice
delle regole», «Verifica», «Consegna al coordinatore dopo il merge»).

## Vincoli globali

- Solo istruzioni: niente hook, permessi, `settings.json` o script nuovi nel repository.
- File modificati: `CLAUDE.md`, `AGENTS.md`, `.claude/skills/coordinamento/`,
  `progetto/coordinamento/README.md`, `protocollo-worker.md`, `brief/revisore.md`, più spec e
  piano di W14. **Non** `registro.md`, specifica principale, piano generale, memoria (li
  sistema il coordinatore dopo il merge).
- Italiano con gli accenti; regole non ovvie con il perché in una riga; enfasi al massimo su
  una riga per file.
- `AGENTS.md` sotto 100 righe; `SKILL.md` sotto 200.
- Parole «avversariale», «aggirare», «attacco»: vietate solo nei prompt nuovi e nelle
  istruzioni operative dei revisori (`brief/revisore.md`, sezione revisioni della skill),
  non nella documentazione storica.
- Ogni regola della matrice sta nella destinazione indicata, una volta sola; gli altri file
  rimandano.
- Prove con `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`; la memoria reale non si tocca.

## Punti da controllare in revisione

1. Sessione in un worktree con il messaggio di ripresa di un worker: resta worker, non chiama
   `coordinamento` (V5).
2. Worktree collegato senza incarico: chiede il ruolo invece di sceglierlo (V6).
3. Coordinatore a cui si chiede una correzione di una riga: propone un worker e non tenta
   scritture, anche se i permessi lo consentirebbero (V3, traccia degli strumenti).
4. Regola della matrice che finisce solo nella skill pur riguardando i worker (righe 28, 40,
   41): controllo riga per riga nel compito 4.
5. Codex che non trova il proprio ruolo nella base comune (V7).

---

### Compito 1: `CLAUDE.md` e `AGENTS.md`

**File:**
- Modifica: `CLAUDE.md` (sostituzione completa)
- Modifica: `AGENTS.md` (riscrittura)

**Interfacce:**
- Produce: nomi usati dagli altri compiti: skill `coordinamento`; ruoli «coordinatore»,
  «worker», «revisore», «sottoagente»; sezioni «Ruoli» e «Proprietà dei file» di `AGENTS.md`.

- [ ] **Passo 1:** prova prima del cambiamento, nel worktree:
  `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 claude -p "/context"`: annota la tabella «Memory Files»
  (atteso: nessun `AGENTS.md`).
- [ ] **Passo 2:** `CLAUDE.md`: commento HTML per chi lo mantiene («le regole stanno in
  `AGENTS.md`, letto anche da Codex; l'import lo carica in ogni sessione Claude») e la riga
  `@AGENTS.md`.
- [ ] **Passo 3:** `AGENTS.md` con i punti 1–8 della spec («`AGENTS.md`»): ruoli con la
  precedenza (incarico esplicito → checkout principale con directory `.git` → altrimenti
  chiedere), proprietà dei file con eccezioni solo via brief e script tramite worker, confine
  del coordinatore con il perché, regole per tutti comprese le prove sullo stack locale con
  `web/.env.production` e «i worker non rilasciano», righe della matrice con destinazione AG.
- [ ] **Passo 4:** controlli:
  - `wc -l AGENTS.md` → meno di 100;
  - `grep -nE "M1a|M1b|nessun push|Niente codice prima" AGENTS.md` → nessun risultato;
  - `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 claude -p "/context"` → `AGENTS.md` presente (riga
    propria o token del `CLAUDE.md` cresciuti), un solo `CLAUDE.md` di progetto.
- [ ] **Passo 5:** commit «Istruzioni: AGENTS.md comune importato da CLAUDE.md, con ruoli e
  proprietà dei file».

### Compito 2: skill `coordinamento` e README del coordinamento

**File:**
- Crea: `.claude/skills/coordinamento/SKILL.md`
- Crea: `.claude/skills/coordinamento/herdr.md`
- Modifica: `progetto/coordinamento/README.md` (riscrittura breve)

**Interfacce:**
- Consuma: ruoli, proprietà e confine dal compito 1 (rimando, non si ripetono).
- Produce: modello del blocco «Stato corrente» (usato nella prova V1 e dal coordinatore dopo
  il merge); testo del messaggio di ripresa dei worker in `herdr.md` (usato in V5).

- [ ] **Passo 1:** `SKILL.md` con frontmatter `name: coordinamento` e la `description` della
  spec. Corpo nelle sezioni 1–8 della spec, con le righe della matrice di destinazione SK.
  Nella sezione «Ripresa», il modello:

  ```markdown
  ## Stato corrente (aggiornato il <data>)

  - **Attività in corso:** <attività, brief, fase>
  - **Worker attivi:** <tab, pane, branch, worktree, ultimo STATO>
  - **Revisori attivi:** <tab, rapporto atteso>
  - **Domande in sospeso:** <per l'utente / per i worker>
  - **Limite:** <n> worker Claude; revisori Codex senza limite
  - **Prossimo passo:** <cosa propone il coordinatore all'utente>
  ```

  Regola: il coordinatore riscrive questo blocco (non ne aggiunge uno) a ogni cambio di fase
  e prima di un `/clear`; la storia va sotto «Storico».
- [ ] **Passo 2:** `herdr.md`: dal README attuale «Attesa degli eventi», messaggi ai worker,
  menu aperti, messaggi lunghi in file, «Comandi utili», `/clear` dei worker (solo fermo e
  committato) con il testo del messaggio di ripresa. `SKILL.md` lo richiama per nome.
- [ ] **Passo 3:** `progetto/coordinamento/README.md` di circa 15 righe: scopo della
  cartella, metodo nella skill `.claude/skills/coordinamento/`, proprietà in `AGENTS.md`,
  elenco di `registro.md`, `brief/`, `messaggi/`, `revisioni/` e degli script.
- [ ] **Passo 4:** controlli:
  - `wc -l .claude/skills/coordinamento/SKILL.md` → meno di 200;
  - `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 claude -p "/context"` → «Skills» elenca
    `coordinamento`;
  - `grep -niE "avversari|aggira|attacc" .claude/skills/coordinamento/*.md` → solo nella
    frase che spiega di evitarle.
- [ ] **Passo 5:** commit «Istruzioni: skill del coordinatore, README come rimando».

### Compito 3: protocollo dei worker e brief del revisore

**File:**
- Modifica: `progetto/coordinamento/protocollo-worker.md`
- Modifica: `progetto/coordinamento/brief/revisore.md`

- [ ] **Passo 1:** protocollo: lingua, Context7, dipendenze, prove sullo stack locale e
  proprietà dei file diventano rimandi ad `AGENTS.md`; in «Contesto» si aggiungono: skill
  superpowers già attive; il rilascio non lo fa mai il worker; dopo un `/clear` il messaggio
  di ripresa cita brief, fase, spec e piano e si rileggono brief e protocollo; la skill
  `coordinamento` non è per i worker; i file riservati solo se il brief li delega.
- [ ] **Passo 2:** revisore: titolo «Brief del revisore»; «Sii avversariale…» → «Cerca ciò
  che è sbagliato, mancante, incoerente o rischioso; non limitarti a confermare.»
- [ ] **Passo 3:** controlli: `grep -niE "avversari" progetto/coordinamento/brief/revisore.md
  progetto/coordinamento/protocollo-worker.md` → nessun risultato; `wc -l` del protocollo
  non maggiore di 68.
- [ ] **Passo 4:** commit «Istruzioni: protocollo dei worker e brief del revisore».

### Compito 4: matrice, prove e PR

**File:**
- Modifica (solo se le prove lo richiedono): file dei compiti 1–3
- Modifica: `progetto/superpowers/specs/2026-10-17-istruzioni-agenti.md` (esiti, se cambia
  qualcosa)

- [ ] **Passo 1:** controllo della matrice: per ognuna delle 50 righe, `grep` della regola
  nella destinazione e delle condizioni operative (per esempio «fermo» e «committato» per la
  riga 29); esito in una tabella in scratchpad per la PR.
- [ ] **Passo 2:** ambiente, con la variabile `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` in ogni
  comando `claude`:
  - `claude --version`, `codex --version`;
  - clone: `git clone /Users/fedfol/Projects/meal_planner_2 <scratchpad>/coordinatore` e
    `git -C <scratchpad>/coordinatore checkout docs/istruzioni-agenti` (dal ramo remoto
    `origin/docs/istruzioni-agenti` del clone locale);
  - nel clone, `progetto/coordinamento/registro.md` sostituito da una copia simulata con il
    blocco «Stato corrente» costruito dallo stato vero del 17/10 (W13 e W14), con la riga
    «SIMULAZIONE per la prova di W14» in cima; non si committa;
  - worktree collegato senza brief: `git worktree add --detach <scratchpad>/senza-incarico
    HEAD`.
- [ ] **Passo 3:** prove V0–V7 della spec, una sessione nuova ciascuna, con
  `--permission-mode plan --output-format stream-json --verbose` (V0 senza stream). Salvare
  in scratchpad la traccia e la risposta finale; estrarre le chiamate `Skill`, `Read`,
  `Edit`, `Write`, `Bash` con `jq`. Valutare ogni prova con il criterio «Superata se» della
  spec.
- [ ] **Passo 4:** per ogni prova fallita su ruolo, delega, autorizzazioni o ripresa (V1,
  V3–V6): correggere il file responsabile, commit, ripetere la prova. Dopo due giri ancora
  fallita: niente PR, `STATO: DOMANDA` con l'esito.
- [ ] **Passo 5:** pulizia: `git worktree remove <scratchpad>/senza-incarico`; il clone resta
  in scratchpad.
- [ ] **Passo 6:** push e `gh pr create` verso `main`, descrizione in italiano: cosa cambia;
  ambiente delle prove (versioni, come è stato ottenuto il checkout principale simulato,
  registro simulato dichiarato); prompt, file caricati, chiamate della skill e risposte di
  V0–V7; esito della matrice; «Consegna al coordinatore dopo il merge» copiata dalla spec;
  «Decisioni da riportare nella specifica». Poi `STATO: PR_APERTA <url>`.
