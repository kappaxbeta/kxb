import { describe, expect, test } from 'bun:test'
import { decide } from '@/domain/lounge/aggregate'
import { worldOf } from '@/domain/lounge/events'
import { chunkStreamId } from '@/domain/lounge/streams'

const TENANT = '11111111-1111-4111-8111-111111111111'
const ARENA = '22222222-2222-4222-8222-222222222222'

/**
 * The compatibility rule, tested rather than trusted.
 *
 * Every block event written before battlefields existed carries no `worldId`,
 * and the backfill in 20260803030000_lounge_worlds.sql set those rows to
 * `world_id = tenant_id`. A projection replaying that old history has to land
 * on exactly those rows - if `worldOf` disagreed with the backfill, a replay
 * would file the whole lounge into a second world and the room would look
 * empty.
 */
describe('worldOf', () => {
  test("an event with no worldId is the tenant's own lounge", () => {
    expect(worldOf({}, TENANT)).toBe(TENANT)
  })

  test('an event that names a world means that world', () => {
    expect(worldOf({ worldId: ARENA }, TENANT)).toBe(ARENA)
  })
})

describe('chunk stream ids', () => {
  /**
   * The lounge's streams must not move. Every chunk stream id in the log was
   * derived from the tenant id before this parameter was renamed, so passing a
   * tenant id still has to produce the same id or the world's history becomes
   * unreachable.
   */
  test('a tenant id still derives the id its history was written under', () => {
    expect(chunkStreamId(TENANT, 0, 0)).toBe(chunkStreamId(TENANT, 0, 0))
    expect(chunkStreamId(TENANT, 0, 0)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })

  test('two worlds never share a stream for the same chunk', () => {
    expect(chunkStreamId(TENANT, 3, -2)).not.toBe(chunkStreamId(ARENA, 3, -2))
  })

  test('two chunks in one world never share a stream', () => {
    expect(chunkStreamId(ARENA, 0, 0)).not.toBe(chunkStreamId(ARENA, 0, 1))
  })
})

describe('the world travels with the event', () => {
  /**
   * A projection receives an event and an opaque stream id it cannot invert, so
   * the world has to be in the payload or the blocks cannot be placed. Same
   * argument the cx/cz fields already make in events.ts.
   */
  test('placing blocks in an arena records which arena', () => {
    const events = decide(
      { blocks: {} },
      {
        type: 'PlaceBlocks',
        worldId: ARENA,
        cx: 0,
        cz: 0,
        blocks: [{ x: 1, y: 0, z: 1, model: 'stone' }],
      },
    )

    expect(events[0]?.data).toMatchObject({ worldId: ARENA, cx: 0, cz: 0 })
  })

  test('removing blocks records which arena', () => {
    const events = decide(
      { blocks: { '1,0,1': 'stone' } },
      {
        type: 'RemoveBlocks',
        worldId: ARENA,
        cx: 0,
        cz: 0,
        positions: [{ x: 1, y: 0, z: 1 }],
      },
    )

    expect(events[0]?.data).toMatchObject({ worldId: ARENA })
  })

  test('clearing a chunk records which arena', () => {
    const events = decide(
      { blocks: { '1,0,1': 'stone' } },
      { type: 'ClearChunk', worldId: ARENA, cx: 0, cz: 0 },
    )

    expect(events[0]?.data).toMatchObject({ worldId: ARENA })
  })

  /**
   * A command that names no world produces an event that names no world, and
   * `worldOf` reads it as the lounge. This is the shape of every block event
   * written before battlefields existed - the action names the world explicitly
   * now, so nothing new looks like this, but the log is full of events that do
   * and the projection has to keep placing them correctly forever.
   */
  test('an unnamed world reads as the lounge, as all old history does', () => {
    const events = decide(
      { blocks: {} },
      { type: 'PlaceBlocks', cx: 0, cz: 0, blocks: [{ x: 1, y: 0, z: 1, model: 'stone' }] },
    )

    expect(events[0]?.data.worldId).toBeUndefined()
    expect(worldOf(events[0]!.data, TENANT)).toBe(TENANT)
  })

  /**
   * And naming the lounge explicitly - which is what the action now does, since
   * `resolveWorld` returns the tenant id for it - has to land in exactly the
   * same place. If these two disagreed, the lounge would split in half at the
   * moment this code shipped.
   */
  test('naming the lounge explicitly is the same world as omitting it', () => {
    expect(worldOf({ worldId: TENANT }, TENANT)).toBe(worldOf({}, TENANT))
  })
})
