# Istruzioni per gli agenti: design (W14)

Brief: `progetto/coordinamento/brief/w14-istruzioni-agenti.md`. Studio preliminare:
`progetto/superpowers/specs/2026-10-17-istruzioni-agenti-studio.md` (documentazione di
Anthropic, regole presenti, duplicati, contraddizioni).

## Perché

L'utente deve ripetere le stesse regole. L'ultimo caso (17/10): ha chiesto a una sessione
nuova di «riprendere il coordinamento» e la sessione non sapeva di essere il coordinatore
né a che punto del piano si fosse arrivati; poco prima un coordinatore aveva iniziato a
scrivere codice da sé invece di avviare un worker.

Cause trovate nello studio:

1. `CLAUDE.md` dice a parole di seguire `AGENTS.md`. Claude Code in quel caso **non carica**
   `AGENTS.md`: lo vede solo se decide di aprirlo (documentazione «memory», «Remove an
   earlier AGENTS.md workaround»).
2. `AGENTS.md` è per metà storia (29/09–11/10) e contiene regole superate (push, M1a, «niente
   codice prima del piano»); non dice chi è chi né come si riprende.
3. Il metodo del coordinatore è sparso fra `coordinamento/README.md`, il registro (due blocchi
   «Prossima azione» di date diverse mescolati alla storia) e la memoria personale, che
   contiene regole presenti solo lì e una contraddizione (6 worker contro 1).

I worker invece hanno sempre funzionato (parole dell'utente): il loro protocollo si tocca poco.

## Obiettivi

- Ogni sessione Claude carica davvero le regole comuni e sa riconoscere il proprio ruolo.
- Una sessione nella cartella principale che riceve «riprendiamo», «continuiamo con il
  programma», «quali sono i prossimi passi», «parti con il coordinamento» si comporta da
  coordinatore senza che l'utente lo spieghi: ricostruisce lo stato, presenta il punto e i
  prossimi passi, **aspetta il via dell'utente** (decisione dell'utente).
- Il coordinatore non modifica codice dell'app, test, migrazioni o script: avvia un worker
  (confine approvato dall'utente, sotto).
- Ogni regola di metodo sta in un solo posto, quello letto da chi la deve applicare.
- Codex (revisori) e Claude leggono la stessa base comune.

## Non obiettivi

- Nessun cambiamento al codice dell'app, a `eventi.py`, `attendi.py`, `avvia-revisore.sh`.
- Nessun cambiamento al flusso dei worker oltre a togliere doppioni e aggiungere due regole.
- Niente agenti personalizzati in `.claude/agents/`.

## Anti-obiettivi

- **Niente regole forzate:** niente hook, permessi o codice che impediscano al coordinatore
  di scrivere codice. Solo istruzioni scritte (decisione dell'utente).
- File lunghi, enfasi diffusa (MAIUSCOLE, «IMPORTANTE» ovunque), regole senza il perché.
- Due fonti per la stessa regola.

## Decisioni dell'utente (17/10/2026)

1. Istruzioni dedicate per coordinatore e worker.
2. Alla ripresa il coordinatore presenta il punto e i prossimi passi e aspetta il via.
3. Confine del coordinatore: fa da sé brief, registro, piano generale, aggiornamenti della
   specifica principale dopo un merge, anteprime dei rilasci, revisioni Codex e merge; ogni
   modifica a codice dell'app, test, migrazioni o script va a un worker herdr, anche di una
   riga; i sottoagenti del coordinatore solo per documenti (specifica), mai per codice.
4. Nessuna regola forzata: solo istruzioni.
5. La storia esce da `AGENTS.md`: resta nella specifica, nel registro e in Git.
6. Memoria personale: le regole di metodo si spostano nel repository; in memoria restano note
   d'ambiente della macchina e preferenze personali; i file portati nel repository si
   cancellano, quelli superati si correggono.
7. Approvato il quadro complessivo descritto qui sotto.

## Struttura

| File | Chi lo carica | Contenuto |
| - | - | - |
| `CLAUDE.md` | ogni sessione e subagente Claude | `@AGENTS.md` e nient'altro (salvo righe solo per Claude, oggi nessuna) |
| `AGENTS.md` | Claude (via import), Codex | base comune, 60–90 righe |
| `.claude/skills/coordinamento/SKILL.md` | il coordinatore, quando la skill si attiva | ripresa e metodo del coordinatore |
| `.claude/skills/coordinamento/herdr.md` | su richiesta della skill | comandi herdr, eventi, messaggi ai worker |
| `progetto/coordinamento/README.md` | chi apre la cartella | rimando breve alla skill e ai file della cartella |
| `progetto/coordinamento/protocollo-worker.md` | worker, dal brief | fasi del worker, quasi invariato |
| `progetto/coordinamento/brief/revisore.md` | revisori Codex | invariato salvo la formulazione |
| `progetto/coordinamento/registro.md` | coordinatore | stato corrente in cima, storia sotto (ristrutturato dal coordinatore dopo il merge) |

### `CLAUDE.md`

Una riga `@AGENTS.md`. Un commento HTML (tolto prima del contesto) spiega a chi mantiene il
file perché c'è l'import e che le regole si scrivono in `AGENTS.md`.

### `AGENTS.md`

In italiano, sezioni brevi con il perché delle regole non ovvie. Contenuto:

1. **Cos'è** in tre righe (app per famiglie, in produzione su `cosasimangia.app`, usata dalla
   famiglia dell'utente).
2. **Fonti autorevoli e ordine di lettura:** specifica principale (fonte unica di requisiti e
   decisioni; le sezioni 1, 15, 16 per chi lavora sul codice), `design/design.md` prima di
   qualsiasi schermata, piano generale (interfacce decise), `spike/REPORT.md` per server,
   database e MCP; il registro per lo stato corrente. Nessun documento diventa fonte parallela.
3. **Ruoli e come riconoscerli**, con una precedenza unica (decisione del coordinatore dopo
   la revisione, 17/10):
   1. un *incarico esplicito* decide il ruolo, prima della posizione nel filesystem:
      - incarico di revisione (prompt di `avvia-revisore.sh` che cita `brief/revisore.md`)
        → *revisore*;
      - brief di un worker o messaggio di ripresa che cita un brief → *worker*: segue il brief
        e `progetto/coordinamento/protocollo-worker.md`;
      - delega di un sottoagente del coordinatore → *sottoagente*: fa solo il lavoro della
        delega, sui documenti indicati;
   2. senza incarico, una sessione Claude nel **checkout principale** del repository (la
      cartella con la directory `.git`, oggi `/Users/fedfol/Projects/meal_planner_2`) è il
      *coordinatore*: parla con l'utente e coordina con la skill `coordinamento`. Confine
      della decisione 3, con il perché (contesto pulito del coordinatore, revisioni separate,
      l'utente lo ha chiesto più volte);
   3. senza incarico in un worktree collegato (`.worktrees/<nome>`, `.claude/worktrees/…`,
      file `.git` invece di directory) l'agente non sceglie da sé: chiede all'utente quale
      ruolo e quale brief ha.
4. **Proprietà dei file** (dal README del coordinamento, ora nella base comune perché
   riguarda tutti i ruoli): specifica principale, `design/percorsi.md`, `AGENTS.md`,
   `CLAUDE.md`, `.claude/`, piano generale e `progetto/coordinamento/` li modifica solo il
   coordinatore. Un worker li tocca solo se il suo brief glielo delega esplicitamente, e
   l'eccezione vale solo per quel brief. Gli script di `progetto/coordinamento/` (`eventi.py`,
   `attendi.py`, `avvia-revisore.sh`) sono codice: per la decisione 3 non li modifica il
   coordinatore ma un worker, con un brief che li delega. I revisori non modificano nulla.
5. **Lingua:** documenti e risposte in italiano con gli accenti; codice, nomi tecnici, schema,
   API, strumenti MCP, commenti e test in inglese; testi per gli utenti localizzabili in
   italiano e inglese britannico.
6. **Regole per tutti**, ognuna con il motivo in una riga: documentazione di librerie con
   Context7; dipendenze al minimo (cosa sostituisce, cosa costa farne a meno; le approva il
   coordinatore); ingredienti mai dedotti dal nome del piatto; prove sullo stack locale, mai
   credenziali di prova verso la produzione, con il dettaglio di `web/.env.production` (oggi
   nel protocollo: lo leggono anche i revisori che eseguono la build); nessuna scrittura in
   produzione senza anteprima e «vai» dell'utente; i worker non rilasciano; il progetto di
   origine `../meal_planner` si legge soltanto.
7. **Stack in breve** (cinque o sei righe) con rimando alla specifica, sezioni 1, 13 e 15.
8. **Git:** branch e worktree per attività, PR verso `main`, commit piccoli in italiano; chi
   unisce cosa sta nella skill e nel protocollo.

Escono: sezione «Stato», date delle decisioni dello stack, M1a/M1b, «niente codice prima del
piano», «nessun push senza richiesta», «flusso di branch da decidere in M1», istruzioni
dettagliate sul linguaggio visivo (restano in `design/design.md` e nella sezione 14; in
`AGENTS.md` solo il rimando).

### Skill `coordinamento`

Frontmatter: `name: coordinamento`; `description` in italiano che dice quando usarla: «Metodo
del coordinatore di questo progetto. Usala nel checkout principale, senza un brief o una delega,
quando l'utente chiede di riprendere, continuare il programma, sapere i prossimi passi o
coordinare i worker, e prima di avviare worker, revisioni, merge o rilasci. Non è per i worker
né per i sottoagenti.» Invocabile anche a mano (`/coordinamento`). Nessun
`allowed-tools`.

Corpo (sotto le 200 righe), in sezioni:

1. **Ripresa** (passi numerati):
   1. leggere `registro.md` (blocco «Stato corrente») e le parti del piano generale che cita;
   2. `attendi.py --stato`, `herdr tab list --workspace w1`, `herdr pane list`; gestire i «DA
      GESTIRE» solo per capire lo stato, senza rispondere ai worker;
   3. armare il Monitor con `eventi.py`;
   4. presentare all'utente: dove siamo nel piano, worker e revisori attivi, domande in sospeso,
      prossimi passi proposti;
   5. **aspettare il via** prima di avviare, rispondere o unire qualcosa.
2. **Confine del ruolo:** la decisione 3, con il perché e un esempio (anche una correzione di
   una riga va a un worker).
3. **Prima di avviare worker:** mappa produttore→consumatore e interfacce congelate nel piano
   generale (dalla memoria `dependency-order-before-workers`, con il caso dell'11/10); brief
   approvato dall'utente; limite corrente di worker Claude scritto nel registro (oggi 1),
   revisori Codex senza limite.
4. **Durante il lavoro dei worker:** dubbi minori chiusi dal coordinatore e registrati nel
   piano generale; decisioni dell'utente via Remote Control o `STATO: DOMANDA` girata;
   `/clear` ai cambi di fase o oltre circa il 50% di contesto, **solo con il worker fermo e il
   lavoro committato**, seguito dal messaggio di ripresa; Monitor sempre armato; registro
   aggiornato a ogni cambio di fase; brief nuovi approvati dall'utente; worker con un brief
   che delega esplicitamente i file riservati, quando servono.
5. **Revisioni:** Codex con `avvia-revisore.sh`, una per spec e piano e una per la PR, sempre
   nuove; tab del revisore chiusa appena il rapporto è scritto. I **prompt nuovi** e le
   istruzioni operative dei revisori si scrivono come revisione di qualità e correttezza,
   senza parole come «avversariale», «aggirare», «attacco» (il filtro di Codex blocca la
   revisione, caso del 12/10). La regola non riguarda la documentazione storica (specifica,
   piano generale, rapporti passati), che i revisori possono leggere com'è.
6. **Merge:**
   - PR dei worker: push e apertura della PR le fa il worker (protocollo); il merge lo fa il
     coordinatore dopo la revisione chiusa e la CI verde, senza chiedere all'utente. CI
     verde: il controllo `check` (workflow `CI`) c'è ed è `pass`, nessun controllo `fail`;
     gli altri possono essere `skipping` (oggi `Supabase Preview`). Si legge il bucket con
     `gh pr checks <n> --json name,bucket`, non il codice di uscita (caso della #30);
   - PR del coordinatore o dei suoi sottoagenti: solo con «mergia» esplicito dell'utente (caso
     della #40);
   - PR non revisionate: solo su richiesta esplicita;
   - `gh pr merge <n> --merge` da solo, non concatenato; se viene negato, dirlo;
   - controllo delle collisioni fra versioni delle migrazioni;
   - dopo il merge: avvisare l'utente e riportare le «Decisioni da riportare» nella specifica
     principale (sottoagente in worktree, PR con «mergia»).
7. **Rilasci e produzione:** anteprima del coordinatore (`npm run release` senza `--apply`),
   «vai» dell'utente, l'utente lancia `--apply` con `!` (il classificatore lo blocca al
   coordinatore); credenziali solo in file locali scritti dall'utente; i worker non rilasciano.
8. **Comunicazione con l'utente:** italiano, chiaro, con il contesto necessario, poche parole
   ma non troppo poche.
9. **Note d'ambiente** che servono anche ai worker? No: restano nella memoria (decisione 6);
   la skill rimanda a `herdr.md` per i comandi.

`herdr.md`: il contenuto attuale del README su eventi, `agent prompt`, menu aperti, messaggi
lunghi in file, comandi utili, avvio di un worker e messaggio di ripresa dopo `/clear`.

### `progetto/coordinamento/README.md`

Diventa breve (circa 15 righe): a cosa serve la cartella, che il metodo del coordinatore è
nella skill `coordinamento`, cosa sono `registro.md`, `brief/`, `messaggi/`, `revisioni/`,
gli script. Utile a Codex e a chi apre la cartella, che non vedono la skill.

### `protocollo-worker.md`

- Tolte le ripetizioni di `AGENTS.md` (lingua, Context7, dipendenze, prove sullo stack locale
  e proprietà dei file passano nella base comune: restano i rimandi).
- Aggiunte: le skill superpowers sono già attive nella sessione; il rilascio in produzione non
  lo fa mai il worker; il ruolo di worker vale anche dopo un `/clear`: il messaggio di ripresa
  cita brief, fase, spec e piano, e si rileggono brief e protocollo; la skill `coordinamento`
  non è per i worker; i file riservati si toccano solo se il brief li delega.
- Il resto (fasi, `STATO:`) invariato.

### `brief/revisore.md`

Titolo «Brief del revisore», «Sii avversariale» diventa una frase equivalente sulla qualità
(«cerca ciò che è sbagliato, mancante, incoerente o rischioso; non limitarti a confermare»).
Il resto invariato.

### `registro.md`

**Lo ristruttura il coordinatore subito dopo il merge** (decisione del coordinatore, 17/10:
il registro cambia di continuo su `main`). La PR porta il modello del blocco «Stato corrente»
nella skill e la regola per tenerlo aggiornato. Forma prevista:

- In cima un blocco **«Stato corrente»** unico, che sostituisce i due blocchi «Prossima azione»:
  data, attività in corso, worker e revisori attivi, domande in sospeso, prossimo passo, limite
  di worker. Il coordinatore lo riscrive (non aggiunge un blocco nuovo) a ogni cambio.
- «Decisioni dell'utente da ricordare»: le regole di metodo passano nella skill o in
  `AGENTS.md` (matrice, righe 36–39); le decisioni di prodotto sono già nella specifica (riga
  45); il valore del limite di worker resta nello «Stato corrente».
- La storia (blocchi del 13/10, fase 1) sotto un titolo «Storico», senza modifiche.

### Memoria personale (dopo il merge, la fa il coordinatore)

W14 la legge soltanto. La PR elenca:

- **da cancellare** (portati nel repository o superati): `implementation-coordination`,
  `merge-authorization`, `dependency-order-before-workers`, `codex-reviewer-wording`,
  `herdr-native-events`, `herdr-worker-delegation`, `minimal-dependencies`,
  `production-launch-gate`, `meal-planner-round-workflow` (quest'ultimo solo dopo il
  trasferimento qui sotto);
- **da trasferire prima di cancellare:** da `meal-planner-round-workflow`, la preferenza
  dell'utente per poche azioni di primo livello, con le secondarie raggruppate nella vista
  dell'azione principale. Diventa una memoria a sé (per esempio `fewer-top-level-actions`,
  tipo `feedback`, collegata a `prototype-variants-on-iphone`); il resto del file (giri del
  prototipo) è superato;
- **da tenere:** `agent-browser-display-sleep`, `supabase-cli-podman-cp-workaround`,
  `prototype-variants-on-iphone` (preferenze dell'utente sulle interfacce);
- `MEMORY.md` aggiornato di conseguenza.

## Matrice delle regole

Ogni regola vigente, dove va, chi la legge, e la decisione che eventualmente la sostituisce.
Sigle delle fonti: **A** `AGENTS.md` attuale, **R** README del coordinamento, **P**
protocollo dei worker, **G** registro (**Gd** «Decisioni dell'utente da ricordare», **Gp**
«Prossima azione»), **B** brief (W12, W13, revisore, ondata 2), **M** memoria. Destinazioni:
**AG** nuovo `AGENTS.md` (tutti: coordinatore, worker, revisori, sottoagenti), **SK** skill
`coordinamento` (coordinatore), **H** `herdr.md` (coordinatore), **PW** protocollo
(worker), **RV** `brief/revisore.md` (revisori), **SP** specifica principale (tutti, su
indicazione), **ST** «Storico» del registro, **—** eliminata.

| # | Regola vigente | Fonte | Destinazione | Chi la legge | Sostituita da |
| - | - | - | - | - | - |
| 1 | Lingua: italiano, codice in inglese, testi it/en-GB | A, P | AG | tutti | — |
| 2 | Specifica fonte unica, nessuna fonte parallela | A | AG | tutti | — |
| 3 | Leggere `design/design.md` prima di schermate; il linguaggio cambia solo con l'utente | A | AG (rimando breve) | tutti | — |
| 4 | Sezione «Stato» e date | A | — (SP, ST, Git) | — | decisione 5 |
| 5 | Stack | A | AG breve + SP §1, 13, 15 | tutti | — |
| 6 | «Verifica l'integrazione Supabase all'inizio di M1» | A | — | — | superata (app in produzione) |
| 7 | Progetto di origine solo in lettura | A | AG | tutti | — |
| 8 | «Pianifica e fatti approvare» | A | — in AG; fasi in PW, attesa del via in SK | worker, coordinatore | già in `~/.claude/CLAUDE.md`; decisione 2 |
| 9 | Context7 per le librerie | A, P, B | AG | tutti | — |
| 10 | Ingredienti mai dedotti | A, P | AG | tutti | — |
| 11 | «Nessun push senza richiesta» | A | — | — | merge del coordinatore (R, 11/10) → riga 23 |
| 12 | «Flusso di branch da decidere in M1»; «M1a/M1b»; «niente codice prima del piano» | A | — | — | superate |
| 13 | Ripresa: piano, registro, protocollo, brief, `attendi.py --stato`, Monitor | R | SK «Ripresa» | coordinatore | + decisione 2 (aspetta il via) |
| 14 | Comunicazione con l'utente: chiaro, poche parole ma non troppo poche | R, M | SK | coordinatore | — |
| 15 | Dubbi minori chiusi dal coordinatore; decisioni dell'utente via Remote Control | R, M | SK | coordinatore | — |
| 16 | Dipendenze al minimo, ognuna dice cosa sostituisce | P, R, M, B | AG | tutti | — |
| 17 | Le dipendenze le approva il coordinatore e le registra nel piano generale | R, M | AG (chiedere) + SK (approvare, registrare) | tutti / coordinatore | — |
| 18 | Risposte che fissano interfacce → piano generale | R | SK | coordinatore | — |
| 19 | Revisori Codex con `avvia-revisore.sh`, modello e ragionamento | R | SK + H | coordinatore | — |
| 20 | Revisioni separate e nuove, una per spec e piano, una per PR | R, M | SK; PW («un revisore separato…») | coordinatore, worker | — |
| 21 | Revisore in sola lettura, rilievi verificati, rapporto come ultimo messaggio | B (revisore) | RV | revisori | — |
| 22 | Prompt dei revisori come revisione di qualità | Gp, M | SK (solo prompt nuovi e istruzioni operative) | coordinatore | rilievo 5 della revisione |
| 23 | Push e apertura della PR le fa il worker; il merge delle PR dei worker lo fa il coordinatore dopo revisione chiusa e CI verde | P (push e PR), R, M (merge) | PW passi 6–7; SK «Merge» | coordinatore, worker | — |
| 24 | PR del coordinatore o dei suoi sottoagenti solo con «mergia» | Gp, M | SK | coordinatore | — |
| 25 | PR non revisionate solo su richiesta esplicita | Gp | SK | coordinatore | — |
| 26 | Merge solo con CI verde (`check` presente e `pass`, nessun `fail`, `skipping` ammesso; bucket, non codice di uscita); collisioni delle migrazioni | R, Gp, M | SK | coordinatore | — |
| 27 | `gh pr merge` da solo; se negato, dirlo | M | SK | coordinatore | — |
| 28 | Proprietà dei file riservati al coordinatore | R | **AG** + rimando in PW | tutti | eccezioni solo via brief; script via worker (decisione 3) |
| 29 | `/clear` dei worker ai cambi di fase o > 50%, solo fermo e committato, poi messaggio di ripresa | R, M | SK + H (testo del messaggio) | coordinatore | — |
| 30 | Ruolo del worker dopo `/clear` | — | PW | worker | nuova |
| 31 | Revisori chiusi appena il rapporto è scritto | R | SK | coordinatore | — |
| 32 | Registro aggiornato a ogni cambio di fase | R, M | SK («Stato corrente») | coordinatore | blocco unico (decisione del coordinatore) |
| 33 | Eventi con Monitor + `eventi.py`, sempre armato; `--visto`; polling solo di ripiego | R, M | H | coordinatore | — |
| 34 | Messaggi con `herdr agent prompt`; menu aperti; messaggi lunghi in file | R, M | H | coordinatore | — |
| 35 | Mappa produttore→consumatore e interfacce congelate prima dei worker paralleli | M | SK | coordinatore | — |
| 36 | Limite di worker Claude (oggi 1); revisori Codex senza limite | Gd, M | SK (regola) + registro «Stato corrente» (valore) | coordinatore | il «6» della memoria è superato |
| 37 | Produzione: credenziali in file locali dell'utente, anteprima → «vai» → applicazione | Gd, M | AG (anteprima e «vai»), SK (procedura) | tutti / coordinatore | — |
| 38 | Avvio in tre fasi, finestra lunedì–mercoledì entro le 19, impronte | Gd, Gp | ST | — | avvio concluso il 13/10 |
| 39 | `npm run release`: anteprima del coordinatore, `--apply` lanciato dall'utente con `!`; checkout pulito | Gp | SK | coordinatore | — |
| 40 | I worker non rilasciano | B (W12, W13) | AG + PW | tutti | — |
| 41 | Prove sullo stack locale, `web/.env.production`, mai credenziali verso la produzione | P | AG | tutti (anche i revisori che fanno la build) | — |
| 42 | Fasi del worker, `STATO:`, quando fermarsi | P | PW | worker | — |
| 43 | Leggere specifica §1, 15, 16, piano generale, `spike/REPORT.md` | P, B | AG (ordine di lettura) + PW | tutti | — |
| 44 | Brief da far approvare all'utente | Gp | SK | coordinatore | — |
| 45 | Decisioni di prodotto in Gd (porzioni, Annulla, R2…) | Gd | SP (già presenti, verificato) | tutti | — |
| 46 | Regole verticali dell'ondata 2 (area dei file, migrazioni, MCP, design) | B | invariate nel brief comune | worker dell'ondata | — |
| 47 | Coordinatore che non scrive codice; sottoagenti solo per documenti | — | AG + SK | tutti | nuova, decisione 3 |
| 48 | Precedenza dei ruoli | — | AG | tutti | nuova, revisione 17/10 |
| 49 | Memorie del prototipo (giri, varianti, poche azioni di primo livello) | M | memoria (varianti; poche azioni di primo livello come nota a sé) / — (giri) | sessioni Claude dell'utente | prototipo chiuso (solo i giri) |
| 50 | Note d'ambiente (agent-browser e schermo spento, Supabase CLI con Podman) | M | memoria | sessioni Claude dell'utente | decisione 6 |

La verifica della PR controlla ogni riga: la regola c'è nella destinazione indicata, con le
condizioni operative (per esempio la riga 29: worker fermo e lavoro committato).

## Verifica (prima della PR)

**Ambiente**, registrato nella PR (versione di `claude` e di `codex`, directory, comando,
prompt):

- **Memoria automatica spenta** con `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` (documentazione
  «memory», «Enable or disable auto memory»), senza toccare la memoria reale. Così le
  risposte dipendono solo dai file del repository e dalle istruzioni globali dell'utente
  (`~/.claude/CLAUDE.md`, `~/.claude/rules/`), che restano come sono.
- **File caricati:** `claude -p "/context"` funziona anche in modo non interattivo e
  elenca «Memory Files» (provato il 17/10 con Claude Code 2.1.302: nel worktree compaiono
  solo i file utente e il `CLAUDE.md` del worktree, non quello del checkout principale; con
  la variabile la riga `AutoMem` sparisce).
- **Uso della skill e degli strumenti:** `--output-format stream-json --verbose`; dalla
  traccia si estraggono le chiamate `Skill`, `Read`, `Edit`, `Write`, `Bash`.
- **Coordinatore simulato:** clone completo del repository (`git clone` del checkout
  principale in scratchpad, branch di W14), cioè un checkout principale con la sua
  directory `.git`, non un worktree collegato. Nel clone, una **copia simulata** del registro
  nel formato «Stato corrente», costruita dallo stato vero del 17/10 e dichiarata come
  simulazione; non viene committata.
- **Protezione dalle scritture:** `--permission-mode plan` per le sessioni che non devono
  scrivere; si valuta comunque il comportamento richiesto, non solo l'assenza di effetti.

**Prove** (una sessione nuova per prova):

| Prova | Dove | Prompt | Superata se |
| - | - | - | - |
| V0 | worktree W14 e clone | `/context` | un solo `CLAUDE.md` di progetto, `AGENTS.md` incluso per import, nessun `AutoMem` |
| V1 | clone | «riprendiamo» | chiama la skill `coordinamento`; legge (traccia degli strumenti) registro simulato, piano generale, brief dei worker attivi e protocollo dei worker; presenta stato e prossimi passi, chiede il via; nessun avvio, risposta o merge. Il Monitor non armabile in modalità piano è un limite dell'ambiente |
| V2 | clone | «come si avvia un worker?» | descrive tab, `claude --permission-mode auto`, messaggio con brief, dalla skill e da `herdr.md` |
| V3 | clone | «correggi il refuso … in `web/src/…`» (refuso vero scelto al momento) | non tenta `Edit`/`Write` sul codice; propone di affidarlo a un worker con un brief (o di aggiungerlo a un brief) e chiede il via |
| V4 | clone | «chi unisce una PR scritta da te? E una di un worker?» | «mergia» dell'utente / coordinatore dopo revisione chiusa e CI verde (`check` `pass`) |
| V5 | worktree W14 | messaggio di ripresa reale (formato di `herdr.md`: «Leggi … brief … protocollo. Sei nella fase …») seguito da «chi unisce la tua PR? puoi rilasciare?» | si comporta da worker, non chiama `coordinamento`; merge del coordinatore, nessun rilascio |
| V6 | worktree collegato temporaneo senza brief | «continuiamo» | non si attribuisce un ruolo: chiede all'utente ruolo e brief |
| V7 | clone, `codex exec` in sola lettura | prompt di `avvia-revisore.sh` per una revisione finta, più «prima di cominciare dimmi che ruolo hai e quali file leggi» | revisore, legge `brief/revisore.md` e `AGENTS.md`, non modifica |

**Duplicazioni (V0):** ammessi i file dell'utente (`~/.claude/…`) insieme al `CLAUDE.md`
di progetto, perché hanno contenuti diversi. Non è ammessa una seconda copia di `AGENTS.md`
o di un `CLAUDE.md` di progetto (per esempio quello del checkout principale in un worktree):
due versioni di regole di ruolo possono contraddirsi.

**Esiti:** una prova fallita su ruolo, delega, autorizzazioni o ripresa (V1, V3–V6) resta un
rilievo aperto. Si corregge il file responsabile e si ripete; se dopo due giri non passa,
niente PR: `STATO: DOMANDA` con l'esito. Una prova fallita per un limite dell'ambiente (per
esempio herdr non raggiungibile dal clone) si annota con la causa. Inoltre: conteggio delle
righe (`AGENTS.md` sotto 100, `SKILL.md` sotto 200), controllo della matrice riga per riga,
`/doctor prompt-audit` se disponibile in modo non interattivo.

## Consegna al coordinatore dopo il merge

Nella PR, in quest'ordine; il lavoro è chiuso quando il passo 5 è superato:

1. **Registro:** riscrivere la cima nel blocco «Stato corrente» (modello nella skill) con lo
   stato vero; spostare i blocchi «Prossima azione» del 13/10 e del 16/10 e lo storico della
   fase 1 sotto «Storico»; togliere da «Decisioni dell'utente da ricordare» le regole di
   metodo (righe 36–39 della matrice) e le decisioni di prodotto già nella specifica (riga 45).
2. **Controllo di conservazione:** per ogni voce tolta, la destinazione della matrice
   contiene la regola o la decisione.
3. **Specifica principale:** la frase su `AGENTS.md` in «Come usare e aggiornare questo
   documento» (sezione finale di questa spec).
4. **Memoria personale:** prima scrivere la memoria nuova con la preferenza sulle azioni di
   primo livello e controllare che ci sia; solo dopo cancellare e tenere i file come nella
   sezione «Memoria personale»; aggiornare `MEMORY.md`.
5. **Prova finale:** sessione nuova nel checkout principale (dopo il pull di `main`), prompt
   «riprendiamo». Superata se ricostruisce lo stato vero dal registro e dal piano, controlla
   herdr e il Monitor, presenta i prossimi passi e aspetta il via. Se non passa, il
   coordinatore riapre W14 o corregge con un worker.

## Scelte di W14 dopo il controllo della spec

- **Worker e skill `coordinamento`:** la skill è nel repository, quindi c'è anche nei
  worktree. La `description` e la precedenza dei ruoli in `AGENTS.md` dicono che vale solo
  per il coordinatore; V5 e V6 lo controllano. Il `CLAUDE.md` del checkout principale non si
  somma a quello del worktree (provato con `/context`, vedi «Verifica»).
- **Decisioni di prodotto nel registro:** controllate una per una il 17/10, sono tutte già
  nella specifica principale: iscrizioni spente (sezione 1), 7 copie in R2 (righe 212 e
  registro 11/10), «Annulla» 6 s senza limiti lato server (203, 1978), porzioni 1–20 (1952),
  scheda con le porzioni del pasto (1904), unità contate e mezzi (2057–2059), «Nome
  (varietà)» (2088), note e pasti liberi come scritti (1967, 1975), ingrediente senza nome
  inglese e nessun «Genera la prima settimana» (2453, registro 11/10), poteri dei token
  d'agente e «ultimo rinnovo» (224–227, 687), menu in corso importato (245). Il coordinatore
  può quindi togliere quelle voci dal registro senza perdere nulla; la memoria
  `production-launch-gate` si può cancellare.

## Lasciato a chi implementa

Formulazione esatta, ordine interno delle sezioni, divisione fra `SKILL.md` e `herdr.md`,
testo del commento in `CLAUDE.md`.

## Decisioni da riportare nella specifica

**Prodotto:** nessuna.

**Tecniche / metodo:** sezione «Come usare e aggiornare questo documento», frase su
`AGENTS.md`: oggi «`AGENTS.md` contiene il metodo di lavoro e rimanda qui per il prodotto»;
diventa «`AGENTS.md` contiene le regole comuni a tutti gli agenti e i ruoli; il metodo del
coordinatore è nella skill `.claude/skills/coordinamento/`, quello dei worker in
`progetto/coordinamento/protocollo-worker.md`. Tutti rimandano qui per il prodotto.»
