import { describe, expect, test } from 'bun:test'
import {
  freshPart,
  freshSpec,
  freshUse,
  type BlueprintSpec,
} from '@/domain/thingiverse/blueprint'
import { specSchema } from '@/domain/thingiverse/commands'
import { freshVehicle, freshWheel } from '@/domain/thingiverse/vehicle'
import { freshRespawn, freshStates } from '@/domain/thingiverse/states'
import { freshHealth, freshShot, freshWeapon } from '@/domain/thingiverse/fight'
import { freshBurger, freshCraft } from '@/domain/thingiverse/craft'

/**
 * Everything the composer can write, through the schema that lets it in.
 *
 * ---------------------------------------------------------------------------
 * The bug this exists to stop happening again
 * ---------------------------------------------------------------------------
 * `specSchema` is `.strict()`, so a key it does not name is a *refusal* - and
 * when `parts` and `sockets` shipped, nobody taught it either. The result was
 * silent and total: the bench could compose a thing, draw it, mark it valid on
 * every keystroke with `blueprintProblems`, and then have Save refused by the
 * server for a spec the client considered perfect. Nothing on the page could
 * have told you why, because the client-side check and the server-side gate
 * were looking at different lists.
 *
 * Neither `blueprint.test.ts` nor `parts.test.ts` could catch it. They test
 * `blueprintProblems`, which is the check that *passed*. The gap was between
 * two things that were each individually correct, which is exactly the shape of
 * bug a test has to be written for on purpose.
 *
 * So: the rule this file encodes is that **anything `fresh*` can build must
 * parse**. A new optional block on `BlueprintSpec` that nobody adds to
 * `specSchema` fails here rather than in somebody's editor a week later.
 */
describe('the schema accepts what the editors produce', () => {
  const model = 'bedroom/soccer_ball'
  const crate = 'bb10/chest'

  test('a fresh spec', () => {
    expect(specSchema.safeParse(freshSpec(model)).success).toBe(true)
  })

  test('a composed one, with parts', () => {
    const spec: BlueprintSpec = {
      ...freshSpec(model),
      parts: [{ ...freshPart(crate), at: { x: 1, y: 0, z: 0 } }],
    }

    expect(specSchema.safeParse(spec).success).toBe(true)
  })

  test('sockets on the root and on a part', () => {
    const spec: BlueprintSpec = {
      ...freshSpec(model),
      sockets: [{ name: 'top', at: { x: 0, y: 1, z: 0 }, turn: 0 }],
      parts: [
        {
          ...freshPart(crate),
          sockets: [{ name: 'lid', at: { x: 0, y: 0.5, z: 0 }, turn: 1 }],
        },
      ],
    }

    expect(specSchema.safeParse(spec).success).toBe(true)
  })

  test('a seat that sits on a named socket', () => {
    const spec: BlueprintSpec = {
      ...freshSpec(model),
      sockets: [{ name: 'perch', at: { x: 0, y: 1, z: 0 }, turn: 0 }],
      use: { ...freshUse(), seats: [{ x: 0, y: 0, z: 0, socket: 'perch' }] },
    }

    expect(specSchema.safeParse(spec).success).toBe(true)
  })

  test('everything the bench can set, at once', () => {
    // The whole surface in one spec, because the failure mode was a *key* the
    // schema had never heard of - and one key is enough to refuse the lot.
    const spec: BlueprintSpec = {
      ...freshSpec(model),
      sockets: [{ name: 'grip', at: { x: 0, y: 0.4, z: 0 }, turn: 2 }],
      parts: [
        {
          ...freshPart(crate),
          at: { x: 0.5, y: 0, z: -1 },
          turn: 3,
          scale: 1.5,
          sockets: [{ name: 'lid', at: { x: 0, y: 1, z: 0 }, turn: 0 }],
        },
      ],
      use: {
        ...freshUse(),
        seats: [
          { x: 0, y: 0, z: 0 },
          { x: 0.2, y: 0, z: 0, socket: 'grip' },
        ],
        inputs: [{ key: 'Q', clip: 'wave' }],
      },
      tags: ['bench', 'garden'],
    }

    const parsed = specSchema.safeParse(spec)
    // The reason, not just the boolean: a refusal here is a key nobody taught
    // the schema, and the message names it.
    expect(parsed.error?.issues.map((one) => one.message) ?? []).toEqual([])
    expect(parsed.success).toBe(true)
  })

  test('a vehicle, including the optional field the fresh builder leaves out', () => {
    // `hideDriver` is absent from `freshVehicle()` and legal on the spec, which
    // is exactly the shape of key `.strict()` refuses when nobody teaches it -
    // the same way `parts` and `sockets` were refused when they shipped. The
    // rule this file encodes is "anything the editors can write must parse",
    // and an optional block's optional field is inside that.
    const spec: BlueprintSpec = {
      ...freshSpec(model),
      body: null,
      vehicle: { ...freshVehicle(), hideDriver: true },
      use: freshUse(),
    }

    const parsed = specSchema.safeParse(spec)
    expect(parsed.error?.issues.map((one) => one.message) ?? []).toEqual([])
    expect(parsed.success).toBe(true)
  })

  test('a vehicle with wheels bolted on, for a body that brought none', () => {
    const spec: BlueprintSpec = {
      ...freshSpec(crate),
      body: null,
      vehicle: {
        ...freshVehicle(),
        wheels: [
          { ...freshWheel('xp:cars/wheel-default'), at: { x: 0.4, y: 0, z: 0.6 }, steers: true },
          { ...freshWheel('xp:cars/wheel-default'), at: { x: -0.4, y: 0, z: 0.6 }, steers: true },
        ],
      },
      use: freshUse(),
    }

    expect(specSchema.safeParse(spec).success).toBe(true)
  })

  test('and still refuses a key nobody has heard of, which is the point of strict', () => {
    const spec = { ...freshSpec(model), nonsense: true }

    expect(specSchema.safeParse(spec).success).toBe(false)
  })
})

/**
 * The three blocks that turn a thing into something that keeps happening.
 *
 * Here rather than in their own files for the reason the note at the top gives:
 * `statesProblems`, `fightProblems` and `craftProblems` are all tested where
 * they live, and every one of them is the check that *passes*. The gap this
 * closes is the other one - a block the composer can write and `.strict()`
 * refuses.
 */
describe('the machine, the fight and the table survive the schema', () => {
  const model = 'bedroom/soccer_ball'

  test('a fresh machine, and the respawn starter', () => {
    expect(specSchema.safeParse({ ...freshSpec(model), states: freshStates() }).success).toBe(true)
    expect(specSchema.safeParse({ ...freshSpec(model), states: freshRespawn() }).success).toBe(true)
  })

  test('a burger that cooks on a pan', () => {
    const spec: BlueprintSpec = {
      ...freshSpec(model),
      craft: { slots: [{ socket: 'hob', takes: ['patty'], emit: 'clunk' }], recipes: [] },
      states: {
        start: 'cold',
        states: [
          { name: 'cold', changes: [{ when: 'filled', to: 'cooking' }] },
          {
            name: 'cooking',
            clip: 'sizzle',
            changes: [{ when: 'after', to: 'done', seconds: 5, fill: true }],
          },
          {
            name: 'done',
            model,
            emit: 'ding',
            changes: [{ when: 'emptied', to: 'cold' }],
          },
        ],
      },
    }
    const parsed = specSchema.safeParse(spec)
    expect(parsed.success).toBe(true)
  })

  test('a crate that breaks and comes back', () => {
    const spec: BlueprintSpec = {
      ...freshSpec(model),
      states: freshRespawn(8),
      fight: { health: freshHealth() },
      actions: [{ when: 'touch', deed: 'become', value: 'gone' }],
    }
    expect(specSchema.safeParse(spec).success).toBe(true)
  })

  test('a turret', () => {
    const spec: BlueprintSpec = {
      ...freshSpec(model),
      actions: [{ when: 'near', deed: 'shoot' }],
      fight: { health: freshHealth(), weapon: { ...freshWeapon(), shot: freshShot(model) } },
    }
    expect(specSchema.safeParse(spec).success).toBe(true)
  })

  test('a cutting board that makes a burger', () => {
    const spec: BlueprintSpec = {
      ...freshSpec(model),
      craft: freshBurger('board'),
    }
    expect(specSchema.safeParse(spec).success).toBe(true)
    expect(specSchema.safeParse({ ...freshSpec(model), craft: freshCraft('top') }).success).toBe(
      true,
    )
  })

  test('a rack that hands you what is on it', () => {
    const spec: BlueprintSpec = {
      ...freshSpec(model),
      craft: { slots: [{ socket: 'hook', takes: [], gives: 'pan' }], recipes: [] },
      actions: [{ when: 'use', deed: 'emit', value: 'taken' }],
    }
    expect(specSchema.safeParse(spec).success).toBe(true)
  })

  test('and a machine pointing at a state nobody wrote is refused', () => {
    // The one failure mode the two layers have to agree about: the shape is
    // fine and the sense is not, so it has to be `blueprintProblems` that says
    // so - through the schema's refinement, which is what the server runs.
    const spec: BlueprintSpec = {
      ...freshSpec(model),
      states: { start: 'whole', states: [{ name: 'whole', changes: [{ when: 'touch', to: 'bits' }] }] },
    }
    expect(specSchema.safeParse(spec).success).toBe(false)
  })
})
