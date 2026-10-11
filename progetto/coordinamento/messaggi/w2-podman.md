# W2 agenti — `supabase start` con Podman: errore nella copia del file segreto

**Sintomo (11 ottobre 2026, CLI di Supabase 2.120.0, Podman 5.7.1):** `supabase start` o
`supabase db start` per un `project_id` mai avviato prima si ferma subito con:

```
ContainerCreateError: failed to create docker container: failed to copy secret file into
container: exit 125: Error: 1 error occurred: * copying to container: 500 Internal Server Error
```

Gli stack già creati in precedenza continuano a funzionare; il problema compare solo quando
si crea un container nuovo del database.

**Causa:** la CLI passa a `podman cp - <container>:/` un tar che contiene solo il file
`etc/postgresql-custom/pgsodium_root.key`, senza le voci delle directory. L'estrazione di
Podman si interrompe (`passing bulk input to subprocess: write |1: broken pipe`). Lo stesso
file, impacchettato di nuovo con `tar` di macOS, viene accettato.

**Rimedio (fuori dal repository, niente da committare):** uno script che si mette davanti a
`podman` nel `PATH`, intercetta solo `cp -`, ri-impacchetta il tar in un file e poi chiama il
Podman vero. Tutti gli altri comandi passano invariati.

```bash
mkdir -p ~/.cache/podwrap
cat > ~/.cache/podwrap/podman <<'EOF'
#!/bin/bash
# Supabase CLI 2.120 tars (file entries only) break `podman cp -` on Podman 5.7.1: repack them.
if [ "$1" = "cp" ] && [ "$2" = "-" ]; then
  d=$(mktemp -d "$HOME/.cache/podwrap/x.XXXX"); mkdir "$d/root"
  tar xf - -C "$d/root" || exit 1
  (cd "$d/root" && COPYFILE_DISABLE=1 tar --format ustar --uid 0 --gid 0 -cf "$d/out.tar" $(ls -A)) || exit 1
  /opt/podman/bin/podman cp - "$3" < "$d/out.tar"; rc=$?
  rm -r "$d"; exit $rc
fi
exec /opt/podman/bin/podman "$@"
EOF
chmod +x ~/.cache/podwrap/podman
ln -sf ~/.cache/podwrap/podman ~/.cache/podwrap/docker
```

Poi, al posto del `PATH` indicato in `supabase/README.md`:

```bash
export PATH=$HOME/.cache/podwrap:$HOME/.local/bin:$PATH
supabase start -x ...   # oppure supabase db start
```

Note:

- Il tar ri-impacchettato va passato **da file**: passato direttamente con una pipe, nelle
  prove fallisce allo stesso modo.
- Se un tentativo fallito ha lasciato un volume, la CLI riparte «from backup» senza
  migrazioni: `supabase db reset` le applica.
- Con più worktree attivi insieme servono `project_id` e porte diversi per ogni stack
  (W2 agenti usa `w2-agenti-probe` sulle porte 583xx), e una porta libera per
  `wrangler dev` (`--port`) e per il suo ispettore (`--inspector-port`, la 9229 è spesso
  già occupata).
