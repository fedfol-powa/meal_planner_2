# W14: rilievi della revisione della PR #61

Rapporto completo: `progetto/coordinamento/revisioni/w14-pr61.md` (DA CORREGGERE). Leggilo.
Decisioni del coordinatore:

1. **V1:** classificala come non superata finché non passa davvero. Rendi esplicita e
   verificabile nella skill la lettura del piano generale (e di brief e protocollo dei
   worker attivi) nella procedura di ripresa, poi ripeti V1 sul commit corretto e
   documenta separatamente: skill caricata; letture di registro, piano e documenti
   pertinenti; stato ricostruito e attesa del via; Monitor non armabile nell'ambiente
   simulato (limite dichiarato, non difetto). Se dopo due giri non passa, `STATO: DOMANDA`.
2. **Regola della CI per il merge:** il controllo obbligatorio è `check` (workflow `CI`):
   deve esserci ed essere `pass`. Altri controlli `skipping` (oggi `Supabase Preview`)
   non bloccano. Blocca se `check` manca, è `fail`, `pending` o `cancel`, e se un
   qualsiasi controllo è `fail`. Scrivi il comando che lo verifica (per esempio con
   `--json name,bucket`), non solo il codice di uscita di `gh`.
3. **Memoria `meal-planner-round-workflow`:** la preferenza «poche azioni di primo
   livello, quelle secondarie raggruppate nella vista principale» va conservata. Nella
   consegna: trasferiscila prima di cancellare il file (in memoria come nota a sé, o nella
   specifica principale sezione 14 se è una regola di design: proponila nelle «Decisioni
   da riportare»). Aggiorna specifica, matrice e consegna.
4. **Matrice, riga 23:** la distribuzione vigente resta: push e apertura della PR del
   worker (protocollo), merge del coordinatore dopo revisione chiusa e CI. Correggi la
   riga e la sua fonte.

Aggiorna anche nella descrizione della PR il conteggio di righe della skill. Commit, push,
descrizione della PR aggiornata, poi `STATO: PR_CORRETTA`.
