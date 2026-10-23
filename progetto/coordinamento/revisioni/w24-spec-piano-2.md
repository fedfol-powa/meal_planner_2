# Seconda revisione W24 — spec e piano

**Verdetto: APPROVABILE CON CORREZIONI**

Revisione del commit `fc7112139513239d3e57627968dfbb855833ff0a`, branch `evolutive/avviso-menu-pronto`.

Le correzioni recepiscono le decisioni del coordinatore e la scelta dell’utente sul fondo verde chiaro. Restano tre problemi tecnici e un’incoerenza nei test da correggere prima dell’implementazione. Non occorre riprogettare la funzionalità.

Nel rapporto:

- **Spec**: `progetto/superpowers/specs/2026-10-23-avviso-menu-pronto.md`.
- **Piano**: `progetto/superpowers/plans/2026-10-23-avviso-menu-pronto.md`.

## Rilievi

### 1. Importante — Una nuova lettura durante `markWeekSeen` può ripristinare l’avviso

**Riferimenti:** Spec, righe 371–398; Piano, righe 387–403; `web/src/routes/MenuPage.tsx`, righe 84–87; `web/src/api/persister.ts`, righe 330–332.

La cancellazione delle richieste già in corso risolve solo una parte della corsa. Il piano introduce anche nuove invalidazioni di `getNewWeek` quando cambia `dataUpdatedAt` di apertura o settimana, senza coordinarle con la mutazione.

Sequenza ancora possibile:

1. La visita annulla le letture in corso e scrive ottimisticamente `null`.
2. Una lettura del menu termina e avvia una **nuova** richiesta `getNewWeek`.
3. Questa legge lo stato prima del commit di `markWeekSeen`.
4. La mutazione riesce; la risposta della lettura rimette in cache la settimana nuova.

La guardia «confermata» impedisce un’altra mutazione, ma il piano non prescrive né di filtrare quel risultato né di correggere la cache al successo. Pallino e giorni verdi possono quindi ricomparire dopo la visita.

Ho riprodotto il comportamento con una prova isolata usando il `QueryClient` installato: dopo il successo simulato sul server, la cache conteneva ancora `weekStartsOn: '2026-10-26'`. `cancelQueries` annulla le richieste in corso; non impedisce le successive. La documentazione degli aggiornamenti ottimistici prevede anche la riconciliazione al termine della mutazione. [Documentazione TanStack Query, consultata tramite Context7](https://github.com/tanstack/query/blob/main/docs/framework/react/guides/optimistic-updates.md).

**Correzione proposta:** specificare come lo stato della coppia `(familyId, weekStartsOn)` prevale sulle risposte concorrenti durante la mutazione e dopo la conferma, e come viene riconciliata la cache al successo. Aggiungere un test con lettura avviata **dopo** l’aggiornamento ottimistico, risultato acquisito prima del commit e risposta consegnata dopo. Conservare il ripristino dopo errore e la riprova alla visita successiva.

### 2. Importante — Il controllo finale non copre il cambio di giorno fra prenotazione e invio

**Riferimenti:** Spec, righe 318–348 e 357–359; Piano, righe 30–33 e 285–291; `server/src/mail/transport.ts`, righe 4 e 34–40.

Il nuovo budget persistente risolve la concorrenza sul contatore e contabilizza prudentemente gli esiti incerti. Tuttavia il controllo immediatamente precedente alla richiesta verifica soltanto le 23 ore da `first_attempt_at`.

Restano due casi:

- **Mezzanotte UTC:** una riga prenota sul giorno D, ma il controllo dell’indirizzo termina dopo mezzanotte. L’invio parte nel giorno D+1 usando la prenotazione di D; il budget nuovo può autorizzare altre 60 richieste. Il trattamento delle *riprove* dopo mezzanotte non copre questo singolo tentativo che attraversa il confine.
- **Lunedì locale:** una riga viene acquisita prima della mezzanotte della famiglia e spedita dopo. Il controllo finale sulle sole 23 ore non impedisce l’email per una settimana ormai iniziata.

Il Piano, nei vincoli generali, promette invece il ricontrollo della finestra completa anche prima della richiesta.

**Correzione proposta:** portare al controllo finale anche la scadenza locale e il giorno UTC della prenotazione. Se cambia giorno, non usare automaticamente la prenotazione precedente: definire una nuova prenotazione atomica o rinviare il tentativo, mantenendo consumata quella già fatta. Considerare un margine prudenziale vicino alla mezzanotte coerente con il timeout di 10 secondi del trasporto.

Aggiungere prove che attraversino ciascun confine **fra acquisizione e richiesta**, distinte dalle prove sulle candidate e sulle riprove del giro successivo.

### 3. Importante — Il test della scadenza durante il giro non controlla l’orologio usato dall’acquisizione

**Riferimenti:** Piano, righe 317–326; Spec, righe 320 e 333–334; `server/src/ops-alerts/index.ts`, righe 90–97; `server/src/db.ts`, righe 14–34; `server/test/ops-alerts.test.ts`, righe 49–50.

Il test prescritto avanza l’orologio con `vi.setSystemTime` e pretende che la seconda riga non venga acquisita. L’acquisizione descritta usa però `now()` di Postgres, come il codice degli allarmi preso a modello.

`vi.setSystemTime` modifica le API temporali del processo JavaScript, non l’orologio del database esterno. La transazione corrente non contiene alcun meccanismo che trasferisca quell’ora a Postgres. [Documentazione Vitest, consultata tramite Context7](https://github.com/vitest-dev/vitest/blob/main/docs/api/vi.md).

Seguendo il piano, la seconda riga può dunque essere acquisita secondo l’ora reale del database e poi scartata dal controllo JavaScript: il test fallisce oppure, indebolendone l’asserzione, verifica soltanto il controllo finale e lascia scoperto quello atomico.

**Correzione proposta:** rendere esplicito il metodo di prova. Per esempio:

- aggiornare nel database di prova `first_attempt_at` della seconda riga mentre la prima richiesta è sospesa, verificando che l’acquisizione successiva la rifiuti;
- oppure introdurre un orologio iniettabile, letto a ogni fase e passato anche ai predicati SQL.

Separare il test del controllo atomico da quello immediatamente precedente all’invio. Per le prove di mezzanotte, usare un metodo che controlli coerentemente anche il tempo delle query SQL.

### 4. Minore — Il test di riconnessione contraddice la registrazione della settimana mostrata

**Riferimenti:** Piano, righe 391–393; Spec, righe 387–390 e 400–405.

Il test apre offline il 26 ottobre, giorno della settimana nuova, poi si riconnette e pretende che il pallino torni. Alla riconnessione, però, il giorno selezionato è ancora nella settimana nuova: la regola della Spec richiede `markWeekSeen` appena sono presenti rete e settimana nuova.

Il pallino che torna può essere uno stato transitorio, ma non è l’esito finale coerente con la visita online.

**Correzione proposta:** distinguere due prove:

1. Riconnessione mentre si mostra la settimana precedente: l’avviso torna se ancora non visto.
2. Riconnessione mentre si mostra la settimana nuova: viene registrata la visita e l’avviso resta assente dopo il completamento.

Non serve una nuova decisione di prodotto.

## Verifica dei rilievi del primo giro

| Rilievo precedente | Esito |
|---|---|
| **1. Tetto giornaliero** | **Parzialmente risolto.** Prenotazione persistente atomica, rollback e consumo degli esiti incerti sono definiti. Resta il cambio di giorno durante il tentativo: rilievo 2 di questo rapporto. |
| **2. Finestra di idempotenza** | **Parzialmente risolto.** Introdotti margine di un’ora, controllo nell’acquisizione e prove di risposta persa e salvataggio fallito. Restano il controllo finale incompleto e il problema dell’orologio nei test: rilievi 2–3. |
| **3. Guardia della visita** | **Parzialmente risolto.** Chiave per famiglia e settimana, liberazione dopo errore e cancellazione delle letture precedenti sono recepite. La nuova invalidazione introduce la corsa del rilievo 1. |
| **4. Generazione pigra** | **Risolto nel disegno.** `getNewWeek` esegue `ensureWeeks`; sono previsti test concorrenti e aggiornamento dopo le letture del menu. Coerente con il lucchetto di `server/src/menu/generation.ts`, righe 80–94. |
| **5. Offline nella sessione aperta** | **Risolto nel disegno.** Visibilità e registrazione sono subordinate a `useOnline`, oltre all’esclusione dalla persistenza. Va precisato l’esito del test di riconnessione: rilievo 4. |
| **6. Seme e fusi orari** | **Risolto.** Il seme comprende tutte le settimane esistenti, senza dipendere da `current_date` (Spec, righe 146–153; Piano, righe 104–106). |
| **7. Segnale visibile del calendario** | **Scelta recepita.** Fondo `#eef5e8`, numero verde, raggio coerente e giorno selezionato scuro sono allineati fra spec, guida e prototipo. Contrasti ricalcolati: **4,86:1** testo/fondo e **1,11:1** fondo/bianco, come dichiarato. La scelta approvata non viene riaperta. |
| **8. Cache delle miniature** | **Risolto.** Cache di un giorno, limite sulle copie già scaricate ed eccezione alla precedente decisione sono espliciti (Spec, righe 305–309 e 561–565). |
| **9. W23 e W22** | **Risolto.** Ordine W23 → W24, riallineamento prima della verifica finale e intersezioni con W22 sono nel Task 11. |
| **10. Applicazione della migrazione** | **Risolto.** Applicazione locale prima di pgTAP e sequenza di aggiornamento da database precedente sono presenti (Piano, righe 110–111 e 460–469). |

Le decisioni su esclusione MCP, preferenza personale, consegne ambigue e primo rilascio sono riportate coerentemente, comprese le relative «Decisioni da riportare nella specifica».

## Punti da decidere per coordinatore o utente

**Nessuna nuova decisione di prodotto necessaria.** Le correzioni richieste completano le garanzie già scelte; non richiedono di riaprire calendario, cache, MCP, soppressione degli arretrati o preferenza per evitare doppioni.

## Verifiche svolte e limiti

Confrontati spec, piano e correzioni con specifica principale, piano generale del checkout principale, brief, guida visiva e codice attuale di server, web e migrazioni.

Eseguite una prova isolata della corsa nella cache TanStack Query e il calcolo dei contrasti. Non eseguite build, suite dell’app o migrazioni: questa è una revisione di spec e piano, non dell’implementazione W24.

Revisione in sola lettura; worktree pulito al termine. Nessun file modificato, nessuna email inviata e nessuna operazione sulla produzione.