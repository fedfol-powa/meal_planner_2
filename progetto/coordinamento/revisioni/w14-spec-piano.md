**Revisione W14 — specifica e piano delle istruzioni per gli agenti**

**Verdetto: DA CORREGGERE**

Revisione del branch `docs/istruzioni-agenti`, commit `a439b916a9ff8405248c5513364a8128da3c6c58`, in sola lettura.

La struttura proposta è sensata: base comune in `AGENTS.md`, import esplicito da `CLAUDE.md`, procedure del coordinatore caricate tramite skill e protocollo distinto per i worker. Brevità, motivazioni delle regole ed eliminazione della cronologia dai file di istruzioni sono coerenti con le [best practice di Claude Code](https://code.claude.com/docs/en/best-practices) e con le indicazioni sul [contesto delle istruzioni](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices).

Non sono emersi cambiamenti involontari alle decisioni di prodotto. Prima dell’implementazione vanno però risolti i seguenti rilievi.

**1. Importante — Il riconoscimento dei ruoli e l’ambiente di verifica non coincidono**

**Riferimenti:** [spec, riga 95](/Users/fedfol/Projects/meal_planner_2/.worktrees/istruzioni/progetto/superpowers/specs/2026-10-17-istruzioni-agenti.md:95); [piano, riga 145](/Users/fedfol/Projects/meal_planner_2/.worktrees/istruzioni/progetto/superpowers/plans/2026-10-17-istruzioni-agenti.md:145).

La spec identifica il coordinatore con la sessione Claude nel checkout principale. Il piano crea invece un worktree collegato, in detached HEAD, fuori dalla directory del progetto e afferma che questo lo rende coordinatore. Spostare un worktree non lo trasforma nel checkout principale: un agente che applicasse correttamente la definizione potrebbe chiedere chiarimenti anziché superare V1–V4.

Anche V5 avvia una sessione nuova con il solo «continuiamo», mentre la definizione del worker richiede un brief e la procedura vigente dopo `/clear` prevede un messaggio che identifica brief, fase, spec e piano. Inoltre manca una precedenza esplicita fra delega ricevuta e posizione nel filesystem, necessaria per distinguere un sottoagente dal coordinatore quando condividono la directory.

**Perché conta:** il riconoscimento autonomo del ruolo è uno degli obiettivi centrali di W14; queste prove possono penalizzare un comportamento corretto o approvare una classificazione sbagliata.

**Correzione proposta:** definire una precedenza unica: incarico esplicito di revisione, brief del worker o delega del sottoagente; solo in loro assenza, riconoscimento del coordinatore dal checkout principale. Adeguare le prove a questa regola. Per V5 usare il messaggio di ripresa reale; verificare separatamente che un worktree senza incarico chieda chiarimenti. La simulazione del coordinatore deve dichiarare come riproduce il checkout principale, senza dedurlo dall’assenza di `.worktrees/` nel percorso.

**2. Importante — Le verifiche possono passare senza dimostrare l’efficacia delle nuove istruzioni**

**Riferimenti:** [piano, riga 58](/Users/fedfol/Projects/meal_planner_2/.worktrees/istruzioni/progetto/superpowers/plans/2026-10-17-istruzioni-agenti.md:58); [piano, riga 147](/Users/fedfol/Projects/meal_planner_2/.worktrees/istruzioni/progetto/superpowers/plans/2026-10-17-istruzioni-agenti.md:147); [spec, riga 211](/Users/fedfol/Projects/meal_planner_2/.worktrees/istruzioni/progetto/superpowers/specs/2026-10-17-istruzioni-agenti.md:211).

Le prove hanno quattro debolezze:

- La memoria personale viene ripulita soltanto dopo il merge. Una sessione nuova può quindi rispondere usando le vecchie regole: la memoria automatica è condivisa fra i worktree dello stesso repository, come documentato da [Anthropic](https://code.claude.com/docs/en/memory). Anche il controllo iniziale «atteso: non lo sa» non isola l’effetto dell’import.
- Le risposte testuali non dimostrano quali file siano stati caricati né che la skill sia stata invocata. V6 accetta inoltre «una copia, oppure lo segnalo nella PR», senza stabilire quando una duplicazione sia accettabile.
- In V3 la modalità `plan` impedisce già le modifiche: l’assenza di modifiche da sola non prova il rispetto del confine del coordinatore. Occorre verificare la delega proposta e gli eventuali tentativi di usare strumenti di scrittura.
- Dopo due giri il piano consente di annotare una risposta ancora sbagliata e procedere alla PR, senza distinguere una limitazione della prova da una violazione di un requisito centrale.

**Perché conta:** si rischia di dichiarare risolto il problema delle regole da ripetere senza aver verificato che le nuove istruzioni siano sufficienti.

**Correzione proposta:** eseguire almeno una serie con memoria automatica disabilitata, senza modificare la memoria reale; registrare versione del client, directory, prompt, file caricati e invocazioni rilevanti. Usare `/context` per il caricamento, come raccomandato dalle [best practice](https://code.claude.com/docs/en/best-practices), e una traccia degli strumenti per l’attivazione della skill. Mantenere la protezione dalle scritture, ma valutare il comportamento richiesto, non soltanto l’assenza di effetti. I fallimenti su ruolo, delega, autorizzazioni e ripresa devono restare rilievi aperti, non diventare prove superate dopo due tentativi.

**3. Importante — La conservazione delle regole non garantisce che arrivino al ruolo interessato**

**Riferimenti:** [spec, riga 87](/Users/fedfol/Projects/meal_planner_2/.worktrees/istruzioni/progetto/superpowers/specs/2026-10-17-istruzioni-agenti.md:87); [piano, riga 117](/Users/fedfol/Projects/meal_planner_2/.worktrees/istruzioni/progetto/superpowers/plans/2026-10-17-istruzioni-agenti.md:117). Regola vigente: [README del coordinamento, riga 36](/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/README.md:36).

Il README riserva al coordinatore specifica principale, `design/percorsi.md`, `AGENTS.md`, piano generale e cartella del coordinamento. La nuova struttura non assegna esplicitamente una sede comune a questa regola completa. Il controllo del piano richiede soltanto che ogni regola del README si ritrovi nella skill, in `herdr.md` **oppure** in `AGENTS.md`.

Questo non basta: una restrizione che riguarda il worker, se conservata soltanto nella skill riservata al coordinatore, non raggiunge chi deve rispettarla. Il protocollo continua a chiedere di fermarsi per file fuori proprietà, ma non enumera tutti questi file. L’eccezione concessa a W14 nel brief deve inoltre restare circoscritta a W14.

Il problema è particolarmente visibile per gli script del coordinamento: la decisione nuova assegna ogni modifica agli script a un worker, mentre la regola precedente riserva l’intera cartella al coordinatore. Serve esplicitare la delega tramite brief.

**Perché conta:** conservare il testo in qualche file non equivale a conservare il comportamento; Codex e Claude devono ricevere le restrizioni pertinenti senza dover consultare procedure di un altro ruolo.

**Correzione proposta:** aggiungere una matrice breve «regola vigente → destinazione → ruoli che la leggono → eventuale decisione che la sostituisce». Mettere la proprietà dei file nella base comune o nel protocollo, con le eccezioni esplicite dei brief. Includere nel controllo anche registro e brief, oltre a README e memorie, e verificare le condizioni operative delle regole trasferite, per esempio `/clear` soltanto a worker fermo e lavoro committato.

**4. Importante — Manca una verifica della ripresa nella configurazione finale dopo il merge**

**Riferimenti:** [spec, riga 199](/Users/fedfol/Projects/meal_planner_2/.worktrees/istruzioni/progetto/superpowers/specs/2026-10-17-istruzioni-agenti.md:199); [piano, riga 149](/Users/fedfol/Projects/meal_planner_2/.worktrees/istruzioni/progetto/superpowers/plans/2026-10-17-istruzioni-agenti.md:149); [piano, riga 165](/Users/fedfol/Projects/meal_planner_2/.worktrees/istruzioni/progetto/superpowers/plans/2026-10-17-istruzioni-agenti.md:165).

La nuova ripresa dipende dal blocco «Stato corrente», ma quel blocco sarà creato dal coordinatore soltanto dopo il merge. V1 viene eseguita prima, sul registro ancora nella vecchia forma. Anche la rimozione delle memorie avviene dopo tutte le verifiche previste.

Il rinvio delle modifiche al coordinatore è motivato e corretto; manca però il controllo conclusivo della combinazione che verrà realmente usata.

**Perché conta:** il caso che ha originato W14 — una sessione nuova che non sa riprendere il coordinamento — resta non verificato nella configurazione finale.

**Correzione proposta:** aggiungere una consegna operativa al coordinatore con ordine e criterio di chiusura: ristrutturare il registro, verificare la conservazione delle decisioni, ripulire la memoria e provare «riprendiamo» in una sessione nuova nel checkout principale. L’esito deve ricostruire lo stato attuale e attendere il via. Prima della PR si può usare una copia di prova del registro nel formato previsto, dichiarandola come simulazione.

**5. Minore — Il divieto di alcune parole è più ampio del perimetro modificabile**

**Riferimento:** [piano, riga 28](/Users/fedfol/Projects/meal_planner_2/.worktrees/istruzioni/progetto/superpowers/plans/2026-10-17-istruzioni-agenti.md:28).

Il vincolo vieta alcune parole in tutti i file letti da Codex. Codex deve però leggere anche specifica principale e piano generale, che contengono quei termini e sono esclusi dalle modifiche di W14. La spec stessa li cita per spiegare la formulazione da evitare.

**Perché conta:** il criterio letterale è impossibile da soddisfare nel perimetro assegnato e può indurre modifiche inutili alla documentazione storica.

**Correzione proposta:** limitare la regola alla formulazione dei nuovi prompt e delle istruzioni operative dei revisori, preservando obiettivi e profondità della revisione.

**Punti da decidere**

- Il coordinatore deve fissare l’ambiente delle prove e il criterio di chiusura dopo la migrazione di registro e memoria.
- Non emerge la necessità di nuove decisioni di prodotto dell’utente. Un’eventuale estensione del ruolo di coordinatore ad altri client o checkout richiederebbe invece una decisione esplicita; non va introdotta per far passare le prove.

**Verifiche svolte e limiti**

Confrontati studio, spec e piano con `AGENTS.md`, `CLAUDE.md`, README, protocollo, brief pertinenti, registro, memorie indicate e piano generale del checkout principale. Consultate le fonti ufficiali Anthropic, anche tramite Context7. Il worktree è rimasto invariato.

Le prove V1–V7 non sono state eseguite: i nuovi file di istruzioni non sono ancora implementati. Test applicativi, typecheck e build non sono pertinenti a questa revisione di specifica e piano.