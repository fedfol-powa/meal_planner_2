# W1 menu — rilievi della review di spec e piano

Rapporto: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w1-menu-spec-piano.md`.
Verdetto «da rifare». Leggilo tutto e correggi spec e piano.

## Decisioni del coordinatore

**Rilievo 1 — viste condivise.** W6 è l'unico autore di `contract/src/recipes/views.ts` e
`server/src/recipes/views.ts`, con le sue firme: tu ti adegui e **non scrivi mai quei
file**, nemmeno come ripiego. W6 sta scrivendo nella sua spec una sezione «Interfaccia
per W1» con le firme definitive (riepiloghi in blocco per `{recipeId, version, servings}`
con versioni storiche e ricette mai pubblicate, `ratingSummaries(tx, familyId, userId,
recipeIds)`, righe di ingrediente con un caricatore asincrono in blocco, chiavi
esportate). Te la passo appena è pronta: intanto correggi il resto e lascia nei task 4 e
9 un rimando a quella sezione. Il cancello dei task che la usano comprende: PR di W6 con
le viste R1 unita, `ratings.set` disponibile, `IngredientList` (di W6, con la
preparazione) e tipi web della ricetta adeguati. Prova del voto dal Menu con risposta
applicata solo dopo conferma del server.

**Implementatore unico:** costruito solo in `server/src/router.ts` con `{ prepare }`;
ogni area esporta un factory che riceve `os` (modello di W6), tipo `Implementer` da
`server/src/pipeline.ts`. W2 si adegua a questo.

**Rilievo 2 — settimane fuori ordine.** Generando una settimana, il pianificatore tiene
conto sia dello storico precedente sia delle settimane successive già generate (come
vicine per il vincolo fra settimane); le settimane esistenti non si sovrascrivono mai.
Test per prima apertura prima e dopo il cron e per il recupero di una settimana mancante
fra due pianificate.

**Rilievo 3 — concorrenza.** Serializzazione per famiglia con
`pg_advisory_xact_lock` su una chiave derivata dal `family_id`, preso all'inizio della
generazione sia nella richiesta pigra sia nel cron (nessun nuovo permesso su
`families`). Test concorrente cron ↔ `ensureWeeks` con entrambe le settimane assenti.

**Rilievo 4 — job.** Lettura dei job `pending` e `failed` separata dallo smistamento dei
nuovi bersagli; un job si ritenta finché la sua settimana non è finita (se è già
iniziata genera solo i pasti ancora aperti, come la generazione pigra), poi si chiude
come abbandonato con un log d'errore. Ritardo calcolato rispetto al mercoledì della
`target_week`. Test domenica → lunedì e interruzioni di più settimane.

**Rilievo 5 — settimane con soli slot vuoti.** `no_weeks` solo se non esistono
settimane. Se esistono ma nessun pasto ha contenuto, l'apertura va al primo giorno con
slot da oggi in avanti, altrimenti all'ultimo giorno con slot: le schede «Nessuna
ricetta adatta» restano visibili. Test dal server alla schermata, nelle due lingue.

**Rilievo 6 — `getOpening`.** La data effettiva entra nella versione dell'operazione, e la
validazione di `today` avviene prima dell'uscita «invariato». Test MCP con cambio di
giorno, `knownVersion` e nessuna scrittura intermedia.

## Rilievi tecnici: correggi come propone il revisore

7 (mercoledì 20:00 → mercoledì cena; test R1 nel ruolo del membro, confini 15:30/23:00
e cambio di fuso; Londra e New York per l'ora legale; errori di generazione simulati con
un punto controllato, perché `resolveFamilySettings` di W2 non fallisce sui valori
malformati) e 8 (`toPlannerRecipe(id, document)` come in W3, con fixture sul libro).
Aggiungi le prove `tools/call` MCP della generazione pigra e degli errori.

Quando hai finito: commit, `STATO: SPEC_E_PIANO_CORRETTI`, e aspetta.
