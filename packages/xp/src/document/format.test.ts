import { describe, expect, test } from 'bun:test'
import { markByName } from './capabilities'
import { HOST_CAPABILITIES } from '../net/host'
import {
  describeProblems,
  MAX_ENTITIES,
  MAX_PLACEMENTS,
  MAX_ROLE_LENGTH,
  MAX_ROLES,
  MAX_VISIT_AMOUNT,
  MAX_SIGN_TEXT_LENGTH,
  parseXp,
  WORLD_RADIUS,
  XP_FORMAT,
} from './format'

/**
 * `parseXp` is the boundary: everything past it is trusted, and what arrives is
 * a file somebody wrote by hand. So most of these are about what it *refuses*.
 */

function doc(overrides: Record<string, unknown> = {}) {
  return {
    format: XP_FORMAT,
    id: 'first',
    name: 'First',
    packs: [{ id: 'proto' }],
    world: {
      floorY: 0,
      placements: [{ model: 'proto/Primitive_Floor', x: 0, y: 0, z: 0 }],
    },
    spawn: { x: 0, y: 1, z: 0, facing: 0 },
    ...overrides,
  }
}

const problemsOf = (raw: unknown) => {
  const result = parseXp(raw)
  return result.ok ? [] : result.problems.map((p) => `${p.at}: ${p.message}`)
}

describe('a document that is fine', () => {
  test('parses', () => {
    const result = parseXp(doc())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.document.name).toBe('First')
    expect(result.document.world.placements).toHaveLength(1)
  })

  test('rotation and scale default, so a hand-written placement is three numbers', () => {
    const result = parseXp(doc())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.document.world.placements[0]).toMatchObject({ rotation: 0, scale: 1 })
  })

  test('spawn defaults to the origin rather than being required', () => {
    const result = parseXp(doc({ spawn: undefined }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.document.spawn).toEqual({ x: 0, y: 0, z: 0, facing: 0 })
  })
})

describe('the format tag', () => {
  test('a version we do not know is refused, and nothing else is reported', () => {
    // Fatal on its own: every check below is written against this version's
    // shape, so running them on a newer document produces a page of confident
    // nonsense about fields that were never meant to be here.
    const problems = problemsOf(doc({ format: 'xp/9', name: undefined }))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('format')
  })

  test('a missing tag is refused too', () => {
    expect(problemsOf({ id: 'x' })).toHaveLength(1)
  })

  test('something that is not an object at all', () => {
    expect(problemsOf(null)).toEqual([': not an object'])
    expect(problemsOf('a string')).toEqual([': not an object'])
    expect(problemsOf([])).toEqual([': not an object'])
  })
})

describe('models', () => {
  test('a model we do not ship is refused, by name', () => {
    const problems = problemsOf(
      doc({ world: { placements: [{ model: 'proto/Nope', x: 0, y: 0, z: 0 }] } }),
    )
    expect(problems).toContain('world.placements[0].model: not a model we ship: proto/Nope')
  })

  test('a path that would escape the pack directory is not a model', () => {
    const problems = problemsOf(
      doc({
        world: { placements: [{ model: 'proto/../../../etc/passwd', x: 0, y: 0, z: 0 }] },
      }),
    )
    expect(problems.some((p) => p.includes('not a model we ship'))).toBe(true)
  })

  test('a pack used but not declared is named', () => {
    const problems = problemsOf(
      doc({
        packs: [{ id: 'dummy' }],
        world: { placements: [{ model: 'proto/Primitive_Floor', x: 0, y: 0, z: 0 }] },
      }),
    )
    expect(problems).toContain('packs: world uses "proto" but the document does not list it')
  })

  test('a pack we do not ship is refused', () => {
    expect(problemsOf(doc({ packs: [{ id: 'nope' }] }))).toContain(
      'packs[0].id: not a pack we ship: nope',
    )
  })
})

describe('provenance is filled in, not trusted', () => {
  test('a document cannot claim a different author or licence for our art', () => {
    // These fields end up in an export's CREDITS.txt. A document that could lie
    // about them is a document that could ship a false licence.
    const result = parseXp(
      doc({ packs: [{ id: 'proto', author: 'Somebody Else', licence: 'All rights reserved' }] }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.document.packs[0]).toEqual({
      id: 'proto',
      author: 'Kay Lousberg',
      licence: 'CC0',
      source: 'https://kaylousberg.itch.io/',
    })
  })
})

describe('placements', () => {
  test('a position outside the world is refused', () => {
    const problems = problemsOf(
      doc({
        world: {
          placements: [{ model: 'proto/Primitive_Floor', x: WORLD_RADIUS, y: 0, z: 0 }],
        },
      }),
    )
    expect(problems.some((p) => p.includes('outside the world'))).toBe(true)
  })

  /**
   * Fractions are the point now, not the mistake.
   *
   * This test used to assert the opposite - `must be a whole cell` - and it was
   * right for the editor that existed then, which painted four-metre pieces
   * onto a lattice. It is wrong for one that places things against surfaces,
   * and the constraint turned out never to have been load-bearing: the
   * rasteriser always rounded, because a model's own bounds are fractional.
   */
  test('a fractional position is fine - placements are not on the lattice', () => {
    const problems = problemsOf(
      doc({ world: { placements: [{ model: 'proto/Primitive_Floor', x: 0.5, y: 0, z: -2.3 }] } }),
    )
    expect(problems).toEqual([])
  })

  test('a negative height is refused - the world has a bottom', () => {
    const problems = problemsOf(
      doc({ world: { placements: [{ model: 'proto/Primitive_Floor', x: 0, y: -1, z: 0 }] } }),
    )
    expect(problems.some((p) => p.includes('world.placements[0].y'))).toBe(true)
  })

  test('a zero or negative scale is refused', () => {
    for (const scale of [0, -1]) {
      const problems = problemsOf(
        doc({
          world: { placements: [{ model: 'proto/Primitive_Floor', x: 0, y: 0, z: 0, scale }] },
        }),
      )
      expect(problems).toContain('world.placements[0].scale: must be a positive number')
    }
  })

  test('too many placements is refused before any of them are read', () => {
    const problems = problemsOf(
      doc({ world: { placements: new Array(MAX_PLACEMENTS + 1).fill({}) } }),
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('over the')
  })
})

describe('reporting', () => {
  test('six typos are six problems, not the first one', () => {
    const problems = problemsOf(
      doc({
        id: undefined,
        name: undefined,
        world: {
          placements: [
            { model: 'proto/Nope', x: 0, y: 0, z: 0 },
            { model: 'proto/Primitive_Floor', x: 'over there', y: 0, z: 0 },
          ],
        },
      }),
    )
    expect(problems.length).toBeGreaterThanOrEqual(4)
    expect(problems).toContain('id: missing')
    expect(problems).toContain('name: missing')
  })

  test('a failed parse never returns a half-valid document', () => {
    const result = parseXp(doc({ name: undefined }))
    expect(result.ok).toBe(false)
    expect('document' in result).toBe(false)
  })

  test('problems render one per line, addressed', () => {
    const rendered = describeProblems([
      { at: 'world.placements[3].model', message: 'not a model we ship: proto/Nope' },
      { at: '', message: 'not an object' },
    ])
    expect(rendered).toBe('world.placements[3].model: not a model we ship: proto/Nope\nnot an object')
  })
})

describe('the limits are the measured ones', () => {
  test('too many entities is refused before any of them are read', () => {
    const problems = problemsOf(
      doc({
        blueprints: { c: { model: 'proto/Box_A' } },
        entities: new Array(MAX_ENTITIES + 1).fill({ blueprint: 'c', x: 0, y: 0, z: 0 }),
      }),
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('over the')
  })

  test('the entity limit is tighter than the placement one, and that is deliberate', () => {
    /**
     * A placement costs once, when the world is rasterised. An entity costs
     * every frame, twice - a box the controller tests and a trigger pass that
     * runs per player. `bun run xp:bench` has the numbers; the short version is
     * that the trigger pass is entities times players, so a thousand entities
     * and sixteen players is already half a frame.
     */
    expect(MAX_ENTITIES).toBeLessThan(MAX_PLACEMENTS)
  })
})

/**
 * What the player arrives holding.
 *
 * The same shape a rider in a kart's seat has, and checked the same way - which
 * is the point of putting it on the player rather than inventing a second kind
 * of attachment. A weapon naming a blueprint nobody wrote is refused here
 * because the symptom otherwise is a gun that is not drawn and does not fire,
 * which reads as a broken runtime rather than as a typo.
 */
describe('the player’s weapon', () => {
  const armed = (weapon: unknown) =>
    doc({
      packs: [{ id: 'proto' }, { id: 'dummy' }],
      blueprints: {
        marksman: {
          model: 'dummy/Dummy',
          collider: 'none',
          sockets: { hand: { x: 0.3, y: 1.2, z: 0.3 } },
        },
        pistol: { model: 'proto/Gun_Pistol', collider: 'none', props: { damage: 5 } },
      },
      player: { blueprint: 'marksman', weapon },
    })

  test('a gun on a socket parses', () => {
    const result = parseXp(armed({ blueprint: 'pistol', socket: 'hand' }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.document.player.weapon).toEqual({ blueprint: 'pistol', socket: 'hand' })
  })

  test('a blueprint nobody wrote is named', () => {
    expect(problemsOf(armed({ blueprint: 'ghost' }))).toEqual([
      'player.weapon.blueprint: no blueprint called "ghost"',
    ])
  })

  test('a socket the body does not have is named', () => {
    expect(problemsOf(armed({ blueprint: 'pistol', socket: 'pocket' }))).toEqual([
      'player.weapon.socket: "marksman" has no socket called "pocket"',
    ])
  })

  test('a socket with no body to hang on is refused', () => {
    const result = parseXp(
      doc({
        blueprints: { pistol: { model: 'proto/Gun_Pistol', collider: 'none' } },
        player: { weapon: { blueprint: 'pistol', socket: 'hand' } },
      }),
    )
    expect(result.ok).toBe(false)
  })

  test('a gun with no socket hangs at the body’s own origin, which is allowed', () => {
    const result = parseXp(
      doc({
        blueprints: { pistol: { model: 'proto/Gun_Pistol', collider: 'none' } },
        player: { weapon: { blueprint: 'pistol' } },
      }),
    )
    expect(result.ok).toBe(true)
  })
})

describe('what is behind the world', () => {
  test('a document with no sky of its own is transparent', () => {
    /**
     * Absent rather than defaulted to a colour, and the difference is visible:
     * the canvas is left unpainted so the *page* shows through, which is what
     * the lounge does. A near-black rectangle inside a near-black page is a
     * rectangle whose edges you can see and cannot explain.
     */
    const result = parseXp(doc())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.document.world.background).toBeUndefined()
    expect('background' in result.document.world).toBe(false)
  })

  test('and one that asks for a sky keeps exactly what it asked for', () => {
    const result = parseXp(doc({ world: { floorY: 0, placements: [], marks: [], background: '#123456' } }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.document.world.background).toBe('#123456')
  })

  test('a colour that is not a string is refused, because it reaches three.js', () => {
    // Not validated as a *colour* beyond being a string - three.js parses named
    // colours, `rgb()` and `hsl()`, so a regex would refuse things that work
    // while still admitting `#gggggg`. What it must not be is a non-string,
    // which throws inside a render rather than at the boundary.
    const result = parseXp(doc({ world: { floorY: 0, placements: [], marks: [], background: 0x112233 } }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.problems.map((p) => p.at)).toContain('world.background')
  })
})

/**
 * Bouncy things, at the boundary.
 *
 * The refusals matter more than the acceptances here, because the number goes
 * straight to `jumpSpeedFor`, which is a `Math.sqrt`. A negative one produces
 * `NaN` velocity, then a `NaN` position, and a body that quietly stops existing
 * with nothing logged anywhere - the worst kind of bad input, because it does
 * not look like bad input.
 */
describe('bounce', () => {
  const withPad = (bounce: unknown) =>
    doc({
      world: {
        floorY: 0,
        placements: [{ model: 'proto/Primitive_Floor', x: 0, y: 0, z: 0, bounce }],
      },
    })

  test('a placement can carry one, and it survives the parse', () => {
    const result = parseXp(withPad(3))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.document.world.placements[0].bounce).toBe(3)
  })

  test('absent stays absent, so an old document does not grow a field', () => {
    const result = parseXp(doc())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect('bounce' in result.document.world.placements[0]).toBe(false)
  })

  test('the sqrt-breaking values are refused rather than passed on', () => {
    expect(problemsOf(withPad(-2))).toContain(
      'world.placements[0].bounce: must be a positive number of cells',
    )
    expect(problemsOf(withPad(0))).toContain(
      'world.placements[0].bounce: must be a positive number of cells',
    )
    expect(problemsOf(withPad('high'))).toContain(
      'world.placements[0].bounce: must be a positive number of cells',
    )
    expect(problemsOf(withPad(Number.NaN))).toContain(
      'world.placements[0].bounce: must be a positive number of cells',
    )
  })

  test('and the slipped decimal', () => {
    expect(problemsOf(withPad(300))).toContain('world.placements[0].bounce: at most 20 cells')
  })

  test('the player can be bouncy all over, on the same terms', () => {
    const ok = parseXp(doc({ player: { bounce: 1.5 } }))
    expect(ok.ok).toBe(true)
    if (!ok.ok) return
    expect(ok.document.player?.bounce).toBe(1.5)

    expect(problemsOf(doc({ player: { bounce: -1 } }))).toContain(
      'player.bounce: must be a positive number of cells',
    )
    expect(problemsOf(doc({ player: { bounce: 99 } }))).toContain('player.bounce: at most 20 cells')
  })
})

/**
 * The movement numbers, at the same boundary and for the same reason: each of
 * them reaches arithmetic the frame loop trusts, and a zero already has a
 * spelling - absence.
 */
describe('the movement numbers', () => {
  test('all five survive the parse together', () => {
    const result = parseXp(
      doc({ player: { speed: 5, sprint: 16, gravity: 13, acceleration: 30, drag: 12 } }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.document.player).toMatchObject({
      speed: 5,
      sprint: 16,
      gravity: 13,
      acceleration: 30,
      drag: 12,
    })
  })

  test('absent stays absent, so an old document does not grow a feel', () => {
    const result = parseXp(doc())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    for (const field of ['speed', 'sprint', 'gravity', 'acceleration', 'drag']) {
      expect(field in (result.document.player ?? {})).toBe(false)
    }
  })

  test('zero and below are refused - absence already says the built-in', () => {
    expect(problemsOf(doc({ player: { speed: 0 } }))).toContain(
      'player.speed: must be a positive number of cells a second',
    )
    expect(problemsOf(doc({ player: { gravity: -5 } }))).toContain(
      'player.gravity: must be a positive number of cells a second squared',
    )
    expect(problemsOf(doc({ player: { drag: 'ice' } }))).toContain(
      'player.drag: must be a positive number of cells a second squared',
    )
  })

  test('and the slipped decimal', () => {
    expect(problemsOf(doc({ player: { sprint: 400 } }))).toContain('player.sprint: at most 40')
    expect(problemsOf(doc({ player: { gravity: 260 } }))).toContain('player.gravity: at most 100')
    expect(problemsOf(doc({ player: { acceleration: 4000 } }))).toContain(
      'player.acceleration: at most 400',
    )
  })
})

describe('where a weapon sits in the hand', () => {
  const withGrip = (grip: Record<string, unknown>) =>
    doc({
      packs: [{ id: 'proto' }, { id: 'dummy' }],
      blueprints: { body: { model: 'dummy/Dummy' }, pistol: { model: 'proto/Gun_Pistol' } },
      player: { blueprint: 'body', weapon: { blueprint: 'pistol', ...grip } },
    })

  const weaponOf = (raw: unknown) => {
    const result = parseXp(raw)
    if (!result.ok) throw new Error(result.problems.map((p) => `${p.at}: ${p.message}`).join('\n'))
    return result.document.player.weapon
  }

  test('an offset and three angles survive the parse', () => {
    expect(weaponOf(withGrip({ x: 0.1, y: -0.2, pitch: 90, roll: 45, scale: 1.5 }))).toEqual({
      blueprint: 'pistol',
      x: 0.1,
      y: -0.2,
      pitch: 90,
      roll: 45,
      scale: 1.5,
    })
  })

  test('a document that never adjusted it is the document it always was', () => {
    // The whole grip is absent by default, so nothing grows a field by being
    // opened and saved.
    expect(weaponOf(withGrip({}))).toEqual({ blueprint: 'pistol' })
  })

  test('and a value at its default is dropped rather than written', () => {
    expect(weaponOf(withGrip({ x: 0, pitch: 0, scale: 1 }))).toEqual({ blueprint: 'pistol' })
  })

  test('a NaN is a problem, not a silent zero', () => {
    // `NaN` in a transform is a model that simply vanishes, which is the least
    // debuggable failure three.js has.
    expect(problemsOf(withGrip({ x: Number.NaN }))).toContain('player.weapon.x: must be a number')
    expect(problemsOf(withGrip({ pitch: 'sideways' }))).toContain(
      'player.weapon.pitch: must be a number',
    )
  })

  test('a scale of zero is refused, because it is a gun nobody can see', () => {
    expect(problemsOf(withGrip({ scale: 0 }))).toContain(
      'player.weapon.scale: must be a positive number',
    )
    expect(problemsOf(withGrip({ scale: -1 }))).toContain(
      'player.weapon.scale: must be a positive number',
    )
  })
})

describe('a condition about whoever set the rule off', () => {
  const withCondition = (when: unknown) =>
    doc({
      blueprints: {
        base: {
          model: 'proto/Primitive_Floor',
          triggers: [{ on: 'enter', when, do: [{ op: 'score', amount: 1 }] }],
        },
      },
    })

  const conditionOf = (raw: unknown) => {
    const result = parseXp(raw)
    if (!result.ok) throw new Error(result.problems.map((p) => `${p.at}: ${p.message}`).join('\n'))
    return result.document.blueprints.base.triggers[0].when
  }

  test('of: other survives the parse', () => {
    expect(conditionOf(withCondition({ of: 'other', prop: 'flag', is: '==', value: 1 }))).toEqual({
      of: 'other',
      prop: 'flag',
      is: '==',
      value: 1,
    })
  })

  test('a condition that never asked about anybody else is the three fields it was', () => {
    // Dropped when it is the default, so every rule written before this field
    // existed round-trips byte for byte.
    expect(conditionOf(withCondition({ of: 'self', prop: 'hp', is: '<=', value: 0 }))).toEqual({
      prop: 'hp',
      is: '<=',
      value: 0,
    })
    expect(conditionOf(withCondition({ prop: 'hp', is: '<=', value: 0 }))).toEqual({
      prop: 'hp',
      is: '<=',
      value: 0,
    })
  })

  test('an invented subject is named, rather than the whole condition', () => {
    // The message has to point at `of`: a document saying `of: 'whoever'` has a
    // prop and a comparison, and being told it needs those sends somebody
    // looking at the two fields that are right.
    expect(problemsOf(withCondition({ of: 'whoever', prop: 'flag', is: '==', value: 1 }))).toContain(
      'blueprints.base.triggers[0].when.of: must be self, other or world',
    )
  })
})

describe('the pose a body holds', () => {
  const withPose = (pose: unknown) =>
    doc({
      packs: [{ id: 'proto' }, { id: 'dummy' }],
      blueprints: { guard: { model: 'dummy/Dummy', pose } },
    })

  test('a blueprint can name a clip, and it survives the parse', () => {
    const result = parseXp(withPose('Ranged_1H_Aiming'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.document.blueprints.guard.pose).toBe('Ranged_1H_Aiming')
  })

  test('absent stays absent, so a crate does not grow a field', () => {
    const result = parseXp(
      doc({
        packs: [{ id: 'proto' }],
        blueprints: { crate: { model: 'proto/Box_A' } },
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect('pose' in result.document.blueprints.crate).toBe(false)
  })

  test('the pack ships a hyphen, so the alphabet has one', () => {
    // `T-Pose` is a real clip. The alphabet is what the files use, not a guess.
    expect(parseXp(withPose('T-Pose')).ok).toBe(true)
  })

  test('a name that could be a path is refused', () => {
    // The same reason a model id cannot contain a slash: these are strings a
    // host looks things up by, and one of those lookups is a fetch.
    for (const bad of ['../secrets', 'a/b', '', 42, { name: 'Idle_A' }]) {
      expect(problemsOf(withPose(bad))).toContain(
        'blueprints.guard.pose: must be the name of an animation clip',
      )
    }
  })

  test('a clip this host cannot play is not the parser’s to refuse', () => {
    // Which clips exist is a fact about the host - `skinned.tsx` loads three of
    // the pack's eight files, and a host that loaded all eight would make this
    // document correct. The editor offers only the playable ones; the format
    // takes any well-formed name.
    expect(parseXp(withPose('Sit_Chair_Idle')).ok).toBe(true)
  })
})

/**
 * `backend` — what the level asks of its host.
 *
 * The other direction from `capabilities`, and the half that was named in
 * `./host`'s comments long before a document could say it: `missingCapabilities`
 * was a refusal nothing could ever reach, because nothing could declare a need.
 */
describe('what the level asks of its host', () => {
  test('a document that asks for nothing keeps no block', () => {
    // §7.3 in docs/xp/state.md: a room that stores nothing must cost nothing,
    // and every document written before this block existed is one of those.
    const result = parseXp(doc())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.document.backend).toBeUndefined()

    // An empty block says nothing its absence does not, so it is dropped rather
    // than round-tripped into every file somebody opens and saves.
    const empty = parseXp(doc({ backend: { needs: [], wants: [] } }))
    expect(empty.ok).toBe(true)
    if (!empty.ok) return
    expect(empty.document.backend).toBeUndefined()
  })

  test('needs and wants are kept apart, because they fail differently', () => {
    const result = parseXp(
      doc({ backend: { needs: ['identity', 'persistence'], wants: ['arbiter'] } }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.document.backend).toEqual({
      needs: ['identity', 'persistence'],
      wants: ['arbiter'],
    })
  })

  test('a capability no host provides is refused, and the message says what there is', () => {
    expect(problemsOf(doc({ backend: { needs: ['database'] } }))).toContain(
      `backend.needs[0]: not something a host provides: "database" (${HOST_CAPABILITIES.join(', ')})`,
    )
  })

  test('the same thing needed and wanted is a problem, not a precedence rule', () => {
    // It reads as "refuse without this, and also carry on without it". Picking
    // one on the author's behalf guesses at the exact question the split exists
    // to make them answer.
    expect(problemsOf(doc({ backend: { needs: ['network'], wants: ['network'] } }))).toContain(
      'backend: "network" is both needed and wanted; it is one or the other',
    )
  })

  test('the shapes that are not a block at all', () => {
    expect(problemsOf(doc({ backend: [] }))).toContain('backend: not a block')
    expect(problemsOf(doc({ backend: { needs: 'identity' } }))).toContain(
      'backend.needs: not a list',
    )
    expect(problemsOf(doc({ backend: { needs: ['identity', 'identity'] } }))).toContain(
      'backend.needs[1]: listed twice: identity',
    )
  })
})

describe('how many players a level says it is for', () => {
  const withPlayers = (players: unknown) =>
    doc({ rules: { preset: 'freestyle', players } })

  test('a board game for four is carried through', () => {
    const result = parseXp(withPlayers({ min: 2, max: 4 }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.document.rules?.players).toEqual({ min: 2, max: 4 })
  })

  test('a document with no players block parses exactly as it always did', () => {
    const result = parseXp(doc())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.document.rules?.players).toBeUndefined()
  })

  /*
   * Refused rather than clamped, each of them: every one is an author saying
   * something specific this build cannot honour, and a silently corrected
   * `max: 40` is a level that admits fifteen and never says why.
   */
  test('a number the transport cannot carry is refused, not trimmed', () => {
    expect(problemsOf(withPlayers({ max: 40 }))).toEqual([
      'rules.players.max: must be 25 or fewer',
    ])
  })

  test('half a player is refused', () => {
    expect(problemsOf(withPlayers({ min: 1.5 }))).toEqual([
      'rules.players.min: not a whole number',
    ])
  })

  test('a level for nobody is refused', () => {
    expect(problemsOf(withPlayers({ max: 0 }))).toEqual([
      'rules.players.max: must be at least 1',
    ])
  })

  test('a crossed pair says the thing that is actually wrong', () => {
    expect(problemsOf(withPlayers({ min: 4, max: 2 }))).toEqual([
      'rules.players: min is more than max, so nobody could ever start it',
    ])
  })

  test('players that is not an object is refused', () => {
    expect(problemsOf(withPlayers(4))).toEqual(['rules.players: not an object'])
  })
})

/**
 * A mark you can point at.
 *
 * `teleport` could only ever address an *entity*, so "send them back to the
 * start" meant standing an empty node on top of the spawn and naming that —
 * two things to keep in one place, which is one thing to get wrong.
 */
describe('a mark with a name', () => {
  const withMarks = (marks: unknown[]) =>
    doc({
      world: {
        floorY: 0,
        placements: [{ model: 'proto/Primitive_Floor', x: 0, y: 0, z: 0 }],
        marks,
      },
    })

  test('carries it through the parser', () => {
    const result = parseXp(
      withMarks([{ kind: 'spawn', x: 2, y: 0, z: 2, facing: 90, name: 'cellar-door' }]),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.document.world.marks[0]?.name).toBe('cellar-door')
  })

  test('a mark may not take a name an entity already answers to', () => {
    // Not ambiguity — `teleport` resolves entities first, so this would be a
    // mark that silently never wins. The author sees a name they wrote, in a
    // document that parsed, addressing something else entirely.
    expect(
      problemsOf({
        ...withMarks([{ kind: 'finish', x: 1, y: 0, z: 1, facing: 0, name: 'exit' }]),
        entities: [{ blueprint: 'thing', name: 'exit', x: 0, y: 0, z: 0 }],
        blueprints: { thing: { model: 'proto/Primitive_Floor' } },
      }),
    ).toContain('world.marks[0].name: "exit" is already the name of entities[0]')
  })

  test('and two marks may not share one', () => {
    expect(
      problemsOf(
        withMarks([
          { kind: 'spawn', x: 0, y: 0, z: 0, facing: 0, name: 'gate' },
          { kind: 'spawn', x: 4, y: 0, z: 0, facing: 0, name: 'gate' },
        ]),
      ),
    ).toContain('world.marks[1].name: "gate" is already the name of world.marks[0]')
  })

  test('an empty name is a mistake rather than an absence', () => {
    expect(
      problemsOf(withMarks([{ kind: 'spawn', x: 0, y: 0, z: 0, facing: 0, name: '' }])),
    ).toContain('world.marks[0].name: not a name')
  })
})

describe('the name a mark has without being given one', () => {
  const marks = [
    { kind: 'start' as const, x: 1, y: 0, z: 1, facing: 0, width: 4, height: 4 },
    { kind: 'finish' as const, x: 9, y: 0, z: 9, facing: 0, width: 4, height: 4 },
  ]

  test('a kind that appears once resolves without a name', () => {
    // Making an author name the only finish there is would be ceremony.
    expect(markByName(marks, 'finish')).toBe(marks[1])
  })

  test('and stops resolving the moment there are two', () => {
    // With two starts, "the start" is a question rather than an address, and
    // picking the first is how a level works in testing and sends half the
    // players somewhere else on the night.
    const two = [...marks, { kind: 'start' as const, x: 5, y: 0, z: 5, facing: 0, width: 4, height: 4 }]
    expect(markByName(two, 'start')).toBeNull()
  })

  test('an explicit name beats the kind it happens to be', () => {
    const named = [{ ...marks[0]!, name: 'finish' }, marks[1]!]
    expect(markByName(named, 'finish')).toBe(named[0])
  })
})

describe('the roles a document deals', () => {
  /**
   * A deck has to cover the room, so these all say how big the room is — and
   * they all declare the arbiter, because a document that deals is refused
   * without it. See the block below for the rule itself.
   */
  const forTwo = (roles: unknown) =>
    doc({
      rules: { preset: 'freestyle', players: { max: 2 }, roles },
      backend: { needs: ['arbiter'] },
    })

  test('a list of names survives being read', () => {
    const parsed = parseXp(forTwo(['impostor', 'crew']))
    expect(parsed.ok && parsed.document.rules?.roles).toEqual(['impostor', 'crew'])
  })

  test('absent is a level that deals nothing, and stays absent', () => {
    const parsed = parseXp(doc({ rules: { preset: 'freestyle' } }))
    expect(parsed.ok && 'roles' in (parsed.document.rules ?? {})).toBe(false)
  })

  test('duplicates are the point rather than a mistake', () => {
    const parsed = parseXp(forTwo(['crew', 'crew']))
    expect(parsed.ok && parsed.document.rules?.roles).toEqual(['crew', 'crew'])
  })

  /**
   * Empty is refused rather than treated as absent: a document that wrote the
   * field meant to say something, and `[]` says nothing. Leaving it out is how
   * a level says it deals nothing.
   */
  test('an empty list is refused, and says how to mean nothing', () => {
    expect(problemsOf(forTwo([])).join('\n')).toContain('leave it out')
  })

  test('a role that is not a name is refused by its index', () => {
    const problems = problemsOf(forTwo(['impostor', 7, '']))
    expect(problems.some((problem) => problem.startsWith('rules.roles[1]'))).toBe(true)
    expect(problems.some((problem) => problem.startsWith('rules.roles[2]'))).toBe(true)
  })

  test('a role long enough to be a paragraph is refused', () => {
    expect(problemsOf(forTwo(['crew', 'x'.repeat(MAX_ROLE_LENGTH + 1)])).length).toBeGreaterThan(0)
  })

  test('more roles than the transport carries is refused', () => {
    const tooMany = Array.from({ length: MAX_ROLES + 1 }, () => 'crew')
    expect(problemsOf(forTwo(tooMany)).length).toBeGreaterThan(0)
  })

  /**
   * The refusal an author is most likely to meet, and the one the arbiter would
   * otherwise deliver mid-round in front of everybody.
   */
  test('a deck that cannot cover the room is refused with both numbers', () => {
    const problems = problemsOf(
      doc({ rules: { preset: 'freestyle', players: { max: 5 }, roles: ['impostor', 'crew'] } }),
    ).join('\n')
    expect(problems).toContain('2 roles')
    expect(problems).toContain('up to 5')
  })

  /**
   * Which of them the guns are about.
   *
   * The membership check lives in `rulesProblems` rather than here, because it
   * is two fields agreeing rather than one field being well formed — but
   * `parseXp` runs that too, so an author hears about a typo from the same load
   * either way. Both directions are checked here for exactly that reason: a
   * refusal that only exists in a function nobody calls at load is no refusal.
   */
  test('the lethal role survives being read', () => {
    const parsed = parseXp(
      doc({
        rules: { preset: 'freestyle', players: { max: 2 }, roles: ['bug', 'crew'], lethal: 'bug' },
        backend: { needs: ['arbiter'] },
      }),
    )
    expect(parsed.ok && parsed.document.rules?.lethal).toBe('bug')
  })

  test('a lethal role that is not a name is refused by its path', () => {
    expect(
      problemsOf(
        doc({ rules: { preset: 'freestyle', players: { max: 2 }, roles: ['bug', 'crew'], lethal: 7 } }),
      ).some((problem) => problem.startsWith('rules.lethal')),
    ).toBe(true)
  })

  test('a lethal role nobody is dealt is refused at load, not at the first shot', () => {
    expect(
      problemsOf(
        doc({
          rules: { preset: 'freestyle', players: { max: 2 }, roles: ['bug', 'crew'], lethal: 'imposter' },
          backend: { needs: ['arbiter'] },
        }),
      ).join('\n'),
    ).toContain('imposter')
  })

  /**
   * And what each of them means, which is the generalisation of the field above
   * — docs/xp/xp-flow.md §3.
   *
   * Every refusal here is about a document that would otherwise *load and play
   * as though the block were not there*, which is this format's worst failure
   * and the reason none of these are coercions.
   */
  const meaning = (perRole: unknown) =>
    doc({
      rules: { preset: 'freestyle', players: { max: 2 }, roles: ['hidden', 'seeker'], perRole },
      backend: { needs: ['arbiter'] },
    })

  test('what a role means survives the round trip', () => {
    const parsed = parseXp(meaning({ hidden: { allow: ['use'], seen: 'nobody' } }))
    expect(parsed.ok && parsed.document.rules?.perRole).toEqual({
      hidden: { allow: ['use'], seen: 'nobody' },
    })
  })

  test('an empty allow survives it, because it is not the same as absent', () => {
    // `[]` is how a role says *watch*. Dropped, it would become the one role
    // with every button live, which is the exact opposite.
    const parsed = parseXp(meaning({ hidden: { allow: [] } }))
    expect(parsed.ok && parsed.document.rules?.perRole?.hidden?.allow).toEqual([])
  })

  test('a way of being seen this build has never heard of is refused, not ignored', () => {
    // `"seen": "hider"` is somebody meaning `nobody`. Ignoring it would draw
    // them to the whole room from a document that said it loaded fine.
    const problems = problemsOf(meaning({ hidden: { seen: 'hider' } }))
    expect(problems.some((problem) => problem.startsWith('rules.perRole.hidden.seen'))).toBe(true)
  })

  test('an entry that says nothing is refused where it was written', () => {
    const problems = problemsOf(meaning({ hidden: {} }))
    expect(problems.some((problem) => problem.startsWith('rules.perRole.hidden'))).toBe(true)
  })

  test('an allow that is not a list of names is refused by its path', () => {
    expect(
      problemsOf(meaning({ hidden: { allow: 'use' } })).some((problem) =>
        problem.startsWith('rules.perRole.hidden.allow'),
      ),
    ).toBe(true)
  })

  test('a rule for a role nobody is dealt is refused at load', () => {
    expect(problemsOf(meaning({ hider: { seen: 'nobody' } })).join('\n')).toContain('hider')
  })

  test('absent stays absent, so a level that says nothing round-trips unchanged', () => {
    const parsed = parseXp(forTwo(['impostor', 'crew']))
    expect(parsed.ok && 'perRole' in (parsed.document.rules ?? {})).toBe(false)
  })
})

/**
 * A level that keeps a secret has to say it needs somewhere to keep it.
 *
 * docs/xp/server-authority.md §4.2. `missingCapabilities` refuses to start an XP
 * whose `needs` are not met, and it only ever fires for a document that walked
 * through the door — both games written against the arbiter had it in `wants`,
 * which degrades, and what `proto-bug` degraded to was a room where nothing is
 * dealt and no shot lands.
 */
describe('a document that cannot run without an arbiter', () => {
  const dealing = (backend?: unknown) =>
    doc({
      rules: { preset: 'freestyle', players: { max: 2 }, roles: ['bug', 'crew'] },
      ...(backend === undefined ? {} : { backend }),
    })

  test('a deck with no arbiter declared is refused, and the message says why', () => {
    const problems = problemsOf(dealing()).join('\n')
    expect(problems).toContain('backend.needs')
    expect(problems).toContain('arbiter')
    expect(problems).toContain('deals roles')
  })

  test('wanting one is not needing one, which is the whole distinction', () => {
    expect(problemsOf(dealing({ wants: ['arbiter'] })).length).toBeGreaterThan(0)
  })

  test('needing one parses', () => {
    expect(parseXp(dealing({ needs: ['arbiter'] })).ok).toBe(true)
  })

  test('a vote counts too, without a deck anywhere', () => {
    const problems = problemsOf(
      doc({
        blueprints: {
          alarm: { model: 'proto/Primitive_Cube', triggers: [{ on: 'pressed', key: 'use', do: [{ op: 'meet' }] }] },
        },
        entities: [{ blueprint: 'alarm', x: 0, y: 1, z: 0 }],
      }),
    ).join('\n')
    expect(problems).toContain('calls a vote')
  })

  /**
   * The line this rule deliberately does not cross.
   *
   * A dice from this tab's own random is honest for somebody playing alone and
   * dishonest at a table, and `wants` cannot say *fine alone, not fine with
   * company* — so refusing every solo level that rolls would be a worse rule
   * than the one it replaced. `mensch` is the document this protects.
   */
  test('a dice and a pass are not enough to force it', () => {
    const parsed = parseXp(
      doc({
        data: { dice: { scope: 'shared', value: 0 } },
        blueprints: {
          die: {
            model: 'proto/Primitive_Cube',
            triggers: [
              { on: 'pressed', key: 'use', do: [{ op: 'roll', key: 'dice', sides: 6 }, { op: 'pass' }] },
            ],
          },
        },
        entities: [{ blueprint: 'die', x: 0, y: 1, z: 0 }],
      }),
    )
    expect(parsed.ok).toBe(true)
  })
})

/**
 * The tilt and the per-axis size, and the promise both of them make.
 *
 * Every field here is optional and additive, so the property under test is not
 * that they work - it is that **a document that never mentions them is exactly
 * the document it was**. The editor writes a parsed document straight back out,
 * so a field that appears on save is a format change everybody notices, and
 * this format has been caught doing it once already (`enter`, which was emitted
 * unconditionally while its own comment claimed otherwise).
 */
describe('pitch, roll and stretch', () => {
  const parsed = (raw: unknown) => {
    const result = parseXp(raw)
    if (!result.ok) throw new Error(describeProblems(result.problems))
    return result.document
  }

  test('a document that says none of it round-trips byte for byte', () => {
    const before = doc({
      world: {
        floorY: 0,
        placements: [
          { model: 'proto/Primitive_Floor', x: 0, y: 0, z: 0 },
          { model: 'proto/Primitive_Wall', x: 4, y: 0, z: 0, rotation: 90, scale: 2 },
        ],
      },
      blueprints: { crate: { model: 'proto/Box_A' } },
      entities: [{ blueprint: 'crate', name: 'one', x: 1, y: 0, z: 1 }],
    })

    const once = parsed(before)
    const twice = parsed(JSON.parse(JSON.stringify(once)))
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once))

    // Named rather than implied: not one of the four fields exists on the way
    // out. `toEqual` would pass with `pitch: undefined` present as a key, which
    // is a key `JSON.stringify` drops and `Object.keys` does not.
    for (const piece of once.world.placements) {
      expect(Object.keys(piece).sort()).toEqual(['model', 'rotation', 'scale', 'x', 'y', 'z'])
    }
    expect('pitch' in once.entities[0]).toBe(false)
    expect('stretch' in once.entities[0]).toBe(false)
  })

  test('what is written comes back, on a placement and on an entity alike', () => {
    const document = parsed(
      doc({
        world: {
          floorY: 0,
          placements: [
            { model: 'proto/Primitive_Floor', x: 0, y: 0, z: 0, pitch: 30, roll: -15, stretch: { x: 3 } },
          ],
        },
        blueprints: { crate: { model: 'proto/Box_A' } },
        entities: [{ blueprint: 'crate', x: 0, y: 0, z: 0, pitch: 45, stretch: { y: 2, z: 0.5 } }],
      }),
    )
    expect(document.world.placements[0].pitch).toBe(30)
    expect(document.world.placements[0].roll).toBe(-15)
    expect(document.world.placements[0].stretch).toEqual({ x: 3 })
    expect(document.entities[0].pitch).toBe(45)
    expect(document.entities[0].stretch).toEqual({ y: 2, z: 0.5 })
  })

  /**
   * Absent already means level and already means unstretched, so keeping the
   * explicit spelling would make a document that says `"pitch": 0` round-trip
   * differently from the identical one that stays quiet. Two spellings of one
   * state is how a round trip grows a field nobody wrote.
   */
  test('a zero angle and a multiplier of one are absence, not values', () => {
    const document = parsed(
      doc({
        world: {
          floorY: 0,
          placements: [
            { model: 'proto/Primitive_Floor', x: 0, y: 0, z: 0, pitch: 0, roll: 0, stretch: { x: 1, y: 1, z: 1 } },
          ],
        },
      }),
    )
    const piece = document.world.placements[0]
    expect('pitch' in piece).toBe(false)
    expect('roll' in piece).toBe(false)
    expect('stretch' in piece).toBe(false)
  })

  test('an axis that means something is kept while its neighbours disappear', () => {
    const document = parsed(
      doc({
        world: {
          floorY: 0,
          placements: [{ model: 'proto/Primitive_Floor', x: 0, y: 0, z: 0, stretch: { x: 1, y: 4 } }],
        },
      }),
    )
    expect(document.world.placements[0].stretch).toEqual({ y: 4 })
  })

  test('an angle that is not a number is refused, and says which one', () => {
    expect(
      problemsOf(
        doc({
          world: {
            floorY: 0,
            placements: [{ model: 'proto/Primitive_Floor', x: 0, y: 0, z: 0, pitch: 'up' }],
          },
        }),
      ),
    ).toEqual(['world.placements[0].pitch: not a number'])
  })

  /**
   * The same rule `scale` follows, for the same reason: a zero multiplier is a
   * thing with no size that still stops you at its corner, and a negative one
   * is a model turned inside out.
   */
  test('a multiplier of zero or less is refused', () => {
    expect(
      problemsOf(
        doc({
          world: {
            floorY: 0,
            placements: [{ model: 'proto/Primitive_Floor', x: 0, y: 0, z: 0, stretch: { x: 0, z: -2 } }],
          },
        }),
      ),
    ).toEqual([
      'world.placements[0].stretch.x: must be a positive number',
      'world.placements[0].stretch.z: must be a positive number',
    ])
  })

  test('a stretch that is not an object is refused rather than ignored', () => {
    expect(
      problemsOf(
        doc({
          world: {
            floorY: 0,
            placements: [{ model: 'proto/Primitive_Floor', x: 0, y: 0, z: 0, stretch: 2 }],
          },
        }),
      ),
    ).toEqual(['world.placements[0].stretch: not an object'])
  })
})

describe('what a sign says', () => {
  const parsed = (raw: unknown) => {
    const result = parseXp(raw)
    if (!result.ok) throw new Error(describeProblems(result.problems))
    return result.document
  }

  test('what is written comes back', () => {
    const document = parsed(
      doc({
        blueprints: { post: { model: 'proto/Primitive_Wall' } },
        entities: [
          { blueprint: 'post', x: 0, y: 0, z: 0, text: 'do not feed the crates', colour: 0xff0000, background: 0x000000 },
        ],
      }),
    )
    expect(document.entities[0].text).toBe('do not feed the crates')
    expect(document.entities[0].colour).toBe(0xff0000)
    expect(document.entities[0].background).toBe(0x000000)
  })

  // Absent already means "nothing to read", so an empty string round-tripping
  // to the same absence keeps there being one way to say nothing rather than
  // two - the same argument `pitch: 0` loses above.
  test('an empty string is absence, not a blank sign', () => {
    const document = parsed(
      doc({
        blueprints: { post: { model: 'proto/Primitive_Wall' } },
        entities: [{ blueprint: 'post', x: 0, y: 0, z: 0, text: '' }],
      }),
    )
    expect('text' in document.entities[0]).toBe(false)
  })

  test('longer than the limit is refused, and says by how much', () => {
    const long = 'x'.repeat(MAX_SIGN_TEXT_LENGTH + 1)
    expect(
      problemsOf(
        doc({
          blueprints: { post: { model: 'proto/Primitive_Wall' } },
          entities: [{ blueprint: 'post', x: 0, y: 0, z: 0, text: long }],
        }),
      ),
    ).toEqual([`entities[0].text: ${long.length} characters, over the ${MAX_SIGN_TEXT_LENGTH} limit`])
  })

  test('exactly at the limit is fine', () => {
    const full = 'x'.repeat(MAX_SIGN_TEXT_LENGTH)
    const document = parsed(
      doc({
        blueprints: { post: { model: 'proto/Primitive_Wall' } },
        entities: [{ blueprint: 'post', x: 0, y: 0, z: 0, text: full }],
      }),
    )
    expect(document.entities[0].text).toBe(full)
  })

  test('text that is not a string is refused', () => {
    expect(
      problemsOf(
        doc({
          blueprints: { post: { model: 'proto/Primitive_Wall' } },
          entities: [{ blueprint: 'post', x: 0, y: 0, z: 0, text: 42 }],
        }),
      ),
    ).toEqual(['entities[0].text: must be a string'])
  })

  test('a colour outside the cube is refused, the same way a lamp’s is', () => {
    expect(
      problemsOf(
        doc({
          blueprints: { post: { model: 'proto/Primitive_Wall' } },
          entities: [{ blueprint: 'post', x: 0, y: 0, z: 0, colour: 0x1000000 }],
        }),
      ),
    ).toEqual(['entities[0].colour: must be a whole colour from 0 to 0xffffff'])
  })

  test('a background follows the same rule, by its own name', () => {
    expect(
      problemsOf(
        doc({
          blueprints: { post: { model: 'proto/Primitive_Wall' } },
          entities: [{ blueprint: 'post', x: 0, y: 0, z: 0, background: -1 }],
        }),
      ),
    ).toEqual(['entities[0].background: must be a whole colour from 0 to 0xffffff'])
  })
})

/**
 * What is under the world, as four answers to one question.
 *
 * A solid plane, a catch forty cells down, a walk back, and a death. The
 * refusals are the interesting part: two of the four cannot be combined, and a
 * document that says both has not said which it means.
 */
describe('falling', () => {
  const world = (over: Record<string, unknown>) => ({
    format: XP_FORMAT,
    id: 'x',
    name: 'X',
    packs: [{ id: 'proto' }],
    world: { floorY: 0, placements: [], marks: [], ...over },
  })

  const problemsOf = (raw: unknown) => {
    const result = parseXp(raw)
    return result.ok ? [] : result.problems.map((p) => `${p.at}: ${p.message}`)
  }

  test('absent is false, which is every level written before it', () => {
    const parsed = parseXp(world({}))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.document.world.fatal).toBe(false)
  })

  test('a fall can be declared a death', () => {
    const parsed = parseXp(world({ fatal: true }))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.document.world.fatal).toBe(true)
  })

  test('nothing falls past solid ground, so the pair is refused', () => {
    // The same refusal `restart` already gets, and for the same reason: an
    // author setting it would be setting a rule that can never fire.
    expect(problemsOf(world({ ground: true, fatal: true }))).toEqual([
      'world.fatal: nothing can fall past solid ground - turn world.ground off, or fatal off',
    ])
  })

  test('and a fall is one thing or the other', () => {
    /**
     * Both describe what happens when somebody falls, so a document carrying
     * both has not said which it means. Picking one here would be inventing an
     * intention, and the author would find out which was ignored by watching
     * somebody die or not die.
     */
    expect(problemsOf(world({ restart: true, fatal: true }))).toEqual([
      'world.fatal: a fall is one thing or the other - turn world.restart off to make it a death',
    ])
  })

  test('a value that is not a boolean says so', () => {
    expect(problemsOf(world({ fatal: 'yes' }))).toEqual(['world.fatal: must be true or false'])
  })
})

/**
 * What a level keeps, and the rules that reach it — docs/xp/backlog.md §7c.
 *
 * The block itself is checked in ./data.test.ts; these are the two things only
 * the whole parser can answer: that a rule may name the world, and that a rule
 * naming a field nobody declared is refused rather than silently doing nothing.
 */
describe('a level that keeps something', () => {
  const withRule = (over: Record<string, unknown>, verb: unknown) =>
    doc({
      ...over,
      blueprints: {
        chest: {
          model: 'proto/Primitive_Floor',
          triggers: [{ on: 'enter', do: [verb] }],
        },
      },
    })

  const parsed = (raw: unknown) => {
    const result = parseXp(raw)
    if (!result.ok) throw new Error(result.problems.map((p) => `${p.at}: ${p.message}`).join('\n'))
    return result.document
  }

  test('a declared field survives the parse', () => {
    const document = parsed(doc({ data: { coins: { scope: 'player', value: 0 } } }))
    expect(document.data).toEqual({ coins: { scope: 'player', value: 0 } })
  })

  test('a level that keeps nothing does not grow the block', () => {
    // The trap this format has met with `rules`, `camera`, `backend` and
    // `enter`: the editor writes a parsed document straight back out, so a
    // materialised default appears in every file somebody opens and saves.
    expect(parsed(doc()).data).toBeUndefined()
    expect(parsed(doc({ data: {} })).data).toBeUndefined()
  })

  test('a rule may add to a field the level declared', () => {
    const document = parsed(
      withRule(
        { data: { coins: { scope: 'player', value: 0 } } },
        { op: 'addProp', key: 'coins', value: 1, target: 'world' },
      ),
    )
    expect(document.blueprints.chest.triggers[0].do[0]).toEqual({
      op: 'addProp',
      key: 'coins',
      value: 1,
      target: 'world',
    })
  })

  test('a rule naming a field nobody declared is refused, by name', () => {
    // The reason to declare a model at all: a rule states its key statically,
    // so a typo is something the parser can see. The same typo against an
    // entity's own props is a property that springs into existence at zero.
    const problems = problemsOf(
      withRule(
        { data: { coins: { scope: 'player', value: 0 } } },
        { op: 'addProp', key: 'coin', value: 1, target: 'world' },
      ),
    )
    expect(problems).toContain('data: a rule reads or writes "coin", which this level does not declare')
  })

  test('a condition about an undeclared field is refused too', () => {
    const problems = problemsOf(
      doc({
        data: { coins: { scope: 'player', value: 0 } },
        blueprints: {
          gate: {
            model: 'proto/Primitive_Floor',
            triggers: [
              {
                on: 'enter',
                when: { of: 'world', prop: 'keys', is: '>=', value: 1 },
                do: [{ op: 'score', amount: 1 }],
              },
            ],
          },
        },
      }),
    )
    expect(problems).toContain('data: a rule reads or writes "keys", which this level does not declare')
  })

  test('a level with no data block refuses any rule that reaches for one', () => {
    const problems = problemsOf(withRule({}, { op: 'setProp', key: 'coins', value: 1, target: 'world' }))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('does not declare')
  })

  test('only setProp and addProp may name the world', () => {
    // `pick` answers null for it, so anything else would be a rule that quietly
    // does nothing — the failure a closed verb vocabulary exists to refuse.
    for (const op of ['damage', 'heal', 'despawn', 'carry']) {
      const problems = problemsOf(
        withRule({ data: { coins: { scope: 'player', value: 0 } } }, { op, amount: 1, target: 'world' }),
      )
      expect(problems.some((p) => p.includes('only setProp and addProp may name it'))).toBe(true)
    }
  })

  test('a target nobody has heard of is still refused', () => {
    const problems = problemsOf(withRule({}, { op: 'setProp', key: 'x', value: 1, target: 'nobody' }))
    expect(problems.some((p) => p.includes('must be "self", "other" or "world"'))).toBe(true)
  })
})

/**
 * The collider override, at the boundary.
 *
 * Everything here is about the two ways a hand-written one can be wrong in a
 * way that reads as working: a state with two spellings, and a box with a side
 * of zero - which rounds to a cell anyway and becomes a wall you cannot see.
 */
describe('a placement collider', () => {
  const withCollider = (collider: unknown) =>
    doc({
      world: {
        floorY: 0,
        placements: [{ model: 'proto/Primitive_Wall', x: 0, y: 0, z: 0, collider }],
      },
    })

  test('absent stays absent, so no document already on disk grows a field', () => {
    const result = parseXp(doc())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect('collider' in result.document.world.placements[0]).toBe(false)
  })

  test('"none" survives the parse', () => {
    const result = parseXp(withCollider('none'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.document.world.placements[0].collider).toBe('none')
  })

  test('a list of boxes survives it, offsets and all', () => {
    const result = parseXp(withCollider([{ x: -2, y: 0, z: -0.5, w: 1, h: 4, d: 1 }]))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.document.world.placements[0].collider).toEqual([
      { x: -2, z: -0.5, w: 1, h: 4, d: 1 },
    ])
  })

  test('a zero offset is dropped, for the reason a zero pitch is', () => {
    // Two spellings of one state is how a round trip grows a key nobody wrote.
    const result = parseXp(withCollider([{ x: 0, y: 0, z: 0, w: 1, h: 1, d: 1 }]))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.document.world.placements[0].collider).toEqual([{ w: 1, h: 1, d: 1 }])
  })

  test('an empty list is refused rather than read as "none"', () => {
    expect(problemsOf(withCollider([]))).toContain(
      'world.placements[0].collider: no boxes - write "none" to walk through it',
    )
  })

  test('a box with no volume is refused', () => {
    // It would round to a cell and stop you at it: a wall with nothing drawn
    // where it is, which is the hardest kind of level bug to see.
    for (const bad of [{ w: 0, h: 1, d: 1 }, { w: 1, h: -1, d: 1 }, { w: 1, h: 1 }]) {
      expect(problemsOf(withCollider([bad]))).toContain(
        'world.placements[0].collider[0]: needs positive w, h and d',
      )
    }
  })

  test('anything that is not "none" or a list is refused', () => {
    for (const bad of ['auto', { w: 1, h: 1, d: 1 }, true]) {
      expect(problemsOf(withCollider(bad))).toContain(
        'world.placements[0].collider: must be "none" or a list of boxes',
      )
    }
  })

  test('a mesh rebuilt a box at a time is refused, with the count', () => {
    const many = Array.from({ length: 9 }, () => ({ w: 1, h: 1, d: 1 }))
    expect(problemsOf(withCollider(many))).toContain(
      'world.placements[0].collider: 9 boxes, over the 8 limit',
    )
  })
})

/**
 * A hit that is not the same size every time.
 *
 * Both ways of getting a range wrong are silent at runtime and obvious on the
 * page, which is why the parser owns them rather than ./verbs shrugging: a
 * ceiling under the floor is a range nothing can be drawn from, and a
 * fractional end is a swing that takes 13.4 off somebody.
 */
describe('a damage with a range on it', () => {
  const withVerb = (verb: Record<string, unknown>) =>
    parseXp({
      format: XP_FORMAT,
      id: 'x',
      name: 'X',
      packs: [{ id: 'proto' }],
      world: { floorY: 0, placements: [], marks: [] },
      blueprints: {
        bag: {
          model: 'proto/Dummy_Base',
          props: { hp: 100 },
          triggers: [{ on: 'damaged', do: [verb] }],
        },
      },
    })

  test('both ends survive the round trip', () => {
    const parsed = withVerb({ op: 'damage', target: 'self', amount: 10, upTo: 20 })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.document.blueprints.bag!.triggers![0]!.do[0]).toEqual({
      op: 'damage',
      target: 'self',
      amount: 10,
      upTo: 20,
    })
  })

  test('a ceiling under the floor is refused, not quietly swapped', () => {
    const parsed = withVerb({ op: 'damage', target: 'self', amount: 20, upTo: 10 })
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.problems.some((problem) => problem.at.endsWith('.upTo'))).toBe(true)
  })

  test('and so is a fraction at either end', () => {
    expect(withVerb({ op: 'damage', target: 'self', amount: 10, upTo: 20.5 }).ok).toBe(false)
    expect(withVerb({ op: 'damage', target: 'self', amount: 9.5, upTo: 20 }).ok).toBe(false)
  })

  test('a range of one is written back as the number it is', () => {
    // Not an error: `10 upTo 10` is a reasonable thing to type on the way to
    // `10 upTo 20`, and it means exactly what a plain ten means.
    const parsed = withVerb({ op: 'damage', target: 'self', amount: 10, upTo: 10 })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.document.blueprints.bag!.triggers![0]!.do[0]).toEqual({
      op: 'damage',
      target: 'self',
      amount: 10,
    })
  })

  test('no upTo at all is the verb every document already had', () => {
    const parsed = withVerb({ op: 'heal', target: 'self', amount: 5 })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.document.blueprints.bag!.triggers![0]!.do[0]).toEqual({
      op: 'heal',
      target: 'self',
      amount: 5,
    })
  })
})

/**
 * A rule that plays a clip, through the door.
 *
 * The name is unchecked against any pack on purpose - this package does not
 * know which glTFs a host loaded, the same contract `blueprint.pose` has - so
 * what the parser owes is the shapes that are obviously not a request.
 */
describe('an animate verb', () => {
  const withVerb = (verb: Record<string, unknown>) =>
    parseXp({
      format: XP_FORMAT,
      id: 'x',
      name: 'X',
      packs: [{ id: 'proto' }, { id: 'dummy' }],
      world: { floorY: 0, placements: [], marks: [] },
      blueprints: {
        guard: { model: 'dummy/Dummy', triggers: [{ on: 'enter', do: [verb] }] },
      },
    })

  const verbOf = (parsed: ReturnType<typeof parseXp>) =>
    parsed.ok ? parsed.document.blueprints.guard!.triggers![0]!.do[0] : null

  test('a clip on its own is the whole body', () => {
    expect(verbOf(withVerb({ op: 'animate', target: 'self', clip: 'Cheer' }))).toEqual({
      op: 'animate',
      target: 'self',
      clip: 'Cheer',
    })
  })

  test('with parts it carries them, and with loop it carries that', () => {
    expect(
      verbOf(withVerb({ op: 'animate', target: 'self', clip: 'Wave', loop: true, parts: ['arms'] })),
    ).toEqual({ op: 'animate', target: 'self', clip: 'Wave', loop: true, parts: ['arms'] })
  })

  test('a nameless clip is refused, because it is a half-filled row', () => {
    expect(withVerb({ op: 'animate', target: 'self', clip: '' }).ok).toBe(false)
    expect(withVerb({ op: 'animate', target: 'self' }).ok).toBe(false)
  })

  test('and an empty parts list is refused rather than read as "all of them"', () => {
    /**
     * `"parts": []` reads as *no parts* to whoever wrote it, and silently
     * turning that into *every part* is the widest disagreement a document can
     * have with its author.
     */
    expect(withVerb({ op: 'animate', target: 'self', clip: 'Wave', parts: [] }).ok).toBe(false)
  })

  test('a paragraph is not a clip name', () => {
    expect(withVerb({ op: 'animate', target: 'self', clip: 'W'.repeat(200) }).ok).toBe(false)
  })
})

/**
 * What a visitor may take out of a world that is not theirs.
 *
 * docs/xp/server-authority.md §4.3. Read more strictly than any other block
 * here, and the reason is that this one is not only read by this package: the
 * database reads it off the published version and acts on it, with the owner of
 * the world offline and nobody in the room to notice a wrong number.
 */
describe('the visiting block', () => {
  const visiting = (visit: unknown, extra: Record<string, unknown> = {}) =>
    doc({
      data: { coins: { scope: 'player', value: 0 } },
      backend: { needs: ['arbiter'] },
      visit,
      ...extra,
    })

  test('a whole block survives being read', () => {
    const parsed = parseXp(visiting({ take: 'coins', amount: 1, cooldown: 300 }))
    expect(parsed.ok && parsed.document.visit).toEqual({ take: 'coins', amount: 1, cooldown: 300 })
  })

  test('absent stays absent, which is every level written so far', () => {
    const parsed = parseXp(doc())
    expect(parsed.ok && 'visit' in parsed.document).toBe(false)
  })

  test('it takes a field this level declares', () => {
    const problems = problemsOf(visiting({ take: 'gold', amount: 1, cooldown: 60 })).join('\n')
    expect(problems).toContain('does not declare')
  })

  /**
   * The check that is about the *shape* of a steal rather than about a typo:
   * one row goes down and another goes up, and a space field has one row.
   */
  test('a space field cannot be taken, because there is nobody to take it from', () => {
    const problems = problemsOf(
      doc({
        data: { pot: { scope: 'space', value: 0 } },
        visit: { take: 'pot', amount: 1, cooldown: 60 },
      }),
    ).join('\n')
    expect(problems).toContain('nobody to take it from')
  })

  /**
   * And `shared` is not only allowed, it is the ordinary case: it is the scope
   * that lets a visitor *see* there is something to take. `steal-a-plant` keeps
   * every shelf in it for exactly that reason.
   */
  test('a shared field is takeable, which is how anybody knows there is anything there', () => {
    const parsed = parseXp(
      doc({
        data: { shelf: { scope: 'shared', value: 0 } },
        visit: { take: 'shelf', amount: 1, cooldown: 60 },
      }),
    )
    expect(parsed.ok && parsed.document.visit?.take).toBe('shelf')
  })

  test('a cooldown is required, because a level without one stops being played', () => {
    const problems = problemsOf(visiting({ take: 'coins', amount: 1 })).join('\n')
    expect(problems).toContain('visit.cooldown')
  })

  test('an amount below one or above the cap is refused', () => {
    for (const amount of [0, -3, MAX_VISIT_AMOUNT + 1, 1.5]) {
      expect(problemsOf(visiting({ take: 'coins', amount, cooldown: 60 })).length).toBeGreaterThan(0)
    }
  })

  /**
   * The rule this block is deliberately *not* under, and it was under it for an
   * hour. A level whose shelves cannot be raided is a lesser game rather than a
   * broken one — the `roll` case — where a level that cannot deal is a room in
   * which nothing at all can happen.
   */
  test('and it does not force an arbiter, because a level nobody can raid still plays', () => {
    const parsed = parseXp(
      doc({
        data: { coins: { scope: 'player', value: 0 } },
        visit: { take: 'coins', amount: 1, cooldown: 60 },
      }),
    )
    expect(parsed.ok).toBe(true)
  })
})

/**
 * The words block.
 *
 * Refused rather than repaired throughout, which is the argument in ./words: a
 * translation is a promise to somebody who cannot check it, so a phrase quietly
 * dropped here is a sentence that comes out in the wrong language in front of
 * the one person unable to tell it was meant to be different.
 */
describe('what a level says in another language', () => {
  const words = { de: { 'the gate is locked': 'das Tor ist verschlossen' } }

  test('parses, and comes back out as it went in', () => {
    const result = parseXp(doc({ words }))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.document.words).toEqual(words)
  })

  /**
   * The same rule `talk`, `rules` and `camera` follow. A block that says what
   * absence already says would appear in every file anybody opened and saved.
   */
  test('a block with no languages in it is left off', () => {
    const result = parseXp(doc({ words: {} }))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.document.words).toBeUndefined()
  })

  test('a language with no phrases in it is left off too', () => {
    const result = parseXp(doc({ words: { de: {} } }))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.document.words).toBeUndefined()
  })

  test('a key that is not a language code is refused by name', () => {
    expect(problemsOf(doc({ words: { German: { a: 'b' } } }))).toEqual([
      'words.German: not a language code, like "de" or "pt-BR"',
    ])
  })

  test('a translation that is not a string is refused', () => {
    expect(problemsOf(doc({ words: { de: { hello: 3 } } }))).toEqual([
      'words.de["hello"]: not a string',
    ])
  })

  /**
   * An empty string is refused rather than read as "no translation". They are
   * different intentions and only one is ever meant - a blank that reached the
   * file would draw nothing where a sentence was.
   */
  test('an empty translation is refused rather than ignored', () => {
    expect(problemsOf(doc({ words: { de: { hello: '' } } }))).toEqual([
      'words.de["hello"]: empty - remove it instead',
    ])
  })

  test('the whole block has to be an object', () => {
    expect(problemsOf(doc({ words: 'de' }))).toEqual(['words: not an object'])
  })

  test('so does each language', () => {
    expect(problemsOf(doc({ words: { de: 'hallo' } }))).toEqual(['words.de: not an object'])
  })
})

describe('the mode a level says it is', () => {
  const level = (rules: Record<string, unknown>) =>
    parseXp({
      format: XP_FORMAT,
      id: 'x',
      name: 'X',
      packs: [{ id: 'proto' }],
      world: { floorY: 0, placements: [] },
      rules,
    })

  test('a word that is not one of the three is refused, and named', () => {
    // The guard `preset` has, for its reason: a mode the runtime has never
    // heard of is a document that loads, looks finished, and has no rounds.
    const parsed = level({ preset: 'freestyle', mode: 'lobbies' })
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.problems.map((p) => p.at)).toContain('rules.mode')
  })

  test('and one that is comes back on the document', () => {
    const parsed = level({ preset: 'shooter', mode: 'lobby' })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.document.rules?.mode).toBe('lobby')
  })

  test('a block that never mentions it stays a block that never mentions it', () => {
    // Not materialised, so a level that predates the field round-trips through
    // the editor as the document it was.
    const parsed = level({ preset: 'shooter' })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.document.rules).not.toHaveProperty('mode')
  })
})

describe('a round per mode', () => {
  const one = { start: 'go', phases: { go: { allow: [], next: [] } } }
  const level = (extra: Record<string, unknown>) =>
    parseXp({
      format: XP_FORMAT,
      id: 'x',
      name: 'X',
      packs: [{ id: 'proto' }],
      world: { floorY: 0, placements: [] },
      ...extra,
    })

  test('a mode may keep its own, beside the level’s', () => {
    const parsed = level({ flow: one, flows: { battle: one } })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.document.flows?.battle).toBeDefined()
  })

  test('a key that is not a mode is refused rather than ignored', () => {
    // A round written under a name nothing will ever play is exactly the
    // failure this parser exists to turn into a sentence.
    const parsed = level({ flow: one, flows: { lobbies: one } })
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.problems.map((p) => p.at)).toContain('flows.lobbies')
  })

  test('and a problem inside one names the mode whose round it is', () => {
    // Otherwise it is reported against `flow` and somebody goes looking in the
    // wrong half of their file.
    const parsed = level({ flow: one, flows: { battle: { start: '', phases: {} } } })
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.problems.some((p) => p.at.startsWith('flows.battle'))).toBe(true)
  })

  test('a document with no flows block does not grow one', () => {
    const parsed = level({ flow: one })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.document).not.toHaveProperty('flows')
  })
})

describe('a round that names the place it is played in', () => {
  const phases = { go: { allow: [], next: [] } }
  const room = { world: { floorY: 0, placements: [] }, spawn: { x: 0, y: 1, z: 0, facing: 0 } }
  const level = (extra: Record<string, unknown>) =>
    parseXp({
      format: XP_FORMAT,
      id: 'x',
      name: 'X',
      packs: [{ id: 'proto' }],
      world: { floorY: 0, placements: [] },
      ...extra,
    })

  test('a scene the document has is kept', () => {
    const parsed = level({ scenes: { arena: room }, flow: { start: 'go', phases, scene: 'arena' } })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.document.flow?.scene).toBe('arena')
  })

  test('and one it does not have is refused, naming the round it is on', () => {
    // A round that jumps to a room the document does not have is a level that
    // starts and then goes nowhere, with nothing on any console to say why.
    const parsed = level({ scenes: { arena: room }, flow: { start: 'go', phases, scene: 'foyer' } })
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.problems.map((p) => p.at)).toContain('flow.scene')
  })

  test('a per-mode round names its own place, and says which round is wrong', () => {
    const parsed = level({
      scenes: { arena: room },
      flow: { start: 'go', phases },
      flows: { battle: { start: 'go', phases, scene: 'nowhere' } },
    })
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.problems.map((p) => p.at)).toContain('flows.battle.scene')
  })

  test('a door is not a place a round can be played in', () => {
    // `scenes` holds both - a string is somewhere else, an object is a place
    // here - and a round sent through a door is a round that leaves.
    const parsed = level({
      scenes: { away: 'https://example.test/other.xp.json' },
      flow: { start: 'go', phases, scene: 'away' },
    })
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.problems.some((p) => p.at === 'flow.scene')).toBe(true)
  })

  test('a round that names nowhere does not move anybody', () => {
    const parsed = level({ flow: { start: 'go', phases } })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.document.flow).not.toHaveProperty('scene')
  })
})

describe('finish', () => {
  /**
   * The shelf's own field, and the round-trip rule the whole format follows.
   *
   * The interesting case is the last one: a document that never said anything
   * about its cartridge must come back out without a `finish` key. Materialising
   * the default would put a line in the next diff of every level anybody opens,
   * which is the argument `rules`, `camera` and `backend` each make in their own
   * comments.
   */
  const of = (finish: unknown) => doc(finish === undefined ? {} : { finish })

  test('keeps a finish it recognises', () => {
    const parsed = parseXp(of('galaxy'))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.document.finish).toBe('galaxy')
  })

  test('refuses one it does not, rather than falling back to plastic', () => {
    // A misspelling is somebody who meant something. Answering `plastic`
    // quietly would leave them looking at the default wondering which of the
    // seven they typed wrong.
    const parsed = parseXp(of('galaxxy'))
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.problems.some((p) => p.at === 'finish')).toBe(true)
  })

  test('a document that never said carries no key', () => {
    const parsed = parseXp(of(undefined))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect('finish' in parsed.document).toBe(false)
  })
})

describe('hue', () => {
  /**
   * The shell's colour, which is a number on the wheel and not a colour.
   *
   * Zero is the case worth having a test for: it is red, it is falsy, and every
   * "did they say?" check in the chain has to be a presence check rather than a
   * truthiness one. A document asking for red must not come back out asking for
   * nothing.
   */
  const of = (hue: unknown) => doc(hue === undefined ? {} : { hue })

  test('keeps a hue on the wheel', () => {
    const parsed = parseXp(of(280))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.document.hue).toBe(280)
  })

  test('zero is red, not silence', () => {
    const parsed = parseXp(of(0))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.document.hue).toBe(0)
      expect('hue' in parsed.document).toBe(true)
    }
  })

  test('refuses past the wheel rather than folding it round', () => {
    // 400 is somebody who thinks the wheel is something other than it is.
    // Quietly folding it to 40 gives them an orange cartridge and no reason.
    for (const bad of [360, 400, -1, 12.5, '200']) {
      const parsed = parseXp(of(bad))
      expect(parsed.ok).toBe(false)
      if (!parsed.ok) expect(parsed.problems.some((p) => p.at === 'hue')).toBe(true)
    }
  })

  test('a document that never said carries no key', () => {
    const parsed = parseXp(of(undefined))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect('hue' in parsed.document).toBe(false)
  })
})
