# Prototipo, giro 5: Curatela — piano

> **Esecuzione:** inline, senza subagenti e senza tappa intermedia (metodo dei giri
> precedenti): si sviluppa tutto il giro, poi review sull'output su iPhone. I passi
> usano le caselle (`- [ ]`) per il tracciamento.

**Obiettivo:** rendere provabile su iPhone l'intero percorso 6 (specifica, sezione 8 e
parte funzionale "Il ricettario"; sezione 14, elenco dei contenuti del prototipo):
bozze condivise fra curatori, ripresa e pubblicazione, modulo manuale senza AI con
verifica e correzione, modifica di ricette pubblicate anche altrui, versioni con
confronto e ripristino, archiviazione, conflitti fra curatori e semantica R1 delle
versioni nei pasti.

**Architettura:** quella dei giri precedenti (`design/percorsi.md`, "Architettura del
prototipo"). Nuove operazioni simulate in `src/lib/operations/curation.ts`; la
validazione della ricetta diventa un modulo di dominio unico
(`src/lib/domain/recipe-validation.ts`), lo stesso che userà il percorso 7 (MCP) e
l'importazione. Le operazioni ricevono il contesto, controllano il ruolo di curatore e
restituiscono errori strutturati (permesso mancante, dato non valido con l'elenco dei
problemi per campo, conflitto con i campi cambiati).

**Stack:** invariato (SvelteKit, Svelte 5 runes, TypeScript, Vitest). Nessuna nuova
dipendenza.

**Riferimenti da leggere prima di iniziare:** specifica, sezioni 2 (`recipes`,
`recipe_ingredients`), 5, 6, 8, 12, 15 ("Completezza delle ricette", "Ciclo di
curatela", "Backup e ripristino") e 17 (R1); `design/percorsi.md`; `design/design.md`
e `design/index.html` (moduli, pulsanti, chip, liste, fogli, menu "…");
`prototype/README.md`.

## Decisioni della preparazione (6 ottobre 2026, provvisorie)

Registrate come provvisorie in `design/percorsi.md`; entrano nella specifica solo alla
chiusura del giro, dopo averle viste funzionare.

1. **Un solo giro** per tutto il percorso 6, compreso il modulo manuale (la sua
   presenza nel prototipo non anticipa la priorità M6).
2. **Versione nei pasti (R1):** i pasti passati restano sulla versione in vigore
   quando sono stati mangiati; quelli di oggi e futuri passano subito alla nuova
   versione, e la lista della spesa segue (le voci spuntate che aumentano tornano da
   spuntare con "prima: …", come già avviene).
3. **Modifica di una ricetta pubblicata:** «Modifica» crea una **bozza di revisione**
   collegata alla ricetta; le famiglie vedono la versione pubblicata finché la bozza
   non passa la verifica e viene pubblicata come nuova versione. La bozza compare
   nella sezione Bozze come le altre.
4. **Conflitti fra curatori:** il salvataggio di chi arriva secondo è rifiutato con
   «Lucia ha modificato questa bozza alle 18:42», i campi cambiati da entrambi e la
   scelta tra prendere la sua versione o sovrascriverla consapevolmente; la versione
   scartata resta recuperabile.
5. **Archiviazione reversibile:** qualunque curatore archivia una ricetta pubblicata;
   esce da ricettario e suggerimenti, i pasti passati restano leggibili, quelli futuri
   restano finché la famiglia non li cambia. Si ripristina da un elenco «Archiviate»
   sotto le Bozze.
6. **Ripristino di una versione:** dopo il confronto e una conferma, la vecchia
   versione è ripubblicata subito come nuova versione, se passa la verifica di oggi;
   lo storico resta intero.
7. **Caricamento da file:** non in questo giro; resta aperto nella sezione 15.

**Default proposti nel piano** (da confermare approvando il piano):

- **Ingressi:** per i curatori il Ricettario ha in alto un «+» (Nuova ricetta) e, sotto
  le Bozze, la sezione richiudibile «Archiviate». La voce «Curatela» del Profilo apre
  il Ricettario con le Bozze aperte. Nella scheda ricetta, per i curatori, un menu
  «…» in alto a destra (come nella lista della spesa): Modifica, Versioni, Archivia
  (o Ripristina dall'archivio). Ai membri nulla cambia.
- **Bozze:** ogni voce mostra nome, «Nuova» o «Modifica di una ricetta pubblicata»,
  autore, ultima modifica (persona e momento, senza canale come nel giro 2) e i dati
  che mancano. Una bozza si apre direttamente nel modulo.
- **Modulo:** sezioni Nomi e descrizione (italiano e inglese affiancati), Fonte (tipo,
  URL o libro e pagine), Pasto (pranzo/cena/entrambi, gruppo proteico, durata),
  Porzioni di riferimento, Ingredienti (riga: ingrediente dal catalogo o nuovo con
  nome nelle due lingue e reparto; quantità e unità, oppure «q.b.», oppure testo nelle
  due lingue; testo della fonte; opzionale). Niente foto nuove: la foto esistente
  resta, le ricette nuove sono senza foto.
- **Salvataggio esplicito:** «Salva bozza» in fondo al modulo (fisso), perché il
  controllo dei conflitti ha senso su un salvataggio voluto; uscendo con modifiche non
  salvate si chiede se salvarle. Il salvataggio controlla solo i dati presenti (formati,
  numeri positivi, URL), non quelli mancanti.
- **Verifica e pubblicazione:** «Verifica» esegue la validazione completa e mostra i
  problemi in cima e accanto ai campi, ciascuno con un collegamento al campo.
  «Pubblica» è attivo solo se l'ultima verifica riguarda la versione salvata
  corrente ed è passata; qualunque modifica la invalida. Alla pubblicazione la
  verifica si ripete; una revisione diventa la versione successiva della ricetta.
  Una bozza nuova pubblicata entra nel ricettario con la data di oggi.
- **Scarta bozza:** chiunque fra i curatori scarta una bozza di revisione o elimina
  una bozza nuova mai pubblicata, con conferma rossa; una bozza nuova già usata da un
  pasto passato (le quattro importate) non si elimina.
- **Versioni:** pagina con l'elenco (numero, autore, data, «ripristinata dalla
  versione N»); toccando una versione si vede il confronto con la corrente, campo per
  campo e riga per riga degli ingredienti, con aggiunte, tolte e cambiate.
  «Ripristina questa versione» in fondo al confronto.
- **Ambito del ripristino (R1):** il ripristino di una ricetta riporta solo i suoi
  campi e le sue righe di ingredienti; gli ingredienti del catalogo (nomi, reparto)
  sono entità condivise e non vengono riavvolti. Se un ingrediente della vecchia
  versione non esiste più, la verifica lo segnala e il ripristino non avviene.
- **Ricetta archiviata:** per i curatori la scheda ha l'etichetta «Archiviata»; per i
  membri la scheda si apre dai pasti come prima ma non compare in ricerca e
  suggerimenti. Il voto resta possibile dai pasti.
- **Offline simulato:** curatela in sola consultazione, come il resto dell'app tranne
  la lista della spesa.

## Varianti da scegliere su iPhone

Nel pannello Prova, da tenere o togliere nella review:

- **Forma del modulo:** (a) pagina unica a sezioni con un indice in alto; (b) a passi
  (Nomi, Fonte, Pasto e porzioni, Ingredienti, Verifica) con `Stepper`, come il wizard
  del giro 4.
- **Lingue nel modulo:** (a) italiano e inglese uno sotto l'altro per ogni campo;
  (b) selettore di lingua in cima al modulo, con un segno sui campi che mancano
  nell'altra lingua.

## Simulazione dei dati

Dichiarata nell'interfaccia dove serve e in `design/percorsi.md`.

- **Seconda curatrice:** Lucia (amministratrice dei Nonni) diventa curatrice, per
  modifiche di ricette altrui e conflitti.
- **Versioni demo:** ogni ricetta pubblicata ha la versione 1 di Federico alla data
  di aggiunta (importazione). Una ricetta della settimana del 5 ottobre ha una
  versione 2 di Lucia del 6 ottobre che corregge una dose: il pasto passato mostra la
  versione 1, la lista della settimana corrente la 2 (R1 visibile).
- **Bozze demo:** le quattro bozze importate (autore Federico); una bozza nuova di
  Lucia a metà (nomi solo in italiano, ingredienti parziali); una bozza di revisione
  di Lucia su una ricetta di Federico, già verificata.
- **Archiviata demo:** una ricetta mai pianificata dopo settembre, archiviata da
  Federico.
- **Pannello Prova:** «Un'altra curatrice salva la bozza aperta» (per provare il
  conflitto) e le varianti del giro.

## Modello simulato

- `RecipeStatus` aggiunge `archived`; `Recipe` aggiunge `createdBy`, `version`,
  `archivedBy`/`archivedAt`. Il contenuto modificabile si raccoglie in
  `RecipeContent` (nomi, descrizione, fonte, durata, porzioni, pasto, gruppo,
  ingredienti); `Recipe` contiene il contenuto corrente.
- `RecipeVersion { recipeId, version, content, publishedBy, publishedAt,
  restoredFrom }`: storico in sola aggiunta.
- `RecipeDraft { id, recipeId, kind: 'new' | 'revision', baseVersion, content,
  createdBy, updatedBy, updatedAt, revision, verifiedRevision }`: tutte le bozze.
  Una bozza nuova ha una `Recipe` in stato `draft` (serve ai pasti passati che la
  citano, come le quattro importate) il cui contenuto segue la bozza.
- `revision` cresce a ogni salvataggio; un salvataggio con `revision` diversa da
  quella letta restituisce `conflict` con autore, momento e campi cambiati, a meno di
  `overwrite: true`; il contenuto sovrascritto si conserva in `discardedContent`.
- **R1 nella lettura:** per un pasto passato si usa la versione in vigore al momento in
  cui il pasto è diventato passato (pranzo 15:30, cena 23:00 della data); per gli
  altri il contenuto corrente. Vale per scheda del pasto, scheda ricetta aperta dal
  pasto e lista della spesa.

## Struttura dei file

- `src/lib/domain/types.ts`: tipi sopra; `DemoDatabase` con `recipeVersions`,
  `recipeDrafts`.
- `src/lib/domain/recipe-validation.ts` (+ test): `validateForSave`,
  `validateForPublish` con problemi per campo; `missingData` di `access.ts` diventa
  un riepilogo della validazione.
- `src/lib/operations/curation.ts` (+ test): `getCurationOverview` (bozze e
  archiviate), `createDraft`, `startRevision`, `getDraft`, `saveDraft`, `verifyDraft`,
  `publishDraft`, `discardDraft`, `getRecipeVersions`, `compareVersions`,
  `restoreVersion`, `archiveRecipe`, `unarchiveRecipe`, `createIngredient`; lettura
  della versione per data in `access.ts`.
- `src/lib/demo-data/seed.ts`: Lucia curatrice, versioni, bozze, archiviata; versione
  dello stato salvato incrementata.
- Rotte: `/recipes/new`, `/recipes/drafts/[id]` (modulo), `/recipes/[id]/versions`,
  `/recipes/[id]/versions/[n]` (confronto e ripristino).
- Componenti: `RecipeForm` (con le due varianti), `IngredientRowEditor`,
  `ValidationSummary`, `ConflictSheet`, `VersionDiff`, `DraftRow`; riuso di
  `PageHeader`, `BottomSheet`, `ConfirmDanger`, `StateNotice`, `UndoToast`, `Stepper`.
- Testi it-IT ed en-GB in `src/lib/i18n/messages.ts`.

## Attività

### Attività 1: decisioni nei documenti e branch

- [x] Branch `prototipo-giro-5` da `main`.
- [ ] `design/percorsi.md`: sezione "Giro 5" con perimetro, decisioni provvisorie,
      varianti e simulazione; tabella dei percorsi aggiornata.
- [ ] Commit del piano e dei documenti.

### Attività 2: modello, validazione e dati demo

- [ ] Tipi, validazione condivisa (test prima), seed con versioni, bozze, archiviata
      e Lucia curatrice; versione dello stato salvato.
- [ ] Test sui dati: ogni ricetta pubblicata ha almeno una versione e il suo contenuto
      coincide con l'ultima; le bozze importate falliscono la verifica per i motivi
      attesi.
- [ ] Commit.

### Attività 3: operazioni (test prima)

- [ ] Permessi: solo i curatori; offline in sola lettura.
- [ ] Bozze: creazione, salvataggio parziale, conflitto e sovrascrittura consapevole,
      verifica invalidata da una modifica, pubblicazione con nuova verifica, scarto.
- [ ] Revisione: bozza collegata, le famiglie vedono la versione pubblicata fino alla
      pubblicazione.
- [ ] R1: pasto passato sulla vecchia versione, pasti futuri e spesa sulla nuova.
- [ ] Versioni: confronto, ripristino come nuova versione, ingrediente mancante.
- [ ] Archiviazione: fuori da ricerca e suggerimenti, pasti leggibili, ripristino.
- [ ] Commit.

### Attività 4: viste

- [ ] Ricettario: «+», Bozze arricchite, Archiviate; Profilo → Curatela.
- [ ] Modulo con le due varianti, verifica, pubblicazione, conflitto, uscita con
      modifiche non salvate.
- [ ] Scheda ricetta: menu «…», versioni, confronto e ripristino, archiviazione.
- [ ] Pannello Prova: conflitto simulato e varianti.
- [ ] Testi it-IT ed en-GB.
- [ ] Commit.

### Attività 5: verifica e review

- [ ] `npm test`, `npm run check`; prova nel browser a 320, 390 e 1440 px, italiano e
      inglese, come curatore e come membro, offline.
- [ ] Confronto visivo con `design/index.html`.
- [ ] `design/percorsi.md`: rotte, componenti, operazioni, domande per la review;
      README del prototipo.
- [ ] `npm run preview:lan` e review dell'utente su iPhone; esito qui e in
      `design/percorsi.md`; alla chiusura, decisioni nella specifica (sezioni 2, 5, 8,
      parte funzionale "Il ricettario", 15 "Ciclo di curatela", "Backup e ripristino",
      "Caricamento da file", e 17 per R1).

## Domande per la review (bozza)

1. Varianti: modulo a pagina unica o a passi; lingue affiancate o con selettore.
2. Verifica esplicita prima di «Pubblica»: chiara o è un passaggio di troppo?
3. R1: la differenza tra pasto passato e lista della settimana dopo una correzione si
   capisce, o serve un segno «versione precedente» sul pasto passato?
4. Confronto delle versioni: leggibile su iPhone?
5. Avviso di conflitto: comprensibile e sufficiente?
6. Archiviate sotto le Bozze nel Ricettario o altrove?

## Fuori dal giro

Percorso guidato via MCP e conversazioni simulate (percorso 7); ripristino
dell'intero catalogo e backup (percorso 8); caricamento da file; foto delle ricette;
traduzione automatica (esclusa dalla specifica nel percorso manuale); pianificatore
reale.
