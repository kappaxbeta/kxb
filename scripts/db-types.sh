#!/usr/bin/env bash
#
# Regenerate src/lib/supabase/database.types.ts.
#
# Usage:
#   bun run db:types         # from the local stack (the usual one)
#   bun run db:types-prod    # from production, through the SSH tunnel
#
# ---------------------------------------------------------------------------
# Why this is a script and not two one-liners in package.json
# ---------------------------------------------------------------------------
# It replaced this:
#
#   supabase gen types typescript --db-url "$URL" > src/lib/supabase/database.types.ts
#
# which has two bugs, and the second one is destructive.
#
# 1. The wrong host. The prod variant rewrote 127.0.0.1 to
#    host.docker.internal, copying the trick db-dump-prod.sh needs - but that
#    trick is for `supabase db dump`, which shells out to pg_dump *inside a
#    container*. `gen types` runs in the CLI process on the host, where
#    host.docker.internal does not resolve, so it failed with
#
#      Connecting to host.docker.internal 55433
#
#    every time. The tunnel's real address is the right one here. Same split
#    db-push-prod.sh already documents from the other side.
#
# 2. The redirect. `> file` truncates before the command runs, so a *failed*
#    generation left database.types.ts empty - the whole app failing to compile
#    as a side effect of a command that did nothing. Which is exactly what
#    happened, repeatedly, because of bug 1.
#
# So: generate to a temporary file, check it looks like types, and only then
# move it into place. A failure leaves the previous types exactly where they
# were.
set -euo pipefail

# The CLI's PostHog analytics flush can time out on exit and return 1 after the
# command has already succeeded. Opting out removes the flush; see
# db-push-prod.sh for the failure it produced.
export DO_NOT_TRACK=1

cd "$(dirname "$0")/.."

OUT="src/lib/supabase/database.types.ts"

target="local"
for arg in "$@"; do
  case "$arg" in
    --prod) target="prod" ;;
    *) echo "unknown option: $arg" >&2; exit 1 ;;
  esac
done

tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT

if [ "$target" = "local" ]; then
  echo "==> Generating types from the local stack"
  supabase gen types typescript --local > "$tmp"
else
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a

  if [ -z "${SUPABASE_DB_URL:-}" ]; then
    echo "SUPABASE_DB_URL is not set in .env" >&2
    exit 1
  fi

  echo "==> Generating types from backend.kxb.team"
  # The tunnel's own address, not the container one. Neither host actually
  # satisfies both halves of this command - see the failure note below and the
  # table in README.md - so this is the one that gets furthest.
  if ! ./scripts/db-tunnel.sh env PGSSLMODE=disable \
      supabase gen types typescript --db-url "$SUPABASE_DB_URL" > "$tmp" 2>/dev/null; then
    cat >&2 <<'WHY'

==> Could not generate types from production.

    `supabase gen types` splits itself across two network contexts: an SSL
    probe in the CLI process on this machine, and the introspection queries
    inside a container. The tunnel listens on 127.0.0.1, which the container
    cannot reach, and host.docker.internal, which this machine cannot resolve.
    No single --db-url satisfies both, so this fails whichever is used.

    You almost certainly want the local schema anyway - supabase/migrations is
    the source of truth, and `db:reset` applies all of it:

        bun run db:types

    To check whether production has drifted, dump its schema directly:

        ssh strato 'docker exec supabase-db pg_dump -U postgres -s -n public' > /tmp/prod-schema.sql

WHY
    exit 1
  fi
fi

# A generation that "succeeded" but produced nothing is the failure that would
# otherwise land in the repo and take the build with it.
if [ ! -s "$tmp" ] || ! grep -q "export type Database" "$tmp"; then
  echo "==> Generation produced no types - $OUT left untouched" >&2
  exit 1
fi

mv "$tmp" "$OUT"
trap - EXIT

echo "==> Wrote $OUT ($(wc -l < "$OUT" | tr -d ' ') lines)"
