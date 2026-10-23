# W23, messaggio 02: secondo giro di revisione

Rapporto: `progetto/coordinamento/revisioni/w23-spec-piano-2.md` (APPROVABILE CON
CORREZIONI; risolti i rilievi 1, 2 e 4 del primo giro).

1. **Focus dopo mezzanotte:** correggi come proposto dal revisore. L'intento distingue il
   giorno esplicito dall'apertura richiesta per una data precisa della famiglia; non si
   consuma su un'apertura provvisoria (`savedOpening` come `placeholderData`) mentre la
   richiesta è in corso; esplicita il completamento con il ripiego offline, senza cambiare
   la regola di apertura. Test con due promesse controllate (`getOpening` del nuovo giorno e
   `getWeek`): niente focus anticipato, focus all'arrivo effettivo, annullamento con un'altra
   navigazione.
2. **Letture, decisione del coordinatore (23/10):** vale il normale ciclo della query
   esistente del Menu (riuso della cache, richieste condivise, riletture al ritorno in primo
   piano e alla riconnessione come le altre settimane osservate). Togli dalla spec la
   promessa di «una lettura sola» e allinea le «Decisioni da riportare»; niente opzioni
   speciali oltre a quelle già del Menu.

Poi committa e scrivi `STATO: SPEC_E_PIANO_PRONTI`: terzo giro di revisione.
