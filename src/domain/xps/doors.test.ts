import { describe, expect, test } from 'bun:test'
import { placeOf, type XpDocument } from '@kxb/xp'
import { spawnEntities, stepTriggers } from '@kxb/xp/engine'
import { listXpCatalogue, readXpDocument } from '@/domain/xps/catalogue'

/**
 * Every door in every level we ship, walked into.
 *
 * `packages/xp/src/document/templates.test.ts` already does this for the
 * *templates*, and the gap between the two is the whole reason this file exists:
 * a template is what the editor writes when somebody starts a new level, and the
 * documents under `public/xp/xps/` are hand-maintained files that nothing
 * generates. They are the ones `/xp/<id>` actually plays. When the templates
 * learned to draw a door the size of its trigger, the shipped `two-rooms`
 * quietly kept the old one for a fortnight, because no check could see it.
 *
 * Against the real directory for the reason `catalogue.test.ts` is: a fixture
 * would pass forever while the thing it stands for drifted.
 */

/**
 * A person, as the box `stepTriggers` measures them by.
 *
 * The same numbers the template's own walkthrough uses. Roughly two-thirds of a
 * metre across and standing on a floor at y=1, which is where every level here
 * puts its spawn.
 */
const standingAt = (x: number, z: number) => ({
  id: 500,
  box: { minX: x - 0.3, minY: 1, minZ: z - 0.3, maxX: x + 0.3, maxY: 2.7, maxZ: z + 0.3 },
})

/** Every room of a document, front room included, as the runtime sees one. */
function rooms(document: XpDocument): { room: string; place: XpDocument }[] {
  const names = ['main', ...Object.keys(document.scenes ?? {})]
  const out: { room: string; place: XpDocument }[] = []
  for (const room of names) {
    const place = placeOf(document, room)
    // A `scenes` entry holding a string is a door to another *document*, not a
    // room here, and has no entities of its own to walk into.
    if (place) out.push({ room, place: { ...document, ...place } as XpDocument })
  }
  return out
}

/** Does this blueprint's `enter` rule take you somewhere? */
function isDoor(document: XpDocument, blueprint: string | undefined): boolean {
  const rules = blueprint ? document.blueprints?.[blueprint]?.triggers : undefined
  return Boolean(
    rules?.some(
      (rule) =>
        rule.on === 'enter' && rule.do?.some((verb) => verb.op === 'load'),
    ),
  )
}

describe('the doors in the levels we ship', () => {
  test('every one of them fires when you stand on it', async () => {
    const catalogue = await listXpCatalogue()
    expect(catalogue.length).toBeGreaterThan(0)

    /** Counted so a run that found no doors at all cannot pass quietly. */
    let doors = 0

    for (const entry of catalogue) {
      const document = await readXpDocument(entry.id)
      if (!document) throw new Error(`${entry.id} is in the catalogue and not on disk`)

      for (const { room, place } of rooms(document)) {
        const world = spawnEntities(place)
        for (const thing of place.entities ?? []) {
          if (!isDoor(document, thing.blueprint)) continue
          doors += 1

          const effects = stepTriggers(
            world,
            document.blueprints ?? {},
            [standingAt(thing.x, thing.z)],
            new Map(),
          )
          expect({
            at: `${entry.id}/${room}/${thing.name}`,
            loads: effects.some((effect) => effect.kind === 'load'),
          }).toEqual({ at: `${entry.id}/${room}/${thing.name}`, loads: true })
        }
      }
    }

    expect(doors).toBeGreaterThan(0)
  })

  /**
   * And is no bigger than the thing that fires.
   *
   * This is the check that would have caught it. A trigger reaches half a metre
   * either side of where the entity stands *whatever is drawn on top of it*, so
   * a door left at the full size of the floor tile it is made from promises four
   * cells and fires in one: you walk into the post you can see, nothing happens,
   * and the only way to find the working part is to hit the exact middle. See
   * `DOOR_SHAPE` in `packages/xp/src/document/edit.ts`, which is what the editor
   * has written since - the shipped files had no such rule to keep them honest.
   *
   * Judged a cell out from the centre rather than by measuring the model: what
   * matters is not the number in `stretch`, it is that somebody who walks into
   * the visible edge of a door gets through it.
   */
  test('and does not promise more floor than it fires on', async () => {
    for (const entry of await listXpCatalogue()) {
      const document = await readXpDocument(entry.id)
      if (!document) continue

      for (const { room, place } of rooms(document)) {
        const world = spawnEntities(place)
        for (const thing of place.entities ?? []) {
          if (!isDoor(document, thing.blueprint)) continue

          const stretch = thing.stretch
          const wide = Math.max(stretch?.x ?? 1, stretch?.z ?? 1)
          // One cell of a four-cell floor tile is a quarter, which is exactly
          // the reach of the trigger under it. Anything wider is a door with a
          // dead edge.
          expect({
            at: `${entry.id}/${room}/${thing.name}`,
            wide,
          }).toEqual({ at: `${entry.id}/${room}/${thing.name}`, wide: 0.25 })

          // And the middle still works, so a narrow door is not a missing one.
          expect(
            stepTriggers(
              world,
              document.blueprints ?? {},
              [standingAt(thing.x, thing.z)],
              new Map(),
            ).some((effect) => effect.kind === 'load'),
          ).toBe(true)
        }
      }
    }
  })
})
