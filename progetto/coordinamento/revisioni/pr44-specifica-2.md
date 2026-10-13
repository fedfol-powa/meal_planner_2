**Seconda revisione — PR #44**

Branch `traguardo/specifica-w7-w8`, HEAD `2487a3bea5f5da039d1b4a679be0122f66b3d393`. Esaminati `git diff origin/main...HEAD`, il commit correttivo con `git show 2487a3b`, la prima revisione, le specifiche W7 e W8 e il piano generale anche nel checkout principale.

Il diff modifica soltanto la specifica principale e il piano generale. **I sei rilievi della prima revisione risultano risolti; non emergono nuove incoerenze nel perimetro richiesto.**

**Rilievi per gravità**

- **Bloccanti:** nessuno.
- **Importanti:** nessuno.
- **Minori:** nessuno.

**Verifica dei rilievi precedenti**

1. **Flusso con email descritto come requisito incondizionato — risolto.**  
   La distinzione prima della verifica del dominio / dopo D è propagata nell’intestazione, nella Parte 1 e nelle sezioni 1, 4, 7, 8 e 10. La [sezione 7, riga 1731](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-afff511744cf9c57e/progetto/superpowers/specs/2026-09-29-app-famiglia-design.md:1731) distingue il flusso senza email di A da quello successivo a D. Gli allarmi del job e dell’esportazione sono subordinati al dominio, rispettivamente alle righe 1403 e 2180. Il [piano, riga 68](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-afff511744cf9c57e/progetto/superpowers/plans/2026-10-11-piano-generale.md:68) e l’interfaccia «Login», riga 172, sono coerenti.

2. **Trasferimento dell’app sul dominio personalizzato — risolto.**  
   La precedente decisione è dichiarata superata nell’intestazione. La [sezione 1, riga 643](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-afff511744cf9c57e/progetto/superpowers/specs/2026-09-29-app-famiglia-design.md:643) mantiene *Site URL* e *Redirect URLs* su `https://cosasimangia.qunidi.workers.dev` anche dopo D. Dominio di invio e origine dell’app sono distinti; il trasferimento esce dall’ondata 3 e richiede una decisione separata. Sezioni 7, 10, 15, registro e piano concordano.

3. **W7: revoca dell’accesso di prova e uscita tramite pulsante — risolto.**  
   La [specifica, riga 897](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-afff511744cf9c57e/progetto/superpowers/specs/2026-09-29-app-famiglia-design.md:897) riporta il secondo tentativo di revoca e il limite accettato quando entrambi falliscono senza rete. `session_expired` mostra il messaggio e propone «Accedi di nuovo», senza uscita automatica. Il riporto è fedele alle decisioni W7.

4. **W8: recupero della registrazione e ritorno ad A₀ — risolto.**  
   La [specifica, riga 918](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-afff511744cf9c57e/progetto/superpowers/specs/2026-09-29-app-famiglia-design.md:918) conserva il recupero della registrazione fallita; alla riga 933 precisa che tornare ad A₀ richiede la chiusura di tutte le finestre. Restano coerenti shell installata, precache verificato, protezioni della pagina occupata e `CACHE_SCHEMA`. La garanzia sulle pagine bianche è correttamente circoscritta a quelle causate dal mescolamento dei rilasci.

5. **Copertura incompleta della tabella A–E — risolto.**  
   Nel [piano, riga 93](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-afff511744cf9c57e/progetto/superpowers/plans/2026-10-11-piano-generale.md:93), D comprende le email operative. E comprende PDF della spesa e archiviazione, versioni e ripristino della singola ricetta nell’app; dichiara inoltre l’elenco esemplificativo e rinvia alla sezione 10. È esplicito che B, C ed E possono procedere mentre D resta bloccata.

6. **Intestazione obsoleta del piano — risolto.**  
   Il [piano, riga 4](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-afff511744cf9c57e/progetto/superpowers/plans/2026-10-11-piano-generale.md:4) aggiorna data e stato ed elimina l’istruzione ormai eseguita sulla riscrittura della sezione 10.

**Decisioni del coordinatore**

Entrambe risultano riportate coerentemente nella specifica, nel piano e nei registri:

- Accesso con email e password dalla pagina dell’invito dopo la creazione dell’account; in caso di fallimento, messaggio e passaggio all’accesso normale, con account esistente e invito consumato: [specifica, riga 1743](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-afff511744cf9c57e/progetto/superpowers/specs/2026-09-29-app-famiglia-design.md:1743), piano riga 90.
- Scheda dopo la prima generazione con il solo «Sistema le impostazioni» fino a C: [specifica, riga 1833](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-afff511744cf9c57e/progetto/superpowers/specs/2026-09-29-app-famiglia-design.md:1833), piano righe 98–99.

**Punti ancora aperti**

Nessuna nuova decisione necessaria per questa PR. Restano dichiarati la regola degli inviti familiari senza email, da definire in C, e le verifiche tecniche del flusso email in D. Il passaggio automatico della PWA sull’iPhone resta da collaudare al prossimo rilascio: la specifica conserva correttamente l’esito reale e l’issue #42 aperta.

**Controlli eseguiti**

- `git diff --check origin/main...HEAD`: superato.
- `npm run typecheck`: superato.
- `npm test` e `npm run build -w web`: bloccati caricando le configurazioni da `EPERM` sulla directory condivisa `node_modules/.vite-temp`; nessun esito positivo attribuito.
- Worktree Git pulito al termine; nessuna modifica ai file versionati, nessun commit o commento su GitHub.

L’approvazione riguarda la qualità dell’aggiornamento documentale, non certifica i collaudi ancora aperti.

**Verdetto: APPROVATA.**