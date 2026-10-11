# Al worker W5: seconda review di spec e piano, poi implementazione

Rapporto: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w5-spec-piano-2.md`.
Le decisioni di prodotto restano quelle di `w5-01-review.md`. Correggi i nove rilievi
con queste scelte tecniche:

- **Sessione (1, 2, 3):** un coordinatore unico della sessione con un numero di
  generazione. Un solo rinnovo alla volta (le `unauthorized` concorrenti aspettano lo
  stesso rinnovo); i completamenti di generazioni precedenti si scartano. Distingui
  «identità non ancora nota» (all'avvio, finché Supabase non ha risposto: non si cancella
  nulla) da «uscita confermata» (si cancella). All'avvio si cancellano solo copie di
  utenti diversi da quello che rientra, e solo a identità nota.
- **Revoca fra schede (4):** `BroadcastChannel` del browser, senza librerie: la scheda che
  riceve `forbidden` o esce lo annuncia, le altre rimuovono quella famiglia o la sessione
  e non riscrivono la copia; in più un segno nella persistenza che blocca la scrittura
  delle viste revocate finché il server non le rende di nuovo.
- **Voto e letture pendenti (5):** dopo la conferma di un voto, le letture partite prima
  della conferma per quella ricetta non sovrascrivono il risultato (annullale o ignorale).
- **Shell (6):** sostituzione atomica: le navigazioni si servono dalla cache della shell
  installata e completa; la nuova shell entra in servizio solo quando è completa, alla
  riapertura successiva. Mai HTML nuovo con bundle mancanti.
- **`keepPreviousData` (7):** niente dati precedenti quando cambiano lingua o contesto
  della ricetta; ammessi solo per paginazione o filtri della stessa vista.
- **Profilo (8) e versione numerica (9):** come proposto dal revisore.

**Niente terza review di spec e piano:** dopo le correzioni passa all'implementazione con
TDD (rebase su `origin/main` come primo passo); il controllo finale è la review della
PR. Quindi: correggi, commit, esegui il piano, verifica nel browser con agent-browser e
pubblica sulla rete locale (porta 8767) quando ci sono schermate da vedere, scrivendo
`STATO: ANTEPRIMA <url>` senza fermarti; alla fine push, PR e `STATO: PR_APERTA <url>`.
