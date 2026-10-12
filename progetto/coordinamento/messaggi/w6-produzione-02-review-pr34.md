# W6 — Review della PR #34: rilievi e decisioni del coordinatore

Rapporto completo: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w6-pr34.md`
(verdetto DA RIFARE, 13 rilievi, CI rossa). Leggilo tutto: qui sotto c'è come chiudere
ciascun rilievo. Criterio generale: **preferire il meccanismo più semplice che renda
impossibile l'errore**, non un controllo più furbo. L'app è per una famiglia e il Mac è
dell'utente: niente architetture nuove, ma nessuna scrittura in produzione che possa
divergere da ciò che l'utente ha visto nell'anteprima.

**Prima di toccare il codice aggiorna spec e piano** (sezioni coinvolte e runbook), con un
commit a parte, e chiudi con `STATO: DOMANDA` riassumendo le modifiche ai documenti: le
leggo io prima che tu implementi. Poi implementazione con test che falliscono prima,
CI verde, push, `STATO: PR_CORRETTA`.

## Decisioni per rilievo

1. **SQL di servizio (bloccante).** `prod-sql.sh` esegue **solo gli script versionati in
   `supabase/scripts/`** (lista chiusa nel codice), letti dal commit corrente con
   checkout pulito; nessun file arbitrario. Niente più copia compilata di
   `bootstrap.sql` in `~/.config`: i dati dei familiari passano come parametri `--set`
   (variabili psql), già coperti dall'impronta. Resta come difesa un controllo che
   rifiuta `begin/commit/rollback/end/savepoint` e metacomandi `\` **ovunque** fuori da
   stringhe, commenti e corpi `$$` (un piccolo tokenizzatore, non le righe), con prove su
   `psql` reale per i casi del rapporto. L'anteprima esegue in transazione con
   `rollback`, l'applicazione in una sola transazione (`--single-transaction`,
   `ON_ERROR_STOP`).
2. **Guardia dei test distruttivi (bloccante).** La verifica dell'host locale va nel
   config di Vitest / global setup **prima di qualsiasi client o istruzione**, per tutti
   i config che chiamano `prepareDatabase()`. Prova: avvio completo di Vitest con host
   remoto → zero connessioni.
3. **Destinazione (bloccante).** Il validatore produce i campi (host singolo DNS
   canonico, porta, database, utente) e la connessione si **costruisce da quei campi**,
   non dalla URL originale. Rifiuta codifiche `%`, virgole, liste di host, parametri
   inattesi. Stesso oggetto validato per Postgres.js e per `psql`.
4. **Password negli argomenti (bloccante).** `psql`: destinazione senza password, segreto
   via `PGPASSWORD` nell'ambiente del container (o `.pgpass` temporaneo), verificato
   sull'argv. **Hyperdrive:** la creazione e il cambio della password di origine li fa
   **l'utente nella dashboard di Cloudflare** (Hyperdrive › Create/Edit), così la
   password non passa da nessuna riga di comando; il coordinatore verifica dopo con
   `wrangler hyperdrive get` (sola lettura) e `--check-connection`. Aggiorna «Chi fa
   cosa», R7 e R26.
5. **Impronta e byte eseguiti.** Leggi gli input **una volta** in memoria: impronta e
   esecuzione usano gli stessi byte (SQL inviato a `psql` via stdin; YAML e menu
   analizzati prima di aprire la transazione). Il codice si identifica con il commit e
   **richiede un checkout pulito** (`git status --porcelain` vuoto), altrimenti rifiuto.
6. **Conferma del rilascio.** La conferma lega SHA, ambito (`migrations-only` o completo),
   endpoint del database e nome effettivo del Worker. Rifiuta all'avvio
   `CLOUDFLARE_ENV` e altri override d'ambiente di Wrangler non previsti. I controlli
   dopo il rilascio verificano che risponda la versione appena pubblicata. Il comando di
   applicazione stampato conserva `--env-file`.
7. **Ordine OAuth.** L'attivazione dell'OAuth server di Supabase (e Site URL) si sposta
   nei prerequisiti della fase 1, prima del primo rilascio, come passo dell'utente in
   dashboard. Il primo rilascio controlla quindi anche i metadati OAuth. Il `fetch`
   finto deve poter simulare l'upstream OAuth spento (test che fallisce).
8. **Nuova baseline dopo la rimozione.** Semplifica: `--launch` (nuova impronta di avvio)
   è ammesso **solo se tutte le tabelle dell'app sono vuote** (stato iniziale
   dimostrato), non solo «nessuna famiglia». Per ripartire dopo una rimozione si usa
   l'azzeramento finché l'impronta è ancora valida; altrimenti si decide a mano.
   Test distruttivo con la sequenza del rapporto.
9. **Report dopo il commit.** Stampa B1 subito dopo il commit; scrittura del report come
   passo accessorio, il cui errore è un avviso con uscita distinta che dice «dati
   scritti, B1 = …». Correggi R19 e aggiungi la prova.
10. **Primo cron.** Scegli l'evidenza più semplice e non ambigua: se il job già registra
    l'esito, usa quello; altrimenti l'evento di log del cron (`wrangler tail` / log del
    Worker) con l'id della settimana, **più** il vincolo della finestra mercoledì
    20–21. Niente nuove colonne se il log basta; motiva la scelta nella spec.
11. **CI.** Il test del database iniziale verifica esito e assenza di migrazioni pendenti
    per la destinazione locale, non la frase «Remote …».
12. **Versione per il rollback.** Mostra `versions[].version_id`, tag e quota di traffico.
13. **README di supabase.** Sostituisci il vecchio percorso di ripristino con un rimando
    unico al runbook aggiornato.

**I minori che avevi annotato:** chiudi prima dell'avvio «errori del dry run senza
dettaglio» e rinomina `--env-file` in `--credentials` (evita la confusione con Node).
«`prod-sql.sh` accetta `--launch` con qualunque file» si chiude con la lista chiusa
del punto 1: `--launch` solo con `bootstrap.sql`. Il messaggio di `--migrations-only`
senza migrazioni pendenti va reso esatto. Gli altri (deadlock con la generazione,
prima volta della famiglia dalle impostazioni vuote, tipi Workers nella radice)
restano annotati nella PR.

**Decisione dell'utente (12/10): iscrizioni libere spente in produzione.** Nella fase 1,
prima del primo rilascio, passo dell'utente in dashboard: Authentication › Sign In /
Providers, «Allow new users to sign up» disattivato (gli account si creano solo con «Add
user»). Verifica in sola lettura nel runbook: una chiamata di iscrizione con la chiave
pubblica viene rifiutata. Controlla che l'OAuth server e la registrazione dinamica dei
client degli agenti funzionino comunque con le iscrizioni spente (Context7 / documentazione
di Supabase); se non è così, `STATO: DOMANDA`. Nel locale (`supabase/config.toml`) non
cambiare nulla.
