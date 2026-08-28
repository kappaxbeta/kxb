/**
 * The log, the sequence and the sweep, against the real local stack.
 *
 * ---------------------------------------------------------------------------
 * Why this one opens no browsers
 * ---------------------------------------------------------------------------
 * Every other spec here needs three Chromiums because the thing under test is
 * something a client draws - a die that came back late, a piece that would not
 * move. Nothing in this file is drawn. What is under test is what happens on
 * the server when several writers arrive at one space at the same moment, and a
 * browser would only be a slow way to issue an HTTP request.
 *
 * It lives here rather than in `bun test` for the reason the whole directory
 * exists: it needs a running Supabase and a running dev server, and the unit
 * suite is not allowed to need either.
 *
 *     bun run dev            # in another terminal
 *     bun run xp:e2e
 *
 * ---------------------------------------------------------------------------
 * What it is actually defending
 * ---------------------------------------------------------------------------
 * Three properties, and the first two are the ones that were silently untrue
 * before 20261120000000:
 *
 *   1. **Concurrent appends to one space produce a contiguous sequence.** No
 *      duplicates, no holes. This is what makes a cursor over the log safe.
 *   2. **A reader stops at a hole rather than stepping over it.** The safety net
 *      under (1), which should be unreachable and is tested anyway - it is the
 *      difference between an invariant that is verified and one that is trusted,
 *      and this one used to be trusted.
 *   3. **The sweep converges.** Run it and every projection reaches the head;
 *      run it again and there is nothing to do.
 *
 * Written as one spec with three assertions rather than three specs, because
 * they share an expensive fixture - a scratch space with a few hundred events in
 * it - and building it three times is most of the runtime.
 */
import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Both files, `.env.local` first.
 *
 * `players.ts` reads only `.env.local` and is right to - everything it wants is
 * there. This spec also needs `CRON_SECRET`, which lives in `.env`, so it reads
 * both in the order Next itself does: local overrides, shared underneath.
 */
const env = ['.env.local', '.env']
  .map((file) => {
    try {
      return readFileSync(path.join(process.cwd(), file), 'utf8')
    } catch {
      return ''
    }
  })
  .join('\n')

function fromEnv(key: string): string {
  const line = env.split('\n').find((one) => one.startsWith(`${key}=`))
  if (!line) throw new Error(`${key} is in neither .env.local nor .env`)
  return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, '')
}

const SUPABASE = fromEnv('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE = fromEnv('SUPABASE_SERVICE_ROLE_KEY')
const CRON = fromEnv('CRON_SECRET')
const APP = process.env.E2E_BASE ?? 'http://localhost:3000'

/**
 * The service role, not a member session.
 *
 * Deliberate, and worth defending because the other specs go out of their way
 * to be real players. What is under test here is a trigger and a cursor, and
 * both sit *below* RLS - they behave identically whoever is asking. Minting
 * eight member sessions would test the membership path instead, slowly, and
 * membership has its own coverage.
 */
async function rest(pathname: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${SUPABASE}/rest/v1/${pathname}`, {
    ...init,
    headers: {
      apikey: SERVICE,
      authorization: `Bearer ${SERVICE}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
}

async function rpc(name: string, body: unknown): Promise<unknown> {
  const response = await rest(`rpc/${name}`, { method: 'POST', body: JSON.stringify(body) })
  if (!response.ok) {
    throw new Error(`${name} failed: ${response.status} ${await response.text()}`)
  }
  return response.json()
}

/** A space nobody else is writing to, so a parallel run cannot pollute the count. */
function scratchTenant(): string {
  // A v4-shaped id that is not in `tenants_read_model`. `events.tenant_id` has
  // no foreign key - which is what makes this possible - and nothing in this
  // spec reads a read model that would need the space to exist.
  const hex = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`
}

test('concurrent appends to one space stay contiguous, and a hole stops the reader', async () => {
  test.setTimeout(120_000)

  const tenant = scratchTenant()

  // ---------------------------------------------------------------------------
  // 1. Twelve writers, all at once, all into one space
  // ---------------------------------------------------------------------------
  // Each on its own stream, because `append_events` takes an expected version
  // per stream and twelve writers on one stream is a test of optimistic
  // concurrency instead. Different streams, one tenant, is the shape that used
  // to lose events: nothing serialises them, and `global_seq` was handed out
  // before commit.
  const WRITERS = 12
  const PER_WRITER = 5

  const appends = Array.from({ length: WRITERS }, (_, w) => {
    const stream = scratchTenant()
    return (async () => {
      for (let i = 0; i < PER_WRITER; i++) {
        await rpc('append_events', {
          p_tenant_id: tenant,
          p_stream_id: stream,
          p_stream_type: 'tasks',
          p_expected_version: i,
          p_events: [{ type: 'TaskCreated', data: { title: `w${w}-${i}` } }],
        })
      }
    })()
  })

  await Promise.all(appends)

  const rows = (await (
    await rest(`events?tenant_id=eq.${tenant}&select=tenant_seq&order=tenant_seq.asc`)
  ).json()) as { tenant_seq: number }[]

  const seqs = rows.map((r) => Number(r.tenant_seq))

  expect(seqs).toHaveLength(WRITERS * PER_WRITER)

  // The invariant, stated three ways because each catches a different failure:
  // a duplicate means two writers were handed the same number, a hole means one
  // was burned by a rollback, and the start means the counter did not begin
  // where a fresh space should.
  expect(new Set(seqs).size).toBe(seqs.length)
  expect(seqs[0]).toBe(1)
  expect(seqs).toEqual(Array.from({ length: seqs.length }, (_, i) => i + 1))

  // ---------------------------------------------------------------------------
  // 2. A hole stops the reader
  // ---------------------------------------------------------------------------
  // Forced, because after (1) it cannot occur naturally - which is the point.
  // The trigger only allocates when tenant_seq is null, so writing one
  // explicitly leaves the number below it unused and unowned.
  const head = seqs[seqs.length - 1]!
  const hole = head + 1
  const beyond = head + 2

  await rest('events', {
    method: 'POST',
    body: JSON.stringify({
      tenant_id: tenant,
      stream_id: scratchTenant(),
      stream_type: 'tasks',
      version: 1,
      type: 'TaskCreated',
      data: { title: 'past the hole' },
      tenant_seq: beyond,
    }),
  })

  await rest('projection_checkpoints', {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      projection: 'e2e_gap_probe',
      tenant_id: tenant,
      last_seq: head,
      updated_at: new Date().toISOString(),
    }),
  })

  const visible = (await rpc('events_since_checkpoint', {
    p_tenant_id: tenant,
    p_projection: 'e2e_gap_probe',
    p_limit: 500,
  })) as { global_seq: number | null }[]

  const real = visible.filter((row) => row.global_seq !== null)

  // Nothing. The only event past the cursor sits behind an unfilled hole, and
  // stepping over it is exactly the data loss this design exists to prevent -
  // in production that hole is an append that has not committed yet, and it
  // will.
  expect(real).toHaveLength(0)
  expect(hole).toBeLessThan(beyond)

  // ---------------------------------------------------------------------------
  // Clean up, so a repeat run measures its own writes
  // ---------------------------------------------------------------------------
  await rest(`events?tenant_id=eq.${tenant}`, { method: 'DELETE' })
  await rest(`projection_checkpoints?tenant_id=eq.${tenant}`, { method: 'DELETE' })
  await rest(`tenant_event_sequences?tenant_id=eq.${tenant}`, { method: 'DELETE' })
})

test('the sweep drains every projection and then has nothing to do', async () => {
  test.setTimeout(180_000)

  async function project(): Promise<{ pending: number; remaining: number; failed: number }> {
    const response = await fetch(`${APP}/api/cron/project`, {
      method: 'POST',
      headers: { authorization: `Bearer ${CRON}` },
    })
    expect(response.status).toBe(200)
    return response.json() as Promise<{ pending: number; remaining: number; failed: number }>
  }

  // Twice, because "it converged" is the assertion and one run cannot make it.
  // The first is allowed to find a backlog - a developer database always has
  // one - and is only required to survive it.
  const first = await project()
  expect(first.failed).toBe(0)
  expect(first.remaining).toBe(0)

  // The steady state, and the thing that would break loudly if a checkpoint were
  // written wrong: a sweep that never converges reports work every single run,
  // for ever, while looking like it is doing its job.
  const second = await project()
  expect(second.failed).toBe(0)
  expect(second.pending).toBe(0)
})

test('deleting the account that wrote an event leaves the event in the log', async () => {
  test.setTimeout(60_000)

  // ---------------------------------------------------------------------------
  // The one that punched every hole the two tests above defend against
  // ---------------------------------------------------------------------------
  // `events.actor_id` referenced `auth.users` with `on delete cascade` from
  // 20260725090000 until 20261223000000, and `/api/cron/reap-guests` deletes an
  // anonymous account every hour. So the append-only log had exactly one writer
  // permitted to delete from it, and it used that permission on every visitor
  // who had ever played a match.
  //
  // This is the smallest statement of the property that stops it: write an
  // event as somebody, delete somebody, and the event is still there. It goes
  // through the real GoTrue admin endpoint rather than a DELETE on auth.users,
  // because that endpoint is what the reaper calls and a cascade is a property
  // of the delete rather than of who issued it.
  const tenant = scratchTenant()

  const created = await fetch(`${SUPABASE}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE,
      authorization: `Bearer ${SERVICE}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      // Not an anonymous account, deliberately: `is_anonymous` is what the
      // reaper filters on, and the foreign key has never cared. A named account
      // makes the same point and does not need a session minting.
      email: `e2e-actor-${tenant}@example.invalid`,
      password: crypto.randomUUID(),
      email_confirm: true,
    }),
  })
  expect(created.status).toBe(200)
  const actor = ((await created.json()) as { id: string }).id

  // As the service role, straight into the table. `append_events` would stamp
  // the actor from the session and there is no session here; what is under test
  // is the foreign key, which does not care which door the row came in by.
  const written = await rest('events', {
    method: 'POST',
    body: JSON.stringify({
      tenant_id: tenant,
      stream_id: scratchTenant(),
      stream_type: 'battle',
      version: 1,
      type: 'BattleCreated',
      data: { name: 'the one that outlives its author' },
      actor_id: actor,
    }),
  })
  expect(written.ok).toBe(true)

  const deleted = await fetch(`${SUPABASE}/auth/v1/admin/users/${actor}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` },
  })
  expect(deleted.ok).toBe(true)

  const after = (await (
    await rest(`events?tenant_id=eq.${tenant}&select=tenant_seq,actor_id`)
  ).json()) as { tenant_seq: number; actor_id: string | null }[]

  // The row survives, its author does not, and - the part that matters for
  // every projection downstream - the number it was given is still in the
  // sequence. A missing row here is the hole that parks a read model for a
  // week without raising anything.
  expect(after).toHaveLength(1)
  expect(after[0]!.actor_id).toBeNull()
  expect(Number(after[0]!.tenant_seq)).toBe(1)

  const head = (await (
    await rest(`tenant_event_sequences?tenant_id=eq.${tenant}&select=last_seq`)
  ).json()) as { last_seq: number }[]
  expect(Number(head[0]!.last_seq)).toBe(1)

  await rest(`events?tenant_id=eq.${tenant}`, { method: 'DELETE' })
  await rest(`tenant_event_sequences?tenant_id=eq.${tenant}`, { method: 'DELETE' })
})
