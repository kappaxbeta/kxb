import { describe, expect, test } from 'bun:test'
import { listBuiltinXps, versionFor, type SummaryRow } from '@/domain/xps/playable'
import { OFFERED_IN_A_ROOM } from '@/domain/xps/room'
import { unsupported } from '@kxb/xp/host'

/**
 * Which version a place would play - the one decision inside `listPlayableXps`,
 * pulled out for the reason `plays.ts`'s `playsByProject` is: this is the part
 * with a decision in it, and the rest is two network calls.
 *
 * The bug this exists to pin: a project fresh out of `/browse/new` has
 * `current_version: 0` until its first save, and `0 !== null` - so the old
 * version of this function handed it straight through, `formatXpRef` spelled
 * it `p-<uuid>-v0`, and that reference could be pinned to a room. The document
 * behind it had never been stored, so the room came up permanently "not open"
 * with no way back - the level could not be taken down and played again,
 * because it had never been up.
 */

const SPACE = 'space-uuid'
const OTHER_SPACE = 'other-space-uuid'

const row = (over: Partial<SummaryRow> = {}): SummaryRow => ({
  id: 'xp-uuid',
  tenant_id: SPACE,
  name: 'Minigolf',
  blurb: null,
  cover_path: null,
  state: 'draft',
  current_version: 1,
  published_version: null,
  copied_from: null,
  updated_at: new Date(0).toISOString(),
  ...over,
})

describe('which version a place would play', () => {
  test('a space plays its own project at the version it is on', () => {
    expect(versionFor(row({ tenant_id: SPACE, current_version: 3 }), SPACE)).toBe(3)
  })

  /**
   * The fix. Zero is not a version somebody saved - it is what a project reads
   * before its first save - so there is nothing here to play yet.
   */
  test('a project nobody has saved has nothing to play, even in its own space', () => {
    expect(versionFor(row({ tenant_id: SPACE, current_version: 0 }), SPACE)).toBeNull()
  })

  test("another space's published project plays at what was published", () => {
    expect(
      versionFor(
        row({
          tenant_id: OTHER_SPACE,
          state: 'published',
          current_version: 5,
          published_version: 3,
        }),
        SPACE,
      ),
    ).toBe(3)
  })

  test("another space's draft is not playable at all", () => {
    expect(
      versionFor(row({ tenant_id: OTHER_SPACE, state: 'draft', current_version: 2 }), SPACE),
    ).toBeNull()
  })

  /**
   * Belt and braces: a published row with a null `published_version` should
   * not happen, but this is the same "absence is null, not a guess" rule as
   * the zero case above rather than a value this function would invent one for.
   */
  test('a published row with no published version is not playable either', () => {
    expect(
      versionFor(
        row({ tenant_id: OTHER_SPACE, state: 'published', published_version: null }),
        SPACE,
      ),
    ).toBeNull()
  })
})

/**
 * What a level we ship can and cannot be given.
 *
 * Reported as *"I can't play Steal a Plant"*, with a room's URL - and the room
 * had nothing to do with it. `steal-a-plant` declares `needs: [identity,
 * persistence]`; `xp_store.xp_id` is a foreign key into `xps_read_model`, so
 * `xpStore` answers null for anything that is not a saved project; and the
 * scene refuses a document whose needs it cannot meet. That level was therefore
 * refused on every screen in the app, every time, and had been since it shipped.
 *
 * These run against the real files rather than a fixture, deliberately. The
 * claim is about the eight documents we actually ship - a fixture would prove
 * the arithmetic and let a ninth land tomorrow with the same problem.
 */
describe('the levels we ship, and what a room can offer them', () => {
  test('every one of them parses, or it would not be listed at all', async () => {
    const xps = await listBuiltinXps()
    expect(xps.length).toBeGreaterThan(0)
    expect(xps.every((xp) => xp.id.length > 0)).toBe(true)
  })

  test('a room offers exactly what the scene composes, and not a fourth thing', () => {
    /**
     * Pinned to the runtime rather than described. `scene.tsx` builds `offered`
     * from `me` and `room` - identity, network, arbiter - and a shelf promising
     * `chat` or `persistence` would be disagreeing with the door people walk
     * through a second later.
     */
    expect([...OFFERED_IN_A_ROOM].sort()).toEqual(['arbiter', 'identity', 'network'])
  })

  test('the one that needs saving cannot be played as a file, and the shelf says which', async () => {
    const steal = (await listBuiltinXps()).find((xp) => xp.id === 'steal-a-plant')
    expect(steal).toBeDefined()
    expect(steal!.needs).toContain('persistence')
    expect(unsupported(steal!.needs, OFFERED_IN_A_ROOM)).toEqual(['persistence'])
  })

  test('and the ones that ask for nothing it cannot have are offerable as they are', async () => {
    // The check that keeps the warning honest: if this ever became "all of
    // them", the shelf would be telling everybody to remix everything.
    const xps = await listBuiltinXps()
    const fine = xps.filter((xp) => unsupported(xp.needs, OFFERED_IN_A_ROOM).length === 0)
    expect(fine.length).toBeGreaterThan(0)
  })
})
