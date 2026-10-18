# Brief W20: skeleton nei caricamenti (issue #49)

Segui `progetto/coordinamento/protocollo-worker.md`, con le eccezioni scritte qui.

- **Branch:** `evolutive/skeleton` (da `origin/main`, dopo il merge di W19) · **Worktree:** `.worktrees/skeleton`
- **Richiesta dell'utente:** issue #49 (16/10/2026), avviata il 18/10/2026: segnaposto della
  stessa forma e altezza del contenuto finale, così la pagina non si sposta mentre si tocca.
  Leggi la issue con `gh issue view 49`.
- **Specifica principale:** sezioni 14 e 15; `design/design.md`, `design/index.html`;
  `design/percorsi.md`. Il linguaggio visivo cambia solo con l'accordo dell'utente
  (specifica, sezione 14).
- **Eccezione alla proprietà dei file:** per questa attività puoi aggiornare
  `design/design.md` con il componente skeleton scelto dall'utente (e `design/index.html`
  se serve a mostrarlo). La specifica principale la aggiorna il coordinatore dopo il merge.

## Fasi

1. **Censimento** (prima del prototipo): elenco dei caricamenti visibili dell'app web
   (componenti, cosa mostrano oggi, quanto spostano la pagina, priorità). Primo della lista
   `web/src/features/meals/RecipePicker.tsx` («Suggerimenti» in «Cambia pasto»). Comprendi
   anche `Loading`, la pagina Menu e le pagine con dati remoti, il controllo dell'accesso in
   `App.tsx`, errori e liste vuote che cambiano altezza. Mettilo nel piano.
2. **Prototipo con varianti** in `prototype/` (decisione dell'utente del 18/10): 2-3 forme
   dello skeleton (per esempio blocchi pieni statici, blocchi con pulsazione lenta, sagoma
   della scheda con riga del titolo), applicate almeno a «Cambia pasto» › Suggerimenti e a una
   pagina con elenco, **commutabili dal pannello Prova** con un caricamento simulato lungo,
   così l'utente le confronta sull'iPhone. Token e misure da `design/design.md`.
   Pubblica l'anteprima come nei giri di prototipo precedenti e fermati con
   `STATO: DOMANDA` (quale variante, quali pagine): il coordinatore la gira all'utente.
   Possono servire più giri di feedback.
3. **Spec breve e piano** dopo la scelta: componente condiviso, pagine coperte, regole per
   errori e liste vuote, aggiornamento di `design/design.md`, «Decisioni da riportare nella
   specifica». `STATO: SPEC_E_PIANO_PRONTI` e revisione Codex.
4. **Implementazione** nell'app web, PR, `STATO: PR_APERTA <url>`.

## Vincoli

- Un componente skeleton condiviso, **senza dipendenze nuove**, con i token della guida
  visiva.
- Accessibilità: area in caricamento con `aria-busy` e annuncio sobrio (`role="status"` o
  equivalente, un solo annuncio, non uno per blocco); lo skeleton è nascosto ai lettori di
  schermo; `prefers-reduced-motion` senza animazione.
- Lo skeleton compare solo per caricamenti veri: con i dati già in cache (anche offline)
  si mostra subito il contenuto. Evita il lampo per caricamenti brevissimi se serve (motiva
  la soglia nel piano).
- Dove possibile lo stesso spazio vale anche per errore e lista vuota.
- Test: componente (semantica, movimento ridotto) e pagine coperte (skeleton durante il
  caricamento, contenuto all'arrivo, niente skeleton con dati in cache).
- Verifica con la skill agent-browser a larghezza da telefono, sul server di sviluppo con
  dati finti o sullo stack locale (mai la produzione); scrivi cosa resta da provare
  sull'iPhone (flusso «Cambia pasto»).
- Rilascio in produzione: **non lo fai tu**.
