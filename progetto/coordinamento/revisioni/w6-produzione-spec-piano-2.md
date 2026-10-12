# Seconda revisione W6 — Messa in produzione

## Verdetto: APPROVABILE CON CORREZIONI

Le correzioni recepiscono gran parte dei 16 rilievi e le decisioni del coordinatore. Restano i cinque problemi seguenti, da risolvere prima dell’esecuzione.

Revisione statica in sola lettura sul worktree `718dc35`, confrontato con `main` locale `b61f457`, che comprende #30, #31 e #32. Nessuna modifica, commit od operazione remota; nessun test eseguito. Context7 non interrogato per rispettare il divieto di operazioni remote.

Riferimenti:

- **S**: `progetto/superpowers/specs/2026-10-11-messa-in-produzione.md`
- **P**: `progetto/superpowers/plans/2026-10-11-messa-in-produzione.md`

## Rilievi

### 1. Bloccante — La password di `app_server` viene impostata prima della creazione del ruolo

**Riferimenti:** P:2276–2287, P:2321–2329; `supabase/migrations/20261011100000_foundation.sql:12–14`.

R5 esegue `alter role app_server`, ma il ruolo viene creato dalla migrazione applicata soltanto in R9. Il piano contempla esplicitamente un database ancora senza migrazioni. Anche Hyperdrive viene creato prima di R9 usando quel ruolo.

**Perché conta:** il primo avvio su un progetto senza lo schema applicativo si ferma prima del rilascio. Rimandare solo `--check-connection` non risolve la dipendenza.

**Correzione:** prevedere un passo iniziale di migrazione, con destinazione verificata, anteprima e conferma, prima della password e di Hyperdrive. Verificare l’intera sequenza partendo da un database privo dei ruoli applicativi.

### 2. Importante — La rimozione dopo un caricamento fallito richiede un’impronta inesistente

**Riferimenti:** P:2373–2376, P:2385–2399; S:178–184.

La decisione del coordinatore richiede di rimuovere la famiglia se il bootstrap riesce ma il caricamento non termina nella finestra. R20 richiede però esclusivamente «`fp di R18`», prodotta dopo un caricamento riuscito. Se R18 fallisce con rollback, la famiglia del bootstrap resta, senza l’impronta necessaria a rimuoverla.

**Perché conta:** manca proprio il recupero richiesto dalla decisione 3; la famiglia incompleta può arrivare al cron successivo.

**Correzione:** registrare una baseline verificabile già al bootstrap e aggiornarla soltanto dopo un import riuscito. Aggiungere il caso «bootstrap riuscito, import fallito, rimozione entro la finestra».

### 3. Importante — L’impronta dopo il commit non garantisce «solo bootstrap e import»

**Riferimenti:** S:471–488; P:1042–1050, P:1515–1521.

L’import termina e rilascia i lock; successivamente una transazione distinta calcola l’impronta. Una scrittura concorrente fra questi due momenti viene incorporata nella baseline e può quindi essere cancellata dall’azzeramento senza provocare un rifiuto.

Inoltre ogni rilancio scritto, ammesso anche dopo l’avvio, produce una nuova impronta comprendente gli eventuali contributi della famiglia.

**Perché conta:** il rilievo precedente 3 resta parzialmente aperto: l’uguaglianza con questa impronta dimostra soltanto assenza di cambiamenti successivi alla sua lettura, non provenienza esclusiva da bootstrap/import.

**Correzione:** produrre la baseline nello stesso perimetro transazionale protetto delle scritture iniziali e distinguere esplicitamente l’avvio dai rilanci successivi, che non devono rinnovare l’autorizzazione all’azzeramento. Provare entrambe le sequenze sopra.

### 4. Importante — La conferma SQL non vincola i parametri dell’operazione

**Riferimenti:** P:2131–2148; S:30–40.

`--confirm` verifica soltanto l’hash del file SQL. Non comprende `--set`, destinazione o il file `app-fingerprint.sql` eseguito insieme al comando.

Per esempio, un’anteprima di `remove-family.sql` per la famiglia A e un’applicazione per la famiglia B hanno lo stesso hash; l’impronta globale del database è identica per entrambe.

**Perché conta:** il «vai» può autorizzare un’operazione diversa da quella mostrata. La correzione del rilievo 14 è incompleta per gli SQL parametrizzati.

**Correzione:** calcolare l’impronta sul contenuto SQL effettivo, sui parametri normalizzati e sulla destinazione verificata. Testare che il cambio del solo `family_id` venga rifiutato prima della connessione.

### 5. Importante — Con la #31 il primo rilascio espone «Scollega» con una chiave segnaposto

**Riferimenti:** P:1802–1820, P:2421–2423; su `main`, `server/wrangler.jsonc:17`, `server/src/agents/router.ts:40–45` e spec del collegamento agenti:519–522.

La #31 è già unita e configura `SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME`. W6 rinvia la chiave reale a R23, dopo l’avvio della famiglia. I controlli dettagliati del rilascio verificano la chiave della SPA, ma non quella del Worker.

**Perché conta:** il primo rilascio può risultare verde pur pubblicando uno scollegamento non funzionante. La spec unita di W2 richiede la sostituzione del segnaposto prima della pubblicazione.

**Correzione:** inserire la chiave del Worker nella PR R8 e verificarne l’uguaglianza con quella della SPA in ogni rilascio. La fase 3 può conservare attivazione e collaudo degli agenti. Aggiornare anche il riferimento di S alla PR «non ancora unita».

## Punti da decidere dal coordinatore o dall’utente

Nessuna nuova decisione di prodotto necessaria. I rilievi richiedono di completare le garanzie e l’ordine operativo già concordati.