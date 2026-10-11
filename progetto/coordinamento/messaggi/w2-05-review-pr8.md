# W2: correzione dalla review della PR #8

Rapporto: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w2-pr8.md`
(«approvabile con correzioni», un rilievo).

`btrim(source)` toglie solo gli spazi ordinari: una fonte `E'\t\n'` o con spazi non
separabili passa, mentre il dominio (`z.string().trim().min(1)`) la rifiuta. Allinea il
check all'insieme di caratteri del `trim` di JavaScript: `\t \n \v \f \r`, spazio,
`U+00A0 U+1680 U+2000–U+200A U+2028 U+2029 U+202F U+205F U+3000 U+FEFF` (per esempio un
check con espressione regolare che rifiuta le stringhe composte solo da questi caratteri).
Modifica la migrazione della PR #8 (non ancora unita né applicata). Test pgTAP: stringa
vuota, tabulazioni, a capo, spazio non separabile, `U+3000`, sia in `insert` sia in
`update source` da curatore; più un caso valido con spazi attorno al testo. Esegui tutta
la suite, poi commit, push, `STATO: PR_CORRETTA` e fermati.
