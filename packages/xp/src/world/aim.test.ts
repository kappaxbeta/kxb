import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { aimOf, pressOn } from './aim'
import { defaultsOf } from '../document/data'
import { bodiesFor, PLAYER_ID, spawnEntities, spawnPlayer } from './entities'
import { describeProblems, parseXp, type XpDocument } from '../document/format'
import { fire } from '../rules/triggers'

/**
 * What a press would do, checked against what a press does.
 *
 * The whole value of a preview is that it agrees with the thing it previews, so
 * every case here asserts the pair: `aimOf` says a piece would go to a field,
 * and `fire` - the real dispatch, on the real document - moves it to that same
 * field. A test that only checked the arithmetic would pass forever while the
 * highlight pointed at a piece the press does not touch.
 */
const XPS = path.join(import.meta.dir, '..', '..', '..', '..', 'public', 'xp', 'xps')

const mensch = (): XpDocument => {
  const parsed = parseXp(JSON.parse(readFileSync(path.join(XPS, 'mensch.xp.json'), 'utf8')))
  if (!parsed.ok) throw new Error(describeProblems(parsed.problems))
  return parsed.document
}

/**
 * Where a seated player actually arrives, which is their own colour's mark.
 *
 * Not `xp.spawn`: that is the fallback for somebody with no side, and under
 * `assign: 'claim'` it is the middle of the board - the same distance from all
 * four corners, so choosing a colour is a walk in the direction you want. A test
 * spawning there is a test standing nowhere near a piece.
 */
const at = (xp: XpDocument, team: string) => {
  const mark = xp.world.marks.find((one) => one.kind === 'spawn' && one.team === team)
  if (!mark) throw new Error(`no spawn for ${team}`)
  return { x: mark.x, y: mark.y, z: mark.z, facing: mark.facing }
}

const table = (xp: XpDocument, roll: number) => {
  const world = spawnEntities(xp)
  // Blue's seat, because the pieces are gated on it - see `Trigger.by`.
  spawnPlayer(world, xp, at(xp, 'blue'), { team: 'blue' })
  const data = defaultsOf(xp.data ?? {})
  data.set('dice', roll)
  return { world, blueprints: bodiesFor(xp), data, marks: xp.world.marks }
}

describe('what a press would do', () => {
  test('the ring on a piece aims at that piece', () => {
    const xp = mensch()
    const { world, blueprints, data, marks } = table(xp, 6)
    const aim = aimOf(world, blueprints, 'use', PLAYER_ID, marks, data)

    // The spawn is on `blue-piece-1`, which is the whole reason it moved there.
    expect(aim).not.toBeNull()
    expect(world.blueprint.get(aim!.id)).toBe('blue-piece')
  })

  test('and it is the piece the press then picks up', () => {
    // The pair this file exists to keep: a highlight on a thing the press does
    // not touch is a lie the player trusts twice and then stops trusting.
    const xp = mensch()
    const { world, blueprints, data, marks } = table(xp, 6)
    const aim = aimOf(world, blueprints, 'use', PLAYER_ID, marks, data)

    /**
     * Through `pressOn` rather than `fire`, and that is the fix rather than the
     * test being lenient. `fire` is per-entity and knows nothing about the
     * others, so a press with a reach fires on *everything* in reach - and
     * standing in a yard, four pieces each ran the same correct rule while the
     * highlight lit the nearest. Two answers to "what am I about to touch".
     */
    pressOn(world, blueprints, 'use', PLAYER_ID, { data }, marks)
    const held = [...world.alive].filter((id) => world.parent.get(id)?.id === PLAYER_ID)
    expect(held).toEqual([aim!.id])
  })

  test('and there is no destination to draw, because nothing computes the move', () => {
    /**
     * `to` is `advance`'s answer, and this document no longer has one: a piece
     * goes where you carry it. The field stays because the verb does - a level
     * that moves a piece for you still wants its preview - but on this board the
     * honest answer is that the destination is wherever you decide to put it.
     */
    const xp = mensch()
    for (const roll of [0, 3, 6]) {
      const { world, blueprints, data, marks } = table(xp, roll)
      expect(aimOf(world, blueprints, 'use', PLAYER_ID, marks, data)?.to).toBeNull()
    }
  })

  test('and somebody else\'s piece is aimed at too, because you may pick it up', () => {
    // Which is the knockout: you carry their piece back to their yard yourself.
    const xp = mensch()
    const world = spawnEntities(xp)
    spawnPlayer(world, xp, at(xp, 'red'), { team: 'red' })
    const data = defaultsOf(xp.data ?? {})
    data.set('dice', 6)
    expect(aimOf(world, bodiesFor(xp), 'use', PLAYER_ID, xp.world.marks, data)).not.toBeNull()
  })

  test('the die is not aimed at, from your own chair or anywhere else', () => {
    /**
     * This has now asserted three different things, and the third is the first
     * one again. Worth the paragraph, because the middle one was a bug.
     *
     * One die in the middle of the board reached from anywhere: no *thing you
     * are pointing at*, so no highlight. Then four dice, one per chair, with
     * `within: 3` - which lit yours up when you were sitting at it, and cost the
     * game its second round: a turn is carrying a piece across the board, so
     * from the moment you stand up the reach is unsatisfied and `R` does nothing
     * at all. Silently, because a press narrowed by `aimOf` that finds nothing
     * fires no rule.
     *
     * So the reach is gone and `by: 'team:<colour>'` is the whole gate, which is
     * what it always was. The cost is exactly this: a rule with no `within` is
     * not aimed at anything, so the die does not light up. The alternative was a
     * reach wide enough to always hold, which lights a die from twelve metres
     * away whenever your hand is empty - the whole level glowing rather than
     * information.
     */
    const xp = mensch()
    const { world, blueprints, data, marks } = table(xp, 6)
    expect(aimOf(world, blueprints, 'roll', PLAYER_ID, marks, data)).toBeNull()
  })

  test('but a press still reaches your own die and only yours', () => {
    // Which is the half that matters: the highlight is a nicety, throwing is the
    // game. `by` is asked before anything about distance, and there is nothing
    // about distance left to ask.
    const xp = mensch()
    for (const [seat, die] of [
      ['blue', 'blue-dice'],
      ['red', 'red-dice'],
    ] as const) {
      const world = spawnEntities(xp)
      spawnPlayer(world, xp, at(xp, seat), { team: seat })
      const data = defaultsOf(xp.data ?? {})
      const blueprints = bodiesFor(xp)
      // Standing nowhere near any of them, which is where a turn leaves you.
      world.position.set(PLAYER_ID, { x: 0, y: 1, z: 0 })
      world.box.delete(PLAYER_ID)

      const threw = [...world.alive].filter(
        (id) =>
          fire(world, blueprints, id, 'pressed', PLAYER_ID, {
            key: 'roll',
            data,
            marks: xp.world.marks,
          }).length > 0,
      )
      expect(threw.map((id) => world.blueprint.get(id))).toEqual([die])
    }
  })

  test('nothing in reach is nothing aimed at', () => {
    const xp = mensch()
    const { world, blueprints, data, marks } = table(xp, 6)
    // The middle of the board: the die is there and reaches everything, and no
    // piece is within `1.4` of it.
    world.position.set(PLAYER_ID, { x: 0, y: 1, z: 0 })
    expect(aimOf(world, blueprints, 'use', PLAYER_ID, marks, data)).toBeNull()
  })
})
