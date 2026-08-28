import { describe, expect, test } from 'bun:test'
import {
  DEFAULT_SCENE,
  decodeScene,
  encodeScene,
  parseScene,
  type StudioScene,
} from '@/domain/studio/scene'

/**
 * The codec is the studio's whole persistence story - a composition is a link
 * and nothing else - so these are the tests that say a link still means what it
 * meant. The rest of the studio is a canvas, which a test cannot look at.
 */

describe('a round trip', () => {
  test('gives back exactly what went in', () => {
    expect(decodeScene(encodeScene(DEFAULT_SCENE))).toEqual(DEFAULT_SCENE)
  })

  test('survives every field being non-default', () => {
    const scene: StudioScene = {
      width: 1234,
      height: 567,
      camera: { position: [1.5, -2, 30], target: [0.5, 1, -3], fov: 61 },
      ground: { cols: 21, rows: 9, top: 'sand_A', rounded: false },
      set: { worldId: '3f7c1c2e-9a4b-4d1e-8c55-1b2a3c4d5e6f' },
      peeps: [
        {
          avatar: 'tiger',
          clip: 'dance',
          time: 1.25,
          x: -3.5,
          y: 1.4,
          z: 2,
          rotation: -95,
          tilt: 12,
          scale: 1.3,
          emote: 40,
          emoteHeight: 3.4,
          emoteSize: 1.2,
          glow: { colour: '#ff00aa', sparkle: true, strength: 1.4 },
          say: 'Every field, non-default.',
        },
      ],
      blocks: [{ model: 'lava', x: 2, top: 3, z: -1, rotation: 45 }],
      goals: [{ x: 1, z: -7, rotation: 90, width: 6, height: 3.5, colour: '#ff00aa' }],
      balls: [{ x: 0.5, y: 1.2, z: -2, radius: 0.5 }],
      light: { azimuth: -120, elevation: 20, sun: 3.1, ambient: 0.2, hemisphere: 0.4, rim: 0 },
      rainbow: { world: true, props: true, phase: 4.25 },
    }
    expect(decodeScene(encodeScene(scene))).toEqual(scene)
  })

  test('encodes to something a URL, a chat client and a shell leave alone', () => {
    expect(encodeScene(DEFAULT_SCENE)).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})

/**
 * A query string is a thing people truncate, hand-edit and paste half of. None
 * of that may produce a page that throws - see the note in scene.ts.
 */
/**
 * The set, and the size of the link that carries it.
 *
 * This is the pair of tests that says the bug stays fixed. A world used to be
 * copied into the document block by block, which put ten kilobytes of
 * coordinates into the query string - past what a server will accept once the
 * session cookies are counted, so following the studio's own "this frame as a
 * still" link stopped loading the studio at all.
 */
describe('a world standing in as the set', () => {
  const WORLD = '3f7c1c2e-9a4b-4d1e-8c55-1b2a3c4d5e6f'

  test('survives the link', () => {
    const scene = { ...DEFAULT_SCENE, set: { worldId: WORLD } }
    expect(decodeScene(encodeScene(scene)).set).toEqual({ worldId: WORLD })
  })

  test('costs the link a few dozen characters, not a few thousand', () => {
    // The header budget a request line and the cookies share is 16KB, and the
    // cookies are a few of those. A scene with a whole world in it has to stay
    // nowhere near it.
    const withSet = encodeScene({ ...DEFAULT_SCENE, set: { worldId: WORLD } })
    expect(withSet.length - encodeScene(DEFAULT_SCENE).length).toBeLessThan(100)
    expect(withSet.length).toBeLessThan(2_000)
  })

  test('is nothing at all when the id is not one', () => {
    // A parser cannot know whether a world exists, but it can refuse to hand
    // the renderer something that was never an id.
    expect(parseScene({ set: { worldId: 'the-red-one' } }).set).toBeNull()
    expect(parseScene({ set: 'a-world' }).set).toBeNull()
    expect(parseScene({}).set).toBeNull()
  })
})

describe('a link that has been damaged', () => {
  test('falls back to the default scene rather than throwing', () => {
    const encoded = encodeScene(DEFAULT_SCENE)
    for (const broken of [
      undefined,
      '',
      'not base64 at all!!',
      encoded.slice(0, encoded.length - 12),
      encodeScene(DEFAULT_SCENE).slice(4),
    ]) {
      expect(decodeScene(broken)).toEqual(DEFAULT_SCENE)
    }
  })

  test('a document of the wrong shape entirely still parses', () => {
    for (const nonsense of [null, undefined, 42, 'scene', [], { peeps: 'lots' }]) {
      expect(() => parseScene(nonsense)).not.toThrow()
    }
  })
})

describe('what parsing refuses', () => {
  test('drops a block whose model is not in the palette', () => {
    // Unlike an avatar, an unknown block has no substitute: the renderer would
    // suspend forever on a glTF that is not there.
    const parsed = parseScene({
      blocks: [{ model: 'crate' }, { model: '../../etc/passwd' }, { model: 'lava' }],
    })
    expect(parsed.blocks.map((block) => block.model)).toEqual(['crate', 'lava'])
  })

  test('substitutes an unknown avatar and an unknown clip', () => {
    const [peep] = parseScene({ peeps: [{ avatar: 'dragon', clip: 'backflip' }] }).peeps
    expect(peep.avatar).toBe('penguin')
    expect(peep.clip).toBe('idle')
  })

  test('an emote index off the end of the sheet means no bubble, not face two', () => {
    const peeps = parseScene({
      peeps: [{ emote: 9000 }, { emote: -1 }, { emote: 'happy' }, { emote: 5 }],
    }).peeps
    expect(peeps.map((peep) => peep.emote)).toEqual([null, null, null, 5])
  })

  test('rejects a goal colour that is not a colour', () => {
    const [goal] = parseScene({ goals: [{ colour: 'url(javascript:alert(1))' }] }).goals
    expect(goal.colour).toBe('#3b82f6')
  })

  test('clamps a hand-typed number instead of dropping it', () => {
    const parsed = parseScene({
      width: 99999,
      height: -4,
      ground: { cols: 5000, rows: 11 },
      camera: { fov: 1 },
    })
    expect(parsed.width).toBe(4096)
    expect(parsed.height).toBe(64)
    expect(parsed.ground?.cols).toBe(41)
    expect(parsed.camera.fov).toBe(5)
  })

  test('caps a list long enough to hang the tab', () => {
    const parsed = parseScene({
      peeps: Array.from({ length: 500 }, () => ({ avatar: 'fox' })),
      blocks: Array.from({ length: 500 }, () => ({ model: 'crate' })),
    })
    expect(parsed.peeps).toHaveLength(24)
    expect(parsed.blocks).toHaveLength(120)
  })

  test('a NaN in the camera does not become a NaN in the scene', () => {
    // JSON has no NaN, but a hand-built document can still carry one, and a NaN
    // position puts the camera nowhere and renders an empty frame.
    const parsed = parseScene({ camera: { position: [Number.NaN, 3, 4], fov: Number.NaN } })
    expect(parsed.camera.position).toEqual([DEFAULT_SCENE.camera.position[0], 3, 4])
    expect(parsed.camera.fov).toBe(DEFAULT_SCENE.camera.fov)
  })
})

/**
 * The rainbow, which is a mode with two switches and a moment.
 *
 * Worth its own block because "off" has two spellings in the wild - the field
 * missing, from every link written before the mode existed, and both switches
 * false, from somebody turning it off in the panel - and both have to end up as
 * the same document or a scene will round-trip into a different one.
 */
describe('the rainbow', () => {
  test('is absent by default, so an old link opens as its author left it', () => {
    expect(parseScene({}).rainbow).toBeNull()
    expect(DEFAULT_SCENE.rainbow).toBeNull()
  })

  test('is nothing when neither switch is on', () => {
    // A mode that changes nothing is not a mode. Letting `{world: false}`
    // survive would put a live Rainbow section on a scene that has none.
    expect(parseScene({ rainbow: { world: false, props: false, phase: 3 } }).rainbow).toBeNull()
  })

  test('keeps the two switches apart', () => {
    // Props are the case somebody opts into separately: a glass cube still
    // reads as a cube, a glass tree reads as a smear.
    expect(parseScene({ rainbow: { world: true } }).rainbow).toEqual({
      world: true,
      props: false,
      phase: 0,
    })
    expect(parseScene({ rainbow: { props: true } }).rainbow).toEqual({
      world: false,
      props: true,
      phase: 0,
    })
  })

  test('clamps a hand-typed moment rather than dropping the rainbow', () => {
    expect(parseScene({ rainbow: { world: true, phase: -5 } }).rainbow?.phase).toBe(0)
    expect(parseScene({ rainbow: { world: true, phase: 10_000 } }).rainbow?.phase).toBe(600)
    expect(parseScene({ rainbow: { world: true, phase: 'soon' } }).rainbow?.phase).toBe(0)
  })

  test('survives the link', () => {
    const scene = { ...DEFAULT_SCENE, rainbow: { world: true, props: false, phase: 2.5 } }
    expect(decodeScene(encodeScene(scene)).rainbow).toEqual(scene.rainbow)
  })
})
