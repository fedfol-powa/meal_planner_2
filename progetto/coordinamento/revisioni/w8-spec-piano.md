# Revisione W8 — Aggiornamento della PWA installata

Spec e piano richiedono correzioni prima dell’implementazione. I problemi principali riguardano ricaricamenti non sicuri, rollback, recupero dalla rete interrotta e test che non verificano completamente le garanzie dichiarate.

Revisione del branch `traguardo/aggiornamento-pwa`, commit `6abce8e1624407ac3daf370ab0784914f3c8463d`. Letti brief del revisore, brief W8, [issue #42](https://github.com/fedfol-powa/meal_planner_2/issues/42), specifica principale nelle sezioni pertinenti, piano generale nel checkout principale e codice attuale. Nessun file modificato.

## Rilievi bloccanti

### 1. Il confronto delle versioni non impedisce il ciclo di ricaricamenti durante un rollback

**Riferimenti:** [spec:124](/Users/fedfol/Projects/meal_planner_2/.worktrees/pwa/progetto/superpowers/specs/2026-10-13-aggiornamento-pwa.md:124), [piano:710](/Users/fedfol/Projects/meal_planner_2/.worktrees/pwa/progetto/superpowers/plans/2026-10-13-aggiornamento-pwa.md:710), [piano:915](/Users/fedfol/Projects/meal_planner_2/.worktrees/pwa/progetto/superpowers/plans/2026-10-13-aggiornamento-pwa.md:915).

Il piano considera la pagina B sotto il worker A, ma manca il caso inverso:

1. B è il worker attivo.
2. Il server torna ad A.
3. Una navigazione riceve l’HTML A dalla rete.
4. La pagina A interroga B: `workerVersion > pageVersion`, quindi ricarica.
5. La rete restituisce ancora A.

Finché A non completa l’installazione, il ciclo si ripete. Se un asset del precache fallisce, può continuare indefinitamente. `register()` non è una barriera che garantisce l’attivazione del nuovo worker: gli algoritmi distinguono risoluzione della registrazione, installazione e attivazione. [Specifica Service Workers](https://www.w3.org/TR/service-workers/#install-algorithm).

**Verifica:** eseguendo in memoria il codice proposto, tre avvii della pagina A sotto B producono tre ricaricamenti. Non esiste un limite persistente per questo percorso.

**Correzione proposta:** non usare il solo ordinamento dei timestamp come prova che il ricaricamento porterà alla versione desiderata. Definire il comportamento quando HTML servito e worker attivo divergono, con protezione dai tentativi ripetuti fra documenti. Scrivere prima un test di rollback con installazione trattenuta e poi fallita, verificando che l’app rimanga utilizzabile.

### 2. Dopo l’attesa della versione, la pagina può ricaricarsi già nascosta o dopo un’interazione

**Riferimenti:** [piano:691](/Users/fedfol/Projects/meal_planner_2/.worktrees/pwa/progetto/superpowers/plans/2026-10-13-aggiornamento-pwa.md:691), [piano:911](/Users/fedfol/Projects/meal_planner_2/.worktrees/pwa/progetto/superpowers/plans/2026-10-13-aggiornamento-pwa.md:911).

La visibilità viene controllata **prima** di `await askVersion()`, ma non dopo. Inoltre `shouldReload()` ignora `interacted` per `start` e `visible`, anche se l’interazione è avvenuta durante quell’attesa.

Ne conseguono due violazioni:

- ritorno visibile → richiesta della versione → tocco → risposta → ricaricamento;
- ritorno visibile → richiesta della versione → app nuovamente nascosta → risposta → ricaricamento in background.

Il test alla riga 691 codifica espressamente il primo comportamento sbagliato. Anche `check('start')`, eseguito dopo la registrazione asincrona, azzera interazioni già avvenute.

**Verifica:** il codice proposto ha ricaricato in entrambi gli scenari; nel secondo `visibilityState` era già `hidden`.

**Correzione proposta:** invalidare i controlli superati da una nuova transizione di visibilità o da un cambio di controller. Subito prima del ricaricamento ricontrollare visibilità, interazioni e occupazione. L’interazione deve impedire il passaggio per tutti i trigger. Aggiungere test con risposte del worker deliberatamente ritardate e controlli concorrenti.

### 3. Il registro di pagina occupata non copre tutte le scritture attuali

**Riferimenti:** [spec:156](/Users/fedfol/Projects/meal_planner_2/.worktrees/pwa/progetto/superpowers/specs/2026-10-13-aggiornamento-pwa.md:156), [piano:1355](/Users/fedfol/Projects/meal_planner_2/.worktrees/pwa/progetto/superpowers/plans/2026-10-13-aggiornamento-pwa.md:1355), [piano:1380](/Users/fedfol/Projects/meal_planner_2/.worktrees/pwa/progetto/superpowers/plans/2026-10-13-aggiornamento-pwa.md:1380).

`queryClient.isMutating()` non rappresenta tutte le operazioni in corso:

- Il cambio della password chiama direttamente `backend.changePassword()` e usa uno stato React locale: [PasswordPage.tsx:43](/Users/fedfol/Projects/meal_planner_2/.worktrees/pwa/web/src/routes/profile/PasswordPage.tsx:43). Durante l’invio disabilita i campi; non c’è un dialogo aperto né necessariamente un campo focalizzato.
- Il cambio della lingua usa direttamente `runAreaMutation()`, senza creare una mutazione TanStack: [SessionScope.tsx:156](/Users/fedfol/Projects/meal_planner_2/.worktrees/pwa/web/src/session/SessionScope.tsx:156).
- L’uscita imposta subito `signedOut`, poi attende pulizia e `backend.signOut()`: [AuthProvider.tsx:80](/Users/fedfol/Projects/meal_planner_2/.worktrees/pwa/web/src/auth/AuthProvider.tsx:80). Il piano considera libera proprio questa fase, perché non c’è più una persona collegata.
- Nella spesa, `queue.record().ops` cambia dopo la transazione IndexedDB: [queue.ts:99](/Users/fedfol/Projects/meal_planner_2/.worktrees/pwa/web/src/features/shopping/queue/queue.ts:99). Durante il primo accodamento può essere ancora vuoto, benché il salvataggio sia iniziato.

Un ritorno in primo piano in queste finestre può interrompere una scrittura o la chiusura della sessione. Correggere il rilievo 2 non basta: l’operazione può essere iniziata prima della sospensione.

**Correzione proposta:** registrare anche operazioni di autenticazione, scritture fuori da TanStack e accodamenti locali non ancora conclusi. Il blocco deve durare fino al completamento effettivo. Aggiungere test con password, lingua, logout e transazione IndexedDB trattenuti.

### 4. Il timeout delle navigazioni non copre il corpo delle risposte senza redirect

**Riferimenti:** [piano:378](/Users/fedfol/Projects/meal_planner_2/.worktrees/pwa/progetto/superpowers/plans/2026-10-13-aggiornamento-pwa.md:378), [piano:238](/Users/fedfol/Projects/meal_planner_2/.worktrees/pwa/progetto/superpowers/plans/2026-10-13-aggiornamento-pwa.md:238), [sw-core.ts:25](/Users/fedfol/Projects/meal_planner_2/.worktrees/pwa/web/src/pwa/sw-core.ts:25).

`fromNetwork()` attende `withoutRedirect(response)`. Quest’ultima legge il corpo soltanto se `response.redirected` è vero; altrimenti restituisce immediatamente la risposta e il timer viene cancellato.

Una risposta `200` senza redirect, con header arrivati e corpo fermo, supera quindi il timeout senza attivare il ripiego. Se non arriva nemmeno l’HTML della guardia, manca anche il recupero applicativo.

**Verifica:** con timeout di 10 ms e corpo senza fine, la funzione ha restituito la risposta di rete; dopo il timeout il segnale non era abortito e la lettura del corpo restava pendente.

Il test proposto forza `redirected = true`, quindi non rileva il problema.

**Correzione proposta:** mantenere il timeout fino alla lettura completa dell’HTML anche senza redirect. Scrivere prima entrambi i test, includendo un corpo che si interrompe dopo gli header.

## Rilievi importanti

### 5. La guardia non garantisce recupero né assenza di cicli su rete lenta

**Riferimenti:** [spec:117](/Users/fedfol/Projects/meal_planner_2/.worktrees/pwa/progetto/superpowers/specs/2026-10-13-aggiornamento-pwa.md:117), [spec:177](/Users/fedfol/Projects/meal_planner_2/.worktrees/pwa/progetto/superpowers/specs/2026-10-13-aggiornamento-pwa.md:177), [piano:1130](/Users/fedfol/Projects/meal_planner_2/.worktrees/pwa/progetto/superpowers/plans/2026-10-13-aggiornamento-pwa.md:1130).

Il recupero presenta tre lacune:

- Ascolta soltanto `error`: un bundle rimasto in caricamento non produce necessariamente un errore entro un tempo utile.
- `use-shell` imposta un segno globale in memoria, senza conferma e senza associazione alla pagina. Un’altra navigazione può consumarlo; la terminazione del worker lo perde.
- I 30 secondi limitano la **frequenza**, non il numero dei tentativi. Se ogni errore arriva dopo 31 secondi e il recupero non riesce, ogni documento ricarica nuovamente.

**Verifica:** tre documenti consecutivi, ciascuno con errore dopo 31 secondi, hanno prodotto tre messaggi e tre ricaricamenti.

La memoria globale del worker non è persistente; WebKit documenta terminazione e riavvio dei worker. Questo è particolarmente rilevante per sospensione e ripresa dell’app. [WebKit, Workers at Your Service](https://webkit.org/blog/8090/workers-at-your-service/).

**Correzione proposta:** legare il recupero alla navigazione che lo richiede, evitando il segno globale consumabile da altre schede; limitare i tentativi fino a un avvio riuscito o a «Riprova» esplicito. Prevedere anche il caricamento del bundle che non termina. Testare riavvio del worker, due schede, errori oltre 30 secondi e asset pendente.

### 6. Il plugin inserisce la guardia dopo il bundle

**Riferimenti:** [piano:1172](/Users/fedfol/Projects/meal_planner_2/.worktrees/pwa/progetto/superpowers/plans/2026-10-13-aggiornamento-pwa.md:1172), [piano:1187](/Users/fedfol/Projects/meal_planner_2/.worktrees/pwa/progetto/superpowers/plans/2026-10-13-aggiornamento-pwa.md:1187).

Il plugin usa `injectTo: 'head'`, che nel risultato verificato aggiunge lo script dopo gli elementi già generati da Vite.

**Verifica:** una build esclusivamente in memoria ha prodotto:

```html
<script type="module" crossorigin src="/assets/main-….js"></script>
<script>/* shell-guard-at */</script>
```

Non rispetta il requisito «prima del bundle». Per i fogli di stile precedenti, inoltre, un caricamento bloccato può ritardare l’esecuzione dello script classico della guardia.

**Correzione proposta:** usare un inserimento anticipato, verificando il risultato finale rispetto a script, stylesheet e preload. Vite distingue esplicitamente `head` e `head-prepend`. [Documentazione Vite](https://vite.dev/guide/api-plugin.html#transformindexhtml).

La verifica deve essere automatica e fallire anche se guardia o bundle non vengono trovati.

### 7. La cancellazione delle cache contraddice la convivenza prevista

**Riferimenti:** [spec:103](/Users/fedfol/Projects/meal_planner_2/.worktrees/pwa/progetto/superpowers/specs/2026-10-13-aggiornamento-pwa.md:103), [piano:129](/Users/fedfol/Projects/meal_planner_2/.worktrees/pwa/progetto/superpowers/plans/2026-10-13-aggiornamento-pwa.md:129).

La “precedente” è scelta ordinando i timestamp, senza sapere quali versioni delle pagine siano ancora aperte.

Due casi non sono coperti:

- Durante B → A, si cancella B proprio mentre la specifica prevede che la pagina B rimanga aperta.
- Una pagina A occupata può rimandare il passaggio durante B e restare aperta anche all’arrivo di C. C conserva B e cancella A.

Non è quindi garantita la disponibilità degli asset delle pagine che il meccanismo lascia intenzionalmente in esecuzione. Il bundle unico già caricato riduce il rischio attuale, ma non dimostra la garanzia dichiarata per gli asset.

**Correzione proposta:** definire una politica di conservazione coerente con le pagine ancora ammesse in esecuzione. Non equiparare “timestamp immediatamente precedente” a “versione ancora necessaria”. Testare rollback e tre versioni consecutive con una pagina rimasta occupata.

### 8. I test proposti non provano tutte le garanzie e la procedura browser contiene un selettore errato

**Riferimenti:** [piano:1214](/Users/fedfol/Projects/meal_planner_2/.worktrees/pwa/progetto/superpowers/plans/2026-10-13-aggiornamento-pwa.md:1214), [piano:1302](/Users/fedfol/Projects/meal_planner_2/.worktrees/pwa/progetto/superpowers/plans/2026-10-13-aggiornamento-pwa.md:1302), [piano:1431](/Users/fedfol/Projects/meal_planner_2/.worktrees/pwa/progetto/superpowers/plans/2026-10-13-aggiornamento-pwa.md:1431).

Problemi verificati:

- **Identificazione della build:** viene cercato `/assets/index-`, mentre Vite emette `/assets/main-…js`. Il selettore restituisce `null`; anche il controllo della guardia usa il nome errato.
- **Registrazione della coda:** si testa soltanto `queueBusy()` con un oggetto finto. Eliminando `useBusyCheck()` dal provider, quel test continua a passare.
- **Persistenza tra build:** il test del persister salva e ripristina con la stessa costante. Da solo non dimostra che il percorso reale di `SessionScope` conservi una lista dopo il cambio di build.
- **Sessione nel browser:** il backend finto restituisce sempre l’utente dimostrativo, senza ripristinare credenziali: [backend.ts:84](/Users/fedfol/Projects/meal_planner_2/.worktrees/pwa/web/src/auth/backend.ts:84). Vederlo ancora collegato non prova la conservazione della sessione Supabase.
- **Casi critici:** mancano nella prova browser rollback, errore reale del bundle, ripresa dopo recupero e coda persistita non vuota. I test con eventi sintetici non verificano sospensione e ripresa reali di iOS.

**Correzione proposta:** mantenere l’ordine test-prima, ma aggiungere verifiche osservabili:

- montare i provider reali e controllare il blocco del ricaricamento;
- salvare una lista riconoscibile, cambiare build sul Menu e riaprirla offline senza una nuova lettura;
- verificare contenuto e identificativi della coda prima e dopo il passaggio;
- controllare una sessione persistita con backend adeguato, oppure delimitare esplicitamente questa prova al collaudo reale;
- esercitare nel browser i percorsi di errore dei rilievi precedenti.

Per i test fondamentali verificare che togliere il relativo collegamento o ripristinare il comportamento difettoso li faccia fallire.

## Rilievi minori

### 9. La conversione dei buster precedenti va fissata allo schema `1`

**Riferimenti:** [spec:206](/Users/fedfol/Projects/meal_planner_2/.worktrees/pwa/progetto/superpowers/specs/2026-10-13-aggiornamento-pwa.md:206), [piano:1263](/Users/fedfol/Projects/meal_planner_2/.worktrees/pwa/progetto/superpowers/plans/2026-10-13-aggiornamento-pwa.md:1263).

La spec dice correttamente che le copie precedenti appartengono allo schema `1`, ma il codice le riscrive con il valore **corrente** di `CACHE_SCHEMA`.

Quando la costante diventerà `2`, una vecchia copia con data ISO verrà dichiarata compatibile con `2` senza migrazione.

**Correzione proposta:** convertire il formato precedente in `'1'`, indipendentemente dallo schema corrente. Aggiungere il caso «buster ISO, schema richiesto `2` → copia respinta».

La scelta di separare schema persistito e versione della build è corretta. Va però esplicitata anche la compatibilità delle chiavi e delle strutture lette dal client: la compatibilità delle richieste API, da sola, non la dimostra. TanStack usa il `buster` per accettare o scartare la copia, non per migrarla. [Documentazione TanStack Query](https://tanstack.com/query/latest/docs/framework/react/plugins/persistQueryClient).

## Ciclo di vita e Safari/WebKit

Sono corrette le scelte di chiamare `skipWaiting()` dopo il precache completo, mantenere l’installazione dentro `waitUntil()` e non usare `clients.claim()` per la prima visita. L’attivazione sostituisce il controller dei client già controllati e notifica `controllerchange`. `updateViaCache: 'none'` riguarda gli script del worker, non rende automaticamente fresche le navigazioni HTML. [Specifica Service Workers](https://www.w3.org/TR/service-workers/).

Il primo passaggio A₀ → B è impostato sensatamente: A₀ non contiene il nuovo coordinamento, quindi evitare una navigazione forzata dal worker protegge le operazioni in corso. Le due aperture e l’attesa di 15–20 secondi vanno presentate come procedura operativa da verificare, non come limite temporale garantito.

Per iOS è appropriato controllare al ritorno visibile, ma un evento sintetico non riproduce la sospensione dell’app. WebKit ha documentato problemi specifici delle PWA installate durante sospensione e ripresa; il rapporto consultato è storico e risolto, quindi non dimostra un difetto delle versioni attuali. Conferma la necessità del collaudo sull’iPhone previsto dal brief. [WebKit bug 211018](https://bugs.webkit.org/show_bug.cgi?id=211018).

## Semplicità e decisioni da consolidare

La parte più complessa rispetto alla garanzia ottenuta è il recupero basato su messaggio, segno globale di 10 secondi e finestra di 30 secondi. Conviene rendere esplicita la singola navigazione di recupero e il suo esito, riducendo stato volatile e dipendenze temporali.

Al coordinatore spettano due chiarimenti:

- **Rollback:** confermare se la pagina nuova può restare aperta fino alla riapertura a freddo, mantenendo però asset e compatibilità necessari; il requisito “versione pubblicata” deve riportare questa eccezione.
- **Cambio incompatibile della copia:** definire migrazione o scarto e la relativa eccezione alla conservazione offline. Cambiare `CACHE_SCHEMA` non sostituisce il periodo di compatibilità delle API richiesto dalla specifica principale.

## Verifiche eseguite e limiti

Ho eseguito prove in memoria sugli estratti del piano per interazioni durante l’attesa, pagina nascosta, ricaricamenti ripetuti, corpo HTML bloccato e tentativi della guardia oltre 30 secondi.

Ho verificato ordine degli script e nome del bundle con Vite senza scrivere output. Per questa verifica mirata ho escluso il plugin del precache, perché i font generati dal `prebuild` non erano presenti; non è una build completa validata.

Non ho eseguito il collaudo browser A₀ → B → C né quello iPhone: il codice proposto non è ancora implementato. Nessuna suite completa dichiarata superata. Worktree invariato al termine.

**Verdetto: DA CORREGGERE.**