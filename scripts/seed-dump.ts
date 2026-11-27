#!/usr/bin/env bun
/**
 * Write the local database into `supabase/seed/community.sql`.
 *
 *   bun run seed:dump
 *
 * That file is what a fresh clone starts with: `supabase start` loads it into a
 * new database straight after the migrations, and `bun run db:reset` loads it
 * again. So "change what everybody starts with" is: change it in the app, run
 * this, commit the file. See "Seeding" in the README for a worked example.
 *
 * ---------------------------------------------------------------------------
 * Why a dump of a real database and not hand-written SQL
 * ---------------------------------------------------------------------------
 * The app is event-sourced. A room is a `RoomCreated` event, the read model
 * row it projected, a checkpoint saying it was projected, and a per-space event
 * sequence - and a world loaded into it is a hundred `BlocksPlaced` events and
 * fifteen thousand block rows. Writing that by hand gets one of the four wrong,
 * and the symptom is a sidebar that shows a room which opens empty. Building it
 * with the app's own buttons and dumping the result cannot disagree with itself.
 *
 * Run the projection sweep before dumping (README, step 3 of the example): the
 * lounge's blocks are projected by the sweep, not inline, and a dump taken
 * before it carries the events without the blocks.
 *
 * ---------------------------------------------------------------------------
 * What is left out, and what is replaced
 * ---------------------------------------------------------------------------
 * Left out: sessions, refresh tokens, MFA claims and the auth audit log - a
 * signed-in session in a public seed is a session anybody can resume - plus the
 * app's own logs and samples, which are a record of this laptop and nothing a
 * newcomer should start with.
 *
 * Replaced: a handful of tables the migrations already fill (the flags, the
 * skins, the tiers …). A data-only dump re-inserts their rows, which would
 * collide with the copies the migrations just wrote, so the file clears them
 * first - the same preamble upstream's own dump uses. That also means the
 * seed, not the migrations, decides which feature flags a local install has on.
 *
 * Only ever reads the local stack: `supabase db dump --local`.
 */

import { $ } from 'bun'

process.env.DO_NOT_TRACK = '1'

const OUT = 'supabase/seed/community.sql'

/** Never in a seed. See the note above. */
const EXCLUDE = [
  'auth.sessions',
  'auth.refresh_tokens',
  'auth.mfa_amr_claims',
  'auth.mfa_challenges',
  'auth.mfa_factors',
  'auth.one_time_tokens',
  'auth.flow_state',
  'auth.audit_log_entries',
  'auth.schema_migrations',
  'public.backoffice_audit',
  'public.page_views',
  'public.projection_sweeps',
  'public.error_reports',
  'public.health_samples',
  'public.host_samples',
]

/** Filled by migrations; cleared before the dump's own rows go in. */
const REPLACED = [
  'public.feature_flag_overrides',
  'public.feature_flags',
  'public.backoffice_admins',
  'public.contest_settings',
  'public.oasis_chapters',
  'public.promo_codes',
  'public.skins',
  'public.tiers',
]

if ((await $`supabase status`.quiet().nothrow()).exitCode !== 0) {
  console.error('\n  The local stack is not running. `bun run setup` first.\n')
  process.exit(1)
}

const tmp = `${OUT}.tmp`
await $`mkdir -p supabase/seed`
await $`supabase db dump --local --data-only --schema public,auth ${EXCLUDE.flatMap((t) => ['-x', t])} -f ${tmp}`

const preamble = [
  '-- Written by `bun run seed:dump` - edit the database, not this file.',
  '-- Loaded by `supabase start` on a new database and by `bun run db:reset`.',
  '-- See "Seeding" in the README.',
  '',
  '-- Rows the migrations seed themselves, cleared so this copy wins.',
  ...REPLACED.map((table) => `delete from ${table};`),
  '',
].join('\n')

await Bun.write(OUT, preamble + (await Bun.file(tmp).text()))
await $`rm ${tmp}`

const lines = (await Bun.file(OUT).text()).split('\n').length
const size = (await Bun.file(OUT).size) / 1024
console.log(`\n==> Wrote ${OUT} (${lines} lines, ${Math.round(size)} kB)`)
