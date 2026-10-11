# Al worker W4: equivalenze legate alla preparazione

Dalla review di W3. Un'equivalenza (ambito `recipe` o `shopping`) può avere una
`preparation` facoltativa: testo italiano normalizzato come per la varietà. Si applica a
una riga solo se la preparazione della riga coincide, oppure se l'equivalenza non ha
preparazione; se ne esistono una specifica e una generica, vince la specifica.
Esempio: succo di limone in limoni vale per «succo», non per «scorza» (risolve il limite
noto del prototipo). L'invariante di unicità diventa: al massimo una equivalenza per
(ingrediente, ambito, dimensione dell'unità di partenza, preparazione o nessuna).

Proprietà dei tipi: tu possiedi `Localized`, `Quantity` completa, codici e schemi delle
unità; W3 costruisce sopra le varianti di bozza senza ridefinirle.

Aggiorna spec e piano con test (specifica contro generica, preparazione diversa non
applicata), commit, poi `STATO: SPEC_E_PIANO_CORRETTI` e fermati: l'implementazione
parte quando ti dico che lo scheletro è su `main`.
