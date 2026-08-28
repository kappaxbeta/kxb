import { describe, expect, test } from 'bun:test'
import { applyFlowStarter, canUndo, editing, startFlow, undo } from './edit'
import { flowProblems } from './flow'
import { FLOW_STARTERS, flowStarterById } from './flow-starters'
import { parseXp, XP_FORMAT, type XpDocument } from './format'

function doc(overrides: Record<string, unknown> = {}): XpDocument {
  const parsed = parseXp({
    format: XP_FORMAT,
    id: 'x',
    name: 'X',
    packs: [{ id: 'proto' }],
    world: { floorY: 0, placements: [], marks: [] },
    spawn: { x: 2, y: 1, z: -4, facing: 0 },
    ...overrides,
  })
  if (!parsed.ok) throw new Error(parsed.problems.map((p) => `${p.at}: ${p.message}`).join('\n'))
  return parsed.document
}

const withFlow = () => FLOW_STARTERS.filter((starter) => starter.flow)

describe('every starter holds on its own', () => {
  test.each(withFlow().map((starter) => [starter.id, starter] as const))(
    '%s has no flow problems',
    (_id, starter) => {
      expect(flowProblems(starter.flow!)).toEqual([])
    },
  )

  test.each(FLOW_STARTERS.map((starter) => [starter.id] as const))(
    '%s applied to a bare level is a document that parses',
    (id) => {
      const next = applyFlowStarter(editing(doc()), id)
      expect(next).not.toBeNull()
      const parsed = parseXp(JSON.parse(JSON.stringify(next!.document)))
      if (!parsed.ok) {
        throw new Error(parsed.problems.map((p) => `${p.at}: ${p.message}`).join('\n'))
      }
    },
  )

  test('the card lists the phases the flow actually has, in order', () => {
    for (const starter of withFlow()) {
      expect([...starter.stages]).toEqual(Object.keys(starter.flow!.phases))
    }
  })

  test('every key a phase allows is a key the starter binds or the level already has', () => {
    for (const starter of withFlow()) {
      const bound = new Set((starter.keys ?? []).map((key) => key.does))
      for (const phase of Object.values(starter.flow!.phases)) {
        for (const name of phase.allow ?? []) expect(bound.has(name)).toBe(true)
      }
    }
  })

  test('every event an arrow waits for is one the starter itself emits', () => {
    /**
     * The warning the flow panel draws - "nothing emits this" - must not be
     * true of a starter on the frame it lands, or the shape is a machine with
     * nothing to drive it.
     */
    for (const starter of withFlow()) {
      const emitted = new Set<string>()
      for (const blueprint of Object.values(starter.blueprints ?? {})) {
        for (const trigger of blueprint.triggers) {
          for (const verb of trigger.do) if (verb.op === 'emit') emitted.add(verb.event)
        }
      }
      for (const phase of Object.values(starter.flow!.phases)) {
        for (const verb of phase.does ?? []) if (verb.op === 'emit') emitted.add(verb.event)
        for (const step of phase.next ?? []) {
          if (step.on !== undefined) expect(emitted.has(step.on)).toBe(true)
        }
      }
    }
  })
})

describe('applying one', () => {
  test('is one undo step however much it brings', () => {
    const before = editing(doc())
    const next = applyFlowStarter(before, 'board')!
    expect(Object.keys(next.document.blueprints)).toContain('die')
    expect(next.document.entities).toHaveLength(1)
    expect(next.document.data?.dice).toBeDefined()
    expect(next.document.player.keys?.map((key) => key.does)).toEqual(['use', 'roll', 'done'])
    expect(next.document.flow?.start).toBe('roll')

    expect(canUndo(next)).toBe(true)
    const back = undo(next)
    expect(back.document).toEqual(before.document)
    expect(canUndo(back)).toBe(false)
  })

  test('puts the thing it brings down beside the spawn, not at the origin', () => {
    const next = applyFlowStarter(editing(doc()), 'board')!
    const die = next.document.entities[0]!
    expect(die.x).toBe(2)
    expect(die.z).toBe(-1)
  })

  test('keeps a field the author already declared', () => {
    const held = editing(doc({ data: { round: { scope: 'space', value: 7 } } }))
    const next = applyFlowStarter(held, 'rounds')!
    expect(next.document.data?.round).toEqual({ scope: 'space', value: 7 })
  })

  test('keeps a key the author already bound to the same action', () => {
    const held = editing(doc({ player: { keys: [{ key: 'KeyQ', does: 'use' }] } }))
    const next = applyFlowStarter(held, 'board')!
    expect(next.document.player.keys).toEqual([
      { key: 'KeyQ', does: 'use' },
      { key: 'KeyR', does: 'roll' },
      { key: 'KeyF', does: 'done' },
    ])
  })

  test('does not bind a letter some other action already has', () => {
    const held = editing(doc({ player: { keys: [{ key: 'KeyR', does: 'jump-high' }] } }))
    const next = applyFlowStarter(held, 'board')!
    // `roll` is left unbound rather than doubling up on R; the panel's
    // "nothing presses this" is the honest state.
    expect(next.document.player.keys?.filter((key) => key.key === 'KeyR')).toHaveLength(1)
  })

  test('replaces a flow the level already had', () => {
    const had = startFlow(editing(doc()), 'deal')!
    const next = applyFlowStarter(had, 'match')!
    expect(Object.keys(next.document.flow!.phases)).toEqual(['kickoff', 'play', 'over'])
  })

  test('live takes the flow away, and is nothing on a level without one', () => {
    const bare = editing(doc())
    expect(applyFlowStarter(bare, 'live')).toBe(bare)
    const had = applyFlowStarter(bare, 'countdown')!
    expect(applyFlowStarter(had, 'live')!.document.flow).toBeUndefined()
  })

  test('an id nobody has is refused', () => {
    expect(flowStarterById('nope')).toBeUndefined()
    // @ts-expect-error - the point is the runtime answer to a bad string
    expect(applyFlowStarter(editing(doc()), 'nope')).toBeNull()
  })
})
