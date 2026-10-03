# AGENTS.md - App Famiglia (meal_planner_2)

Istruzioni per qualsiasi agente (Claude Code, Codex o altri) che lavora in questo
repository. Rispondi e scrivi la documentazione di progetto in italiano, con gli accenti
normali. Tutto il codice deve essere in inglese: identificatori, nomi tecnici di file e
directory, schema del database, API, strumenti MCP, commenti e test. I testi destinati
agli utenti devono essere localizzabili in italiano e inglese britannico.

## Cos'è

Un'app web per famiglie che ogni mercoledì sera prepara in automatico il menu della
settimana successiva, lo lascia rivedere e modificare ai membri della famiglia (con
traccia di chi ha cambiato cosa) e genera liste della spesa effimere dai pasti scelti.
Il ricettario è unico e ha il database come fonte di verità. I curatori possono
aggiungere ricette tramite il proprio agente MCP, con raccolta guidata delle informazioni
e pubblicazione solo quando sono complete; il lavoro incompleto si conserva in bozze
visibili anche nell'app. Possono modificare l'intero ricettario, con requisiti di backup
e ripristino definiti nella specifica. La pianificazione automatica è a regole;
al suo interno l'AI può comparire solo come giudice opzionale tra settimane già valide.

## Documento unico di riferimento

Requisiti e design completo sono in
`progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`. **Leggilo prima di tutto.**
È il documento autorevole, versionato in Git, con parte funzionale per non tecnici,
design tecnico, decisioni confermate e questioni ancora aperte.

Ogni nuova scelta concordata che tocca il prodotto o l'architettura deve aggiornare
le sezioni pertinenti di quel documento. Il prototipo, i design di dettaglio e i piani
lo estendono e lo rispettano; non devono diventare fonti parallele dei requisiti.
`AGENTS.md` stabilisce il metodo di lavoro e non sostituisce la specifica.

## Stato

- Base approvata il 29 settembre 2026; il 3 ottobre la specifica è stata aggiornata
  con internazionalizzazione, MCP, curatela, catalogo nel database e amministrazione globale.
- **Prossimo artefatto: prototipo dell'app nel repository**, da concordare e rivedere
  con l'utente prima dell'implementazione del prodotto. La review deve rivalutare
  funzionalità e architettura e consolidarle nella specifica.
- Il piano **M1a Ricettario e catalogo**
  (`progetto/superpowers/plans/2026-09-29-m1a-ricettario-e-catalogo.md`) è superato nelle
  parti incompatibili con i nuovi requisiti e non va eseguito come scritto.
- M1a va ripianificato dopo il prototipo; M1b non è ancora stato scritto. La nuova
  ripartizione sarà definita nella revisione dei piani.
- Niente codice prima che l'utente approvi il piano e scelga il metodo di esecuzione.

## Stack di riferimento

SvelteKit su Netlify, Supabase (Postgres, Auth, RLS, pg_cron, Edge Functions), modulo
TypeScript `planner/` condiviso. Le motivazioni e la proposta di operazioni condivise
tra web e MCP sono nella specifica, sezione 1. L'architettura va riverificata dopo
il prototipo, prima dell'implementazione.

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
