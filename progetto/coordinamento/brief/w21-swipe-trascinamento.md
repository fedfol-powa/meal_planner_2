# Brief W21: la fila dei giorni segue il dito e mostra la settimana accanto

Segui `progetto/coordinamento/protocollo-worker.md`, con le eccezioni scritte qui.

- **Branch:** `correzioni/swipe-trascinamento` (da `origin/main`) · **Worktree:** `.worktrees/swipe-trascinamento`
- **Richiesta dell'utente (18/10/2026, dopo il rilascio di W19):** «lo swipe dovrebbe far
  vedere che "tirando" compare il calendario della settimana successiva o precedente, come se
  fosse una colonna già presente in pagina». Oggi (W19, PR #72, in produzione dalla versione
  `3260a367`) il gesto viene riconosciuto solo al rilascio, con un rimbalzo o una breve
  transizione: la fila non segue il dito.
- **Da leggere:** brief e piano di W19 (`brief/w19-swipe-settimane.md`,
  `progetto/superpowers/plans/2026-10-18-swipe-settimane.md`), il codice unito
  (`web/src/components/DaySelector.tsx`, `web/src/routes/MenuPage.tsx`,
  `web/src/routes/menu/weekSwipe.ts`), le revisioni `progetto/coordinamento/revisioni/w19-pr72*.md`
  (casi limite già chiusi), la specifica principale sezioni 5 e 14 («Swipe sulla fila dei
  giorni»), `design/design.md`.
- **Eccezione al protocollo:** niente brainstorming né spec, decisioni sotto. Piano breve in
  `progetto/superpowers/plans/2026-10-18-swipe-trascinamento.md` (tecnica scelta e perché,
  soglie, casi limite, test, «Decisioni da riportare nella specifica»), commit, poi avanti
  fino alla PR senza fermarti. Niente prototipo. Revisione Codex sulla PR.

## Decisioni dell'utente (18/10/2026)

1. **Trascinamento diretto:** mentre il dito si muove in orizzontale sulla fila dei giorni,
   la fila lo segue e da un lato entrano i giorni della settimana precedente o successiva,
   come se le settimane fossero affiancate in una striscia unica. Per mostrare i giorni
   della settimana accanto bastano le date (si calcolano), non serve aver letto la
   settimana.
2. **Rilascio:** si passa alla settimana accanto se il trascinamento supera **un terzo della
   larghezza** della fila **oppure** con un **colpo veloce** anche corto; altrimenti la fila
   torna al suo posto. All'arrivo si apre lo stesso giorno della settimana, come oggi.
3. **Settimana inesistente** da quel lato: la fila segue il dito **con resistenza** (sempre
   meno, come la fine di un elenco su iOS), al posto dei giorni non compare niente, e al
   rilascio torna al suo posto. Sostituisce il rimbalzo di W19.
4. Tutto il resto di W19 resta: solo la fila dei giorni (la traccia dei pasti non cambia),
   verifica dell'esistenza della settimana, navigazione come il calendario, un solo dito,
   clic sintetico ignorato, tocco su un giorno che resta un tocco, scorrimento verticale
   della pagina non rubato, calendario come alternativa accessibile.

## Vincoli

- Tecnica a tua scelta, motivata nel piano: per esempio scorrimento nativo con snap su tre
  settimane affiancate (coerente con «gli scorrimenti sono quelli nativi del dispositivo» di
  `design/design.md`) oppure trascinamento con trasformazioni guidate dagli eventi touch.
  Valuta come ciascuna gestisce la resistenza sulla settimana inesistente, l'asse
  verticale, il colpo veloce e la Safari dell'iPhone (PWA installata). **Niente librerie
  nuove.**
- Il trascinamento deve restare fluido sul telefono: niente rendering React a ogni
  movimento se evitabile (trasformazioni o scorrimento nativo), niente salti al momento in
  cui arriva la settimana nuova (la fila non deve lampeggiare né tornare al centro prima che
  il contenuto sia cambiato).
- `prefers-reduced-motion`: il trascinamento segue comunque il dito (è manipolazione diretta);
  il completamento e il ritorno al rilascio avvengono senza animazione.
- Se la settimana di arrivo non è salvata e si è offline vale quanto già deciso per W19
  (stesso comportamento del calendario).
- Aggiorna i test di W19 che non valgono più (rimbalzo) e aggiungi: trascinamento sotto
  soglia che torna indietro, oltre un terzo che cambia settimana, colpo veloce corto che
  cambia settimana, resistenza verso una settimana inesistente, giorni della settimana
  accanto visibili durante il trascinamento, casi limite già chiusi in W19 (multi-touch,
  clic sintetico, mouse, tastiera) ancora verdi.
- Verifica con la skill agent-browser a larghezza da telefono con eventi touch veri (CDP),
  sul server di sviluppo con dati finti (mai la produzione); se puoi, una breve registrazione
  o una sequenza di screenshot a metà trascinamento da allegare alla PR. Scrivi cosa resta
  da provare sull'iPhone.
- Testi nuovi solo se servono, in italiano e inglese britannico.
- Rilascio in produzione: **non lo fai tu**. Alla fine: push, PR verso `main`,
  `STATO: PR_APERTA <url>`.
