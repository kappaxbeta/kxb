#!/usr/bin/env bash
#
# `bun run dev` with every DOM element carrying the file it came from.
#
# Inspect an element and you get, alongside the Tailwind classes, an attribute
# saying where to go:
#
#   <div data-src="src/app/world/lounge/companions.tsx:42" class="flex gap-2">
#
# which is the thing Tailwind takes away from you and PostCSS cannot give back -
# PostCSS only ever sees CSS, never the JSX that emitted the class. The stamping
# is done by scripts/babel-plugin-source-attr.cjs; next.config.ts wires it in,
# gated on the NEXT_SOURCE_ATTRS below.
#
# ---------------------------------------------------------------------------
# What it costs
# ---------------------------------------------------------------------------
# Every .tsx goes through babel-loader before Turbopack sees it, so compiles are
# slower than `bun run dev` - noticeably on a cold start, less so afterwards.
# That is the whole reason this is a separate script rather than a flag on the
# normal one: the fast dev server stays fast, and you switch into this when you
# are hunting for a file rather than leaving it on all day.
#
# The build cache is kept separate (.next-classname) for the same reason it is
# separate for the scene shooter: two servers writing one .next fight over the
# lock and the chunk names, and here they would also disagree about whether the
# chunks contain the attribute at all. Switching back and forth costs you a cold
# compile either way, but never a corrupted one.
#
# Files that import `three` or `@react-three/*` are skipped - see the plugin for
# why - so the world scenes render exactly as they do under `bun run dev`.
#
# Usage:
#   bun run dev-css-classname                  # port 3000, same as bun run dev
#   bun run dev-css-classname -- --port 3001   # anything after -- goes to next dev
#
# Runs the same local-Supabase setup as `bun run dev`, because it is that script.
set -euo pipefail

cd "$(dirname "$0")/.."

export NEXT_SOURCE_ATTRS=1
export NEXT_DIST_DIR="${NEXT_DIST_DIR:-.next-classname}"

echo "==> data-src stamping is ON - every element carries its source file"
echo "==> Build cache: $NEXT_DIST_DIR (separate from bun run dev)"
echo "==> Compiles are slower than \`bun run dev\`; that is expected"
echo

exec ./scripts/dev.sh "$@"
