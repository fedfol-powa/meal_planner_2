# Coordinamento dei worker

Istruzioni per la sessione che coordina i worker herdr. **Dopo un `/clear` o in una
sessione nuova si riparte da qui**: tutto lo stato vive in questi file e nel piano
generale, non nella conversazione.

## Da leggere per riprendere

1. `progetto/superpowers/plans/2026-10-11-piano-generale.md`: ondate, attività, stato,
   interfacce decise, registro delle decisioni.
2. `progetto/coordinamento/registro.md`: worker attivi (tab, pane, branch, worktree),
   ultimo stato visto, domande in sospeso, prossima azione.
3. `progetto/coordinamento/protocollo-worker.md`: cosa sanno e fanno i worker.
4. I brief in `progetto/coordinamento/brief/`.

Poi `progetto/coordinamento/attendi.py --stato`, il Monitor con `eventi.py` (sezione «Attesa degli eventi»), `herdr pane list` e `herdr tab list --workspace w1`: gli id dei pane cambiano,
si riconoscono dall'etichetta della tab (`W1 piattaforma`…) e dal `cwd` del worktree.

## Regole del coordinatore

- Con l'utente: italiano, chiaro, con il contesto necessario, poche parole ma non
  troppo poche.
- Dubbi minori dei worker: li chiude il coordinatore, coerenti con specifica, design e
  decisioni registrate. Decisioni di prodotto o di architettura che spettano
  all'utente: domanda all'utente; se serve un brainstorming, si attiva il Remote
  Control sul worker (`/remote-control` nel pane) e si chiede all'utente di entrare lì.
- Le dipendenze nuove le approva il coordinatore (delega dell'utente, 11 ottobre 2026), con la regola delle dipendenze al minimo: ognuna dice cosa sostituisce e cosa costa farne a meno; si registrano nel piano generale.
- Ogni risposta data a un worker che fissa un'interfaccia o una decisione va registrata
  nel piano generale (sezioni «Interfacce decise» o «Registro»).
- Revisori con Codex, per distribuire il consumo (scelta dell'utente, 11 ottobre 2026): `progetto/coordinamento/avvia-revisore.sh <etichetta> <worktree> <rapporto> <istruzioni>` apre una tab e lancia `codex exec` con `gpt-6-astra` e ragionamento `high` (modificabili con `REVIEW_MODEL` e `REVIEW_EFFORT`); l'ultimo messaggio diventa il rapporto in `revisioni/`, il pane stampa `REVISORE_FINITO` alla fine. Context7 è configurato anche in Codex (`~/.codex/config.toml`, 11 ottobre 2026).
- Review avversariali sempre con un worker separato e nuovo, senza il contesto del
  worker autore: una per spec e piano, una per la PR.
- Push, PR e merge su `main` li fa il coordinatore (autorizzato l'11 ottobre 2026),
  dopo che la review avversariale del codice è chiusa senza rilievi aperti; poi
  avvisa l'utente e riporta le decisioni nella specifica principale.
- Solo il coordinatore modifica specifica principale, `design/percorsi.md`,
  `AGENTS.md`, il piano generale e questa cartella.
- **Contesto dei worker:** il coordinatore manda `/clear` a un worker ai cambi di fase
  (dopo l'approvazione di spec e piano, prima dell'implementazione; dopo l'apertura della
  PR, prima delle correzioni) o quando il contesto (`ctx:` nella barra di stato) supera
  circa il 50%, solo con il worker fermo e il lavoro già committato. Subito dopo gli
  manda il messaggio di ripresa: «Leggi progetto/coordinamento/brief/<brief>.md e
  progetto/coordinamento/protocollo-worker.md. Sei nella fase <fase>: la tua spec è
  <percorso>, il tuo piano <percorso>. <Cosa fare ora>.» I revisori si chiudono (tab
  chiusa) appena il rapporto è scritto; per una nuova revisione se ne avvia uno nuovo.
- Aggiornare `registro.md` a ogni cambio di fase di un worker, così un `/clear` non
  perde nulla.

## Attesa degli eventi

**Ascoltatore continuo:** `progetto/coordinamento/eventi.py`, avviato con lo strumento
**Monitor** di Claude Code (`python3 -u <percorso>/eventi.py 2>&1`, `timeout_ms` massimo,
30 minuti; si riarma a ogni scadenza). Usa `events.subscribe` del socket di herdr: nessun
polling e nessun buco fra un'attesa e l'altra. Ogni riga è un evento,
`<pane> <etichetta> | <evento>`:

- all'avvio, tutto ciò che non è ancora segnato come visto (come `attendi.py --stato`);
- un worker diventa `blocked` (menu di scelta, `MENU: <domanda>`, o richiesta di permesso);
- un worker si ferma (`idle` o `done`) dopo aver lavorato: ultima riga `STATO:` nuova, oppure
  «fermo senza nuovo STATO» (per esempio ha presentato un design in prosa e aspetta);
- un revisore stampa `REVISORE_FINITO`.

Ogni 2 minuti fa anche un controllo di riconciliazione come `attendi.py --stato` (herdr a volte non consegna `REVISORE_FINITO`). Trova da solo worker (tab «W…») e revisori (tab «R …») e rinnova l'iscrizione quando si
aprono o chiudono pane. Dopo aver gestito un evento: `attendi.py --visto <pane>` (salva in
`visti.txt`). `attendi.py --stato` mostra tutti i pane con lo stato e l'ultimo evento.
Le righe `STATO:` sono riconosciute con un'impronta delle righe precedenti, quindi due
`STATO: DOMANDA` uguali per domande diverse sono eventi distinti.

**Regole:** dopo un `/clear`, `attendi.py --stato`, gestire i «DA GESTIRE», poi avviare il
Monitor con `eventi.py`. Il Monitor deve restare sempre attivo; uno stato che aspetta
l'utente si segna come visto e si annota in `registro.md`. `attendi.py` senza argomenti
(polling) resta solo come ripiego se il socket non risponde.

**Messaggi ai worker:** `herdr agent prompt <pane> "<testo>"`, che rifiuta l'invio se
l'agente è `blocked` (menu aperto) invece di scrivere nel menu. In quel caso si legge la
domanda e si risponde col numero dell'opzione (`herdr pane send-text <pane> "1"`), poi si
manda il messaggio.

## Comandi utili

```bash
# avviare un worker in una tab nuova
herdr tab create --workspace w1 --label "W1 piattaforma" --no-focus   # → result.root_pane.pane_id
herdr pane run <pane> "cd <worktree> && claude --permission-mode auto -n 'W1 piattaforma'"
herdr agent prompt <pane> "Leggi progetto/coordinamento/brief/w1-piattaforma.md ed eseguilo."

# controllare
herdr pane get <pane>                                   # agent_status
herdr pane read <pane> --source recent-unwrapped --lines 80

# rispondere: agent prompt (rifiuta se c'è un menu aperto); a un menu solo il numero
herdr agent prompt <pane> "…"
herdr pane send-text <pane> "1"
```

**Messaggi lunghi (oltre 2-3 righe) in un file** `progetto/coordinamento/messaggi/<worker>-<nn>-<tema>.md`, e al worker si manda solo «Leggi <percorso> ed eseguilo»: con `send-text` i testi lunghi arrivano tagliati.

**Prima di inviare testo leggi il pane** (o controlla che le ultime righe non contengano «Enter to select»): se è aperto un menu di scelta, il testo finisce nel menu e l'Invio seleziona l'opzione evidenziata. Con un menu aperto rispondi solo con il numero dell'opzione e manda le informazioni dopo, a menu chiuso.

Il brainstorming dei worker fa domande con l'interfaccia a scelta multipla: si
risponde con i tasti (numero dell'opzione o testo libero) dopo aver letto il pane.
