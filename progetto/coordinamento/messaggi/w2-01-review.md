# Al worker W2: decisioni sulla review di spec e piano

Rapporto: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w2-spec-piano.md`
(verdetto: **da rifare**, senza cambiare stack). Dopo le correzioni ci sarà una seconda
review. Applica tutti i rilievi come proposto dal revisore, con queste scelte:

1. **`EXECUTE` (bloccante):** `revoke execute ... from public` esplicito su ogni funzione,
   nella stessa migrazione, prima dei grant selettivi; test negativi di chiamata come
   `anon` e `authenticated` delle funzioni interne, più ispezione delle ACL.
2. **Risalita alla famiglia:** solo funzioni che restituiscono l'esito
   dell'autorizzazione; i risolutori interni per i trigger non eseguibili dagli utenti.
   Test con record propri, altrui, inesistenti e dopo la rimozione.
3. **`undoes`:** stessa famiglia garantita nel database (stesso slot dove compatibile
   con lo scambio); test fra famiglie e con cancellazione della famiglia.
4. **Ingredienti e libri:** nessuna cancellazione fisica da parte dei curatori (niente
   grant `delete`); si archiviano. L'identità resta per lo storico.
5. **Bozze:** nessuna cancellazione fisica. Pubblicazione e scarto chiudono la bozza
   (`closed_at`, esito); la cronologia dei salvataggi resta per sempre; nessuna cascata
   distruttiva. Test: pubblicazione, scarto, nuova revisione della stessa ricetta.
6. **Pasti e settimane:** `update` solo sulle colonne previste dalle operazioni;
   famiglia e data della settimana, settimana e posizione dello slot immutabili; lo
   scambio aggiorna i contenuti. Test con il membro di due famiglie.
7. **Bozze citate nei pasti:** quando cambiano nome o descrizione di una ricetta in
   bozza, crescono i contatori delle famiglie che la citano nei loro pasti. Test sulla
   versione della vista familiare.
8. **Bootstrap:** famiglia identificata da un UUID dichiarato nell'input, con controlli
   sulla famiglia esistente; test con omonimie e rilancio dopo rinomina.
9. **Test isolati dal seed:** niente conteggi che dipendono dai dati di sviluppo.
10. **Nomi per W1:** W1 si sta allineando alla tua spec (`app.profiles.user_id`,
    `app.user_roles`…); nella tua spec tieni un paragrafo «Interfaccia per W1» con i nomi
    esatti.
11. **Equivalenze per preparazione:** W4 sta aggiornando la sua spec (campo
    `preparation`, la specifica vince sulla generica). Nessuna azione oltre a quanto già
    fatto.
12. **Vincolo delle quantità:** i tre casi espressi separatamente, con test delle
    combinazioni parziali.

Punti aperti, decisi dal coordinatore:

- **R1 senza versione al momento del pasto** (storico importato prima della prima
  pubblicazione, o pasto passato corretto con una ricetta pubblicata dopo): si usa la
  **prima versione pubblicata** della ricetta; se la ricetta non è mai stata pubblicata,
  il pasto mostra solo nome e descrizione e non entra nella spesa. `recipe_version_at`
  restituisce quindi la prima versione quando l'istante precede la prima pubblicazione,
  `NULL` solo se non ce n'è nessuna. Test di entrambi i casi.
- **Revoca:** nei tuoi test pgTAP verifica con lo stesso JWT (claim invariati) che la
  rimozione dalla famiglia e la revoca del ruolo di curatore abbiano effetto subito, anche
  sulle letture del catalogo. La prova con i token OAuth reali è nell'ondata 2
  («Collegamento degli agenti»); togli la promessa dal tuo primo compito.
- **`triedUndated`:** piccola tabella `family_tried_recipes(family_id, recipe_id,
  source, created_at)` per famiglia, con RLS di famiglia, riempita dall'import; il
  pianificatore per ora non la usa. Lo giro a W3.
- **Contatori:** contratto unico «al massimo un incremento per transazione che cambia i
  dati letti», con il tuo meccanismo per riga deduplicato. W1 si allinea. Test con
  transazioni reali distinte e con rollback.

Correggi spec e piano, commit, poi `STATO: SPEC_E_PIANO_CORRETTI`.
