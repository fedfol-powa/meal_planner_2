# W2 profilo — seconda review di spec e piano

Rapporto: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w2-profilo-spec-piano-2.md`. Verdetto «approvabile con correzioni».

## Correggi il rilievo come propone il revisore

Distinguere una risposta superata nell'ordine da una sessione chiusa: a sessione valida,
ogni scrittura riuscita invalida tutte le proprie dipendenze anche quando la risposta non
viene applicata. Test con restrizione `avoid` e porzioni, risposte invertite e cache
della spesa già popolata.

## Poi: via all'implementazione, in quest'ordine (ordine dell'ondata 2 approvato dall'utente)

Nessuna terza review di spec. Sei un **produttore** per W1:

1. **Prima una PR piccola** con `domain/src/family/settings.ts` (schema dei valori
   salvati e `resolveFamilySettings`), export `./family` aggiunto a
   `domain/package.json`, test. Aprila e scrivi `STATO: PR_APERTA <url>`: la faccio
   esaminare e unire subito, perché W1 la usa.
2. Poi, sul branch principale, migrazione `profile_preferences`, contratto, server e
   MCP del profilo e della famiglia, con TDD.
3. **Fermati prima delle parti web** (incluso il passaggio da `me` a `profile`):
   dipendono dalla seconda PR di W5. Arrivato lì: `STATO: DOMANDA` con cosa hai fatto e
   cosa resta bloccato.

Se il contesto supera il 50% prima di iniziare l'implementazione, dimmelo.
