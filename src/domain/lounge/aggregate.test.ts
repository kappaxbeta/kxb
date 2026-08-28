import { describe, expect, test } from 'bun:test'
import { decide, initialChunkState, loungeDecider } from '@/domain/lounge/aggregate'
import {
  CHUNK_SIZE,
  chunkOf,
  type LoungeEvent,
  WORLD_HEIGHT,
} from '@/domain/lounge/events'
import { chunkStreamId } from '@/domain/lounge/streams'
import { DomainError } from '@/es/errors'
import { fold } from '@/es/types'

function given(...events: LoungeEvent[]) {
  return fold(loungeDecider, events)
}

const TENANT = '11111111-1111-4111-8111-111111111111'

describe('placing blocks', () => {
  test('places into an empty chunk', () => {
    const events = decide(initialChunkState, {
      type: 'PlaceBlocks',
      cx: 0,
      cz: 0,
      blocks: [{ x: 1, y: 0, z: 2, model: 'dirt' }],
    })

    expect(events).toEqual([
      {
        type: 'BlocksPlaced',
        data: { cx: 0, cz: 0, blocks: [{ x: 1, y: 0, z: 2, model: 'dirt' }] },
      },
    ])
  })

  test('re-placing the identical block is a no-op', () => {
    const state = given({
      type: 'BlocksPlaced',
      data: { cx: 0, cz: 0, blocks: [{ x: 1, y: 0, z: 2, model: 'dirt' }] },
    })

    expect(
      decide(state, {
        type: 'PlaceBlocks',
        cx: 0,
        cz: 0,
        blocks: [{ x: 1, y: 0, z: 2, model: 'dirt' }],
      }),
    ).toEqual([])
  })

  test('changing a block to a different model is a real change', () => {
    const state = given({
      type: 'BlocksPlaced',
      data: { cx: 0, cz: 0, blocks: [{ x: 1, y: 0, z: 2, model: 'dirt' }] },
    })

    expect(
      decide(state, {
        type: 'PlaceBlocks',
        cx: 0,
        cz: 0,
        blocks: [{ x: 1, y: 0, z: 2, model: 'stone' }],
      }),
    ).toHaveLength(1)
  })

  test('a drag that repeats cells only records the new ones', () => {
    const state = given({
      type: 'BlocksPlaced',
      data: {
        cx: 0,
        cz: 0,
        blocks: [
          { x: 0, y: 0, z: 0, model: 'dirt' },
          { x: 1, y: 0, z: 0, model: 'dirt' },
        ],
      },
    })

    const events = decide(state, {
      type: 'PlaceBlocks',
      cx: 0,
      cz: 0,
      blocks: [
        { x: 0, y: 0, z: 0, model: 'dirt' },
        { x: 1, y: 0, z: 0, model: 'dirt' },
        { x: 2, y: 0, z: 0, model: 'dirt' },
      ],
    })

    expect(events).toHaveLength(1)
    expect((events[0] as { data: { blocks: unknown[] } }).data.blocks).toEqual([
      { x: 2, y: 0, z: 0, model: 'dirt' },
    ])
  })
})

describe('duplicate cells within one batch', () => {
  // Regression: a batch that named the same cell twice produced an event with
  // two rows for one primary key, which Postgres refuses to upsert - and being
  // in the log, it broke the projector on every subsequent run.
  test('the same cell twice collapses to one placement, last wins', () => {
    const events = decide(initialChunkState, {
      type: 'PlaceBlocks',
      cx: 0,
      cz: 0,
      blocks: [
        { x: 1, y: 0, z: 1, model: 'dirt' },
        { x: 1, y: 0, z: 1, model: 'stone' },
      ],
    })

    expect(events).toEqual([
      {
        type: 'BlocksPlaced',
        data: { cx: 0, cz: 0, blocks: [{ x: 1, y: 0, z: 1, model: 'stone' }] },
      },
    ])
  })

  test('the identical block twice collapses to one', () => {
    const events = decide(initialChunkState, {
      type: 'PlaceBlocks',
      cx: 0,
      cz: 0,
      blocks: [
        { x: 2, y: 3, z: 4, model: 'dirt' },
        { x: 2, y: 3, z: 4, model: 'dirt' },
      ],
    })

    expect((events[0] as { data: { blocks: unknown[] } }).data.blocks).toHaveLength(1)
  })

  test('a duplicate that ends up matching state records nothing', () => {
    const state = given({
      type: 'BlocksPlaced',
      data: { cx: 0, cz: 0, blocks: [{ x: 1, y: 0, z: 1, model: 'stone' }] },
    })

    expect(
      decide(state, {
        type: 'PlaceBlocks',
        cx: 0,
        cz: 0,
        blocks: [
          { x: 1, y: 0, z: 1, model: 'dirt' },
          { x: 1, y: 0, z: 1, model: 'stone' },
        ],
      }),
    ).toEqual([])
  })

  test('removals dedupe too', () => {
    const state = given({
      type: 'BlocksPlaced',
      data: { cx: 0, cz: 0, blocks: [{ x: 5, y: 0, z: 5, model: 'dirt' }] },
    })

    const events = decide(state, {
      type: 'RemoveBlocks',
      cx: 0,
      cz: 0,
      positions: [
        { x: 5, y: 0, z: 5 },
        { x: 5, y: 0, z: 5 },
      ],
    })

    expect((events[0] as { data: { positions: unknown[] } }).data.positions).toEqual([
      { x: 5, y: 0, z: 5 },
    ])
  })
})

describe('chunk boundaries', () => {
  test('a block from a neighbouring chunk is rejected', () => {
    expect(() =>
      decide(initialChunkState, {
        type: 'PlaceBlocks',
        cx: 0,
        cz: 0,
        blocks: [{ x: CHUNK_SIZE, y: 0, z: 0, model: 'dirt' }],
      }),
    ).toThrow(/does not belong to chunk/i)
  })

  test('negative coordinates land in negative chunks, not chunk 0', () => {
    expect(chunkOf(-1, -1)).toEqual({ cx: -1, cz: -1 })
    expect(chunkOf(-16, -16)).toEqual({ cx: -1, cz: -1 })
    expect(chunkOf(-17, -17)).toEqual({ cx: -2, cz: -2 })
  })

  test('a chunk accepts its own negative coordinates', () => {
    expect(
      decide(initialChunkState, {
        type: 'PlaceBlocks',
        cx: -1,
        cz: -1,
        blocks: [{ x: -1, y: 0, z: -1, model: 'dirt' }],
      }),
    ).toHaveLength(1)
  })

  test('blocks above the height limit are rejected', () => {
    expect(() =>
      decide(initialChunkState, {
        type: 'PlaceBlocks',
        cx: 0,
        cz: 0,
        blocks: [{ x: 0, y: WORLD_HEIGHT, z: 0, model: 'dirt' }],
      }),
    ).toThrow(/between y=0/i)
  })

  test('non-integer coordinates are rejected', () => {
    expect(() =>
      decide(initialChunkState, {
        type: 'PlaceBlocks',
        cx: 0,
        cz: 0,
        blocks: [{ x: 0.5, y: 0, z: 0, model: 'dirt' }],
      }),
    ).toThrow(DomainError)
  })
})

describe('removing blocks', () => {
  const state = given({
    type: 'BlocksPlaced',
    data: { cx: 0, cz: 0, blocks: [{ x: 1, y: 0, z: 1, model: 'dirt' }] },
  })

  test('removes a block that exists', () => {
    expect(
      decide(state, {
        type: 'RemoveBlocks',
        cx: 0,
        cz: 0,
        positions: [{ x: 1, y: 0, z: 1 }],
      }),
    ).toEqual([
      { type: 'BlocksRemoved', data: { cx: 0, cz: 0, positions: [{ x: 1, y: 0, z: 1 }] } },
    ])
  })

  test('breaking air records nothing', () => {
    expect(
      decide(state, {
        type: 'RemoveBlocks',
        cx: 0,
        cz: 0,
        positions: [{ x: 9, y: 9, z: 9 }],
      }),
    ).toEqual([])
  })

  test('clearing an empty chunk is a no-op', () => {
    expect(decide(initialChunkState, { type: 'ClearChunk', cx: 0, cz: 0 })).toEqual([])
  })
})

describe('replay', () => {
  test('the world is the fold of its events', () => {
    const state = given(
      {
        type: 'BlocksPlaced',
        data: {
          cx: 0,
          cz: 0,
          blocks: [
            { x: 0, y: 0, z: 0, model: 'dirt' },
            { x: 1, y: 0, z: 0, model: 'stone' },
          ],
        },
      },
      { type: 'BlocksRemoved', data: { cx: 0, cz: 0, positions: [{ x: 0, y: 0, z: 0 }] } },
      {
        type: 'BlocksPlaced',
        data: { cx: 0, cz: 0, blocks: [{ x: 2, y: 1, z: 3, model: 'glass' }] },
      },
    )

    expect(state.blocks).toEqual({ '1,0,0': 'stone', '2,1,3': 'glass' })
  })

  test('ChunkCleared wipes the chunk', () => {
    const state = given(
      {
        type: 'BlocksPlaced',
        data: { cx: 0, cz: 0, blocks: [{ x: 0, y: 0, z: 0, model: 'dirt' }] },
      },
      { type: 'ChunkCleared', data: { cx: 0, cz: 0 } },
    )

    expect(state.blocks).toEqual({})
  })
})

describe('chunkStreamId', () => {
  test('is stable for a chunk', () => {
    expect(chunkStreamId(TENANT, 3, -4)).toBe(chunkStreamId(TENANT, 3, -4))
  })

  test('differs per chunk', () => {
    expect(chunkStreamId(TENANT, 0, 0)).not.toBe(chunkStreamId(TENANT, 0, 1))
    expect(chunkStreamId(TENANT, 0, 0)).not.toBe(chunkStreamId(TENANT, 1, 0))
  })

  test('differs per tenant, so two workspaces never share a chunk stream', () => {
    expect(chunkStreamId(TENANT, 0, 0)).not.toBe(
      chunkStreamId('22222222-2222-4222-8222-222222222222', 0, 0),
    )
  })

  test('is a well-formed v5 UUID', () => {
    expect(chunkStreamId(TENANT, -12, 7)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })
})
