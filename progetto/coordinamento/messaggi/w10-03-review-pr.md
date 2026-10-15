# W10: rilievi della revisione della PR #47

Rapporto: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w10-pr47.md`
(DA CORREGGERE). CI verde su `3df2fb5`: copre pgTAP e i test del server sul database,
che il revisore non ha potuto eseguire dal suo sandbox. Decisioni del coordinatore:

1. **Da correggere (importante).** Dopo `forbidden`, uscire e rientrare ripresenta dati e
   interruttori abilitati se la verifica del profilo fallisce (riprodotto dal revisore).
   - Elimina le viste amministrative (`users`, `appInvitations`) **subito** al `forbidden`,
     non dopo la rilettura riuscita del profilo.
   - Lo stato «accesso da verificare» deve sopravvivere alla navigazione (per esempio
     nella cache di TanStack Query o in uno stato di sessione, non nel componente) fino a
     una verifica riuscita; si azzera al cambio di sessione.
   - Le risposte pendenti non devono ripopolare viste non più autorizzate.
   - Chiudi anche il passaggio di rendering con i dati vecchi segnalato nella PR, se la
     soluzione lo permette senza complicazioni.
   - Test DOM con uscita e rientro, per il dettaglio e per `/admin`, con letture fallite.
2. **Da correggere (minore).** Risposta di `setRole` alla propria rinuncia costruita dai
   dati aggiornati dentro la funzione che rimuove, non dalla copia letta prima del
   lucchetto. Se richiede più di una modifica contenuta, registralo invece come limite
   nella spec e nella PR.
3. **Da correggere (minore).** `maxLength` del campo di ricerca allineato ai 100 caratteri
   del contratto.
4. **Da correggere (minore).** Ordinamento degli account senza profilo con la stessa
   espressione del nome di ripiego; test pgTAP della barra rovesciata con una
   corrispondenza positiva e i casi `\%` e `\_`. Una migrazione nuova se serve
   (quella della PR non è ancora unita: puoi modificarla).
5. **Rinvio accettato:** `22023` associato sempre a `role`.

Correggi, verifica (typecheck, test, pgTAP sullo stack locale, build, agent-browser per il
punto 1), push, aggiorna la descrizione della PR e scrivi `STATO: PR_CORRETTA`.
