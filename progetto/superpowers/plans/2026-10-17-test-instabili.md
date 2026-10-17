# Test web instabili in CI (W16) - piano

> **Per chi esegue:** worker W16, worktree `.worktrees/test-instabili`, branch
> `correzioni/test-instabili`. Brief: `progetto/coordinamento/brief/w16-test-instabili.md`
> (niente brainstorming né spec: cause e correzioni sono qui, la revisione Codex è sulla PR).

**Obiettivo:** la CI di `main` torna verde in modo stabile, senza indebolire i test: niente
`retry`, niente attese più lunghe come sola cura, nessuna asserzione tolta.

## Come si riproduce

Script di carico (nel blocco note del worker, non versionato): `N` corsie parallele di
`npx vitest run <file>` ripetute, con `M` processi `yes > /dev/null` che occupano la CPU
(macchina da 10 core, carico medio 20-26). Con questo i tre test cadono come in CI:

| Test | Esito sotto carico, prima |
| --- | --- |
| `ForgotPage.test.tsx` › «Manda di nuovo»… | 15 falliti su 32 |
| `SessionScope.test.tsx` › never shows an answer in the previous language… | 1 su 32 (3 su 40 strumentato) |
| `FamilyDeletePage.test.tsx` › leave then join… | 1 su ~96 (2 su 32 strumentato) |

## Cause e correzioni

### 1. `ForgotPage.test.tsx`: attesa sulla chiamata, asserzione sul DOM

Dopo il clic su «Manda di nuovo» il test aspettava `passwordEmailCalls` a due elementi e poi
controllava **subito** che il pulsante fosse sparito. La chiamata si registra in modo
sincrono al clic; il pulsante sparisce solo dopo la risposta, quando l'effetto passivo del
nuovo invio (`setCanResend(false)`) gira, qualche task dello scheduler di React più tardi.
L'uscita di `waitFor` dipende da un `setTimeout(0)` finto che avanza col tempo reale
(`shouldAdvanceTime`): sotto carico arriva prima degli effetti. Il log CI mostra infatti il
pulsante ancora presente (disattivato, invio in corso).

**Correzione:** la chiamata si verifica in modo sincrono dopo il clic; poi si aspetta la
condizione visibile, il pulsante che sparisce. Stessa asserzione, aspettata sul segnale giusto.

### 2. `SessionScope.test.tsx`: il segnale «week: -» c'è prima che la query parta

Il test teneva in sospeso la **prima** `getWeek` (contatore condiviso fra i client delle due
lingue) e premeva «switch» appena vedeva «week: -». Ma «week: -» è il primo rendering, prima
che la query italiana parta (la fetch parte in un effetto). Strumentato: nei 3 fallimenti il
clic avviene con zero letture e la prima `getWeek`, quella trattenuta, è `en-GB`, così
«week: english» non arriva mai.

**Correzione:** la risposta trattenuta si sceglie per lingua (`createApi` riceve la lingua),
non per ordine; il test preme «switch» solo dopo che la lettura italiana è davvero partita.
Così il test controlla sempre ciò che dichiara (una risposta italiana in volo durante il
cambio), mentre prima, nei giri «fortunati» del caso sbagliato, non lo controllava.

### 3. `FamilyDeletePage.test.tsx` › leave then join: callback di `mutate` scartate

Il DOM del fallimento (CI e locale) mostra `/invite` con «Entra nella famiglia» **attivo**,
nessun errore. Strumentato (eventi della `MutationCache`, chiamate, callback):

- escluso un nodo staccato: il pulsante cliccato è lo stesso che resta a schermo;
- esclusa una rilettura dell'invito, una navigazione o uno smontaggio (nessun evento di
  storia, nessuna pulizia d'effetto, una sola `status`);
- `family.join` parte e si risolve (`updated:success`), ma né `onSuccess` né `onError`
  girano. Nei fallimenti `observerAdded` avviene con l'observer **senza ascoltatori**
  (`hasListeners() === false`); nei giri riusciti con ascoltatori.

Causa: `useMutation` si iscrive al proprio observer in un effetto passivo
(`useSyncExternalStore`), e TanStack Query esegue le callback passate a `mutate` solo se
l'observer ha ascoltatori. Se il clic arriva prima che quell'iscrizione sia fatta e la
risposta è immediata (API finta, latenza 0), la risposta si chiude senza ascoltatori:
`onSuccess` viene scartata e la navigazione a `/menu` non parte. In produzione la risposta
arriva dopo la rete (o 150 ms nella modalità finta): la corsa è teorica, ma è nel codice
dell'app, non nel test.

**Correzione (codice):** in `InvitePage` `enter` e `openFamily` usano `mutateAsync`, la cui
promessa si risolve comunque; la generazione (`isCurrent`) già ignora una risposta arrivata
dopo aver lasciato la pagina, che è il motivo per cui si usavano le callback.
Lo stesso schema (callback di `mutate`) c'è in altre schermate (`NewFamilyPage`,
`MembersPage`, `PhotoControls`, `RecipePicker`, `UndoToast`, `InvitationsSection`…): non
cambiate qui, segnalate nella PR come rischio residuo per i loro test.

## Stessa forma in altri test

- `AgentsPage.test.tsx` › disconnect: aspettava che la rilettura della lista **partisse** e
  poi controllava subito che la riga fosse sparita; la riga sparisce con la **risposta**.
  Stesso difetto di ForgotPage: ora si aspetta la riga che sparisce.
- `useShoppingList.test.tsx` › never lets a read started before a confirmation overwrite it:
  `void act(async …)` su una rilettura trattenuta lasciava aperto uno scope di act asincrono
  mentre ne partivano altri (è l'avviso «You called act(async () => ...) without await» nel
  log CI). Ora la rilettura parte fuori da act. L'attesa di 10 ms reali resta: serve a un
  controllo negativo (la risposta tardiva non deve sovrascrivere), che col carico può solo
  passare per caso, non fallire; la promessa di `invalidateQueries` non è un segnale
  utilizzabile perché la conferma annulla la rilettura (verificato: si chiude prima del rilascio).
- Controllati e lasciati: gli altri stub a contatore (`UserPage`, `FamilyGate`,
  `RecipesPage`, `MenuPage`, `SessionScope.profile`, il primo caso di `SessionScope`) hanno
  una sola lettura iniziale già mostrata prima dell'azione; `MealActions` › leaving the menu
  ha un'asserzione di assenza dopo una chiamata, che non può fallire per i tempi; i
  `vi.useFakeTimers` degli altri file avanzano il tempo dentro `await act(async …)`.

## Prova di stabilità

Ogni file toccato, almeno 30 giri sotto carico, comando ed esito nella PR; CI della PR verde.
