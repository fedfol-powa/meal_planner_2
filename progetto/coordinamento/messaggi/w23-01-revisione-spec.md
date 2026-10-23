# W23, messaggio 01: revisione di spec e piano

Rapporto: `progetto/coordinamento/revisioni/w23-spec-piano.md` (APPROVABILE CON CORREZIONI).
Correggi spec e piano su tutti e quattro i rilievi, come proposto dal revisore, con queste
decisioni del coordinatore (23/10) sui punti aperti:

- **Visibilità (rilievo 1):** il pulsante compare solo quando è **accertato** che oggi ha
  almeno un pasto con contenuto, letto dai dati della settimana di oggi (`getWeek`, la
  stessa query del Menu, dalla cache o letta ora). Se la settimana di oggi non è ancora
  disponibile, il pulsante resta nascosto finché non lo è; per saperlo puoi leggere la
  settimana di oggi con la query esistente (togli il vincolo «nessuna lettura nuova»),
  senza cambiare server, contratto o la regola di apertura del Menu. Niente eccezione
  offline: offline vale la copia salvata, e se non c'è il pulsante non compare. Test con
  soli slot vuoti, giornata senza slot, copia salvata, apertura ancora in attesa.
- **Cambio di giorno (rilievo 2):** nessun timer. La data si ricalcola esplicitamente al
  ritorno in primo piano (`visibilitychange` verso `visible`, e `pageshow` per la PWA) con
  uno stato che forza il render, e al tocco. Durante una permanenza continua in primo piano
  a cavallo della mezzanotte si aggiorna al primo di questi eventi: accettato. Test con
  cache popolata e risposte invariate, pulsante inizialmente assente, nuovo giorno senza
  pasti, fuso della famiglia.
- **Rilievi 3 e 4:** come proposti (test deterministico con `getWeek` trattenuto da una
  promessa, intento di focus legato alla destinazione e annullato da un'altra navigazione;
  misure di posizione di mese, calendario, borsa e fila dei giorni a 375 px nelle due
  lingue, area di tocco e focus visibile).

Riporta le due decisioni nelle «Decisioni da riportare nella specifica», poi committa e
scrivi `STATO: SPEC_E_PIANO_PRONTI`: farò un secondo giro di revisione.
