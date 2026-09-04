import { z } from 'zod'
import { WORLD_HEIGHT, WORLD_RADIUS } from '@/domain/lounge/events'
import { MAX_THING_SCALE, MIN_THING_SCALE } from '@/domain/thingiverse/blueprint'
import {
  MAX_THING_REACH,
  MAX_WIRES,
  MIN_THING_REACH,
  type ThingTuning,
} from '@/domain/thingiverse/thing-events'
import { BODY_LIMITS } from '@kxb/xp/blueprints'

/**
 * What a browser may ask of a thing standing in a world.
 *
 * The bounds are the *blocks'* bounds, imported rather than restated: a thing
 * stands on the same lattice a wall is built on, and a bench that could be
 * summoned outside the buildable world would be a bench nobody can walk to.
 * `WORLD_RADIUS` explains at length why that bound is about chunk streams
 * rather than about space; a thing costs no chunk, but a thing standing where
 * no floor can ever be built is still a thing lost in the sky.
 */

/**
 * Where a thing stands, in cells - and now between them.
 *
 * Whole cells were right while a thing was a block-sized object put down by a
 * crosshair that could only point at a cell. They stopped being right the
 * moment things were moved by hand: a bench is 2.4 across, and lining one up
 * against a wall on a one-metre lattice is a bench that is either buried in the
 * wall or standing a hand's width off it.
 *
 * So the value is continuous, quantised to a tenth of a cell. Quantised rather
 * than free because this is an immutable log: a float that arrived as
 * 3.0000000000000004 is in the history forever, and every reader of it has to
 * decide whether that is the same place as 3. A tenth is finer than anybody can
 * see at this scale and coarse enough to be exact in binary arithmetic when it
 * is rounded on the way in.
 */
export const THING_STEP = 0.1
const STEP = THING_STEP

const onGrid = (value: number) => Math.abs(value / STEP - Math.round(value / STEP)) < 1e-6

/**
 * Put a continuous number on the grid this log stores.
 *
 * Exported because the schema above refuses anything off it, and refusing is
 * the right behaviour for a *typed* position and the wrong one for a measured
 * one. A ball rolls to 1.2493 and comes to rest there; that is not a mistake
 * somebody made and there is nothing they could do about the message, so the
 * caller that measured it rounds it here rather than being told off.
 *
 * The rounding is deliberately not inside the schema. A command that quietly
 * accepted anything and rounded it would make the grid a suggestion, and the
 * next reader of the log would have no way to know whether a value had been
 * meant or tidied. The guard stays strict and the edge does the arithmetic.
 */
export function toGrid(value: number): number {
  // Through an integer count of steps rather than `toFixed`, so the result is
  // the same number `onGrid` computes with and not a re-parsed decimal.
  return Math.round(value / STEP) * STEP
}

const cell = z
  .number()
  .min(-WORLD_RADIUS)
  .max(WORLD_RADIUS - 1)
  .refine(onGrid, `A position must be a multiple of ${STEP} cells`)
const level = z
  .number()
  .min(0)
  .max(WORLD_HEIGHT - 1)
  .refine(onGrid, `A height must be a multiple of ${STEP} cells`)

/**
 * Put a *measured* place where the log can keep it: on the grid, and inside
 * the world.
 *
 * `toGrid` above is half of this, and shipping only that half left the other
 * half of the same bug in the room. The argument is identical and worth saying
 * once more, because it is about who is speaking: a position somebody *typed*
 * should be refused when it is out of bounds - that is a mistake with a fix.
 * A position somebody *measured* has no fix. The renderer watched a ball come
 * to rest and reported where it was; being told the answer is not allowed is a
 * sentence with nothing anybody can do about it, and it arrives as a red card
 * over a room where nothing appears to have gone wrong.
 *
 * What was actually leaking is worth writing down, because it is not obvious
 * from the numbers. The ball simulation rests a ball on `floorY + BALL_RADIUS`
 * - one fixed radius, the sim's own - and the renderer subtracts the *drawn*
 * half-height of whatever model is rolling. Those two are the same only for a
 * ball at scale 1. Anything taller than the sim's radius comes to rest at a
 * negative cell, `level` refuses it, and the room says
 * "Too small: expected number to be >=0" at somebody who kicked a big ball.
 *
 * So the edge clamps as well as rounds. Clamped *after* rounding, and only to
 * whole-cell bounds, so the result is still on the grid the schema insists on -
 * which is the property that makes this safe to put in front of every measured
 * write rather than a second, looser set of rules.
 */
export function toPlace(at: { x: number; y: number; z: number }): {
  x: number
  y: number
  z: number
} {
  return {
    x: within(toGrid(at.x), -WORLD_RADIUS, WORLD_RADIUS - 1),
    y: within(toGrid(at.y), 0, WORLD_HEIGHT - 1),
    z: within(toGrid(at.z), -WORLD_RADIUS, WORLD_RADIUS - 1),
  }
}

/** `Math.max(low, Math.min(high, …))`, named, so the call above reads. */
function within(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

/**
 * Quarter turns, unbounded on the way in and wrapped by the decider.
 *
 * A panel with one "turn" button counts upward forever, and refusing the fifth
 * press would be a button that stops working. `normalizeFacing` is where 4
 * becomes 0 - the same treatment an image's facing gets, for the same reason.
 */
const facing = z.number().int()

const scale = z.number().min(MIN_THING_SCALE).max(MAX_THING_SCALE)

/**
 * The world, as an id or as absence.
 *
 * Optional everywhere, and absent means the workspace's own lounge. Every
 * world-scoped command in this codebase is written this way (see the note at
 * the top of `@/domain/lounge/commands`), and the action is what fills it in.
 */
const worldId = z.uuid().optional()

export const summonThingSchema = z.object({
  blueprintId: z.uuid(),
  worldId,
  x: cell,
  y: level,
  z: cell,
  facing,
  scale,
  /**
   * Whether it outlives whoever summoned it. Default true: furniture.
   *
   * The default is on the *schema* rather than in the caller, so a client that
   * says nothing gets the answer that loses nothing. A thing that vanished
   * because a field was forgotten is a thing somebody has to make twice.
   */
  keep: z.boolean().default(true),
})

export const moveThingSchema = z.object({
  id: z.uuid(),
  worldId,
  x: cell,
  y: level,
  z: cell,
})

export const turnThingSchema = z.object({ id: z.uuid(), worldId, facing })

export const scaleThingSchema = z.object({ id: z.uuid(), worldId, scale })

/**
 * The two overrides, and the shape of *clearing* one.
 *
 * Both fields optional, and an absent field means "agree with the blueprint"
 * rather than "leave whatever override was there". That makes the panel's job
 * the honest one: it sends the tuning it is showing, whole, and clearing a
 * switch is a tuning without it. A patch would need a third value per field to
 * say "unset", which is the sort of thing that ends up spelled `null` in one
 * place and `undefined` in another.
 */
export const tuneThingSchema = z.object({
  id: z.uuid(),
  worldId,
  tuning: z
    .object({
      blocking: z.boolean().optional(),
      body: z
        .object({
          gravity: z
            .number()
            .min(BODY_LIMITS.gravity.min)
            .max(BODY_LIMITS.gravity.max)
            .optional(),
          bounce: z
            .number()
            .min(BODY_LIMITS.bounce.min)
            .max(BODY_LIMITS.bounce.max)
            .optional(),
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
        .optional(),
      /*
        How far its shouts carry, and what they are wired to. Bounded here
        rather than in the renderer for the reason every bound in this file is
        written down once: a reach of a million is a signal that is not limited
        at all with extra steps, and a list of two hundred ids is a packet.
      */
      reach: z.number().min(MIN_THING_REACH).max(MAX_THING_REACH).optional(),
      wires: z.array(z.uuid()).max(MAX_WIRES).optional(),
    })
    .strict(),
})

export const setThingKeepSchema = z.object({
  id: z.uuid(),
  worldId,
  keep: z.boolean(),
})

export const thingIdSchema = z.object({ id: z.uuid(), worldId })

export type SummonThing = {
  type: 'SummonThing'
  worldId?: string
  blueprintId: string
  x: number
  y: number
  z: number
  facing: number
  scale: number
  /** Whether it outlives whoever summoned it. See `ThingSummoned.keep`. */
  keep: boolean
  /**
   * How many things are already standing here.
   *
   * Passed in rather than folded, because the cap is about the *world* and this
   * aggregate is one thing. The same shape the goals' cap takes: the action
   * counts the read model and hands the number over, so the rule that refuses
   * the sixty-fifth thing is still written down in the decider and still
   * testable without a database.
   */
  standing: number
}

export type MoveThing = { type: 'MoveThing'; x: number; y: number; z: number }
export type TurnThing = { type: 'TurnThing'; facing: number }
export type ScaleThing = { type: 'ScaleThing'; scale: number }
export type TuneThing = { type: 'TuneThing'; tuning: ThingTuning }
export type SetThingKeep = { type: 'SetThingKeep'; keep: boolean }
export type DismissThing = { type: 'DismissThing' }

export type ThingCommand =
  | SummonThing
  | MoveThing
  | TurnThing
  | ScaleThing
  | TuneThing
  | SetThingKeep
  | DismissThing
