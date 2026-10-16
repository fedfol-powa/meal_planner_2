# Quarta revisione W11 — Spec e piano della gestione della famiglia

Branch `ondata3/gestione-famiglia`, commit `928cdb8a83bc2e5f90a7b4ce560c8f470ddc834d`.

Revisione limitata ai quattro rilievi della terza revisione e alle modifiche del diff `b0a0f2d..928cdb8`, secondo le indicazioni del coordinatore. Restano due rilievi importanti; nessun bloccante.

Riferimenti abbreviati:

- **S**: `progetto/superpowers/specs/2026-10-16-gestione-famiglia.md`.
- **P**: `progetto/superpowers/plans/2026-10-16-gestione-famiglia.md`.

## Rilievi importanti

### 1. `dataUpdatedAt` non impedisce che una risposta tardiva conservi dati precedenti alla revoca

**Riferimenti:** [S:923–937](/Users/fedfol/Projects/meal_planner_2/.worktrees/famiglia/progetto/superpowers/specs/2026-10-16-gestione-famiglia.md:923), [P:552–555](/Users/fedfol/Projects/meal_planner_2/.worktrees/famiglia/progetto/superpowers/plans/2026-10-16-gestione-famiglia.md:552). Riscontro nel percorso esistente: [web/src/api/queries.ts:17–21](/Users/fedfol/Projects/meal_planner_2/.worktrees/famiglia/web/src/api/queries.ts:17).

Il record persistito `{ revokedAt, restoredAt }` con fusione atomica chiude il problema della riscrittura del vecchio segno. Il nuovo filtro della cache, invece, considera `dataUpdatedAt` come prova che una vista sia successiva alla revoca. Quel campo registra il momento del successo della query, anche quando una risposta «invariato» restituisce la copia già presente.

Sequenza ammessa:

1. B conserva una vista della famiglia e avvia una rilettura prima di `t1`.
2. A revoca la famiglia a `t1`; B non ha ancora ricevuto il messaggio.
3. La risposta «invariato», prodotta prima della revoca, arriva a B dopo `t1`. `readThrough` restituisce la vecchia vista, ma `dataUpdatedAt` diventa successivo a `t1`.
4. A rientra con una richiesta iniziata a `t2 > t1`.
5. B riceve prima `restored(t2)` e poi `revoked(t1)`.

La famiglia resta accessibile e il filtro `dataUpdatedAt <= revokedAt` **non elimina la vecchia vista**, che può essere ripersistita e ripristinata. Inoltre, la rilettura descritta alle righe 933–935 dipende dal passaggio da revocata ad accessibile: in B quel passaggio non avviene.

**Verifica:** riproduzione eseguita con TanStack Query installato: la stessa vista salvata a `1000`, dopo una risposta invariata tardiva, ha `dataUpdatedAt = 2500`; con `revokedAt = 2000` e `restoredAt = 3000` supera entrambi i filtri. La semantica del timestamp è confermata dalla [documentazione di TanStack Query](https://github.com/TanStack/query/blob/main/docs/framework/angular/reference/interfaces/QueryState.md), consultata tramite Context7.

**Correzione proposta:** non usare il solo momento di aggiornamento della cache come prova di freschezza rispetto alla revoca. Definire la gestione delle risposte iniziate prima della revoca, anche quando arrivano dopo, e impedire che ripersistano dati superati. La pulizia di una revoca ritardata deve comportare la rilettura quando l’accesso risulta ripristinato, anche senza una transizione locale dello stato. Aggiungere il test sopra, verificando anche il successivo ripristino della cache.

### 2. Il test L1/L2 mantiene una sequenza resa impossibile dal lucchetto per email

**Riferimenti:** [S:1140–1147](/Users/fedfol/Projects/meal_planner_2/.worktrees/famiglia/progetto/superpowers/specs/2026-10-16-gestione-famiglia.md:1140), richiamato da [P:317–319](/Users/fedfol/Projects/meal_planner_2/.worktrees/famiglia/progetto/superpowers/plans/2026-10-16-gestione-famiglia.md:317).

Il test prescrive prima `claim` su L1 sospeso dopo l’inserimento, poi la prenotazione confermata su L2 per la stessa email E e la creazione di U2.

Con la correzione, L1 mantiene `registration_email:E` fino al commit: il `claim` di L2 resta quindi in attesa e non può confermare. Il test non raggiunge la cancellazione concorrente che dovrebbe verificare. Neppure preparare anticipatamente **sia** L2 **sia** l’account U2 risolve: in quel caso il nuovo `claim` su L1 trova già l’account e restituisce `account_exists`.

**Correzione proposta:** prescrivere questo ordine eseguibile:

1. Prenotare E su L2 e confermare, senza creare ancora U2 in Auth.
2. Avviare `claim` su L1 e sospenderlo dopo l’inserimento.
3. Creare U2 in Auth usando la prenotazione già confermata su L2.
4. Avviare `begin_account_deletion(U2)` e accertarne l’attesa sul lucchetto dell’email.
5. Rilasciare L1 e verificare anonimizzazione di entrambe le prenotazioni e conteggi invariati.

Il meccanismo di sincronizzazione descritto è corretto; resta da correggere la prova che deve dimostrarlo.

## Esito dei quattro rilievi precedenti

| Rilievo della terza revisione | Esito |
|---|---|
| **1 — Pulizia delle prenotazioni concorrenti** | **Chiuso nel protocollo**, con lucchetto per email nell’ordine completo, in `claim`, nella cancellazione e nell’interfaccia condivisa. Resta il test non eseguibile del rilievo 2 sopra. |
| **2 — Stessa email alla decima quota** | **Chiuso nella progettazione.** La seconda richiesta attende sull’email e recupera la prenotazione prima dei controlli di account, validità e quota. Test dedicato previsto. S:297–321, 1131–1139; P:315–317. |
| **3 — Persistenza e pulizia fra schede** | **Parzialmente chiuso.** Corretti persistenza dei due istanti, fusione atomica e separazione della pulizia dall’accesso. Resta la finestra delle risposte tardive descritta sopra. |
| **4 — Contratti `family` e `account` cancellati** | **Chiuso.** Ripristinati operazioni, schemi, errori, `connectedAgents` e regole MCP dalla versione `62f8022`, mantenendo le successive precisazioni sui ritentativi. I rimandi pertinenti del piano trovano nuovamente le definizioni. S:573–645; P:284–294, 343–350, 388–395. |

## Punti per il coordinatore

Non servono nuove decisioni di prodotto. Le correzioni riguardano il protocollo della cache e l’ordine della prova di concorrenza.

## Verifiche e limiti

Revisione documentale e confronto con il codice esistente; documentazione PostgreSQL e TanStack Query consultata tramite Context7. Eseguita la riproduzione isolata del problema del timestamp, senza creare file.

Non eseguiti suite complete, typecheck o build: l’oggetto è spec e piano, non l’implementazione di C. `git diff --check b0a0f2d..928cdb8` senza segnalazioni; checkout pulito. Nessun file modificato.

**Verdetto: DA CORREGGERE.**