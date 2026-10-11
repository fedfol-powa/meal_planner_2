# Al worker W2: seconda review di spec e piano, poi implementazione

Rapporto: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w2-spec-piano-2.md`.
I rilievi della prima review risultano risolti; restano sei punti. Correggi così:

1. **Trigger della data:** il controllo della data dello slot non deve leggere settimane
   non autorizzate: verifica l'accesso prima di usare i dati (percorso del job
   conservato). Test con settimana propria, altrui e inesistente e date esterne: i due
   casi non autorizzati hanno esito indistinguibile.
2. **Autori delle bozze chiuse:** contenuto, revisione, identità ed esito immutabili, ma
   l'azzeramento dei riferimenti personali da `ON DELETE SET NULL` è ammesso. Test di
   cancellazione di creatore, ultimo modificatore e chi ha chiuso.
3. **Test del bootstrap:** sostituisci solo i valori dell'input; UUID espliciti per le
   famiglie di prova e pulizia solo per UUID; una famiglia omonima estranea deve
   sopravvivere.
4. **Fixture e asserzioni:** utenti e slot identificati per UUID; regressione dello
   spostamento fra le due famiglie di Anna; lettura della bozza citata dopo la rimozione
   del membro.
5. **Nomi degli autori per i curatori** (decisione del coordinatore): una funzione o
   vista `security definer` che restituisce solo `user_id` e `display_name` degli utenti
   che compaiono come autori in bozze, salvataggi, versioni e storico degli stati,
   leggibile solo da `recipe_curator` (e dal job se serve). Nessun altro campo del
   profilo, nessun accesso per gli utenti ordinari. Test con due curatori senza famiglie
   in comune.
6. **Scritture senza effetti:** accettato come comportamento. Il contratto diventa «al
   massimo un incremento per transazione; una scrittura senza effetti può farlo crescere
   comunque (invalidazione in più, mai dati sbagliati)». Aggiorna la spec, nessun test
   in più.

**Niente terza review di spec e piano:** dopo le correzioni passi direttamente
all'implementazione con TDD; gli errori dei test emergeranno eseguendoli, e la review
avversariale della PR farà da controllo finale. Quindi: correggi, commit, poi esegui il
piano, push e PR come da protocollo, `STATO: PR_APERTA <url>`. Nessun passo sul
progetto Supabase remoto.
