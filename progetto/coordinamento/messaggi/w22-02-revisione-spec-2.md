# W22, messaggio 02: secondo giro di revisione

Rapporto: `progetto/coordinamento/revisioni/w22-spec-piano-2.md` (APPROVABILE CON
CORREZIONI; risolti i rilievi 2, 4, 6 e 7 del primo giro).

Correggi spec e piano sui tre rilievi, come proposto dal revisore:

1. Spostamenti residui: margine del paragrafo dell'email in Preferenze (paragrafo con figli
   validi o margine conservato), numero di righe secondarie configurabile per gli Ingressi
   (nome, data, provenienza), struttura unica delle voci Inviti nelle due fasi con gli
   stessi intervalli e classi. Preferenze nel confronto geometrico del Task 10, passaggio
   intermedio degli Inviti verificato a parte.
2. Membri: il ruolo del profilo serve solo ad anticipare il layout finché manca il
   dettaglio; quando il dettaglio c'è decide `detail.myRole`, come oggi, anche per
   l'abilitazione delle query. Test con profilo e dettaglio discordanti nei due sensi.
3. Bozze: nel browser una fixture controllata con lo stesso numero dello skeleton, titoli
   su una riga e una riga di mancanze per bozza, misura del `top` dei risultati; catalogo
   finto e quantità diverse come casi di spostamento ammesso a parte; prova iPhone con
   numero e forma.

**Decisione del coordinatore (23/10):** confermata la tua limitazione: lo skeleton delle
bozze riusa solo un riepilogo già in memoria; durante il ripristino dalla copia salvata
una scheda, senza leggere il riepilogo dal disco. Riportala così nelle «Decisioni da
riportare nella specifica».

Poi committa e scrivi `STATO: SPEC_E_PIANO_PRONTI`: terzo giro di revisione.
