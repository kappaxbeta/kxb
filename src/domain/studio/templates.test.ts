import { describe, expect, test } from 'bun:test'
import { findTemplate, TEMPLATES } from '@/domain/studio/templates'
import { decodeShot, encodeShot, parseShot, sceneAt } from '@/domain/studio/shot'

/**
 * The templates, checked for being scenes rather than for being funny.
 *
 * These are hand-written documents, which is exactly the kind of thing that
 * rots: an avatar renamed, a block dropped from the palette, an emote index
 * past the end of the sheet. Every one of those failures is silent - the parser
 * drops what it cannot read - so a template would quietly become an empty stage
 * and nobody would find out until they opened it.
 *
 * So the test is: does what comes out of the parser still have everything that
 * went in.
 */
describe('the shipped templates', () => {
  test('there are ten of them', () => {
    expect(TEMPLATES).toHaveLength(10)
  })

  test('every id is unique, because it is what a link carries', () => {
    expect(new Set(TEMPLATES.map((template) => template.id)).size).toBe(TEMPLATES.length)
  })

  for (const template of TEMPLATES) {
    describe(template.name, () => {
      test('survives the parser with its whole cast', () => {
        // The failure this catches: an avatar id that is no longer in the
        // roster is replaced by the default, and a block model that has left
        // the palette is dropped entirely.
        const parsed = parseShot(JSON.parse(JSON.stringify(template.shot)))
        expect(parsed.cast).toHaveLength(template.shot.cast.length)
        expect(parsed.blocks).toHaveLength(template.shot.blocks.length)
        expect(parsed.cast.map((actor) => actor.avatar)).toEqual(
          template.shot.cast.map((actor) => actor.avatar),
        )
      })

      test('keeps every action it was written with', () => {
        const parsed = parseShot(JSON.parse(JSON.stringify(template.shot)))
        for (const [i, actor] of template.shot.cast.entries()) {
          // Dropped actions are the silent failure: an emote index off the end
          // of the sheet, or a line that ended up empty.
          expect(parsed.cast[i].actions).toHaveLength(actor.actions.length)
        }
      })

      test('survives the round trip through a link', () => {
        expect(decodeShot(encodeShot(template.shot))).toEqual(template.shot)
      })

      test('samples cleanly from before the start to after the end', () => {
        for (let t = -1; t <= template.shot.duration + 1; t += 0.25) {
          const scene = sceneAt(template.shot, t)
          for (const peep of scene.peeps) {
            expect(Number.isFinite(peep.x)).toBe(true)
            expect(Number.isFinite(peep.rotation)).toBe(true)
            expect(Number.isFinite(peep.scale)).toBe(true)
          }
          for (const block of scene.blocks) expect(Number.isFinite(block.top)).toBe(true)
        }
      })

      test('has something happening in it', () => {
        const actions = template.shot.cast.reduce(
          (count, actor) => count + actor.actions.length,
          0,
        )
        expect(actions).toBeGreaterThan(0)
      })
    })
  }

  test('the rock actually wobbles when it is kicked', () => {
    // The one everybody will open first, and the one whose whole point is that
    // two separately-authored things line up: the hog's kick, and the stone's
    // keyed rotation. If they drift apart the joke silently stops working.
    const rock = findTemplate('rock')
    expect(rock).toBeDefined()
    if (!rock) return

    const kick = rock.shot.cast[0].actions.find((action) => action.kind === 'kick')
    expect(kick).toBeDefined()
    if (!kick) return

    const before = sceneAt(rock.shot, kick.t).blocks[0].rotation
    const during = sceneAt(rock.shot, kick.t + 0.3).blocks[0].rotation
    const after = sceneAt(rock.shot, kick.t + 1.5).blocks[0].rotation

    expect(before).toBeCloseTo(0)
    expect(Math.abs(during)).toBeGreaterThan(3)
    expect(after).toBeCloseTo(0)
  })
})
