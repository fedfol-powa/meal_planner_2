# Brief W19: swipe sulla fila dei giorni per cambiare settimana

Segui `progetto/coordinamento/protocollo-worker.md`, con le eccezioni scritte qui.

- **Branch:** `evolutive/swipe-settimane` (da `origin/main`) · **Worktree:** `.worktrees/swipe-settimane`
- **Richiesta dell'utente (18/10/2026):** «abilitiamo lo swipe sui giorni del calendario
  della settimana nella vista menu per cambiare settimana, in aggiunta al pulsante
  calendario, così è possibile spostarsi tra le settimane con uno swipe».
- **Specifica principale:** sezioni 5 (apertura e navigazione del Menu), 14 e 15;
  `design/design.md` (in particolare «Gli scorrimenti sono quelli nativi del dispositivo»);
  `design/percorsi.md`, percorso 1 («Calendario»).
- **Eccezione al protocollo:** niente brainstorming né spec di design, decisioni sotto. Piano
  breve in `progetto/superpowers/plans/2026-10-18-swipe-settimane.md` (gesto, soglie,
  settimane disponibili, offline, accessibilità, test, «Decisioni da riportare nella
  specifica»), commit, poi avanti fino alla PR senza fermarti. Niente prototipo. La
  revisione Codex sarà sulla PR.

## Decisioni dell'utente (18/10/2026)

1. **Dove:** lo swipe orizzontale vale sulla **fila dei giorni** (`DaySelector` in
   `web/src/routes/MenuPage.tsx`), non sulla traccia dei pasti sotto (`week-track`), che già
   scorre fra i giorni della stessa settimana e resta com'è.
2. **Direzione:** verso sinistra la settimana successiva, verso destra la precedente.
3. **Giorno che si apre:** lo **stesso giorno della settimana** (da mercoledì 21 a mercoledì
   28 o 14).
4. **Settimana inesistente** (menu non generato o fuori dalle date disponibili): non cambia
   nulla, la fila fa un **piccolo rimbalzo** e torna al suo posto. Nessun messaggio.
5. Il pulsante calendario resta com'è ed è l'alternativa allo swipe.

## Vincoli dal coordinamento

- Le settimane esistenti si ricavano dai dati già usati dal selettore del calendario
  (`DatePicker`, date con menu): nessuna operazione nuova nel contratto. Se servisse, fermati
  con `STATO: DOMANDA`.
- La navigazione usa lo stesso percorso del calendario (`select` → `navigate({ search: { day }
  })`), così cronologia, offline e copia salvata si comportano allo stesso modo. Offline,
  una settimana non salvata si tratta come il calendario la tratta oggi; descrivilo nel piano.
- Gesto: solo orizzontale e solo oltre una soglia chiara (distanza e prevalenza sull'asse
  verticale), così un tocco su un giorno resta un tocco e lo scorrimento verticale della
  pagina non viene rubato. Eventi pointer o touch della piattaforma, **niente librerie
  nuove**. Su desktop con il mouse non è richiesto, ma non deve rompere i clic.
- Rimbalzo e transizione brevi, rispettando `prefers-reduced-motion` (senza movimento: nessuna
  animazione). Niente animazioni decorative (`design/design.md`).
- Accessibilità: il gesto non sostituisce i controlli esistenti; lettore di schermo e
  tastiera continuano a usare giorni e calendario. Se dopo il cambio di settimana il
  lettore di schermo non annuncia nulla di utile, valuta un annuncio breve e motivalo nel
  piano.
- Testi nuovi, se servono, in italiano e inglese britannico.

## Test e verifica

- Test della pagina (Vitest, Testing Library) per: swipe a sinistra e a destra con settimana
  esistente (stesso giorno della settimana), swipe verso una settimana inesistente (nessuna
  navigazione), movimento sotto soglia o verticale (nessun cambio), tocco su un giorno che
  resta selezione del giorno.
- Verifica con la skill agent-browser a larghezza da telefono, con eventi touch, sul server
  di sviluppo con dati finti (mai la produzione).
- Scrivi nel piano cosa resta da provare a mano sull'iPhone (sensazione del gesto, rimbalzo).

## Vincoli generali

- Prove solo sullo stack locale o sul server di sviluppo (`AGENTS.md`, «Regole per tutti»).
- Rilascio in produzione: **non lo fai tu**. Alla fine: push, PR verso `main`,
  `STATO: PR_APERTA <url>`.
