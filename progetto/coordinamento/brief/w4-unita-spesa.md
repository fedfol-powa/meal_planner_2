# Brief W4: Unità e spesa

Segui `progetto/coordinamento/protocollo-worker.md`.

- **Branch:** `fondamenta/unita-spesa` · **Worktree:** `.worktrees/unita-spesa`
- **Proprietà:** `domain/src/units/`, `domain/src/shopping/`.
- **Specifica:** sezioni 2 (equivalenze, spesa), 6, 12, 15 (misure), 16 (terzo giro);
  `design/percorsi.md` (Spesa); prototipo `prototype/src/lib/units` e
  `prototype/src/lib/operations/shopping*.ts` con i loro test.

## Obiettivo

Dominio TypeScript puro, senza dipendenze dal runtime, con test:

- codici delle unità, sistemi `metric` e `uk_imperial`, conversioni senza arrotondamenti
  cumulativi e senza equivalenze massa/volume inventate;
- equivalenze per ingrediente (tazze USA, unità di acquisto come succo di limone in
  limoni), con ambito ricetta o spesa;
- scalatura delle porzioni e quantità non numeriche («q.b.»);
- consolidamento della lista della settimana: voci per ingrediente e varietà
  (normalizzazione della varietà come `variety_key`), pezzi interi, reparti, dispensa,
  ingredienti evitati e rimessi in lista, spunte con quantità del momento;
- chiudi o proponi i punti aperti della sezione 15 su «Misure».

## Vincoli dal coordinamento

- La forma delle righe di ingrediente e i codici delle unità sono un'interfaccia con W3
  (documento ricetta): accordati tramite il coordinatore prima del piano.
- Riusa la logica del prototipo dove è già approvata, riscrivendola pulita.
