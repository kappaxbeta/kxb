#!/usr/bin/env bun
/**
 * From a fresh clone to a database worth opening.
 *
 *   bun install
 *   bun run setup     # this file
 *   bun run dev
 *
 * ---------------------------------------------------------------------------
 * What it does
 * ---------------------------------------------------------------------------
 *   1. Starts the local Supabase stack in Docker if it is not up. On a new
 *      database that applies every migration and then loads the seed,
 *      `supabase/seed/community.sql`: the local admin, the world catalogue,
 *      the starter space with its places and arenas, and the feature flags a
 *      laptop wants on. See "Seeding" in the README for what is in it and how
 *      to change it.
 *   2. Applies any migration the database has not seen. That is the step that
 *      matters after a `git pull` on a database that already exists - `start`
 *      only migrates a database it is creating, and only seeds one either.
 *
 * Safe to run again after every pull: it changes nothing that is already
 * right. It never re-seeds an existing database, because that would replace
 * whatever you built in it - `bun run db:reset` is the deliberate way back to
 * the seed.
 *
 * `bun run dev` starts the stack too, so on a clean clone `setup` can be
 * skipped. It is its own step for the pull-then-migrate case, and so the first,
 * slow image pull happens somewhere that says so.
 */

import { $ } from 'bun'

// The CLI's analytics flush can time out on exit and report a failure after the
// command succeeded; see scripts/dev.sh for the same line and the same reason.
process.env.DO_NOT_TRACK = '1'

function step(text: string) {
  console.log(`\n==> ${text}`)
}

if ((await $`docker info`.quiet().nothrow()).exitCode !== 0) {
  console.error('\n  Docker is not running. The local Supabase stack runs in Docker - start Docker Desktop and retry.\n')
  process.exit(1)
}

if ((await $`supabase status`.quiet().nothrow()).exitCode !== 0) {
  step('Starting the local Supabase stack (the first run pulls images and loads the seed - be patient)')
  await $`supabase start`
}

step('Applying new migrations')
await $`supabase migration up --local --include-all`

const status = Object.fromEntries(
  (await $`supabase status -o env`.quiet().text())
    .split('\n')
    .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => [m[1], m[2]]),
)

console.log(`
==> Ready. Now:

    bun run dev

    App      http://localhost:3000
    Sign in  admin@kxb.team / test123
    Space    http://localhost:3000/t/kxb
    Studio   ${status.STUDIO_URL ?? 'see supabase status'}
    Mailpit  ${status.MAILPIT_URL ?? status.INBUCKET_URL ?? 'see supabase status'}

    No admin, no space? This database predates the seed: bun run db:reset
`)
