# Studio: istruzioni per gli agenti (W14, fase 1)

File di lavoro per il brainstorming di W14. Non è una spec: raccoglie cosa dice la
documentazione di Anthropic e com'è oggi il metodo del progetto.

## 1. Cosa dice la documentazione (17/10/2026)

Fonti: «Prompting Claude Opus 5.5», «Prompting best practices», Claude Code «memory»,
«best-practices», «skills», «sub-agents».

**Caricamento dei file (memory):**

- Claude Code legge `AGENTS.md` da solo **solo se non c'è un `CLAUDE.md`** nella cartella
  o sopra. Con un `CLAUDE.md` presente legge solo quello.
- Un `CLAUDE.md` che *dice a parole* di leggere `AGENTS.md` (il nostro caso) non lo
  carica: «Claude sees `AGENTS.md` only if it decides to open the file». Rimedi indicati:
  cancellare `CLAUDE.md`, oppure scriverci `@AGENTS.md` (import), oppure un symlink.
  L'import è la via consigliata per avere un file comune più istruzioni solo per Claude
  («Add any Claude-specific instructions below the import»).
- `.claude/rules/*.md` senza `paths` si caricano sempre; con `paths` solo quando Claude
  legge o scrive file corrispondenti. Si caricano anche insieme ad `AGENTS.md`.
- Gli import (`@file`) organizzano ma non risparmiano contesto: si caricano all'avvio.
- Commenti HTML a blocco (`<!-- -->`) tolti prima di arrivare al modello: note per chi
  mantiene i file, a costo zero.
- Il `CLAUDE.md` della radice sopravvive a `/compact` (riletto dal disco); le regole con
  `paths` si ricaricano quando si tocca di nuovo un file corrispondente.
- `/doctor prompt-audit` controlla i file di istruzioni (istruzioni vecchie, file
  inesistenti, contraddizioni).
- La memoria automatica (`~/.claude/projects/<repo>/memory/`) è per repository, condivisa
  fra i worktree, caricata in ogni sessione (prime 200 righe di `MEMORY.md`) **ma non
  nei subagenti**. Da verificare: i worker sono sessioni Claude nei worktree dello stesso
  repository, quindi probabilmente la vedono anche loro (stesso progetto git).

**Cosa scrivere (best practices, memory):**

- Sotto le 200 righe per file. «Would removing this cause Claude to make mistakes? If
  not, cut it.» File troppo lunghi: le regole importanti si perdono.
- Includere: comandi che Claude non indovina, convenzioni diverse dai default, etichetta
  del repository (branch, PR), decisioni architetturali, stranezze dell'ambiente, insidie
  non evidenti. Escludere: ciò che si ricava dal codice, informazioni che cambiano
  spesso, spiegazioni lunghe, descrizioni file per file.
- Quando aggiungere: Claude fa lo stesso errore due volte; l'utente ripete la stessa
  correzione; un nuovo arrivato avrebbe bisogno di quel contesto.
- Procedure in più passi o regole di un'area: in una **skill** o in una **regola con
  percorso**, non nel file principale.
- Istruzioni verificabili («Esegui `npm test` prima del commit», non «testa»).
- Enfasi («IMPORTANT») su una riga sola, se Claude continua a saltarla; se tutto è
  enfatizzato niente spicca.
- Spiegare il perché: Claude generalizza dalla motivazione.
- Contraddizioni fra file: Claude ne sceglie una a caso.
- Regole che devono valere sempre senza eccezioni: hook, non testo.

**Skill:** `.claude/skills/<nome>/SKILL.md`; la descrizione è sempre in contesto, il
corpo si carica solo all'uso. `disable-model-invocation: true` per procedure con effetti
che si lanciano a mano (`/nome`); file di supporto accanto. Le skill globali dell'utente
(superpowers) sono già attive per tutte le sessioni, worker compresi
(`~/.claude/settings.json`, `superpowers@claude-plugins-official: true`).

**Subagenti:** caricano CLAUDE.md, regole e AGENTS.md, ma non la memoria automatica.

**Opus 5.5:** segue bene istruzioni che nominano *in modo specifico* i comportamenti da
evitare e quelli voluti (per esempio i tipi di fermata); i resoconti sono già chiari;
tende a mettersi subito al lavoro, quindi conviene dire *dove guardare prima di agire*.
Le istruzioni del tipo «pensa bene prima» o «sii più aggressivo» vanno tolte o
attenuate.

**Codex:** legge `AGENTS.md` della radice del repository (non c'è un `~/.codex/AGENTS.md`).
I revisori ricevono anche `brief/revisore.md` dal prompt di `avvia-revisore.sh`.

## 2. Dove sta oggi il metodo

| Fonte | Righe | Chi la vede | Contenuto |
| - | - | - | - |
| `CLAUDE.md` | 3 | Claude (tutti) | «Segui `AGENTS.md`»: a parole, **non carica `AGENTS.md`** |
| `AGENTS.md` | 125 | Codex sempre; Claude solo se lo apre | lingua, cos'è, specifica, linguaggio visivo, **stato e storia** (6–11/10), stack, progetto di origine, 5 regole di lavoro |
| `progetto/coordinamento/README.md` | 107 | coordinatore, se lo legge | ripresa dopo `/clear`, regole del coordinatore, merge, eventi, comandi herdr |
| `protocollo-worker.md` | 68 | worker (dal brief) | fasi, `STATO:`, prove sullo stack locale |
| `brief/revisore.md` | 41 | revisori Codex | regole e formato del rapporto |
| `brief/ondata2-comune.md` | 27 | worker verticali | proprietà dei file, migrazioni, MCP, design |
| `registro.md` | 145 | coordinatore | stato, «Decisioni dell'utente da ricordare», «Prossima azione» con regole sparse |
| piano generale | 294 | tutti, su indicazione | interfacce decise, registro delle decisioni |
| memoria del coordinatore | 12 file | solo sessioni Claude di questo repository | correzioni dell'utente sul metodo |
| `~/.claude/CLAUDE.md`, `~/.claude/rules/` | — | ogni sessione Claude dell'utente | «Pianifica prima, fatti approvare»; Context7; agent-browser |

## 3. Regole presenti, per tema

**Ruoli**

- Coordinatore: coordina i worker herdr, chiude i dubbi minori, gira all'utente le
  decisioni di prodotto o architettura, Remote Control per i brainstorming (README).
- **Il coordinatore non scrive codice dell'app da sé**: non è scritto da nessuna parte.
  Il 17/10 l'utente ha dovuto ricordarlo.
- Sottoagenti del coordinatore (Agent tool in worktree) per lavori piccoli come
  l'aggiornamento della specifica: prassi nel registro (PR #40, #44, #50), non scritta
  come regola.
- Worker: protocollo; revisore: brief del revisore.

**Fasi del lavoro**

- Brainstorming → spec → piano → revisione → implementazione TDD → PR → revisione →
  merge (protocollo, README). Eccezioni per attività piccole decise nel brief (W13).
- `/clear` ai cambi di fase e messaggio di ripresa (README).
- Mappa produttore→consumatore e interfacce congelate prima di lanciare worker in
  parallelo: **solo in memoria** (`dependency-order-before-workers`).

**Limiti e strumenti**

- Numero di worker Claude: «un solo worker» (registro, 12/10 e 16/10; memoria
  `implementation-coordination` aggiornata in fondo). L'indice `MEMORY.md` dice ancora
  «6 herdr workers».
- Revisori sempre Codex, senza limite (README, registro, memoria).
- Formulazione dei prompt dei revisori: «revisione di qualità», non «avversariale»
  (memoria `codex-reviewer-wording`, registro punto 6). Ma `brief/revisore.md` dice «Sii
  avversariale» e il titolo è «Brief del revisore avversariale».
- Eventi herdr con Monitor + `eventi.py`, mai polling o `send-text` (README e memoria).
- Context7 per le librerie (AGENTS.md, protocollo, revisore, regola globale).
- agent-browser per il browser (regola globale, brief W12/W13).
- Skill superpowers nei worker: attive di default (plugin globale); nessun file lo dice.
  L'utente l'ha chiesto il 17/10.

**Git, PR, merge**

- AGENTS.md: «nessun push su GitHub senza richiesta esplicita dell'utente» e «il flusso
  di branch si decide in M1». **Superate**: dall'11/10 il coordinatore fa push, PR e
  merge (README, memoria).
- PR dei worker: le unisce il coordinatore dopo revisione chiusa e CI `pass` (README,
  registro, memoria `merge-authorization`).
- PR del coordinatore o dei suoi sottoagenti: solo con «mergia» esplicito dell'utente
  (registro punto 6, memoria). **Non è nel README.**
- PR non revisionate: solo su richiesta esplicita dell'utente (registro punto 7).
- `gh pr merge` da solo, non concatenato (memoria).
- Controllo `pass` della CI e collisioni di migrazioni (README, memoria).

**Produzione e rilasci**

- Anteprima → «vai» dell'utente → applicazione per ogni scrittura in produzione
  (registro, memoria `production-launch-gate`).
- `npm run release -- --apply` bloccato dal classificatore: il coordinatore fa
  l'anteprima, l'utente lancia con `!` (registro 16/10). Non nel README.
- Credenziali solo in file locali scritti dall'utente, mai in conversazione (registro).
- I worker non rilasciano (brief W12, W13; non nel protocollo).
- Prove locali senza produzione (protocollo).

**Lingua e contenuti**

- Italiano per documenti e risposte, inglese nel codice, testi localizzabili it/en-GB,
  ingredienti mai dedotti (AGENTS.md, ripetuto nel protocollo).
- Comunicazione con l'utente: «italiano, chiaro, con il contesto necessario, poche
  parole ma non troppo poche» (README, memoria).
- Dipendenze al minimo, ognuna dice cosa sostituisce (AGENTS.md no; protocollo, README,
  memoria, brief).

**Documenti e proprietà**

- Specifica principale fonte unica; «Decisioni da riportare nella specifica» nelle spec
  dei worker; aggiornamento della specifica da parte del coordinatore dopo il merge
  (AGENTS.md, protocollo, README).
- Solo il coordinatore modifica specifica, `percorsi.md`, `AGENTS.md`, piano generale e
  `coordinamento/` (README).

## 4. Contraddizioni

1. `CLAUDE.md` rimanda ad `AGENTS.md` solo a parole: per Claude le regole di `AGENTS.md`
   sono facoltative. Probabile causa di parte delle ripetizioni.
2. Push: AGENTS.md «mai senza richiesta» contro README «push, PR e merge li fa il
   coordinatore».
3. Numero di worker: indice della memoria «6» contro registro e corpo della memoria «1».
4. Revisore «avversariale» (brief, README «review avversariali») contro la regola di non
   usare quella parola con Codex.
5. AGENTS.md «Niente codice prima che l'utente approvi il piano», «M1a va
   ripianificato», «M1b non è ancora stato scritto»: superati, l'app è in produzione.
6. README «Push, PR e merge su `main` li fa il coordinatore (…) dopo la review» senza
   l'eccezione delle PR del coordinatore, che sta solo in registro e memoria.

## 5. Regole che esistono solo nella memoria personale

- Mappa produttore→consumatore prima dei worker paralleli.
- `gh pr merge` come comando isolato; se viene negato dirlo, non passarlo all'utente.
- Formulazione neutra dei prompt Codex (anche nel registro, non nel README).
- PR del coordinatore solo con «mergia» (anche nel registro, non nel README).
- agent-browser e display spento (`caffeinate`), soluzione della CLI di Supabase con
  Podman e porte uniche per stack paralleli: note d'ambiente utili anche ai worker.
- Prototipo: varianti nel pannello «Prova», giri con esecuzione inline: oggi poco
  rilevanti (prototipo chiuso).

## 6. Cose superate o da spostare

- In AGENTS.md: sezione «Stato» (storia 29/09–11/10), M1a/M1b, «niente codice prima…»,
  regola sul push, «Il prototipo completo è ancora da pianificare», «Verifica la
  configurazione dell'integrazione all'inizio di M1», date delle decisioni dello stack.
  Lo stack e le motivazioni stanno già nella specifica (sezioni 1, 13, 15).
- Nel registro: «Prossima azione» con due blocchi (16/10 e 13/10) e lo storico della fase
  1; regole di metodo mescolate allo stato.
- Nel README: la regola del merge è giusta ma incompleta; i comandi herdr sono una
  procedura lunga, adatta a una skill.

## 7. Domande per il brainstorming

1. Struttura: un `AGENTS.md` comune importato da `CLAUDE.md` più parti per ruolo
   (coordinatore, worker, revisore) in file o skill separati?
2. Cosa resta in `AGENTS.md` e cosa va nella specifica o nel registro (stato, storia,
   stack).
3. Uso di `.claude/rules/` (con o senza `paths`) e di skill di progetto per le procedure
   del coordinatore (avvio worker, revisione, merge, rilascio).
4. Lingua delle istruzioni.
5. Memoria personale: cosa spostare nel repository, cosa lasciare, cosa correggere.
6. Ruolo del coordinatore: come scrivere «non implementare da solo» e quando sono ammessi
   i sottoagenti.
