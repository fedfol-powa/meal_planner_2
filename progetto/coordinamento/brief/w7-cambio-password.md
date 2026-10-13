# Brief W7: Cambio della password dal Profilo (issue #37)

Segui `progetto/coordinamento/protocollo-worker.md`.

- **Branch:** `traguardo/cambio-password` (da `origin/main`) · **Worktree:**
  `.worktrees/password`
- **Issue:** #37 (`gh issue view 37 --comments`): leggila tutta, è il punto di partenza.
- **Area:** voce «Cambia password» nel Profilo della SPA.
- **Specifica:** sezioni 1, 7 (account), 10 (traguardo A), 13 (rischi dei token d'agente),
  15 e 16. La sezione 7 è in aggiornamento nella PR #40, non ancora unita: la decisione che
  conta è sotto.

## Contesto e decisione dell'utente (13 ottobre 2026)

L'app è in produzione per una famiglia. Gli account li crea l'amministratore dalla
dashboard di Supabase con una password scelta da lui; le iscrizioni sono spente.
**Email e password resta l'accesso principale in modo permanente** (sull'iPhone la PWA
installata non condivide la sessione con Safari, quindi i link via email per entrare sono
scartati). Il cambio della password è quindi una funzione stabile, non provvisoria.

## Obiettivo

Chi è entrato può cambiare la propria password dal Profilo: password attuale, nuova
password, conferma, esito chiaro, errori tradotti (it-IT e en-GB).

## Vincoli dal coordinamento

- **Solo SPA e Supabase Auth**: Worker e schema `app` non vedono mai la password. Niente
  migrazioni, niente endpoint nuovi del Worker, salvo motivazione forte da portare con
  `STATO: DOMANDA`.
- **Verifica della password attuale:** controlla con Context7 la documentazione aggiornata
  di Supabase Auth (`updateUser`, impostazione «Secure password change», reauthentication
  con nonce via email, `current_password` se esiste). La reautenticazione via email richiede
  l'invio di email, che in produzione **non c'è** (niente SMTP né Resend): la soluzione deve
  funzionare senza email. Scrivi nella spec cosa scegli e perché.
- **Altre sessioni:** decidi nel brainstorming se chiuderle dopo il cambio (opzione
  consigliata da portare al coordinatore), tenendo conto degli agenti collegati via MCP e
  del logout che cancella i dati locali (sezione 1).
- **Impostazioni di Supabase in produzione** (lunghezza minima, requisiti della password,
  «Secure password change»): non toccarle. Se servono, scrivi nella spec il valore e il
  passo in dashboard per l'utente e fermati con `STATO: DOMANDA`. Il locale
  (`supabase/config.toml`) può allinearsi alla produzione, dichiarandolo.
- Test: unità per la logica del modulo; test della SPA sullo stack locale per il
  percorso completo (cambio riuscito, password attuale errata, password debole, sessione
  scaduta). Verifica l'interfaccia nel browser con la skill agent-browser, anche a
  larghezza da telefono.
- Rilascio in produzione: **non lo fai tu**. Lo fa il coordinatore dopo il merge.
