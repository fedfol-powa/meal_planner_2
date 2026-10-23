# Terza revisione W24 — spec e piano

**Verdetto: APPROVABILE CON CORREZIONI**

Revisione del commit `9aa4ea29a091a0987f1f6ea402960c0d6e931d28`, branch `evolutive/avviso-menu-pronto`.

I quattro rilievi del secondo giro sono risolti nel disegno. Restano due problemi minori introdotti dalle correzioni, descritti sotto. Non occorre riprogettare la funzionalità.

Nel rapporto:

- **Spec**: `progetto/superpowers/specs/2026-10-23-avviso-menu-pronto.md`.
- **Piano**: `progetto/superpowers/plans/2026-10-23-avviso-menu-pronto.md`.

## Verifica dei quattro rilievi del secondo giro

| Rilievo | Esito e riscontri |
|---|---|
| **1. Lettura avviata durante `markWeekSeen` che ripristina l’avviso** | **Risolto nel disegno.** La risposta viene filtrata dopo la ricezione usando lo stato della coppia famiglia/settimana; al successo la cache viene nuovamente riconciliata a `null` (Spec, righe 411–428; Piano, righe 389–395 e 438–443). Il test riproduce espressamente una lettura partita dopo l’aggiornamento ottimistico, con risultato precedente al commit e risposta successiva (Piano, righe 420–424). Sono conservate invalidazione dopo errore e riprova alla visita successiva. |
| **2. Cambio di giorno fra prenotazione e invio** | **Risolto nel disegno.** Il controllo finale comprende le 23 ore, la mezzanotte locale del lunedì con margine di un minuto e il giorno UTC della prenotazione. Se cambia giorno UTC, l’acquisizione viene liberata e la prenotazione precedente resta consumata (Spec, righe 318–365). Il margine è coerente con il timeout di 10 secondi presente in `server/src/mail/transport.ts`, righe 4 e 36. Il Piano distingue i confini attraversati durante il controllo dell’indirizzo da quelli già raggiunti all’inizio della prenotazione (righe 337–345). |
| **3. Orologio dei test diverso da quello dell’acquisizione SQL** | **Risolto nel disegno.** L’orologio iniettabile viene letto a ogni fase e passato anche ai predicati SQL e alle scritture temporali (Spec, righe 318–323; Piano, righe 288–299 e 351–353). Il piano supera esplicitamente l’uso di `now()` del modello attuale in `server/src/ops-alerts/index.ts`, righe 90–97. Le prove del controllo atomico e del controllo finale sono separate; non si pretende più che `vi.setSystemTime` modifichi Postgres (Piano, righe 310–343). |
| **4. Esito incoerente del test di riconnessione** | **Risolto.** Sono previste due prove: riconnessione sulla settimana precedente, con avviso nuovamente visibile; riconnessione sulla settimana nuova, con registrazione della visita e avviso assente al completamento (Spec, righe 523–527; Piano, righe 427–432). È coerente con `selected` in `web/src/routes/MenuPage.tsx`, righe 106–109, e con lo stato di rete di `web/src/components/OfflineBanner.tsx`, righe 5–6. |

## Nuovi rilievi

### 1. Minore — La mappa delle visite sopravvive alla perdita e al ripristino dell’appartenenza

**Riferimenti:** Spec, righe 98–104 e 411–425; Piano, righe 389–395 e 438–443; `web/src/session/session.ts`, righe 137, 152–158 e 236–262; `supabase/migrations/20261016100000_family_management.sql`, righe 535 e 562.

La nuova mappa per `QueryClient` sopravvive allo smontaggio del Menu e prevale su tutte le risposte successive del server. Non è però previsto di cancellarne le voci quando la persona esce dalla famiglia o viene rimossa.

Il percorso attuale conserva il `QueryClient` della sessione: `session.revoke` rimuove le query della famiglia, mentre il successivo ripristino le invalida e le rilegge. Non cancella una mappa esterna. Nel database, invece, uscita e rimozione cancellano `family_members`; la cascata prevista dalla Spec cancellerà anche le visite.

Sequenza problematica:

1. La persona visita la settimana W: la mappa registra `done`.
2. Esce dalla famiglia e vi rientra nella stessa sessione.
3. Il server restituisce W come non vista, perché la visita è stata cancellata.
4. La mappa conserva `done`, filtra la risposta a `null` e impedisce una nuova registrazione.

**Perché conta:** lo stato locale diverge da quello sul server e dagli altri dispositivi fino alla ricreazione della sessione. È un effetto nuovo dello spostamento della guardia dal componente al `QueryClient`.

**Correzione proposta:** aggiungere al Task 9 l’invalidazione dello stato delle visite alla revoca della famiglia, usando il meccanismo esistente `session.onRevoke`. Proteggere anche dalle risposte di mutazioni iniziate prima della revoca, affinché non ricreino successivamente `done`. Aggiungere una prova visita → uscita/rimozione → rientro, mantenendo lo stesso `QueryClient`.

### 2. Minore — La Spec richiede di non prenotare quando la prenotazione è già avvenuta

**Riferimenti:** Spec, righe 497–501, rispetto alle righe 362–365; Piano, righe 337–345.

Il paragrafo dei test della Spec descrive confini attraversati **fra acquisizione e richiesta**, ma conclude con «ultimo minuto del giorno UTC → nessuna prenotazione».

In quel momento la prenotazione è già stata confermata. La regola operativa prescrive correttamente di conservarla come consumata, liberare l’acquisizione e non inviare. Il Piano distingue già questo caso dall’ingresso nell’ultimo minuto **prima** della prenotazione.

**Perché conta:** seguendo letteralmente quel test della Spec si potrebbe introdurre una restituzione del budget contraria alla regola scelta.

**Correzione proposta:** allineare la sezione 8 della Spec al Piano:

- ultimo minuto raggiunto dopo l’acquisizione → nessun invio, acquisizione liberata, prenotazione consumata;
- ultimo minuto già raggiunto prima della prenotazione → nessuna prenotazione e giro fermo.

## Punti da decidere per coordinatore o utente

**Nessuna nuova decisione di prodotto necessaria.** Le correzioni completano il ciclo di vita dello stato locale e allineano un’aspettativa di test alla regola già definita.

Non vengono riaperti i punti risolti nei giri precedenti né le decisioni dei messaggi `w24-01-revisione-spec.md` e `w24-02-segnale-calendario.md`.

## Verifiche svolte e limiti

Confrontate le modifiche successive al secondo giro con il codice attuale di server, web e migrazioni, inclusi trasporto email, acquisizione degli allarmi, transazioni, generazione pigra, cache, sessione e rimozione dei membri.

Non eseguite build, suite dell’app o migrazioni: questa è una revisione di spec e piano, non una validazione dell’implementazione W24.

Revisione in sola lettura; worktree pulito al termine. Nessun file modificato, nessuna email inviata e nessuna operazione sulla produzione.