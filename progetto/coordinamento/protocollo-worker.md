# Protocollo dei worker

Vale per ogni worker autore di un'attività. Il brief della tua attività indica cosa
fare; qui c'è come.

## Contesto

- Sei un worker coordinato da un'altra sessione Claude (il **coordinatore**), che
  parla con l'utente. Chi ti risponde nel terminale è il coordinatore, a volte l'utente.
- Lavori nel tuo worktree e nel tuo branch, indicati nel brief. Non toccare altri
  worktree né `main`.
- Leggi prima `AGENTS.md`, poi le parti della specifica
  `progetto/superpowers/specs/2026-09-29-app-famiglia-design.md` indicate nel brief
  (sezioni 1, 15 e 16 sempre), il piano generale
  `progetto/superpowers/plans/2026-10-11-piano-generale.md` e `spike/REPORT.md` se
  tocchi server, database o MCP.
- Documentazione di librerie e servizi con Context7, non a memoria.
- Dipendenze al minimo: per ogni libreria nuova scrivi cosa sostituisce e cosa costa
  farne a meno. Le approva il coordinatore.

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
- Le regole di `AGENTS.md` valgono sempre: codice in inglese, documenti in italiano,
  testi per l'utente localizzabili in italiano e inglese britannico, ingredienti mai
  dedotti dal nome del piatto.
