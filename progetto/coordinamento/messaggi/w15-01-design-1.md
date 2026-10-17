# W15, risposta del coordinatore alla parte 1 del design (inviti e password)

La parte 1 va bene nell'impianto. Integra questi punti nella spec (alcuni sono verifiche da
fare, non decisioni già prese):

1. **Lingua allineata con il token della persona:** dall'agente MCP il token non è una
   sessione di Supabase Auth della persona (verificalo nel codice del collegamento degli
   agenti), quindi `PUT /auth/v1/user` non funziona da lì. Usa l'API di amministrazione con
   la chiave segreta già presente nel Worker (`PUT /auth/v1/admin/users/{id}`), valida per
   web e MCP. Verifica con Context7 o nel sorgente se l'aggiornamento di `user_metadata`
   dall'admin sostituisce l'oggetto intero o lo unisce: se lo sostituisce, rileggi e
   riscrivi tutti i campi (nome, lingua, famiglia), senza perderne.
2. **Template:** il link dei template non usa `{{ .ConfirmationURL }}` ma la pagina
   dell'app con il codice nel frammento (`{{ .SiteURL }}/password#token_hash={{ .TokenHash }}&type=invite`
   e `type=recovery`). Scrivilo nella spec con i due template completi, nelle due lingue.
   Controlla anche che *Redirect URLs* non serva più (il link non passa da `/auth/v1/verify`)
   e annota nel runbook cosa cambia in produzione.
3. **Recupero per chi non ha mai scelto la password** (email dell'invito persa): verifica
   sullo stack locale che `resetPasswordForEmail` spedisca davvero a un utente non
   confermato e che `verifyOtp` con `type=recovery` confermi l'email. Se non succede, la
   pagina «Password dimenticata» deve comunque portare a un invito rimandato; scrivi il
   comportamento verificato nella spec, con un test.
4. **Funzione dell'etichetta:** stessi permessi delle viste che la usano. Sulla pagina dei
   membri solo per i membri di quella famiglia (anche non amministratori, se oggi vedono
   l'elenco); in `/admin` solo per `app_admin`. Restituisce solo un booleano per
   `user_id`, mai altro da `auth.users`. Test pgTAP sui permessi.
5. **Limiti:** «Rimanda l'email» ogni 60 secondi va bene. Scrivi anche il limite di
   Supabase su `/auth/v1/invite` e `recover` (SMTP a 30 l'ora oggi) e cosa vede la persona
   se lo supera (messaggio tradotto, nessun errore generico).
6. **Notifica di password cambiata:** Supabase ha il template
   `password_changed_notification`. Non serve in questa attività: annotalo come idea
   futura, senza accenderlo.

Prosegui con la parte 2 del design.
