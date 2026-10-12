#!/usr/bin/env bash
# Local check of bootstrap.sql: homonymous family, rerun after a rename, missing user.
# Needs the local database (supabase db start). Touches only the families and the user
# it creates, by id and email: a stranger family with the same names survives.
set -euo pipefail
export PATH=/opt/podman/bin:$PATH
DB=${DB:-supabase_db_meal_planner_2}
SCRIPT="$(dirname "$0")/bootstrap.sql"
FAMILY_ID=7b3c8a52-5d0e-4f43-9a51-6c1f0e2a9b10    # declared in the input
HOMONYM_ID=7b3c8a52-5d0e-4f43-9a51-6c1f0e2a9b11   # same name, created before the run
STRANGER_ID=7b3c8a52-5d0e-4f43-9a51-6c1f0e2a9b12  # same names, must survive the cleanup

psql_db() { podman exec -i "$DB" psql -U postgres -v ON_ERROR_STOP=1 -tAq "$@"; }
# Like scripts/prod-sql.ts --apply: one transaction, the data as psql variables.
boot() {
	local people="[{\"email\":\"$1\",\"display_name\":\"Name\",\"locale\":\"it-IT\",\"family_role\":\"family_admin\",\"global_roles\":[\"app_admin\",\"recipe_curator\"]}]"
	psql_db --single-transaction -v family_id="${2:-$FAMILY_ID}" -v family_name='Bootstrap test' \
		-v measurement_system=metric -v time_zone=Europe/Rome -v people="$people" -f - < "$SCRIPT"
}
check() {
	if [ "$2" != "$3" ]; then echo "FAIL: $1 (expected $3, got $2)"; exit 1; fi
	echo "ok: $1"
}
cleanup() {
	psql_db -c "delete from app.families where id in ('$FAMILY_ID', '$HOMONYM_ID');
		delete from auth.users where email = 'bootstrap@test.local';" >/dev/null
}
remove_stranger() {
	psql_db -c "delete from app.families where id = '$STRANGER_ID'" >/dev/null
}
trap 'cleanup; remove_stranger' EXIT
cleanup
remove_stranger

# A homonymous family and a stranger with the same names already exist
psql_db -c "insert into auth.users (id, email, aud, role) values (gen_random_uuid(), 'bootstrap@test.local', 'authenticated', 'authenticated');
	insert into app.families (id, name) values ('$HOMONYM_ID', 'Bootstrap test'), ('$STRANGER_ID', 'Bootstrap test');" >/dev/null

# The placeholder id is refused
if out=$(boot bootstrap@test.local 00000000-0000-0000-0000-000000000000 2>&1); then
	echo "FAIL: placeholder id accepted"; exit 1
fi
case "$out" in *"write the family id first"*) echo "ok: placeholder id refused" ;; *) echo "FAIL: unexpected error: $out"; exit 1 ;; esac
check "nothing written with the placeholder" "$(psql_db -c "select count(*) from app.family_members m join auth.users u on u.id = m.user_id where u.email = 'bootstrap@test.local'")" 0

boot bootstrap@test.local >/dev/null
check "family created with the declared id" "$(psql_db -c "select count(*) from app.families where id = '$FAMILY_ID'")" 1
check "homonyms left without members" "$(psql_db -c "select count(*) from app.family_members where family_id in ('$HOMONYM_ID', '$STRANGER_ID')")" 0
check "membership on the declared family" "$(psql_db -c "select role from app.family_members where family_id = '$FAMILY_ID'")" family_admin

# Rerun after a rename
psql_db -c "update app.families set name = 'Renamed' where id = '$FAMILY_ID'" >/dev/null
boot bootstrap@test.local >/dev/null
check "rerun keeps the renamed family" "$(psql_db -c "select name from app.families where id = '$FAMILY_ID'")" Renamed
check "rerun creates no family" "$(psql_db -c "select count(*) from app.families where id in ('$FAMILY_ID', '$HOMONYM_ID', '$STRANGER_ID')")" 3
check "rerun adds no family with those names" "$(psql_db -c "select count(*) from app.families where name in ('Bootstrap test', 'Renamed') and id not in ('$FAMILY_ID', '$HOMONYM_ID', '$STRANGER_ID')")" 0
check "rerun duplicates no membership" "$(psql_db -c "select count(*) from app.family_members where family_id = '$FAMILY_ID'")" 1
check "global roles assigned once" "$(psql_db -c "select count(*) from app.user_roles r join auth.users u on u.id = r.user_id where u.email = 'bootstrap@test.local'")" 2

# Missing user: refused, nothing written
psql_db -c "delete from app.families where id = '$FAMILY_ID'" >/dev/null
if boot nobody@test.local >/dev/null 2>&1; then echo "FAIL: missing user accepted"; exit 1; fi
echo "ok: missing user refused"
check "nothing written for the missing user" "$(psql_db -c "select count(*) from app.families where id = '$FAMILY_ID'")" 0

# The cleanup removes only what the test created
cleanup
check "test families removed" "$(psql_db -c "select count(*) from app.families where id in ('$FAMILY_ID', '$HOMONYM_ID')")" 0
check "stranger family survives the cleanup" "$(psql_db -c "select name from app.families where id = '$STRANGER_ID'")" "Bootstrap test"

echo "bootstrap: all checks passed"
