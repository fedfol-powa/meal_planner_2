# Spunti da Cuicuit: appunti in sospeso

Stato: appunti del 22 ottobre 2026 fra l'utente e il coordinatore, **in sospeso**: l'utente
ci vuole pensare prima di procedere. Non sono decisioni della specifica principale finché
l'utente non dà il via al piano qui sotto.

## Fonte

[Cuicuit](https://github.com/MadeInPierre/cuicuit) (SvelteKit, Supabase, licenza
**AGPL-3.0**), letto al commit `ba36897`. Le idee si reimplementano da zero, il codice non
si copia: in un'app servita in rete l'AGPL obbligherebbe a pubblicare i sorgenti (decisione
dell'utente: «li considero tutti come spunti, poi reimplementiamo il codice»).

## Come funziona il loro importer

File principali: `src/lib/core/operations/recipes/import-from-url-helpers.ts`,
`scrape-helpers.ts`, `enrich-helpers.ts`, `src/lib/features/recipes/modules/recipe-scrape/`.

1. **Cache condivisa per URL**: indirizzo normalizzato (via `utm_*`, `mtm_*`, `fbclid`,
   `gclid`, `ref`, `source`, `spm`, frammento, credenziali, porta di default, barra finale;
   host minuscolo), impronta sha256 come chiave di `recipes_cache` con lettura e output
   dell'LLM; il collegamento al catalogo si rifà a ogni import.
2. **Catena di strategie dalla più economica**, fino alla prima che passa il controllo di
   qualità: lettura diretta e JSON-LD; servizio Python `recipe-scrapers`; Geonode e
   Firecrawl (Markdown, a pagamento); ScrapeCreators e Supadata per i social
   (didascalia, poi sottotitoli, poi trascrizione AI), che passano in testa sui link
   social. Controllo di qualità sulle coppie quantità più unità, non solo sulle parole
   chiave. Ogni tentativo registrato con esito, tempo e motivo.
3. **LLM** (Vercel AI SDK con fornitori di riserva, output strutturato zod): ingredienti in
   quantità/unità/nome/preparazione, tempi, filtri, passaggi riscritti; il prompt chiede di
   **inventare le quantità mancanti** e di non lasciare campi vuoti.
4. **Collegamento al catalogo**: pulizia per lingua (articoli, verbi, unità) e RPC Postgres
   `match_ingredient` (ricerca testuale, prefissi, singolare/plurale); prende in automatico
   il primo risultato, altrimenti ingrediente libero. Poi immagine e addebito di un credito.

## Spunti da reimplementare per l'evolutiva E (ricetta da un link, senza AI)

1. Ricerca robusta del JSON-LD: `@graph`, `mainEntity`, `mainEntityOfPage`,
   `itemListElement`, array, `@type` come array, immagine come stringa, `ImageObject` o
   array (con `HTMLRewriter` sul Worker).
2. Normalizzazione degli URL per riconoscere i link già usati (domanda aperta di E).
3. Esiti dei tentativi classificati (403, 429 e 5xx come «bloccato», «scaduto», «nessun
   contenuto»), salvati e mostrati al curatore per spiegare perché resta solo il link.
4. Proposte di collegamento al catalogo per le righe estratte (pulizia per lingua più
   ricerca su nomi e sinonimi), **solo come suggerimento** confermato da curatore o agente.

Da non prendere: LLM che inventa quantità, collegamento automatico al primo risultato,
social e servizi a pagamento (esclusi dall'utente per E), servizio Python, crediti,
Web Share Target (non funziona su iPhone).

Altri spunti fuori dall'importer, da valutare: suggerimenti nella spesa dalle voci libere
aggiunte spesso; nota «novità» nell'app dopo un rilascio (ultimo changelog visto per
utente); ordine dei reparti personalizzabile (da verificare se serve).

## Decisioni dell'utente del 22 ottobre 2026 (in sospeso con il resto)

- **LLM nell'app**: l'utente valuta di attivarlo, perché fare tutto dall'app sarebbe
  comodo. Ribalterebbe la decisione del percorso manuale senza AI (specifica principale,
  3 ottobre e quinto giro). Riservato ai **curatori con un permesso assegnato a mano**
  dall'amministratore dell'app («curatore con AI»), costi del modello a carico
  dell'utente; niente pagamenti nell'app.
- **Scheda ricetta strutturata**, sul modello di Cuicuit
  (`src/routes/(app)/recipes/[id]/+page.svelte`): tempi di preparazione, cottura, riposo
  e totale; procedimento letto nell'app invece di aprire la fonte.
- **Procedimento riscritto con parole nostre**, link alla fonte sempre in vista; niente
  procedimento per le ricette da libro (rischio sui diritti d'autore dei testi).
- **Ordine**: prima la scheda strutturata (riempita via agente), poi E senza AI, poi la
  modifica delle bozze nell'app con l'AI per i curatori con il permesso.

## Vincoli da rispettare se si procede

- Il modello estrae solo righe presenti nella fonte e conserva `source_text`; una quantità
  assente resta «q.b.», mai inventata; collegamenti al catalogo e attributi del
  pianificatore sono proposte confermate dal curatore; pubblicazione solo dopo il suo sì.
- «Fare tutto dall'app» richiede la modifica e la pubblicazione delle bozze nell'app (il
  percorso manuale, oggi ultima priorità): è un prerequisito dell'AI nell'app.
- La scheda strutturata tocca documento ricetta, versioni, YAML, MCP, `catalogue.getGuide`
  e richiede di riempire le ricette esistenti; il linguaggio visivo cambia solo con
  l'accordo dell'utente.

## Piano proposto, da approvare

1. Aggiornare la descrizione di E con gli spunti 1–4 e la nota che l'AI arriva in
   un'evolutiva successiva.
2. Brainstorming con l'utente per la descrizione della scheda strutturata (tempi,
   procedimento, cosa apre il tocco sul pasto, eventuali etichette di impegno e
   difficoltà, riempimento delle ricette esistenti, impatto su schema e MCP); poi
   prototipo da un worker, con varianti nel pannello Prova.
3. Paragrafo nel piano generale per l'evolutiva «Completa con AI nell'app».
4. Decisioni nel registro e, dopo il merge, nella specifica principale.
