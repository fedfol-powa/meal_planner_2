**Rapporto di revisione — PR #44**

Revisione del branch `traguardo/specifica-w7-w8`, HEAD `99bd426`, con `git diff origin/main...HEAD`. Esaminati entrambi i commit, le sezioni «Decisioni da riportare» delle specifiche W7 e W8 e il piano generale nel checkout principale. Nessun file modificato.

Il riporto conserva le decisioni principali di W7 e W8, ma perde alcune condizioni esplicite. La decisione sugli inviti senza email è presente, però non è propagata coerentemente nelle sezioni collegate.

**Rilievi importanti**

**1. Il flusso con email resta descritto come requisito generale dell’ondata 3.**

Riferimenti nella [specifica principale](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-afff511744cf9c57e/progetto/superpowers/specs/2026-09-29-app-famiglia-design.md:303):

- Parte 1, righe 303–306: la password si sceglie dal «link ricevuto per email».
- Sezione 7, righe 1702–1710: «L’invito crea l’account» richiede ancora l’invio tramite Resend, senza qualificare questo come flusso successivo alla disponibilità del dominio.
- Sezione 7, righe 1726–1734: SMTP e invio applicativo sono descritti al presente; il dominio è dichiarato già verificato.
- Sezioni 4 e 8, righe 1377–1378 e 2137–2138: gli allarmi via email arrivano nell’ondata 3 senza la condizione del dominio.
- Sezione 10, riga 2333: il riepilogo non distingue le attività disponibili subito da quelle subordinate al DNS.

Nel [piano generale](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-afff511744cf9c57e/progetto/superpowers/plans/2026-10-11-piano-generale.md:66), lo stesso problema compare alle righe 66–68 e nell’interfaccia «Login», riga 163.

**Perché conta:** chi implementa A trova due descrizioni operative: scelta della password nella pagina dell’invito oppure creazione dell’account seguita dall’email. La nuova eccezione nelle righe 1711–1722 non elimina le istruzioni incompatibili presenti altrove.

**Correzione proposta:** distinguere ovunque «prima della verifica del dominio» e «dopo l’attività D». Presentare il flusso senza email come quello da implementare in A; subordinare esplicitamente inviti via email, recupero e allarmi alla disponibilità del dominio. Conservare le decisioni precedenti come cronologia nel registro, senza lasciarle attive come requisiti incondizionati.

**2. Il trasferimento dell’app sul dominio personalizzato risulta ancora previsto.**

Riferimenti nella [specifica principale](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-afff511744cf9c57e/progetto/superpowers/specs/2026-09-29-app-famiglia-design.md:630):

- Sezione 1, righe 630–632: «Al passaggio al dominio `cosasimangia.qunidi.it` (ondata 3)» si aggiornano *Site URL* e *Redirect URLs*.
- Sezione 7, riga 1734: il dominio di invio è «lo stesso dell’app».
- Intestazione, righe 119–121: resta la precedente decisione sull’app servita dal dominio personalizzato, senza indicazione che questo punto è stato superato.

Questi passaggi contrastano con le righe 261–263 e 1722: l’app resta su `workers.dev`.

**Perché conta:** l’attività D potrebbe essere interpretata come migrazione anche dell’origine web e delle configurazioni OAuth, mentre la decisione autorizza l’attivazione delle email mantenendo l’indirizzo dell’app.

**Correzione proposta:** separare dominio di invio e origine dell’app. Togliere il trasferimento dall’ondata 3 e mantenere *Site URL* e redirect sull’origine effettiva. Un eventuale futuro trasferimento richiederà una decisione distinta.

**Rilievi minori**

**3. W7: omessi il limite della revoca della sessione di prova e l’uscita tramite pulsante.**

Riferimento: [specifica principale, righe 877–882](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-afff511744cf9c57e/progetto/superpowers/specs/2026-09-29-app-famiglia-design.md:877).

Il testo dice che l’accesso di prova viene revocato e che `session_expired` porta all’uscita comune. Le [decisioni W7, righe 471–478](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-afff511744cf9c57e/progetto/superpowers/specs/2026-10-13-cambio-password.md:471) richiedono anche:

- un secondo tentativo di revoca e il limite accettato quando entrambi falliscono per assenza di rete;
- uscita comune tramite un pulsante.

**Perché conta:** la sintesi trasforma una revoca tentata in una garanzia e non conserva la distinzione fra messaggio di sessione scaduta e uscita automatica.

**Correzione proposta:** riportare il ritentativo, la possibile permanenza della sessione di prova sul server e il pulsante «Accedi di nuovo».

**4. W8: omessi il recupero della registrazione e la procedura di rollback ad A₀.**

Riferimento: [specifica principale, righe 894–909](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-afff511744cf9c57e/progetto/superpowers/specs/2026-09-29-app-famiglia-design.md:894).

Rispetto alle [decisioni W8, righe 479–493](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-afff511744cf9c57e/progetto/superpowers/specs/2026-10-13-aggiornamento-pwa.md:479), mancano:

- recupero della registrazione quando il primo tentativo fallisce;
- necessità di chiudere tutte le finestre per tornare alla versione A₀, precedente al nuovo meccanismo.

**Perché conta:** sono condizioni operative esplicitamente destinate alla specifica principale. Il solo richiamo a `registration.update()` non copre la registrazione fallita; limitare il rollback automatico non descrive come effettuare quello escluso.

**Correzione proposta:** aggiungere entrambe le condizioni. È invece corretto aver riportato l’esito reale del primo rilascio sull’iPhone e mantenuto aperta la verifica del passaggio automatico.

**5. La nuova tabella A–E non assegna tutte le funzionalità già previste nell’ondata 3.**

Riferimento: [piano generale, righe 83–87](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-afff511744cf9c57e/progetto/superpowers/plans/2026-10-11-piano-generale.md:83).

La sezione 10 della specifica, riga 2333, comprende anche PDF della spesa e archiviazione, versioni e ripristino della singola ricetta nell’app. Nessuna riga della nuova tabella li menziona. Anche le email operative di job ed esportazione non sono esplicite in D.

**Perché conta:** «Resto dell’ondata» suggerisce una copertura completa, ma l’elenco può far perdere attività già concordate.

**Correzione proposta:** assegnare esplicitamente queste funzionalità alle attività appropriate oppure dichiarare che l’elenco di E è esemplificativo, con rinvio al perimetro completo della sezione 10.

**6. L’intestazione del piano generale è rimasta allo stato dell’11 ottobre.**

Riferimento: [piano generale, righe 4–9](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-afff511744cf9c57e/progetto/superpowers/plans/2026-10-11-piano-generale.md:4).

Riporta ancora «Ultimo aggiornamento: 11 ottobre», «ondata 1 avviata» e la sezione 10 della specifica «da riscrivere a fine ondata 1».

**Perché conta:** lo stato iniziale contraddice il registro e la nuova pianificazione dell’ondata 3.

**Correzione proposta:** aggiornare data e stato, eliminando l’istruzione ormai eseguita sulla sezione 10.

**Verifiche tecniche**

- **Account già confermato con iscrizioni spente:** soluzione tecnicamente valida. L’API amministrativa accetta password ed `email_confirm: true` e deve essere chiamata dal server. Nel sorgente Auth v2.197.0 la creazione amministrativa non applica il controllo `DisableSignup` del percorso pubblico e conferma direttamente l’utente senza inviare l’email. Fonti consultate dopo Context7: [API `createUser`](https://supabase.com/docs/reference/javascript/auth-admin-createuser), [creazione amministrativa](https://github.com/supabase/auth/blob/v2.197.0/internal/api/admin.go), [iscrizione pubblica](https://github.com/supabase/auth/blob/v2.197.0/internal/api/signup.go). È una verifica documentale e del sorgente, non una prova sul progetto di produzione.
- **Cambio password:** Context7 conferma la distinzione fra richiesta della password attuale e riautenticazione per sessioni oltre le 24 ore, oltre alla cancellazione delle altre sessioni. Non emerge una contraddizione tecnica nel riporto. [Sorgente Auth](https://github.com/supabase/auth/blob/master/internal/api/user.go).
- **Service worker:** `skipWaiting()` può attivare il nuovo worker e sostituire quello delle pagine già controllate anche senza `clients.claim()`. La descrizione del meccanismo è coerente con la documentazione consultata tramite Context7. [Ciclo di aggiornamento MDN](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers). La formula «impossibili per costruzione … pagine bianche» andrebbe comunque circoscritta al mescolamento dei file fra rilasci: non costituisce una garanzia generale contro qualsiasi errore dell’app.

**Punti da definire nel piano di A o dal coordinatore**

- Creare l’utente tramite API amministrativa non crea automaticamente una sessione nel browser: il piano deve rendere concreto «entra subito», includendo accesso e gestione dei fallimenti dopo la creazione.
- La scheda successiva alla prima generazione prevede «Invita la famiglia» (specifica, righe 1792–1793), ma gli inviti familiari arrivano in C: va definito cosa mostra A nel frattempo.
- Va chiarito se E possa procedere mentre D resta bloccata dal DNS.
- La regola senza email per gli inviti familiari è già dichiarata aperta: non è una decisione persa da questa PR.

**Controlli eseguiti**

- `git diff --check origin/main...HEAD`: superato.
- `npm run typecheck`: superato.
- Test e build: tentati, ma bloccati prima dell’esecuzione utile da `EPERM` sulla directory condivisa `node_modules/.vite-temp`. Nessun esito positivo attribuito.
- Worktree pulito al termine; nessuna modifica o commento su GitHub.

**Verdetto: DA CORREGGERE.**