# herdr: worker, eventi e messaggi

Riferimento operativo della skill `coordinamento`. Gli script sono in
`progetto/coordinamento/`. I worker stanno nelle tab «W…», i revisori nelle tab «R …» del
workspace `w1`.

## Avviare un worker

1. Branch e worktree: `git worktree add .worktrees/<nome> -b <branch> main`.
2. Brief approvato dall'utente in `progetto/coordinamento/brief/<brief>.md`.
3. Tab e sessione:

```bash
herdr tab create --workspace w1 --label "W15 <tema>" --no-focus   # → result.root_pane.pane_id
herdr pane run <pane> "cd <worktree> && claude --permission-mode auto -n 'W15 <tema>'"
herdr agent prompt <pane> "Leggi progetto/coordinamento/brief/<brief>.md e progetto/coordinamento/protocollo-worker.md ed eseguili."
```

Le skill superpowers sono già attive nella sessione del worker: non serve installarle.
Annota tab, pane, branch e worktree nel registro («Stato corrente»).

## Attesa degli eventi

Ascoltatore continuo: `progetto/coordinamento/eventi.py`, avviato con lo strumento Monitor
di Claude Code (`python3 -u <percorso>/eventi.py 2>&1`, `timeout_ms` massimo, 30 minuti; lo
riarmi a ogni scadenza). Usa `events.subscribe` del socket di herdr: nessun polling e
nessun buco fra un'attesa e l'altra. Ogni riga è un evento, `<pane> <etichetta> | <evento>`:

- all'avvio, tutto ciò che non è ancora segnato come visto (come `attendi.py --stato`);
- un worker diventa `blocked` (menu di scelta, `MENU: <domanda>`, o richiesta di permesso);
- un worker si ferma (`idle` o `done`) dopo aver lavorato: ultima riga `STATO:` nuova,
  oppure «fermo senza nuovo STATO» (per esempio ha presentato un design in prosa e aspetta);
- un revisore stampa `REVISORE_FINITO`.

Ogni 2 minuti fa anche un controllo di riconciliazione come `attendi.py --stato` (herdr a
volte non consegna `REVISORE_FINITO`). Trova da solo worker e revisori e rinnova
l'iscrizione quando si aprono o chiudono pane. Le righe `STATO:` sono riconosciute con
un'impronta delle righe precedenti: due `STATO: DOMANDA` uguali per domande diverse sono
eventi distinti.

- Dopo aver gestito un evento: `attendi.py --visto <pane>` (salva in `visti.txt`).
- `attendi.py --stato` mostra tutti i pane con lo stato e l'ultimo evento.
- Uno stato che aspetta l'utente si segna come visto e si annota nel registro.
- `attendi.py` senza argomenti (polling) solo come ripiego se il socket non risponde.

## Messaggi ai worker

- `herdr agent prompt <pane> "<testo>"`: rifiuta l'invio se l'agente è `blocked` (menu
  aperto) invece di scrivere nel menu.
- Con un menu aperto (ultime righe con «Enter to select») leggi la domanda e rispondi solo
  con il numero dell'opzione (`herdr pane send-text <pane> "1"`); manda le informazioni dopo,
  a menu chiuso. Il testo inviato a un menu aperto finisce nel menu e l'Invio seleziona
  l'opzione evidenziata.
- Il brainstorming dei worker fa domande a scelta multipla: si risponde con il numero
  dell'opzione o con testo libero, dopo aver letto il pane.
- Messaggi lunghi (oltre 2-3 righe) in un file
  `progetto/coordinamento/messaggi/<worker>-<nn>-<tema>.md`; al worker solo «Leggi
  <percorso> ed eseguilo»: con `send-text` i testi lunghi arrivano tagliati.

## `/clear` e ripresa di un worker

Solo con il worker fermo (`idle`, ultima riga `STATO:`) e il lavoro committato
(`git -C <worktree> status` pulito). Poi:

```bash
herdr agent prompt <pane> "/clear"
herdr agent prompt <pane> "Leggi progetto/coordinamento/brief/<brief>.md e progetto/coordinamento/protocollo-worker.md. Sei nella fase <fase>: la tua spec è <percorso>, il tuo piano <percorso>. <Cosa fare ora>."
```

Il messaggio di ripresa cita sempre brief, fase, spec e piano: è ciò che dice alla sessione
nuova che è un worker e non il coordinatore.

## Comandi utili

```bash
herdr pane get <pane>                                   # agent_status
herdr pane read <pane> --source recent-unwrapped --lines 80
herdr pane list                                         # id, etichetta, cwd
herdr tab list --workspace w1
progetto/coordinamento/attendi.py --stato
```
