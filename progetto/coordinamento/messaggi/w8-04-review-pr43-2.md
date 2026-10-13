# W8: seconda review della PR #43

Rapporto: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w8-pr43-2.md`
(DA CORREGGERE: 2 importanti, 1 minore; i rilievi precedenti sono chiusi). Leggilo.

1. **`getAuthorization()`** può approvare automaticamente sul server (consenso già dato):
   proteggila con `trackBusy` dalla chiamata fino alla gestione dell'esito, redirect
   compreso. La pagina di consenso inattiva resta libera. Correggi la classificazione nella
   tabella della spec e della PR, e aggiungi il test con risposta trattenuta.
2. **Bozza del cambio della password:** la pagina è occupata quando almeno un campo è pieno,
   anche senza focus. Le password non si salvano da nessuna parte. Si libera quando il
   modulo è vuoto, il cambio è completato o si esce dalla pagina. Test, compreso il modulo
   vuoto che resta libero; aggiungi il caso alla tabella.
3. **Test delle porzioni:** dopo lo sblocco restituisci una risposta valida e verifica che al
   ritorno successivo la pagina ricarichi; aggiungi anche il caso di rifiuto.

Prova di rottura per le nuove protezioni, push, `STATO: PR_CORRETTA`.
