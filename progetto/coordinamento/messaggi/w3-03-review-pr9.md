# W3 — rilievi della review della PR #9

Rapporto: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w3-pr9.md`.
Verdetto «approvabile con correzioni». La review è stata fatta sul commit `7c597cf`,
prima che tu segnassi le approvazioni dei YAML.

## Da correggere

- **1** — `toPublished` (e la normalizzazione delle bozze) trasforma in `null` tutti i
  campi della fonte vuoti o di soli spazi, con lo stesso criterio dei controlli. Test con
  `''`, spazi, `null`, chiave omessa, verificando proiezione, `resolveReferences` e
  pianificatore.
- **2** — niente scelta automatica fra 1 e 1000: un numero con punto seguito da
  esattamente tre cifre (`1.000`, `1.500`) è ambiguo e diventa quantità testuale con
  segnalazione nel report; virgola come decimale; forme miste testuali e segnalate.
  Test di regressione.
- **4** — la pagina di revisione riceve un catalogo completo degli ingredienti per i
  nomi (esistenti più nuovi), distinto da quelli da inserire. Test con un ingrediente
  esistente usato da una ricetta nuova.
- **5** — `--today` **obbligatorio** nel comando dell'import (decisione del
  coordinatore): niente data predefinita. Aggiorna spec, piano e istruzioni d'uso.
- **6** — un solo vocabolario delle parole ignorate: `domain/src/recipe/variety.ts`
  importa quello di `domain/src/shopping/variety.ts` (di W4, già su `main`; aggiungi
  l'export lì se serve, è una modifica minima e ammessa).
- **7** — test con `bookId` non nullo (dopo `resolveReferences`) e firma di
  `toPlannerRecipe(id, document)` aggiornata nella spec e nel piano.

## Da non toccare

- **Rilievo 3 («Sale e pepe»)** e punti da decidere 1–2: scelte già approvate
  dall'utente insieme ai YAML. Nessuna modifica.
- **I quattro YAML**: non modificarli, l'approvazione è legata all'hash del contenuto.
  Se una correzione cambia l'output dell'import (bundle, report), va bene; se ti
  sembra che serva cambiare un YAML, fermati e chiedi.

Poi: test, typecheck, push, `STATO: PR_CORRETTA` e aspetta.
