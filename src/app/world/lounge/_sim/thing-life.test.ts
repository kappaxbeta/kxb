import { describe, expect, test } from 'bun:test'

import { freshRespawn } from '@/domain/thingiverse/states'
import { freshBurger } from '@/domain/thingiverse/craft'
import { freshHealth, freshShot, freshWeapon } from '@/domain/thingiverse/fight'
import type { Claim } from '@/domain/thingiverse/live'
import {
  barOver,
  born,
  stateOf,
  stepRoom,
  type Alive,
  type Body,
  type Life,
  type Signal,
} from '@/app/world/lounge/_sim/thing-life'

const here = { x: 0, y: 0, z: 0 }
const far = { x: 40, y: 0, z: 0 }

/** Run one frame over one thing, keeping the map between calls. */
function room(things: Alive[], lives = new Map<string, Life>()) {
  return {
    lives,
    frame(dt: number, claims: Claim[] = [], bodies: Body[] = [], said: Signal[] = []) {
      return stepRoom(things, lives, bodies, claims, dt, said)
    },
  }
}

describe('a crate you can break', () => {
  const crate: Alive = {
    id: 'crate',
    at: here,
    fight: { health: freshHealth() },
    states: freshRespawn(8),
  }

  test('starts whole with a full bar', () => {
    const life = born(crate)
    expect(life.health).toBe(100)
    expect(life.standing?.state).toBe('whole')
    // No bar over an undamaged crate: a room of full bars is a HUD about nothing.
    expect(barOver(crate, life)).toBeNull()
  })

  test('takes a hit, shows a bar, and breaks at zero', () => {
    const world = room([crate])
    world.frame(0.016, [{ i: 'crate', hit: 30 }])
    expect(world.lives.get('crate')?.health).toBe(70)
    expect(barOver(crate, world.lives.get('crate'))).toEqual({ kind: 'health', at: 0.7 })

    const broke = world.frame(0.016, [{ i: 'crate', hit: 70 }])
    expect(broke.broke.map((one) => one.id)).toEqual(['crate'])
    expect(world.lives.get('crate')?.standing?.state).toBe('gone')
    expect(stateOf(crate, world.lives.get('crate'))?.hidden).toBe(true)
  })

  test('and comes back, whole, with a full bar', () => {
    const world = room([crate])
    world.frame(0.016, [{ i: 'crate', hit: 100 }])
    expect(world.lives.get('crate')?.health).toBe(0)

    world.frame(4)
    expect(world.lives.get('crate')?.standing?.state).toBe('gone')

    world.frame(5)
    const life = world.lives.get('crate')
    expect(life?.standing?.state).toBe('whole')
    // `restore` is what puts the bar back - the other half of coming back.
    expect(life?.health).toBe(100)
  })

  test('two people finishing it off only break it once', () => {
    const world = room([crate])
    world.frame(0.016, [{ i: 'crate', hit: 95 }])
    const broke = world.frame(0.016, [
      { i: 'crate', hit: 20 },
      { i: 'crate', hit: 20 },
    ])
    // One break. Three would shout the signal three times, and in a kitchen
    // would cook three burgers.
    expect(broke.broke.map((one) => one.id)).toEqual(['crate'])
    expect(world.frame(0.016, [{ i: 'crate', hit: 20 }]).broke).toEqual([])
  })
})

describe('a bump is priced by how fast you were going', () => {
  const barrel: Alive = {
    id: 'barrel',
    at: here,
    fight: { health: { max: 100, hurtBy: ['bump'] } },
  }

  test('leaning on it costs nothing, forever', () => {
    const world = room([barrel])
    for (let frame = 0; frame < 60; frame++) {
      world.frame(0.016, [], [{ id: 'p', at: { x: 0.5, y: 0, z: 0 }, speed: 1 }])
    }
    expect(world.lives.get('barrel')?.health).toBe(100)
  })

  test('but running into it does', () => {
    const world = room([barrel])
    world.frame(0.016, [], [{ id: 'p', at: { x: 0.5, y: 0, z: 0 }, speed: 12 }])
    expect(world.lives.get('barrel')?.health).toBeLessThan(100)
  })

  test('and a bump from across the room is not a bump', () => {
    const world = room([barrel])
    world.frame(0.016, [], [{ id: 'p', at: far, speed: 20 }])
    expect(world.lives.get('barrel')?.health).toBe(100)
  })
})

describe('a cutting board that makes a burger', () => {
  const board: Alive = {
    id: 'board',
    at: here,
    craft: {
      slots: [
        { socket: 'a', takes: [] },
        { socket: 'b', takes: [] },
        { socket: 'c', takes: [] },
      ],
      recipes: [{ needs: ['bun', 'patty', 'salad'], makes: 'burger', emit: 'made', seconds: 2 }],
    },
  }

  test('takes what you put on it, and shouts when a slot fills', () => {
    const world = room([
      {
        ...board,
        craft: {
          ...board.craft!,
          slots: [{ socket: 'a', takes: [], emit: 'clunk' }],
        },
      },
    ])
    const put = world.frame(0.016, [{ i: 'board', put: ['a', 'bun'] }])
    expect(world.lives.get('board')?.slots.get('a')).toBe('bun')
    expect(put.said.map((one) => one.word)).toContain('clunk')
  })

  test('refuses what a picky slot will not take', () => {
    const picky: Alive = {
      id: 'picky',
      at: here,
      craft: { slots: [{ socket: 'a', takes: ['salad'] }], recipes: [] },
    }
    const world = room([picky])
    world.frame(0.016, [{ i: 'picky', put: ['a', 'anvil'] }])
    // The item never leaves the hand, which is the only feedback that needs no HUD.
    expect(world.lives.get('picky')?.slots.size).toBe(0)
  })

  test('and will not stack two things in one place', () => {
    const world = room([board])
    world.frame(0.016, [{ i: 'board', put: ['a', 'bun'] }])
    world.frame(0.016, [{ i: 'board', put: ['a', 'patty'] }])
    expect(world.lives.get('board')?.slots.get('a')).toBe('bun')
  })

  test('assembles the burger once everything is on it, and eats the ingredients', () => {
    const world = room([board])
    world.frame(0.016, [
      { i: 'board', put: ['a', 'bun'] },
      { i: 'board', put: ['b', 'patty'] },
      { i: 'board', put: ['c', 'salad'] },
    ])
    // Two seconds on the board.
    expect(world.frame(1).made).toEqual([])

    const done = world.frame(1.1)
    expect(done.made).toEqual([{ id: 'board', socket: 'a', item: 'burger' }])
    expect(done.said.map((one) => one.word)).toContain('made')
    // The output replaces the inputs.
    expect(world.lives.get('board')?.slots.size).toBe(0)
  })

  test('and stops chopping if you take an ingredient back', () => {
    const world = room([board])
    world.frame(0.016, [
      { i: 'board', put: ['a', 'bun'] },
      { i: 'board', put: ['b', 'patty'] },
      { i: 'board', put: ['c', 'salad'] },
    ])
    world.frame(1)

    const taken = world.frame(0.016, [{ i: 'board', took: 'b' }])
    expect(taken.took).toEqual([{ id: 'board', socket: 'b', item: 'patty', by: null }])
    expect(world.lives.get('board')?.cooking).toBeUndefined()

    // And putting it back starts the two seconds again, rather than finishing
    // the one that was already nearly done.
    world.frame(0.016, [{ i: 'board', put: ['b', 'patty'] }])
    expect(world.frame(1.5).made).toEqual([])
    expect(world.frame(1).made.length).toBe(1)
  })

  test('two people reaching for one pan, and only one gets it', () => {
    // The rule that stops a kitchen minting ingredients: the first asker wins
    // and the rest find nothing. See `Pulse.gave`.
    const rack: Alive = {
      id: 'rack',
      at: here,
      craft: { slots: [{ socket: 'hook', takes: [], gives: 'pan' }], recipes: [] },
    }
    const world = room([rack])
    const race = world.frame(0.016, [
      { i: 'rack', took: 'hook', c: 'ann' },
      { i: 'rack', took: 'hook', c: 'bo' },
    ])
    expect(race.took).toEqual([{ id: 'rack', socket: 'hook', item: 'pan', by: 'ann' }])
  })

  test('a rack arrives with its pan already on it', () => {
    const rack: Alive = {
      id: 'rack',
      at: here,
      craft: { slots: [{ socket: 'hook', takes: [], gives: 'pan' }], recipes: [] },
    }
    expect(born(rack).slots.get('hook')).toBe('pan')

    const world = room([rack])
    const taken = world.frame(0.016, [{ i: 'rack', took: 'hook' }])
    expect(taken.took).toEqual([{ id: 'rack', socket: 'hook', item: 'pan', by: null }])
    expect(world.lives.get('rack')?.slots.size).toBe(0)
  })
})

describe('a pan on a pedestal that cooks what is on it', () => {
  /** Filling a slot is a door out of a state - the whole "burger cooking" case. */
  const pan: Alive = {
    id: 'pan',
    at: here,
    craft: { slots: [{ socket: 'hob', takes: ['patty'] }], recipes: [] },
    states: {
      start: 'cold',
      states: [
        { name: 'cold', changes: [{ when: 'filled', to: 'cooking' }] },
        {
          name: 'cooking',
          changes: [{ when: 'after', to: 'done', seconds: 5, fill: true }],
        },
        { name: 'done', emit: 'ding', changes: [{ when: 'emptied', to: 'cold' }] },
      ],
    },
  }

  test('sits cold until a patty lands on it', () => {
    const world = room([pan])
    world.frame(0.5)
    expect(world.lives.get('pan')?.standing?.state).toBe('cold')

    world.frame(0.016, [{ i: 'pan', put: ['hob', 'patty'] }])
    expect(world.lives.get('pan')?.standing?.state).toBe('cooking')
  })

  test('draws a bar while it cooks, and rings when it is done', () => {
    const world = room([pan])
    world.frame(0.016, [{ i: 'pan', put: ['hob', 'patty'] }])
    world.frame(2.5)
    expect(barOver(pan, world.lives.get('pan'))).toEqual({ kind: 'fill', at: 0.5 })

    const done = world.frame(2.6)
    expect(done.said.map((one) => one.word)).toContain('ding')
    expect(world.lives.get('pan')?.standing?.state).toBe('done')
    expect(barOver(pan, world.lives.get('pan'))).toBeNull()
  })

  test('and goes cold again when you take the patty off', () => {
    const world = room([pan])
    world.frame(0.016, [{ i: 'pan', put: ['hob', 'patty'] }])
    world.frame(5.1)
    world.frame(0.016, [{ i: 'pan', took: 'hob' }])
    expect(world.lives.get('pan')?.standing?.state).toBe('cold')
  })
})

describe('a word travels across the room', () => {
  test('a bell hears what a cooker shouted', () => {
    const cooker: Alive = {
      id: 'cooker',
      at: here,
      states: {
        start: 'off',
        states: [
          { name: 'off', changes: [{ when: 'use', to: 'on' }] },
          { name: 'on', emit: 'ding', changes: [] },
        ],
      },
    }
    const bell: Alive = {
      id: 'bell',
      at: { x: 5, y: 0, z: 0 },
      states: {
        start: 'quiet',
        states: [
          { name: 'quiet', changes: [{ when: 'signal', to: 'ringing', value: 'ding' }] },
          { name: 'ringing', changes: [] },
        ],
      },
    }

    const world = room([cooker, bell])
    const shouted = world.frame(0.016, [{ i: 'cooker', used: true }])
    expect(shouted.said.map((one) => one.word)).toContain('ding')
    // Heard on the *next* frame, which is the one-frame delay the room pays so
    // that nothing ever reacts to a word before its speaker has changed.
    expect(world.lives.get('bell')?.standing?.state).toBe('quiet')

    world.frame(0.016, [], [], shouted.said)
    expect(world.lives.get('bell')?.standing?.state).toBe('ringing')
  })

  /**
   * The two narrowings, and the case they exist for.
   *
   * A room with four doors in it has four things waiting for `open`, and until
   * a shout could be limited the only honest button was one that opened all of
   * them. `reach` is the answer for a room laid out in space - the doorbell you
   * have to be standing at - and a wire is the answer for one that is not: the
   * switch by the stairs and the light on the landing are nowhere near each
   * other and are still the pair somebody means.
   */
  describe('and how far it goes', () => {
    const shout = (from: string, word = 'open'): Signal[] => [{ word, from }]

    /** A thing that waits for `open` and stands wherever it is put. */
    const listener = (id: string, at: { x: number; y: number; z: number }): Alive => ({
      id,
      at,
      states: {
        start: 'shut',
        states: [
          { name: 'shut', changes: [{ when: 'signal', to: 'open', value: 'open' }] },
          { name: 'open', changes: [] },
        ],
      },
    })

    test('the whole room, when nobody said otherwise', () => {
      const button: Alive = { id: 'button', at: here }
      const world = room([button, listener('near', { x: 2, y: 0, z: 0 }), listener('far', far)])

      world.frame(0.016, [], [], shout('button'))
      expect(world.lives.get('near')?.standing?.state).toBe('open')
      expect(world.lives.get('far')?.standing?.state).toBe('open')
    })

    test('only as far as its reach', () => {
      const button: Alive = { id: 'button', at: here, reach: 5 }
      const world = room([button, listener('near', { x: 2, y: 0, z: 0 }), listener('far', far)])

      world.frame(0.016, [], [], shout('button'))
      expect(world.lives.get('near')?.standing?.state).toBe('open')
      expect(world.lives.get('far')?.standing?.state).toBe('shut')
    })

    test('measured in three dimensions, so a balcony is out of earshot', () => {
      const button: Alive = { id: 'button', at: here, reach: 3 }
      const world = room([button, listener('upstairs', { x: 0, y: 4, z: 0 })])

      world.frame(0.016, [], [], shout('button'))
      expect(world.lives.get('upstairs')?.standing?.state).toBe('shut')
    })

    test('down a wire, and nowhere else, however close the rest are standing', () => {
      const button: Alive = { id: 'button', at: here, wires: ['far'] }
      const world = room([button, listener('near', { x: 1, y: 0, z: 0 }), listener('far', far)])

      world.frame(0.016, [], [], shout('button'))
      expect(world.lives.get('far')?.standing?.state).toBe('open')
      expect(world.lives.get('near')?.standing?.state).toBe('shut')
    })

    test('a wire beats a reach, rather than being cut short by one', () => {
      const button: Alive = { id: 'button', at: here, reach: 2, wires: ['far'] }
      const world = room([button, listener('far', far)])

      world.frame(0.016, [], [], shout('button'))
      expect(world.lives.get('far')?.standing?.state).toBe('open')
    })

    test('a word from something that is no longer there still lands', () => {
      const world = room([listener('door', far)])

      world.frame(0.016, [], [], shout('a button somebody dismissed'))
      expect(world.lives.get('door')?.standing?.state).toBe('open')
    })
  })
})

describe('a turret', () => {
  const turret: Alive = {
    id: 'turret',
    at: here,
    fight: { weapon: { ...freshWeapon(), reach: 10, every: 1, shot: freshShot('bedroom/soccer_ball') } },
  }

  test('fires at whoever walks into range, and then has to reload', () => {
    const world = room([turret])
    const player = [{ id: 'p', at: { x: 4, y: 0, z: 0 } }]

    const first = world.frame(0.016, [], player)
    expect(first.shots).toEqual([{ from: 'turret', at: here, toward: 'p' }])

    // Not sixty times a second.
    expect(world.frame(0.016, [], player).shots).toEqual([])
    expect(world.frame(0.5, [], player).shots).toEqual([])
    expect(world.frame(0.6, [], player).shots.length).toBe(1)
  })

  test('and shoots the person standing in front of it, not whoever is driving', () => {
    // The bug this is here for: handed only the driver's body, a turret ignores
    // the four people in front of it. Peer poses come from `transformsRef`,
    // which the driver can read - the earlier design invented a wire protocol
    // to answer a question the scene could already answer.
    const world = room([turret])
    const shots = world.frame(0.016, [], [
      { id: 'driver', at: far },
      { id: 'someone-else', at: { x: 3, y: 0, z: 0 } },
    ])
    expect(shots.shots).toEqual([{ from: 'turret', at: here, toward: 'someone-else' }])
  })

  test('and holds its fire when nobody is in reach', () => {
    const world = room([turret])
    expect(world.frame(0.016, [], [{ id: 'p', at: far }]).shots).toEqual([])
  })

  test('one that swings rather than shoots plays its clip and still lands', () => {
    const spikes: Alive = {
      id: 'spikes',
      at: here,
      fight: { weapon: { ...freshWeapon(), reach: 2 } },
    }
    const world = room([spikes])
    const hit = world.frame(0.016, [], [{ id: 'p', at: { x: 1, y: 0, z: 0 } }])
    // On the same list a bullet goes on, and addressed to the same person: a
    // spike plate catches whoever is standing on it, and what tells the two
    // apart is whether the weapon has anything to fire. See the note in
    // `stepRoom`.
    expect(hit.shots).toEqual([{ from: 'spikes', at: here, toward: 'p' }])
    expect(hit.play).toEqual([{ id: 'spikes', clip: 'attack' }])
  })

  test('a demolition tool aimed at things leaves people alone', () => {
    const wrecker: Alive = {
      id: 'wrecker',
      at: here,
      fight: { weapon: { ...freshWeapon(), reach: 10, at: 'things' } },
    }
    const world = room([wrecker])
    expect(world.frame(0.016, [], [{ id: 'p', at: { x: 1, y: 0, z: 0 } }]).play).toEqual([])
  })
})

describe('the burger starter, end to end', () => {
  test('three words on a board make the fourth', () => {
    const board: Alive = { id: 'board', at: here, craft: freshBurger('top') }
    // The starter has one slot, so this is the honest version: the ingredients
    // go on one at a time and only the last one completes it.
    const world = room([
      {
        ...board,
        craft: {
          ...freshBurger('top'),
          slots: [
            { socket: 'top', takes: [] },
            { socket: 'mid', takes: [] },
            { socket: 'low', takes: [] },
          ],
        },
      },
    ])

    world.frame(0.016, [{ i: 'board', put: ['top', 'bun'] }])
    world.frame(0.016, [{ i: 'board', put: ['mid', 'patty'] }])
    expect(world.lives.get('board')?.slots.size).toBe(2)

    const made = world.frame(0.016, [{ i: 'board', put: ['low', 'salad'] }])
    expect(made.made).toEqual([{ id: 'board', socket: 'top', item: 'burger' }])
    expect(made.said.map((one) => one.word)).toContain('made')
  })
})

describe('a thing that moves', () => {
  /** Straight up four cells over a second, straight back down over a second. */
  const lift = { by: { x: 0, y: 4, z: 0 }, out: 1, back: 1 }

  test('carries its own clock, and wraps', () => {
    const platform: Alive = { id: 'lift', at: here, motion: lift }
    const world = room([platform])

    world.frame(0.5)
    expect(world.lives.get('lift')?.phase).toBeCloseTo(0.5, 5)

    // Two seconds is the whole trip, so the phase comes back round rather than
    // growing forever - see `Life.phase`.
    world.frame(1.6)
    expect(world.lives.get('lift')?.phase).toBeCloseTo(0.1, 5)
  })

  test('and its weapon reaches from where it has got to, not from where it was put', () => {
    /*
      A crusher three cells up, dropping onto somebody standing at the bottom.
      Its reach is two cells, so at the top it cannot touch them and at the
      bottom it can - which is the whole of what "it fell on you" means here.
    */
    const crusher: Alive = {
      id: 'crusher',
      at: here,
      motion: { by: { x: 0, y: 3, z: 0 }, out: 1, back: 1 },
      fight: { weapon: { damage: 20, reach: 2, every: 5, at: 'people' } },
    }
    const standing = [{ id: 'p', at: { x: 0, y: 0, z: 0 } }]

    // Most of the way up: out of reach, and nothing is aimed at anybody.
    const up = room([crusher])
    up.frame(0.9, [], standing)
    expect(up.frame(0.05, [], standing).shots).toEqual([])

    // Back at the bottom: caught. One step rather than two, because the
    // weapon's own cooldown means the frame that fires is the first one that
    // finds somebody in reach - a second call would be judged against five
    // seconds of reloading.
    const down = room([crusher])
    expect(down.frame(1.9, [], standing).shots).toHaveLength(1)
  })
})
