# W6 — Seconda review della PR #34: quattro correzioni

Rapporto: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w6-pr34-2.md`
(DA RIFARE, ma 10 dei 13 punti del primo giro sono chiusi). Restano quattro rilievi, nessuna
decisione di prodotto. Per ognuno: test che fallisce prima, poi la correzione.

1. **Migrazioni pendenti su stderr (bloccante).** `realDeps.run` deve conservare stdout e
   stderr separati; il dry run della CLI di Supabase si analizza su entrambi, le risposte
   JSON di Wrangler solo da stdout. Regressione attraverso il wrapper reale (non quello del
   test del database iniziale, che unisce i flussi): migrazione pendente su stderr → rilascio
   la applica.
2. **`sslrootcert` nella conninfo.** Passa il percorso con `PGSSLROOTCERT` (e `PGSSLMODE`)
   nell'ambiente del container, come la password, invece che nella conninfo: è la strada più
   semplice. Prova con spazi, apici, backslash e testo simile a parametri.
3. **Override di Wrangler da `.env`.** Impedisci il caricamento implicito: a ogni comando
   Wrangler passa un file d'ambiente vuoto (verifica l'opzione sulla versione installata, con
   Context7 o `--help`), oppure, se non esiste, rifiuta l'avvio se in `server/` c'è un `.env`
   o `.env.*` che Wrangler leggerebbe. Regressione: override nel file, ambiente del padre
   pulito → rifiuto **prima** della pubblicazione.
4. **Tokenizzatore e `ON COMMIT`.** Azzerare il contesto al `;` e limitare l'eccezione alla
   clausola `ON COMMIT` di `CREATE TEMP TABLE`. Caso del rapporto nei test unitari e nella
   prova con psql locale.

Poi CI verde, push, `STATO: PR_CORRETTA`. Il commento sulla PR con l'esito di ogni punto,
come l'altra volta.
