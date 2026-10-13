# W9, sezione 2 del design: va bene, con queste aggiunte

1. **Origine del link:** costruiscila da `new URL(request.url).origin` (o da una variabile
   di configurazione), mai dall'intestazione `Origin` o `Host` inoltrata dal client.
   Vale anche per gli strumenti MCP.
2. **Token nei log:** il token compare nel percorso `/invite/app/<token>`. Verifica che
   né `server/src/log.ts` né le richieste dell'SPA (asset, navigazione, `get`/`accept`)
   registrino percorsi o corpi con il token; se il percorso finisce nei log del Worker,
   valuta il token nel frammento (`#`) invece che nel percorso e motiva la scelta nella
   spec. Imposta `Referrer-Policy: no-referrer` (o equivalente) almeno per quella pagina.
3. **Password:** il limite di bcrypt è di 72 **byte**, non caratteri: valida la lunghezza
   in byte UTF-8 con un messaggio chiaro.
4. Il resto (ruolo `public` con limitatore obbligatorio, `invitation_unavailable` 410,
   `rate_limited` 429, `SUPABASE_SECRET_KEY` facoltativo con errore `internal` loggato,
   `family.create` con vista del profilo, strumenti MCP) va bene. Registra in spec i
   file condivisi della piattaforma che tocchi.

Prosegui con la sezione successiva.
