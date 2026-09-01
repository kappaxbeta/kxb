import { knownModel } from '@/domain/thingiverse/models'

/**
 * A thing you can drive.
 *
 * ---------------------------------------------------------------------------
 * Why this is a block on a blueprint and not a new kind of thing
 * ---------------------------------------------------------------------------
 * A kart is a bench with an engine: it stands in a cell, it is summoned and
 * dismissed, it has a model and pieces and seats, and somebody gets *into* it
 * with the same E that gets them onto a chair. Everything the thingiverse
 * already knows about a thing stays true of one you can drive - so driving is
 * one more optional block on `BlueprintSpec`, exactly as `use` is, and absent
 * means what absence has always meant: this is furniture.
 *
 * The block deliberately says nothing about *where* the driver sits. That is
 * `use.seats`' job, and the first seat is the wheel - a rule rather than a
 * field, because a field would let somebody author a vehicle whose driver's
 * seat is seat four, and then every surface that asks "who is driving this"
 * has to be told. See `drivable`.
 *
 * ---------------------------------------------------------------------------
 * Wheels are attachments, and the model's own wheels are free
 * ---------------------------------------------------------------------------
 * Many of the catalogue's vehicles ship with wheels already in the glTF, as
 * nodes named `wheel-front-left` and the like - the renderer finds those by
 * name and spins them without being told (see `isWheelNode`). `wheels` here is
 * for the other case: a body with no wheels of its own, or a crate somebody is
 * turning into a soapbox. Each one is a model bolted on at a joint, like a
 * `BlueprintPart`, plus the one fact a part does not have - whether it turns
 * with the steering.
 */

/** How many wheels one vehicle may carry. Two more than anything needs. */
export const MAX_WHEELS = 8

/** How far a wheel's joint may sit from the thing's origin. A part's bound. */
export const MAX_WHEEL_OFFSET = 8

/**
 * How big or small one wheel may be drawn.
 *
 * The same bounds a thing itself gets (`MIN_THING_SCALE`/`MAX_THING_SCALE`),
 * restated rather than imported because `blueprint.ts` imports this file and a
 * value going the other way is a cycle - the same reason `HELD_DEEDS` gives at
 * length in ./timeline.
 */
export const MIN_WHEEL_SCALE = 0.1
export const MAX_WHEEL_SCALE = 12

/**
 * What the drive tuning may be set to.
 *
 * `speed` is cells per second flat out. The floor is above walking pace by a
 * hair - a vehicle slower than legs is a joke somebody makes once - and the
 * ceiling is short of the dash, so the fastest thing in a room is still a
 * person committing to something. `turn` is radians per second at full lock
 * and full speed; past four the vehicle pivots like a shopping trolley.
 */
export const VEHICLE_LIMITS = {
  speed: { min: 2, max: 24 },
  turn: { min: 0.5, max: 4 },
} as const

/** One wheel, at a joint. */
export interface WheelSpec {
  /** A model id the catalogue knows, namespaced where it needs to be. */
  model: string
  /** Where the hub sits, in the thing's own frame, in cells. */
  at: { x: number; y: number; z: number }
  /** Multiplier on the wheel's own pack scale, exactly as a part's is. */
  scale: number
  /** Whether it turns with the steering. Front wheels do, back wheels do not. */
  steers: boolean
}

/** How it drives, and what it rolls on. */
export interface VehicleSpec {
  /** Top speed, in cells per second. See `VEHICLE_LIMITS`. */
  speed: number
  /** Turn rate at full lock, in radians per second. */
  turn: number
  /** Wheels bolted on at joints. Empty for a model that brought its own. */
  wheels: readonly WheelSpec[]
  /**
   * Whether the vehicle swallows whoever is aboard.
   *
   * False - and absent, for every vehicle drawn before this existed - is a
   * kart: the body sits on it in the open, which is what the seats place.
   * True is a car with a roof, or a giant football somebody is rolling about
   * *as*: no body is drawn for anyone aboard, yours included, and the vehicle
   * is the whole of what the room sees moving. Names, bubbles and health stay
   * over it - a person is still there, they are just inside.
   */
  hideDriver?: boolean
}

/** What a fresh vehicle is: brisker than a sprint, turns like a car. */
export function freshVehicle(): VehicleSpec {
  return { speed: 14, turn: 2.2, wheels: [] }
}

/** A wheel at the origin, its own size, on a fixed joint. */
export function freshWheel(model: string): WheelSpec {
  return { model, at: { x: 0, y: 0, z: 0 }, scale: 1, steers: false }
}

/**
 * Whether getting behind the wheel of this is a thing somebody can do.
 *
 * Both blocks, because each carries half the answer: `vehicle` says how it
 * drives, and `use` says where the body goes while it does. A vehicle with no
 * seat would be a thing that drives itself, which nothing in a room can
 * promise; `vehicleProblems` says so in words, and this is the cheap check
 * every prompt and key handler asks per frame.
 */
export function drivable(spec: {
  vehicle?: VehicleSpec
  use: { seats: readonly unknown[] } | null
}): boolean {
  return Boolean(spec.vehicle && spec.use && spec.use.seats.length > 0)
}

/**
 * Whether a node inside a model's own glTF is a wheel.
 *
 * By name, which is the only thing the catalogue records about a node - and
 * the packs are consistent enough for it to work: `wheel-front-left`,
 * `car_sedan_wheel_rear_right`, `wheel-back-left` all say the word. A node
 * that happens to be called `wheelbarrow` would spin, which is the price of
 * asking a name rather than a rig, and it is a price paid only by whoever
 * marks that model drivable.
 */
export function isWheelNode(name: string): boolean {
  return /(^|[-_])wheels?([-_]|$)/i.test(name)
}

/** Whether a wheel node steers. The packs put it in the name: `front`. */
export function isSteeringNode(name: string): boolean {
  return isWheelNode(name) && /front/i.test(name)
}

/**
 * Whatever is wrong with a vehicle block, said in words.
 *
 * Its own function for the reason `usingProblems` is: the editor draws the
 * vehicle as its own section and wants to mark that section, and the caller
 * holding a half-built spec can ask about the wheels without hearing about a
 * clip it has not filled in yet.
 */
export function vehicleProblems(
  vehicle: VehicleSpec,
  use: { seats: readonly unknown[] } | null,
): string[] {
  const problems: string[] = []

  if (!use || use.seats.length === 0) {
    problems.push('a vehicle needs a seat to drive it from')
  }

  if (
    !Number.isFinite(vehicle.speed) ||
    vehicle.speed < VEHICLE_LIMITS.speed.min ||
    vehicle.speed > VEHICLE_LIMITS.speed.max
  ) {
    problems.push(
      `top speed must be between ${VEHICLE_LIMITS.speed.min} and ${VEHICLE_LIMITS.speed.max}`,
    )
  }

  if (
    !Number.isFinite(vehicle.turn) ||
    vehicle.turn < VEHICLE_LIMITS.turn.min ||
    vehicle.turn > VEHICLE_LIMITS.turn.max
  ) {
    problems.push(
      `turning must be between ${VEHICLE_LIMITS.turn.min} and ${VEHICLE_LIMITS.turn.max}`,
    )
  }

  if (vehicle.wheels.length > MAX_WHEELS) {
    problems.push(`a vehicle rolls on at most ${MAX_WHEELS} wheels`)
  }

  for (const wheel of vehicle.wheels) {
    if (!knownModel(wheel.model)) {
      problems.push(`${wheel.model} is not a model we ship`)
    }
    for (const axis of ['x', 'y', 'z'] as const) {
      const value = wheel.at[axis]
      if (!Number.isFinite(value) || Math.abs(value) > MAX_WHEEL_OFFSET) {
        problems.push(`a wheel must be within ${MAX_WHEEL_OFFSET} cells of the thing`)
      }
    }
    if (
      !Number.isFinite(wheel.scale) ||
      wheel.scale < MIN_WHEEL_SCALE ||
      wheel.scale > MAX_WHEEL_SCALE
    ) {
      problems.push(
        `a wheel's size must be between ${MIN_WHEEL_SCALE} and ${MAX_WHEEL_SCALE}`,
      )
    }
  }

  return problems
}
