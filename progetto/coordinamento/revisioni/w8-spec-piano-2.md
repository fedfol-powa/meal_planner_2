# Seconda revisione W8 — Aggiornamento della PWA

**Branch:** `traguardo/aggiornamento-pwa`  
**Commit:** `eb8370651f5b47303c0b409c1d6cd5136f7b6a55`  
**Ambito:** spec e piano dell’issue #42. Nessun file modificato.

La semplificazione elimina i problemi della navigazione dalla rete e della guardia inline. Restano però **un rilievo bloccante, due importanti e uno minore**: il precache non garantisce la corrispondenza fra worker, HTML e asset; il limite dei ricaricamenti blocca una ripubblicazione dopo rollback; un errore iniziale di registrazione disabilita i successivi aggiornamenti espliciti; alcune prove di rottura non verificano quanto dichiarato.

## Rilievo bloccante

### 1. La cache può contenere una shell diversa dal worker, oppure HTML senza i suoi asset

**Riferimenti:** [spec:33](/Users/fedfol/Projects/meal_planner_2/.worktrees/pwa/progetto/superpowers/specs/2026-10-13-aggiornamento-pwa.md:33), [piano:284](/Users/fedfol/Projects/meal_planner_2/.worktrees/pwa/progetto/superpowers/plans/2026-10-13-aggiornamento-pwa.md:284), [piano:295](/Users/fedfol/Projects/meal_planner_2/.worktrees/pwa/progetto/superpowers/plans/2026-10-13-aggiornamento-pwa.md:295), [precache.ts:5](/Users/fedfol/Projects/meal_planner_2/.worktrees/pwa/web/src/pwa/precache.ts:5).

Il piano assume che una cache completa appartenga necessariamente alla versione del worker. L’installazione, però, scarica `/precache.json` e `/index.html` da indirizzi non versionati e controlla soltanto `response.ok`. Non verifica l’identità dei contenuti.

Due sequenze ammesse:

1. Il browser scarica `sw.js` B; viene pubblicata C; il worker B scarica manifest, HTML e asset C, salvandoli nella cache chiamata B.
2. Il worker scarica il manifest B; durante le richieste successive cambia il rilascio; riceve HTML C e asset B. Tutte le risposte possono essere valide: richieste distinte possono attraversare il cambio di rilascio, anche durante il redirect di `/index.html`.

**Riproduzione in memoria sul codice del piano:**

```text
worker B + contenuti C:
  skipWaiting chiamato
  cache B = HTML C + bundle C

manifest B + HTML C + bundle B:
  installazione riuscita
  cache B senza il bundle C richiesto dall’HTML
```

Nel secondo caso la riapertura offline non può avviare l’app. Nel primo il ricaricamento non rende uguali pagina e worker: viene meno la premessa usata per dimostrare la convergenza.

Anche la protezione della cache durante un rollback è incompleta: `if (!existed)` evita la cancellazione, ma non gli aggiornamenti parziali. Ho riprodotto una reinstallazione fallita dopo la scrittura dell’HTML: la cache B conservata conteneva il nuovo HTML e i vecchi asset. Le singole `cache.put()` consumano il corpo della risposta e sovrascrivono la relativa voce; il ciclo non costituisce una transazione unica. [Documentazione Cache.put](https://developer.mozilla.org/en-US/docs/Web/API/Cache/put).

**Correzione proposta:** vincolare il precache alla build del worker e verificare i contenuti prima di accettarlo. Per esempio, identità della build e impronte generate dalla build, sufficienti a verificare anche l’HTML e i file scaricati. Una cache completa già conservata deve restare immutata durante un tentativo fallito.

Aggiungere test per cambio di rilascio fra script, manifest e HTML, oltre al fallimento durante la scrittura di una cache già presente. Non serve reintrodurre la guardia inline: occorre rendere vera la garanzia di coerenza all’installazione.

## Rilievi importanti

### 2. Il limite permanente per coppia impedisce un aggiornamento legittimo dopo rollback

**Riferimenti:** [spec:147](/Users/fedfol/Projects/meal_planner_2/.worktrees/pwa/progetto/superpowers/specs/2026-10-13-aggiornamento-pwa.md:147), [piano:648](/Users/fedfol/Projects/meal_planner_2/.worktrees/pwa/progetto/superpowers/plans/2026-10-13-aggiornamento-pwa.md:648).

`claimReload()` registra ogni coppia in `sessionStorage` e non rimuove mai il segno, nemmeno dopo un passaggio riuscito.

**Riproduzione con la funzione esatta del piano e lo stesso archivio fra documenti:**

```text
B → C: ricaricamento consentito
C → B: ricaricamento consentito
B → C: ricaricamento negato
```

Dopo il rollback, ripubblicare lo stesso artefatto C lascia la pagina B sotto il worker C. Ulteriori ritorni in primo piano continuano a incontrare il segno `B>C`: l’app può restare vecchia fino a una navigazione manuale o alla fine della sessione della finestra.

Non si tratta di un ciclo patologico, ma di due aggiornamenti riusciti seguiti da un nuovo aggiornamento legittimo. La prova browser termina il rollback senza ripetere questa transizione.

**Correzione proposta:** limitare i tentativi consecutivi senza convergenza, mantenendo la protezione fra documenti ma chiudendo il tentativo quando pagina e worker risultano allineati. Aggiungere B → C → B → C con `sessionStorage` conservato, verificando sia il secondo aggiornamento sia il blocco di un vero ricaricamento senza progresso.

Questa correzione richiede di precisare la decisione del coordinatore «al massimo una volta per coppia»: interpretata per tutta la sessione, contraddice l’obiettivo dell’aggiornamento automatico.

### 3. Se la registrazione iniziale fallisce, i ritorni in primo piano non cercano più aggiornamenti

**Riferimenti:** [piano:983](/Users/fedfol/Projects/meal_planner_2/.worktrees/pwa/progetto/superpowers/plans/2026-10-13-aggiornamento-pwa.md:983), [piano:1010](/Users/fedfol/Projects/meal_planner_2/.worktrees/pwa/progetto/superpowers/plans/2026-10-13-aggiornamento-pwa.md:1010), [piano:1038](/Users/fedfol/Projects/meal_planner_2/.worktrees/pwa/progetto/superpowers/plans/2026-10-13-aggiornamento-pwa.md:1038).

`registration` viene assegnata soltanto dopo `register()`. Se la promessa viene rifiutata, il `catch` esterno assorbe l’errore, ma gli ascoltatori già installati continuano a usare `registration === undefined`. Ogni successivo `update()` non fa nulla.

Il caso riguarda anche il primo passaggio: A₀ registra con il valore predefinito `updateViaCache: 'imports'`; B richiede `'none'`. Con opzioni diverse, `register()` non beneficia del ritorno immediato della registrazione equivalente e passa dall’algoritmo di aggiornamento, che può fallire senza rete. Non sto assumendo che ogni registrazione di un’app già installata fallisca offline. [Algoritmi Register e Update](https://www.w3.org/TR/service-workers/#register-algorithm).

**Riproduzione in memoria:** registrazione iniziale rifiutata, controller B ancora disponibile, poi tre ritorni visibili con la rete:

```text
register: 1 chiamata
registration.update: 0 chiamate
reload: 0 chiamate
```

La pagina resta utilizzabile, ma perde il meccanismo esplicito che dovrebbe aggiornare rapidamente la PWA sospesa.

**Correzione proposta:** recuperare la registrazione esistente e/o ritentare l’inizializzazione al ritorno visibile quando manca, senza dipendere per tutta la vita della pagina dal successo del primo tentativo. Aggiungere un test «registrazione fallita → rete disponibile → ritorno visibile → aggiornamento riuscito». Il test attuale copre solo il rifiuto di `registration.update()` dopo una registrazione riuscita.

## Rilievo minore

### 4. Le prove del Task 6 non coprono tutte le finestre dichiarate

**Riferimenti:** [piano:1376](/Users/fedfol/Projects/meal_planner_2/.worktrees/pwa/progetto/superpowers/plans/2026-10-13-aggiornamento-pwa.md:1376), [piano:1386](/Users/fedfol/Projects/meal_planner_2/.worktrees/pwa/progetto/superpowers/plans/2026-10-13-aggiornamento-pwa.md:1386), [piano:1524](/Users/fedfol/Projects/meal_planner_2/.worktrees/pwa/progetto/superpowers/plans/2026-10-13-aggiornamento-pwa.md:1524).

Due discrepanze:

- Il test del logout trattiene `backend.signOut()`, ma non la pulizia precedente. Spostare erroneamente `trackBusy` attorno al solo backend può lasciare scoperta la pulizia senza far fallire questo test.
- Il test dell’accodamento trattiene la transazione quando sono attivi entrambi i contatori, quello di `add` e quello di `mutate`. Rimuoverne uno lascia l’altro attivo: non può fallire ogni volta come richiesto dalle prove di rottura.

Ho ripetuto in memoria il secondo caso: durante la transazione trattenuta `registeredBusy()` resta `true` anche togliendo il contatore esterno di `add`.

**Correzione proposta:** aggiungere una pulizia del logout deliberatamente trattenuta; distinguere le finestre della coda che si vogliono proteggere. Le prove di rottura devono eliminare la protezione del comportamento osservato, non pretendere che ogni wrapper ridondante sia individualmente indispensabile.

## Esito dei nove rilievi della prima revisione

Gli stati seguenti riguardano **spec e piano**, non un’implementazione già collaudata.

| Rilievo precedente | Esito della seconda revisione |
|---|---|
| **1. Ciclo durante rollback** | **Superato il caso originario**: navigando dalla shell del worker attivo, il rollback ordinario converge. Confermato in memoria. Restano i nuovi rilievi 1 e 2. |
| **2. Controlli superati dopo l’attesa** | **Chiuso nel piano.** Ripetute le prove con tocco, pagina nascosta, occupazione sopraggiunta e nuova transizione di visibilità: la risposta vecchia non ricarica; il controllo valido successivo decide. |
| **3. Scritture non rappresentate da `isMutating()`** | **Chiuso nel disegno dei collegamenti.** Sono coperti password, lingua, logout completo e accodamento. Le prove d’integrazione richiedono il completamento indicato nel rilievo 4. |
| **4. Timeout che non copre il corpo HTML** | **Superato dalla nuova architettura.** La navigazione ordinaria usa la shell. Con un corpo del precache pendente, la riproduzione non chiama `skipWaiting` e conserva il worker precedente. |
| **5. Recupero fragile della guardia** | **Superato:** guardia, `use-shell` e relativi stati temporali eliminati. |
| **6. Guardia inserita dopo il bundle** | **Superato:** il plugin della guardia non è più previsto. |
| **7. Cache eliminate durante la convivenza** | **Chiuso entro il limite concordato.** Confermate tre cache conservate in A → B → C e nel rollback C → B. Il limite oltre due versioni saltate è esplicito. |
| **8. Test insufficienti e selettore errato** | **Parzialmente chiuso.** Nome `main-…`, provider reali, lista fra build, identificativi della coda e confini della prova Supabase sono corretti. Restano il rilievo 4 e i nuovi scenari funzionali non coperti. |
| **9. Vecchi buster convertiti nello schema corrente** | **Chiuso.** Verificato con il persister adattato in memoria e TanStack reale: ISO → `'1'` ripristinato; ISO con schema richiesto `'2'` respinto. Scarto e compatibilità delle API sono documentati. |

## Primo passaggio, iOS e conservazione dei dati

La procedura **A₀ → B** è correttamente descritta come due aperture a freddo da verificare, senza promessa temporale assoluta. Evitare `WindowClient.navigate()` sulle pagine A₀ protegge le scritture che quella versione non sa segnalare.

La prova in memoria conferma che, dopo un’installazione coerente di B, la sua shell è disponibile offline e la cache A₀ resta conservata. L’attivazione del nuovo worker con `skipWaiting()` è coerente con il ciclo di vita previsto; non serve `clients.claim()` per sostituire il controller dei client già controllati. [Specifica Service Workers](https://www.w3.org/TR/service-workers/#activate-algorithm).

La separazione fra schema persistito e versione della build è corretta. I collegamenti proposti per pagina occupata affrontano le finestre individuate nella prima revisione, senza nuove librerie.

Restano da eseguire dopo l’implementazione:

- prove complete con provider reali, transazioni trattenute e coda persistita;
- passaggi fra build nel browser;
- sospensione e ripresa della PWA sull’iPhone;
- conservazione della sessione Supabase reale.

Gli eventi sintetici e il backend finto non dimostrano gli ultimi due punti; ora i documenti lo dichiarano correttamente.

## Decisioni e allineamenti del coordinatore

- Precisare il limite dei ricaricamenti come protezione dai tentativi **senza convergenza**, risolvendo il rilievo 2.
- Consolidare le decisioni nella specifica principale e nelle «Interfacce decise» del piano generale, che riportano ancora navigazioni dalla rete e `buster` legato alla build.
- Delimitare il rollback automatico alle versioni dotate del nuovo protocollo. Un ritorno fino ad A₀ richiede una procedura distinta: il suo worker non contiene `skipWaiting()` né la risposta `version`.

La struttura generale può restare quella semplificata. Le correzioni necessarie riguardano la coerenza del precache, il ciclo del limite difensivo e il recupero dell’inizializzazione; non giustificano il ritorno alla guardia inline.

## Verifiche eseguite e limiti

Letti brief, prima revisione, decisioni del coordinatore, documenti al commit richiesto, sezioni pertinenti della specifica principale, interfacce e registro del piano generale nel checkout principale e codice coinvolto.

Le riproduzioni hanno eseguito estratti TypeScript del piano in memoria, con dipendenze simulate; per il ripristino delle copie è stato usato TanStack installato nel repository. Nessuna prova browser o iPhone e nessuna suite completa vengono dichiarate superate.

La lettura remota dell’issue tramite `gh` non è riuscita per indisponibilità della connessione a GitHub; la revisione si basa sui documenti locali indicati. Controllo finale: commit invariato, worktree pulito e `git diff --check` senza errori.

**Verdetto: DA CORREGGERE.**