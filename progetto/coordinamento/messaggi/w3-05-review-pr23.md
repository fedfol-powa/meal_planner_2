# W3 — rilievi della review della PR #23

Rapporto: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w3-pr23.md`.
Verdetto «approvabile con correzioni», sul commit `6091b77`. Leggilo tutto prima di
correggere.

## Da correggere

- **1 — `startRevision` idempotente anche quando riusa una revisione aperta.** La stessa
  richiesta (stesso identificativo) deve restituire sempre la stessa bozza, anche se nel
  frattempo quella bozza è stata scartata o pubblicata o ne è stata aperta un'altra.
  Decisione del coordinatore: niente tabella generica delle ricevute. Conserva
  l'associazione richiesta → bozza nel modo più piccolo coerente con lo schema delle
  bozze (per esempio le richieste che hanno riusato la bozza, legate alla bozza stessa);
  scegli tu la forma e motivala nella spec. Test: ripetizione dopo scarto, dopo
  pubblicazione e dopo l'apertura di una revisione successiva. Allinea spec e piano.
- **2 — Salvataggi sovrascritti recuperabili via MCP.** Aggiungi due letture riservate ai
  curatori: elenco dei salvataggi di una bozza (revisione, autore, data, `overwritten`,
  anche per le bozze chiuse) e lettura del contenuto di un salvataggio. Il recupero passa
  poi dalle scritture esistenti con i loro controlli di conflitto. Test del percorso
  completo da una sessione nuova (sovrascrittura → elenco → lettura → `saveDraft`).
  Aggiorna contratto, guida, spec e piano.
- **3 — Guida e preparazione strutturata.** Il testo originale resta sempre in
  `sourceText`; la guida spiega quando riportare anche la preparazione verificata nel
  campo bilingue `preparation`, perché le equivalenze dipendenti dalla preparazione lo
  leggono. Correggi entrambe le istruzioni citate e aggiungi un caso con equivalenza
  specifica (generica 100, specifica 120 → 120).
- **Spazi:** sistema le righe segnalate da `git diff --check` nella spec (120–123,
  131–136).

## Prima di `PR_CORRETTA`

Test e typecheck da radice e workspace; controlla che in CI migrazioni, pgTAP e suite del
database siano effettivamente eseguiti e verdi (non saltati), e riportalo. Nessun push
forzato.

Chiudi con `STATO: PR_CORRETTA <url>` e l'elenco delle correzioni con i commit.
