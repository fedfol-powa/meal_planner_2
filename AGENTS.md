# AGENTS.md - App Famiglia (meal_planner_2)

Istruzioni per qualsiasi agente (Claude Code, Codex o altri) che lavora in questo
repository. Rispondi e scrivi i file in italiano, con gli accenti normali.

## Cos'è

Un'app web per famiglie che ogni mercoledì sera prepara in automatico il menu della
settimana successiva, lo lascia rivedere e modificare ai membri della famiglia (con
traccia di chi ha cambiato cosa) e genera liste della spesa effimere dai pasti scelti.
Il ricettario è unico, curato dall'utente con l'AI via git. La pianificazione è a regole;
l'AI può comparire solo come giudice opzionale tra settimane già valide (spec, sezione 3).

Il design completo, con una parte funzionale per non tecnici, è in
`progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`. Leggilo prima di tutto.

## Stato

- 29 settembre 2026: spec approvata. M1 è diviso in due piani:
  - **M1a Ricettario e catalogo**: `progetto/superpowers/plans/2026-09-29-m1a-ricettario-e-catalogo.md`,
    scritto, in revisione dall'utente;
  - **M1b Fondamenta dell'app** (Auth, Famiglia, inviti, seed, vista di apertura): da scrivere
    dopo M1a.
- Niente codice prima che l'utente approvi il piano e scelga il metodo di esecuzione.

## Stack deciso

SvelteKit su Netlify, Supabase (Postgres, Auth, RLS, pg_cron, Edge Functions), modulo
TypeScript `pianificatore/` condiviso. Le motivazioni sono nella spec, sezione 1.

L'utente ha creato l'organizzazione Supabase e collegato questo repository tramite
l'integrazione GitHub: lo schema va creato da codice (`supabase/migrations/`). Verifica la
configurazione dell'integrazione all'inizio di M1.

## Progetto di origine

`../meal_planner` (`fedfol-powa/meal_planner`) resta attivo e separato: menu in YAML,
PDF settimanale, sito statico su Netlify. È la fonte dell'import iniziale del ricettario
(`../meal_planner/ricettario/ricette.yaml`) e dei dati della famiglia del curatore.
Da qui lo si legge soltanto, non lo si modifica. Le sue regole di merito
(`../meal_planner/progetto/REGOLE.md`) sono il punto di partenza delle impostazioni di
default, non regole di questa app.

## Regole di lavoro

- Pianifica prima di eseguire e fatti approvare il piano dall'utente.
- Documentazione di librerie e servizi (SvelteKit, Supabase, Netlify...): consultala con
  Context7 invece di andare a memoria.
- Ingredienti delle ricette: solo se verificati sulla fonte o forniti dall'utente, mai
  dedotti dal nome del piatto (stessa regola del progetto di origine).
- Git: nessun push su GitHub senza richiesta esplicita dell'utente. Il flusso di branch
  (per esempio `sviluppo` e pull request verso `main`, come nel progetto di origine) si
  decide in M1.
