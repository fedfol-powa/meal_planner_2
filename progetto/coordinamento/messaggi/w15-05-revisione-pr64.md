# W15, rilievi della revisione della PR #64 e CI

Rapporto: `progetto/coordinamento/revisioni/w15-pr64.md` (APPROVABILE CON CORREZIONI).
Correggi i tre rilievi come propone il revisore, con i test indicati:

1. **Importante:** la riconciliazione dei backup segnala come mancante la copia di sette
   giorni prima, già eliminata dalla pulizia dopo il backup riuscito delle 02:30 → falso
   allarme ogni giorno. Allinea la finestra alla conservazione effettiva, con la prova
   backup delle 02:30 → pulizia → riconciliazione alle 03:00/04:00, e i buchi reali ancora
   rilevati.
2. **Minore:** «Rimanda l'email» (`PasswordEmailNotice.tsx`) senza `trackBusy`; test reinvio
   sospeso → ritorno in primo piano → nessun ricaricamento.
3. **Minore:** in `passwordEmailFailure` riconosci esplicitamente il limite del progetto e usa
   `sent` per ogni altro 429 (messaggio assente o sconosciuto), come dice la spec.

**CI rossa** sul controllo `check` (run 39027600184): fallisce
`web/src/features/password/ForgotPage.test.tsx` › «Manda di nuovo» appears after 60 seconds and
sends again. Trova la causa (probabile dipendenza dai tempi) e correggila senza indebolire il
test; verifica che passi in modo ripetibile e che il resto della CI (build, prove sullo stack
con Mailpit e servizi Auth aggiuntivi, ripristino) arrivi in fondo e sia verde.

Il revisore segnala anche che `npm test` dalla radice si ferma su `scripts/backup/cli.test.ts`
con `listen EPERM` nella sua sandbox: controlla solo che in CI e in locale non accada.

Push, `STATO: PR_CORRETTA` quando la CI è verde, e aspetta.
