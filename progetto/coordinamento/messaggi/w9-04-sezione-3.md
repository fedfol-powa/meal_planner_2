# W9, sezione 3 del design (web): va bene, con queste aggiunte

1. **Testi senza genere:** «Sei invitato» presuppone il maschile. Usa formule neutre,
   per esempio «Hai un invito per Cosa si mangia?»; controlla anche gli altri testi
   italiani nuovi (en-GB è già neutro).
2. **iPhone e PWA:** chi apre il link da WhatsApp lo fa in Safari, e la sessione resta
   lì (la PWA installata non condivide la sessione con Safari). Dopo la creazione della
   famiglia, o nella scheda di benvenuto, aggiungi una nota breve: per usare l'app dalla
   schermata Home la si aggiunge da Condividi › Aggiungi alla schermata Home e poi si
   entra con email e password. Mostrala solo dove ha senso (iOS non in modalità
   standalone), senza componenti nuovi. Annota nella spec la prova a mano sull'iPhone.
3. Token nel frammento (`/invite/app#<token>`): va bene, motivalo nella spec (log e
   Referer).
4. Il resto va bene: pagina pubblica con cambio di lingua e «Sei offline», conferma
   della password, «Esci e continua», errori, FamilyGate con «Crea la tua famiglia»,
   wizard con id generato all'apertura, scheda di benvenuto, Profilo, `/admin` con la
   sola sezione Inviti e «Nuovo link».

Prosegui: completa il design, poi spec e piano come da protocollo.
