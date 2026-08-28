import { describe, expect, test } from 'bun:test'
import { battleModeFor } from '@/domain/xps/battle-mode'
import { setRules, editing } from '@kxb/xp/edit'
import { templateById, type Mark, type XpDocument } from '@kxb/xp'

/**
 * What shape a match on a level comes out as.
 *
 * The join between two vocabularies that were written years apart, which is
 * exactly the kind of seam that is worth pinning: `BattleMode` decides whether
 * the lobby offers *Join red* and *Join blue* or a single *Join*, and until
 * this function existed the answer was `ffa` for every level ever built.
 *
 * Built from the shipped templates rather than a hand-made document, so a
 * template that stops having two team spawns fails here rather than silently
 * changing what a match on it is.
 */

function built(id: string): XpDocument {
  const template = templateById(id)
  if (!template) throw new Error(`no template ${id}`)
  return template.build(id, id)
}

/** The same document with a `sides` written on it, through the editor's own path. */
function declaring(document: XpDocument, sides: 'ffa' | 'team' | 'one-vs-all'): XpDocument {
  const next = setRules(editing(document), { sides })
  if (!next) throw new Error(`setRules refused ${sides}`)
  return next.document
}

describe('the shape a match on a level takes', () => {
  test('a level with two team spawns is a team match, without having to say so', () => {
    /**
     * The compatibility half, and the one that matters most: `match` has had
     * red and blue spawns since it shipped, and nothing in it says `sides`. It
     * has to come out as teams anyway, or the field would only work for levels
     * built after it existed.
     */
    expect(battleModeFor(built('match'))).toBe('team')
    expect(battleModeFor(built('capture'))).toBe('team')
  })

  test('a level with no sides in it is all against all', () => {
    expect(battleModeFor(built('room'))).toBe('ffa')
  })

  test('a course is still all against all, because the preset is not this question', () => {
    /*
     * `race` is `parkour` with a start and a finish and no team spawns. It is
     * deliberately not mapped onto the battle's own `race` mode: that mode
     * carries a clock and a finish line the *battle* reads, and an XP reports
     * no result back out yet - see the note in battle-mode.ts.
     */
    expect(battleModeFor(built('race'))).toBe('ffa')
  })

  test('and what the document declares beats what its marks imply', () => {
    const match = built('match')
    expect(battleModeFor(declaring(match, 'ffa'))).toBe('ffa')
    expect(battleModeFor(declaring(match, 'one-vs-all'))).toBe('one_vs_all')
    expect(battleModeFor(declaring(match, 'team'))).toBe('team')
  })

  test('one against everyone is only ever declared, never derived', () => {
    // There is nothing in a world that means it, which is the whole reason the
    // field exists rather than being another thing read off the marks.
    for (const id of ['room', 'race', 'match', 'capture']) {
      expect(battleModeFor(built(id))).not.toBe('one_vs_all')
    }
  })
})

describe('a level with more sides than a battle has', () => {
  /**
   * A battle's `team` mode *is* red and blue - `TEAMS` is those two words, and
   * they are event values, so a third is a schema change rather than a label.
   * A board game has four spawn marks, and this mode produced a lobby offering
   * two of its four colours, handing one to the runtime as an override, and
   * leaving the other two unreachable no matter who joined.
   */
  const board = (colours: readonly string[]): XpDocument => {
    const base = built('match')
    return {
      ...base,
      world: {
        ...base.world,
        marks: colours.map(
          (team, at): Mark => ({
            kind: 'spawn',
            team,
            x: at * 2,
            y: base.spawn.y,
            z: 0,
            facing: 0,
            width: 1,
            height: 1,
          }),
        ),
      },
    }
  }

  test('two is a team battle, which is what the mode is for', () => {
    expect(battleModeFor(board(['red', 'blue']))).toBe('team')
  })

  test('and four is not, because the battle has nowhere to put the other two', () => {
    expect(battleModeFor(board(['blue', 'red', 'green', 'yellow']))).toBe('ffa')
  })

  test('so the level seats them instead, which is what it was already doing', () => {
    // `ffa` means the lobby hands no side down, and `sideOf` falls through to
    // the document's own `assign`.
    expect(battleModeFor(board(['a', 'b', 'c']))).toBe('ffa')
  })
})
