# Al worker W2: review della PR #4

Rapporto: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w2-pr4.md`
(verdetto: approvabile con correzioni). Correggi i due rilievi come proposto:

1. **Bozze collegate a un pasto:** un membro non può assegnare (insert o update di
   `recipe_id`) una ricetta che non può leggere; le bozze si collegano solo tramite il
   percorso dell'import (job o ruolo dedicato). Porzioni e note degli slot già validi
   restano modificabili. Test negativi per insert e update, compreso l'ex membro in
   un'altra famiglia.
2. **Cancellazione di un autore storico:** quando la chiave esterna azzera
   `meal_changes.actor_id`, il contatore della famiglia cresce. Regressione con
   transazioni distinte e autore presente solo nello storico.

Il revisore non ha potuto avviare il database (sandbox). Dopo le correzioni esegui tutta
la suite (`supabase db reset`, `supabase test db`, prova del bootstrap) e riporta l'esito
completo nella descrizione della PR. Push, poi `STATO: PR_CORRETTA`. Lascia il database
locale avviato: prima del merge rilancio io i test nel tuo worktree.
