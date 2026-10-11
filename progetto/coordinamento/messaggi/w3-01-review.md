# Al worker W3: decisioni sulla review di spec e piano

Rapporto: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w3-spec-piano.md`
(verdetto: approvabile con correzioni). Applica tutti i rilievi con queste scelte:

1. **Righe irrisolte (bloccante).** Non si scartano: restano nel documento della bozza
   come righe con `ingredientId: null` e `sourceText` d'origine (più la nota del motivo
   nel report). Il livello bozza le ammette, `checkPublishable` le segnala
   (`unknown_ingredient` o `required`), quindi il blocco sopravvive al salvataggio senza
   colonne nuove in W2. Le righe che dopo la mappatura risultano duplicate restano
   entrambe e producono un problema di pubblicazione. Test completo: import → JSON →
   bozza → `checkPublishable` non vuoto.
2. **`toPublished`:** normalizza i campi assenti non pertinenti a `null` e `seasons` a
   `[]`; test dell'invariante «nessun problema di pubblicazione ⇒ `toPublished` riesce».
3. **Typecheck:** validazione degli URL senza il tipo globale `URL` (o con una
   dichiarazione minima compatibile con il `tsconfig` di `domain/`), `both` tipizzato con
   `DraftLocalized`.
4. **Test sui dati reali:** `runImport` in `beforeAll`; la CI non ha l'origine.
5. **Duplicati nelle bozze:** nel livello bozza un duplicato è un problema di
   pubblicazione, mai un errore di salvataggio; il confronto si fa solo quando entrambe le
   righe hanno la varietà italiana. Test con sole varietà inglesi e lingue miste.
6. **Date dello storico:** valida formato, esistenza e lunedì; voci invalide scartate e
   segnalate; `--today` invalido rifiutato subito. Test.
7. **Rilancio:** selezione delle schede nuove prima delle validazioni sul loro contenuto;
   test del comando con una scheda già importata modificata e una nuova valida.
8. **Approvazione dei YAML legata al contenuto:** l'intestazione registra data e hash
   del contenuto revisionato; se l'hash non torna il file risulta da rivedere. Test.
9. **Nota sulle quantità ambigue** conservata anche nel ripiego testuale, con il caso
   reale «145 g crudo (330 g cotto)».

Punti aperti, decisi dal coordinatore:

- **Equivalenze e preparazione:** un'equivalenza (di ricetta o di spesa) può avere una
  `preparation` facoltativa (testo italiano normalizzato); si applica a una riga solo se
  la preparazione coincide, oppure se l'equivalenza non ne ha. Se nessuna si applica, la
  tazza resta tale e la ricetta resta in bozza. L'ho girato a W4 e W2.
- **Proprietà dei tipi:** W4 possiede `Localized`, `Quantity` completa, codici e schemi
  delle unità; W3 possiede le varianti di bozza (`DraftLocalized`, quantità parziale)
  costruite sopra i tipi di W4, senza ridefinirli.
- **`triedUndated`:** resta nel bundle e nel report; dove conservarlo e come lo usa il
  pianificatore si decide nell'ondata 2 (registrato nel piano generale). Non dichiararlo
  chiuso nella spec.

Correggi spec e piano, commit, poi `STATO: SPEC_E_PIANO_CORRETTI`.
