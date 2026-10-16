# W11: rilievi della terza revisione di spec e piano (16/10)

Leggi `progetto/coordinamento/revisioni/w11-spec-piano-3.md` (DA CORREGGERE, nessun
bloccante) e accogli i quattro rilievi. Indicazioni del coordinatore, per chiuderli nel
modo più semplice:

1. **Pulizia per email:** un lucchetto consultivo per email normalizzata
   (`hashtextextended('registration_email:' || email, 0)`), preso da `claim` prima della
   famiglia (l'email è nell'input) e dalla cancellazione per l'email dell'account,
   subito dopo il lucchetto dell'utente. Ordine completo: `app_admin_roles` → utente →
   email → famiglie per id → link → prenotazioni. Aggiornalo nella sezione
   «Interfaccia». Test con L1 sospeso fra inserimento e commit.
2. **Stessa email alla decima quota:** con il lucchetto per email del punto 1 le due
   richieste della stessa email si serializzano prima di tutto il resto; dopo
   l'attesa la seconda rilegge la prenotazione e la trova. Scrivi i passi in
   quest'ordine (prenotazione esistente prima dei controlli di una registrazione nuova)
   e tieni il test.
3. **Ripristino fra schede:** semplifica. Il server resta la sola fonte: persisti per
   famiglia sia `revokedAt` sia `restoredAt` e decidi l'accesso confrontandoli; ogni
   revoca ricevuta, anche se superata da un ripristino, **toglie comunque** i dati della
   famiglia salvati prima di quell'istante (cache, coda della spesa); dopo un
   ripristino i dati si rileggono dal server. Se una soluzione ancora più semplice
   ottiene le stesse garanzie (per esempio: ogni messaggio fra schede fa solo pulire e
   rileggere il profilo dal server), preferiscila e motivala. Test come chiesti dal
   revisore.
4. **Contratti cancellati per errore:** ripristina dalla versione 62f8022 le tabelle e
   gli schemi delle aree `family` e `account` (operazioni, input/output, errori, regole
   MCP, `connectedAgents`), integrandoli con le correzioni successive; controlla che
   ogni rimando del piano trovi la sua definizione.

Poi commit e `STATO: SPEC_E_PIANO_CORRETTI`. La prossima revisione verificherà solo
questi quattro punti e le parti toccate.
