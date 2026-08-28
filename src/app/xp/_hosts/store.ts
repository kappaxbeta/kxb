'use client'

import { createClient } from '@/lib/supabase/client'
import type { XpPersistence } from '@kxb/xp/host'

/**
 * The `persistence` port, over `xp_store`.
 *
 * docs/xp/state.md §7 and docs/xp/scenes.md §3. The table landed in
 * `20261006000000_xp_store.sql`; this is the half that reads and writes it, and
 * it is the first implementation of this port that outlives a tab — `local.ts`
 * keeps a `localStorage` map and `memoryHost` keeps a `Map`.
 *
 * ---------------------------------------------------------------------------
 * The policies are the boundary, so this is an ordinary client
 * ---------------------------------------------------------------------------
 * No route, no server action. Every rule this has to keep is written as RLS on
 * the table — an XP's owner cannot read a `player` row, a space's row is
 * readable and writable by its members, a stranger sees neither — and those were
 * checked against the running database rather than assumed. Putting a route in
 * front of them would add a second place for the same rules to be right, which
 * is the arrangement where they eventually disagree.
 *
 * ---------------------------------------------------------------------------
 * A scope is a row, and a key is a field inside it
 * ---------------------------------------------------------------------------
 * §3.3 keys the table by `(xp_id, scope, owner)` with one `jsonb` value, so the
 * port's `get(key)` and `put(key, value)` address a field *within* a scope's
 * blob. The key therefore has to say which scope it means, and it says so out
 * loud: `player:coins`, `space:town`, `shared:score`. A default would be the
 * wrong kind of convenience — the difference between them is who can read what
 * afterwards, and that is not a thing to infer from a missing prefix.
 *
 * The three, in one line each:
 *
 *   - **`player`** — yours, read by you. Progress, inventory, where you left off.
 *   - **`space`** — one row for the whole space, read and written by its members.
 *   - **`shared`** — yours to write, read by every member (§7.1). A score on a
 *     board, a house in a shared town. `get` still reads *your* row; reading
 *     everybody's is `board()` below, because it answers with rows rather than
 *     with a value and pretending otherwise would make `get` mean two things.
 *
 * ---------------------------------------------------------------------------
 * One fetch per scope, then memory
 * ---------------------------------------------------------------------------
 * A `get` that reached the network every time would be one a game loop could
 * call sixty times a second. The row is fetched once per scope and kept; `put`
 * merges into the cached blob and writes the whole thing back, which is what
 * "last-write-wins per row" already means (§3.3) rather than an optimisation
 * layered on top of something stricter.
 *
 * The cost of that is honest and worth stating: a second client writing the same
 * scope is not noticed, and the later write wins wholesale. For `player` there
 * is no second writer. For `space` there is, and §3.3 chose this — a shared
 * town where two people place a block in the same second keeps one of them. The
 * design that does better is not a smarter cache, it is the arbiter (§4), and a
 * world that needs it should be asking for that rather than for this.
 */

/** `player:coins` → the `player` row's `coins`. Anything else is refused. */
const KEYED = /^(player|space|shared):(.+)$/

type Scope = 'player' | 'space' | 'shared'

type Blob = Record<string, unknown>

/**
 * A store for one XP, or null when there is nothing to store against.
 *
 * Null rather than a no-op, and the difference matters: `missingCapabilities`
 * refuses a document whose `backend.needs` includes `persistence` on a host that
 * has none, which is the whole point of the split between `needs` and `wants`.
 * A no-op store would let such a document load, run, appear to save, and lose
 * everything — the failure the port exists to make impossible.
 *
 * There is nothing to store against when the XP is not a saved project: the
 * table's `xp_id` is a foreign key into `xps_read_model`, and the documents
 * under `public/xp/xps/` are files with slugs rather than rows with ids. A demo
 * level is stateless by construction, which is §7.3's default rather than a
 * limitation.
 */
export interface XpStore extends XpPersistence {
  /**
   * Everybody's `shared` value for one field.
   *
   * Beside the port rather than in it: `get` answers with a value and this
   * answers with a row per player, and folding the two together would make the
   * port's simplest call mean different things depending on its key.
   */
  board(key: string): Promise<{ by: string; value: unknown }[]>
}

export function xpStore(xpId: string | null | undefined): XpStore | null {
  if (!xpId || !UUID.test(xpId)) return null

  /**
   * The client is built on the first read or write, not here.
   *
   * `xpStore` answers one question — does this host have a store — and every
   * refusal below is decided without a network: a key with no scope is rejected
   * before anything is fetched. Building the client eagerly made those answers
   * depend on `NEXT_PUBLIC_SUPABASE_URL` being set, which is why the test that
   * only asks whether a slug has a store failed on a runner that has no `.env`.
   */
  let client: ReturnType<typeof createClient> | null = null
  const db = () => (client ??= createClient())

  /** The blob per scope, once fetched. Absent means "not fetched yet". */
  const cache = new Map<Scope, Blob>()

  async function load(scope: Scope): Promise<Blob> {
    const cached = cache.get(scope)
    if (cached) return cached

    /**
     * `shared` needs the account in the filter, and that is not tidiness.
     *
     * RLS returns *every* member's shared row - which is the whole point of the
     * scope - so a query that asked for one row and got four would fail at
     * `maybeSingle`, and it would fail only in a space with more than one
     * person in it. Reading your own is what `get` means; everybody's is
     * `board`.
     */
    const mine = scope === 'space' ? null : await me(db())

    const rows = db()
      .from('xp_store')
      .select('value')
      .eq('xp_id', xpId as string)
      .eq('scope', scope)
    const { data, error } = await (mine ? rows.eq('account_id', mine) : rows).maybeSingle()

    /**
     * A read that failed is not an empty store.
     *
     * Caching `{}` here would turn one bad network moment into a `put` that
     * writes an empty blob over everything the player had — the same shape as
     * the stale-draft overwrite in §7.7, arriving from the other side. Throwing
     * means the caller sees the failure while the row is still intact.
     */
    if (error) throw new Error(`the store could not be read: ${error.message}`)

    const blob = (data?.value ?? {}) as Blob
    cache.set(scope, blob)
    return blob
  }

  return {
    async get(key: string): Promise<unknown> {
      const [scope, field] = split(key)
      const blob = await load(scope)
      return blob[field]
    },

    /**
     * Everybody's `shared` row for one field, for a board.
     *
     * Not on `XpPersistence`, and that is deliberate rather than shyness about
     * changing an interface: `get` answers with a value and this answers with a
     * row per player, so folding it into `get` would make the port's simplest
     * call mean two things depending on the key it was handed. A host that
     * cannot do this simply does not offer it, which is the same shape as every
     * other optional half of that port.
     *
     * The membership test is the policy's, not this query's — a stranger asking
     * gets an empty list rather than a refusal, because RLS filters rather than
     * throws. That is the right answer for a board: nothing to show.
     */
    async board(key: string): Promise<{ by: string; value: unknown }[]> {
      const [scope, field] = split(key)
      if (scope !== 'shared') {
        throw new Error(`only a shared key has a board; "${key}" is ${scope}`)
      }

      const { data, error } = await db()
        .from('xp_store')
        .select('account_id, value')
        .eq('xp_id', xpId as string)
        .eq('scope', 'shared')

      if (error) throw new Error(`the board could not be read: ${error.message}`)

      return (data ?? [])
        .map((row) => ({
          by: row.account_id as string,
          value: (row.value as Record<string, unknown>)?.[field],
        }))
        // A player who has written something else but not this field is not on
        // this board. Sorting and formatting belong to whatever draws it.
        .filter((entry) => entry.value !== undefined)
    },

    /**
     * The level's own record, kept forever.
     *
     * The third call on the port and the last one to get a host here. It is a
     * different thing from `put` in the way `host.ts` says out loud: a score
     * that can be overwritten is a score somebody can overwrite. So there is no
     * cache, no merge and no read-modify-write anywhere below — one row goes in
     * and nothing this client does can take it out again.
     *
     * ---------------------------------------------------------------------------
     * A function rather than an insert, which is the one place this file bends
     * ---------------------------------------------------------------------------
     * Everything above is an ordinary query against a policy, and the note at
     * the top of this file argues at length that this is right. This goes
     * through `xp_stream_append` for a reason that is a property of the write
     * rather than a preference: the ceiling is *per writer per stream*, and a
     * limit expressed as RLS would have to count rows inside a policy — which
     * runs per row, on every read, forever, to guard a write.
     *
     * The function also assigns the account instead of accepting one, so a
     * level cannot record something under somebody else's name. The port has no
     * field for it, and now neither does the database.
     *
     * ---------------------------------------------------------------------------
     * A stream name is the author's, and it carries no scope
     * ---------------------------------------------------------------------------
     * `get` and `put` demand a `player:` / `space:` / `shared:` prefix because
     * the difference between those is who may read afterwards, which is not a
     * thing to infer from a missing word. `append` has one answer to that
     * question — the space it lives in reads it, per the table's policy — so
     * there is nothing for a prefix to say, and demanding one would be ceremony
     * that means nothing.
     */
    async append(stream: string, type: string, data: unknown): Promise<void> {
      const { error } = await db().rpc('xp_stream_append', {
        p_xp_id: xpId as string,
        p_stream: stream,
        p_type: type,
        p_data: eventData(data) as never,
      })

      /**
       * Said in the level's own words where the function had them.
       *
       * The three refusals it raises are all things an author can act on — no
       * account, no such level, the ceiling reached — and they arrive already
       * phrased for a person. Wrapping them in "the store refused that write"
       * the way `put` does would bury the sentence that explains it.
       */
      if (error) throw new Error(error.message)
    },

    async put(key: string, value: unknown): Promise<void> {
      const [scope, field] = split(key)

      /**
       * Who is writing, and the one refusal that is not operational.
       *
       * §7.8: *no account* and *the write failed* are different in kind. This
       * one was true before the level opened and never becomes true mid-session,
       * so there is nothing an author can retry — which is why it is said in
       * these words rather than returned as a failed write among others. A
       * guest belongs in an XP whose disclosure said so at the door.
       */
      const account = scope === 'space' ? null : await me(db())
      if (scope !== 'space' && !account) {
        throw new Error('saving in this level needs an account; this session has none')
      }

      /**
       * One key, merged where the row is.
       *
       * This used to `upsert` a blob built from the cache above, and every layer
       * over it believed otherwise: `put(key, value)` addresses a field *within*
       * a scope, and `changed()` answers with the names that moved so a client
       * writes only those. Sending the whole row put every field back to
       * whatever this client last saw - across two clients, last-write-wins over
       * data neither of them touched; against `xp_visit`, a raided plant coming
       * home the moment its owner saved anything at all.
       *
       * `xp_store_put` is `security invoker`, so the row's own policies decide
       * this exactly as they decided the upsert. The conflict target moves with
       * it: `(xp_id, scope, account_id)` with nulls not distinct, which is what
       * `20261008000000` exists for - a `space` row's null account collides with
       * itself rather than becoming a tenth row for the same XP.
       *
       * **Two writers of one key still race**, and that is not this call's to
       * fix: a level computing `mine + 1` from a stale number overwrites
       * whatever moved in between, and only a store that knows *add one* from
       * *set to four* can compose those. See the migration.
       */
      const { error } = await db().rpc('xp_store_put', {
        p_xp: xpId as string,
        p_scope: scope,
        p_key: field,
        p_value: value as never,
      })

      /**
       * The cache is updated only after the write lands.
       *
       * Latching it before would be §9's known trap, which this repo has
       * already shipped once: a race finish shown as recorded before the server
       * had it. A `get` after a failed `put` should read what is actually
       * stored, not what somebody hoped would be.
       */
      if (error) throw new Error(`the store refused that write: ${error.message}`)
      /**
       * Only the key we wrote, into whatever the cache already held.
       *
       * It used to set the whole blob it had just sent, which was the same
       * mistake as the write: a cache that claims to know every field of a scope
       * is one that hands a stale neighbour back to the next `get`. What this
       * client knows after a write is its own key.
       */
      cache.set(scope, { ...(cache.get(scope) ?? {}), [field]: value })
    },
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * What an author appended, as the object the column stores.
 *
 * The port takes `unknown` and the column is `jsonb`, so something has to
 * decide what a level appending the number `12.5` means. It is **wrapped, not
 * refused**: a script recording a time as a bare number is an author being
 * brief, not an author being wrong, and a call that threw on it would send
 * somebody to read our types to find out why their race result vanished.
 *
 * An array is wrapped too, though `jsonb` would take it: a stream where some
 * entries are objects and some are arrays is one no later reader can fold
 * without a branch per entry. One shape in, one shape out.
 *
 * Exported because it is the only decision in `append` that does not need a
 * database to be wrong.
 */
export function eventData(value: unknown): Record<string, unknown> {
  const isObject = typeof value === 'object' && value !== null && !Array.isArray(value)
  return isObject ? (value as Record<string, unknown>) : { value: value ?? null }
}

function split(key: string): [Scope, string] {
  const match = KEYED.exec(key)
  /**
   * Refused rather than defaulted, and loudly.
   *
   * A key with no scope is an author who has not decided who may read this, and
   * guessing on their behalf gets it wrong in the direction that cannot be
   * taken back: a `player` blob promoted to `space` is somebody's progress
   * shown to the space.
   */
  if (!match) {
    throw new Error(
      `a store key says which scope it is in: "player:${key}", "shared:${key}" or "space:${key}", not "${key}"`,
    )
  }
  return [match[1] as Scope, match[2]]
}

/** The account writing, for the `player` row's own column. */
async function me(supabase: ReturnType<typeof createClient>): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}
