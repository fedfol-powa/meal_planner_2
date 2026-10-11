# W5: correzione dalla seconda review della PR #6

Rapporto: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w5-pr6-2.md`
(«approvabile con correzioni»; C10, C11, C12 risolti).

**Regressione introdotta da C12 (importante):** con un client per lingua, ogni
`createFakeApi()` riparte dai voti demo e dal contatore `revision`
(`SessionScope.tsx:72`, `fakeApi.ts:67` e `:72`): voto confermato a 1 stella in italiano,
passaggio all'inglese → 4 stelle.

**Correzione:** un solo stato del backend finto per sessione (almeno voti e contatore di
versione), condiviso dai client delle due lingue; restano la lingua fissa per richiesta e
lo scarto delle risposte superate di C12.

**Test:** voto confermato in italiano → inglese → ritorno all'italiano, controllando scheda,
viste del Menu e liste dipendenti dal voto; più un voto dato in inglese, coerente dopo
rilettura, persistenza e ripristino. Il test deve fallire sul codice attuale.

Leggi il rapporto per eventuali note minori. Poi test (radice e `web/`), typecheck, build,
commit, push, `STATO: PR_CORRETTA` e fermati.
