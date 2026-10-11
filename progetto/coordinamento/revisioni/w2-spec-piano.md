# Revisione W2 — Schema e permessi

**Verdetto: DA RIFARE.**

Il piano contiene un difetto bloccante nei privilegi delle funzioni, oltre a problemi di isolamento, conservazione dello storico e invalidazione delle letture. Occorre correggere spec e piano prima dell’implementazione; non è necessario cambiare lo stack.

Revisione in sola lettura del branch `fondamenta/schema`, includendo gli aggiornamenti fino al commit **`a4453f9`**. I riferimenti a W2 seguono quella revisione. Confrontati specifica principale, piano generale nel checkout principale, brief, interfacce W1/W3/W4 e SQL dello spike. Consultata la documentazione tramite Context7. **Nessun database avviato, nessun test eseguito, nessun file modificato.**

## Rilievi

### 1. Bloccante — La revoca di `EXECUTE` a `PUBLIC` non funziona come previsto

**Riferimenti:** [Piano W2:336](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/plans/2026-10-11-schema-e-permessi.md:336), [funzioni dei contatori:2142](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/plans/2026-10-11-schema-e-permessi.md:2142).

Il comando:

```sql
alter default privileges in schema app
revoke execute on functions from public;
```

non elimina il privilegio predefinito globale di esecuzione delle funzioni. PostgreSQL documenta esplicitamente che una revoca limitata allo schema non può rimuovere privilegi concessi globalmente. [Documentazione PostgreSQL](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html).

Di conseguenza, il SQL previsto lascia invocabili funzioni `SECURITY DEFINER` interne. Poiché `anon` ha `USAGE` su `app`, può eseguire, per esempio, `bump_family_version(uuid)` e `bump_catalogue_version()`, scrivendo con i privilegi del proprietario. Il suo accesso non è quindi limitato alla funzione Bring!.

Questo è un difetto del confine SQL richiesto: non presuppone che esista un endpoint pubblico per eseguire SQL arbitrario.

**Correzione proposta:** revocare esplicitamente `EXECUTE FROM PUBLIC` sulle funzioni create in ogni migrazione, nella stessa transazione, prima dei grant selettivi; oppure impostare correttamente i privilegi globali del ruolo creatore, valutandone l’ambito. Aggiungere prove di chiamata negativa, come `anon` e `authenticated`, delle funzioni interne, oltre all’ispezione delle ACL.

### 2. Importante — Le funzioni di risalita alla famiglia aggirano la riservatezza dei record

**Riferimenti:** [Piano W2:1572](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/plans/2026-10-11-schema-e-permessi.md:1572), [Piano W2:1836](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/plans/2026-10-11-schema-e-permessi.md:1836).

`week_family_id`, `slot_family_id` e `list_family_id` sono `SECURITY DEFINER`, leggono senza verificare l’appartenenza e sono eseguibili da `authenticated`.

Anche correggendo il rilievo 1, un utente può passare l’UUID di un record esterno e conoscere la famiglia a cui appartiene. Anche `app_admin` e curatori senza famiglie possono farlo. Le policy delle tabelle non proteggono questa via di lettura.

**Correzione proposta:** usare funzioni che restituiscano soltanto l’esito dell’autorizzazione, oppure applicare il controllo di appartenenza prima di restituire l’identificativo. Separare eventuali risolutori interni necessari ai trigger. Testare direttamente le funzioni con record propri, altrui e inesistenti, anche dopo la rimozione dalla famiglia.

### 3. Importante — `meal_changes.undoes` permette collegamenti fra famiglie diverse

**Riferimenti:** [Piano W2:1553](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/plans/2026-10-11-schema-e-permessi.md:1553), [policy di inserimento:1594](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/plans/2026-10-11-schema-e-permessi.md:1594).

La policy controlla autore e famiglia del nuovo `meal_slot_id`, ma non il record indicato da `undoes`. La chiave esterna verifica soltanto che l’identificativo esista.

Una modifica della famiglia A può quindi dichiarare di annullare una modifica della famiglia B. Il riferimento può inoltre impedire la cancellazione di B: la sua cascata incontra una riga referenziata da A.

**Correzione proposta:** garantire nel database almeno che modifica e annullamento appartengano alla stessa famiglia, preferibilmente allo stesso slot quando compatibile con lo scambio dei pasti. Il controllo applicativo sull’annullamento delle proprie modifiche resta aggiuntivo. Prevedere test con riferimenti fra famiglie e cancellazione della famiglia coinvolta.

### 4. Importante — Si possono eliminare ingredienti e libri ancora necessari alle versioni storiche

**Riferimenti:** [Piano W2:833](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/plans/2026-10-11-schema-e-permessi.md:833), [grant del catalogo:1005](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/plans/2026-10-11-schema-e-permessi.md:1005), [documento W3:112](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricetta-import/progetto/superpowers/specs/2026-10-11-ricetta-import.md:112).

Le versioni conservano `ingredientId` e `bookId` dentro JSON. Le chiavi esterne proteggono le proiezioni correnti, non questi riferimenti storici. I curatori possono cancellare ingredienti e libri; cancellare un ingrediente elimina anche `ingredient_versions` per cascata.

Esempio: un ingrediente presente nella versione 1 viene tolto dalla versione 2. In assenza di altri riferimenti relazionali, può essere cancellato insieme al proprio storico, benché un pasto passato usi ancora la versione 1. Questo compromette R1 e la ricostruzione del catalogo.

**Correzione proposta:** impedire la cancellazione fisica delle entità condivise già referenziate dallo storico, conservandone l’identità; oppure modellare e proteggere anche i riferimenti delle versioni. Testare la rimozione dalla proiezione corrente seguita dal tentativo di cancellazione, verificando che il pasto storico resti risolvibile.

### 5. Importante — La cronologia delle bozze non è realmente in sola aggiunta

**Riferimenti:** [Piano W2:961](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/plans/2026-10-11-schema-e-permessi.md:961), [permessi:1005](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/plans/2026-10-11-schema-e-permessi.md:1005), [Spec W2:355](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/specs/2026-10-11-schema-e-permessi.md:355).

`recipe_draft_saves` vieta la cancellazione diretta, ma ha `ON DELETE CASCADE` verso `recipe_drafts`, che i curatori possono cancellare. Eliminare una bozza distrugge quindi tutti i salvataggi, compresi quelli sovrascritti che devono restare recuperabili.

Il test previsto verifica soltanto `DELETE FROM recipe_draft_saves`, non la cancellazione attraverso il padre.

**Correzione proposta:** definire il ciclo di vita delle bozze dopo pubblicazione e scarto, separando la bozza aperta dalla cronologia conservata. Evitare la cascata distruttiva e prevedere test di pubblicazione, scarto e successiva revisione della stessa ricetta. Un’eventuale conservazione limitata richiede una decisione esplicita.

### 6. Importante — Gli aggiornamenti possono alterare l’identità temporale e familiare dei pasti

**Riferimenti:** [Piano W2:1542](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/plans/2026-10-11-schema-e-permessi.md:1542), [grant e policy:1584](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/plans/2026-10-11-schema-e-permessi.md:1584).

Il grant `UPDATE` su tutte le colonne di `weeks` e `meal_slots` consente modifiche che il modello non protegge:

- cambiare `weeks.starts_on` lascia i pasti fuori dalla settimana, perché il trigger controlla soltanto scritture su `meal_slots`;
- un utente membro di due famiglie può spostare un pasto modificandone `week_id`, trascinando il relativo registro nella famiglia di destinazione. Entrambi i controlli RLS risultano soddisfatti.

**Correzione proposta:** concedere aggiornamenti solo alle colonne previste dalle operazioni. Rendere immutabili famiglia e data iniziale della settimana, nonché appartenenza e posizione dello slot, salvo un’operazione esplicitamente progettata. Lo scambio deve aggiornare il contenuto dei pasti. Aggiungere test con Anna, membro di due famiglie, e sulla modifica della settimana padre.

### 7. Importante — Rinominare una bozza citata nei pasti lascia valida una cache obsoleta

**Riferimenti:** [Spec W2:196](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/specs/2026-10-11-schema-e-permessi.md:196), [test del contatore:2083](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/plans/2026-10-11-schema-e-permessi.md:2083), [trigger:2241](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/plans/2026-10-11-schema-e-permessi.md:2241).

La spec prevede che i membri leggano nome e descrizione delle ricette in bozza citate dai loro pasti. Il server aggiorna queste proiezioni a ogni salvataggio, ma il trigger esclude le ricette che restano `draft`; nessun altro trigger invalida le famiglie che le citano.

Dopo una rinomina cambiano quindi dati visibili nel Menu, mentre entrambi i contatori usati da W1 restano identici. Il middleware può rispondere `unchanged` conservando il nome precedente.

**Correzione proposta:** invalidare le famiglie interessate quando cambiano le proiezioni visibili delle bozze citate, oppure introdurre una dipendenza di versione equivalente. Il test deve verificare la versione della vista familiare, oltre alla mancata variazione del catalogo pubblicato.

### 8. Importante — Il bootstrap identifica la famiglia tramite un nome non univoco

**Riferimento:** [Piano W2:2503](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/plans/2026-10-11-schema-e-permessi.md:2503).

Lo script cerca e riutilizza le famiglie per `name`, poi inserisce le appartenenze con un join sul nome. Lo schema permette famiglie omonime.

Con due famiglie dello stesso nome, lo script assegna le persone a entrambe, eventualmente come amministratori. Anche una singola omonimia non intenzionale fa riutilizzare una famiglia diversa da quella desiderata. L’esecuzione privilegiata aggira correttamente RLS, rendendo però questo errore particolarmente rilevante.

**Correzione proposta:** usare un UUID stabile e dichiarato nell’input del bootstrap, con controlli espliciti sull’eventuale famiglia esistente. Non rendere globalmente univoci i nomi delle famiglie per risolvere un problema dello script. Testare omonimie e rilancio dopo una rinomina.

### 9. Importante — La suite finale prevista non è isolata dal seed

**Riferimenti:** [Piano W2:1907](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/plans/2026-10-11-schema-e-permessi.md:1907), [seed:2401](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/plans/2026-10-11-schema-e-permessi.md:2401).

`db reset` applica il seed, che crea due famiglie e tre appartenenze. Le fixture aggiungono altre tre famiglie e cinque appartenenze. `jobs_test.sql`, eseguito come `app_job`, conta tutte le righe ma si aspetta rispettivamente **3 e 5**, mentre con il seed previsto ne vede **5 e 8**.

Il risultato finale `PASS` indicato dal piano non è quindi ottenibile con quei dati e quelle asserzioni.

**Correzione proposta:** definire un ambiente di test senza seed dimostrativo oppure isolare esplicitamente le fixture. Conservare prove che dimostrino l’accesso del job a più famiglie, senza conteggi dipendenti dai dati di sviluppo.

### 10. Importante — Il contratto di identità W1/W2 contiene nomi incompatibili

**Riferimenti:** [Spec W1:158](/Users/fedfol/Projects/meal_planner_2/.worktrees/piattaforma/progetto/superpowers/specs/2026-10-11-piattaforma.md:158), [Spec W1:184](/Users/fedfol/Projects/meal_planner_2/.worktrees/piattaforma/progetto/superpowers/specs/2026-10-11-piattaforma.md:184), [Spec W2:397](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/specs/2026-10-11-schema-e-permessi.md:397).

W1 documenta:

```sql
from profiles p where p.id = auth.uid()
```

W2 crea invece `app.profiles(user_id, ...)`. Anche impostando `search_path`, `p.id` non esiste. W1 cita inoltre `user_global_roles`, mentre W2 definisce `app.user_roles`.

La query del profilo precede ogni operazione autenticata, quindi la prima divergenza interrompe l’intero percorso della richiesta.

**Correzione proposta:** consolidare nel coordinamento i nomi definitivi e aggiornare W1, comprese le fixture temporanee. Richiedere una prova di `session.whoami` contro le migrazioni W2 effettive prima di considerare chiusa l’interfaccia.

### 11. Importante — Le equivalenze per preparazione non sono ancora concordi con l’interfaccia W4 letta

**Riferimenti:** [Spec W2:161](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/specs/2026-10-11-schema-e-permessi.md:161), [Spec W4:86](/Users/fedfol/Projects/meal_planner_2/.worktrees/unita-spesa/progetto/superpowers/specs/2026-10-11-unita-spesa.md:86), [ingresso del consolidamento W4:189](/Users/fedfol/Projects/meal_planner_2/.worktrees/unita-spesa/progetto/superpowers/specs/2026-10-11-unita-spesa.md:189).

L’aggiornamento W2 introduce equivalenze specifiche per `preparation`, con precedenza su quelle generiche. Nella spec W4 letta, `UnitEquivalence` non include questo campo e le righe del consolidamento escludono esplicitamente la preparazione.

W2 può quindi conservare una configurazione che il contratto W4 non permette di applicare correttamente.

**Correzione proposta:** completare l’allineamento W2/W3/W4 su campo, normalizzazione, precedenza e momento di applicazione. Verificare casi con equivalenza generica e specifica insieme, anche nella spesa di versioni storiche. Il rilievo riguarda l’interfaccia documentata al momento della revisione.

### 12. Minore — Il vincolo delle quantità ammette combinazioni parzialmente incoerenti

**Riferimento:** [Piano W2:940](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/plans/2026-10-11-schema-e-permessi.md:940).

Il confronto:

```sql
(quantity_kind = 'amount') = (quantity is not null and unit is not null)
```

accetta `to_taste` con soltanto `quantity` oppure soltanto `unit` valorizzato. Inoltre `text` può avere `quantity_text = NULL`.

La validazione del dominio riduce il rischio applicativo, ma il vincolo non realizza completamente l’invariante dichiarata.

**Correzione proposta:** esprimere separatamente i tre casi consentiti e testare tutte le combinazioni parziali.

## Punti da decidere e consolidare

1. **R1 quando non esiste una versione al momento del pasto.**  
   [Spec W2:238](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/specs/2026-10-11-schema-e-permessi.md:238) e [piano:1640](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/plans/2026-10-11-schema-e-permessi.md:1640) restituiscono `NULL`. Il caso riguarda sia lo storico importato, antecedente alla prima pubblicazione nel nuovo database, sia una correzione di un pasto passato con una ricetta pubblicata successivamente. Coordinatore e utente devono stabilire cosa mostrare e usare nella spesa. Non va introdotta implicitamente una retrodatazione o una scelta della versione corrente.

2. **Revoca immediata: assegnare una verifica completa e un criterio di accettazione.**  
   Il controllo di sessione proposto è coerente con il meccanismo documentato; Supabase descrive la revoca dei grant come invalidazione delle sessioni e dei refresh token del client. [Documentazione Supabase](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows). Tuttavia, W2 promette una verifica dei token OAuth nel primo compito, mentre il piano usa sessioni e claim sintetici; W1 rimanda la prova reale all’ondata 2. Occorre assegnare esplicitamente la prova: stesso JWT prima e dopo revoca, rifiuto anche sulle letture del catalogo e con `knownVersion`, mantenimento dell’accesso degli altri client e della sessione web. Verificare separatamente rimozione dalla famiglia e revoca del ruolo di curatore con JWT ancora valido.

3. **R4: destinazione persistente di `triedUndated`.**  
   [W3:394](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricetta-import/progetto/superpowers/specs/2026-10-11-ricetta-import.md:394) produce le ricette provate senza data; W2 non identifica dove conservarle. Il coordinatore deve fissare la rappresentazione nei dati familiari e il suo uso, senza inventare pasti né perdere l’informazione nell’import.

4. **Granularità dei contatori.**  
   [W2:322](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/specs/2026-10-11-schema-e-permessi.md:322) stabilisce un incremento per transazione, mentre [W1:284](/Users/fedfol/Projects/meal_planner_2/.worktrees/piattaforma/progetto/superpowers/specs/2026-10-11-piattaforma.md:284) descrive trigger per istruzione. Entrambe le scelte possono sostenere l’invalidazione, ma il contratto deve essere unico. La verifica finale dovrebbe includere transazioni reali distinte e rollback: azzerare gli `xid` con `tests.new_transaction()` non dimostra quei comportamenti.