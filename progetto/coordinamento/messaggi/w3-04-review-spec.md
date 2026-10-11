# W3 — review di spec e piano della gestione del ricettario

Rapporto: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w3-catalogue-spec-piano.md`. Verdetto «da
rifare», nessuna nuova decisione di prodotto. Correggi tutti i rilievi (1-12) come propone
il revisore, con queste decisioni del coordinatore:

- **Rilievo 1:** aggiungi `catalogue.getIngredient` (lettura, versionata) che restituisce la
  vista completa dell'ingrediente: versione, nomi, sinonimi, reparto, dispensa, equivalenze
  con il loro id. È l'interfaccia per modificare un ingrediente da una conversazione nuova.
- **Rilievo 2:** il supporto web di `not_allowed` (tipo e testi nelle due lingue) entra
  nella **prima** PR, con la modifica minima ai file condivisi del web.
- **Rilievo 3:** `server/src/catalogue/write.ts` conserva l'identità degli ingredienti
  dell'import (slug o id stabili) e ha le stesse firme in spec e piano: scrivile come
  definitive, le registro io.
- **Rilievo 7 (R1):** l'istante della pubblicazione registrato in `recipe_versions` è quello
  della scrittura (`clock_timestamp()` al momento dell'inserimento, dopo i blocchi), non
  l'inizio della richiesta; test condiviso con il caso del menu a cavallo della soglia.
- **Rilievi 8-10 (web):** `catalogue` registrato in `SERVER_AREAS`; le sezioni si montano in
  `RecipesPage` in modo indipendente dalla famiglia, quindi visibili anche a un curatore
  senza famiglia; dopo un rifiuto del server (`forbidden`, revoca del ruolo) le viste del
  catalogo si rimuovono. Il web parte comunque dopo il merge delle PR web di W2 (#18) e W6
  (#19).

Commit, `STATO: SPEC_E_PIANO_CORRETTI`, e aspetta: segue una seconda review breve.
