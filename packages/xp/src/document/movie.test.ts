import { describe, expect, test } from 'bun:test'
import { parseXp, XP_FORMAT, type EntitySpec } from './format'
import { applyVerbs } from '../rules/verbs'
import { spawnEntities } from '../world/entities'
import {
  cuesAt,
  DEFAULT_CAMERA,
  dropKey,
  emptyTimeline,
  framingAt,
  frameTimes,
  liveCamera,
  linesAt,
  posedAt,
  propOfProperty,
  propertyOfProp,
  putKey,
  sampleKeys,
  sayingAt,
  stageAt,
  type Key,
  type MovieCamera,
  type XpAction,
  type XpTimeline,
} from './movie'

/**
 * A movie is a scene with a time axis through it.
 *
 * Everything here is a question a screenshot cannot answer - "does the camera
 * arrive at the second framing", "is the crate still there at four seconds" -
 * which is exactly why the sampler is a pure function of a document and a
 * number. The Browser pane never fires a frame; this is the only verification
 * this feature is ever going to get.
 */

const entity = (over: Partial<EntitySpec> = {}): EntitySpec => ({
  blueprint: 'crate',
  name: 'box',
  x: 0,
  y: 0,
  z: 0,
  rotation: 0,
  scale: 1,
  props: {},
  ...over,
})

const timeline = (over: Partial<XpTimeline> = {}): XpTimeline => ({ ...emptyTimeline(), ...over })

describe('a key, sampled', () => {
  const keys: Key[] = [
    { t: 1, value: 0, ease: 'linear' },
    { t: 3, value: 10, ease: 'linear' },
  ]

  test('before the first key it is the node own value, not the first key', () => {
    // The asymmetry scenes.md §2.2 asks by name to survive the copy: a key at 1
    // means "be different from 1 onwards", and holding it backwards would make
    // it rewrite every moment before it.
    expect(sampleKeys(keys, 0, 7)).toBe(7)
    expect(sampleKeys(keys, 0.99, 7)).toBe(7)
  })

  test('holds after the last key rather than extrapolating', () => {
    expect(sampleKeys(keys, 3, 7)).toBe(10)
    expect(sampleKeys(keys, 99, 7)).toBe(10)
  })

  test('travels between them', () => {
    expect(sampleKeys(keys, 2, 7)).toBeCloseTo(5)
  })

  test('a hold ease is a step, not a ramp', () => {
    const held: Key[] = [
      { t: 0, value: 0, ease: 'hold' },
      { t: 2, value: 1, ease: 'linear' },
    ]
    expect(sampleKeys(held, 1.99, 0)).toBe(0)
    expect(sampleKeys(held, 2, 0)).toBe(1)
  })

  test('two keys at one instant is a step and not a NaN', () => {
    const stacked: Key[] = [
      { t: 1, value: 0, ease: 'linear' },
      { t: 1, value: 5, ease: 'linear' },
    ]
    expect(Number.isNaN(sampleKeys(stacked, 1, 0))).toBe(false)
  })

  test('a key replaces one at the same instant rather than stacking', () => {
    const once = putKey(keys, { t: 3.001, value: 99, ease: 'hold' })
    expect(once).toHaveLength(2)
    expect(once[1]!.value).toBe(99)
  })

  test('dropping the last key on a property drops the property', () => {
    const tracks = { x: [{ t: 0, value: 1, ease: 'linear' as const }] }
    expect(Object.keys(dropKey(tracks, 'x', 0))).toEqual([])
  })
})

describe('an entity, posed', () => {
  test('is untouched when the timeline says nothing about it', () => {
    const one = entity({ x: 4 })
    expect(posedAt(one, timeline(), 2).entity).toBe(one)
  })

  test('takes its keyed properties and keeps the rest', () => {
    const posed = posedAt(
      entity({ x: 4, z: 9 }),
      timeline({ tracks: { box: { x: [{ t: 0, value: 0, ease: 'linear' }, { t: 2, value: 10, ease: 'linear' }] } } }),
      1,
    )
    expect(posed.entity.x).toBeCloseTo(5)
    expect(posed.entity.z).toBe(9)
  })

  test('a visible track keys it off, and half a key is shown', () => {
    const gone = timeline({
      tracks: { box: { visible: [{ t: 2, value: 0, ease: 'hold' }] } },
    })
    expect(posedAt(entity(), gone, 1.9).visible).toBe(true)
    expect(posedAt(entity(), gone, 2).visible).toBe(false)
  })

  test('a blueprint property is reachable through the same bag', () => {
    const opening = timeline({
      tracks: {
        box: {
          [propertyOfProp('angle')]: [
            { t: 0, value: 0, ease: 'linear' },
            { t: 1, value: 90, ease: 'linear' },
          ],
        },
      },
    })
    const posed = posedAt(entity({ props: { angle: 0 } }), opening, 0.5)
    expect(posed.entity.props.angle).toBeCloseTo(45)
  })

  test('a declared property the entity never overrode is still keyed', () => {
    // `props` on a placed entity is overrides, so the bag is usually empty. The
    // symptom when this was skipped was a door keyed open in the panel that
    // stayed shut in the movie - silently, because nobody had typed its angle in
    // by hand first. Whether the blueprint declares it at all is the parser's
    // question, and it refuses one that does not.
    const posed = posedAt(
      entity({ props: {} }),
      timeline({ tracks: { box: { [propertyOfProp('angle')]: [{ t: 0, value: 90, ease: 'hold' }] } } }),
      1,
    )
    expect(posed.entity.props.angle).toBe(90)
  })

  test('the prop prefix round trips and does not catch an ordinary property', () => {
    expect(propOfProperty(propertyOfProp('angle'))).toBe('angle')
    expect(propOfProperty('x')).toBe(null)
  })
})

describe('cues', () => {
  const cue = (over: Partial<Extract<XpAction, { kind: 'play' }>> = {}): XpAction => ({
    kind: 'play',
    t: 0,
    duration: 2,
    entity: 'box',
    clip: 'idle',
    loop: true,
    ...over,
  })

  test('nothing has started before its moment', () => {
    expect(cuesAt(timeline({ actions: [cue({ t: 2 })] }), 'box', 1)).toEqual([])
  })

  test('the last whole-body cue wins rather than both playing', () => {
    // Two clips over one skeleton is not a richer answer, it is the two of them
    // fighting over every bone.
    const both = timeline({ actions: [cue({ t: 0, clip: 'idle' }), cue({ t: 1, clip: 'walk' })] })
    const playing = cuesAt(both, 'box', 2)
    expect(playing).toHaveLength(1)
    expect(playing[0]!.clip).toBe('walk')
  })

  test('a masked cue lies over the body rather than replacing it', () => {
    const wave = timeline({
      actions: [cue({ t: 0, clip: 'walk' }), cue({ t: 1, clip: 'wave', parts: ['upperarmr'] })],
    })
    const playing = cuesAt(wave, 'box', 2)
    expect(playing.map((one) => one.clip).sort()).toEqual(['walk', 'wave'])
  })

  test('carries how far into the clip it is, so a mixer can be seeked', () => {
    expect(cuesAt(timeline({ actions: [cue({ t: 1.5 })] }), 'box', 4)[0]!.since).toBeCloseTo(2.5)
  })

  test('somebody else cues do not reach this body', () => {
    expect(cuesAt(timeline({ actions: [cue({ entity: 'other' })] }), 'box', 1)).toEqual([])
  })
})

describe('cameras', () => {
  const wide: MovieCamera = {
    name: 'wide',
    keys: [{ t: 0, position: [10, 5, 10], target: [0, 1, 0], fov: 40 }],
    ease: true,
  }
  const close: MovieCamera = {
    name: 'close',
    keys: [{ t: 0, position: [2, 2, 2], target: [0, 1, 0], fov: 30 }],
    ease: true,
  }

  test('with no cuts the first camera is live throughout', () => {
    const one = timeline({ cameras: [wide, close] })
    expect(liveCamera(one, 0)).toBe('wide')
    expect(liveCamera(one, 99)).toBe('wide')
  })

  test('a cut at two seconds says nothing about what came before it', () => {
    const cut = timeline({ cameras: [wide, close], cuts: [{ t: 2, camera: 'close' }] })
    expect(liveCamera(cut, 1.9)).toBe('wide')
    expect(liveCamera(cut, 2)).toBe('close')
  })

  test('a cut is a cut - the picture does not travel between two cameras', () => {
    const cut = timeline({ cameras: [wide, close], cuts: [{ t: 2, camera: 'close' }] })
    const before = stageAt([], cut, 1.99).camera
    const after = stageAt([], cut, 2).camera
    expect(before.position[0]).toBeCloseTo(10)
    expect(after.position[0]).toBeCloseTo(2)
  })

  test('one framing is a camera that does not move', () => {
    const still = framingAt(wide, 99)
    expect(still.position).toEqual([10, 5, 10])
    expect(still.fov).toBe(40)
  })

  test('a path arrives at its framings and holds past the last', () => {
    const travelling: MovieCamera = {
      name: 'travel',
      ease: false,
      keys: [
        { t: 0, position: [0, 0, 0], target: [0, 0, 0], fov: 40 },
        { t: 4, position: [10, 0, 0], target: [0, 0, 0], fov: 20 },
      ],
    }
    expect(framingAt(travelling, 0).position[0]).toBeCloseTo(0)
    expect(framingAt(travelling, 4).position[0]).toBeCloseTo(10)
    expect(framingAt(travelling, 99).position[0]).toBeCloseTo(10)
    expect(framingAt(travelling, 2).fov).toBeCloseTo(30)
  })

  test('a cut naming a camera that is gone falls back rather than throwing', () => {
    const orphan = timeline({ cameras: [wide], cuts: [{ t: 0, camera: 'deleted' }] })
    expect(stageAt([], orphan, 1).camera.name).toBe('wide')
  })
})

describe('the stage', () => {
  test('is the same pixels for the same t, which is what makes a recording reproducible', () => {
    const moving = timeline({
      tracks: { box: { x: [{ t: 0, value: 0, ease: 'smooth' }, { t: 4, value: 8, ease: 'smooth' }] } },
    })
    const once = stageAt([entity()], moving, 1.7)
    const again = stageAt([entity()], moving, 1.7)
    expect(once.entities[0]!.entity.x).toBe(again.entities[0]!.entity.x)
  })

  test('carries the backdrop through untouched - it is not a function of time', () => {
    const shot = timeline({ backdrop: { kind: 'image', image: '/bg.png' } })
    expect(stageAt([], shot, 3).backdrop.image).toBe('/bg.png')
  })

  test('an empty timeline is one camera and no cuts', () => {
    const fresh = emptyTimeline()
    expect(fresh.cameras).toHaveLength(1)
    expect(fresh.cameras[0]!.name).toBe(DEFAULT_CAMERA.name)
    expect(fresh.cuts).toEqual([])
  })
})

describe('frames', () => {
  test('a two second movie at 30 is 61 instants, both ends included', () => {
    const times = frameTimes(timeline({ duration: 2, fps: 30 }))
    expect(times).toHaveLength(61)
    expect(times[0]).toBe(0)
    expect(times[60]).toBeCloseTo(2)
  })

  test('never hands back an empty list, however short the movie', () => {
    expect(frameTimes(timeline({ duration: 0.001, fps: 1 })).length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Through the parser
// ---------------------------------------------------------------------------

const level = (over: Record<string, unknown>) =>
  parseXp({
    format: XP_FORMAT,
    id: 'x',
    name: 'X',
    packs: [{ id: 'proto' }],
    blueprints: { crate: { model: 'proto/Box_A', props: { angle: 0 } } },
    entities: [{ blueprint: 'crate', name: 'box', x: 0, y: 0, z: 0, rotation: 0, scale: 1 }],
    world: { floorY: 0, placements: [], marks: [] },
    ...over,
  })

const shot = (over: Record<string, unknown> = {}) => ({
  duration: 4,
  fps: 30,
  cameras: [{ name: 'wide', keys: [{ t: 0, position: [8, 4, 8], target: [0, 1, 0], fov: 40 }] }],
  ...over,
})

describe('a timeline in a document', () => {
  test('a document that has never heard of movies does not grow one', () => {
    const parsed = level({})
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect('timeline' in parsed.document).toBe(false)
  })

  test('survives the round trip', () => {
    const parsed = level({
      timeline: shot({
        tracks: { box: { x: [{ t: 0, value: 0, ease: 'linear' }, { t: 2, value: 5, ease: 'linear' }] } },
      }),
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.document.timeline!.duration).toBe(4)
    expect(parsed.document.timeline!.tracks.box!.x).toHaveLength(2)
    expect(parsed.document.timeline!.cameras[0]!.name).toBe('wide')
  })

  test('a key on a name that resolves to nothing is refused, not dropped', () => {
    // scenes.md §2.3 by name. An author who renamed a crate is told, rather than
    // shown a movie with one thing quietly not moving in it.
    const parsed = level({ timeline: shot({ tracks: { ghost: { x: [] } } }) })
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.problems.some((one) => one.message.includes('"ghost"'))).toBe(true)
  })

  test('a key on a property nothing can hold is refused', () => {
    const parsed = level({ timeline: shot({ tracks: { box: { mood: [{ t: 0, value: 1 }] } } }) })
    expect(parsed.ok).toBe(false)
  })

  test('a blueprint property is keyable, and one it never declared is not', () => {
    expect(level({ timeline: shot({ tracks: { box: { 'prop:angle': [{ t: 0, value: 90 }] } } }) }).ok).toBe(true)
    expect(level({ timeline: shot({ tracks: { box: { 'prop:mood': [{ t: 0, value: 1 }] } } }) }).ok).toBe(false)
  })

  test('a cut naming a camera that is not there is refused', () => {
    const parsed = level({ timeline: shot({ cuts: [{ t: 1, camera: 'close' }] }) })
    expect(parsed.ok).toBe(false)
  })

  test('two cameras with one name is refused - a cut list would mean two things', () => {
    const parsed = level({
      timeline: shot({
        cameras: [
          { name: 'wide', keys: [{ t: 0, position: [1, 1, 1], target: [0, 0, 0], fov: 40 }] },
          { name: 'wide', keys: [{ t: 0, position: [2, 2, 2], target: [0, 0, 0], fov: 40 }] },
        ],
      }),
    })
    expect(parsed.ok).toBe(false)
  })

  test('a cue naming a body that is not in this place is refused', () => {
    expect(level({ timeline: shot({ actions: [{ kind: 'play', t: 0, duration: 1, entity: 'nobody', clip: 'wave' }] }) }).ok).toBe(false)
  })

  test('but a cue may name a clip this parser has never heard of', () => {
    // The same asymmetry `blueprint.pose` and the `animate` verb already have:
    // which glTFs a host has loaded is the host's business.
    expect(level({ timeline: shot({ actions: [{ kind: 'play', t: 0, duration: 1, entity: 'box', clip: 'whatever' }] }) }).ok).toBe(true)
  })

  test('a backdrop may not fetch from somewhere else', () => {
    const away = level({ timeline: shot({ backdrop: { kind: 'image', image: 'https://elsewhere/bg.png' } }) })
    expect(away.ok).toBe(false)
    expect(level({ timeline: shot({ backdrop: { kind: 'image', image: '/bg.png' } }) }).ok).toBe(true)
  })

  test('an image backdrop with no picture is refused rather than drawn empty', () => {
    expect(level({ timeline: shot({ backdrop: { kind: 'image' } }) }).ok).toBe(false)
  })

  test('a movie with no camera gets one rather than being refused', () => {
    // An author who has not placed one yet is at the start, not in error.
    const parsed = level({ timeline: { duration: 2, fps: 24 } })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.document.timeline!.cameras).toHaveLength(1)
  })

  test('a scene carries one too, checked against its own actors', () => {
    const parsed = level({
      scenes: {
        cutscene: {
          world: { floorY: 0, placements: [], marks: [] },
          entities: [{ blueprint: 'crate', name: 'hero', x: 0, y: 0, z: 0, rotation: 0, scale: 1 }],
          timeline: shot({ tracks: { hero: { y: [{ t: 0, value: 2 }] } } }),
        },
      },
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const scene = parsed.document.scenes!.cutscene
    expect(typeof scene === 'object' && scene.timeline?.tracks.hero).toBeTruthy()
  })

  test("a scene timeline cannot reach the root's actors", () => {
    const parsed = level({
      scenes: {
        cutscene: {
          world: { floorY: 0, placements: [], marks: [] },
          entities: [],
          timeline: shot({ tracks: { box: { y: [{ t: 0, value: 2 }] } } }),
        },
      },
    })
    expect(parsed.ok).toBe(false)
  })

  test('keys come back in order however they were written', () => {
    const parsed = level({
      timeline: shot({
        tracks: { box: { x: [{ t: 3, value: 9 }, { t: 1, value: 1 }] } },
      }),
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.document.timeline!.tracks.box!.x!.map((one) => one.t)).toEqual([1, 3])
  })
})

describe('lines', () => {
  const say = (over: { t?: number; entity?: string; text?: string; seconds?: number } = {}): XpAction => ({
    kind: 'say',
    t: over.t ?? 0,
    duration: over.seconds ?? 2,
    entity: over.entity ?? 'box',
    text: over.text ?? 'hello',
  })

  test('nothing is said before its moment, or after it runs out', () => {
    const one = timeline({ actions: [say({ t: 1, seconds: 2 })] })
    expect(sayingAt(one, 'box', 0.9)).toBe(null)
    expect(sayingAt(one, 'box', 1)?.text).toBe('hello')
    expect(sayingAt(one, 'box', 2.9)?.text).toBe('hello')
    expect(sayingAt(one, 'box', 3)).toBe(null)
  })

  test('the last line that has started wins - one head, one bubble', () => {
    const two = timeline({
      actions: [say({ t: 0, text: 'first', seconds: 5 }), say({ t: 1, text: 'second', seconds: 5 })],
    })
    expect(sayingAt(two, 'box', 2)?.text).toBe('second')
  })

  test('two bodies at once are two bubbles', () => {
    const both = timeline({
      actions: [say({ entity: 'box', text: 'a' }), say({ entity: 'lid', text: 'b' })],
    })
    const live = linesAt(both, 1)
    expect(live.size).toBe(2)
    expect(live.get('lid')?.text).toBe('b')
  })

  test('a line that has run out is not in force', () => {
    expect(linesAt(timeline({ actions: [say({ t: 0, seconds: 1 })] }), 2).size).toBe(0)
  })

  test('somebody else lines do not reach this body', () => {
    expect(sayingAt(timeline({ actions: [say({ entity: 'other' })] }), 'box', 0)).toBe(null)
  })
})

describe('a line in a document', () => {
  test('survives the round trip', () => {
    const parsed = level({
      timeline: shot({ actions: [{ kind: 'say', t: 1, duration: 3, entity: 'box', text: 'Hallo' }] }),
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const said = parsed.document.timeline!.actions[0]!
    expect(said.kind === 'say' && said.text).toBe('Hallo')
  })

  test('a line from a body that is not here is refused', () => {
    expect(level({ timeline: shot({ actions: [{ kind: 'say', t: 0, duration: 2, entity: 'ghost', text: 'hi' }] }) }).ok).toBe(false)
  })

  test('an empty line is refused rather than drawn as an empty bubble', () => {
    expect(level({ timeline: shot({ actions: [{ kind: 'say', t: 0, duration: 2, entity: 'box', text: '' }] }) }).ok).toBe(false)
  })

  test('a line longer than the limit is refused', () => {
    const parsed = level({
      timeline: shot({ actions: [{ kind: 'say', t: 0, duration: 2, entity: 'box', text: 'x'.repeat(1000) }] }),
    })
    expect(parsed.ok).toBe(false)
  })

  test('a duration with nothing said about it gets the default', () => {
    const parsed = level({ timeline: shot({ actions: [{ kind: 'say', t: 0, duration: 2, entity: 'box', text: 'hi' }] }) })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.document.timeline!.actions[0]!.duration).toBeGreaterThan(0)
  })
})

describe('the movie verb', () => {
  /** A document with a cut in it, and a rule that plays it. */
  const withCut = (verb: unknown) =>
    parseXp({
      format: XP_FORMAT,
      id: 'x',
      name: 'X',
      packs: [{ id: 'proto' }],
      blueprints: {
        crate: {
          model: 'proto/Box_A',
          props: { angle: 0 },
          triggers: [{ on: 'enter', do: [verb] }],
        },
      },
      entities: [{ blueprint: 'crate', name: 'box', x: 0, y: 0, z: 0, rotation: 0, scale: 1 }],
      world: { floorY: 0, placements: [], marks: [] },
      timeline: shot(),
      sequences: { opening: { takes: [{ scene: 'main', from: 0, to: 2, speed: 1 }] } },
    })

  test('a rule can play a cut', () => {
    const parsed = withCut({ op: 'movie', sequence: 'opening' })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.document.blueprints.crate!.triggers![0]!.do[0]).toEqual({
      op: 'movie',
      sequence: 'opening',
    })
  })

  test('a cut that is not in the file is refused', () => {
    // A clip may name something the host has and this parser does not know
    // about; a cut is a thing in *this* file, so naming one that is not there is
    // a typo - and the symptom without this is a trigger that fires and nothing
    // happens, with no error anywhere.
    expect(withCut({ op: 'movie', sequence: 'nope' }).ok).toBe(false)
  })

  test('a name that is not an id is refused by shape', () => {
    expect(withCut({ op: 'movie', sequence: 'Not An Id' }).ok).toBe(false)
    expect(withCut({ op: 'movie' }).ok).toBe(false)
  })

  test('performing it is an effect and touches nothing', () => {
    // There is nothing to do to the entity world - the entity world is the
    // thing being drawn *over*. A verb that reached into the renderer would be
    // the rules layer knowing there is a screen.
    const world = spawnEntities({
      format: XP_FORMAT,
      id: 'x',
      name: 'X',
      packs: [],
      capabilities: {},
      blueprints: {},
      player: {},
      entities: [],
      world: { floorY: 0, ground: true, restart: false, fatal: false, placements: [], marks: [] },
      spawn: { x: 0, y: 0, z: 0, facing: 0 },
    } as never)
    const before = world.position.size

    const effects = applyVerbs(
      world,
      {},
      [{ op: 'movie', sequence: 'opening' }],
      { self: 1, other: null },
    )
    expect(effects).toEqual([{ kind: 'movie', sequence: 'opening' }])
    expect(world.position.size).toBe(before)
  })
})
