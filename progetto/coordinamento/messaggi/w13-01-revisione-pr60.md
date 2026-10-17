# W13: rilievi della revisione della PR #60

Rapporto completo: `progetto/coordinamento/revisioni/w13-pr60.md` (DA CORREGGERE). Leggilo.

## 1. Carne rossa oltre il massimo settimanale (importante)

Il revisore ha rigenerato i report separando le modifiche: settimane oltre il massimo di
carne rossa A (main) 0, B (id dell'import) 1, **C (somiglianza nuova) 3** (16/11, 30/11,
7/12). Il totale «17 settimane con problemi» lo nascondeva. «Nessun peggioramento di
regole» nella PR è quindi inesatto.

Decisione del coordinatore:
- **Capisci la causa** (per esempio: la penalità nuova allontana pesce o legumi e
  lascia spazio alla carne rossa; il peso dell'equilibrio 2 non basta contro la
  somiglianza 4 in certi slot).
- **Proponi una correzione** che porti le settimane oltre gli intervalli almeno al
  livello di B, **senza vincoli rigidi nuovi** e senza togliere l'effetto su #48 (coppie
  a distanza 1 restano 0). Prova le varianti sul report (per esempio peso dell'equilibrio,
  penalità dell'equilibrio proporzionale al superamento, o simili) e confrontale in una
  tabella con i problemi **divisi per tipo** (quota note/nuove, ogni intervallo,
  regole, fuori stagione, gradimento, coppie simili).
- Se trovi una variante pulita, applicala con i test. Se ogni variante ha un costo,
  **non scegliere da solo**: fermati con `STATO: DOMANDA` e la tabella, decide l'utente.
- Aggiorna la tabella nella descrizione della PR con i problemi divisi per tipo.

## 2. Test statico dei campi con falsi negativi (importante)

Passano due regressioni reali: `[type='search'] { font-size: 14px; }` in `global.css`
e `style={{ fontSize: 14 }}` su un campo in un `.tsx`. Decisione del coordinatore:
controllo **conservativo** (niente browser nella suite): riconosci anche i selettori per
attributo dei campi; fallisci su stili inline con `fontSize` sotto 16px su
`input`/`select`/`textarea` e segnala come errore le forme di `className` che non sai
analizzare (template literal, espressioni) invece di ignorarle, con una lista di
eccezioni esplicite se servono. Aggiungi i due casi del revisore come test di regressione
e scrivi in testa al file il perimetro reale del controllo.

Poi push, aggiorna la descrizione della PR e scrivi `STATO: PR_CORRETTA`.
