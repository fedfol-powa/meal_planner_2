# W4: correzioni dalla review della PR #7

Rapporto completo: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w4-pr7.md`
(verdetto «approvabile con correzioni»). Correggi i tre rilievi, con TDD:

1. **Importante — equivalenze ambigue nel percorso ricetta/import:** `findEquivalence`
   (`domain/src/units/equivalence.ts:67`) sceglie con `find` senza
   `assertUnambiguousEquivalences`. Garantisci l'univocità anche lì (o un percorso pubblico
   di selezione e applicazione che la garantisca). Test con ordine invertito, ambito
   `recipe`, senza preparazione e con la stessa preparazione specifica.
2. **Minore — arrotondamento imperiale instabile ai punti intermedi**
   (`domain/src/units/present.ts:40`): 14,5 oz → «14 oz», 14 + 0,5 oz → «15 oz». Rendi
   l'arrotondamento stabile rispetto al rumore numerico, senza toccare i valori canonici.
   Regressione su quantità singola contro somme equivalenti, più valori appena sotto e
   sopra la soglia.
3. **Minore — `combinedQuantitySchema` accetta chiavi testuali incoerenti o duplicate**
   (`domain/src/units/combined.ts:18`): verifica `key === textKey(text['it-IT'])` e
   l'unicità delle chiavi; test per chiavi incoerenti, non normalizzate e duplicate.

Nota: la fonte delle equivalenze resta obbligatoria nel dominio; il database si allinea con
la PR #8 di W2. Nel frattempo la PR #5 (piattaforma) è stata unita su `main`: fai rebase
su `origin/main` prima del push.

Poi `npm test` e `npm run typecheck`, commit, push, scrivi `STATO: PR_CORRETTA` e fermati.
