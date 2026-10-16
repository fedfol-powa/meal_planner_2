# W12: seconda revisione della PR #54, un rilievo e una verifica

Rapporto: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w12-pr54-2.md`.
I rilievi precedenti sono risolti. Restano due cose:

1. **Regressione del tetto della cache:** in `storePhoto` (`web/src/pwa/sw-core.ts:134`)
   l'espulsione anticipata, con tre scritture contemporanee su 299 voci, porta a 302.
   Serializza le scritture nel service worker, per esempio con una catena di promesse a
   livello di modulo, oppure ricontrolla il limite dopo la scrittura. Mantieni la
   tolleranza agli errori e i controlli dell'epoca. Aggiungi la prova di regressione del
   revisore: 299 voci, tre risposte trattenute e liberate insieme, al massimo 300 alla fine.
2. **Prova negativa del lucchetto:** sul database locale, togli temporaneamente
   `lockRecipe` senza committare, esegui la prova di concorrenza e incolla nel pane
   l'uscita che mostra il fallimento. Poi ripristina, riesegui e incolla l'uscita verde.

La fragilità dei test del backup su un database non azzerato resta fuori da questa PR:
la apro io come issue a parte.

Commit, push e `STATO: PR_CORRETTA`. La correzione la verifica il coordinatore.
