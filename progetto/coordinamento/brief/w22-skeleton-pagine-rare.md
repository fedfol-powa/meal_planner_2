# Brief W22: skeleton nelle pagine rare e nelle sezioni dei curatori (issue #49, seguito)

Segui `progetto/coordinamento/protocollo-worker.md`, con le eccezioni scritte qui.

- **Branch:** `evolutive/skeleton-pagine-rare` (da `origin/main`) · **Worktree:** `.worktrees/skeleton-rare`
- **Richiesta dell'utente (23/10/2026):** estendere lo skeleton di W20 alle pagine rare e alle
  sezioni dei curatori del Ricettario, che W20 aveva lasciato fuori per scelta. Stessa
  forma e stesso comportamento delle pagine già coperte: la pagina non si sposta all'arrivo
  dei dati.
- **Da leggere prima:** la spec di W20 `progetto/superpowers/specs/2026-10-18-skeleton.md`
  e il suo piano `progetto/superpowers/plans/2026-10-18-skeleton.md` (questa attività li
  estende, non li riscrive); specifica principale, sezione 14 («Caricamenti (skeleton)») e
  sezione 15; `design/design.md`, sezione «Caricamenti (skeleton)»; il componente
  `web/src/components/Skeleton.tsx` e un uso già fatto (per esempio la Spesa o `FamilyGate`).
- **Eccezione alla proprietà dei file:** puoi aggiornare la sezione «Caricamenti
  (skeleton)» di `design/design.md` per togliere l'esclusione delle pagine rare e dei
  curatori. La specifica principale la aggiorna il coordinatore dopo il merge.

## Perimetro

- **Pagine rare:** profilo, impostazioni, membri, esclusioni, agenti, amministrazione,
  bozze, eliminazioni, inviti, `/password` (verifica del link), più ogni altra pagina con
  dati remoti che trovi senza skeleton.
- **Sezioni dei curatori** nel Ricettario (Bozze, Archiviate): oggi compaiono quando ruolo e
  riepilogo sono disponibili e spostano la pagina (spostamento ammesso da W20 perché
  riguarda solo i curatori; ora l'utente lo vuole togliere). Il nodo è che lo spazio si può
  riservare solo quando si sa che l'utente è un curatore: proponi nella spec come
  comportarsi quando il ruolo non è ancora noto, senza mostrare blocchi a chi non è curatore.

## Fasi

1. **Censimento:** per ogni pagina del perimetro, cosa mostra oggi durante l'attesa
   (`Loading`, nulla, messaggio proprio), quanto si sposta all'arrivo, se ha errori o liste
   vuote che cambiano altezza. Mettilo nella spec.
2. **Spec breve e piano:** layout di attesa per pagina, comportamento delle sezioni dei
   curatori, casi particolari (per esempio `/password`, dove l'attesa è la verifica del
   link, non una lettura di dati), aggiornamento di `design/design.md`, «Decisioni da
   riportare nella specifica». Niente prototipo: la variante (B, pulsazione lenta) è già
   scelta. Se un caso richiede una scelta di prodotto, `STATO: DOMANDA`.
   Poi `STATO: SPEC_E_PIANO_PRONTI` e revisione Codex.
3. **Implementazione** nell'app web, PR, `STATO: PR_APERTA <url>`.

## Vincoli

- Riusa `Skeleton.tsx` (`LoadingScope`, `Skeleton`, `BusyArea`, `LoadingArea`) e le regole
  di W20: soglia di 200 ms, una sola attesa e un solo `role="status"` per pagina, blocchi
  `aria-hidden` e non toccabili, fermi con `prefers-reduced-motion` e offline, nessuno
  skeleton con dati già disponibili o in un aggiornamento in background. **Nessuna
  dipendenza nuova**; se il componente va esteso, scrivi perché nel piano.
- Nessun cambiamento a server, contratto o MCP.
- Test: per ogni pagina coperta, skeleton durante l'attesa, contenuto all'arrivo, niente
  skeleton con dati in cache; per le sezioni dei curatori, nessun blocco a chi non è
  curatore.
- Verifica con la skill agent-browser a larghezza da telefono, sul server di sviluppo con
  dati finti o sullo stack locale (mai la produzione, vedi `AGENTS.md`); scrivi cosa resta
  da provare sull'iPhone.
- Rilascio in produzione: **non lo fai tu**.
