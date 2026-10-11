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

Poi `herdr pane list` e `herdr tab list --workspace w1`: gli id dei pane cambiano,
si riconoscono dall'etichetta della tab (`W1 piattaforma`…) e dal `cwd` del worktree.

## Regole del coordinatore

- Con l'utente: italiano, chiaro, con il contesto necessario, poche parole ma non
  troppo poche.
- Dubbi minori dei worker: li chiude il coordinatore, coerenti con specifica, design e
  decisioni registrate. Decisioni di prodotto o di architettura che spettano
  all'utente: domanda all'utente; se serve un brainstorming, si attiva il Remote
  Control sul worker (`/remote-control` nel pane) e si chiede all'utente di entrare lì.
- Ogni risposta data a un worker che fissa un'interfaccia o una decisione va registrata
  nel piano generale (sezioni «Interfacce decise» o «Registro»).
- Review avversariali sempre con un worker separato e nuovo, senza il contesto del
  worker autore: una per spec e piano, una per la PR.
- Push, PR e merge su `main` li fa il coordinatore (autorizzato l'11 ottobre 2026),
  dopo che la review avversariale del codice è chiusa senza rilievi aperti; poi
  avvisa l'utente e riporta le decisioni nella specifica principale.
- Solo il coordinatore modifica specifica principale, `design/percorsi.md`,
  `AGENTS.md`, il piano generale e questa cartella.
- Aggiornare `registro.md` a ogni cambio di fase di un worker, così un `/clear` non
  perde nulla.

## Comandi utili

```bash
# avviare un worker in una tab nuova
herdr tab create --workspace w1 --label "W1 piattaforma" --no-focus   # → result.root_pane.pane_id
herdr pane run <pane> "cd <worktree> && claude --permission-mode auto -n 'W1 piattaforma'"
herdr pane run <pane> "Leggi progetto/coordinamento/brief/w1-piattaforma.md ed eseguilo."

# controllare
herdr pane get <pane>                                   # agent_status
herdr pane read <pane> --source recent-unwrapped --lines 80

# rispondere: testo e poi Invio
herdr pane send-text <pane> "…"; herdr pane send-keys <pane> Enter
```

Il brainstorming dei worker fa domande con l'interfaccia a scelta multipla: si
risponde con i tasti (numero dell'opzione o testo libero) dopo aver letto il pane.
