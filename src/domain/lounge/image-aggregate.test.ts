import { describe, expect, test } from 'bun:test'
import {
  decide,
  initialImageState,
  loungeImageDecider,
} from '@/domain/lounge/image-aggregate'
import type { LoungeImageEvent } from '@/domain/lounge/image-events'
import { DomainError } from '@/es/errors'
import { fold } from '@/es/types'

function given(...events: LoungeImageEvent[]) {
  return fold(loungeImageDecider, events)
}

const placed: LoungeImageEvent = {
  type: 'ImagePlaced',
  data: {
    uploadSlug: 'KKQDCZJ51j-ssxIK',
    x: 3,
    y: 1,
    z: -4,
    width: 4,
    height: 3,
    facing: 0,
  },
}

describe('placing', () => {
  test('records the upload, cell, size and facing', () => {
    expect(
      decide(initialImageState, {
        type: 'PlaceImage',
        uploadSlug: 'KKQDCZJ51j-ssxIK',
        x: 3,
        y: 1,
        z: -4,
        width: 4,
        height: 3,
        facing: 0,
      }),
    ).toEqual([placed])
  })

  test('placing the same image twice is rejected', () => {
    expect(() =>
      decide(given(placed), {
        type: 'PlaceImage',
        uploadSlug: 'other',
        x: 0,
        y: 0,
        z: 0,
        width: 2,
        height: 2,
        facing: 0,
      }),
    ).toThrow(DomainError)
  })

  test('fractional cells are refused - images sit on the block lattice', () => {
    expect(() =>
      decide(initialImageState, {
        type: 'PlaceImage',
        uploadSlug: 'a',
        x: 0.5,
        y: 0,
        z: 0,
        width: 2,
        height: 2,
        facing: 0,
      }),
    ).toThrow(/whole cells/i)
  })

  test('a size outside the limits is refused', () => {
    expect(() =>
      decide(initialImageState, {
        type: 'PlaceImage',
        uploadSlug: 'a',
        x: 0,
        y: 0,
        z: 0,
        width: 0,
        height: 2,
        facing: 0,
      }),
    ).toThrow(/cells on a side/i)
  })
})

describe('moving', () => {
  test('moving to a new cell records one event', () => {
    expect(decide(given(placed), { type: 'MoveImage', x: 5, y: 1, z: -4 })).toEqual([
      { type: 'ImageMoved', data: { x: 5, y: 1, z: -4 } },
    ])
  })

  // A drag that ends where it began fires a mouse-up like any other.
  test('dropping it back where it started records nothing', () => {
    expect(decide(given(placed), { type: 'MoveImage', x: 3, y: 1, z: -4 })).toEqual([])
  })

  test('moving an image that was never placed is rejected', () => {
    expect(() =>
      decide(initialImageState, { type: 'MoveImage', x: 1, y: 1, z: 1 }),
    ).toThrow(/not in the world/i)
  })
})

describe('rotating', () => {
  test('turning records a rotation, not a move', () => {
    expect(decide(given(placed), { type: 'RotateImage', facing: 1 })).toEqual([
      { type: 'ImageRotated', data: { facing: 1 } },
    ])
  })

  test('quarter turns wrap round rather than growing without bound', () => {
    const state = given(placed)
    // Four turns from north is north again.
    expect(decide(state, { type: 'RotateImage', facing: 4 })).toEqual([])
    expect(decide(state, { type: 'RotateImage', facing: 5 })).toEqual([
      { type: 'ImageRotated', data: { facing: 1 } },
    ])
    expect(decide(state, { type: 'RotateImage', facing: -1 })).toEqual([
      { type: 'ImageRotated', data: { facing: 3 } },
    ])
  })

  test('rotating to the current facing is a no-op', () => {
    expect(decide(given(placed), { type: 'RotateImage', facing: 0 })).toEqual([])
  })
})

describe('resizing', () => {
  test('a new size records one event', () => {
    expect(decide(given(placed), { type: 'ResizeImage', width: 6, height: 4 })).toEqual([
      { type: 'ImageResized', data: { width: 6, height: 4 } },
    ])
  })

  test('resizing to the same size is a no-op', () => {
    expect(decide(given(placed), { type: 'ResizeImage', width: 4, height: 3 })).toEqual(
      [],
    )
  })
})

describe('removing', () => {
  test('removes a placed image', () => {
    expect(decide(given(placed), { type: 'RemoveImage' })).toEqual([
      { type: 'ImageRemoved', data: {} },
    ])
  })

  test('removing twice is a no-op, not an error', () => {
    const state = given(placed, { type: 'ImageRemoved', data: {} })
    expect(decide(state, { type: 'RemoveImage' })).toEqual([])
  })

  test('a removed image cannot be moved or resized', () => {
    const state = given(placed, { type: 'ImageRemoved', data: {} })
    expect(() => decide(state, { type: 'MoveImage', x: 0, y: 0, z: 0 })).toThrow(
      /was removed/i,
    )
    expect(() => decide(state, { type: 'ResizeImage', width: 2, height: 2 })).toThrow(
      /was removed/i,
    )
  })
})

describe('replay', () => {
  test('the image is the fold of its events', () => {
    const state = given(
      placed,
      { type: 'ImageMoved', data: { x: 10, y: 2, z: 10 } },
      { type: 'ImageRotated', data: { facing: 2 } },
      { type: 'ImageResized', data: { width: 8, height: 6 } },
    )

    expect(state).toEqual({
      status: 'placed',
      uploadSlug: 'KKQDCZJ51j-ssxIK',
      x: 10,
      y: 2,
      z: 10,
      width: 8,
      height: 6,
      facing: 2,
    })
  })

  test('a move does not disturb facing, and a rotation does not disturb position', () => {
    const state = given(
      placed,
      { type: 'ImageRotated', data: { facing: 3 } },
      { type: 'ImageMoved', data: { x: 0, y: 0, z: 0 } },
    )

    expect(state.facing).toBe(3)
    expect({ x: state.x, y: state.y, z: state.z }).toEqual({ x: 0, y: 0, z: 0 })
  })
})
