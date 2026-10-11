# Seconda revisione W4 — Spec e piano Spesa

**Verdetto: APPROVABILE CON CORREZIONI.**

Revisione in sola lettura della spec e del piano al commit `557f3beb`, confrontati con le decisioni del coordinatore e con W5 al commit `3d0a4cda`. Le firme pubbliche proposte sono realizzabili estendendo W5; restano tre lacune nel loro utilizzo e nel protocollo della coda.

Non sono stati modificati file né eseguiti test: questa revisione riguarda spec, piano e compatibilità con il codice esistente.

1. **Importante — Il passaggio da `pending` a `sent` deve acquisire anche l’operazione da inviare nella stessa transazione.**

   **Riferimenti:** [Piano:834](/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/progetto/superpowers/plans/2026-10-11-spesa.md:834), [Spec:237](/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/progetto/superpowers/specs/2026-10-11-spesa.md:237).

   Il giro descritto separa la rilettura del record dalla transazione che marca la testa `sent`, senza precisare che l’operazione da inviare deve provenire da quest’ultima. Il Web Lock esclude altri invii, ma non le modifiche alla coda.

   Controesempio: una scheda legge `addFreeItem(X)` ancora `pending`; un’altra elimina X, compattando aggiunta e rimozione; la prima invia l’aggiunta letta prima della compattazione. X compare sul server senza una rimozione residua da inviare. Il rilievo 3 resta quindi parzialmente aperto.

   **Correzione:** dentro un’unica `transact`, rileggere la testa effettiva, marcarla `sent` e acquisirne una copia immutabile da inviare. Se non c’è più, non inviare. Aggiungere il test con compattazione concorrente fra rilettura iniziale e acquisizione della testa.

2. **Importante — La registrazione del prefisso avviene troppo tardi per garantire la pulizia all’avvio.**

   **Riferimenti:** [Piano:840](/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/progetto/superpowers/plans/2026-10-11-spesa.md:840), [Spec:343](/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/progetto/superpowers/specs/2026-10-11-spesa.md:343), [W5 SessionScope:87](/Users/fedfol/Projects/meal_planner_2/.worktrees/web/web/src/session/SessionScope.tsx:87).

   Il piano registra `shopping-queue:` «all’avvio della coda», mentre W5 esegue `purgeOtherCopies()` quando conosce l’identità, anche dopo un’uscita confermata. Non è garantito che in quel momento sia già stata creata una coda: per esempio, all’avvio sulla pagina di login. In quel caso il prefisso non è registrato e i dati residui rimangono sul dispositivo.

   Il test previsto chiama la pulizia con il prefisso già registrato e non dimostra l’ordine reale dei provider.

   **Correzione:** registrare il prefisso durante l’inizializzazione dell’app, prima di qualsiasi `purgeOtherCopies`, indipendentemente dal montaggio della Spesa. Provare con `AuthProvider` e `SessionScope` reali sia l’avvio disconnesso sia l’avvio con B e una coda di A sul disco.

3. **Importante — Le altre schede ricevono aggiornamenti soltanto dopo una conferma del server.**

   **Riferimenti:** [Spec:285](/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/progetto/superpowers/specs/2026-10-11-spesa.md:285), [Piano:838](/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/progetto/superpowers/plans/2026-10-11-spesa.md:838), [W5 KeyValueStore:10](/Users/fedfol/Projects/meal_planner_2/.worktrees/web/web/src/api/persister.ts:10).

   Il messaggio fra schede è previsto dopo l’ack, ma non dopo aggiunte, compattazioni, scarti o chiusura degli avvisi. Lo store W5 non espone notifiche delle scritture.

   Se A accoda una modifica e l’invio fallisce, B può continuare a mostrare zero operazioni pendenti e Bring! attivo. Non arriverà alcuna conferma che la costringa a rileggere il record. Restano incompleti i rilievi 4 e 7.

   **Correzione:** notificare ogni modifica persistita del record, distinguendo «rileggi la coda» da «applica questa vista confermata». Aggiungere prove con due schede, invio fallito, compattazione e avvisi, verificando anche il blocco di Bring!.

**Punti da decidere:** nessuna nuova decisione di prodotto. Le correzioni completano le garanzie già richieste dal coordinatore.