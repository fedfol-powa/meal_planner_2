# Seconda revisione W2 — Schema e permessi

**Verdetto: DA RIFARE.**

Le correzioni risolvono il precedente difetto bloccante su `EXECUTE` e gran parte dei problemi segnalati. Restano però una perdita di informazioni attraverso un trigger, una regressione nella cancellazione degli autori e verifiche che non possono produrre il risultato atteso. Non serve cambiare stack.

Revisione del branch `fondamenta/schema`, commit **`c7058917c9105d63204eb65f59c91eb53514ca47`**, confrontato con il primo rapporto, le decisioni del coordinatore, la specifica principale, il piano generale nel checkout principale e le interfacce aggiornate W1/W3/W4.

**Nessun database avviato, nessun test SQL eseguito, nessun file modificato.** Verificati staticamente SQL e test incorporati nel piano; riprodotta soltanto la trasformazione testuale del bootstrap. Consultata la documentazione PostgreSQL tramite Context7.

## Verifica dei rilievi della prima revisione

“Risolto” indica che la correzione è presente e coerente nei documenti e nel SQL previsto, non che sia stata collaudata sul database.

| Rilievo precedente | Esito della seconda verifica |
|---|---|
| **1. `EXECUTE` a PUBLIC** | **Risolto.** Tutte le 28 funzioni `app.*` previste hanno una revoca esplicita; seguono grant selettivi. Aggiunte ispezione dei privilegi e chiamate negative: [piano:2686](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/plans/2026-10-11-schema-e-permessi.md:2686). |
| **2. Risolutori che rivelano la famiglia** | **Risolto per le funzioni indicate.** `can_access_*` restituiscono booleani e i risolutori interni non ricevono grant: [piano:1810](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/plans/2026-10-11-schema-e-permessi.md:1810). Resta un’altra via di divulgazione, descritta nel nuovo rilievo 1. |
| **3. `undoes` fra famiglie** | **Vincolo risolto.** La FK composta impone lo stesso slot: [piano:1790](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/plans/2026-10-11-schema-e-permessi.md:1790). Il test positivo contiene però l’errore descritto nel nuovo rilievo 4. |
| **4. Cancellazione di ingredienti e libri** | **Risolto.** Archiviazione, assenza di grant `DELETE` e rimozione della cascata su `ingredient_versions`: [piano:951](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/plans/2026-10-11-schema-e-permessi.md:951), [permessi:1136](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/plans/2026-10-11-schema-e-permessi.md:1136). |
| **5. Conservazione delle bozze** | **Parzialmente risolto.** Chiusura, indice sulle sole bozze aperte e conservazione dei salvataggi sono presenti. Il blocco indiscriminato degli aggiornamenti introduce la regressione del nuovo rilievo 2. |
| **6. Identità di settimane e pasti** | **Risolto nei permessi.** Grant per colonna sia agli utenti sia al job: [piano:1861](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/plans/2026-10-11-schema-e-permessi.md:1861), [piano:2264](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/plans/2026-10-11-schema-e-permessi.md:2264). |
| **7. Rinomina delle bozze citate** | **Risolto.** Trigger sulle famiglie che citano la ricetta e test con transazioni distinte: [piano:2545](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/plans/2026-10-11-schema-e-permessi.md:2545), [test:2410](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/plans/2026-10-11-schema-e-permessi.md:2410). |
| **8. Bootstrap per nome** | **Risolto nello script applicativo.** Famiglia e appartenenze usano l’UUID dichiarato: [piano:2907](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/plans/2026-10-11-schema-e-permessi.md:2907). La nuova prova del bootstrap è difettosa: nuovo rilievo 3. |
| **9. Isolamento dal seed** | **Parzialmente risolto.** Corretti i conteggi del job; resta un conteggio di `identity_test.sql` contaminato dal seed, descritto nel nuovo rilievo 4. |
| **10. Nomi W1/W2** | **Allineamento documentale risolto.** W1 usa `app.profiles.user_id`, `app.user_roles` e le funzioni concordate. W2 richiede esplicitamente la prova di `session.whoami` sulle migrazioni reali: [spec:534](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/specs/2026-10-11-schema-e-permessi.md:534). Prova ancora da eseguire. |
| **11. Preparazione nelle equivalenze** | **Risolto nelle interfacce.** W4 include `preparation`, normalizzazione e precedenza della specifica; W3 usa le stesse funzioni: [W4:95](/Users/fedfol/Projects/meal_planner_2/.worktrees/unita-spesa/progetto/superpowers/specs/2026-10-11-unita-spesa.md:95). |
| **12. Combinazioni delle quantità** | **Risolto.** Tre casi separati nel vincolo, con test delle combinazioni parziali: [piano:1047](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/plans/2026-10-11-schema-e-permessi.md:1047). |

Anche i quattro punti affidati al coordinatore sono stati recepiti:

- **R1:** ripiego sulla prima versione pubblicata e `NULL` soltanto senza versioni, con test: piano, righe 1710–1713 e 1845–1851.
- **Revoca:** claim invariati nei test di rimozione e revoca del curatore; prova OAuth reale assegnata all’ondata 2. Manca ancora un’asserzione esplicita sulla scomparsa della ricetta in bozza citata dopo la rimozione dalla famiglia.
- **`triedUndated`:** tabella `family_tried_recipes` e destinazione concorde nella spec W3.
- **Contatori:** test con transazioni reali distinte e rollback. Resta la discrepanza sulle scritture senza effetti descritta nel rilievo 6.

## Rilievi

### 1. Importante — Il trigger della data rivela informazioni su settimane non autorizzate

**Riferimenti:** [piano:1764](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/plans/2026-10-11-schema-e-permessi.md:1764), [policy:1868](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/plans/2026-10-11-schema-e-permessi.md:1868).

`check_meal_slot_date()` è `SECURITY DEFINER`: legge `weeks.starts_on` senza verificare l’appartenenza e, se la data è fuori settimana, la include nell’eccezione. È eseguito da un trigger `BEFORE INSERT`.

PostgreSQL applica `WITH CHECK` **dopo** i trigger `BEFORE ROW`. La policy non impedisce quindi questa lettura anticipata. [Documentazione PostgreSQL](https://www.postgresql.org/docs/17/sql-createpolicy.html).

Un utente con l’UUID di una settimana altrui può tentare di inserirvi un pasto con una data esterna: riceve `23514` con il lunedì della settimana. Con un UUID inesistente il trigger non produce quell’errore e interviene invece RLS. Si distinguono quindi record altrui e inesistenti, oltre a leggere un dato del record.

Il test attuale usa una data interna alla settimana altrui e non intercetta il problema.

**Correzione proposta:** eseguire il controllo della data con visibilità soggetta a RLS, oppure autorizzare esplicitamente la lettura prima di usarne i dati, conservando il percorso del job. Aggiungere test con settimana propria, altrui e inesistente, usando date esterne: i due casi non autorizzati devono avere un esito indistinguibile.

### 2. Importante — Una bozza chiusa impedisce la cancellazione dei suoi autori

**Riferimenti:** [FK degli autori:1064](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/plans/2026-10-11-schema-e-permessi.md:1064), [trigger:1076](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/plans/2026-10-11-schema-e-permessi.md:1076), [test di cancellazione:884](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/plans/2026-10-11-schema-e-permessi.md:884).

`created_by`, `updated_by` e `closed_by` hanno `ON DELETE SET NULL`, ma `recipe_drafts_closed` rifiuta **qualsiasi** aggiornamento se la bozza è chiusa.

Cancellando uno degli utenti referenziati, la FK tenta di azzerare la colonna; il trigger solleva `55000` e fa fallire la cancellazione. Le azioni referenziali eseguono aggiornamenti ordinari e attivano i trigger della tabella interessata. [Documentazione PostgreSQL](https://www.postgresql.org/docs/17/trigger-definition.html).

Il problema emerge già nella sequenza prevista da `catalogue_test.sql`: chiude bozze attribuite a Dario, poi cancella Dario aspettandosi di conservare il catalogo senza autore.

**Correzione proposta:** rendere immutabili contenuto, revisione, identità ed esito della bozza, consentendo l’azzeramento dei riferimenti personali richiesto dalle FK. Verificare separatamente la cancellazione del creatore, dell’ultimo modificatore e di chi ha chiuso la bozza, sia pubblicata sia scartata; contenuto e salvataggi devono restare integri.

### 3. Importante — Il test del bootstrap si blocca sempre e ripulisce anche famiglie estranee

**Riferimenti:** [controllo del segnaposto:2888](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/plans/2026-10-11-schema-e-permessi.md:2888), [sostituzione e pulizia:2958](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/plans/2026-10-11-schema-e-permessi.md:2958).

`fill()` sostituisce l’UUID nullo su tutte le righe dello script, compresa quella che controlla il segnaposto. Ho riprodotto la trasformazione testuale prevista: il risultato contiene contemporaneamente

```sql
insert into input_family values ('7b3c8a52-5d0e-4f43-9a51-6c1f0e2a9b10', ...);

if exists (
  select 1 from input_family
  where id = '7b3c8a52-5d0e-4f43-9a51-6c1f0e2a9b10'
) then
  raise exception 'write the family id first: select gen_random_uuid()';
```

Il primo bootstrap del test viene quindi sempre rifiutato.

Inoltre `cleanup()` cancella qualunque famiglia chiamata `Bootstrap test` o `Renamed`, con i relativi dati in cascata. Sono nomi non univoci: la pulizia può eliminare famiglie locali preesistenti che il test non ha creato.

**Correzione proposta:** sostituire soltanto i valori dell’input, lasciando intatta la logica di validazione. Assegnare UUID espliciti a entrambe le famiglie di prova e cancellare soltanto quelli. Aggiungere una famiglia omonima estranea alla fixture e verificare che sopravviva anche alla pulizia.

### 4. Importante — Restano errori deterministici nelle fixture e nelle asserzioni

**Riferimenti:** [test identità:546](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/plans/2026-10-11-schema-e-permessi.md:546), [seed:2785](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/plans/2026-10-11-schema-e-permessi.md:2785), [test pasti:1616](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/plans/2026-10-11-schema-e-permessi.md:1616), [annullamento:1652](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/plans/2026-10-11-schema-e-permessi.md:1652).

Due problemi indipendenti impediscono il `PASS` promesso:

- **Identità:** dopo aver cancellato `dario@test.local`, il test conta tutti i profili con `display_name LIKE 'Dario%'` e si aspetta zero. Il seed conserva `dario@example.test`, anch’esso chiamato Dario: il risultato è uno.
- **Pasti:** il test aggiunge il pranzo di martedì ai Rossi. Successivamente l’aggiornamento dello “scambio” seleziona tutti i pranzi della settimana e si aspetta una riga: ne seleziona due. Anche il test positivo di `undoes` seleziona entrambi i pranzi, mentre la modifica annullata appartiene soltanto al lunedì; la FK composta rifiuta correttamente l’inserimento. Di conseguenza non viene nemmeno preparata la catena di annullamento che il successivo test di cancellazione della famiglia dichiara di verificare.

**Correzione proposta:** identificare utenti e slot tramite UUID conservati dalla fixture, oppure tramite chiavi complete. Limitare il conteggio del profilo all’utente di prova e selezionare esattamente lo slot della modifica annullata. Verificare la presenza della catena prima della cancellazione della famiglia.

Completare inoltre le regressioni richieste: spostamento di uno slot fra **le due famiglie di Anna** — il test attuale usa Verdi — e lettura della bozza citata dopo la rimozione del membro.

### 5. Importante — I curatori non possono leggere i nomi degli altri autori del ricettario

**Riferimenti:** [spec W2:394](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/specs/2026-10-11-schema-e-permessi.md:394), [policy:1505](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/plans/2026-10-11-schema-e-permessi.md:1505), [requisito principale:1230](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/specs/2026-09-29-app-famiglia-design.md:1230).

La specifica principale richiede che tutti i curatori vedano autore e ultima modifica delle bozze condivise; anche il conflitto deve indicare chi ha salvato.

Le tabelle conservano gli UUID degli autori, ma `profiles_read` permette di leggere soltanto il proprio profilo e quelli di chi condivide una famiglia. Non è previsto un altro accesso ai nomi.

Due curatori senza famiglie in comune possono quindi leggere e modificare la stessa bozza, ma il server nel loro ruolo non può risolvere il nome dell’altro autore. Il test con un solo curatore non copre questo caso.

**Correzione proposta:** definire un accesso limitato ai nomi degli autori dei contributi consultabili dal curatore, senza aprire i contenuti familiari o l’intero profilo. Aggiungere due curatori senza famiglie comuni e verificare attribuzioni delle bozze, salvataggi e versioni, mantenendo i divieti per gli utenti ordinari.

### 6. Minore — Le scritture senza effetti fanno comunque crescere i contatori

**Riferimenti:** [trigger del catalogo:2616](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/plans/2026-10-11-schema-e-permessi.md:2616), [contratto W1:318](/Users/fedfol/Projects/meal_planner_2/.worktrees/piattaforma/progetto/superpowers/specs/2026-10-11-piattaforma.md:318).

Quattro trigger del catalogo sono `FOR EACH STATEMENT` e incrementano il contatore anche se nessuna riga viene modificata. Per esempio:

```sql
update app.ingredients set is_pantry = true where false;
```

Una transazione con questa sola istruzione invalida il catalogo. Lo stesso effetto è possibile con un aggiornamento che RLS riduce a zero righe. Anche vari trigger per riga non distinguono un cambiamento effettivo dalla riscrittura dello stesso valore.

Questo non restituisce dati errati, ma diverge dal contratto osservabile concordato e genera invalidazioni evitabili.

**Correzione proposta:** far dipendere l’incremento dalle righe effettivamente cambiate, mantenendo la deduplicazione per transazione. Aggiungere prove con zero righe, aggiornamento senza variazioni e scrittura esclusa da RLS.

## Punti da decidere e consolidare

1. **Accesso ai nomi degli autori:** il coordinatore deve scegliere e registrare il meccanismo limitato indicato nel rilievo 5. Il requisito di mostrare le attribuzioni è già approvato; non occorre riaprire quella scelta di prodotto.
2. **R1 prima della prima pubblicazione:** la decisione del coordinatore è correttamente recepita. Resta da mostrarla all’utente, come previsto dal piano generale, e consolidarla nella specifica principale.
3. **Integrazione W1/W2:** mantenere come criterio di chiusura la prova di `session.whoami` contro le migrazioni reali. L’allineamento dei nomi è verificato; l’integrazione eseguibile non è stata provata in questa revisione.
4. **Revoca OAuth reale:** resta correttamente assegnata all’attività «Collegamento degli agenti» dell’ondata 2. I test con claim sintetici di W2 non devono essere presentati come prova della revoca dei token OAuth.