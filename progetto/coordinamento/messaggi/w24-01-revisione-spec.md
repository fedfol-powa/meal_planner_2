# W24, messaggio 01: revisione di spec e piano

Rapporto: `progetto/coordinamento/revisioni/w24-spec-piano.md` (APPROVABILE CON CORREZIONI).

Correggi spec e piano sui rilievi 1-6 e 8-10 come proposto dal revisore. Il rilievo 7
(secondo segnale visibile nel calendario) aspetta la scelta dell'utente: te la mando con un
messaggio a parte; intanto lascia il punto aperto nella spec.

## Decisioni del coordinatore (23/10)

- **MCP:** confermata l'esclusione di `menu.getNewWeek` e `menu.markWeekSeen` dagli
  strumenti MCP (stato di visualizzazione personale); riportala come eccezione alla sezione
  13 nelle «Decisioni da riportare».
- **Miniature:** si accetta che le copie già scaricate dai client email restino; niente
  garanzia assoluta sulla scomparsa. Cache breve (`public, max-age=86400`) al posto di sette
  giorni, limite scritto nella spec e riportato come eccezione alla decisione precedente
  sulle cache HTTP.
- **Invii incerti:** confermato il compromesso: meglio nessuna email che un doppione; una
  consegna ambigua o scaduta può lasciare una persona senza email, l'avviso in app resta.
  Gli esiti incerti consumano il budget giornaliero (rilievo 1).
- **Primo rilascio:** confermati la soppressione delle email per le settimane già preparate
  e il pallino che può ricomparire una volta a chi le aveva già guardate. Per il seme,
  preferisci la soluzione più semplice fra quelle del rilievo 6 (seminare tutte le settimane
  esistenti va bene).
- **Ordine dei merge:** deciso, W23 prima di W24. Aggiungi il riallineamento a `main` dopo
  il merge di W23, prima della verifica finale e della PR (rilievo 9), e registra
  l'intersezione con W22 (`PreferencesPage.tsx`, `design/design.md`): se W22 è già unito,
  adegua il suo skeleton delle Preferenze alla nuova opzione.

Quando arriva anche la scelta sul rilievo 7, completa, committa e scrivi
`STATO: SPEC_E_PIANO_PRONTI`: secondo giro di revisione.
