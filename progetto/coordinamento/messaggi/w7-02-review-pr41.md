# W7: review della PR #41, rilievi e decisioni del coordinatore

Rapporto completo: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w7-pr41.md`
(verdetto DA CORREGGERE, 6 rilievi; rilievi 2, 3, 6, 9 precedenti chiusi). Leggilo tutto.
Test che falliscono prima, poi correzione; aggiorna la spec dove cambia; push,
`STATO: PR_CORRETTA` con un riassunto per rilievo.

1. **Sessione sostituita dello stesso utente.** Cattura anche l'id della sessione
   (claim `session_id` dell'access token, che resta uguale nei rinnovi) e confrontalo in
   ogni lettura successiva insieme all'utente: sessione diversa → interrompi prima del
   `PUT` con `account_changed`. Test S1 → S2 stesso utente, e test che un rinnovo della
   stessa sessione (token nuovo, stesso `session_id`) non interrompe.
2. **Errori di rete nelle letture successive.** Tre esiti distinti in ogni lettura:
   identità cambiata, non verificabile (errore riprovabile → `network` prima del `PUT`),
   sessione terminata. **Dopo un `PUT` riuscito l'esito è il successo**: la lettura finale
   non lo può più trasformare in interruzione (al massimo la pagina non aggiorna lo stato
   locale se l'utente mostrato è cambiato). Test per errore di rinnovo prima e dopo il `PUT`.
3. **Token catturato.** Test in cui le letture successive restituiscono un token diverso
   dello stesso utente e della stessa sessione: l'header del `PUT` deve restare quello
   catturato. Controlla che fallisca con la mutazione descritta nel rapporto.
4. **Rifiuto della nuova password da parte del server nella pagina.** Cerca il modo più
   semplice e isolato per ottenerlo nella suite della pagina sullo stack (per esempio un
   utente o una condizione che il server rifiuta e la SPA no), senza cambiare la
   configurazione condivisa in modo che rompa altre prove. Se non esiste un modo pulito,
   scrivilo nella spec come limite motivato: copertura data da backend reale più pagina con
   stub. Correggi comunque la spec, che oggi conta la password attuale errata come «rifiuto
   del server».
5. **HTTP 400 nella verifica.** Classifica per codice: `current_invalid` solo per
   `invalid_credentials`; gli altri (`user_banned`, `email_not_confirmed`…) esito generico.
   Correggi tabella della spec e test.
6. **Client delle fixture.** Smaltisci i client Supabase delle fixture dopo ogni prova
   (`auth.dispose()` o equivalente) prima di riusare l'archivio.
