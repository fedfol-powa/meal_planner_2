# W15, rilievi della terza revisione di spec e piano

Rapporto: `progetto/coordinamento/revisioni/w15-spec-piano-3.md` (APPROVABILE CON
CORREZIONI). Correggi i tre rilievi come propone il revisore:

1. `/password` resta occupata finché conserva un token verificato utilizzabile (anche dopo
   un salvataggio fallito recuperabile), con il test descritto nel rapporto.
2. Conversione di `unavailable` e `absent` nella risposta di `accept`, nel contratto e nel
   testo mostrato, con i due test (cancellazione prima dell'autorizzazione SQL e dopo, prima
   di `generate_link`).
3. Correggi la frase sui tipi di `generate_link` che creano utenti.

Nessuna nuova revisione Codex: verifico io il diff. Commit, `STATO: SPEC_E_PIANO_CORRETTI`,
e aspetta.
