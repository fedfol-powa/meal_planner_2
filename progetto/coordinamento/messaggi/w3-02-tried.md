# Al worker W3: due aggiornamenti dalla review di W2

- **`triedUndated`:** avrà una tabella `family_tried_recipes(family_id, recipe_id,
  source, created_at)` creata da W2. Nel bundle tienilo come oggi; nella spec scrivi che
  finisce in quella tabella (`source: 'import'`) e che il pianificatore per ora non lo
  usa. Togli dalla spec l'indicazione «da decidere nell'ondata 2».
- **R1, storico importato:** i pasti passati che citano una ricetta mostrano la prima
  versione pubblicata se il pasto precede la prima pubblicazione; se la ricetta non è mai
  pubblicata, mostrano solo nome e descrizione e non entrano nella spesa. Nessuna
  modifica al tuo import: verifica solo che la spec non dica altro.

Commit insieme alle correzioni in corso.
