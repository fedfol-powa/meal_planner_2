# Revisione W22 — spec e piano, secondo giro

**Verdetto: APPROVABILE CON CORREZIONI**

Revisione sul commit `c725262`, branch `evolutive/skeleton-pagine-rare`. Confrontati i documenti aggiornati con il primo rapporto, le decisioni del coordinatore, il brief W22, W20, la specifica principale, il piano generale del checkout principale, il design e il codice web attuale.

Nessun file modificato. Test, build e prove nel browser non eseguiti: questa è una revisione di spec e piano. Le differenze geometriche riportate derivano dalla struttura e dal CSS, non da misure nel browser.

## Esito dei rilievi del primo giro

| Rilievo | Esito |
|---|---|
| 1. Righe trasparenti nelle schede vere | **Risolto nel piano:** `filled` introduce il blocco pieno; previste verifiche delle classi e nel browser. |
| 2. Titoli senza soglia e pausa | **Risolto:** `TitleSkeleton` usa `Skeleton` nello scope del corpo; previsti controlli su soglia, pausa e link indietro. |
| 3. Differenze strutturali dei layout | **Parzialmente risolto:** corretti ordine della ricerca, parti statiche dei Link e struttura delle righe del Profilo. Restano le differenze del rilievo 1 sotto. |
| 4. Altri `role="status"` | **Risolto:** spec e piano recepiscono la decisione di limitare soltanto gli annunci di caricamento, preservando conteggi e conferme. |
| 5. Prove delle bozze e test offline di `/password` | **Parzialmente risolto:** corretto il test offline e aggiunto il passaggio ruolo sconosciuto → curatore. La prova geometrica usa ancora dati inadatti, rilievo 3 sotto. |
| 6. Firme e dipendenze dei task | **Risolto:** composizione tramite `children`, azione sulle righe, altezza del titolo configurabile e migrazione di `FamilyGate.waiting` dopo i chiamanti, con typecheck. |
| 7. Eccezione delle pagine riservate | **Risolto:** il testo destinato al design distingue sezioni condizionali e pagine riservate e precisa il significato di ruolo noto. |

## Rilievi

### 1. Importante — Restano spostamenti deterministici, anche introdotti dalle correzioni

**Riferimenti:** piano W22 alle righe [324](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/progetto/superpowers/plans/2026-10-23-skeleton-pagine-rare.md:324), [266](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/progetto/superpowers/plans/2026-10-23-skeleton-pagine-rare.md:266) e [369](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/progetto/superpowers/plans/2026-10-23-skeleton-pagine-rare.md:369).

Tre casi verificabili:

- **Preferenze:** la correzione sostituisce il paragrafo dell’email con un `div.static`. Il paragrafo vero riceve `margin-bottom: 12px` da `.settings-card > p`; il `div` conserva invece `margin: 0` di `.static`. La scheda in attesa risulta quindi più corta di 12 px, spostando Lingua e controlli successivi all’arrivo. Evidenze: [PreferencesPage.tsx:76](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/web/src/routes/profile/PreferencesPage.tsx:76), [global.css:129](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/web/src/design/global.css:129), [profile.module.css:1](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/web/src/routes/profile/profile.module.css:1).
- **Ingressi:** `SkeletonRows` riserva una riga principale e un solo `small`, mentre ogni ingresso vero contiene sempre nome, data e provenienza del link: una riga principale e **due** `small`. Lo scostamento esiste anche con un solo ingresso e testi senza ritorni a capo. Evidenze: firma nel [piano:154](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/progetto/superpowers/plans/2026-10-23-skeleton-pagine-rare.md:154), [MembersPage.tsx:192](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/web/src/routes/profile/MembersPage.tsx:192).
- **Inviti in Amministrazione:** prima dell’esito del controllo il piano prescrive quattro righe direttamente dentro `li.item`; dopo, quattro righe dentro un unico `span.skeleton-block`. `.item` è una griglia con `gap: 4px`: il secondo layout perde i tre intervalli fra le quattro righe. La lista cambia altezza già nel passaggio **controllo → lista ancora in attesa**, indipendentemente dai dati. Inoltre il contenuto vero usa classi specifiche per email, ruoli e metadati. Evidenze: [AdminPage.module.css:3](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/web/src/features/admin/AdminPage.module.css:3), [InvitationsSection.tsx:63](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/web/src/features/admin/InvitationsSection.tsx:63).

**Perché conta:** il precedente rilievo sulla stabilità strutturale non è chiuso; questi spostamenti non dipendono da quantità diverse dal caso comune.

**Correzione proposta:** mantenere il paragrafo dell’email con figli HTML validi e le dimensioni corrette, oppure conservarne esplicitamente il margine; rendere configurabile il numero di righe secondarie degli Ingressi; definire una struttura unica delle voci Inviti, con gli stessi intervalli e stili nelle due fasi. Includere Preferenze nel confronto geometrico del Task 10 e verificare separatamente il passaggio intermedio degli Inviti.

### 2. Importante — Il nuovo criterio per le schede di Membri può sostituire il controllo del ruolo già presente

**Riferimento:** [piano W22:252](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/progetto/superpowers/plans/2026-10-23-skeleton-pagine-rare.md:252), in particolare la condizione `family.role === 'family_admin'` alla riga 259.

Il piano usa il ruolo proveniente dal profilo per rendere le schede amministrative, senza precisare che, all’arrivo del dettaglio, deve tornare a decidere `detail.myRole`.

Oggi `MembersContent` calcola `isAdmin` da `view.myRole` e usa quel valore sia per abilitare la lettura dei link sia per mostrare Link e Ingressi: [MembersPage.tsx:64](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/web/src/routes/profile/MembersPage.tsx:64), [MembersPage.tsx:102](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/web/src/routes/profile/MembersPage.tsx:102). Profilo e dettaglio sono letture distinte: non è garantito che dicano lo stesso ruolo durante una rilettura o dopo una modifica esterna.

**Perché conta:** con profilo salvato da amministratore e dettaglio aggiornato da membro, l’implementazione prescritta potrebbe mantenere le schede amministrative quando oggi spariscono; nel caso inverso potrebbe non mostrarle. Cambierebbe il comportamento dei controlli esistenti, che spec e coordinatore chiedono di preservare. Non implica un aggiramento dei permessi del server, ma una regressione dell’interfaccia e delle letture abilitate.

**Correzione proposta:** distinguere esplicitamente il ruolo usato per anticipare il layout, quando il dettaglio manca, dal ruolo del dettaglio valido quando disponibile. Conservare la gestione degli errori bloccanti. Aggiungere test con profilo e dettaglio discordanti in entrambe le direzioni, verificando schede, azioni e abilitazione delle query.

### 3. Importante — La prova geometrica delle bozze continua a non usare il caso comune dichiarato

**Riferimenti:** [piano W22:456](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/progetto/superpowers/plans/2026-10-23-skeleton-pagine-rare.md:456), [piano W22:586](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/progetto/superpowers/plans/2026-10-23-skeleton-pagine-rare.md:586), [spec W22:249](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/progetto/superpowers/specs/2026-10-23-skeleton-pagine-rare.md:249).

Il test di componente ora usa correttamente una fixture con una riga di mancanze, ma rimanda la verifica del `top` al browser. Nel browser il Task 10 prescrive invece il catalogo finto esistente, contando sul fatto che abbia due bozze.

Quelle bozze non hanno la forma dichiarata: una ha quattro mancanze, l’altra **nessuna**, come mostra [fakeCatalogue.ts:59](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/web/src/api/fake/fakeCatalogue.ts:59). Per quella senza mancanze il contenuto omette completamente `styles.state`, mentre lo skeleton lo prevede sempre: [CatalogueDraftsSection.tsx:50](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/web/src/features/catalogue/CatalogueDraftsSection.tsx:50). Il cambio di lingua allinea il numero delle schede, non la loro altezza.

Anche la prova iPhone continua a promettere assenza di salti a parità di **numero**, senza richiedere la stessa forma, benché la sezione 3 della spec riconosca correttamente entrambe le condizioni.

**Perché conta:** manca ancora una prova geometrica del requisito centrale. Lo scostamento con i dati finti potrebbe essere liquidato come eccezione ammessa senza aver mai verificato il caso che deve restare fermo.

**Correzione proposta:** usare nel browser una fixture controllata con lo stesso numero dello skeleton, titoli su una riga e una riga di mancanze per ogni bozza; misurare il `top` dei risultati prima e dopo. Provare separatamente il catalogo finto e le quantità differenti come casi di spostamento ammesso. Allineare la prova iPhone specificando anche la forma delle schede.

## Punti da decidere dal coordinatore

- **Conteggi durante il ripristino:** la [spec:140](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/progetto/superpowers/specs/2026-10-23-skeleton-pagine-rare.md:140) limita il riuso ai riepiloghi già in memoria e adotta una scheda durante il ripristino, anche se esiste un riepilogo sul disco. La motivazione tecnica è esplicita, ma questa limitazione non era nella decisione del messaggio `w22-01-revisione-spec.md`, che chiedeva di proporre un’alternativa se il riuso fosse troppo costoso. Va confermata e riportata coerentemente nelle «Decisioni da riportare», dove oggi resta la formulazione generale sul riepilogo salvato.

Le decisioni sull’unico annuncio di caricamento e sull’eccezione delle pagine riservate sono già recepite: non richiedono ulteriori scelte.