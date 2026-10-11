# W1 — review della PR #15

Rapporto: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w1-pr15.md`. Verdetto «approvabile con
correzioni».

1. **R1 e cache (decisione del coordinatore, vale anche per la spesa):** in
   `server/src/menu/versions.ts` esporta un aiuto che, con lo **stesso istante SQL** usato
   da `mealRecipeVersions`, restituisce il numero di pasti della settimana già passati
   (per esempio `mealPassedCount(tx, familyId, weekId, at?)`, oppure lo stesso valore
   restituito insieme alle versioni). La versione di `menu.getWeek` lo include, così al
   passaggio delle 15:30 e 23:00 la lettura non risponde più «invariato». Prova
   deterministica con pubblicazione concorrente e attesa a cavallo di entrambe le soglie.
   Correggi anche la spec (righe 472-475). Scrivi nella descrizione della PR la firma
   esatta: la passo a W4 per `shopping.getWeekList`.
2. **Isolamento dei job:** l'elaborazione di ogni job, compreso il salvataggio di
   `abandoned` e `failed`, è protetta; se il salvataggio fallisce: log sicuro, job
   lasciato recuperabile, si prosegue con le altre famiglie. Test con errore iniettato in
   entrambi i salvataggi e famiglia sana successiva elaborata.

Porta prima il branch su `main` (contiene la #13). Push, `STATO: PR_CORRETTA`.
