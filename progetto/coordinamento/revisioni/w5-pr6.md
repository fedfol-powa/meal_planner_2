# Revisione PR #6 — App web di base

**Verdetto: DA RIFARE nelle parti relative alla chiusura della sessione, alla persistenza delle revoche e all’isolamento delle richieste per lingua.**

L’implementazione risolve molti rilievi precedenti e supera test, typecheck e build. Restano però tre difetti riprodotti sul codice della PR. I primi due compromettono garanzie esplicite di uscita e revoca dell’accesso; vanno corretti prima del merge.

## Perimetro e metodo

Revisione del commit `36bd44302c8b85b2a6fd2c94585697cbb2f1cdb8`, mediante `git diff origin/main...HEAD`, con `origin/main` a `94e60ee6c9622ba77c69335d9c60a35d31bba4ea`.

Consultati brief, `AGENTS.md`, sezioni pertinenti della specifica principale, specifica e piano W5, correzioni prevalenti C1–C9, entrambe le review precedenti, piano generale nel checkout principale, `spike/REPORT.md` e guida di design. Verificata con Context7 la documentazione pertinente di Supabase e TanStack Query.

Le riproduzioni aggiuntive hanno eseguito i moduli della PR con backend controllato, archivio in memoria e, per `AuthProvider`, React e jsdom. Non sono prove contro Supabase remoto.

Nessuna modifica ai sorgenti, commit, push o commento alla PR. Il rapporto non è stato scritto su file. `git status --short` finale è pulito.

## Rilievi

### 1. Bloccante — Un evento di rinnovo durante la pulizia può annullare «Esci»

**Riferimenti:** [AuthProvider.tsx:56](/Users/fedfol/Projects/meal_planner_2/.worktrees/review-pr6/web/src/auth/AuthProvider.tsx:56), righe 72–80; [supabaseBackend.ts:48](/Users/fedfol/Projects/meal_planner_2/.worktrees/review-pr6/web/src/auth/supabaseBackend.ts:48), righe 48–53.

`signOut()` imposta subito `signedOut`, poi attende la cancellazione locale. Durante questa attesa, `onChange` continua ad accettare qualsiasi evento contenente un utente come nuovo `signedIn`.

Il backend converte allo stesso modo anche `TOKEN_REFRESHED`: il coordinatore non può distinguere il rinnovo della sessione che sta chiudendo da un nuovo accesso.

Sequenza riprodotta:

1. A è autenticato.
2. Parte `signOut('a', cleanup)`; la pulizia rimane pendente.
3. Arriva un evento di autenticazione contenente ancora A.
4. `AuthProvider` torna a `signedIn`.
5. Termina la pulizia.
6. Il controllo alla riga 78 evita `backend.signOut()`, perché lo stato non è più `signedOut`.

Esito osservato:

```text
After signOut started: signedOut
After same-user auth event during cleanup: signedIn
After signOut finished: signedIn backend.signOut calls: 0
```

**Perché conta:** l’utente può premere «Esci» e ritrovarsi autenticato senza aver eseguito un nuovo accesso. La cancellazione della cache non basta: le credenziali del backend restano attive. Le generazioni introdotte da C2 proteggono dalle risposte tardive di `check()`, ma non da questo evento durante l’uscita.

**Correzione proposta:** rappresentare esplicitamente la chiusura della generazione di autenticazione e conservare il tipo degli eventi del backend. Un rinnovo della generazione in chiusura non deve riaprire l’accesso né impedire la conclusione dell’uscita; un autentico accesso successivo deve invece essere riconosciuto e preservato.

**Test richiesto:** pulizia persistita sospesa → `TOKEN_REFRESHED` di A → completamento della pulizia. Verificare stato finale disconnesso, chiusura del backend e mancato ripristino delle credenziali alla riapertura. Conservare anche il caso già coperto dell’ingresso di B durante la pulizia.

### 2. Bloccante — Gli aggiornamenti concorrenti dei segni di revoca possono perdere una revoca

**Riferimenti:** [persister.ts:35](/Users/fedfol/Projects/meal_planner_2/.worktrees/review-pr6/web/src/api/persister.ts:35), righe 35–46; `web/src/api/persister.ts`, righe 76–90 e 118–134.

`markRevoked()` e `clearRevoked()` eseguono una lettura dell’intera mappa, seguita da una scrittura o cancellazione separata. Il backend IndexedDB usa transazioni distinte per queste operazioni. La coda del persister non serializza gli aggiornamenti dei segni, né coordina le diverse schede.

Ho riprodotto due perdite di aggiornamento.

**Due famiglie revocate contemporaneamente:**

```ts
await Promise.all([
  markRevoked(store, 'a', 'family-1', 100),
  markRevoked(store, 'a', 'family-2', 101),
]);
```

Risultato:

```text
Concurrent revocation marks: { 'family-2': 101 }
Restored families: [ 'family-1' ]
```

La successiva scrittura di una copia contenente entrambe le famiglie filtra soltanto `family-2`: `family-1` viene ripristinata.

**Una nuova revoca della stessa famiglia, concorrente con la rimozione del vecchio segno:**

```ts
await markRevoked(store, 'a', 'f', 100);
await Promise.all([
  markRevoked(store, 'a', 'f', 200),
  clearRevoked(store, 'a', 'f', 150),
]);
```

Risultato: nessun segno rimasto. La lettura riuscita partita a 150 cancella anche la revoca successiva a 200, che avrebbe dovuto conservare.

**Perché conta:** C4 promette che anche una scheda non ancora informata della revoca non possa riscrivere dati revocati. Il vincolo persistito può invece scomparire. `BroadcastChannel` non rende atomiche le operazioni sull’archivio condiviso.

**Correzione proposta:** rendere atomici lettura, confronto temporale e aggiornamento del segno fra tutte le schede, per esempio tramite un’operazione transazionale dell’archivio. Una coda appartenente alla singola istanza non è sufficiente. Verificare inoltre il coordinamento con cancellazione della sessione e scritture pendenti.

**Test richiesti:** entrambe le sequenze sopra, seguite da scrittura tardiva e ripristino. Aggiungere una prova sull’adattatore IndexedDB o nel browser: i test attuali eseguono le modifiche dei segni in sequenza.

### 3. Importante — Una richiesta ripetuta dopo il cambio di lingua può contaminare la cache dell’altra lingua

**Riferimenti:** [SessionScope.tsx:64](/Users/fedfol/Projects/meal_planner_2/.worktrees/review-pr6/web/src/session/SessionScope.tsx:64), righe 64–65; [queries.ts:93](/Users/fedfol/Projects/meal_planner_2/.worktrees/review-pr6/web/src/api/queries.ts:93), righe 93–97; `web/src/session/session.ts`, righe 132–146.

La lingua è parte della chiave della query, ma non vincola la chiamata che la riempie. Il client viene creato con `getLocale()` che legge sempre `localeRef.current`.

Dopo un `unauthorized`, `session.call()` ripete la chiamata usando la lingua corrente, anche se la query appartiene alla lingua precedente.

Sequenza riprodotta con `recipeQuery`, `wrapApi`, `createSession` e il client finto, introducendo un primo rifiuto controllato:

1. Parte una query con chiave `it-IT`.
2. La prima chiamata riceve `unauthorized`; il rinnovo rimane pendente.
3. La lingua passa a `en-GB`.
4. Il rinnovo riesce.
5. La chiamata ripetuta produce contenuti inglesi e li salva nella query italiana.

Esito:

```text
Cached query locale: it-IT
Response version: family:family-main|rev:1|lang:en-GB|deploy:fake
Recipe name: Skottle tuna steaks
```

**Perché conta:** tornando all’italiano si può mostrare immediatamente la copia inglese, anche persistita. `keepPreviousWithin()` corregge l’uso dei dati segnaposto, ma non protegge da una risposta della lingua sbagliata già salvata sotto la nuova chiave consultata.

Il client finto ordinario non genera `unauthorized`; il difetto riguarda il percorso di recupero che questa consegna implementa e prova per il futuro client reale.

**Correzione proposta:** associare lingua o generazione linguistica alla lettura e ai suoi tentativi. Le richieste superate dal cambio di lingua devono essere annullate o scartate prima di aggiornare la cache. Nel client finto, la lingua usata per dati e versione deve essere coerente con quella della richiesta.

**Test richiesto:** richiesta italiana → rinnovo sospeso → cambio inglese → rinnovo riuscito → ritorno all’italiano, controllando anche persistenza e ripristino.

## Verifica delle correzioni C1–C9

| Correzione | Esito nel codice |
|---|---|
| **C1 — Identità sconosciuta e pulizia** | **Risolta nei casi previsti.** Durante `loading` non viene creata la sessione né cancellata la copia. Test con verifica sospesa e rientro verificato/non verificato offline. |
| **C2 — Eventi d’identità numerati** | **Parziale.** Le verifiche tardive vengono scartate e l’uscita di A non chiude B già corrente. Resta il rilievo 1 sugli eventi durante la pulizia. |
| **C3 — Rinnovo unico** | **Risolta per concorrenza e completamenti della vecchia sessione.** Test su rinnovo condiviso, epoche, secondo rifiuto e completamento dopo chiusura. Il cambio di lingua durante il recupero resta scoperto: rilievo 3. |
| **C4 — Revoca fra schede** | **Parziale.** Canale, rimozione locale e filtro persistito esistono; manca atomicità degli aggiornamenti dei segni: rilievo 2. |
| **C5 — Voto e letture pendenti** | **Risolta nei casi verificati.** Le letture vengono annullate prima del patch; `unchanged` rilegge la cache corrente. Test anche su persistenza del voto confermato. |
| **C6 — Shell del service worker** | **Risolta nei test e negli artefatti verificati.** Navigazione dalla shell installata, installazione completa e conservazione di A quando B fallisce. Prova browser non eseguibile nel sandbox. |
| **C7 — Dati precedenti solo nella stessa vista** | **Risolto il difetto dei segnaposto.** Test sulle schermate per lingua, ricetta e slot. L’isolamento linguistico complessivo resta incompleto per il rilievo 3. |
| **C8 — Profilo con errore bloccante** | **Risolta.** I dati del profilo vengono nascosti; rimangono email della sessione, lingua ed «Esci». |
| **C9 — Versioni stringa** | **Risolta.** Nessuna fixture `version: <numero>` trovata nel codice web o nel piano; typecheck superato. |

## Altri rilievi della prima review

- **Chiusura e accesso rifiutato, rilievi 1–2:** correzioni sostanziali presenti, ma non chiusi completamente per i rilievi 1–2 di questo rapporto.
- **Versioni opache, rilievo 3:** corrette.
- **Persistenza ottimistica, rollback e viste derivate, rilievi 4–6:** aggiornamenti ottimistici eliminati; patch limitato alla famiglia, controllo dell’ultima richiesta e invalidazione delle liste presenti.
- **Shell offline, rilievo 7:** corretta nei casi coperti dai test del service worker.
- **Catena delle altezze, rilievo 8:** `#root` ha altezza definita; resa e scorrimento mobili non verificati nel browser.
- **Errori e famiglia assente, rilievo 9:** presenti stati distinti, `FamilyGate` e recupero delle query fallite.
- **Lingua del precedente utente, rilievo 10:** preferenze separate per utente e applicazione della lingua del profilo coperte dai test; distinto problema residuo nel rilievo 3.
- **Contesto del pasto e fonte da libro, rilievi 11–12:** `slotId` conservato in rotta, input e chiave; titolo e pagine del libro visualizzati.
- **Focus del calendario, rilievo 13:** percorso comune di chiusura e focus iniziale una volta per apertura presenti; verifica VoiceOver non eseguita.
- **Voto offline, rilievo 14:** rifiutato dal trasporto finto, senza coda né invio alla riconnessione.

## Test, typecheck e build

| Comando | Esito |
|---|---|
| Radice: `npm test` | **Passato:** 249 test, di cui 181 web |
| Radice: `npm run typecheck` | **Passato**, inclusi i workspace |
| Da `web/`: `npm test` | **Passato:** 181 test in 28 file |
| Da `web/`: `npm run typecheck` | **Passato** |
| Da `web/`: `npm run build` | **Passato** |
| `git diff --check origin/main...HEAD` | **Passato** |

I test emettono avvisi jsdom per `Window.scrollTo()` non implementato. La build segnala il bundle JavaScript da circa **721 kB**, **200 kB gzip**. Sono avvisi, non fallimenti.

Il `precache.json` prodotto comprende `index.html`, JavaScript e CSS con hash e i quattro font locali.

La prova browser è rimasta bloccata: `vite preview` fallisce con `listen EPERM` sulla porta locale. Non risultano quindi verificati in questa review installazione PWA reale, riapertura offline nel browser, layout a 320/390 px e VoiceOver. Nessuna integrazione Supabase remota è stata eseguita.

## Localizzazione e dipendenze

I testi dell’interfaccia esaminati usano dizionari italiani e inglesi britannici; date, numeri e plurali passano dai formattatori previsti. Le traduzioni dimostrative dei dati restano nel perimetro dichiarato. Il difetto linguistico rilevato riguarda l’associazione fra richiesta e cache.

Le dipendenze di esecuzione corrispondono allo stack e alla persistenza concordati. `@testing-library/dom` completa gli strumenti di test in sviluppo. Non risultano introdotte librerie PWA, i18n, ORM o componenti aggiuntive rispetto all’impostazione prevista. Il lockfile aggiunge 79 pacchetti senza cambiare le versioni di quelli già presenti nella base.

## Punti da decidere con il coordinatore o l’utente

Non emergono nuove decisioni di prodotto necessarie: uscita locale, consultazione offline, mutazioni senza ottimismo e client oRPC in una seconda PR restano validi.

Al coordinatore spettano la scelta della soluzione tecnica per la chiusura delle generazioni e l’atomicità delle revoche, e l’organizzazione della verifica browser/iPhone rimasta ineseguibile. Le tre correzioni richiedono test di regressione sulle sequenze descritte prima di una nuova approvazione.