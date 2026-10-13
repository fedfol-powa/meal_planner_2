# W7: review di spec e piano, rilievi e decisioni del coordinatore

Rapporto completo: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w7-spec-piano.md`
(verdetto DA CORREGGERE, 9 rilievi). Leggilo tutto. Criterio generale: il meccanismo più
semplice che renda impossibile l'errore. Aggiorna spec e piano, commit, poi
`STATO: SPEC_E_PIANO_CORRETTI` con un riassunto per rilievo.

1. **Account sbagliato (bloccante).** Vincola il cambio alla sessione catturata all'inizio:
   leggi una volta la sessione del dispositivo (id utente, email, access token) e fai il
   cambio con **quell'access token**, non con la sessione corrente del client condiviso.
   Per esempio chiamata diretta `PUT /auth/v1/user` con `Authorization: Bearer <token catturato>`
   e `apikey`, oppure un client solo Auth con quella sessione: scegli il più semplice e
   motivalo. Se alla fine l'utente del dispositivo non è più lo stesso (uscita o cambio
   d'account in un'altra scheda), la pagina non applica nulla allo stato locale e mostra un
   esito neutro. Test prima, con verifica sospesa e cambio A→B / uscita nel mezzo: nessuna
   modifica arriva a B. Controlla che con il token catturato la sessione conservata dal
   server (LogoutAllExceptMe) sia proprio quella del dispositivo.
2. **Doppio fallimento.** Revoca della sessione di prova con il suo access token catturato
   (logout con scope `local`), indipendente dallo stato locale del client, con un nuovo
   tentativo se fallisce. Se anche quello fallisce (rete assente), accettiamo il limite:
   la sessione di prova resta attiva sul server fino alla scadenza del refresh token o al
   prossimo cambio riuscito, non ha mai toccato il dispositivo. Scrivilo nella spec come
   limite noto, senza promettere «nessuna sessione residua» in assoluto. Test del doppio
   fallimento e della richiesta di revoca effettivamente inviata.
3. **Ascoltatori.** Client di prova solo Auth (`AuthClient` di `@supabase/auth-js`, già
   installato come dipendenza di supabase-js: dichiaralo in `web/package.json` alla stessa
   versione, non è una libreria nuova) con smaltimento in `finally` in ogni esito. Test con
   tentativi ripetuti e controllo degli ascoltatori rimasti.
4. **Secure password change.** Il funzionamento senza email richiede che in produzione
   «Secure password change» sia spento: scrivilo come **precondizione del rilascio**,
   separata dal passo facoltativo (minimo 8 e «Require current password»). La verifico io
   con l'utente. Correggi «funziona con qualunque impostazione». Mappa
   `reauthentication_needed` su un esito chiaro (non `unknown`), con test.
5. **Fixture.** Riusa la sessione della registrazione come dispositivo o chiudi
   esplicitamente gli accessi delle fixture; pulisci client e utenti di prova; confronta gli
   id delle sessioni attese, non solo il conteggio.
6. **Etichette.** `htmlFor`/`id` stabili, suggerimenti ed errori fuori dal `<label>` con
   `aria-describedby`; test dei nomi accessibili prima e dopo gli errori.
7. **SPA sullo stack reale.** Aggiungi una suite automatica che monti la pagina (o la SPA)
   con il backend Supabase reale sullo stack locale: successo, password attuale errata,
   rifiuto del server, sessione revocata con arrivo al login. Scegli tu fra Vitest con jsdom
   e una prova browser automatica, la più semplice che giri in CI. La prova con
   agent-browser resta come verifica visiva.
8. **Rete e sessione.** Classifica l'errore di `getSession()` prima dell'assenza di sessione,
   come già fa `supabaseBackend.ts:51–56`. Test: rinnovo impossibile per rete → `network`;
   rinnovo rifiutato → `session_expired`.
9. **`pwned`.** Esito «password debole» generico per i motivi diversi da `length` e
   `characters`, con il suo messaggio. Correggi anche il 72 byte: oggi è `validation_failed`
   HTTP 400, il controllo della SPA resta.
