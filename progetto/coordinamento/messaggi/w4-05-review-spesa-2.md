# W4 spesa — seconda review di spec e piano

Rapporto: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w4-spesa-spec-piano-2.md`. Verdetto «approvabile con correzioni»:
le firme dell'«Interfaccia richiesta a W5» sono realizzabili sopra W5.

## Correggi i tre rilievi come propone il revisore

1. Dentro un'unica `transact`: rileggere la testa effettiva, marcarla `sent` e
   prenderne una copia immutabile da inviare; se non c'è più, non inviare. Test con
   compattazione concorrente fra la rilettura e l'acquisizione.
2. Prefisso `shopping-queue:` registrato all'inizializzazione dell'app, prima di ogni
   `purgeOtherCopies`, indipendentemente dal montaggio della Spesa (va scritto
   nell'interfaccia richiesta a W5). Test con `AuthProvider` e `SessionScope` reali:
   avvio disconnesso, avvio con B e coda di A sul disco.
3. Messaggio fra schede a ogni modifica persistita della coda, con due tipi: «rileggi la
   coda» e «applica questa vista confermata». Test con due schede, invio fallito,
   compattazione, avvisi e blocco di Bring!.

## Poi: via all'implementazione, in quest'ordine (ordine dell'ondata 2 approvato dall'utente)

Nessuna terza review di spec. Commit delle correzioni, poi implementa con TDD solo i task
che **non** dipendono da interfacce altrui ancora da consegnare:

- sì: contratto, server e dominio della spesa, pagina Bring!, test del database;
- **no, fermati prima:** il task 8 (`mealRecipeVersions` di W1, non ancora consegnato:
  fino ad allora tieni la query provvisoria già prevista) e il task 10 e ogni parte web
  (dipendono dalla seconda PR di W5 con gli agganci di sessione).

Arrivato a quel punto: `STATO: DOMANDA` con cosa hai fatto e cosa resta bloccato.
Il contesto: se supera il 50%, dimmelo prima di iniziare l'implementazione.
