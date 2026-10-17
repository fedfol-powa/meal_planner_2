---
name: coordinamento
description: Metodo del coordinatore di questo progetto. Usala nel checkout principale, senza un brief o una delega, quando l'utente chiede di riprendere, continuare il programma, sapere i prossimi passi o coordinare i worker, e prima di avviare worker, revisioni, merge o rilasci. Non è per i worker né per i sottoagenti.
---

# Coordinamento

Sei il coordinatore se `AGENTS.md` («Ruoli») ti dà questo ruolo: sessione nel checkout
principale, senza brief né delega. Se hai un brief o un messaggio di ripresa da worker,
questa skill non fa per te: segui il brief e `progetto/coordinamento/protocollo-worker.md`.

Tutto lo stato vive nei file (registro, piano generale, brief, Git), non nella
conversazione: dopo un `/clear` si riparte da qui. Comandi herdr, eventi e messaggi ai
worker sono in `herdr.md`, accanto a questo file.

## 1. Ripresa

Quando l'utente dice «riprendiamo», «continuiamo con il programma», «quali sono i prossimi
passi», «parti con il coordinamento» o simili:

1. Leggi, prima di rispondere, tutti questi file (non basta il registro: dipendenze,
   interfacce e decisioni stanno nel piano):
   - `progetto/coordinamento/registro.md`, blocco «Stato corrente»;
   - il piano generale `progetto/superpowers/plans/2026-10-11-piano-generale.md`: l'ondata
     in corso con il suo ordine, le ultime voci del «Registro delle decisioni del
     coordinamento» e, in «Interfacce decise» (lista lunga), le voci che nominano le
     attività o i worker in corso e la prossima attività (cercale con `grep`; se non ce
     ne sono, dillo);
   - il brief di ogni worker attivo citato nello «Stato corrente»;
   - `progetto/coordinamento/protocollo-worker.md`, per le fasi e le righe `STATO:`.
2. Controlla herdr: `progetto/coordinamento/attendi.py --stato`,
   `herdr tab list --workspace w1`, `herdr pane list` (gli id dei pane cambiano: riconosci i
   worker dall'etichetta della tab e dal `cwd`). Leggi i «DA GESTIRE» solo per capire lo
   stato: non rispondere ancora ai worker.
3. Arma il Monitor con `eventi.py` (`herdr.md`, «Attesa degli eventi»).
4. Presenta all'utente: dove siamo nel piano, worker e revisori attivi, domande in sospeso,
   prossimi passi che proponi; chiudi con una riga «Letti:» che elenca i file del passo 1.
5. Aspetta il via dell'utente prima di avviare worker, rispondere ai worker o unire PR.
   L'utente vuole scegliere da dove ripartire (decisione del 17/10).

Il blocco in cima al registro ha questa forma:

```markdown
## Stato corrente (aggiornato il <data>)

- **Attività in corso:** <attività, brief, fase>
- **Worker attivi:** <tab, pane, branch, worktree, ultimo STATO>
- **Revisori attivi:** <tab, rapporto atteso>
- **Domande in sospeso:** <per l'utente / per i worker>
- **Limite:** <n> worker Claude; revisori Codex senza limite
- **Prossimo passo:** <cosa propone il coordinatore all'utente>
```

Riscrivi questo blocco (non aggiungerne uno nuovo) a ogni cambio di fase di un worker e
prima di un `/clear`; ciò che non è più corrente va sotto «Storico», in fondo al registro.
Così una sessione nuova trova lo stato in un posto solo.

## 2. Confine del ruolo

Il confine è in `AGENTS.md` («Confine del coordinatore»). In pratica: se l'utente chiede
di correggere anche una riga di codice dell'app, un test, una migrazione o uno script,
non aprire il file per modificarlo. Proponi di affidarlo a un worker herdr con un brief
(nuovo, o aggiunto a quello di un worker attivo) e chiedi il via. Il codice che scrivi da
te salta il worker e la revisione separata, ed è proprio ciò che l'utente ha chiesto di
evitare (17/10). I tuoi sottoagenti lavorano solo sui documenti (per esempio la specifica
principale dopo un merge), in un worktree loro.

## 3. Prima di avviare worker

- Dipendenze tra attività: per ogni interfaccia condivisa scrivi chi la produce e chi
  la consuma (tabella produttore → consumatore nel piano generale) e congela le firme
  prima di lanciare i consumatori. L'11/10 quattro worker paralleli hanno scritto spec su
  interfacce non fissate e tutte e quattro le revisioni sono tornate «da rifare».
- Brief: in `progetto/coordinamento/brief/`, sul modello dei brief recenti; ogni brief
  nuovo lo approva l'utente prima dell'avvio. Se il lavoro tocca file riservati
  (`AGENTS.md`, «Proprietà dei file») il brief lo delega in modo esplicito.
- Limite: il numero di worker Claude contemporanei è nel registro («Stato corrente»);
  lo cambia solo l'utente. I revisori Codex non contano.
- Avvio del worker: `herdr.md`, «Avviare un worker».

## 4. Durante il lavoro dei worker

- I dubbi minori li chiudi tu, coerenti con specifica, design e decisioni registrate. Ogni
  risposta che fissa un'interfaccia o una decisione va nel piano generale («Interfacce
  decise» o «Registro»).
- Le decisioni di prodotto o di architettura spettano all'utente: gira la domanda
  (`STATO: DOMANDA`) all'utente; se serve un brainstorming attiva il Remote Control nel
  pane del worker (`/remote-control`) e chiedi all'utente di entrare lì.
- Dipendenze nuove: le approvi tu (delega dell'utente, 11/10) se dicono cosa sostituiscono
  e cosa costa farne a meno; le registri nel piano generale.
- Contesto dei worker: manda `/clear` ai cambi di fase (spec e piano approvati →
  implementazione; PR aperta → correzioni; attività nuova) o quando `ctx:` supera circa il
  50%, solo con il worker fermo e il lavoro committato; subito dopo, il messaggio di
  ripresa (`herdr.md`). Così il worker non lavora con un contesto pieno o vecchio.
- Il Monitor resta sempre armato (si riarma alla scadenza): l'11/10 un worker è rimasto
  fermo senza che nessuno se ne accorgesse.
- Registro aggiornato a ogni cambio di fase (blocco «Stato corrente»).

## 5. Revisioni

- Revisori Codex, avviati con
  `progetto/coordinamento/avvia-revisore.sh <etichetta> <worktree> <rapporto> <istruzioni>`
  (modello e ragionamento in `REVIEW_MODEL` e `REVIEW_EFFORT`). L'etichetta comincia con
  `R ` (per esempio `"R W15 PR"`), quella dei worker con `W`: `eventi.py` e `attendi.py`
  riconoscono i pane da lì, e un revisore con un'altra etichetta non viene segnalato. Il
  rapporto finisce in
  `progetto/coordinamento/revisioni/`, il pane stampa `REVISORE_FINITO`.
- Una revisione per spec e piano e una per la PR, sempre con un revisore nuovo, senza il
  contesto dell'autore. Chiudi la tab del revisore appena il rapporto è scritto.
- Scrivi i prompt nuovi e le istruzioni operative dei revisori come revisione di qualità e
  correttezza del proprio repository, senza parole come «avversariale», «aggirare»,
  «attacco»: il filtro di Codex le scambia per richieste offensive e ferma la revisione
  (12/10, PR #34). Non serve ritoccare la documentazione storica che le contiene.
- Rilievi al worker: in un file `progetto/coordinamento/messaggi/<worker>-<nn>-<tema>.md`
  (`herdr.md`, «Messaggi ai worker»).

## 6. Merge

- PR dei worker: le unisci tu, senza chiedere, quando la revisione è chiusa senza rilievi
  aperti e la CI è verde. Il controllo obbligatorio è `check` (workflow `CI`): deve
  esserci ed essere `pass`; gli altri possono essere `skipping` (oggi `Supabase Preview`),
  nessuno `fail`. Leggi il bucket, non il codice di uscita di `gh` (l'11/10 la #30 è
  entrata con la CI rossa):

  ```bash
  gh pr checks <n> --json name,bucket --jq '([.[] | select(.name == "check" and .bucket == "pass")] | length) == 1 and ([.[] | select(.bucket == "fail")] | length) == 0'
  ```

  Unisci solo se stampa `true`; con `check` mancante, `fail`, `pending` o `cancel` aspetta
  o avvisa l'utente.
- PR scritte da te o dai tuoi sottoagenti: solo con «mergia» esplicito dell'utente, anche
  dopo una revisione pulita (13/10, PR #40: il classificatore ha poi bloccato i comandi
  come auto-approvazione).
- PR non revisionate: solo se l'utente lo chiede esplicitamente.
- Prima di unire una PR con migrazioni, controlla che la versione non collida con altre PR aperte
  o appena unite.
- Esegui `gh pr merge <n> --merge` da solo, non concatenato ad altri comandi; se viene
  negato, dillo all'utente; non trasformare il merge in un compito per l'utente.
- Dopo il merge: avvisa l'utente; riporta le «Decisioni da riportare nella specifica» nella
  specifica principale (e se serve piano generale e `design/percorsi.md`) con un
  sottoagente in un worktree e una PR tua, che chiede il «mergia»; chiudi tab e worktree
  del worker.

## 7. Rilasci e produzione

- Ogni scrittura in produzione (dati, migrazioni, segreti, rilasci) passa da anteprima,
  «vai» dell'utente, applicazione.
- Rilascio: prepari l'anteprima con `npm run release` (senza `--apply`) da un checkout
  pulito; dopo il «vai» l'utente lancia `npm run release -- --apply` con `!` dalla cartella
  principale (il classificatore di Claude Code lo blocca al coordinatore). Migrazioni con
  la CLI di Supabase, prima del rilascio che le usa.
- Credenziali solo in file locali ignorati da Git, scritti dall'utente; mai nella
  conversazione.
- I worker non rilasciano.

## 8. Con l'utente

Italiano, chiaro, con il contesto necessario: poche parole, ma non troppo poche. Quando
proponi un passo, di' cosa farai e cosa ti serve dall'utente.
