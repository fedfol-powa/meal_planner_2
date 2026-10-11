# Server

Worker di Cloudflare che serve la SPA (`web/dist`) e le rotte del contratto:
`/api/rpc`, `/api`, `/api/openapi.json`, `/mcp`. Spec:
`progetto/superpowers/specs/2026-10-11-piattaforma.md`.

## Sviluppo locale

1. Avvia il database locale con le migrazioni: `supabase db start` (vedi
   `supabase/README.md`; serve Podman avviato).
2. Copia `.env.example` in `.env` e compila la connessione come `app_server` e l'URL
   dell'Auth locale.
3. Una volta sola: `npm install-scripts approve workerd` (npm 11 blocca lo script
   d'installazione del runtime usato da `wrangler dev`).
4. `npm run build -w web`, poi `npm run dev -w server` (porta 8787).
5. Prova: `curl -H "Authorization: Bearer <token>" http://localhost:8787/api/session/whoami`.

Job settimanale in locale: `npm run dev -w server -- --test-scheduled`, poi
`curl "http://localhost:8787/cdn-cgi/local/scheduled?cron=0+*+*+*+*"` (con `&time=<ms>`
per un istante diverso). Serve tutte le famiglie del database locale: su quello dei test,
che ne contiene molte, genera settimane per ognuna.

Esportazione notturna in locale (R2 simulato da Miniflare, chiave in `.env`): da
`server/`, `npx wrangler dev --test-scheduled`, poi
`curl "http://localhost:8787/cdn-cgi/local/scheduled?cron=30+2,4+*+*+*"`. Il log
`backup_export_done` riporta la chiave completa dell'oggetto, che comincia già con
`exports/`; per scaricarla, sempre da `server/`:

```bash
KEY='exports/2026-10-12T02-30Z.json.gz.enc'   # la chiave dal log
npx wrangler r2 object get "cosasimangia-backups/$KEY" --local --jurisdiction eu --file ../export.bin
```

Il file finisce nella radice del repository, da cui si usa la CLI di ripristino
(`supabase/README.md`).

In locale Hyperdrive non fa da pool: le prove di concorrenza si fanno sul Worker pubblicato.

## Test

`npm test -w server`. I test con il database richiedono `TEST_DATABASE_URL`
(superutente del database locale con le migrazioni di `supabase/`, per esempio
`postgresql://postgres:postgres@127.0.0.1:54322/postgres`; verifica con `supabase status`);
senza, in locale sono saltati, in CI falliscono. La CI avvia il database con
`supabase db start` ed esegue anche `supabase test db`.

## Pubblicazione

Per ora a mano, dopo il merge su `main` e dopo che l'integrazione di Supabase ha
applicato le migrazioni: dalla radice, `npm run deploy` (build di `web`, poi
`wrangler deploy`). Le migrazioni sono additive, quindi il Worker precedente regge
fino alla pubblicazione.

## Risorse di produzione

(compilata nel task 10: Worker, Hyperdrive con limite di connessioni, chiavi di firma,
esito della verifica dell'integrazione GitHub di Supabase fatta dal coordinatore)
