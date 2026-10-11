#!/usr/bin/env bash
# Local check of bootstrap.sql: homonymous family, rerun after a rename, missing user.
# Needs the local database (supabase db start). Touches only the families and the user
# it creates, by id and email: a stranger family with the same names survives.
set -euo pipefail
export PATH=/opt/podman/bin:$PATH
DB=supabase_db_meal_planner_2
SCRIPT="$(dirname "$0")/bootstrap.sql"
FAMILY_ID=7b3c8a52-5d0e-4f43-9a51-6c1f0e2a9b10    # declared in the input
HOMONYM_ID=7b3c8a52-5d0e-4f43-9a51-6c1f0e2a9b11   # same name, created before the run
STRANGER_ID=7b3c8a52-5d0e-4f43-9a51-6c1f0e2a9b12  # same names, must survive the cleanup

psql_db() { podman exec -i "$DB" psql -U postgres -v ON_ERROR_STOP=1 -tAq "$@"; }
# Only the input values change; the checks of the script stay as they are.
fill() {
	sed -e "/^insert into input_family values/s/'00000000-0000-0000-0000-000000000000'/'$FAMILY_ID'/" \
		-e "/^insert into input_family values/s/'Family name'/'Bootstrap test'/" \
		-e "/^	('person@example.com'/s/'person@example.com'/'$1'/" "$SCRIPT"
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

# The script with only the email filled in refuses the placeholder id
if out=$(sed -e "/^	('person@example.com'/s/'person@example.com'/'bootstrap@test.local'/" "$SCRIPT" | psql_db 2>&1); then
	echo "FAIL: placeholder id accepted"; exit 1
fi
case "$out" in *"write the family id first"*) echo "ok: placeholder id refused" ;; *) echo "FAIL: unexpected error: $out"; exit 1 ;; esac
check "nothing written with the placeholder" "$(psql_db -c "select count(*) from app.family_members m join auth.users u on u.id = m.user_id where u.email = 'bootstrap@test.local'")" 0

fill bootstrap@test.local | psql_db >/dev/null
check "family created with the declared id" "$(psql_db -c "select count(*) from app.families where id = '$FAMILY_ID'")" 1
check "homonyms left without members" "$(psql_db -c "select count(*) from app.family_members where family_id in ('$HOMONYM_ID', '$STRANGER_ID')")" 0
check "membership on the declared family" "$(psql_db -c "select role from app.family_members where family_id = '$FAMILY_ID'")" family_admin

# Rerun after a rename
psql_db -c "update app.families set name = 'Renamed' where id = '$FAMILY_ID'" >/dev/null
fill bootstrap@test.local | psql_db >/dev/null
check "rerun keeps the renamed family" "$(psql_db -c "select name from app.families where id = '$FAMILY_ID'")" Renamed
check "rerun creates no family" "$(psql_db -c "select count(*) from app.families where id in ('$FAMILY_ID', '$HOMONYM_ID', '$STRANGER_ID')")" 3
check "rerun adds no family with those names" "$(psql_db -c "select count(*) from app.families where name in ('Bootstrap test', 'Renamed') and id not in ('$FAMILY_ID', '$HOMONYM_ID', '$STRANGER_ID')")" 0
check "rerun duplicates no membership" "$(psql_db -c "select count(*) from app.family_members where family_id = '$FAMILY_ID'")" 1
check "global roles assigned once" "$(psql_db -c "select count(*) from app.user_roles r join auth.users u on u.id = r.user_id where u.email = 'bootstrap@test.local'")" 2

# Missing user: refused, nothing written
psql_db -c "delete from app.families where id = '$FAMILY_ID'" >/dev/null
if fill nobody@test.local | psql_db >/dev/null 2>&1; then echo "FAIL: missing user accepted"; exit 1; fi
echo "ok: missing user refused"
check "nothing written for the missing user" "$(psql_db -c "select count(*) from app.families where id = '$FAMILY_ID'")" 0

# The cleanup removes only what the test created
cleanup
check "test families removed" "$(psql_db -c "select count(*) from app.families where id in ('$FAMILY_ID', '$HOMONYM_ID')")" 0
check "stranger family survives the cleanup" "$(psql_db -c "select name from app.families where id = '$STRANGER_ID'")" "Bootstrap test"

echo "bootstrap: all checks passed"
