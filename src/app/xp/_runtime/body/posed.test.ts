import { describe, expect, test } from 'bun:test'
import { instancedCounts, posedBodies } from '@/app/xp/_runtime/body/posed'
import { spawnEntities } from '@kxb/xp/engine'
import { parseXp, XP_FORMAT, type Blueprint, type XpDocument } from '@kxb/xp'

/**
 * Which entities are drawn with bones, and which keep a buffer slot.
 *
 * Where a body ends up on screen needs a browser and this machine has none that
 * draws a frame. *Which list it is in* is arithmetic, and it is the half that
 * was wrong: two loops asked the same question and disagreed, so a character
 * past the cap was counted by neither and drawn by nothing.
 */

const BODY: Blueprint = {
  model: 'dummy/Dummy',
  collider: 'none',
  tags: [],
  props: {},
  sockets: {},
  triggers: [],
}

const CRATE: Blueprint = {
  model: 'proto/Box_A',
  collider: 'auto',
  tags: [],
  props: {},
  sockets: {},
  triggers: [],
}

function level(entities: { blueprint: string; x?: number }[], extra: Record<string, Blueprint> = {}) {
  const parsed = parseXp({
    format: XP_FORMAT,
    id: 'x',
    name: 'X',
    packs: [{ id: 'proto' }, { id: 'dummy' }],
    world: { floorY: 0, placements: [], marks: [] },
    blueprints: { body: BODY, crate: CRATE, ...extra },
    entities: entities.map((e, i) => ({ blueprint: e.blueprint, x: e.x ?? i, y: 1, z: 0 })),
  })
  if (!parsed.ok) throw new Error(parsed.problems.map((p) => `${p.at}: ${p.message}`).join('\n'))
  const document: XpDocument = parsed.document
  return { live: spawnEntities(document), blueprints: document.blueprints }
}

describe('which entities get a skeleton', () => {
  test('a rigged model does and a prop does not', () => {
    const { live, blueprints } = level([{ blueprint: 'body' }, { blueprint: 'crate' }])
    const posed = posedBodies(live, blueprints, 8)
    expect(posed).toHaveLength(1)
    expect(posed[0]!.model).toBe('dummy/Dummy')
  })

  test('the pose comes across, and absent stays absent', () => {
    const { live, blueprints } = level([{ blueprint: 'body' }, { blueprint: 'posed' }], {
      posed: { ...BODY, pose: 'Idle_B' },
    })
    const posed = posedBodies(live, blueprints, 8)
    expect(posed.map((b) => b.pose)).toEqual([undefined, 'Idle_B'])
  })

  /**
   * The bug this file was extracted for.
   *
   * `measure` skipped every rigged model when it sized the instanced groups and
   * the posed list stopped at the cap, so the ninth body was in neither. It
   * vanished - and the comment above the cap said, in as many words, that past
   * it they fall back to being drawn instanced.
   */
  test('past the cap they are counted for a buffer slot rather than dropped', () => {
    const many = Array.from({ length: 11 }, () => ({ blueprint: 'body' }))
    const { live, blueprints } = level(many)

    const posed = posedBodies(live, blueprints, 8)
    expect(posed).toHaveLength(8)

    const counts = instancedCounts(live, blueprints, posed)
    // Eleven bodies, eight with bones, three still needing somewhere to be
    // drawn. Nought would be the bug.
    expect(counts.get('dummy/Dummy')).toBe(3)
  })

  test('and every body is accounted for exactly once', () => {
    // The property the two loops broke: drawn with bones, or counted for a
    // slot, and never neither.
    const many = Array.from({ length: 11 }, () => ({ blueprint: 'body' }))
    const { live, blueprints } = level(many)
    const posed = posedBodies(live, blueprints, 8)
    const counts = instancedCounts(live, blueprints, posed)
    expect(posed.length + (counts.get('dummy/Dummy') ?? 0)).toBe(11)
  })

  test('a posed body keeps its parts instanced', () => {
    // A rigged blueprint can carry props - a hat, a pack - and those have no
    // bones. Skipping the whole blueprint would take them with it.
    const { live, blueprints } = level([{ blueprint: 'hatted' }], {
      hatted: { ...BODY, parts: [{ model: 'proto/Box_A', x: 0, y: 2, z: 0, rotation: 0, scale: 1 }] },
    })
    const posed = posedBodies(live, blueprints, 8)
    expect(posed).toHaveLength(1)

    const counts = instancedCounts(live, blueprints, posed)
    expect(counts.get('dummy/Dummy')).toBeUndefined()
    expect(counts.get('proto/Box_A')).toBe(1)
  })

  test('the choice is stable rather than however a set happened to iterate', () => {
    // Which eight of nine get a skeleton must not be decided by spawn order in
    // a way nobody can reproduce - and it would change under a respawn.
    const many = Array.from({ length: 9 }, () => ({ blueprint: 'body' }))
    const { live, blueprints } = level(many)
    const first = posedBodies(live, blueprints, 8).map((b) => b.id)
    const again = posedBodies(live, blueprints, 8).map((b) => b.id)
    expect(again).toEqual(first)
    expect([...first]).toEqual([...first].sort((a, b) => a - b))
  })

  test('a cap of nought poses nobody and counts everybody', () => {
    const { live, blueprints } = level([{ blueprint: 'body' }, { blueprint: 'body' }])
    const posed = posedBodies(live, blueprints, 0)
    expect(posed).toEqual([])
    expect(instancedCounts(live, blueprints, posed).get('dummy/Dummy')).toBe(2)
  })
})
