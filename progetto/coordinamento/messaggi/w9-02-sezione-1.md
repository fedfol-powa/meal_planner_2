# W9, sezione 1 del design: va bene, con queste aggiunte

1. `complete_app_invitation` deve verificare che `user_id` coincida con `reserved_user_id`
   e che in `auth.users` esista quell'id con l'email dell'invito: le funzioni `anon` non
   devono fidarsi dei parametri passati dal Worker più dello stretto necessario.
2. `app_invitation_by_token` deve dire `valid` anche per un invito già prenotato e non
   revocato ma scaduto nel frattempo, coerente con la prenotazione (domanda 4); altrimenti
   chi riapre il link dopo un'interruzione non può finire.
3. Scrivi nella spec che le funzioni stanno nello schema `app`, non esposto dalla Data API
   (in produzione solo `public` e `graphql_public`): `anon` le raggiunge solo dal Worker.
   Aggiungi un test che lo confermi o cita quello esistente sullo schema esposto.
4. `create_app_invitation` valida i ruoli lato database (sottoinsieme ammesso) oltre che
   con zod.
5. `create_family`: va bene la funzione. Dichiara nella spec il comportamento verso la
   generazione pigra (nessuna generazione dentro la funzione).

Prosegui con la sezione successiva.
