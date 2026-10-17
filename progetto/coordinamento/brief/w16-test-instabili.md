# Brief W16: test web instabili in CI

Segui `progetto/coordinamento/protocollo-worker.md`, con le eccezioni scritte qui.

- **Branch:** `correzioni/test-instabili` · **Worktree:** `.worktrees/test-instabili`
- **Richiesta dell'utente (17/10/2026):** sistemare i test che rendono rossa la CI di `main`
  e bloccano il rilascio dell'attività D (PR #64, email dell'app, unita e non rilasciata).
- **Eccezione al protocollo:** niente brainstorming né spec. Scrivi un piano breve in
  `progetto/superpowers/plans/2026-10-17-test-instabili.md` (cause trovate e correzioni) e
  fai commit; poi vai avanti senza fermarti, fino alla PR. La revisione Codex sarà sulla PR.

## Il problema

Il controllo `check` (workflow `CI`) fallisce su `main` con test web diversi da un giro
all'altro, mentre in locale passano:

- `web/src/features/password/ForgotPage.test.tsx` › «Manda di nuovo» appears after 60
  seconds and sends again (run sul merge `7f9342a` e su `ecdc14f`; W15 aveva già provato a
  stabilizzarlo con `67a0a7a`);
- `web/src/session/SessionScope.test.tsx` › language › never shows an answer in the previous
  language after a switch (run su `baa8e32`);
- dal 16/10, `FamilyDeletePage.test.tsx` › «leave then join restores the family without old
  data» (passato al secondo tentativo).

Leggi i log con `gh run list --branch main` e `gh run view <id> --log-failed`.

## Cosa fare

1. Per ogni test trova la **causa**: dipendenze da tempi reali, timer finti mescolati a
   promesse, `act` senza `await` (nel log compare «You called act(async () => ...) without
   await»), stato condiviso fra test, ordine di esecuzione, carico della macchina. Riproduci
   in locale con carico (per esempio molte ripetizioni in parallelo, `--repeat`, CPU
   limitata) prima di correggere.
2. Correggi **senza indebolire** i test: niente `retry`, niente attese più lunghe come unica
   cura, niente asserzioni tolte. Se la causa è nel codice dell'app (una corsa vera), correggi
   il codice con un test che la dimostri e scrivilo nella PR.
3. Cerca con la stessa lente gli altri test web con la stessa forma (stessi pattern di timer o
   `act`) e sistemali se hanno lo stesso difetto; elencali nella PR.
4. Prova di stabilità: ripeti i file toccati almeno 30 volte sotto carico e riporta il
   comando e l'esito nella PR; la CI della PR deve essere verde.

## Vincoli

- Solo test web e, se serve, il codice web che li riguarda; niente cambi di prodotto.
- Dipendenze nuove no, salvo approvazione del coordinatore.
- Prove locali senza la produzione (`AGENTS.md`, «Regole per tutti»).
- Alla fine: push, PR verso `main`, `STATO: PR_APERTA <url>`.
