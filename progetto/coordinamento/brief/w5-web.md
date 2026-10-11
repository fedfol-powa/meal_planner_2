# Brief W5: App web di base

Segui `progetto/coordinamento/protocollo-worker.md`.

- **Branch:** `fondamenta/web` · **Worktree:** `.worktrees/web`
- **Proprietà:** `web/`.
- **Specifica:** sezioni 1 (interfaccia, letture dalla copia sul dispositivo), 12, 14;
  poi `design/design.md`, `design/index.html`, `design/percorsi.md`; il prototipo in
  `prototype/` (componenti, i18n, rotte) come riferimento dei percorsi approvati.

## Obiettivo

La base dell'app React su cui l'ondata 2 aggiunge le funzioni:

- SPA con Vite, TanStack Router e TanStack Query, mobile-first, PWA installabile;
- token, font e componenti da `design/` (schede dei pasti, schede ricetta, stelline,
  navbar a icone, pannelli, pulsanti), riscritti in React a partire dal prototipo;
- localizzazione italiano e inglese britannico (valuta se serve una libreria o basta
  il meccanismo del prototipo);
- navigazione e schermate principali (Menu, Ricettario, Profilo) con dati finti
  dietro un'interfaccia che poi diventa il client oRPC;
- login con utenza Supabase diretta (email e password o link), senza Google;
- cache persistita di TanStack Query: proposta, l'integrazione vera arriva con W1.

## Vincoli dal coordinamento

- Il client oRPC, il token di sessione e la build servita dal Worker sono interfacce
  con W1: accordati tramite il coordinatore.
- Ogni libreria oltre a React, Vite, TanStack Router/Query e il client di Supabase va
  motivata.
- Pubblica sulla rete locale per la prova su iPhone quando ci sono schermate da vedere
  (porta da concordare, il prototipo usa la 8766).
