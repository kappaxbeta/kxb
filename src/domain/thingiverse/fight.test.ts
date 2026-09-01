import { describe, expect, test } from 'bun:test'

import { blueprintProblems, freshSpec } from '@/domain/thingiverse/blueprint'
import {
  bumpDamage,
  BUMP_SPEED,
  fightProblems,
  freshHealth,
  freshShot,
  freshWeapon,
  MAX_THING_HEALTH,
  shoots,
  showsBar,
  type FightSpec,
} from '@/domain/thingiverse/fight'

const model = 'bedroom/soccer_ball'

describe('what a thing can take', () => {
  test('a fresh crate has a bar and three ways to break it', () => {
    const health = freshHealth()
    expect(health.max).toBe(100)
    expect(health.hurtBy).toEqual(['dash', 'kick', 'shot'])
    expect(fightProblems({ health })).toEqual([])
  })

  test('the bar appears once it has been hurt, and not before', () => {
    const health = freshHealth()
    expect(showsBar(health, 100)).toBe(false)
    expect(showsBar(health, 99)).toBe(true)
    // A punchbag says no and means it.
    expect(showsBar({ ...health, bar: false }, 1)).toBe(false)
    // And scenery has no bar to draw.
    expect(showsBar(undefined, 0)).toBe(false)
  })

  test('a thing nothing hurts is legal, and is how a signal-only door works', () => {
    expect(fightProblems({ health: { max: 50, hurtBy: [] } })).toEqual([])
  })

  test('health outside the bounds is refused', () => {
    expect(fightProblems({ health: { max: 0, hurtBy: [] } }).length).toBe(1)
    expect(fightProblems({ health: { max: MAX_THING_HEALTH + 1, hurtBy: [] } }).length).toBe(1)
  })
})

describe('a bump is priced by how fast you were going', () => {
  test('a lean against a crate costs nothing', () => {
    // Without a floor, a body resting on a crate damages it forever at a
    // millimetre a second.
    expect(bumpDamage(0)).toBe(0)
    expect(bumpDamage(BUMP_SPEED - 0.01)).toBe(0)
  })

  test('and a run into one costs more the faster it was', () => {
    expect(bumpDamage(BUMP_SPEED)).toBe(8)
    expect(bumpDamage(BUMP_SPEED * 2)).toBe(16)
  })
})

describe('what a thing can dish out', () => {
  test('a swing needs no bullet', () => {
    const fight: FightSpec = { weapon: freshWeapon() }
    expect(shoots(fight)).toBe(false)
    expect(fightProblems(fight, ['attack'])).toEqual([])
  })

  test('but something that shoots needs to be told what it fires', () => {
    const fight: FightSpec = { weapon: freshWeapon() }
    // A turret with no bullet is a turret that appears jammed - which is the
    // failure this whole file exists to make loud instead.
    expect(fightProblems(fight, ['shoot'])).toContain(
      'something that shoots needs to be told what it fires',
    )

    const armed: FightSpec = { weapon: { ...freshWeapon(), shot: freshShot(model) } }
    expect(fightProblems(armed, ['shoot'])).toEqual([])
    expect(shoots(armed)).toBe(true)
  })

  test('a bullet has to be a model we ship', () => {
    const fight: FightSpec = {
      weapon: { ...freshWeapon(), shot: { ...freshShot(model), model: 'nope/nothing' } },
    }
    expect(fightProblems(fight)).toContain('nope/nothing is not a model we ship')
  })

  test('and it aims at something', () => {
    const fight = {
      weapon: { ...freshWeapon(), at: 'everyone' as unknown as 'all' },
    }
    expect(fightProblems(fight)).toContain('everyone is not something a thing can aim at')
  })
})

describe('the blueprint checks the two of them together', () => {
  test('a thing that attacks with no weapon is refused', () => {
    const spec = {
      ...freshSpec(model),
      actions: [{ when: 'touch', deed: 'attack' } as const],
    }
    expect(blueprintProblems(spec)).toContain(
      'something that fights needs to be told how hard it hits',
    )
  })

  test('and a turret that is fully described is not', () => {
    const spec = {
      ...freshSpec(model),
      actions: [{ when: 'near', deed: 'shoot' } as const],
      fight: { weapon: { ...freshWeapon(), shot: freshShot(model) } },
    }
    expect(blueprintProblems(spec)).toEqual([])
  })

  test('a `become` has to name a state that exists', () => {
    const spec = {
      ...freshSpec(model),
      actions: [{ when: 'touch', deed: 'become', value: 'smashed' } as const],
    }
    expect(blueprintProblems(spec)).toContain('smashed is not one of the states')

    const withState = {
      ...spec,
      states: {
        start: 'whole',
        states: [
          { name: 'whole', changes: [] },
          { name: 'smashed', changes: [] },
        ],
      },
    }
    expect(blueprintProblems(withState)).toEqual([])
  })

  test('and an `emit` has to name the word it shouts', () => {
    const spec = {
      ...freshSpec(model),
      actions: [{ when: 'use', deed: 'emit' } as const],
    }
    expect(blueprintProblems(spec)).toContain('emit needs to be told what to emit')
  })
})
