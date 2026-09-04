import { describe, expect, test } from 'bun:test'
import { SKETCH_SDK } from './sdk'

/**
 * As close to a shared type as a string can get: every message type
 * `./protocol.ts` names must appear in the SDK's source, or the two sides of
 * the membrane have drifted.
 *
 * Moved from `src/app/xp/_sketch/sketch.test.ts` alongside `./sdk.ts` - see
 * that file's header for why the module lives in the package now.
 */

describe('the SDK speaks the whole protocol', () => {
  test.each([
    ['roster'],
    ['key'],
    ['control'],
    ['peer'],
    ['peer-state'],
    ['flow'],
    ['ready'],
    ['send'],
    ['state'],
    ['emit'],
    ['log'],
    ['trouble'],
    ['stick'],
  ])('mentions %s', (type) => {
    expect(SKETCH_SDK).toContain(`'${type}'`)
  })
})
