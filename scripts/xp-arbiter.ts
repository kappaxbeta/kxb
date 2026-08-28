#!/usr/bin/env bun
/**
 * Plays the arbiter's rules against the local stack, as three real players.
 *
 *     bun run xp:arbiter
 *
 * ---------------------------------------------------------------------------
 * Why this is a script and not a test
 * ---------------------------------------------------------------------------
 * `bun test src packages` is pure - no network, no database, no Docker - and
 * that is worth keeping. Every rule in `xp_arbitrate` is SQL, so the only way
 * to check one is to run it, and a test that needs a Postgres would make the
 * whole suite fail on a laptop where nothing is up.
 *
 * So it joins `xp:shot` and `xp:bench` as a check you run rather than one that
 * runs itself: the things that can only be answered by doing them. What it
 * replaces is a session's worth of `psql` pasted into a terminal and then lost.
 *
 * ---------------------------------------------------------------------------
 * Three real sessions, because `auth.uid()` is the whole design
 * ---------------------------------------------------------------------------
 * The functions read who is calling from the session and never from the
 * payload - that is what stops a client scoring for somebody else - so a check
 * holding the service role key would be checking nothing. It signs in three
 * anonymous users against the local auth server and calls the RPCs as them,
 * which is exactly what a browser does.
 *
 * Anonymous sign-ins are on in `supabase/config.toml` for local development.
 * This script is local-only by construction: it refuses any URL that is not
 * localhost, because the one thing worse than not running it is running it
 * against production.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const ENV = '.env.local'

function fromEnv(key: string): string {
  const line = readFileSync(ENV, 'utf8')
    .split('\n')
    .find((row) => row.startsWith(`${key}=`))
  const value = line?.slice(key.length + 1).trim().replace(/^["']|["']$/g, '')
  if (!value) {
    console.error(`  ${key} is not in ${ENV}. Is the local stack up? bun run db:start`)
    process.exit(1)
  }
  return value
}

const url = fromEnv('NEXT_PUBLIC_SUPABASE_URL')
const anonKey = fromEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')

/**
 * The guard, and it is not paranoia.
 *
 * This script signs people in, deals roles and eliminates them. Pointed at a
 * live instance it would do all of that to a real room, and the URL is one
 * variable away from being the wrong one.
 */
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url)) {
  console.error(`  ${ENV} points at ${url}, which is not local. Refusing.`)
  process.exit(1)
}

let failures = 0
let checks = 0

function ok(what: string, condition: boolean, detail?: unknown) {
  checks += 1
  if (condition) {
    console.log(`  ok   ${what}`)
    return
  }
  failures += 1
  console.log(`  FAIL ${what}`)
  if (detail !== undefined) console.log(`       ${JSON.stringify(detail)}`)
}

/** One signed-in player, and the two calls they can make. */
interface Player {
  id: string
  ask: (action: string, payload?: unknown) => Promise<Verdict>
  view: () => Promise<Record<string, unknown>>
}

interface Verdict {
  ok: boolean
  why?: string
  message?: string
  outcome?: Record<string, unknown>
}

async function signIn(): Promise<Player> {
  const client: SupabaseClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await client.auth.signInAnonymously()
  if (error || !data.user) {
    console.error(`  could not sign in anonymously: ${error?.message ?? 'no user'}`)
    process.exit(1)
  }
  return {
    id: data.user.id,
    async ask(action, payload = {}) {
      const result = await client.rpc('xp_arbitrate', {
        p_instance: instance,
        p_action: action,
        p_payload: payload as never,
      })
      if (result.error) throw new Error(result.error.message)
      return result.data as unknown as Verdict
    },
    async view() {
      const result = await client.rpc('xp_arbiter_view', { p_instance: instance })
      if (result.error) throw new Error(result.error.message)
      return result.data as unknown as Record<string, unknown>
    },
  }
}

/**
 * A fresh room per run, named after the moment.
 *
 * Never a fixed name: two runs sharing an instance would find a match already
 * dealt and already decided, and every rule below would be checked against
 * somebody else's game.
 */
const instance = `arbiter-check-${Date.now()}`

const [ana, bo, cass] = await Promise.all([signIn(), signIn(), signIn()])

console.log(`\n  ${instance}\n`)

// --- the match's numbers are pinned by whoever opens it ---------------------

ok('a first join pins the rules', (await ana.ask('join', { hp: 20, damage: 10, lives: 2 })).ok)

const mismatched = await bo.ask('join', { hp: 9999, damage: 9999, lives: 2 })
ok(
  'a join that disagrees about them is refused, not believed',
  !mismatched.ok && mismatched.why === 'refused',
  mismatched,
)

ok('a join that agrees is let in', (await bo.ask('join', { hp: 20, damage: 10, lives: 2 })).ok)
ok('and a third', (await cass.ask('join', { hp: 20, damage: 10, lives: 2 })).ok)

// --- a point for the kill, not for every hit -------------------------------

const first = await ana.ask('hit', { victim: bo.id })
ok('a hit that does not kill scores nothing', first.ok && first.outcome?.fatal === false, first.outcome)

const second = await ana.ask('hit', { victim: bo.id })
ok('the hit that takes them down does', second.ok && second.outcome?.fatal === true, second.outcome)
ok(
  'and it is one point rather than one per hit',
  (second.outcome?.scores as Record<string, number>)[ana.id] === 1,
  second.outcome?.scores,
)
ok(
  'a life goes with it, at the moment it happened',
  (second.outcome?.lives as Record<string, number>)[bo.id] === 1,
  second.outcome?.lives,
)

/**
 * The spoof, and it has to be a *fatal* one to mean anything.
 *
 * A hit that scores nothing proves nothing about who would have been credited,
 * so Cass takes Ana all the way down while naming Ana as the scorer in the
 * payload. Twenty health and ten damage is two hits.
 */
await cass.ask('hit', { victim: ana.id, by: ana.id })
const spoofed = await cass.ask('hit', { victim: ana.id, by: ana.id })
const afterSpoof = spoofed.outcome?.scores as Record<string, number>
ok('a kill claimed for somebody else still lands', spoofed.ok && spoofed.outcome?.fatal === true, spoofed)
ok('the credit went to whoever asked', afterSpoof[cass.id] === 1, afterSpoof)
ok('and not to the name in the payload', afterSpoof[ana.id] === 1, afterSpoof)
ok('the one they took down can come back', (await ana.ask('revive')).ok)

const selfHarm = await ana.ask('hit', { victim: ana.id })
ok('nobody shoots themselves for a point', !selfHarm.ok && selfHarm.why === 'refused', selfHarm)

const twice = await cass.ask('hit', { victim: bo.id })
ok('shooting somebody already down is stale, not an error', !twice.ok && twice.why === 'stale', twice)

// --- the secret is a secret -------------------------------------------------

const dealt = await ana.ask('deal', { values: ['impostor', 'crew', 'crew'] })
ok('a deal deals to everybody who joined', dealt.ok && dealt.outcome?.dealt === 3, dealt.outcome)
ok(
  'and returns no secret to whoever pressed it',
  !JSON.stringify(dealt.outcome ?? {}).includes('impostor'),
  dealt.outcome,
)

const again = await bo.ask('deal', { values: ['impostor', 'crew', 'crew'] })
ok('a second deal is refused', !again.ok && again.why === 'refused', again)

const [seenByAna, seenByBo, seenByCass] = await Promise.all([ana.view(), bo.view(), cass.view()])
const roles = [seenByAna.secret, seenByBo.secret, seenByCass.secret]
ok('everybody was dealt something', roles.every((role) => typeof role === 'string'), roles)
ok('exactly one impostor, from three values', roles.filter((role) => role === 'impostor').length === 1, roles)
ok('a view carries the count and not the roles', seenByAna.dealt === 3, seenByAna.dealt)
/**
 * The one that matters, counted rather than searched.
 *
 * Three roles were dealt and a view may mention exactly one - its own. A
 * `.includes()` check would pass by accident whenever the reader's own role
 * happened to be the one being looked for, which is the half of the time this
 * bug would have survived.
 */
const mentions = (seen: Record<string, unknown>) =>
  (JSON.stringify(seen).match(/impostor|crew/g) ?? []).length
ok('a view mentions exactly one role, its own', mentions(seenByAna) === 1, mentions(seenByAna))
ok('for everybody, not just the one who dealt', mentions(seenByBo) === 1 && mentions(seenByCass) === 1, [
  mentions(seenByBo),
  mentions(seenByCass),
])
ok('and there is no secrets map in it at all', !('secrets' in seenByAna), Object.keys(seenByAna))

// --- the vote ---------------------------------------------------------------

ok('a vote opens', (await ana.ask('vote_open', { seconds: 300 })).ok)

const reopened = await bo.ask('vote_open', {})
ok('a second one over it is refused', !reopened.ok && reopened.why === 'refused', reopened)

const early = await ana.ask('vote_close')
ok('closing before the deadline is stale', !early.ok && early.why === 'stale', early)

await ana.ask('vote', { target: cass.id })
const changed = await ana.ask('vote', { target: 'skip' })
ok(
  'changing your mind replaces your vote rather than adding one',
  ((changed.outcome?.vote as { cast?: Record<string, string> })?.cast ?? {})[ana.id] === 'skip',
  changed.outcome?.vote,
)

await ana.ask('vote', { target: cass.id })
await bo.ask('vote', { target: 'skip' })
const decided = await cass.ask('vote', { target: cass.id })
const tally = decided.outcome?.lastVote as { eliminated?: string; majority?: boolean; standing?: number }
ok('the last vote closes it', decided.ok && decided.outcome?.vote === null, decided.outcome?.vote)
ok('two of three is a majority', tally?.majority === true, tally)
ok('and it eliminates who it named', tally?.eliminated === cass.id, tally)

const outVotes = await cass.ask('vote_open', {})
ok('somebody out cannot open a vote', !outVotes.ok && outVotes.why === 'refused', outVotes)

const backUp = await cass.ask('revive')
ok('and cannot come back', !backUp.ok && backUp.why === 'refused', backUp)

const shootTheOut = await ana.ask('hit', { victim: cass.id })
ok('shooting somebody who is out is stale', !shootTheOut.ok && shootTheOut.why === 'stale', shootTheOut)

/**
 * The one the SQL checks could not have caught, now that it has been caught.
 *
 * Every check above reads `xp_arbitrate`'s outcome, which always carried the
 * vote. The *view* did not, so the panel a client draws from its poll went
 * blank a second after the vote opened and no other client ever saw one at all.
 * Two browsers found it; this keeps it found.
 */
// --- a vote nobody answers still ends --------------------------------------

/**
 * Two holes in one vote: that the room can *see* it, and that it ends.
 *
 * Nothing runs server-side on a schedule, so a vote where one player never
 * votes ends only because somebody asks. Ana opens a five-second one, Bo -
 * who did not open it - checks the view can see it, nobody casts anything, and
 * the close is asked for after it has passed.
 */
ok('a short vote opens', (await ana.ask('vote_open', { seconds: 5 })).ok)

const watching = await bo.view()
ok('the view carries the open vote', watching.vote !== null && watching.vote !== undefined, watching.vote)
ok('and the round it belongs to', typeof watching.round === 'number', watching.round)

/**
 * A deadline a browser can read, which is not the same as a deadline that is
 * correct.
 *
 * It was a correct timestamp in `+00` for a while, which Postgres and a person
 * read fine and `Date.parse` reads as NaN - so the panel counted down from zero
 * and the client that closes the vote scheduled nothing.
 */
const closes = (watching.vote as { closes?: string })?.closes
ok('the deadline parses in JavaScript', Number.isFinite(Date.parse(String(closes))), closes)
ok(
  'and it is in the future by about the seconds asked for',
  Date.parse(String(closes)) - Date.now() > 1000,
  { closes, inMs: Date.parse(String(closes)) - Date.now() },
)

await new Promise((wake) => setTimeout(wake, 6000))

const late = await bo.ask('vote_close')
const nothing = late.outcome?.lastVote as { majority?: boolean; eliminated?: string | null }
ok('it closes once the deadline has passed', late.ok && late.outcome?.vote === null, late)
ok('with nobody eliminated, because nobody voted', nothing?.eliminated === null, nothing)
ok('and no majority claimed for an empty room', nothing?.majority === false, nothing)

const closedTwice = await ana.ask('vote_close')
ok('closing it again is stale rather than an error', !closedTwice.ok && closedTwice.why === 'stale', closedTwice)

// --- a rematch --------------------------------------------------------------

/**
 * What round two has to look like, and it is not what it looked like before
 * this rule existed: the first round's scoreboard, and Cass still eliminated
 * from a match that has started again.
 */
const rematch = await ana.ask('reset', { round: 1 })
const afterReset = rematch.outcome as {
  scores?: Record<string, number>
  health?: Record<string, number>
  lives?: Record<string, number>
  dealt?: number
  round?: number
}
ok('a rematch starts a round', rematch.ok && afterReset?.round === 1, afterReset?.round)
ok(
  'everybody is back to nothing scored',
  Object.values(afterReset?.scores ?? {}).every((score) => score === 0),
  afterReset?.scores,
)
ok(
  'and back to full health',
  Object.values(afterReset?.health ?? {}).every((hp) => hp === 20),
  afterReset?.health,
)
ok(
  'the eliminated are back in it, which is the point',
  Object.values(afterReset?.lives ?? {}).every((left) => left === 2),
  afterReset?.lives,
)
ok('the roles are gone with the round', afterReset?.dealt === 0, afterReset?.dealt)
ok('and cass can play again', (await cass.ask('revive')).ok)

const sameRound = await bo.ask('reset', { round: 1 })
ok(
  'two people pressing rematch together is one rematch',
  !sameRound.ok && sameRound.why === 'stale',
  sameRound,
)
ok('and the round after it is allowed', (await bo.ask('reset', { round: 2 })).ok)

// --- what a client can reach directly ---------------------------------------

const direct = await createClient(url, anonKey, { auth: { persistSession: false } })
  .from('xp_arbiter_state')
  .select('*')
ok(
  'the table itself reads as nothing, however anybody asks',
  (direct.data?.length ?? 0) === 0,
  direct.error?.message ?? direct.data,
)

console.log(`\n  ${checks - failures}/${checks} checks passed\n`)
process.exit(failures > 0 ? 1 : 0)
