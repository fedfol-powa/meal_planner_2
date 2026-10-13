# Revisione W7 — Cambio della password dal Profilo

Revisione del branch `traguardo/cambio-password`, commit `2ff8376c002af03eb83c26425b4efb7ecfdc74f4`.

Riferimenti abbreviati:

- **Spec**: [`progetto/superpowers/specs/2026-10-13-cambio-password.md`](/Users/fedfol/Projects/meal_planner_2/.worktrees/password/progetto/superpowers/specs/2026-10-13-cambio-password.md).
- **Piano**: [`progetto/superpowers/plans/2026-10-13-cambio-password.md`](/Users/fedfol/Projects/meal_planner_2/.worktrees/password/progetto/superpowers/plans/2026-10-13-cambio-password.md).

Ho letto i due brief, l’issue #37 con il commento, le sezioni pertinenti della specifica principale, il piano generale del checkout principale, `design/percorsi.md`, il rapporto dello spike e il codice di autenticazione, Profilo e CI. L’issue è stata recuperata tramite il connettore GitHub perché `gh` non raggiungeva l’API.

## Rilievo bloccante

### 1. Un cambio d’account durante la verifica può cambiare la password dell’account sbagliato

**Riferimenti:** Piano, righe **477–489**; Spec, righe **169–181**.

Il metodo legge inizialmente l’email del dispositivo, verifica quella password con il client temporaneo e poi chiama `auth.updateUser()` sul client condiviso. Tra questi passaggi non vincola l’operazione all’identità e alla sessione iniziali.

Se un’altra scheda passa dall’account A all’account B mentre la verifica è in corso, `updateUser()` legge la sessione corrente di B. Con «Require current password» disattivato, il server ignora la password attuale di A e può cambiare quella di B.

**Verifica:** eseguendo in memoria il metodo estratto dal piano, con supabase-js **2.117.3 reale** e risposte HTTP simulate, ho ottenuto:

```text
password verified for: a@example.test
planned method result: { ok: true }
authorization: Bearer token-b
password: new-password-a
current_password: password-a
```

Il sorgente dell’SDK conferma che `_updateUser()` recupera la sessione al momento della chiamata (`GoTrueClient.ts`, righe 3429–3461). Il server verifica `current_password` soltanto con l’impostazione abilitata. [Sorgente Auth v2.197.0](https://github.com/supabase/auth/blob/v2.197.0/internal/api/user.go#L154-L170).

**Correzione proposta:** vincolare verifica, richiesta di cambio e aggiornamento locale alla stessa identità/sessione, gestendo esplicitamente uscita e cambio d’account durante l’operazione. Un controllo iniziale dell’email non basta. Scrivere prima test con verifica sospesa, cambio A→B e logout: nessuna modifica deve raggiungere B e nessuna risposta tardiva deve ripristinare A. È anche un requisito della specifica principale, sezione 1, sulla chiusura della sessione e sulle operazioni in volo.

## Rilievi importanti

### 2. Il doppio fallimento lascia una sessione temporanea attiva e ne perde le credenziali

**Riferimenti:** Spec, righe **178–180, 265, 292**; Piano, righe **285–288, 483–489**.

La pulizia fallita viene ignorata contando sulla revoca implicita del cambio successivo. Se anche `updateUser()` fallisce — per password debole, invariata, sessione revocata o rete — quella revoca non avviene.

Inoltre, supabase-js 2.117.3 cancella la propria sessione locale anche quando il logout restituisce un errore di rete/server: `_signOut()`, righe **4095–4109**. Richiamare semplicemente `check.signOut()` dopo il fallimento può quindi non inviare più alcuna revoca.

**Verifica:** con client reale, logout simulato a HTTP 503 e aggiornamento rifiutato, il metodo restituisce l’errore dell’aggiornamento; la sessione simulata sul server rimane attiva, mentre `check.getSession()` restituisce `null`.

**Correzione proposta:** definire una gestione esplicita della revoca fallita, conservando quanto serve per ritentarla senza coinvolgere la sessione del dispositivo. Aggiungere test del doppio fallimento e dell’effettiva richiesta di revoca successiva. Se la garanzia assoluta «nessuna sessione residua» non è realizzabile durante un’interruzione di rete, il limite e il recupero devono essere concordati e descritti: il piano attuale promette una proprietà che non assicura.

### 3. Il client temporaneo lascia ascoltatori globali dopo ogni tentativo

**Riferimenti:** Piano, righe **425–440, 482–489**; Spec, righe **171–175, 267–270**.

`persistSession: false` impedisce il `BroadcastChannel`, ma non elimina il ciclo di vita del client. `autoRefreshToken: false` non impedisce ad Auth di registrare `visibilitychange`. Inoltre, `createClient()` costruisce anche Realtime/Phoenix, che registra propri ascoltatori sul browser.

Il piano restituisce soltanto `.auth`, non prevede smaltimento e non lo esegue neppure quando la password attuale è errata.

**Verifica:** nella prova con i pacchetti installati restano **due ascoltatori `visibilitychange`** dopo `signOut()`: uno di Auth e uno di Phoenix. Chiamando `auth.dispose()` ne rimane uno. Riferimenti nel sorgente installato:

- `@supabase/auth-js/src/GoTrueClient.ts`: **5609–5630**;
- `@supabase/phoenix/priv/static/phoenix.cjs.js`: **1243–1265**.

**Correzione proposta:** usare per la verifica un client limitato ad Auth, già esportato dal pacchetto installato, con smaltimento esplicito in `finally`, oppure definire un ciclo di vita equivalente che non accumuli istanze. Estendere i test a tentativi ripetuti, esiti negativi, ascoltatori e attività dopo il completamento; il solo controllo del `BroadcastChannel` non copre questo problema.

### 4. Il funzionamento senza email richiede una precondizione di produzione non ancora verificata

**Riferimenti:** Spec, righe **51–53, 64–68, 235–249**.

«Funziona con qualunque impostazione del progetto» è falso. Con «Secure password change» attivo e sessione del dispositivo più vecchia di 24 ore, il server richiede un nonce. L’accesso del client temporaneo crea una sessione diversa: non ringiovanisce quella usata da `updateUser()`.

Il sorgente controlla `session.CreatedAt` della richiesta di aggiornamento e restituisce `reauthentication_needed` senza nonce. [Auth v2.197.0, `user.go`](https://github.com/supabase/auth/blob/v2.197.0/internal/api/user.go#L138-L149).

I valori di produzione sono dichiarati «da verificare», ma lasciare questa opzione disattivata compare soltanto nel passo facoltativo.

**Correzione proposta:** rendere la verifica di `secure_password_change = false` una precondizione esplicita del rilascio senza email, separata dalle proposte facoltative su minimo e password attuale. Se risulta attiva, applicare il passaggio al coordinatore previsto dal brief, senza modificarla autonomamente. Aggiungere una prova con sessione più vecchia di 24 ore; tutte le prove proposte usano sessioni appena create.

### 5. La fixture dello stack crea una sessione in più e fa fallire il conteggio previsto

**Riferimenti:** Piano, righe **965–980, 1021–1026**.

`person()` usa `signUp()` e abbandona il client senza chiudere la sessione restituita. Nel locale `enable_confirmations = false`: la registrazione autentica immediatamente l’utente. `device()` crea poi un secondo accesso.

Il test «leaves no check session behind when the change itself fails» si aspetta **una** sessione già prima del cambio, ma ne esistono **due**. `persistSession: false` riguarda la persistenza nel browser, non la creazione della sessione server. Questo comportamento è confermato da Context7 e dal [sorgente di signup](https://github.com/supabase/auth/blob/v2.197.0/internal/api/signup.go#L288-L314).

Anche `canSignIn()` crea accessi che non chiude.

**Correzione proposta:** chiudere esplicitamente gli accessi delle fixture, oppure riutilizzare la sessione della registrazione come dispositivo. Prevedere smaltimento dei client e pulizia finale degli utenti di prova. Per verificare le sessioni residue, confrontare preferibilmente gli identificatori attesi, oltre al conteggio.

### 6. I test della pagina non trovano i campi generati dal componente proposto

**Riferimenti:** Piano, righe **636–640, 647–649, 695–698, 831–849**.

Il componente mette etichetta, suggerimento ed errore dentro lo stesso `<label>`. Il testo cercato da `findByLabelText('Nuova password')` comprende quindi anche «Almeno 8 caratteri.». Dopo un errore, cambia anche il testo dell’etichetta della password attuale.

**Verifica:** con jsdom e Testing Library installati, sul markup proposto:

```text
queryByLabelText('Nuova password') → null
queryByLabelText('Nuova passwordAlmeno 8 caratteri.') → input
```

I test non arrivano dunque a verificare il comportamento previsto, anche implementando esattamente il componente del piano.

**Correzione proposta:** associare un’etichetta stabile tramite `htmlFor`/`id` e tenere suggerimenti ed errori fuori dal `<label>`, collegati con `aria-describedby`. Verificare i nomi accessibili sia prima sia dopo gli errori.

### 7. Manca la prova automatizzata della SPA collegata allo stack reale

**Riferimenti:** Spec, righe **254–295**; Piano, righe **624–733, 945–1028, 1167–1176**.

La copertura è divisa tra:

- componente con `stubBackend`;
- backend reale senza componente;
- prova manuale nel browser.

Nessun test automatico attraversa modulo, backend reale, eventi di Auth e navigazione dell’app sullo stack locale. La prova manuale non comprende neppure la sessione revocata né il rifiuto server di una password debole. Rimane quindi scoperto il requisito del brief relativo alla SPA sullo stack locale.

In particolare, ricevere `session_expired` dal metodo non dimostra che la pagina raggiunga il login: `_updateUser()` restituisce l’errore senza necessariamente emettere `SIGNED_OUT`.

**Correzione proposta:** aggiungere una suite che monti la SPA con il backend reale, oppure una prova browser automatizzata, per successo, password attuale errata, rifiuto server e sessione revocata. Verificare anche permanenza dell’identità, dati locali e percorso concreto per rientrare.

**CI:** il collegamento degli script è corretto sulla carta: il Task 5 estende uno script già eseguito da `.github/workflows/ci.yml:32`; il Task 4 aggiunge lo step della password prima dei test distruttivi. Questo eseguirà le prove backend/OAuth, ma non supplisce alla prova SPA mancante.

### 8. Un errore di rete nel recupero della sessione viene dichiarato «sessione scaduta»

**Riferimenti:** Piano, righe **477–480**; Spec, righe **198–200**.

Il metodo ignora `error` restituito da `auth.getSession()`. Se l’access token è scaduto e il rinnovo non riesce per rete, l’SDK può restituire sessione `null` e `AuthRetryableFetchError`, conservando la sessione nell’archivio. Il piano traduce invece questo caso in `session_expired`.

Il backend esistente distingue già questa condizione in `web/src/auth/supabaseBackend.ts:51–56`.

**Verifica:** eseguendo il metodo del piano con quella risposta di `getSession()`, l’esito è `{ ok: false, reason: 'session_expired' }`.

**Correzione proposta:** classificare l’errore prima di interpretare l’assenza della sessione. Aggiungere test per rinnovo impossibile per rete e rinnovo definitivamente rifiutato, verificando che soltanto il secondo richieda un nuovo accesso.

## Rilievo minore

### 9. `pwned` viene tradotto con una causa falsa

**Riferimenti:** Spec, righe **195–205**; Piano, righe **255, 451, 581, 609**.

Una password presente negli elenchi di credenziali compromesse diventa «troppo corta». Il testo non suggerisce semplicemente di sceglierne un’altra, come sostiene la spec: attribuisce al rifiuto una causa sbagliata.

Il piano gratuito limita oggi la rilevanza del caso, ma il piano implementa e testa esplicitamente questa mappatura errata.

**Correzione proposta:** introdurre un esito generico «password debole» oppure un messaggio specifico per `pwned`, riservando `weak_length` al motivo `length`. I motivi sono distinti nel [sorgente della validazione](https://github.com/supabase/auth/blob/v2.197.0/internal/api/password.go#L36-L67).

## Affermazioni verificate e aspetti coerenti

- `current_password` è presente nei tipi installati di supabase-js **2.117.3**; Context7 conferma il supporto dalla 2.102.0.
- Il controllo server della password attuale dipende effettivamente da «Require current password». È distinto dalla riautenticazione con nonce.
- La configurazione della CLI **2.120.0** associa `secure_password_change` a `SecurityUpdatePasswordRequireReauthentication`; nel relativo schema non compare un’opzione per richiedere la password attuale. [Sorgente della configurazione CLI](https://github.com/supabase/cli/blob/v2.120.0/apps/cli-go/pkg/config/auth.go).
- Il cambio conserva la sessione chiamante e cancella tutte le altre senza escludere quelle OAuth. Il test proposto sugli agenti controlla opportunamente access token sui tre trasporti e refresh token. [Aggiornamento password](https://github.com/supabase/auth/blob/v2.197.0/internal/models/user.go#L407-L434), [cancellazione delle sessioni](https://github.com/supabase/auth/blob/v2.197.0/internal/models/sessions.go#L340-L342).
- Il limite di **72 byte UTF-8** è corretto. Precisazione: nella versione esaminata il superamento produce HTTP 400 `validation_failed`, non un errore server indifferenziato. [Validazione della password](https://github.com/supabase/auth/blob/v2.197.0/internal/api/password.go#L25-L34).
- `persistSession: false` impedisce la creazione del `BroadcastChannel`; quando presente, il canale prende il nome dalla `storageKey`. La chiave separata è coerente, ma non risolve il ciclo di vita descritto nel rilievo 3.
- Il perimetro SPA → Supabase Auth rispetta l’assenza di nuove operazioni Worker e migrazioni applicative. Struttura della pagina, dizionari bilingui e componenti riutilizzati seguono le convenzioni del Profilo.
- La permanenza dell’accesso email/password segue la decisione nell’issue #37 e nel brief. La differenza rispetto alla sezione 7 del checkout è già spiegata dalla PR #40: non è un nuovo conflitto introdotto da W7.
- I Task 1–3 prevedono test prima dell’implementazione. La struttura è utilizzabile, dopo la correzione dei difetti e l’aggiunta dei casi mancanti.

## Punti riservati al coordinatore

1. Confermare la configurazione effettiva di produzione necessaria al funzionamento senza email.
2. Concordare la garanzia e il recupero quando una sessione temporanea non può essere revocata per problemi di rete, oppure rivedere l’approccio per evitarne la creazione.
3. Mantenere separata la proposta facoltativa di attivare «Require current password», aggiornando poi le sezioni pertinenti della specifica principale secondo il protocollo.

## Limiti della verifica

Nessun file modificato; checkout pulito anche al termine. Ho eseguito prove isolate in memoria con i pacchetti installati, senza chiamate alla produzione. Non ho eseguito le suite proposte sullo stack: al commit esaminato sono ancora codice nel documento. Non attribuisco quindi a questa revisione un esito positivo di CI, build o integrazione.

**Verdetto: DA CORREGGERE.**