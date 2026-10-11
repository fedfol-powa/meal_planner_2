# W5 — review di spec e piano della seconda PR, e via

Rapporto: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w5-web-client-spec-piano.md`. Verdetto
«approvabile con correzioni». Correggi nel piano i tre rilievi (agganci di chiusura
protetti anche dalle eccezioni sincrone, con test; il wrapper inoltra tutti gli argomenti
compreso `signal`, anche nella ripetizione dopo il rinnovo, con prova
dell'annullamento attraverso `wrapApi`; fixture di `session.whoami` conforme al
contratto). Commit, poi **via all'implementazione** con TDD senza altra review di spec.
Nota: la PR #12 di W6 (viste e tipi web della ricetta) è unita su `main`: porta il
branch su `main` prima di iniziare. Alla fine PR verso `main`, `STATO: PR_APERTA <url>`.
