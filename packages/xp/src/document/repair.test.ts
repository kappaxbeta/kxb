import { describe, expect, test } from 'bun:test'
import { parseXp, XP_FORMAT } from './format'
import { repairXp } from './repair'

/**
 * The pass that opens yesterday's file.
 *
 * Half of these are about *not* repairing, which is the load-bearing half: a
 * repair pass that touches a document the parser was happy with is a pass that
 * rewrites everybody's work every time it runs, and a repair that fires on a
 * level with no secrets in it is a requirement invented rather than read out.
 */

function doc(overrides: Record<string, unknown> = {}) {
  return {
    format: XP_FORMAT,
    id: 'x',
    name: 'X',
    packs: [{ id: 'proto' }],
    capabilities: [],
    spawn: { x: 0, y: 1, z: 2, facing: 180 },
    blueprints: {},
    entities: [],
    world: { floorY: 0, ground: true, placements: [], marks: [] },
    ...overrides,
  }
}

const backendOf = (raw: unknown) => (raw as { backend?: Record<string, unknown> }).backend

/** A level that deals roles: the exact shape `proto-bug` was saved in. */
const hidden = (backend?: Record<string, unknown>) =>
  doc({
    // One role per seat, because `rules` refuses a table with a chair it cannot
    // deal to — and a fixture that trips a *second* rule proves nothing about
    // the one under test.
    rules: { preset: 'shooter', roles: ['bug', 'crew', 'crew'], lethal: 'bug', players: { min: 3, max: 3 } },
    ...(backend ? { backend } : {}),
  })

describe('repairXp', () => {
  test('moves a wanted arbiter into needs for a level that deals roles', () => {
    const { document, repairs } = repairXp(
      hidden({ needs: ['identity', 'network'], wants: ['persistence', 'arbiter'] }),
    )

    expect(backendOf(document)).toEqual({
      needs: ['identity', 'network', 'arbiter'],
      wants: ['persistence'],
    })
    expect(repairs).toHaveLength(1)
    expect(repairs[0]).toContain('deals roles')
    expect(repairs[0]).toContain('moved')
  })

  test('the repaired document is one the parser accepts', () => {
    const saved = hidden({ needs: ['identity', 'network'], wants: ['persistence', 'arbiter'] })

    expect(parseXp(saved).ok).toBe(false)
    expect(parseXp(repairXp(saved).document).ok).toBe(true)
  })

  test('drops wants entirely when the arbiter was all that was in it', () => {
    const { document } = repairXp(hidden({ needs: ['identity'], wants: ['arbiter'] }))

    expect(backendOf(document)).toEqual({ needs: ['identity', 'arbiter'] })
    expect(backendOf(document)).not.toHaveProperty('wants')
  })

  test('adds the arbiter to a document that never named one', () => {
    const { document, repairs } = repairXp(hidden())

    expect(backendOf(document)).toEqual({ needs: ['arbiter'] })
    expect(repairs[0]).toContain('added')
  })

  test('a vote is enough on its own, and names itself', () => {
    const { document, repairs } = repairXp(
      doc({
        blueprints: {
          alarm: {
            parts: [{ model: 'box' }],
            triggers: [{ on: 'pressed', key: 'use', within: 3, do: [{ op: 'meet', seconds: 60 }] }],
          },
        },
      }),
    )

    expect(backendOf(document)).toEqual({ needs: ['arbiter'] })
    expect(repairs[0]).toContain('calls a vote')
  })

  test('leaves a level with no secrets in it alone', () => {
    const golf = doc({ rules: { preset: 'golf' }, backend: { needs: ['identity'], wants: ['arbiter'] } })

    expect(repairXp(golf)).toEqual({ document: golf, repairs: [] })
  })

  test('leaves a document that already says needs alone', () => {
    const correct = hidden({ needs: ['arbiter'] })

    expect(repairXp(correct)).toEqual({ document: correct, repairs: [] })
  })

  /**
   * The inputs this is actually handed. `readXpVersion` passes a `jsonb` column
   * straight in, so "a document" here means anything that survived JSON - and
   * every one of these has to come out the far side as the problem it is,
   * reported by `parseXp`, rather than as a stack trace from a repair pass.
   */
  test.each([
    ['null', null],
    ['a number', 7],
    ['a string', 'not a document'],
    ['an array', [1, 2]],
    ['blueprints that are not objects', doc({ blueprints: { a: 'nope' }, rules: { preset: 'shooter', roles: ['a'] } })],
    ['triggers that are not an array', doc({ blueprints: { a: { triggers: 'nope' } } })],
    ['a backend that is not an object', hidden()],
  ])('passes %s through without throwing', (_label, raw) => {
    expect(() => repairXp(raw)).not.toThrow()
  })

  test('a junk backend is replaced rather than reached into', () => {
    const { document } = repairXp({ ...hidden(), backend: 'nope' })

    expect(backendOf(document)).toEqual({ needs: ['arbiter'] })
  })
})
