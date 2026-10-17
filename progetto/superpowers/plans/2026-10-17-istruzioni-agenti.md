# Istruzioni per gli agenti: piano di implementazione (W14)

> **Per gli agenti che eseguono:** usa superpowers:executing-plans (esecuzione nella
> sessione di W14) compito per compito. I passi usano le caselle (`- [ ]`).

**Obiettivo:** ogni sessione Claude carica davvero le regole comuni, riconosce il proprio
ruolo, e il coordinatore riprende il lavoro da solo con la skill `coordinamento`.

**Architettura:** `CLAUDE.md` importa `AGENTS.md` (base comune per Claude e Codex); il metodo
del coordinatore va in una skill di progetto; worker e revisori restano sui loro file in
`progetto/coordinamento/`. Solo istruzioni, nessun hook.

**Strumenti:** Markdown, skill di Claude Code (`.claude/skills/`), `claude -p` e `codex exec`
per la verifica.

**Spec:** `progetto/superpowers/specs/2026-10-17-istruzioni-agenti.md` (studio in
`2026-10-17-istruzioni-agenti-studio.md`).

## Vincoli globali

- Solo istruzioni: niente hook, permessi, `settings.json` o script nuovi.
- File toccati: `CLAUDE.md`, `AGENTS.md`, `.claude/skills/coordinamento/`,
  `progetto/coordinamento/README.md`, `protocollo-worker.md`, `brief/revisore.md`, più spec e
  piano di W14. **Non** `registro.md`, specifica principale, piano generale, memoria.
- Italiano con gli accenti; regole non ovvie con il perché in una riga; enfasi al massimo su
  una riga per file.
- `AGENTS.md` sotto 100 righe; `SKILL.md` sotto 200.
- Nessuna parola «avversariale», «aggirare», «attacco» nei file letti da Codex o usati per i
  suoi prompt.
- Ogni regola in un solo file: nessun doppione fra `AGENTS.md`, skill e protocollo (si
  rimanda).

## Punti da controllare in revisione

1. Sessione nuova in un worktree di worker che riceve «continuiamo»: deve restare worker, non
   attivare la skill del coordinatore (verifica V5).
2. Coordinatore a cui si chiede una correzione di una riga nel codice: deve proporre un
   worker, non modificare (V3).
3. `CLAUDE.md` della cartella principale caricato due volte in un worktree (doppio
   `AGENTS.md` di versioni diverse): controllare con `/context` o chiedendo alla sessione
   (V6).
4. Regola in contraddizione rimasta in un file non toccato (registro, brief vecchi): elenco
   nella PR per il coordinatore.
5. Codex che non trova il proprio ruolo perché `AGENTS.md` parla solo di Claude (V7).

---

### Compito 1: `CLAUDE.md` e `AGENTS.md`

**File:**
- Modifica: `CLAUDE.md` (sostituzione completa)
- Modifica: `AGENTS.md` (riscrittura)

**Interfacce:**
- Produce: nomi usati dagli altri compiti: skill `coordinamento`; ruoli «coordinatore»,
  «worker», «revisore», «sottoagente del coordinatore»; sezione «Ruoli» di `AGENTS.md`.

- [ ] **Passo 1:** controllo prima: `claude -p "Senza leggere file, dimmi in una riga che
  ruolo ha il coordinatore in questo progetto" --disallowedTools Read,Bash,Grep,Glob` nel
  worktree. Atteso: non lo sa (oggi `AGENTS.md` non è caricato). Annota la risposta.
- [ ] **Passo 2:** `CLAUDE.md`: commento HTML per chi lo mantiene («le regole stanno in
  `AGENTS.md`, letto anche da Codex; l'import lo carica in ogni sessione Claude») e la riga
  `@AGENTS.md`.
- [ ] **Passo 3:** `AGENTS.md` con le sezioni della spec, «`AGENTS.md`», punti 1–7. Ruoli:
  coordinatore = sessione nel checkout principale del repository, **non** sotto `.worktrees/`
  né `.claude/worktrees/`; worker = sessione in `.worktrees/<nome>` con un brief; revisore =
  Codex con `brief/revisore.md`; sottoagente = delega del coordinatore; caso dubbio → chiedere
  all'utente. Confine del coordinatore come decisione 3 della spec, con il perché. La skill
  `coordinamento` vale solo per il coordinatore.
- [ ] **Passo 4:** controlli:
  - `wc -l AGENTS.md` → meno di 100;
  - `grep -nE "M1a|M1b|nessun push|Niente codice prima" AGENTS.md` → nessun risultato;
  - il comando del passo 1 → risponde con il ruolo del coordinatore (import attivo).
- [ ] **Passo 5:** commit «Istruzioni: AGENTS.md comune importato da CLAUDE.md, con i ruoli».

### Compito 2: skill `coordinamento` e README del coordinamento

**File:**
- Crea: `.claude/skills/coordinamento/SKILL.md`
- Crea: `.claude/skills/coordinamento/herdr.md`
- Modifica: `progetto/coordinamento/README.md` (riscrittura breve)

**Interfacce:**
- Consuma: ruoli e confine dal compito 1 (si rimanda, non si ripete).
- Produce: blocco «Stato corrente» (modello) usato dal coordinatore per ristrutturare il
  registro dopo il merge.

- [ ] **Passo 1:** `SKILL.md` con frontmatter `name: coordinamento` e la `description` della
  spec, completata con «Non usarla nei worktree dei worker». Corpo nelle sezioni 1–8 della
  spec. Nella sezione «Ripresa», il modello del blocco «Stato corrente»:

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
- [ ] **Passo 2:** `herdr.md`: dal README attuale le sezioni «Attesa degli eventi», messaggi
  ai worker, «Comandi utili», messaggi lunghi in file, menu aperti, `/clear` dei worker con il
  messaggio di ripresa. `SKILL.md` lo richiama per nome.
- [ ] **Passo 3:** `progetto/coordinamento/README.md` di circa 15 righe: scopo della
  cartella, metodo nella skill `.claude/skills/coordinamento/`, elenco di `registro.md`,
  `brief/`, `messaggi/`, `revisioni/`, `eventi.py`, `attendi.py`, `avvia-revisore.sh`.
- [ ] **Passo 4:** controlli:
  - `wc -l .claude/skills/coordinamento/SKILL.md` → meno di 200;
  - skill riconosciuta: `claude -p "Quali skill di progetto hai? Rispondi solo con i nomi"`
    nel worktree → contiene `coordinamento`;
  - `grep -niE "avversari|aggira|attacc" .claude/skills/coordinamento/*.md` → solo nella
    frase che spiega di evitarle;
  - ogni regola del README attuale e delle memorie da cancellare (spec, «Memoria personale»)
    si ritrova nella skill, in `herdr.md` o in `AGENTS.md`: lista di controllo nel messaggio
    di commit.
- [ ] **Passo 5:** commit «Istruzioni: skill del coordinatore, README come rimando».

### Compito 3: protocollo dei worker e brief del revisore

**File:**
- Modifica: `progetto/coordinamento/protocollo-worker.md`
- Modifica: `progetto/coordinamento/brief/revisore.md`

- [ ] **Passo 1:** protocollo: togliere lingua, Context7 e dipendenze ripetute (rimando ad
  `AGENTS.md`); aggiungere in «Contesto»: skill superpowers già attive; il rilascio in
  produzione non lo fa mai il worker; dopo un `/clear` o con «continuiamo» si rileggono brief e
  protocollo, la skill `coordinamento` non è per i worker.
- [ ] **Passo 2:** revisore: titolo «Brief del revisore»; «Sii avversariale…» → «Cerca ciò che
  è sbagliato, mancante, incoerente o rischioso; non limitarti a confermare.»
- [ ] **Passo 3:** controlli: `grep -niE "avversari" progetto/coordinamento/brief/revisore.md
  progetto/coordinamento/protocollo-worker.md` → nessun risultato; `wc -l` del protocollo non
  maggiore di oggi (68).
- [ ] **Passo 4:** commit «Istruzioni: protocollo dei worker e brief del revisore».

### Compito 4: verifica con sessioni nuove e PR

**File:**
- Modifica: `progetto/superpowers/specs/2026-10-17-istruzioni-agenti.md` (solo se la verifica
  cambia qualcosa)

- [ ] **Passo 1:** worktree temporaneo fuori dalla cartella del progetto, così il ruolo è
  quello del coordinatore: `git worktree add --detach <scratchpad>/verifica-main HEAD`.
- [ ] **Passo 2:** sessioni `claude -p` nuove (permesso di sola lettura:
  `--permission-mode plan`), una domanda per sessione, risposte salvate in scratchpad:
  - V1 (temporaneo): «riprendiamo» → attiva la skill, legge registro e piano, presenta lo
    stato, chiede il via. Senza herdr accessibile basta che descriva i passi;
  - V2 (temporaneo): «come si avvia un worker?» → dalla skill e da `herdr.md`;
  - V3 (temporaneo): «correggi il refuso "Aggungi" in `web/src/...`» (file vero scelto al
    momento) → propone un worker, non modifica;
  - V4 (temporaneo): «chi unisce una PR scritta da te? e una di un worker?» → «mergia»
    dell'utente / coordinatore dopo revisione e CI `pass`;
  - V5 (questo worktree): «continuiamo» → si comporta da worker (brief e protocollo), non
    attiva `coordinamento`;
  - V6 (questo worktree): «quante copie di AGENTS.md hai nel contesto e da quali percorsi?»
    → una, oppure lo segnalo nella PR;
  - V7 (`codex exec` nel temporaneo, sola lettura): «che ruolo hai e cosa devi leggere se ti
    avvio con brief/revisore.md?» → revisore, file giusti.
- [ ] **Passo 3:** se una risposta è sbagliata: correggere il file responsabile, commit,
  ripetere solo quella domanda (al massimo due giri, poi annotarlo nella PR).
- [ ] **Passo 4:** `git worktree remove <scratchpad>/verifica-main`.
- [ ] **Passo 5:** push e `gh pr create` verso `main`, descrizione in italiano: cosa cambia,
  domande e risposte V1–V7, elenco della memoria da cancellare e tenere (spec), modello del
  blocco «Stato corrente» da applicare al registro, «Decisioni da riportare nella specifica».
  Poi `STATO: PR_APERTA <url>`.
