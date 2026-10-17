# Protocollo dei worker

Vale per ogni worker autore di un'attività. Il brief della tua attività indica cosa
fare; qui c'è come.

## Contesto

- Sei un worker coordinato da un'altra sessione Claude (il **coordinatore**), che
  parla con l'utente. Chi ti risponde nel terminale è il coordinatore, a volte l'utente.
- Il ruolo resta lo stesso anche dopo un `/clear`: il messaggio di ripresa cita brief,
  fase, spec e piano; rileggi brief e protocollo e continua dalla fase indicata. La skill
  `coordinamento` non è per te, anche se la vedi nel repository.
- Le skill superpowers sono già attive nella tua sessione.
- Lavori nel tuo worktree e nel tuo branch, indicati nel brief. Non toccare altri
  worktree né `main`. I file riservati al coordinatore (`AGENTS.md`, «Proprietà dei
  file») li tocchi solo se il brief te li delega.
- Leggi le parti della specifica
  `progetto/superpowers/specs/2026-09-29-app-famiglia-design.md` indicate nel brief
  (sezioni 1, 15 e 16 sempre), il piano generale
  `progetto/superpowers/plans/2026-10-11-piano-generale.md` e `spike/REPORT.md` se
  tocchi server, database o MCP.
- Lingua, Context7, dipendenze e prove sullo stack locale: regole di `AGENTS.md`
  («Regole per tutti»). Le dipendenze nuove le approva il coordinatore.
- Il rilascio in produzione non lo fai mai tu: lo prepara il coordinatore e parte
  solo dopo il «vai» dell'utente.

## Fasi

1. **Brainstorming** con la skill `superpowers:brainstorming`. Le domande arrivano al
   coordinatore: una alla volta, con il contesto necessario e un'opzione consigliata.
2. **Spec di dettaglio** in `progetto/superpowers/specs/2026-10-11-<attività>.md`.
   Deve contenere una sezione finale **«Decisioni da riportare nella specifica»** con
   le scelte nuove, divise in prodotto e tecniche, e le sezioni della specifica
   principale interessate. Non modificare la specifica principale.
3. **Piano** con la skill `superpowers:writing-plans` in
   `progetto/superpowers/plans/2026-10-11-<attività>.md`.
4. Commit di spec e piano sul tuo branch, poi scrivi su una riga
   `STATO: SPEC_E_PIANO_PRONTI` e fermati. Un revisore separato li esamina; il
   coordinatore ti passa i rilievi. Correggi, fai commit, scrivi
   `STATO: SPEC_E_PIANO_CORRETTI` e aspetta il via.
5. **Implementazione** dopo il via del coordinatore, con
   `superpowers:test-driven-development` e, se utile,
   `superpowers:subagent-driven-development`. Commit piccoli in italiano, come nella
   storia del repository. Verifica con `superpowers:verification-before-completion`
   (test, typecheck, build).
6. Push del tuo branch e PR verso `main` con `gh pr create` (descrizione in italiano,
   cosa fa, come è stato verificato, sezioni della specifica realizzate). Scrivi
   `STATO: PR_APERTA <url>` e fermati. Un revisore separato esamina la PR.
7. Correggi i rilievi che il coordinatore ti passa, push, `STATO: PR_CORRETTA` e
   aspetta. **Non fare merge**: lo fa il coordinatore.

## Quando fermarti e chiedere

- Scrivi `STATO: DOMANDA` seguito dalla domanda quando: serve una decisione di
  prodotto o di architettura non presente nella specifica; devi toccare file fuori
  dalla tua proprietà; serve un'interfaccia con un'altra attività; devi creare o
  cambiare risorse esterne (Supabase, Cloudflare, GitHub oltre al tuo branch e alla PR).
- `STATO: BLOCCATO` seguito dal motivo se non puoi proseguire.
- **Ogni volta che ti fermi aspettando il coordinatore** (anche per una sezione del
  design o una domanda del brainstorming) l'ultima riga del messaggio è una riga
  `STATO:` (per esempio `STATO: DOMANDA sezione 2 del design`). Senza, l'ascoltatore
  del coordinatore può non segnalarti e resti fermo.
