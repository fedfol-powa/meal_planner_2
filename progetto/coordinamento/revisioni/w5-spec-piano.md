# Revisione W5 — App web di base

**Verdetto: DA RIFARE nelle parti relative a sessione, cache, mutazioni e PWA, prima dell’implementazione.**

Il perimetro e lo stack rispettano il coordinamento. La ripresa del linguaggio visivo e delle schermate è complessivamente coerente, ma il piano contiene difetti concreti di sicurezza, integrità della cache e funzionamento offline. Non è sufficiente correggerli durante l’esecuzione: il codice proposto costituisce il modello per l’ondata 2.

## Perimetro e verifiche

Revisione sul branch `fondamenta/web`, commit `94c6472`, in sola lettura.

Riferimenti abbreviati usati nei rilievi:

- **P**: [piano W5](../superpowers/plans/2026-10-11-app-web-di-base.md).
- **S**: [specifica W5](../superpowers/specs/2026-10-11-app-web-di-base.md).
- **W1**: `/Users/fedfol/Projects/meal_planner_2/.worktrees/piattaforma/progetto/superpowers/specs/2026-10-11-piattaforma.md`.

Consultati il mandato del revisore, il brief W5, `AGENTS.md`, il piano generale aggiornato nel checkout principale, le sezioni pertinenti della specifica principale, `spike/REPORT.md`, guida, HTML e screenshot approvati, percorsi e componenti del prototipo.

La documentazione di TanStack Query e Supabase è stata verificata tramite Context7. Sono stati eseguiti estratti del codice del piano con Node, senza scrivere file nel worktree, usando sostituti in memoria per servizi e cache. Le prove confermano i problemi indicati nei rilievi 1, 4, 5 e 7; non costituiscono una prova dell’app completa.

Non sono stati eseguiti test, typecheck o build di W5: l’implementazione non è presente nel worktree. Lo scheletro `web/package.json` su `main` è stato verificato; il rebase previsto dal piano è necessario e non è un difetto.

## Rilievi

### 1. Bloccante — L’uscita può terminare senza aver chiuso la sessione

**Riferimenti:** P, righe 2274–2276, 2335–2347, 2403–2407; S, righe 292–293 e 310–311.

`supabaseBackend.signOut()` ignora l’oggetto `{ error }` restituito da Supabase. `SessionScope` cancella la cache e attende questa funzione, ma non gestisce il fallimento né chiude autonomamente l’accesso locale. Se Supabase restituisce un errore di trasporto mantenendo la sessione, l’operazione risulta completata mentre l’utente resta autenticato.

La prova sull’estratto del piano conferma che `signOut()` si risolve normalmente e il successivo `getUser()` restituisce ancora A.

Inoltre la cancellazione persistita avviene soltanto passando dal pulsante locale: un evento di uscita ricevuto da un’altra scheda o un cambio d’identità crea un nuovo `QueryClient`, senza eliminare la copia precedente.

**Perché conta:** su un dispositivo condiviso, il comando «Esci» deve avere un esito verificabile. La separazione delle chiavi per utente non sostituisce la chiusura della sessione e la cancellazione promessa.

**Correzione proposta:** definire una transizione centralizzata di chiusura della sessione, gestire esplicitamente gli errori Supabase e applicare la pulizia anche agli eventi esterni. Impedire che richieste o salvataggi ancora pendenti ripopolino la copia cancellata.

**Test necessari:** uscita con errore di rete; evento `SIGNED_OUT` esterno; cambio A→B; richiesta e scrittura persistita pendenti durante l’uscita; riapertura dopo ciascuno scenario. Supabase documenta sia il risultato con `error` sia gli ambiti dell’uscita. [Documentazione Supabase](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/auth/signout.mdx)

### 2. Bloccante — Il rifiuto dell’accesso non invalida i dati già conservati

**Riferimenti:** P, righe 2063–2075, 2388–2418, 4484–4503 e 4848–4856; W1, righe 399–401.

Il piano tratta `unauthorized` e `forbidden` come messaggi da visualizzare, senza un percorso centrale che invalidi sessione o dati non più autorizzati. W1 richiede invece rinnovo della sessione o ritorno al login su `unauthorized`.

Nel Ricettario, errore e dati sono renderizzati indipendentemente: una rilettura rifiutata può mostrare l’avviso e continuare a mostrare le ricette con i voti familiari già in cache. Nel Profilo basta che `me.data` esista per continuare a renderizzarlo, anche dopo un errore.

**Perché conta:** dopo una revoca confermata dal server, l’app non deve continuare a trattare la copia locale come autorizzata.

**Correzione proposta:** distinguere errore di rete da rifiuto dell’accesso. Su `unauthorized`, applicare la procedura concordata con W1; su `forbidden`, rimuovere dalla memoria e dalla persistenza le viste dell’ambito revocato e interromperne il rendering.

**Test necessari:** cache già popolata, poi risposta 401 o 403 con lo stesso utente; verificare scomparsa dei contenuti protetti e mancata ricomparsa dopo ricarica.

### 3. Importante — Il tipo delle versioni è incompatibile con W1

**Riferimenti:** P, righe 1078–1080, 1747–1748 e 1808–1824; W1, righe 246–247 e 309–332.

W5 definisce `version` e `knownVersion` come `number`. W1 richiede stringhe e rifiuta espressamente i numeri. La versione combina famiglia, contatori, lingua e deploy: non è un contatore numerico da convertire.

**Perché conta:** il client reale non potrà sostituire quello finto mantenendo l’interfaccia proposta.

**Correzione proposta:** usare una versione opaca di tipo `string` in tipi, client finto, cache e test, preferendo il tipo condiviso del contratto quando disponibile.

**Test necessario:** attraversamento completo query→client→risposta con una versione composta realistica, anche nel ramo `unchanged`.

### 4. Importante — La persistenza può rendere definitivo un voto mai salvato

**Riferimenti:** P, righe 1817–1820, 2084–2087, 3373–3382 e 3392–3401; S, righe 273–299.

L’aggiornamento ottimistico modifica una query riuscita mantenendone la versione precedente. Il persister salva tutte le query riuscite: escludere le mutazioni non esclude i loro effetti ottimistici sulle query.

Scenario:

1. la cache contiene versione V e voto 4;
2. `onMutate` porta il voto a 1, mantenendo V;
3. la copia viene salvata e l’app si chiude prima della conferma;
4. il server non ha applicato il voto e risponde `unchanged` per V;
5. `readThrough` conserva il voto 1.

La sequenza è stata riprodotta sugli estratti del piano.

**Perché conta:** la verifica della versione non ripara più la copia locale; può confermare dati che il server non ha mai avuto.

**Correzione proposta:** separare dati confermati e modifiche ottimistiche, oppure rendere le viste modificate non eleggibili a una verifica `unchanged` finché non riconciliate. Definire esplicitamente cosa viene persistito durante una mutazione.

**Test necessario:** salvataggio e riavvio durante una mutazione non confermata, seguito da `unchanged`.

La sottoscrizione di persistenza reagisce agli aggiornamenti della cache, non soltanto alle risposte del server. [Documentazione TanStack Query](https://github.com/tanstack/query/blob/main/docs/framework/react/plugins/persistQueryClient.md)

### 5. Importante — Il rollback di un voto annulla modifiche indipendenti

**Riferimenti:** P, righe 3392–3401 e 3426–3450.

Ogni mutazione fotografa tutte le settimane, ricerche e schede in cache; in caso d’errore ripristina integralmente quelle viste. I controlli permettono altre mutazioni durante l’attesa.

Scenario riprodotto: voto su R1 pendente; voto su R2 completato con successo; fallimento di R1. Il rollback riporta anche R2 al valore precedente, cancellando dall’interfaccia il risultato già confermato.

Anche risposte fuori ordine sulla stessa ricetta possono applicare uno stato superato.

**Correzione proposta:** ripristino limitato alla modifica interessata e gestione esplicita delle mutazioni concorrenti sulla stessa ricetta. Una risposta appartenente a una sessione chiusa non deve aggiornare alcuna cache.

**Test necessari:** due ricette con esiti misti; due voti sulla stessa ricetta con risposte invertite; uscita prima della risposta. I test attuali coprono soltanto mutazioni isolate.

### 6. Importante — Aggiornare le stelle non mantiene corrette le viste del Ricettario

**Riferimenti:** P, righe 3373–3382; ricerca e ordinamento alle righe 1678–1690.

`patchRatings` sostituisce il riepilogo del voto negli elementi già presenti, senza aggiornare appartenenza e posizione nella ricerca.

Una ricetta che scende sotto il voto minimo resta nei risultati; una ricetta che supera la soglia può continuare a mancare; l’ordinamento per voto resta quello precedente. Inoltre il patch attraversa tutte le famiglie senza usare `familyId`, applicando una media familiare anche alle copie di altre famiglie eventualmente presenti.

**Correzione proposta:** definire come aggiornare tutte le conseguenze del voto sulle viste derivate, rispettando il requisito delle modifiche locali senza rilettura. Applicare ogni riepilogo familiare soltanto alla famiglia pertinente; le altre medie richiedono dati propri.

**Test necessari:** superamento della soglia in entrambe le direzioni, riordinamento dopo il voto e due famiglie con medie differenti.

### 7. Importante — Il service worker non garantisce l’apertura offline

**Riferimenti:** P, righe 5023–5053 e 5185; S, righe 318–328.

L’installazione salva soltanto `index.html`. JavaScript e CSS entrano nella cache solo se vengono richiesti da una pagina già controllata dal service worker. Il primo caricamento non garantisce questa condizione.

All’aggiornamento, il nuovo worker cancella inoltre le vecchie cache pur avendo salvato soltanto l’HTML nuovo. La prova degli handler `install` e `activate` lascia nella cache B esclusivamente `/index.html`, senza il bundle B.

**Perché conta:** l’app può avere dati in IndexedDB ma non il codice necessario per mostrarli. I test di `strategyFor` verificano la classificazione delle richieste, non questo comportamento.

**Correzione proposta:** rendere coerente il ciclo di installazione della shell con i suoi asset indispensabili. Eliminare la versione precedente soltanto quando la nuova può avviarsi; definire anche la prima disponibilità offline.

**Test necessari:** prima visita→chiusura→riapertura offline; aggiornamento A→B→riapertura offline; installazione interrotta mentre viene scaricato un asset necessario.

### 8. Importante — Il porting degli stili interrompe la catena delle altezze

**Riferimenti:** P, righe 195–197 e 254–263; `prototype/src/lib/design/global.css`, righe 4 e 10–18.

Il piano introduce `<div id="root">`, ma copia un layout che assegna `height: 100%` a `.shell` senza dare un’altezza definita al nuovo contenitore.

Il `body` ha `height: 100dvh` e `overflow: hidden`: una vista lunga può crescere oltre lo schermo anziché attivare gli scorrimenti interni previsti, tagliando contenuto e navbar.

**Correzione proposta:** adattare esplicitamente la catena `body → #root → .shell` al montaggio React.

**Verifica necessaria:** nel browser reale, Ricettario lungo e Menu con ingredienti aperti a 320 e 390 px; navbar visibile, contenuto finale raggiungibile e scorrimento nei contenitori previsti. jsdom non verifica questo layout.

### 9. Importante — Errori delle query e assenza di famiglia producono caricamenti senza uscita

**Riferimenti:** P, righe 4218–4225, 4479–4495, 4664–4695 e 4848–4849.

Il Profilo mostra `Loading` ogni volta che manca `me.data`, anche se la query è fallita. Ricettario e scheda ricetta ignorano l’errore di `me`; senza famiglia lasciano disabilitate le query dipendenti e mostrano il caricamento.

Anche diversi errori gestiti nel Menu non offrono «Riprova». L’`errorComponent` del router non risolve questi casi: le pagine leggono `isError` e non propagano l’errore a quel componente.

**Perché conta:** basta una lettura iniziale fallita o un utente senza famiglia per impedire l’uso dell’app. Nel Profilo può sparire anche «Esci».

**Correzione proposta:** distinguere caricamento, errore e assenza di famiglia; conservare l’accesso alle azioni dell’account e aggiungere un recupero effettivo delle query fallite.

**Test necessari:** `me.get` fallisce; `families: []`; famiglia corrente non più presente; errore iniziale seguito da «Riprova» riuscito.

### 10. Importante — La lingua del dispositivo prevale indebitamente sul profilo successivo

**Riferimenti:** P, righe 944–1006 e 2968–2976; S, righe 179–181 e 207–209; W1, righe 136–140.

Il piano conserva una sola chiave globale `locale` e stabilisce che una scelta locale prevalga sempre sul profilo. Il provider sopravvive all’uscita.

A sceglie inglese, esce; B entra con profilo italiano: `hasDeviceChoice` impedisce di applicare la lingua di B. Questo contraddice S, che prescrive la lingua del profilo dopo il login.

Il client finto traduce leggendo `getLocale()`, mentre W1 localizza dal profilo sul server: questa differenza deve essere esplicitata nel passaggio al client reale.

**Correzione proposta:** separare preferenza demo e preferenza dell’utente autenticato; applicare il profilo a ogni cambio d’identità. Concordare il passaggio dal cambio locale temporaneo al salvataggio del profilo.

**Test necessari:** A inglese→uscita→B italiano; riapertura con preferenza locale preesistente; cambio lingua con richieste della lingua precedente ancora pendenti.

### 11. Importante — La scheda aperta da un pasto perde il contesto necessario

**Riferimenti:** P, righe 1093–1094, 2519, 4262 e 4665–4669; specifica principale, righe 928–938; `prototype/src/routes/menu/+page.svelte`, riga 87.

Il collegamento dal Menu trasmette solo ricetta e giorno. `recipes.get` riceve ricetta e porzioni, senza slot o altro riferimento capace di distinguere pranzo e cena.

Il prototipo conserva invece `slot`. La specifica richiede che il dettaglio aperto da un pasto passato mostri la versione storica corretta e che le ricette archiviate restino leggibili dai pasti.

**Perché conta:** la nuova interfaccia perde informazioni necessarie ai percorsi approvati. Non si potrà ottenere quel comportamento sostituendo soltanto il client.

**Correzione proposta:** conservare già in rotte, input e chiavi delle query il riferimento al pasto. Il calcolo delle versioni può arrivare con l’ondata 2; il punto di aggancio deve essere previsto ora.

**Test necessario:** stessa ricetta in due pasti distinti e dettaglio aperto da un pasto storico; verifica del riferimento trasmesso al client.

### 12. Minore — Nel dettaglio delle ricette da libro mancano titolo e pagine

**Riferimenti:** P, righe 4697–4723; `prototype/src/routes/recipes/[id]/+page.svelte`, righe 122–125; specifica principale, righe 923–927.

`RecipeSummary` contiene `bookTitle` e `bookPages`, ma `RecipePage` non li mostra. Il titolo senza URL resta testo semplice e manca la riga bibliografica presente nel prototipo.

**Correzione proposta:** ripristinare la fonte per libro e l’indicazione della ricetta di casa, con testi localizzati.

**Test necessario:** dettaglio di una ricetta da libro, aperto direttamente, con titolo e pagine visibili.

### 13. Importante — Il calendario perde il focus alla selezione

**Riferimenti:** P, righe 4052–4054, 4058–4062 e 4109–4112; `prototype/src/lib/components/DatePicker.svelte`, funzioni `close` e `choose`.

Premere una data chiude e smonta il pannello senza ripristinare il focus. Solo Escape lo riporta al pulsante calendario. Il prototipo richiama invece `close()` anche dopo la scelta.

L’effetto legato a `dates.data` può inoltre riportare il focus al giorno selezionato durante una rilettura, mentre la persona sta usando un altro controllo del pannello.

**Correzione proposta:** gestire apertura e chiusura attraverso un percorso unico, ricordando il controllo che ha aperto il calendario; assegnare il focus iniziale una sola volta per apertura.

**Test necessari:** scelta da tastiera, Escape, apertura dal mese e dall’icona, aggiornamento dei dati mentre il focus è sulle frecce. La prova finale deve includere tastiera e VoiceOver, oltre agli screenshot.

### 14. Importante — Il voto offline riesce nel client finto, contrario alla specifica

**Riferimenti:** P, righe 1706–1717, 2074 e 3327–3331; S, righe 333–334.

La specifica prescrive il fallimento del voto offline. Il piano imposta `networkMode: 'always'` e il client finto salva in memoria senza controllare la connettività. Tutte le schermate W5 usano quel client, anche dopo login Supabase.

Il test «voto che fallisce» sostituisce direttamente il metodo con una Promise rifiutata: verifica il rollback, ma non prova il comportamento offline dichiarato.

**Correzione proposta:** rendere verificabile il rifiuto offline nel percorso effettivamente utilizzato, senza introdurre una coda delle mutazioni.

**Test necessario:** portare l’app offline attraverso il meccanismo di connettività, tentare il voto e verificare errore, stato invariato e assenza di invio automatico alla riconnessione.

## Punti da decidere con il coordinatore o l’utente

1. **Ambito di «Esci».** La chiamata Supabase senza opzioni usa l’ambito globale e chiude anche le altre sessioni. Scegliere esplicitamente se il comando riguardi questo dispositivo o tutti; riportare la decisione in S e nella specifica principale.

2. **Consultazione offline con sessione non verificabile.** Definire cosa accade quando la sessione locale non può essere rinnovata senza rete: disponibilità della copia, eventuale durata e comportamento alla riconnessione. È distinto dal rifiuto esplicito del server, che deve essere gestito come nel rilievo 2.

3. **Lingua nella fase transitoria.** Confermare se, con login reale ma dati ancora finti, la scelta sia temporanea per utente o indisponibile fino all’operazione sul profilo. La precedenza permanente di una preferenza globale del dispositivo non risulta approvata.

4. **Agganci ai pasti storici.** Confermare che W5 conservi il contesto dello slot senza anticipare l’implementazione delle versioni. È sufficiente a non perdere il percorso approvato.

5. **Confine con W1.** Assegnare esplicitamente il momento di consegna e verifica dell’adattatore oRPC, inclusi conversione degli errori, token, proxy Vite e risposta a `unauthorized`. Il piano contiene attualmente solo il client finto.

## Indicazioni per la revisione successiva

Le dipendenze proposte sono contenute e sostanzialmente motivate; questi rilievi non richiedono automaticamente nuove librerie.

Restano correttamente fuori da W5 revisione dei pasti, Spesa, inviti, wizard e pagine amministrative. Non è necessario ampliare quel perimetro: occorre correggere le fondamenta e aggiungere prove sui comportamenti critici, soprattutto interruzioni, concorrenza, cambi d’identità e aggiornamenti della PWA.

La revisione successiva dovrà verificare spec e piano aggiornati prima dell’avvio dell’implementazione.