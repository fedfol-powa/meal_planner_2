# Brief W23: pulsante «Oggi» nella barra del Menu

Segui `progetto/coordinamento/protocollo-worker.md`, con le eccezioni scritte qui.

- **Branch:** `evolutive/bottone-oggi` (da `origin/main`) · **Worktree:** `.worktrees/bottone-oggi`
- **Richiesta dell'utente (23/10/2026):** quando il Menu non mostra il giorno di oggi,
  compare un piccolo pulsante «Oggi» a sinistra dell'icona del calendario, nella barra
  sopra la fila dei giorni; un tocco riporta al giorno corrente. Quando si è già su oggi il
  pulsante non c'è.
- **Da leggere prima:** specifica principale, sezioni 14 e 15 e le parti sul Menu (barra
  del mese, fila dei giorni, swipe fra le settimane di W19 e W21, tocco su Menu che porta a
  oggi); `design/design.md`, sezione del Menu («Sopra il selettore… una barra senza
  riquadri») e regole su icone e pulsanti; `design/percorsi.md`, percorso 1.
- **Eccezione alla proprietà dei file:** puoi aggiornare la sezione del Menu di
  `design/design.md` con la forma scelta dall'utente. La specifica principale la aggiorna
  il coordinatore dopo il merge.
- **Attività in parallelo:** W22 (skeleton nelle pagine rare) lavora su altre pagine; se
  devi toccare `Skeleton.tsx` o il layout di attesa del Menu, fermati con `STATO: DOMANDA`.

## Fasi

1. **Prototipo con varianti** in `prototype/`: 2-3 forme del pulsante (per esempio testo
   «Oggi» senza riquadro, pastiglia con bordo da 1 px come il selettore, icona con
   etichetta) nella barra del Menu, **commutabili dal pannello Prova**, con lo stato su oggi
   e fuori da oggi (anche in una settimana passata o futura). Token e misure da
   `design/design.md`; la barra non deve spostarsi né andare a capo quando il pulsante
   compare o sparisce, a larghezza da iPhone (mese lungo come «Settembre»). Pubblica
   l'anteprima come nei giri di prototipo precedenti e fermati con `STATO: DOMANDA`: il
   coordinatore la gira all'utente.
2. **Spec breve e piano** dopo la scelta. Da decidere nella spec, coerenti con le regole
   esistenti: cosa fa il tocco se oggi non ha menu o la sua settimana non esiste ancora
   (oggi il tocco su Menu porta «a oggi o al primo giorno con pasti»: usa la stessa regola,
   e se il pulsante in quel caso non ha senso, proponi di non mostrarlo); animazione del
   ritorno (la stessa del cambio di settimana di W21 o nessuna); quando cambia «oggi»
   (fuso della famiglia, app aperta a cavallo della mezzanotte). «Decisioni da riportare
   nella specifica». Poi `STATO: SPEC_E_PIANO_PRONTI` e revisione Codex.
3. **Implementazione** nell'app web, PR, `STATO: PR_APERTA <url>`.

## Vincoli

- Testi localizzati in italiano e inglese britannico («Oggi» / «Today»); nome accessibile
  chiaro, area di tocco adeguata (regole della guida visiva).
- Nessuna dipendenza nuova; nessun cambiamento a server, contratto o MCP.
- Test: pulsante assente su oggi, presente altrove, il tocco porta a oggi (anche da
  un'altra settimana), comportamento quando oggi non ha menu.
- Verifica con la skill agent-browser a larghezza da telefono, sul server di sviluppo con
  dati finti o sullo stack locale (mai la produzione, vedi `AGENTS.md`); scrivi cosa resta
  da provare sull'iPhone.
- Rilascio in produzione: **non lo fai tu**.
