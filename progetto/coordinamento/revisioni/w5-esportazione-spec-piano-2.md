# Seconda revisione — Esportazione notturna in R2

**Verdetto: APPROVABILE CON CORREZIONI**

Revisione in sola lettura al commit `84812aa`, confrontata con `main` (`d1fd4ce`) e con le decisioni di `w5-08-review-esportazione.md`. Seguono solo problemi nuovi o non completamente risolti.

## Rilievi

1. **Bloccante — Il confronto Auth contiene una query non valida.**  
   **Riferimento:** [Piano:1621](progetto/superpowers/plans/2026-10-11-esportazione-r2.md#L1621).  
   Nel CTE `exported`, `jsonb_agg(e::jsonb)` aggrega le righe, mentre la sottoquery che calcola `keys` usa `restore_document.doc` senza aggregarlo né raggrupparlo. PostgreSQL rifiuta questa combinazione: la sottoquery riferisce una colonna esterna non raggruppata. [Regole PostgreSQL sulle aggregazioni](https://www.postgresql.org/docs/17/sql-select.html#SQL-GROUPBY).  
   **Impatto:** ogni ripristino che raggiunge `verifyRestored` fallisce; i percorsi positivi dei Task 6 e 8 e la CI restano rossi. I precedenti rilievi 7–8 non sono quindi completamente chiusi.  
   **Correzione:** calcolare righe aggregate e insieme delle colonne in due sottoquery indipendenti, poi combinarle. Verificare anche Auth vuoto, `--dry-run` e ripristino effettivo.

2. **Importante — Il comando Hyperdrive usa l’utente sbagliato per il Session pooler.**  
   **Riferimenti:** [Piano:2165](progetto/superpowers/plans/2026-10-11-esportazione-r2.md#L2165), [Spec:388](progetto/superpowers/specs/2026-10-11-esportazione-r2.md#L388); configurazione esistente in [supabase/README.md:147](supabase/README.md#L147).  
   La procedura indica il Session pooler ma passa `--origin-user app_server`. Il collegamento richiede `app_server.<project_ref>`, come già documentato nel repository.  
   **Impatto:** dopo il recupero su un nuovo progetto, Hyperdrive non raggiunge correttamente il database. Il precedente rilievo 6 resta parzialmente aperto.  
   **Correzione:** usare il riferimento del **nuovo** progetto nel nome utente e aggiornare coerentemente spec e comando operativo.

3. **Minore — Il collaudo interroga un URL MCP inesistente.**  
   **Riferimenti:** [Piano:2171](progetto/superpowers/plans/2026-10-11-esportazione-r2.md#L2171), [Piano:2224](progetto/superpowers/plans/2026-10-11-esportazione-r2.md#L2224), [Spec:395](progetto/superpowers/specs/2026-10-11-esportazione-r2.md#L395); [server/src/app.ts:37](server/src/app.ts#L37).  
   Il percorso documentato è `/.well-known/oauth-protected-resource`; il server espone `/.well-known/oauth-protected-resource/mcp` e restituisce 404 sugli altri percorsi di discovery.  
   **Impatto:** il collaudo locale obbligatorio fallisce anche con un’app configurata correttamente.  
   **Correzione:** aggiungere `/mcp` in tutti i passi e verificare che `authorization_servers` indichi il nuovo progetto.

## Controlli di `main`

Il piano descrive **una sola PR finale**, composta da nove task con commit intermedi. Non definisce ulteriori PR autonome.

La PR prevista **non passa ancora i controlli**: il rilievo 1 blocca i test di ripristino inclusi in `npm test` e il nuovo `test:drill`. Un’eventuale suddivisione in più PR dovrà esplicitare contenuti e verifiche di ciascuna.

## Punti da decidere

Nessuna nuova decisione di prodotto richiesta: le correzioni applicano le decisioni già ricevute.

## Limiti della verifica

Controllati documenti, configurazione CI e codice pertinente; verificati gli estratti TypeScript in memoria. Non eseguiti ripristini: la sandbox impedisce la connessione al database locale (`EPERM`). Nessun file modificato, commit o operazione remota.