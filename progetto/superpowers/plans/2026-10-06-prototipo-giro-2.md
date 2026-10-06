# Prototipo, giro 2: Revisione dei pasti — piano

> **Per gli agenti che eseguono:** sotto-skill richiesta: superpowers:subagent-driven-development
> (consigliata) oppure superpowers:executing-plans, attività per attività. I passi usano
> le caselle (`- [x]`) per il tracciamento.

**Obiettivo:** rendere provabili su iPhone tutte le azioni su un pasto della specifica
(sezione 5): cambia ricetta con cinque suggerimenti o con la ricerca, "proponimene un
altro", porzioni, scambio con un altro pasto della settimana, pasto libero, nota,
"non proporre più"; con ultima modifica e annullamento.

**Architettura:** quella del giro 1 (`design/percorsi.md`, "Architettura del
prototipo"). Nuove operazioni simulate in `src/lib/operations/revision.ts`, che
scrivono sullo stato demo e registrano ogni modifica in un registro `mealChanges`;
le schermate le chiamano come nel giro 1. Le scelte di superficie ancora aperte sono
varianti selezionabili dal pannello Prova.

**Stack:** invariato rispetto al giro 1 (SvelteKit, Svelte 5 runes, TypeScript,
Vitest). Nessuna nuova dipendenza.

**Riferimenti da leggere prima di iniziare:**
- specifica, sezioni 2, 3 ("Riuso durante la revisione"), 5 e 14;
- `design/percorsi.md`, "Architettura del prototipo" ed esito del giro 1;
- `design/design.md` e `design/index.html` (pulsanti, schede, fogli, stati);
- `prototype/README.md`.

**Sezioni della specifica realizzate (in forma simulata):** 2 (`meal_slots`,
`meal_changes`, `recipe_exclusions`), 3 (suggerimenti e "proponimene un altro" come
riuso semplificato del punteggio), 5 (azioni sullo slot, tracciabilità, concorrenza,
offline in sola lettura).

## Decisioni della preparazione (6 ottobre 2026)

Da registrare nella specifica e in `design/percorsi.md` nell'attività 1.

1. **"Non proporre più"** sul pasto apre subito la scelta tra i cinque suggerimenti per
   sostituire il piatto. L'elenco delle esclusioni (vederle, toglierle) è del percorso 5.
2. **Nessun avviso di settimana.** Le modifiche a mano sono libere e silenziose. Si
   tolgono gli avvisi dalla parte funzionale ("Come sceglie i piatti") e dal riuso del
   pianificatore (sezione 3); suggerimenti e "proponimene un altro" continuano a tener
   conto del resto della settimana.
3. **Ultima modifica:** solo persona e momento ("Anna · ven 21:30"), nessun canale
   visibile; il canale resta nel registro. Nessuna indicazione sui pasti mai toccati.
4. **Concorrenza: vince l'ultimo salvataggio**, senza avviso di conflitto. Cadono il
   blocco ottimistico su `updated_at` e la scelta di sovrascrivere (sezione 5); il
   registro `meal_changes` conserva entrambe le modifiche.
5. **Scambio** con qualunque pasto della stessa settimana, pranzo o cena; si spostano
   piatto (o testo libero) e nota, le porzioni restano allo slot.

**Default proposti nel piano** (da confermare approvando il piano):

- "proponimene un altro" sostituisce subito il piatto con il candidato successivo;
- ogni modifica mostra per alcuni secondi un avviso con "Annulla";
- la nota è visibile a tutta la famiglia, testo libero fino a 200 caratteri;
- tutte le azioni valgono per pasti passati, in corso e futuri, e per slot liberi e
  vuoti (uno slot vuoto offre "Scegli una ricetta"); in offline simulato sono
  disattivate;
- tutti i membri della famiglia possono usarle (ruolo `member`, sezione 2).

## Varianti da scegliere su iPhone

Secondo il metodo del giro 1: si costruiscono le alternative, selezionabili dal
pannello Prova; dopo la scelta si tolgono le altre e si incrementa la versione dello
stato salvato.

- **Ingresso alle azioni** (`revisionEntry`):
  - `sheet`: un'icona "modifica" in fondo al footer della scheda apre un foglio dal basso
    con l'elenco delle azioni;
  - `panel`: la stessa icona apre, come voto e ingredienti, un pannello sotto il footer
    con le azioni come pulsanti compatti.
- **Suggerimenti** (`suggestionLayout`):
  - `list`: righe compatte con miniatura, nome, durata e voto medio;
  - `cards`: schede ridotte (stesso `RecipeCard` senza footer) scorrevoli in orizzontale.

## Simulazione dei suggerimenti

Il pianificatore non c'è; la regola semplice usata è dichiarata nell'interfaccia
("suggerimenti simulati") e in `design/percorsi.md`.

- **Candidati:** ricette visibili alla famiglia (pubblicate, libri posseduti), adatte al
  pasto (`mealType` uguale o `both`), non escluse, non già presenti nella stessa
  settimana, non usate nelle due settimane precedenti.
- **Punteggio:** media della famiglia (3 se nessun voto) + 0,1 per settimana dall'ultima
  volta (massimo 1) − 1 se il gruppo proteico coincide con il pasto prima o dopo.
  Parità risolta per nome, così il risultato è deterministico e testabile.
- **Suggerimenti:** i primi cinque, escluso il piatto attuale.
- **"Proponimene un altro":** il candidato che segue il piatto attuale nella classifica;
  se il piatto attuale non è in classifica, il primo. Premendo più volte si scorre
  l'elenco; alla fine si ricomincia dal primo.
- Se non ci sono candidati: stato "nessuna ricetta adatta" con invito alla ricerca.

## Focus della review

Casi facili da rompere, ciascuno con un test nell'attività indicata.

1. **Annulla dopo una modifica successiva di un altro membro:** l'annullamento
   ripristina lo stato precedente solo se lo slot è ancora come l'ha lasciato l'utente;
   altrimenti l'avviso sparisce senza toccare niente (attività 3).
2. **Scambio con slot libero o vuoto, e con sé stesso:** testo libero e note viaggiano
   correttamente, le porzioni no; lo scambio con sé stesso è rifiutato (attività 3).
3. **"Proponimene un altro" senza candidati e in fondo all'elenco** (attività 2).
4. **Esclusione della ricetta in uso in altri pasti:** gli altri pasti restano invariati;
   la ricetta sparisce solo dai candidati (attività 2).
5. **Offline e famiglia sbagliata:** ogni operazione di scrittura restituisce `offline`
   o `forbidden` senza modificare lo stato (attività 3).

---

## Struttura dei file

| File | Ruolo |
|---|---|
| `src/lib/domain/types.ts` | `RecipeExclusion`, `MealChange`, campi nuovi di `DemoDatabase` |
| `src/lib/operations/suggestions.ts` (+ test) | classifica dei candidati, `getSuggestions`, `nextSuggestion` |
| `src/lib/operations/revision.ts` (+ test) | operazioni di scrittura sullo slot, registro e annullamento |
| `src/lib/operations/views.ts` | `SuggestionView`, `MealView.canEdit` |
| `src/lib/store/persistence.ts` | versione 6, impostazioni delle varianti |
| `src/lib/components/MealActions.svelte` | elenco delle azioni (varianti `sheet` e `panel`) |
| `src/lib/components/BottomSheet.svelte` | foglio dal basso basato su `<dialog>` |
| `src/lib/components/RecipePicker.svelte` | suggerimenti più ricerca con filtri (riusa `RecipeFilters`) |
| `src/lib/components/SwapPicker.svelte` | pasti della settimana da scambiare |
| `src/lib/components/ServingsStepper.svelte` | porzioni con − e + |
| `src/lib/components/UndoToast.svelte` | avviso con "Annulla" |
| `src/lib/components/RecipeCard.svelte` | icona modifica, footer anche per slot liberi e vuoti |
| `src/lib/components/DevPanel.svelte` | varianti, "Anna modifica un pasto" |
| `src/lib/i18n/messages.ts` | testi it-IT ed en-GB |

---

### Attività 1: decisioni nei documenti e branch

- [x] Creare il branch `prototipo-giro-2` da `main`.
- [x] Specifica: parte funzionale ("Una settimana tipo", "Come sceglie i piatti") senza
  avvisi; sezione 3 senza "avvisi di settimana" nel riuso; sezione 5 con concorrenza
  "vince l'ultimo salvataggio", ultima modifica senza canale, scambio nella settimana,
  "non proporre più" che apre i suggerimenti; registro delle revisioni (sezione 16).
- [x] `design/percorsi.md`: sezione "Giro 2" con perimetro, decisioni della
  preparazione, varianti e collegamento a questo piano; riga 3 della tabella in corso.
- [x] Commit.

### Attività 2: suggerimenti simulati

- [x] Tipi `RecipeExclusion { familyId, recipeId, createdBy, createdAt }` e
  `MealChange { id, slotId, actorId, channel, before, after, createdAt }`;
  `DemoDatabase.exclusions` e `DemoDatabase.mealChanges`, vuoti nel seed.
- [x] Test (prima) per `rankCandidates(db, family, slot, now)`: filtri dei candidati,
  punteggio, parità per nome, esclusioni, nessun candidato.
- [x] `getSuggestions(db, ctx, slotId)` → cinque `SuggestionView` (riepilogo, voto,
  durata) e `nextSuggestion(db, ctx, slotId)` → id della ricetta o `null`; test per la
  fine dell'elenco e per lo slot vuoto o libero.
- [x] Commit.

### Attività 3: operazioni di revisione

- [x] Test (prima), poi in `revision.ts`, tutte con controllo di `offline` e famiglia,
  aggiornamento di `updatedBy`/`updatedAt` e una riga in `mealChanges`:
  `replaceMealRecipe(slotId, recipeId)`, `proposeAnother(slotId)`,
  `setMealServings(slotId, servings)` (intero 1–20), `swapMeals(slotId, otherSlotId)`
  (stessa settimana, piatto o testo libero e nota), `setMealFree(slotId, text)`
  (1–60 caratteri), `setMealNote(slotId, note | null)` (fino a 200 caratteri),
  `excludeRecipe(recipeId)`.
- [x] Le operazioni restituiscono la `MealView` aggiornata e l'id della modifica;
  `undoMealChange(changeId)` ripristina `before` solo se lo slot è ancora uguale a
  `after` (altrimenti `not_allowed`), e registra a sua volta una modifica.
- [x] `setMealCooked` del giro 1 passa per lo stesso registro.
- [x] Commit.

### Attività 4: componenti di base

- [x] `BottomSheet` (`<dialog>` modale, titolo, chiusura con pulsante, Esc e tocco sullo
  sfondo, area sicura dell'iPhone), `ServingsStepper`, `UndoToast` (6 secondi,
  `role="status"`, sopra la navbar).
- [x] Icone `icon-edit`, `icon-swap`, `icon-shuffle`, `icon-note`, `icon-ban` nello
  stesso stile delle esistenti.
- [x] Testi it-IT ed en-GB.
- [x] Commit.

### Attività 5: ingresso alle azioni e cambio ricetta

- [x] `RecipeCard`: icona modifica in fondo al footer; footer anche per slot liberi e
  vuoti (solo modifica); slot vuoto con "Scegli una ricetta".
- [x] `MealActions` nelle varianti `sheet` e `panel`: cambia ricetta, proponimene un
  altro, porzioni, scambia, pasto libero, nota, non proporre più.
- [x] `RecipePicker` nelle varianti `list` e `cards`: cinque suggerimenti con voto
  (componente `RatingStars` del giro 1), sotto la ricerca con il pannello filtri del
  ricettario; scelta → `replaceMealRecipe` → chiusura e `UndoToast`.
- [x] "Non proporre più": conferma breve nel foglio, `excludeRecipe`, poi `RecipePicker`
  sui suggerimenti.
- [x] Pannello Prova: selettori `revisionEntry` e `suggestionLayout`; versione dello
  stato a 6.
- [x] Commit.

### Attività 6: tappa intermedia

Non eseguita come pausa: su richiesta dell'utente la scelta delle varianti passa alla
review finale.


- [x] `npm test`, `npm run check`, prova nel browser a 320, 390 e 1440 px in italiano e
  inglese.
- [x] `npm run preview:lan` e prova dell'utente su iPhone: scelta delle due varianti.
- [x] Tenere le varianti scelte, togliere le altre e le relative impostazioni; esito in
  questo piano e in `design/percorsi.md`. Commit.

### Attività 7: porzioni, scambio, pasto libero e nota

- [x] Porzioni con `ServingsStepper`, salvataggio al rilascio; ingredienti ricalcolati
  subito nella scheda.
- [x] `SwapPicker`: gli altri pasti della settimana (giorno, pasto, piatto),
  scelta → `swapMeals`; il Menu resta sul giorno corrente.
- [x] Pasto libero: campo di testo con proposte rapide dai testi liberi già usati dalla
  famiglia ("Pizza", "Cena fuori"); nota: campo di testo, "Togli la nota".
- [x] Ultima modifica: "Anna · ven 21:30" (formato del giro 1, senza canale).
- [x] Pannello Prova: "Anna modifica un pasto" (cambia il piatto di un pasto del giorno
  selezionato a nome di un altro membro), per vedere l'ultima modifica e provare
  l'annullamento descritto nel focus 1.
- [x] Commit.

### Attività 8: verifica finale e review

- [x] Test, controllo dei tipi, prova nel browser come nell'attività 6, offline
  simulato, utente inglese con unità imperiali.
- [ ] Confronto visivo con `design/index.html`.
- [x] `design/percorsi.md`: rotte, componenti e operazioni del giro; domande per la
  review. README del prototipo aggiornato.
- [x] Pubblicazione sulla rete locale e review con l'utente; esito qui e in
  `design/percorsi.md`, decisioni nella specifica. Commit di chiusura.

## Domande per la review

1. Default proposti: annullamento, "proponimene un altro" immediato, lunghezza della nota.
2. Le proposte rapide del pasto libero servono o bastano il campo di testo?
3. La regola simulata dei suggerimenti dà risultati credibili sui dati demo?

## Fuori dal giro

Elenco delle esclusioni e impostazioni della famiglia (percorso 5); spesa (percorso 4);
versione della ricetta associata ai pasti (R1, percorso 6); pianificatore reale.

## Esito dell'esecuzione (6 ottobre 2026)

Eseguito in sessione senza sotto-agenti. Le decisioni della preparazione sono
registrate come provvisorie in `design/percorsi.md` e passano nella specifica dopo la
review. Scelte prese durante lo sviluppo e domande per la review: `design/percorsi.md`,
"Giro 2".

## Esito della review (6 ottobre 2026)

Approvato dall'utente. Scelti il pannello nella scheda e i suggerimenti in schede
scorrevoli; pannello riordinato (porzioni, cambia ricetta, scambia, nota); in "Cambia
ricetta" pasto libero e "non proporre più" in cima, poi suggerimenti con "Proponimene
altri" (cinque nuovi suggerimenti nella stessa vista, al posto della sostituzione
immediata) e ricerca; voto nei suggerimenti solo visualizzato. Confermati default e
decisioni della preparazione, ora nella specifica (sezioni 1, 3, 5, 14 e 16) e in
`design/design.md`. Il confronto visivo separato con `design/index.html` non è stato
fatto: le superfici nuove sono state viste dall'utente su iPhone.
