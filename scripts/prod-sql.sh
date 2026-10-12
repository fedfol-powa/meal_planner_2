#!/usr/bin/env bash
# SQL on the production database with a preview bound to the operation (detail spec, section 8):
# file, --launch, --set pairs and destination. The connection string is never printed.
# Usage: scripts/prod-sql.sh --preview <file.sql> [--launch] [--set name=value ...]
#        scripts/prod-sql.sh --apply <file.sql> [--launch] [--set name=value ...] --confirm <operation>
# Environment: PROD_CREDENTIALS (credentials file), PROD_SQL_TARGET=local (tests only),
# CONTAINER_CLI (podman by default, docker in CI).
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH=/opt/podman/bin:$PATH
usage() { echo "usage: scripts/prod-sql.sh --preview|--apply <file.sql> [--launch] [--set name=value ...] [--confirm <operation>]" >&2; exit 2; }
MODE=${1:-}; FILE=${2:-}
[ "$MODE" = --preview ] || [ "$MODE" = --apply ] || usage
[ -f "$FILE" ] || usage
shift 2
CONFIRM=""; LAUNCH=0; PAIRS=(); VARS=(); SHOWN=""
while [ $# -gt 0 ]; do
	case "$1" in
		--confirm) CONFIRM=${2:-}; shift 2 ;;
		--launch) LAUNCH=1; SHOWN="$SHOWN --launch"; shift ;;
		--set) [ -n "${2:-}" ] || usage; PAIRS+=("$2"); VARS+=(-v "$2"); SHOWN="$SHOWN --set $2"; shift 2 ;;
		*) usage ;;
	esac
done
CREDENTIALS=${PROD_CREDENTIALS:-/Users/fedfol/Projects/meal_planner_2/.env.production.local}
[ -f "$CREDENTIALS" ] || { echo "Credentials file not found: $CREDENTIALS" >&2; exit 1; }
# Checks file, pairs and target, and computes the operation fingerprint, without connecting.
PLAN=$(node scripts/prod-sql-plan.ts "$CREDENTIALS" "${PROD_SQL_TARGET:-production}" "$FILE" "$LAUNCH" ${PAIRS[@]+"${PAIRS[@]}"})
OPERATION=$(printf '%s\n' "$PLAN" | sed -n 1p)
if [ "$MODE" = --apply ] && [ "$CONFIRM" != "$OPERATION" ]; then
	echo "The operation changed since the preview (file, --launch, --set or target), or --confirm is missing: run --preview again" >&2
	exit 1
fi
POSTGRES_DATABASE_URL=$(printf '%s\n' "$PLAN" | sed -n 2p)
export POSTGRES_DATABASE_URL
CLI=${CONTAINER_CLI:-podman}
IMAGE=${PSQL_IMAGE:-public.ecr.aws/supabase/postgres:17.11.0.004}
MOUNT=()
[ -d "$HOME/.config/cosasimangia" ] && MOUNT=(-v "$HOME/.config/cosasimangia:$HOME/.config/cosasimangia:ro")
PREVIEW=0
if [ "$MODE" = --preview ]; then PREVIEW=1; echo "Preview of $FILE: ends with rollback" >&2; fi
# --launch: every table locked and no family before the file, the launch baseline before its end.
BODY=$(awk -v launch="$LAUNCH" -v preview="$PREVIEW" '
	$0 == "begin;" { print; if (launch == 1) print "select pg_temp.launch_start();"; next }
	$0 == "commit;" { if (launch == 1) print "select pg_temp.app_fingerprint() as launch_baseline;"; print (preview == 1 ? "rollback;" : "commit;"); next }
	{ print }' "$FILE")
{ cat supabase/scripts/app-fingerprint.sql; printf '%s\n' "$BODY"; } | "$CLI" run --rm -i -e POSTGRES_DATABASE_URL ${MOUNT[@]+"${MOUNT[@]}"} --network host "$IMAGE" \
	sh -c 'exec psql "$POSTGRES_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 "$@"' sh ${VARS[@]+"${VARS[@]}"}
if [ "$MODE" = --preview ]; then echo "Apply with: scripts/prod-sql.sh --apply $FILE$SHOWN --confirm $OPERATION" >&2
elif [ "$LAUNCH" = 1 ]; then echo "Write the launch_baseline above in the coordination log: it replaces the previous one" >&2; fi
exit 0
