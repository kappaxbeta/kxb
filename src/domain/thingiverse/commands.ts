import { z } from 'zod'
import { MAX_CLIP_NAME as MAX_CLIP_NAME_TYPED } from '@/domain/thingiverse/clip-events'
import {
  BLUEPRINT_VISIBILITIES,
  type BlueprintVisibility,
} from '@/domain/thingiverse/events'
import {
  blueprintProblems,
  type BlueprintSpec,
  MAX_ACTION_VALUE,
  MAX_BLUEPRINT_ACTIONS,
  MAX_BLUEPRINT_NAME,
  MAX_BLUEPRINT_TAGS,
  MAX_TAG_LENGTH,
  MAX_CLIP_NAME,
  MAX_COLLIDER_SIZE,
  MAX_PART_OFFSET,
  MIN_COLLIDER_SIZE,
  MAX_PARTS,
  MAX_SEAT_OFFSET,
  MAX_SEATS,
  MAX_SOCKET_NAME,
  MAX_SOCKETS_PER_PART,
  MAX_THING_SCALE,
  MAX_USE_INPUTS,
  MIN_THING_SCALE,
  THING_DEEDS,
  THING_WHENS,
} from '@/domain/thingiverse/blueprint'
import {
  MAX_ITEM_NAME,
  MAX_PRICE,
  MAX_RECIPE_ITEMS,
  MAX_RECIPE_SECONDS,
  MAX_RECIPES,
  MAX_SLOTS,
} from '@/domain/thingiverse/craft'
import {
  HURTS,
  MAX_THING_HEALTH,
  MIN_THING_HEALTH,
  WEAPON_LIMITS,
} from '@/domain/thingiverse/fight'
import {
  HANDS,
  MAX_HOLD_CLIP,
  MAX_HOLD_OFFSET,
  MAX_HOLD_SCALE,
  MIN_HOLD_SCALE,
} from '@/domain/thingiverse/hold'
import {
  MAX_MOVE,
  MAX_MOVE_SECONDS,
  MAX_MOVE_WAIT,
  MIN_MOVE_SECONDS,
} from '@/domain/thingiverse/motion'
import {
  CHANGE_WHENS,
  MAX_CHANGE_SECONDS,
  MAX_CHANGES_PER_STATE,
  MAX_SIGNAL_NAME,
  MAX_STATE_NAME,
  MAX_STATES,
  MIN_CHANGE_SECONDS,
} from '@/domain/thingiverse/states'
import {
  CUE_DEEDS,
  MAX_CUE_VALUE,
  MAX_TIMELINE_CUES,
  MAX_TIMELINE_SECONDS,
  MIN_TIMELINE_SECONDS,
} from '@/domain/thingiverse/timeline'
import {
  MAX_WHEEL_OFFSET,
  MAX_WHEEL_SCALE,
  MAX_WHEELS,
  MIN_WHEEL_SCALE,
  VEHICLE_LIMITS,
} from '@/domain/thingiverse/vehicle'
import { BODY_LIMITS, MAX_COLLIDER_BOXES } from '@kxb/xp/blueprints'

/**
 * What a browser may ask of a blueprint.
 *
 * Two layers, deliberately, and they check different things:
 *
 *   * **These schemas** bound the *shape* - a name that is a string of a
 *     sensible length, a scale that is a number, a deed out of a closed list.
 *     They are what stands between a crafted request and a megabyte of string
 *     in an immutable log.
 *   * **`blueprintProblems`** checks the *sense* - that the model is one we
 *     ship, that a `play` action says what to play, that gravity is inside the
 *     bounds the engine will accept. It is reused by the editor to mark fields
 *     as you type, which is why it returns a list of sentences rather than
 *     throwing at the first one.
 *
 * The spec schema runs both: the shape first, so `blueprintProblems` is never
 * handed something that is not a spec, and then the sense, as a refinement.
 */

/**
 * A body, or explicit scenery.
 *
 * Every field optional and every bound the engine's own - see `BODY_LIMITS`,
 * which is imported rather than copied so a retune in the simulation moves this
 * check with it. `null` is the third state and is not a body at all: it is the
 * fountain that never moves, and it has to be spellable here because it is the
 * default and the thing most blueprints are.
 */
const bodySchema = z
  .object({
    gravity: z.number().min(BODY_LIMITS.gravity.min).max(BODY_LIMITS.gravity.max).optional(),
    bounce: z.number().min(BODY_LIMITS.bounce.min).max(BODY_LIMITS.bounce.max).optional(),
    drag: z.number().min(BODY_LIMITS.drag.min).max(BODY_LIMITS.drag.max).optional(),
    friction: z
      .number()
      .min(BODY_LIMITS.friction.min)
      .max(BODY_LIMITS.friction.max)
      .optional(),
    mass: z.number().min(BODY_LIMITS.mass.min).max(BODY_LIMITS.mass.max).optional(),
    roll: z.number().min(BODY_LIMITS.roll.min).max(BODY_LIMITS.roll.max).optional(),
  })
  .strict()
  .nullable()

const actionSchema = z
  .object({
    when: z.enum(THING_WHENS),
    deed: z.enum(THING_DEEDS),
    value: z.string().max(MAX_ACTION_VALUE).optional(),
  })
  .strict()

/** Three numbers within a part's reach. Shared by parts, sockets and wheels. */
const offsetSchema = z
  .object({
    x: z.number().min(-MAX_PART_OFFSET).max(MAX_PART_OFFSET),
    y: z.number().min(-MAX_PART_OFFSET).max(MAX_PART_OFFSET),
    z: z.number().min(-MAX_PART_OFFSET).max(MAX_PART_OFFSET),
  })
  .strict()

const socketSchema = z
  .object({
    name: z.string().min(1).max(MAX_SOCKET_NAME),
    at: offsetSchema,
    turn: z.number().int(),
  })
  .strict()

/**
 * One hand-drawn box of a thing's collision.
 *
 * The offsets are optional and the sizes are not, which is `PlacementBox`'s own
 * shape rather than a choice made here: a missing corner is the model's origin,
 * and a missing size is a box that is not a box. Bounded here and made sense of
 * in `colliderProblems`, the same two-layer split the rest of this file keeps.
 */
const colliderBoxSchema = z
  .object({
    x: z.number().min(-MAX_PART_OFFSET).max(MAX_PART_OFFSET).optional(),
    y: z.number().min(-MAX_PART_OFFSET).max(MAX_PART_OFFSET).optional(),
    z: z.number().min(-MAX_PART_OFFSET).max(MAX_PART_OFFSET).optional(),
    w: z.number().min(MIN_COLLIDER_SIZE).max(MAX_COLLIDER_SIZE),
    h: z.number().min(MIN_COLLIDER_SIZE).max(MAX_COLLIDER_SIZE),
    d: z.number().min(MIN_COLLIDER_SIZE).max(MAX_COLLIDER_SIZE),
  })
  .strict()

const partSchema = z
  .object({
    model: z.string().min(1).max(96),
    at: offsetSchema,
    turn: z.number().int(),
    scale: z.number().min(MIN_THING_SCALE).max(MAX_THING_SCALE),
    sockets: z.array(socketSchema).max(MAX_SOCKETS_PER_PART),
  })
  .strict()

const cueSchema = z
  .object({
    at: z.number().min(0).max(MAX_TIMELINE_SECONDS),
    part: z.number().int().min(0).max(MAX_PARTS).optional(),
    deed: z.enum(CUE_DEEDS),
    value: z.string().max(MAX_CUE_VALUE).optional(),
  })
  .strict()

const timelineSchema = z
  .object({
    when: z.enum(THING_WHENS),
    length: z.number().min(MIN_TIMELINE_SECONDS).max(MAX_TIMELINE_SECONDS),
    loop: z.boolean(),
    cues: z.array(cueSchema).max(MAX_TIMELINE_CUES),
  })
  .strict()

const wheelSchema = z
  .object({
    model: z.string().min(1).max(96),
    at: z
      .object({
        x: z.number().min(-MAX_WHEEL_OFFSET).max(MAX_WHEEL_OFFSET),
        y: z.number().min(-MAX_WHEEL_OFFSET).max(MAX_WHEEL_OFFSET),
        z: z.number().min(-MAX_WHEEL_OFFSET).max(MAX_WHEEL_OFFSET),
      })
      .strict(),
    scale: z.number().min(MIN_WHEEL_SCALE).max(MAX_WHEEL_SCALE),
    steers: z.boolean(),
  })
  .strict()

/** A vehicle block. Bounds only - the sense lives in `vehicleProblems`. */
const vehicleSchema = z
  .object({
    speed: z.number().min(VEHICLE_LIMITS.speed.min).max(VEHICLE_LIMITS.speed.max),
    turn: z.number().min(VEHICLE_LIMITS.turn.min).max(VEHICLE_LIMITS.turn.max),
    wheels: z.array(wheelSchema).max(MAX_WHEELS),
    hideDriver: z.boolean().optional(),
  })
  .strict()

/**
 * A `use` block, or explicit "you cannot get in this".
 *
 * The clip names are bounded and not checked, for the reason `UseSpec` gives:
 * which clips exist depends on which body is in the world, and a blueprint is
 * summoned into worlds that use either.
 */
const useSchema = z
  .object({
    enter: z.string().min(1).max(MAX_CLIP_NAME).nullable(),
    loop: z.string().min(1).max(MAX_CLIP_NAME).nullable(),
    leave: z.string().min(1).max(MAX_CLIP_NAME).nullable(),
    seats: z
      .array(
        z
          .object({
            x: z.number().min(-MAX_SEAT_OFFSET).max(MAX_SEAT_OFFSET),
            y: z.number().min(-MAX_SEAT_OFFSET).max(MAX_SEAT_OFFSET),
            z: z.number().min(-MAX_SEAT_OFFSET).max(MAX_SEAT_OFFSET),
            // The socket it sits on, if any. Unchecked against the blueprint's
            // sockets, for the reason `usingProblems` gives at length.
            socket: z.string().min(1).max(MAX_SOCKET_NAME).optional(),
            // What the body plays in this seat, if it is not the block's loop.
            // Unchecked against any pack, exactly as the three above are: which
            // clips a body has is the host's business, and a name that finds
            // nothing leaves the body in its last pose rather than failing.
            clip: z.string().min(1).max(MAX_CLIP_NAME).optional(),
          })
          .strict(),
      )
      // One at least, and the emptiness is checked again by `useProblems` with
      // a sentence somebody can read - this bound is only here so a crafted
      // request cannot carry a thousand of them.
      .min(1)
      .max(MAX_SEATS),
    inputs: z
      .array(
        z
          .object({
            key: z.string().length(1),
            clip: z.string().min(1).max(MAX_CLIP_NAME),
            label: z.string().max(MAX_ACTION_VALUE).optional(),
          })
          .strict(),
      )
      .max(MAX_USE_INPUTS),
  })
  .strict()
  .nullable()

/**
 * The machine, the fight and the table.
 *
 * Bounded here and made sense of in `statesProblems`, `fightProblems` and
 * `craftProblems` - the same two-layer split the rest of this file keeps, and
 * for the same reason: a `to` that names a state nobody wrote is a fact about
 * the *whole* machine, and a shape check cannot see it.
 */
const changeSchema = z
  .object({
    when: z.enum(CHANGE_WHENS),
    to: z.string().min(1).max(MAX_STATE_NAME),
    value: z.string().min(1).max(MAX_SIGNAL_NAME).optional(),
    seconds: z.number().min(MIN_CHANGE_SECONDS).max(MAX_CHANGE_SECONDS).optional(),
    fill: z.boolean().optional(),
    once: z.boolean().optional(),
  })
  .strict()

const stateSchema = z
  .object({
    name: z.string().min(1).max(MAX_STATE_NAME),
    model: z.string().min(1).max(96).optional(),
    // Nullable *and* optional, which is two spellings on purpose and the one
    // place in this schema that is: absent is "whatever the blueprint plays",
    // null is "play nothing". See `ThingState.clip`.
    clip: z.string().min(1).max(MAX_CLIP_NAME).nullable().optional(),
    hidden: z.boolean().optional(),
    blocking: z.boolean().optional(),
    emit: z.string().min(1).max(MAX_SIGNAL_NAME).optional(),
    restore: z.boolean().optional(),
    changes: z.array(changeSchema).max(MAX_CHANGES_PER_STATE),
  })
  .strict()

const statesSchema = z
  .object({
    start: z.string().min(1).max(MAX_STATE_NAME),
    states: z.array(stateSchema).max(MAX_STATES),
  })
  .strict()

const fightSchema = z
  .object({
    health: z
      .object({
        max: z.number().min(MIN_THING_HEALTH).max(MAX_THING_HEALTH),
        bar: z.boolean().optional(),
        hurtBy: z.array(z.enum(HURTS)).max(HURTS.length),
      })
      .strict()
      .optional(),
    weapon: z
      .object({
        damage: z.number().min(WEAPON_LIMITS.damage.min).max(WEAPON_LIMITS.damage.max),
        reach: z.number().min(WEAPON_LIMITS.reach.min).max(WEAPON_LIMITS.reach.max),
        every: z.number().min(WEAPON_LIMITS.every.min).max(WEAPON_LIMITS.every.max),
        at: z.enum(['people', 'things', 'all']),
        push: z.number().min(WEAPON_LIMITS.push.min).max(WEAPON_LIMITS.push.max).optional(),
        shot: z
          .object({
            model: z.string().min(1).max(96),
            speed: z.number().min(WEAPON_LIMITS.speed.min).max(WEAPON_LIMITS.speed.max),
            scale: z.number().min(MIN_THING_SCALE).max(MAX_THING_SCALE),
            from: z.string().min(1).max(MAX_SOCKET_NAME).optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict()

const craftSchema = z
  .object({
    slots: z
      .array(
        z
          .object({
            socket: z.string().min(1).max(MAX_SOCKET_NAME),
            takes: z.array(z.string().min(1).max(MAX_ITEM_NAME)).max(MAX_RECIPE_ITEMS),
            gives: z.string().min(1).max(MAX_ITEM_NAME).optional(),
            emit: z.string().min(1).max(MAX_SIGNAL_NAME).optional(),
            price: z.number().int().min(0).max(MAX_PRICE).optional(),
          })
          .strict(),
      )
      .max(MAX_SLOTS),
    recipes: z
      .array(
        z
          .object({
            needs: z.array(z.string().min(1).max(MAX_ITEM_NAME)).max(MAX_RECIPE_ITEMS),
            makes: z.string().min(1).max(MAX_ITEM_NAME),
            seconds: z.number().min(0).max(MAX_RECIPE_SECONDS).optional(),
            into: z.string().min(1).max(MAX_SOCKET_NAME).optional(),
            emit: z.string().min(1).max(MAX_SIGNAL_NAME).optional(),
          })
          .strict(),
      )
      .max(MAX_RECIPES),
  })
  .strict()

/**
 * Where a thing sits in a hand. See `@/domain/thingiverse/hold`.
 *
 * Bounded here and made sense of there, which is the split every block on this
 * schema keeps: the shape and the numbers are the schema's, and "is that a hand
 * we have" is `holdProblems`', because it is the half that reads like a
 * sentence when it comes back to a panel.
 */
const holdSchema = z
  .object({
    hand: z.enum(HANDS),
    at: z
      .object({
        x: z.number().min(-MAX_HOLD_OFFSET).max(MAX_HOLD_OFFSET),
        y: z.number().min(-MAX_HOLD_OFFSET).max(MAX_HOLD_OFFSET),
        z: z.number().min(-MAX_HOLD_OFFSET).max(MAX_HOLD_OFFSET),
      })
      .strict(),
    turn: z
      .object({
        x: z.number().min(-Math.PI * 2).max(Math.PI * 2),
        y: z.number().min(-Math.PI * 2).max(Math.PI * 2),
        z: z.number().min(-Math.PI * 2).max(Math.PI * 2),
      })
      .strict(),
    scale: z.number().min(MIN_HOLD_SCALE).max(MAX_HOLD_SCALE),
    clip: z.string().min(1).max(MAX_HOLD_CLIP).nullable().optional(),
  })
  .strict()

/**
 * Where a thing goes on its own. See `@/domain/thingiverse/motion`.
 *
 * Bounded here, made sense of there - the split every block on this schema
 * keeps.
 */
const motionSchema = z
  .object({
    by: z
      .object({
        x: z.number().min(-MAX_MOVE).max(MAX_MOVE),
        y: z.number().min(-MAX_MOVE).max(MAX_MOVE),
        z: z.number().min(-MAX_MOVE).max(MAX_MOVE),
      })
      .strict(),
    out: z.number().min(MIN_MOVE_SECONDS).max(MAX_MOVE_SECONDS),
    back: z.number().min(MIN_MOVE_SECONDS).max(MAX_MOVE_SECONDS),
    waitOut: z.number().min(0).max(MAX_MOVE_WAIT).optional(),
    waitHome: z.number().min(0).max(MAX_MOVE_WAIT).optional(),
    ease: z.boolean().optional(),
  })
  .strict()

export const specSchema = z
  .object({
    // Bounded, not validated: `blueprintProblems` asks the catalogue whether it
    // is a model we ship, and that check needs the whole spec anyway.
    model: z.string().min(1).max(96),
    scale: z.number().min(MIN_THING_SCALE).max(MAX_THING_SCALE),
    blocking: z.boolean(),
    body: bodySchema,
    clip: z.string().min(1).max(64).nullable(),
    actions: z.array(actionSchema).max(MAX_BLUEPRINT_ACTIONS),
    tags: z.array(z.string().min(1).max(MAX_TAG_LENGTH)).max(MAX_BLUEPRINT_TAGS),
    use: useSchema,
    // The optional blocks, optional here for the same reason each is on the
    // type: a blueprint written before it existed has no such key, and this
    // schema is `.strict()` - a key it does not name is a refusal. Every one
    // of these was missing when it shipped, which refused exactly the specs
    // the composer had just learned to write.
    parts: z.array(partSchema).max(MAX_PARTS).optional(),
    sockets: z.array(socketSchema).max(MAX_SOCKETS_PER_PART).optional(),
    collider: z.array(colliderBoxSchema).max(MAX_COLLIDER_BOXES).optional(),
    timeline: timelineSchema.optional(),
    vehicle: vehicleSchema.optional(),
    states: statesSchema.optional(),
    fight: fightSchema.optional(),
    craft: craftSchema.optional(),
    hold: holdSchema.optional(),
    motion: motionSchema.optional(),
    price: z.number().int().min(0).max(MAX_PRICE).optional(),
  })
  .strict()
  .superRefine((spec, ctx) => {
    for (const problem of blueprintProblems(spec as BlueprintSpec)) {
      ctx.addIssue({ code: 'custom', message: problem })
    }
  })

/**
 * A blueprint's name.
 *
 * Trimmed before it is measured, so a name of four spaces is refused as empty
 * rather than stored as one somebody has to guess at in a list. Not unique: two
 * people may each have a "lamp", and making the second one rename theirs to
 * satisfy a database would be a rule about the shelf rather than about them.
 * `resolveSummon` is what copes with two matches, and it copes by asking.
 */
export const blueprintNameSchema = z
  .string()
  .trim()
  .min(1, 'A blueprint needs a name')
  .max(MAX_BLUEPRINT_NAME)

export const drawBlueprintSchema = z.object({
  name: blueprintNameSchema,
  spec: specSchema,
  visibility: z.enum(BLUEPRINT_VISIBILITIES).default('private'),
})

export const reshapeBlueprintSchema = z.object({
  id: z.uuid(),
  spec: specSchema,
})

export const renameBlueprintSchema = z.object({
  id: z.uuid(),
  name: blueprintNameSchema,
})

export const setBlueprintVisibilitySchema = z.object({
  id: z.uuid(),
  visibility: z.enum(BLUEPRINT_VISIBILITIES),
})

export const handOverBlueprintSchema = z.object({
  id: z.uuid(),
  ownerId: z.uuid(),
})

export const blueprintIdSchema = z.object({ id: z.uuid() })

/**
 * A clip's name.
 *
 * Its own schema rather than `blueprintNameSchema` with a different bound,
 * because the two lists are read in different places and a clip's name is what
 * a blueprint *spells* - `MAX_CLIP_NAME` in `blueprint.ts` is the length that
 * fits in a `use` block's field, and this is the length somebody may type.
 * Keeping them separate is what stops a clip being nameable and then
 * unreferenceable.
 */
export const clipNameSchema = z
  .string()
  .trim()
  .min(1, 'A clip needs a name')
  // The name somebody *types*, which is the shorter of the two: `MAX_CLIP_NAME`
  // in `blueprint.ts` is how long a name a blueprint may spell, and it is wider
  // so that a clip out of a pack with a long name stays referenceable.
  .max(MAX_CLIP_NAME_TYPED)

/**
 * Who is asking, as the aggregate sees them.
 *
 * On every command that changes a blueprint, because the rule that governs all
 * of them - *it is yours, or you run the space* - is about state the aggregate
 * is the only holder of. The role half comes from the action, which is the only
 * layer that can ask the database what somebody is; the ownership half is read
 * off `state.ownerId`, which no action can see without loading the stream it
 * is about to write to anyway.
 *
 * Splitting the check across two layers was the alternative and is worse in the
 * specific way authorization is usually worse: the interesting half - "is this
 * mine" - would live in the caller, where it is easy to forget and impossible
 * to unit test.
 */
export interface Asker {
  actorId: string
  /** Owner or admin of the space. They may reshape anybody's blueprint. */
  admin: boolean
}

export type DrawBlueprint = {
  type: 'DrawBlueprint'
  by: Asker
  name: string
  spec: BlueprintSpec
  visibility: BlueprintVisibility
}
export type RenameBlueprint = { type: 'RenameBlueprint'; by: Asker; name: string }
export type ReshapeBlueprint = { type: 'ReshapeBlueprint'; by: Asker; spec: BlueprintSpec }
export type SetBlueprintVisibility = {
  type: 'SetBlueprintVisibility'
  by: Asker
  visibility: BlueprintVisibility
}
export type HandOverBlueprint = { type: 'HandOverBlueprint'; by: Asker; ownerId: string }
export type RetireBlueprint = { type: 'RetireBlueprint'; by: Asker }

export type BlueprintCommand =
  | DrawBlueprint
  | RenameBlueprint
  | ReshapeBlueprint
  | SetBlueprintVisibility
  | HandOverBlueprint
  | RetireBlueprint
