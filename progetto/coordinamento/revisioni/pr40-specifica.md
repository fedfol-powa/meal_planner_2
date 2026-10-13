**Rapporto di revisione — PR #40**

Esaminato il diff `origin/main...HEAD` sul branch `traguardo/specifica-produzione`, commit `599f6e9`, rispetto a `origin/main` (`44805f7`). La PR modifica esclusivamente i tre documenti indicati. Consultati anche il piano generale nel checkout principale, `server/README.md`, il runbook e la documentazione Supabase tramite Context7.

**Rilievi importanti**

1. **Il piano generale conserva il link via email come modalità futura di accesso.**

   **File:** [2026-10-11-piano-generale.md:140](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-ae931f00f37f12d9c/progetto/superpowers/plans/2026-10-11-piano-generale.md:140).

   Fra le «Interfacce decise» resta: «link via email e Google nell'ondata 3». Inoltre, a riga 64, Google compare senza la condizione della prova sull'iPhone e manca il recupero della password. La nuova voce di registro a riga 237 riporta correttamente le decisioni, ma lascia contraddittorie le istruzioni operative dello stesso documento. Il riferimento obsoleto è presente anche nel checkout principale.

   **Perché conta:** chi pianifica l'ondata 3 può ancora ricavare dal piano l'obbligo di implementare l'accesso tramite link e Google senza verifiche preliminari.

   **Correzione:** aggiornare «Login» e il perimetro dell'ondata 3: email e password permanenti; link solo per scelta e recupero della password; Google facoltativo dopo entrambe le verifiche concordate.

2. **La chiusura dell'impronta di avvio è collocata dopo il collaudo completo, invece che al suo inizio.**

   **File:** [specifica principale:2056](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-ae931f00f37f12d9c/progetto/superpowers/specs/2026-09-29-app-famiglia-design.md:2056), richiamata anche a riga 2261.

   Il testo dice «Dopo il collaudo completo l'impronta si chiude», indicando il 13 ottobre. Il [runbook, R23:3003](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-ae931f00f37f12d9c/progetto/superpowers/plans/2026-10-11-messa-in-produzione.md:3003) prescrive invece la chiusura **all'inizio** del collaudo completo. Quest'ultimo risulta ancora in corso sia nella specifica, riga 2235, sia in [server/README.md:114](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-ae931f00f37f12d9c/server/README.md:114).

   **Perché conta:** la specifica sposta il confine operativo oltre il quale l'azzeramento non è più ammesso e rende incoerente lo stato registrato del lancio.

   **Correzione:** scrivere «All'inizio del collaudo completo» e distinguere la chiusura dell'impronta dal completamento delle prove, compresa quella del cron del 15 ottobre. Allineare anche la formulazione della sezione 10.

**Rilievi minori**

3. **La testata presenta ancora il prototipo come prossimo artefatto da costruire.**

   **File:** [specifica principale:10](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-ae931f00f37f12d9c/progetto/superpowers/specs/2026-09-29-app-famiglia-design.md:10).

   Subito dopo l'annuncio della produzione resta «Il prossimo artefatto è il prototipo completo, da costruire e approvare». Anche le righe 33–34 rimandano al futuro l'integrazione della review. La sezione 15, riga 2782, registra invece tutti i percorsi approvati entro il 7 ottobre e l'architettura verificata l'8 ottobre.

   **Perché conta:** la testata richiesta fra i criteri della revisione comunica uno stato ormai superato.

   **Correzione:** indicare il prototipo come riferimento già approvato e lo stato corrente come produzione con collaudo ancora in corso. Conservare la review del 3 ottobre come esito storico esplicitamente datato.

**Verifica delle decisioni e di Supabase Auth**

Nella specifica principale non ho trovato requisiti attivi residui di accesso tramite magic link o iscrizione libera. Risultano recepiti password permanente, invito che crea l'account, recupero nell'ondata 3, entrambe le verifiche per Google e le issue #37–#39, con #37 ad alta priorità nel traguardo A.

Le verifiche tecniche non hanno evidenziato un'incompatibilità con le decisioni:

- Gli inviti amministrativi sono compatibili con `DISABLE_SIGNUP`; la creazione amministrativa resta distinta dall'iscrizione pubblica. [Supabase Auth](https://github.com/supabase/auth/blob/master/README.md#configuration).
- Il recupero richiede una pagina applicativa per impostare la password tramite `updateUser`, in un contesto autenticato. «Solo per scegliere la password» va quindi inteso come destinazione del flusso utente, senza supporre che il link non autentichi tecnicamente il browser. I dettagli applicativi restano correttamente aperti nella sezione 15. [Password-based Auth](https://supabase.com/docs/guides/auth/passwords).
- Resend è esplicitamente supportato come SMTP personalizzato; sono corretti anche i limiti descritti per il servizio email predefinito di Supabase. [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

**Punti da decidere**

Nessuna nuova decisione di prodotto necessaria per correggere i rilievi. Restano le verifiche tecniche già previste per inviti e Google; questa review documentale non le sostituisce.

**Verifiche eseguite**

- `git diff --check origin/main...HEAD`: superato.
- `npm run typecheck`: superato.
- `npm test`: bloccato prima dell'esecuzione da `EPERM` sulla cache `node_modules/.vite-temp` del checkout principale.
- `npm --ignore-scripts run build -w web`: bloccato dal medesimo errore caricando la configurazione Vite; prebuild omesso per evitare la copia degli asset.
- Worktree pulito al termine; nessun file modificato.

**Verdetto: DA CORREGGERE.**