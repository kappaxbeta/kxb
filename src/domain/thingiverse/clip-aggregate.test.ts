import { describe, expect, test } from 'bun:test'
import type { BakedClip } from '@/domain/animator/clip'
import {
  clipDecider,
  decide,
  initialClipState,
} from '@/domain/thingiverse/clip-aggregate'
import { type ClipEvent, MAX_CLIP_SAMPLES } from '@/domain/thingiverse/clip-events'
import type { Asker } from '@/domain/thingiverse/commands'
import { DomainError } from '@/es/errors'
import { fold } from '@/es/types'

const ada = 'a0000000-0000-4000-8000-000000000001'
const sam = 'a0000000-0000-4000-8000-000000000002'

const owner: Asker = { actorId: ada, admin: false }
const stranger: Asker = { actorId: sam, admin: false }

/** Two frames of one bone, which is the smallest thing that plays. */
const wave: BakedClip = {
  name: 'wave',
  duration: 1,
  times: [0, 1],
  bones: { 'arm.r': [0, 0, 0, 1, 0, 0, 0.7, 0.7] },
  root: [0, 0, 0, 0, 0, 0],
}

const made: ClipEvent = {
  type: 'ClipDrawn',
  data: {
    name: 'Wave',
    skeleton: 'dummy',
    clip: wave,
    doc: { keys: [] },
    ownerId: ada,
    visibility: 'private',
  },
}

function given(...events: ClipEvent[]) {
  return fold(clipDecider, events)
}

const draw = {
  type: 'DrawClip' as const,
  by: owner,
  name: 'Wave',
  skeleton: 'dummy',
  clip: wave,
  doc: { keys: [] },
  visibility: 'private' as const,
}

describe('saving one', () => {
  test('records the name, the rig, the samples and the document', () => {
    expect(decide(initialClipState, draw)).toEqual([made])
  })

  test('a clip with no frames is refused', () => {
    expect(() =>
      decide(initialClipState, {
        ...draw,
        clip: { ...wave, times: [], bones: {}, root: [] },
      }),
    ).toThrow(DomainError)
  })

  test('a bone track of the wrong length is refused', () => {
    // One number short binds happily and then plays garbage from the first
    // frame that reads past its end, which is why this is checked at all.
    expect(() =>
      decide(initialClipState, {
        ...draw,
        clip: { ...wave, bones: { 'arm.r': [0, 0, 0, 1, 0, 0, 0.7] } },
      }),
    ).toThrow(DomainError)
  })

  test('a root track of the wrong length is refused', () => {
    expect(() =>
      decide(initialClipState, { ...draw, clip: { ...wave, root: [0, 0, 0] } }),
    ).toThrow(DomainError)
  })

  test('a clip with no length is refused, because a mixer divides by it', () => {
    expect(() =>
      decide(initialClipState, { ...draw, clip: { ...wave, duration: 0 } }),
    ).toThrow(DomainError)
  })

  test('longer than a minute is refused', () => {
    const frames = MAX_CLIP_SAMPLES + 1
    expect(() =>
      decide(initialClipState, {
        ...draw,
        clip: {
          ...wave,
          times: Array.from({ length: frames }, (_, at) => at),
          bones: {},
          root: Array.from({ length: frames * 3 }, () => 0),
        },
      }),
    ).toThrow(DomainError)
  })
})

describe('changing one', () => {
  test('re-keying always records, even when nothing measurable changed', () => {
    // Moving a hand without adding a key changes every quaternion and neither
    // the frame count nor the duration - so a no-op check on those numbers
    // would silently refuse to save the commonest edit there is.
    expect(
      decide(given(made), { type: 'ReshapeClip', by: owner, clip: wave, doc: {} }),
    ).toHaveLength(1)
  })

  test('somebody else cannot re-key it', () => {
    expect(() =>
      decide(given(made), { type: 'ReshapeClip', by: stranger, clip: wave, doc: {} }),
    ).toThrow(DomainError)
  })

  test('renaming it to what it is called records nothing', () => {
    expect(decide(given(made), { type: 'RenameClip', by: owner, name: 'Wave' })).toEqual([])
  })
})

describe('retiring one', () => {
  test('is soft and one way, and leaves what named it alone', () => {
    const retired = given(made, { type: 'ClipRetired', data: {} })

    expect(retired.status).toBe('retired')
    expect(decide(retired, { type: 'RetireClip', by: owner })).toEqual([])
    expect(() =>
      decide(retired, { type: 'RenameClip', by: owner, name: 'Back' }),
    ).toThrow(DomainError)
  })
})
