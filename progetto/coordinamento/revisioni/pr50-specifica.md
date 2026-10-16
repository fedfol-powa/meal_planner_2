Revisione documentale della PR #50, branch `traguardo/specifica-w10`, commit `919b723`, sul diff `origin/main...HEAD`.

Le decisioni elencate da W10 risultano riportate nelle sezioni pertinenti. La Parte 1 è comprensibile, gli scostamenti dal prototipo sono espliciti e il passaggio della cancellazione da B a C è registrato. Restano quattro correzioni.

1. **Importante — Il controllo del ruolo sotto il lucchetto è generalizzato impropriamente alla cancellazione dell’account.**

   **File:** [specifica principale, riga 1245](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-a84415fb1d00bad0a/progetto/superpowers/specs/2026-09-29-app-famiglia-design.md:1245).

   Il testo estende a «ogni percorso», compresa la cancellazione dell’account di C, il controllo che chi chiama «sia ancora `app_admin`». Quel requisito specifico appartiene a `app.set_user_role`: il codice unito lo applica a un’operazione amministrativa. La regola comune richiede invece di ricontrollare l’autorizzazione di chi chiama e proteggere l’ultimo amministratore.

   La distinzione conta perché la cancellazione del proprio account è consentita anche agli utenti senza ruolo globale, come conferma la sezione 7, riga 2112. Anche un amministratore retrocesso mentre attende il lucchetto può conservare il diritto di cancellare il proprio account.

   **Correzione proposta:** nella regola generale scrivere «ricontrolla l’autorizzazione di chi chiama per l’operazione richiesta»; precisare separatamente che, per `app.set_user_role`, questo significa verificare nuovamente `app_admin`. Conservare lucchetto, stessa transazione e controllo dell’ultimo amministratore per C.

2. **Minore — Lo stato mostrato dopo `forbidden` non corrisponde al codice rilasciato.**

   **File:** [specifica principale, riga 2058](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-a84415fb1d00bad0a/progetto/superpowers/specs/2026-09-29-app-famiglia-design.md:2058), ripetuto nel registro alla riga 3336.

   Il testo promette «Non hai accesso a questa pagina» alla prima risposta `forbidden`. In `origin/main`, `web/src/features/admin/AdminAccess.tsx:95` elimina subito le viste e avvia la verifica; il componente mostra prima il caricamento, poi il diniego solo se il profilo conferma la perdita del ruolo. Se la verifica fallisce, mostra l’errore con «Riprova», mantenendo nascosti dati e comandi.

   La sintesi riprende la formulazione abbreviata delle «Decisioni da riportare», ma perde la distinzione descritta nella stessa spec W10, righe 255–291, e implementata nel codice.

   **Correzione proposta:** indicare che al primo `forbidden` spariscono immediatamente dati e comandi; il messaggio di accesso negato arriva dopo la verifica del profilo. Menzionare il caso «Riprova» senza recuperare i dati precedenti e allineare il registro.

3. **Minore — La tabella delle dipendenze non registra B come produttore per C.**

   **File:** [piano generale, riga 92](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-a84415fb1d00bad0a/progetto/superpowers/plans/2026-10-11-piano-generale.md:92).

   La colonna «Produce per» di B resta `—`, mentre la riga successiva dichiara che C usa il lucchetto e il dettaglio dell’utente di B. La nuova interfaccia alla riga 238 conferma questa consegna.

   **Correzione proposta:** sostituire `—` con `C`. La tabella deve rappresentare la stessa dipendenza descritta nell’interfaccia.

4. **Minore — Restano due formulazioni di stato da aggiornare.**

   **File:** [specifica principale, riga 2022](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-a84415fb1d00bad0a/progetto/superpowers/specs/2026-09-29-app-famiglia-design.md:2022) e [riga 2679](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-a84415fb1d00bad0a/progetto/superpowers/specs/2026-09-29-app-famiglia-design.md:2679).

   Rimane «Dal 15 ottobre 2026 […] `/admin` c’è con la sola sezione “Inviti all’app”», sebbene ora contenga anche Utenti. Il paragrafo successivo permette di ricostruire la successione, ma la frase è ancora formulata come stato corrente. Inoltre, la tabella intitolata «Stato al 15 ottobre 2026» contiene il rilascio e il collaudo del 16 ottobre.

   **Correzione proposta:** rendere esplicitamente storico il primo passaggio («Al rilascio del 15 ottobre […] aveva soltanto…») e aggiornare la data della tabella al 16 ottobre.

**Verifiche effettuate**

Confrontate le decisioni e l’interfaccia per C della spec W10, il piano generale del checkout principale e il suo registro del 15 ottobre, il precedente della PR #46 e il codice su `origin/main`: migrazione, contratto, server `users`, amministrazione web e registro delle mutazioni. Il registro di coordinamento aggiornato conferma anche la prova sull’iPhone e la chiusura di #38.

- `git diff --check origin/main...HEAD`: superato.
- `npm run typecheck`: superato in tutti i workspace.
- Test e build: tentati, ma fermati prima dell’esecuzione da `EPERM` sulla scrittura dei file temporanei in `meal_planner_2/node_modules/.vite-temp`, fuori dall’area scrivibile. Nessun esito funzionale deducibile.
- Nessun file tracciato modificato; worktree pulito.

**Decisioni da sottoporre al coordinatore o all’utente:** nessuna nuova decisione di prodotto. Le correzioni richieste allineano il testo ai permessi già confermati, al codice unito e alle consegne di W10.

**Verdetto: DA CORREGGERE.**