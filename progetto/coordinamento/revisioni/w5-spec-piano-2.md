# Seconda revisione W5 — App web di base

**Verdetto: DA RIFARE nelle parti relative a sessione, persistenza e aggiornamento della PWA, prima dell’implementazione.**

Le decisioni del coordinatore sono state recepite nella specifica e molte correzioni sono corrette. Il codice proposto nel piano conserva però difetti riproducibili: cancella la copia persistita durante l’avvio, confonde richieste concorrenti con rinnovi falliti, permette a un recupero della vecchia sessione di chiudere quella nuova e può compromettere la shell offline durante un aggiornamento.

## Perimetro e verifiche

Revisione in sola lettura sul branch `fondamenta/web`, commit `8200ef24506f04f2f0fb23703f71d5c7f7a42c3e`.

Riferimenti abbreviati:

- **P**: [piano W5](/Users/fedfol/Projects/meal_planner_2/.worktrees/web/progetto/superpowers/plans/2026-10-11-app-web-di-base.md).
- **S**: [specifica W5](/Users/fedfol/Projects/meal_planner_2/.worktrees/web/progetto/superpowers/specs/2026-10-11-app-web-di-base.md).
- **W1**: [specifica della piattaforma](/Users/fedfol/Projects/meal_planner_2/.worktrees/piattaforma/progetto/superpowers/specs/2026-10-11-piattaforma.md).

Consultati il brief del revisore, `AGENTS.md`, la prima revisione, le decisioni del coordinatore, il piano generale aggiornato nel checkout principale, le sezioni pertinenti della specifica principale, `spike/REPORT.md` e i riferimenti di design.

Verificata tramite Context7 la documentazione di Supabase e TanStack Query. Eseguiti estratti del codice del piano con Node, senza scrivere file, usando sostituti in memoria per cache, rete e backend. Le prove confermano i rilievi 1–6 nelle sequenze descritte; non equivalgono a test dell’app completa.

**Test, typecheck e build dell’app non eseguiti:** nel worktree non esiste ancora `web/`. Nessuna modifica, commit o scrittura del rapporto su file.

## Verifica dei rilievi della prima revisione

«Risolto» indica una correzione coerente nel piano, da verificare sull’implementazione.

| Rilievo precedente | Esito della seconda verifica |
|---|---|
| **1. Chiusura della sessione** | **Parziale.** Introdotti chiusura comune, ambito locale e persister con coda. Restano problemi di avvio e operazioni asincrone appartenenti alla vecchia identità: nuovi rilievi 1 e 3. |
| **2. Accesso rifiutato e dati conservati** | **Parziale.** Presenti recupero e revoca per famiglia, ma il recupero concorrente è errato, la revoca non coordina le schede e il Profilo mostra ancora dati bloccati: rilievi 2, 4 e 8. |
| **3. Versioni numeriche** | **Quasi risolto.** Tipi, client e `readThrough` usano stringhe opache; rimane una fixture numerica: rilievo 9. |
| **4. Persistenza del voto ottimistico** | **Risolto.** Eliminato l’aggiornamento ottimistico; il voto entra nella cache solo alla risposta (P, 4436–4445). |
| **5. Rollback e concorrenza dei voti** | **Risolto il rollback distruttivo.** Presenti controllo dell’ultima richiesta e scarto a sessione chiusa. Resta una diversa concorrenza fra letture e mutazioni: rilievo 5. |
| **6. Filtri, ordinamento e famiglie** | **Risolto secondo la decisione del coordinatore.** Patch limitato alla famiglia e invalidazione delle liste derivate (P, 4420–4427). |
| **7. Shell offline incompleta** | **Parziale.** Installazione completa e rimozione della cache parziale corrette; una navigazione può però corrompere la shell precedente: rilievo 6. |
| **8. Catena delle altezze** | **Risolto nel piano.** Aggiunto `#root { height: 100%; }` (P, 272); prevista verifica nel browser. |
| **9. Errori e famiglia assente** | **Risolto per i casi segnalati.** `FamilyGate`, «Riprova», assenza di famiglia e azioni dell’account indipendenti dal profilo (P, 3685–3718, 6042–6087). |
| **10. Lingua del precedente utente** | **Corretto l’isolamento delle preferenze.** Rimane un diverso problema di visualizzazione attraverso `keepPreviousData`: rilievo 7. |
| **11. Contesto del pasto** | **Risolto.** `slotId` presente nell’input, nella chiave e nel collegamento dal Menu (P, 1069, 1941–1942, 5374, 5827). |
| **12. Fonte da libro** | **Risolto.** Il dettaglio rende la fonte tramite `sourceLine` (P, 5859–5879). |
| **13. Focus del calendario** | **Risolto per i percorsi segnalati.** Chiusura comune, riferimento al controllo di apertura e focus iniziale una volta per apertura (P, 5147–5152, 5205–5207, 5278–5286). |
| **14. Voto offline nel client finto** | **Risolto.** Controllo della connettività nel trasporto e test senza invio alla riconnessione (P, 1785–1794, 4347–4356). |

## Rilievi

### 1. Bloccante — All’avvio viene cancellata anche la copia dell’utente che sta rientrando

**Riferimenti:** P, righe 2634–2643, 3174–3193, 2242–2246, 3894–3912; S, righe 346 e 390–393.

`AuthProvider` parte da `loading`. `SessionScope` è già montato e traduce questo stato in `userId = null`, come se fosse un’uscita confermata. Il suo effetto chiama quindi:

```ts
purgeOtherCopies(store, null)
```

Questa funzione cancella **tutte** le copie persistite. Il controllo `loading` di `AppRouter` arriva troppo in basso nell’albero per impedirlo.

Con una verifica della sessione lenta, la copia dell’utente viene eliminata prima che `backend.check()` restituisca l’identità. Offline, proprio quando il rinnovo può richiedere tempo, non rimane nulla da ripristinare. Se la verifica è veloce, cancellazione e ripristino possono concorrere.

**Prova:** copia valida di A presente → pulizia prevista durante `loading` → copia di A assente.

**Correzione proposta:** distinguere `loading` da `signedOut`. Non effettuare pulizie distruttive finché l’identità non è determinata; ordinare pulizia delle altre identità e ripristino della copia corrente.

**Test necessario:** avvio con copia valida e `backend.check()` sospeso; completamento come A verificato e come A non verificabile offline. La copia di A deve sopravvivere ed essere mostrata senza rete.

### 2. Importante — Due `unauthorized` concorrenti fanno uscire anche con rinnovo riuscito

**Riferimenti:** P, righe 3205–3223; S, righe 380–383; W1, righe 399–401.

Nel recupero:

```ts
if (recovering) return void signOut();
```

Una seconda query che riceve `unauthorized` mentre il rinnovo della prima è pendente provoca immediatamente l’uscita. Non dimostra che il server abbia rifiutato una richiesta **successiva al rinnovo**: può essere un’altra richiesta partita con lo stesso token precedente.

Menu, profilo e altre viste possono avere letture concorrenti. Il comportamento viola la sequenza concordata «un rinnovo, nuova lettura, poi eventuale chiusura».

**Prova:** due chiamate al recupero prima di risolvere `refresh()` → `signOut()` chiamato, anche risolvendo poi il rinnovo con successo.

**Correzione proposta:** condividere il rinnovo in corso tra le richieste della stessa sessione e distinguere il primo rifiuto dal rifiuto dopo il tentativo di recupero. Non usare il solo booleano `recovering` per decidere l’uscita.

**Test necessari:** due o più 401 concorrenti, un solo rinnovo riuscito e sessione conservata; successivo rifiuto dopo il rinnovo e chiusura unica.

### 3. Importante — Il recupero della vecchia sessione può chiudere il nuovo utente

**Riferimenti:** P, righe 3195–3203 e 3207–3214; controlli analogamente privi di generazione alle righe 2653–2668.

Dopo `await backend.refresh()`, il recupero esegue `signOut()` anche quando `session.isClosed()` è vero.

Sequenza:

1. A riceve `unauthorized` e avvia un rinnovo.
2. L’identità cambia da A a B; la sessione applicativa di A viene chiusa.
3. Il rinnovo di A termina.
4. Il controllo trova A chiuso e chiama il vecchio `signOut`.
5. Quel callback invoca `backend.signOut()` sul backend condiviso e `markSignedOut()`, chiudendo B.

**Prova:** nell’estratto, il completamento del recupero di A dopo il passaggio a B produce un’uscita riferita all’identità corrente B.

Anche le risposte di `backend.check()` vengono applicate senza verificare che nel frattempo non sia arrivato un evento d’identità più recente. Il flag `active` protegge soltanto dallo smontaggio dell’effetto.

**Correzione proposta:** associare controlli e recuperi a una generazione della sessione. Dopo ogni attesa, una generazione superata deve terminare senza effetti sul backend corrente. Una sessione già chiusa richiede lo scarto del risultato, non un’altra uscita.

**Test necessari:** rinnovo A pendente → ingresso B → completamento del rinnovo A, sia riuscito sia fallito; B deve restare attivo. Aggiungere controllo iniziale pendente seguito da `SIGNED_OUT` o cambio d’identità.

### 4. Importante — Un’altra scheda può riscrivere i dati della famiglia revocata

**Riferimenti:** P, righe 2209–2237, 2837–2868 e 3219–3221; S, righe 384–387 e 478–479.

La coda delle scritture appartiene alla singola istanza del persister. Due schede dello stesso utente scrivono invece sulla stessa chiave `query-cache:<userId>`.

La revoca:

- rimuove le query soltanto dal `QueryClient` della scheda corrente;
- registra la famiglia in un `Set` locale;
- non comunica la revoca alle altre schede e non registra un vincolo condiviso sulla persistenza.

Dopo il 403 nella scheda A, la scheda B può salvare una fotografia della propria cache contenente ancora quella famiglia, per esempio in seguito all’aggiornamento di un’altra query. La copia eliminata ricompare su disco.

**Prova con due persister sullo stesso negozio:** dopo il salvataggio ripulito della prima istanza la famiglia è assente; dopo il salvataggio della seconda è nuovamente presente.

Il difetto resta anche dopo aver corretto la cancellazione indiscriminata del rilievo 1, che al momento può mascherarlo alla riapertura.

**Correzione proposta:** coordinare revoca e scritture tra le schede che condividono la persistenza. Una revoca deve impedire a istanze precedenti di ripristinare quell’ambito; il solo ordinamento locale delle Promise non basta.

**Test necessario:** due sessioni applicative dello stesso utente sullo stesso archivio; 403 in una, scrittura tardiva nell’altra, successiva riapertura offline. I dati revocati devono restare assenti.

### 5. Importante — Una lettura pendente può annullare il voto appena confermato

**Riferimenti:** P, righe 1919–1926 e 4420–4445.

`applyRating` aggiorna settimane e dettagli senza annullare o rendere obsolete le loro letture pendenti. `readThrough` conserva inoltre la fotografia della cache presa **prima** dell’attesa e la restituisce nel ramo `unchanged`.

Sequenza riprodotta:

1. Cache con versione V1 e voto 4.
2. Parte una verifica; il server determina `unchanged` per V1.
3. Un voto successivo viene salvato e la risposta aggiorna la cache a 5.
4. Arriva la risposta della vecchia verifica.
5. `readThrough` restituisce la fotografia con voto 4, che può sovrascrivere il 5.

Anche una risposta completa precedente alla mutazione può produrre lo stesso effetto. Il valore superato può poi essere persistito e restare visibile offline fino a una nuova verifica.

**Correzione proposta:** coordinare le letture interessate con l’applicazione della mutazione confermata, annullando le letture superate prima del patch oppure usando una generazione che ne impedisca l’applicazione. Non occorre reintrodurre aggiornamenti ottimistici. La cancellazione delle query è il meccanismo previsto da TanStack per impedire che risposte pendenti sovrascrivano aggiornamenti locali. [Documentazione TanStack Query](https://github.com/tanstack/query/blob/main/docs/framework/solid/guides/optimistic-updates.md)

**Test necessari:** lettura pendente → voto confermato → risposta vecchia, nei rami completo e `unchanged`; verificare cache, persistenza e riapertura offline.

### 6. Importante — La navigazione può sostituire la shell valida con HTML senza bundle disponibili

**Riferimenti:** P, righe 6361–6386 e 6393–6399; test alle righe 6255–6292; S, righe 402–409.

L’installazione completa corregge il difetto precedente, ma ogni navigazione riuscita sovrascrive `/index.html` nella cache del worker attivo:

```ts
if (response.ok) await cache.put(SHELL_URL, response.clone());
```

Il worker A può ricevere dalla rete l’HTML della nuova build B e salvarlo nella propria cache, prima che B sia installata completamente.

Sequenza riprodotta:

1. A installata con HTML A e bundle A.
2. Deploy B; una navigazione sotto il worker A salva HTML B nella cache A.
3. Il download del bundle B fallisce; l’installazione B viene correttamente annullata.
4. Riapertura offline: rimane la cache A, ma contiene HTML B e non il bundle B.

La conservazione della vecchia cache non garantisce quindi una versione avviabile. Il test di installazione interrotta mantiene una rete A separata e non simula la navigazione del vecchio worker contro il nuovo deploy.

**Correzione proposta:** mantenere immutabile la shell completa della versione attiva oppure sostituirla soltanto come insieme verificato di HTML e dipendenze. La navigazione può restare dalla rete, senza aggiornare separatamente l’HTML usato come ripiego offline.

**Test necessario:** worker A attivo → rete aggiornata a B → navigazione online → installazione B interrotta → riapertura offline. Il ripiego deve contenere una shell con tutti i propri bundle.

### 7. Importante — `keepPreviousData` aggira l’isolamento per lingua e contesto della ricetta

**Riferimenti:** P, righe 5621 e 5827; S, righe 241–243.

Ricettario e dettaglio usano indiscriminatamente:

```ts
placeholderData: keepPreviousData
```

Questa opzione conserva i dati della query precedente anche quando cambia la chiave. Aggiungere la lingua alla chiave non impedisce quindi di mostrare temporaneamente contenuti nella lingua precedente. Il test linguistico usa una query priva di `keepPreviousData` e non copre le schermate effettive. [Documentazione TanStack Query](https://github.com/tanstack/query/blob/main/docs/framework/react/guides/placeholder-query-data.md)

Nel dettaglio, la stessa conservazione vale anche cambiando `recipeId` o `slotId`: può restare visibile la ricetta o la versione del pasto precedente mentre l’indirizzo identifica già il nuovo contesto.

**Correzione proposta:** riusare i dati precedenti soltanto per transizioni compatibili, confrontando lingua, famiglia e identità della ricetta/pasto. Negli altri casi mostrare il caricamento o la copia della nuova chiave.

**Test necessari:** cambio lingua sulle schermate reali con risposta ritardata; passaggio fra due ricette e fra due slot. Nessun dato del contesto precedente deve essere presentato come quello corrente.

### 8. Minore — Il Profilo mostra ancora dati della query dopo un errore bloccante

**Riferimenti:** P, righe 6044–6054; S, riga 388.

`meBlocked` viene calcolato, ma nome ed email nell’intestazione continuano a leggere `me.data`. Dopo una rilettura fallita con un errore diverso da `network`, il Profilo mostra quindi i dati conservati accanto all’errore, contrariamente alla regola esplicita della specifica.

**Correzione proposta:** usare i dati del profilo soltanto quando non sono bloccati; altrimenti mostrare l’email della sessione, mantenendo lingua ed «Esci» disponibili.

**Test necessario:** profilo inizialmente caricato → rilettura con errore non di rete → dati della query nascosti e azioni dell’account disponibili.

### 9. Minore — Rimane una versione numerica che impedisce il controllo dei tipi

**Riferimenti:** P, riga 5063, in contrasto con righe 1052–1062; W1, righe 310–312.

Il test «says when the family has no menu yet» assegna a `api.menu.getOpening` una funzione che restituisce `version: 1`. Il metodo richiede una stringa.

**Perché conta:** il controllo TypeScript previsto dal piano comprende i test e fallirebbe su questa assegnazione. Il rilievo precedente sulle versioni non è chiuso completamente.

**Correzione proposta:** usare una versione stringa opaca anche in questa fixture e verificare l’assenza di altre fixture numeriche.

## Punti da decidere con il coordinatore

Non occorre riaprire le decisioni di prodotto già prese: uscita locale, consultazione offline, assenza di aggiornamenti ottimistici, lingua per utente e client oRPC in una seconda PR restano riferimenti validi.

Restano da fissare nel piano corretto:

1. **Coordinamento della sessione:** un solo recupero per generazione, scarto dei completamenti precedenti e distinzione tra identità sconosciuta e uscita confermata.
2. **Revoca tra schede:** meccanismo condiviso che impedisca la riscrittura delle copie revocate.
3. **Aggiornamento della shell:** conservazione della shell installata oppure sostituzione atomica dell’intero insieme; la riscrittura indipendente dell’HTML non soddisfa la garanzia concordata.

Queste sono scelte tecniche per realizzare requisiti già approvati. Non richiedono un ampliamento del perimetro di W5.