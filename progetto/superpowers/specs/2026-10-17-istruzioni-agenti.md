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
3. **Ruoli e come riconoscerli:**
   - *Coordinatore*: sessione Claude nel checkout principale del repository (oggi
     `/Users/fedfol/Projects/meal_planner_2`), cioè non sotto `.worktrees/` né
     `.claude/worktrees/`. Parla con l'utente e coordina:
     usa la skill `coordinamento`. Confine della decisione 3, con il perché (contesto pulito
     del coordinatore, revisioni separate, l'utente lo ha chiesto più volte).
   - *Worker*: sessione Claude in un worktree `.worktrees/<nome>` avviata con un brief; segue
     il brief e `progetto/coordinamento/protocollo-worker.md`.
   - *Revisore*: Codex avviato da `avvia-revisore.sh`; segue `brief/revisore.md`.
   - *Sottoagente del coordinatore*: lavora sul documento indicato nella delega.
   - In un caso dubbio (worktree senza brief, cartella principale su un altro branch) l'agente
     chiede all'utente quale ruolo ha.
4. **Lingua:** documenti e risposte in italiano con gli accenti; codice, nomi tecnici, schema,
   API, strumenti MCP, commenti e test in inglese; testi per gli utenti localizzabili in
   italiano e inglese britannico.
5. **Regole per tutti**, ognuna con il motivo in una riga: documentazione di librerie con
   Context7; dipendenze al minimo (cosa sostituisce, cosa costa farne a meno; le approva il
   coordinatore); ingredienti mai dedotti dal nome del piatto; prove sullo stack locale, mai
   credenziali di prova verso la produzione; nessuna scrittura in produzione senza anteprima e
   «vai» dell'utente; il progetto di origine `../meal_planner` si legge soltanto.
6. **Stack in breve** (cinque o sei righe) con rimando alla specifica, sezioni 1, 13 e 15.
7. **Git:** branch e worktree per attività, PR verso `main`, commit piccoli in italiano; chi
   unisce cosa sta nella skill e nel protocollo.

Escono: sezione «Stato», date delle decisioni dello stack, M1a/M1b, «niente codice prima del
piano», «nessun push senza richiesta», «flusso di branch da decidere in M1», istruzioni
dettagliate sul linguaggio visivo (restano in `design/design.md` e nella sezione 14; in
`AGENTS.md` solo il rimando).

### Skill `coordinamento`

Frontmatter: `name: coordinamento`; `description` in italiano che dice quando usarla: «Metodo
del coordinatore di questo progetto. Usala nella cartella principale quando l'utente chiede di
riprendere, continuare il programma, sapere i prossimi passi o coordinare i worker, e prima di
avviare worker, revisioni, merge o rilasci.» Invocabile anche a mano (`/coordinamento`). Nessun
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
   `/clear` ai cambi di fase con il messaggio di ripresa; Monitor sempre armato; registro
   aggiornato a ogni cambio di fase.
5. **Revisioni:** Codex con `avvia-revisore.sh`, una per spec e piano e una per la PR, sempre
   nuove; prompt come revisione di qualità e correttezza, senza parole come «avversariale»,
   «aggirare», «attacco» (il filtro di Codex blocca la revisione, caso del 12/10).
6. **Merge:**
   - PR dei worker: dopo la revisione chiusa e la CI `pass` (controllo del bucket, non del
     codice di uscita; caso della #30), senza chiedere all'utente;
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

- Tolte le ripetizioni di `AGENTS.md` (lingua, Context7, dipendenze in breve: restano i
  rimandi).
- Aggiunte: le skill superpowers sono già attive nella sessione; il rilascio in produzione non
  lo fa mai il worker; il ruolo di worker vale anche dopo un `/clear` (rileggere brief e
  protocollo).
- Il resto (fasi, `STATO:`, prove sullo stack locale) invariato.

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
- «Decisioni dell'utente da ricordare»: le regole di metodo passano nella skill; le decisioni
  di prodotto restano o vanno nella specifica se mancano; la voce del limite di worker resta
  nello stato corrente.
- La storia (blocchi del 13/10, fase 1) sotto un titolo «Storico», senza modifiche.

### Memoria personale (dopo il merge, la fa il coordinatore)

W14 la legge soltanto. La PR elenca:

- **da cancellare** (portati nel repository o superati): `implementation-coordination`,
  `merge-authorization`, `dependency-order-before-workers`, `codex-reviewer-wording`,
  `herdr-native-events`, `herdr-worker-delegation`, `minimal-dependencies`,
  `production-launch-gate`, `meal-planner-round-workflow`;
- **da tenere:** `agent-browser-display-sleep`, `supabase-cli-podman-cp-workaround`,
  `prototype-variants-on-iphone` (preferenze dell'utente sulle interfacce);
- `MEMORY.md` aggiornato di conseguenza.

## Verifica

Prima della PR, sessioni nuove non interattive (`claude -p`), con le domande e le risposte
riportate nella PR:

- nella cartella principale (o in un worktree temporaneo su `main` con i file nuovi, finché
  non sono uniti): «riprendiamo», «come si avvia un worker?», «chi unisce una PR scritta da
  te?», «correggi questo refuso in `web/src/...`» (atteso: propone un worker, non modifica);
- in un worktree di worker con un brief: «chi unisce la tua PR?», «puoi rilasciare in
  produzione?»;
- Codex (`codex exec`) nella radice: «che ruolo hai e cosa leggi?».

Esito atteso: risposte coerenti con le istruzioni, senza cercare in giro oltre ai file
indicati. Anche `/doctor prompt-audit` sui file nuovi, se disponibile. Conteggio delle righe:
`AGENTS.md` sotto 100, `SKILL.md` sotto 200.

## Scelte di W14 dopo il controllo della spec

- **Worker e skill `coordinamento`:** la skill è nel repository, quindi c'è anche nei
  worktree. La `description` e la sezione ruoli di `AGENTS.md` dicono che vale solo nella
  cartella principale; un worker che riceve «continuiamo» dopo un `/clear` rilegge brief e
  protocollo. Un caso di verifica lo controlla. Il `CLAUDE.md` della cartella principale non
  si somma a quello del worktree (in questa sessione, che è in un worktree, è caricato solo
  quello del worktree); la verifica lo ricontrolla.
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
