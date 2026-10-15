# W10: rilievi della seconda revisione di spec e piano

Rapporto: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w10-spec-piano-2.md`
(DA CORREGGERE, nessuna decisione di prodotto nuova). Tutti accolti:

1. **`forbidden` e dati che restano visibili.** In `/admin` e nel dettaglio rendi esplicito
   lo stato «accesso da verificare»: a un `forbidden` da qualunque operazione `users`
   (compresa la ricerca di `account_exists`, oggi inghiottita da `.catch`) nascondi subito
   dati e comandi, senza fidarti del profilo in cache; se la rilettura del profilo
   fallisce, errore con «Riprova» e niente permesso riusato; se il ruolo c'è ancora,
   rileggi le viste. Test: rilettura sospesa, fallita, profilo ancora amministratore,
   `forbidden` nella ricerca; asserzioni sul DOM (dati e comandi assenti), non solo sulla
   cache. Soluzione semplice preferita.
2. **Risposte superate di `setRole`.** Separa l'invalidazione (sempre) dall'autorizzazione
   a scrivere il dettaglio in cache (solo la risposta più recente per quell'utente). Il
   comportamento degli inviti non cambia. Test con due mutazioni sullo stesso utente in
   ordine inverso, anche dopo uscita e rientro nella pagina.
3. **Test di concorrenza che resta appeso.** Propaga gli errori di avvio alla promessa del
   PID e a `isReady` di `holdTransaction`; raccogli sempre entrambi gli esiti anche se il
   rilascio rigetta. Dichiara la modifica a `server/test/support/hold.ts`. Test con errore
   prima del PID e con errore del lavoro iniziale.
4. **Testi superati.** Piano: lucchetto solo sulle rimozioni di `app_admin`. Spec:
   interruttori bloccati fino allo stato confermato (risposta di `setRole`), non fino alla
   rilettura successiva.

Correggi, fai commit e scrivi `STATO: SPEC_E_PIANO_CORRETTI`. Non ci sarà una terza
revisione di spec e piano: dopo un mio controllo passerai all'implementazione, e il resto
lo verificherà la revisione della PR.
