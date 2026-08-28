import { describe, expect, test } from 'bun:test'
import { parseXp, placeOf, XP_FORMAT, type XpDocument } from './format'
import { cuedAt, posedAt, framingAt, liveCamera, sequenceLength } from './movie'

/**
 * A cut, resolved the way the runtime resolves it.
 *
 * `_runtime/cutscene.tsx` is four calls in a frame loop - `cuedAt` to pick the
 * take, `placeOf` to find its scene, `posedAt` to pose the cast, `framingAt` to
 * aim the camera - and a canvas around them. The canvas is what needs a browser;
 * *these four agreeing* is what makes the film correct, and it is checkable
 * here.
 *
 * The case that matters is a cut that **crosses places**, because that is the
 * one where every step can be individually right and the composition wrong: a
 * take resolved against the wrong scene poses a cast that is not there and
 * draws nothing, which is indistinguishable from a level that failed to load.
 */

const shot = (over: Record<string, unknown> = {}) => ({
  duration: 4,
  fps: 30,
  cameras: [{ name: 'wide', keys: [{ t: 0, position: [8, 4, 8], target: [0, 1, 0], fov: 40 }] }],
  ...over,
})

const film = (): XpDocument => {
  const parsed = parseXp({
    format: XP_FORMAT,
    id: 'x',
    name: 'X',
    packs: [{ id: 'proto' }],
    blueprints: { crate: { model: 'proto/Box_A' } },
    entities: [{ blueprint: 'crate', name: 'hero', x: 0, y: 0, z: 0, rotation: 0, scale: 1 }],
    world: { floorY: 0, placements: [], marks: [] },
    // The root is a shot: the hero rises over four seconds.
    timeline: shot({
      tracks: {
        hero: {
          y: [
            { t: 0, value: 0, ease: 'linear' },
            { t: 4, value: 4, ease: 'linear' },
          ],
        },
      },
    }),
    scenes: {
      cellar: {
        world: { floorY: 0, placements: [], marks: [] },
        entities: [{ blueprint: 'crate', name: 'villain', x: 5, y: 0, z: 0, rotation: 0, scale: 1 }],
        timeline: shot({
          duration: 2,
          cameras: [
            { name: 'close', keys: [{ t: 0, position: [1, 1, 1], target: [5, 1, 0], fov: 25 }] },
          ],
        }),
      },
    },
    sequences: {
      opening: {
        takes: [
          { scene: 'main', from: 0, to: 4, speed: 1 },
          { scene: 'cellar', from: 0, to: 2, speed: 1 },
        ],
      },
    },
  })
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.problems))
  return parsed.document
}

/** What the runtime's frame loop does, as a function. */
function frameAt(xp: XpDocument, id: string, t: number) {
  const sequence = xp.sequences![id]!
  const cued = cuedAt(sequence, t)
  if (!cued) return null

  const place = placeOf(xp, cued.take.scene)
  if (!place?.timeline) return null

  const cameraName = liveCamera(place.timeline, cued.local)
  const camera = place.timeline.cameras.find((one) => one.name === cameraName)!

  return {
    scene: cued.take.scene,
    cast: place.entities.map((one) => posedAt(one, place.timeline!, cued.local)),
    camera: framingAt(camera, cued.local),
  }
}

describe('a cut, resolved the way the runtime resolves it', () => {
  test('the root is a shot, and `placeOf` says so', () => {
    // It did not: `placeOf` assembled `main` by hand out of three fields and
    // left the timeline off, so a document whose root was a film answered "not
    // a shot" - and only for the default, which is the worst place to have it.
    expect(placeOf(film(), 'main')?.timeline).toBeTruthy()
  })

  test('the first take draws the root, posed at the moment inside it', () => {
    const frame = frameAt(film(), 'opening', 2)
    expect(frame?.scene).toBe('main')
    expect(frame?.cast.map((one) => one.entity.name)).toEqual(['hero'])
    // Two seconds into a four-second rise from 0 to 4.
    expect(frame?.cast[0]!.entity.y).toBeCloseTo(2)
  })

  test('crossing into the second take draws the other place and its own cast', () => {
    const frame = frameAt(film(), 'opening', 4.5)
    expect(frame?.scene).toBe('cellar')
    expect(frame?.cast.map((one) => one.entity.name)).toEqual(['villain'])
    // And the other camera, which is the half that would look like a broken
    // load if it kept the first take's.
    expect(frame?.camera.fov).toBe(25)
  })

  test('the cut is exactly the two takes long, and past it there is nothing', () => {
    const xp = film()
    expect(sequenceLength(xp.sequences!.opening!)).toBeCloseTo(6)
    expect(frameAt(xp, 'opening', 6)).toBe(null)
  })

  test('the same moment is the same frame, which is what makes a film a film', () => {
    const xp = film()
    expect(frameAt(xp, 'opening', 1.7)?.cast[0]!.entity.y).toBe(
      frameAt(xp, 'opening', 1.7)?.cast[0]!.entity.y,
    )
  })

  test("a take's trim shifts the moment inside its shot, not the shot", () => {
    const xp = film()
    const trimmed: XpDocument = {
      ...xp,
      sequences: { opening: { takes: [{ scene: 'main', from: 2, to: 4, speed: 1 }] } },
    }
    // Half a second into a take that starts two seconds in is 2.5s of the shot,
    // which on a 0-to-4 rise is 2.5.
    expect(frameAt(trimmed, 'opening', 0.5)?.cast[0]!.entity.y).toBeCloseTo(2.5)
  })

  test('speed changes how long it occupies without changing what it shows', () => {
    const xp = film()
    const fast: XpDocument = {
      ...xp,
      sequences: { opening: { takes: [{ scene: 'main', from: 0, to: 4, speed: 2 }] } },
    }
    expect(sequenceLength(fast.sequences!.opening!)).toBeCloseTo(2)
    // One second of cut is two seconds of shot, so the hero is halfway up.
    expect(frameAt(fast, 'opening', 1)?.cast[0]!.entity.y).toBeCloseTo(2)
  })
})
