# W9, decisioni del coordinatore dalla revisione della PR #44

Valgono per la tua spec (la PR #44 le riporta nella specifica principale):

1. **«Entra subito»:** dopo che il server ha creato l'account, la pagina dell'invito fa
   entrare la persona con email e password (`signInWithPassword` nella SPA), senza un
   passaggio in più. Se l'accesso fallisce dopo la creazione, la pagina lo dice e porta
   all'accesso normale: l'account esiste già e l'invito risulta usato.
2. **Scheda dopo la prima generazione:** finché gli inviti alla famiglia (attività C) non
   ci sono, mostra solo «Sistema le impostazioni»; «Invita la famiglia» arriva con C.
3. Verifica del revisore (documentazione e sorgente di Supabase Auth v2.197.0): la
   creazione amministrativa con password ed `email_confirm: true` funziona con le
   iscrizioni spente e non manda email. Va comunque provata sullo stack locale con
   `disable_signup` acceso.
