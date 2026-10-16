# W11: risposta del coordinatore al riepilogo del design (16/10)

Il riepilogo va bene. Scrivi spec e piano con queste precisazioni.

1. **Revoca dei link alla perdita del ruolo:** d'accordo (uscita, rimozione,
   retrocessione, cancellazione). Il dialogo di conferma di ognuno di questi passaggi
   lo dice quando ci sono link attivi creati da quella persona (per esempio «I 2 link
   d'invito creati da Anna smetteranno di valere»). Riportalo nelle «Decisioni da
   riportare nella specifica» come scelta di prodotto del coordinatore.
2. **Ripresa della cancellazione:** il Worker ha già il Cron Trigger orario
   (`0 * * * *` in `server/wrangler.jsonc`), che può chiamare Auth con la chiave
   segreta: usalo per le righe `account_deletions` in attesa, senza aggiungere trigger.
   Scrivi nella spec dopo quanto una riga si riprende, cosa succede dopo ripetuti
   fallimenti (va segnalata, come il job settimanale) e come la vede l'amministratore.
3. **Account in attesa di cancellazione:** dopo la prima transazione l'account in Auth
   esiste ancora senza profilo. Decidi e scrivi come compare (o non compare) nell'elenco
   degli utenti di B e nella ricerca, e che `account_exists` degli inviti all'app resta
   coerente finché la riga non è completata. Verifica anche che l'accesso con email e
   password non porti a uno stato strano (sessione valida ma profilo assente).
4. **Ordine dei lucchetti:** la cancellazione prende prima `app_admin_roles`, poi le
   righe delle famiglie in ordine di id; i percorsi della famiglia prendono solo le
   righe delle famiglie. Scrivilo come regola nella sezione «Interfaccia» della spec, con
   il test di concorrenza per l'ultimo amministratore della famiglia.
5. **MCP:** non dimenticare la regola della sezione 7: se la cancellazione dell'account
   (propria o di un altro utente) elimina almeno una famiglia, lo strumento restituisce
   solo il collegamento alla pagina; l'eliminazione della famiglia via MCP restituisce
   sempre il collegamento.
6. **Voti:** alla cancellazione dell'account i voti si cancellano (sezione 7: «rimuove
   dati personali e voti»); alla rimozione dalla famiglia restano ma escono dalla media,
   come già fa il server.

Poi procedi: spec, piano, commit, e fermati con `STATO: SPEC E PIANO PRONTI` per la
revisione.
