/**
 * `@kxb/xp/engine` - how a body moves, and what it can stand on.
 *
 * Everything here is pure: numbers in, numbers out, no browser, no canvas, no
 * clock of its own. That is not a style preference - it is what lets the engine
 * be tested at all. The Browser pane this is developed in never fires
 * `requestAnimationFrame`, so a running scene cannot be watched; the only way
 * to know whether walking into a wall works is to ask a function.
 *
 * A host drives it: read the input, call `step` once a frame with the delta you
 * were given, put the answer on the camera. What the engine never does is find
 * out what time it is or what key is down.
 */

export {
  AIR_JUMP_SPEED,
  EYE_HEIGHT,
  GRAVITY,
  JUMP_SPEED,
  DASH_SECONDS,
  jumpHeightOf,
  jumpSpeedFor,
  OUT_OF_WORLD,
  MAX_FALL_SPEED,
  MAX_JUMPS,
  PERSONAL_SPACE,
  PLAYER_RADIUS,
  blocked,
  separate,
  SPRINT_PACE,
  step,
  underfoot,
  WALK_PACE,
  type Blocker,
  type BounceTest,
  type SolidTest,
  type SurfaceTest,
  type StepInput,
  type StepResult,
  type Vec3,
} from './physics'

export {
  boxesOverlap,
  composeTurn,
  drawnModels,
  entityBox,
  isFlat,
  partTransforms,
  stretchOf,
  tiltedBox,
  turnOf,
  turnPoint,
  type Blueprint,
  type BodySpec,
  type Box,
  type ColliderSpec,
  type Part,
  type Stretch,
  type Turn,
} from '../document/blueprints'

export {
  blockersOf,
  bodiesFor,
  bodyScaleFor,
  BUILT_IN_BODY,
  BUILT_IN_BODY_SCALE,
  activate,
  deactivate,
  despawn,
  drawList,
  emptyWorld,
  entityByName,
  movePlayer,
  isDead,
  PLAYER_ID,
  PLAYER_NAME,
  propsOf,
  spawnEntities,
  revivePlayer,
  spawnPlayer,
  stepReturns,
  spawnWeapon,
  TEAM_PROP_PREFIX,
  teamProp,
  WEAPON_ID,
  WEAPON_NAME,
  withTag,
  worldTransform,
  type EntityId,
  type EntityWorld,
  type PlayerFacts,
  type WorldTransform,
} from './entities'

/**
 * Things that fall, roll and get shoved. See `@kxb/xp/bodies`.
 *
 * On the engine barrel beside `step` rather than on its own entry point,
 * because it is the same job for a different kind of thing: `step` is how a
 * *person* moves and this is how everything else does. A host that drives one
 * drives the other in the same frame loop, from the same solids and the same
 * clamped delta, and splitting them across two imports would suggest they are
 * alternatives.
 */
export {
  BODY_DEFAULTS,
  BOUNCE_FLOOR,
  bodyOf,
  embedded,
  MAX_BODY_SPEED,
  push,
  REST_SPEED,
  SHOVE_REACH,
  nearBody,
  shoverBox,
  stepBodies,
  velocityOf,
  type BodyInput,
  type Contact,
  type Shover,
} from './bodies'

/**
 * The gap between where a thing is and where it is drawn. See `@kxb/xp/drawing`.
 *
 * On the barrel rather than its own entry point because it is the same frame
 * loop as everything else here - the host that steps the bodies is the host that
 * draws them - and because nothing outside a renderer has any business reading
 * it. Its own header is the argument for why it exists at all.
 */
export {
  EASE_SECONDS,
  Rolling,
  SNAP_BEYOND,
  Smoothing,
  type Point,
  type Spin,
} from './drawing'

export {
  COMPARISONS,
  damage,
  fire,
  holds,
  MAX_SIGNALS,
  releasedKeys,
  stepEmitted,
  stepHits,
  stepSpawned,
  stepTriggers,
  TRIGGER_EVENTS,
  type Comparison,
  type Condition,
  type Crossed,
  type Overlaps,
  type Prober,
  type Said,
  type Trigger,
  type TriggerClock,
  type TriggerEvent,
} from '../rules/triggers'

export {
  applyVerb,
  applyVerbs,
  RUNTIME_ID_BASE,
  type Effect,
  type Verb,
  type VerbContext,
  type VerbTarget,
} from '../rules/verbs'

export {
  Crowd,
  delayFor,
  INTERPOLATION_DELAY,
  lerpAngle,
  sampleAt,
  sendDue,
  STALE_AFTER,
  type Placed,
  type Sample,
} from '../net/presence'

export {
  armedWith,
  castRay,
  chaseDistance,
  DEFAULT_RANGE,
  personBox,
  targetsOf,
  type CastOptions,
  type Hit,
  type PersonTarget,
  type Target,
} from './shooting'

export {
  boxReach,
  DEFAULT_REACH,
  SWING_COSINE,
  swungAt,
  type Swung,
  type SwingOptions,
} from './swinging'

export {
  buildSolids,
  cellKey,
  MAX_SOLID_CELLS,
  placementCells,
  placementSolid,
  solidsFor,
  standingSurface,
  type CellBox,
  type PlacementSolid,
  type Solids,
} from './solids'

/**
 * The shared stream, for a host that has to roll something the rules asked for.
 *
 * Here as well as on `@kxb/xp/script` - which re-exports it for the one caller
 * that has to hash a seed for the interpreter - because a `damage … upTo` is a
 * *rule*, and a runtime should not have to import the scripting module (and the
 * interpreter behind it) to fill in `TriggerClock.random`. Same three numbers,
 * same file, see ./random.
 */
export { randomAt, randomBits, seedFrom } from '../net/random'

/**
 * What a press would do, for a runtime that wants to say so before it happens.
 *
 * On the engine barrel rather than the root because it is a *frame* question -
 * asked once per tick beside the trigger pass, from the same world - and the
 * root export is what a document is, not what is happening in one.
 */
export { aimOf, pressOn, type Aim } from './aim'

/**
 * And whether the key that press came from is still warm.
 *
 * Beside `pressOn` for its reason and on the same terms: a cooldown is a frame
 * question asked of a keystroke, not a fact about a document, so it belongs on
 * the engine barrel rather than the root. What a level *says* about a wait -
 * `PlayerKey.cooldown` - is format, and stays there.
 */
export { coolingFraction, coolingLeft, cooldownsOf, throughCooling } from './cooldowns'
export { stepDowned, type Downed } from './downed'
