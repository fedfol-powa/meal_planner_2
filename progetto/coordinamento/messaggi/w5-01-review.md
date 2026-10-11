# Al worker W5: decisioni sulla review di spec e piano

Rapporto: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w5-spec-piano.md`
(verdetto: **da rifare** per sessione, cache, mutazioni e PWA). Applica tutti i rilievi
con queste scelte; dopo le correzioni ci sarà una seconda review.

**Semplificazione delle mutazioni (rilievi 4, 5, 6, 14).** Niente aggiornamenti
ottimistici. Il voto si invia, si mostra lo stato di invio sul componente e, alla
risposta, si applica il risultato del server alle viste in cache **della stessa
famiglia** che contengono la ricetta (scheda, settimane). Le liste del Ricettario la cui
appartenenza o ordine dipende dal voto si marcano scadute e si rileggono quando sono
mostrate. Le risposte arrivate dopo l'uscita o un cambio d'utente si scartano; per la
stessa ricetta vale solo la risposta dell'ultima richiesta. Offline il voto fallisce
subito con un errore tradotto (nessuna coda), anche nel client finto, provato tramite il
meccanismo di connettività. Così non si persistono mai dati non confermati.

**Sessione e accessi (rilievi 1, 2).** Una sola procedura di chiusura della sessione,
usata da «Esci», dall'evento `SIGNED_OUT` di un'altra scheda e dal cambio d'utente:
cancella cache in memoria e copia persistita, scarta le richieste pendenti. «Esci» usa
l'ambito **locale** (solo questo dispositivo) e gestisce l'errore di Supabase: la pulizia
locale avviene comunque. Su `unauthorized` dal server: un tentativo di rinnovo, poi
chiusura della sessione e login. Su `forbidden`: rimozione delle viste dell'ambito
(famiglia) da memoria e persistenza e messaggio.

**Offline senza poter verificare la sessione.** Si mostra la copia salvata in sola
consultazione (banner già previsto) finché non torna la rete; alla riconnessione si
rinnova la sessione e, se il rinnovo è rifiutato, si chiude la sessione come sopra.

**Versioni (3):** `string` opaca ovunque.

**PWA (7):** l'installazione mette in cache la shell completa (HTML e asset con hash
elencati dalla build); la vecchia cache si elimina solo dopo che la nuova è completa.
Test dei tre scenari indicati.

**Stili (8), errori e famiglia assente (9), calendario (13), libro (12):** come proposto
dal revisore.

**Lingua (10).** Modalità finta: preferenza del dispositivo. Login reale: vale la lingua
del profilo a ogni cambio d'identità; finché non esiste l'operazione di salvataggio del
profilo (ondata 2) la scelta nel Profilo è temporanea per quell'utente (chiave per
utente), mai globale.

**Pasti storici (11).** Conserva il riferimento al pasto (slot) in rotta, input e chiavi
delle query; le versioni arrivano nell'ondata 2.

**Confine con W1 (punto 5).** Il client oRPC vero non è in questa consegna. Dopo il merge
di W1 farai una seconda PR piccola «client reale» (adattatore oRPC, errori, token, proxy
di Vite, `unauthorized`), da pianificare allora. Nella spec scrivi solo l'interfaccia.

Correggi spec e piano, commit, poi `STATO: SPEC_E_PIANO_CORRETTI`.
