# W10: rilievi della revisione di spec e piano

Rapporto: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w10-spec-piano.md`
(verdetto DA CORREGGERE, correzioni circoscritte). Decisioni del coordinatore:

1. **Accolto.** Rimozione incrociata: atteso `42501` per il secondo (ha già perso il ruolo),
   con l'asserzione che resta esattamente un amministratore. Aggiungi il caso di due
   amministratori che rinunciano ciascuno al proprio ruolo: il secondo riceve `P0A08`.
2. **Accolto.** Test di concorrenza: rilascio e raccolta degli esiti in `try/finally`
   prima del ripristino delle fixture; la prova senza lucchetto deve concludere entrambe
   le transazioni e dimostrare l'invariante violata. Accerta l'attesa sul lucchetto in
   modo affidabile (per esempio `pg_locks`/`pg_stat_activity` con `wait_event_type =
   'Lock'` dalla connessione di controllo); i 200 ms al più come controllo accessorio.
   Verifica nel test che l'isolamento sia read committed.
3. **Accolto.** Su `forbidden` da un'operazione `users`: rileggi il profilo; se `app_admin`
   non c'è più, mostra «Non hai accesso a questa pagina» senza i dati precedenti (via la
   cache delle query `users`). Test con revoca effettiva nell'API simulata. Se tocchi il
   gestore condiviso degli errori, dichiaralo nella spec.
4. **Accolto.** Ricerca di `account_exists` legata al tentativo (contatore o email),
   collegamento azzerato al cambio dell'email, test con risposte in ordine inverso.
5. **Accolto.** Interruttori bloccati fino alla rilettura del dettaglio (attendi la
   Promise dell'invalidazione o usa la risposta di `setRole`, che restituisce già il
   dettaglio aggiornato: preferisci questa, è più semplice); errore della rilettura
   gestito. Niente aggiornamenti ottimistici. Test con rilettura sospesa e fallita.
6. **Accolto.** Fixture coerenti con il seed, caso demo amministratore e `account_exists`
   nella modalità finta; dichiara i file toccati, compreso `fakeAppInvitations.ts`.
7. **Accolto.** «Tu» anche nel dettaglio, nelle due lingue.

**Punto da chiarire, deciso:** il lucchetto protegge solo le **rimozioni** di `app_admin`.
`complete_app_invitation` di A aggiunge soltanto e resta com'è (nessuna nuova migrazione
su A). Correggi la spec dove dice «ogni modifica di ruolo»: la regola è «ogni percorso che
toglie `app_admin` prende il lucchetto e ricontrolla», ed è la stessa dell'«Interfaccia
per C». Documenta l'eccezione delle assegnazioni.

Verifica finale anche in inglese e con nomi lunghi (`design/design.md`).

Correggi spec e piano, fai commit e scrivi `STATO: SPEC_E_PIANO_CORRETTI`.
