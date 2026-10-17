#!/usr/bin/env bash
# scripts/test-support/auth-require-current.sh — a second Supabase Auth service of the local stack
# with «Require current password when updating» on (spec W15, sections 8 and 10): the option has
# no key in config.toml, only the environment variable of the Auth source.
#
#   auth-require-current.sh start [--email-limit N]   prints the URL of the service (GoTrue's root:
#                                                     /health, /verify, /user, /token, /recover)
#   auth-require-current.sh stop  [--email-limit N]   removes it
#
# Same image, environment and network as the stack's Auth container (read with `inspect`), same
# database, so users and sessions are shared; published on a free port of 127.0.0.1.
# `--email-limit N` also sets the project's hourly email limit (GOTRUE_RATE_LIMIT_EMAIL_SENT=N),
# in a separate container, for the rate-limit case only. Variable names verified in the Auth
# source (internal/conf/configuration.go: Security.UpdatePasswordRequireCurrentPassword,
# RateLimitEmailSent).
#
# Environment:
#   CONTAINER_CLI        docker (default) or podman
#   SUPABASE             the supabase CLI command (default `supabase`), for a stack on other ports
#   SUPABASE_PROJECT_ID  the stack's project_id; by default found from the running Kong container
#                        that publishes the API port of `supabase status`
#
# Containers are named after the stack's project and labelled: `stop` removes only its own.
# Reproducible rate-limit run: `scripts/test-support/auth-require-current.sh start --email-limit 2`.
set -euo pipefail

CLI=${CONTAINER_CLI:-docker}
LABEL=cosasimangia.test=auth-require-current

action=${1:-}
shift || true
limit=
while [ $# -gt 0 ]; do
	case $1 in
		--email-limit) limit=${2:?--email-limit needs a number}; shift 2 ;;
		*) echo "unknown option: $1" >&2; exit 2 ;;
	esac
done
case $action in start | stop) ;; *) echo "usage: $0 start|stop [--email-limit N]" >&2; exit 2 ;; esac
if [ -n "$limit" ] && ! [[ $limit =~ ^[0-9]+$ ]]; then echo "--email-limit: not a number" >&2; exit 2; fi

project_id() {
	if [ -n "${SUPABASE_PROJECT_ID:-}" ]; then echo "$SUPABASE_PROJECT_ID"; return; fi
	local status api port kong
	status=$(${SUPABASE:-supabase} status -o env 2>/dev/null)
	api=$(printf '%s\n' "$status" | sed -n 's/^API_URL="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p')
	port=${api##*:}
	port=${port%%/*}
	[ -n "$port" ] || { echo "supabase status: API_URL missing (is the stack running?)" >&2; return 1; }
	# Running containers only: stopped stacks of other worktrees may own the same port.
	kong=$($CLI ps --format '{{.Names}}	{{.Ports}}' | awk -F'\t' -v p=":$port->" 'index($2, p) && $1 ~ /^supabase_kong_/ { print $1 }')
	[ "$(printf '%s\n' "$kong" | grep -c .)" = 1 ] || { echo "no single running Kong container on port $port" >&2; return 1; }
	echo "${kong#supabase_kong_}"
}

id=$(project_id)
auth=supabase_auth_$id
name=cosasimangia_auth_require_current_$id${limit:+_limit$limit}

remove_own() {
	if [ "$($CLI ps -a --filter "name=^${name}\$" --filter "label=$LABEL" --format '{{.Names}}')" = "$name" ]; then
		$CLI rm -f "$name" >/dev/null
	fi
}

if [ "$action" = stop ]; then
	remove_own
	exit 0
fi

image=$($CLI inspect "$auth" --format '{{.Config.Image}}')
network=$($CLI inspect "$auth" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}' | head -n1)
[ -n "$image" ] && [ -n "$network" ] || { echo "cannot read image or network of $auth" >&2; exit 1; }

args=()
while IFS= read -r line; do
	case $line in
		'' | container=* | GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD=*) continue ;;
		GOTRUE_RATE_LIMIT_EMAIL_SENT=*) [ -n "$limit" ] && continue ;;
	esac
	args+=(-e "$line")
done < <($CLI inspect "$auth" --format '{{range .Config.Env}}{{println .}}{{end}}')
args+=(-e GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD=true)
[ -n "$limit" ] && args+=(-e "GOTRUE_RATE_LIMIT_EMAIL_SENT=$limit")

remove_own
# From here on a failure removes the container this run created (and only that one).
ready=
trap '[ -n "$ready" ] || remove_own' EXIT
$CLI run -d --name "$name" --label "$LABEL" --network "$network" -p 127.0.0.1::9999 "${args[@]}" "$image" auth >/dev/null
hostport=$($CLI port "$name" 9999/tcp | head -n1)
url="http://127.0.0.1:${hostport##*:}"
for _ in $(seq 1 60); do
	if curl -fsS "$url/health" >/dev/null 2>&1; then
		ready=1
		echo "$url"
		exit 0
	fi
	sleep 0.5
done
echo "Auth at $url did not become healthy; last logs:" >&2
$CLI logs --tail 20 "$name" >&2 || true
exit 1
