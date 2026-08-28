/**
 * `@kxb/xp` - what an XP is, and what it takes to run one.
 *
 * ---------------------------------------------------------------------------
 * Why this is a package and not a folder
 * ---------------------------------------------------------------------------
 * It was a folder - `src/domain/xp/` - guarded by an ESLint rule that forbade
 * reaching into the rest of the app. That rule works and it is the wrong shape
 * for this, for two reasons.
 *
 * The first is that a lint rule guards the *inside* and says nothing about the
 * outside: every file under that folder was importable from anywhere, so the
 * engine had no public surface. It had eleven files and eleven entry points.
 * A package's `exports` map is the API, enforced by resolution rather than by a
 * rule somebody can disable with a comment - which is the difference between a
 * boundary and a convention with good intentions.
 *
 * The second is where this is going. v2 of docs/xp/creator.md is handing an XP
 * to somebody else to run on their own infrastructure, and the distance between
 * "a folder in our app" and "something you can install" is the whole of that
 * work. The distance between "a private workspace package" and the same thing
 * is a version number and a registry. Doing it now, while the engine is a dozen
 * files, costs an afternoon; doing it after the editor and four game modes are
 * inside it costs a fortnight.
 *
 * ---------------------------------------------------------------------------
 * The surface
 * ---------------------------------------------------------------------------
 * Five entry points, and the split is deliberate - each one is a different
 * question a consumer has:
 *
 * | Import | What it answers |
 * |---|---|
 * | `@kxb/xp` | the document, and how to read one safely |
 * | `@kxb/xp/engine` | how a body moves and what it can stand on |
 * | `@kxb/xp/catalogue` | what art exists and how big each piece is |
 * | `@kxb/xp/packs` | where that art comes from, and under what licence |
 * | `@kxb/xp/host` | what *you* have to provide to run this |
 *
 * The last one is the interesting one. Everything else in here is pure - it
 * takes numbers and returns numbers, runs under `bun test` with no browser, no
 * canvas and no network. `@kxb/xp/host` is the hole where the world goes: an
 * identity, a way to send a message to the other players, a clock. The package
 * declares those as interfaces and implements none of them, which is what lets
 * the same engine run against our Supabase, against two tabs on a laptop, and
 * one day against a backend we have never seen.
 */

export {
  DEFAULT_MARK_HEIGHT,
  DEFAULT_MARK_WIDTH,
  describeProblems,
  enterOf,
  isScriptName,
  MAIN_SCENE,
  MAX_ENTITIES,
  MAX_MARK_SIZE,
  MAX_PLACEMENTS,
  MAX_REACH,
  MAX_SCRIPT_LENGTH,
  MAX_SIGN_TEXT_LENGTH,
  parseXp,
  placeOf,
  WORLD_HEIGHT,
  WORLD_RADIUS,
  XP_FORMAT,
  type PackRef,
  type Placement,
  type XpDocument,
  type XpParse,
  type XpProblem,
  type EntitySpec,
  type Mark,
  DEFAULT_LIGHT,
  MAX_LIGHT_ANGLE,
  MAX_LIGHT_INTENSITY,
  MAX_LIGHT_RANGE,
  MAX_LIGHTS,
  MAX_KEY_COOLDOWN,
  MAX_PLAYER_KEYS,
  MAX_ROLE_LENGTH,
  MAX_ROLES,
  RESERVED_KEYS,
  whyReserved,
  type PlayerKey,
  PLAYER_LOOKS,
  type PlayerLook,
  type PlayerRole,
  type XpScene,
  type XpSpawn,
  type XpWorld,
} from './document/format'

/**
 * Bringing a document saved under an older parser forward to this one.
 *
 * Beside `parseXp` because it is the half of reading a stored document that
 * `parseXp` deliberately refuses to do. See `./repair` for the line between
 * them, and for what is allowed in it.
 */
export { repairXp, type XpRepair } from './document/repair'

export {
  BODY_FIELDS,
  BODY_LIMITS,
  bodyProblems,
  isMaterial,
  MATERIALS,
  MAX_COLLIDER_BOXES,
  SUGGESTED_TAGS,
  tagsInUse,
  type BodySpec,
} from './document/blueprints'
/**
 * The defaults a body falls back to, for a panel that wants to show them.
 *
 * From `@kxb/xp/bodies`, which is the engine barrel's business rather than the
 * document's - but a field left blank in the editor has to say *what it will be
 * instead*, and that number lives with the simulation. One import rather than a
 * copy in the panel that drifts the first time a default is retuned.
 */
export { BODY_DEFAULTS } from './world/bodies'
export type {
  Blueprint,
  ColliderSpec,
  Light,
  Part,
  PlacementBox,
  PlacementCollider,
  XpMaterial,
} from './document/blueprints'

/**
 * Where the world is watched from, beside the mode it is played in.
 *
 * Read `./camera` before using it: the block is an input mode that happens to
 * also move the camera.
 */
export {
  CAMERA_AXES,
  CAMERA_KINDS,
  cameraFieldsFor,
  cameraFor,
  cameraOf,
  cameraProblems,
  DEFAULT_ABOVE,
  DEFAULT_AXIS,
  DEFAULT_BEHIND,
  DEFAULT_BESIDE,
  DEFAULT_CAMERA,
  DEFAULT_DISTANCE,
  DEFAULT_FAR,
  DEFAULT_FOV,
  DEFAULT_SPAN,
  describeCameraKind,
  isCameraKind,
  isDefaultCamera,
  type CameraAxis,
  type CameraKind,
  type XpCamera,
} from './world/camera'

/**
 * The rules vocabulary, from the document's entry point rather than the
 * engine's.
 *
 * Both are true - a trigger is a thing the engine fires and a thing a document
 * declares - and the consumer that decided it is the editor: a panel that edits
 * `blueprints[x].triggers` is editing the *document*, and reaching into
 * `@kxb/xp/engine` to name the type of a field it is writing would say the
 * opposite. The engine keeps its own export for the runtime.
 */
export {
  COMPARISONS,
  DATA_REF,
  isDataRef,
  refField,
  releasedKeys,
  TRIGGER_EVENTS,
  valueOf,
  type Comparison,
  type Condition,
  type DataRef,
  type Trigger,
  type TriggerEvent,
} from './rules/triggers'

export { isXpId, resolveScene } from './rules/verbs'
export type { SceneWho, Verb, VerbTarget } from './rules/verbs'

export {
  CAPABILITIES,
  capabilityProblems,
  describeCapability,
  isCapability,
  type Capability,
  type XpCapabilities,
} from './document/capabilities'

/**
 * The mode, beside the capabilities it is checked against.
 *
 * Same entry point as `./capabilities` and for the same reason: both are things
 * the *document* declares and both are edited by a panel, so a consumer writing
 * `xp.rules.preset` should not have to know which module inside the package it
 * came from.
 */
export {
  ASSIGNS,
  DEFAULT_ASSIGN,
  SEATS_ONE,
  takesTurns,
  DEFAULT_RULES,
  describeAssign,
  describePreset,
  describeSides,
  PRESETS_EN,
  isAssign,
  isDefaultRules,
  isMode,
  isPreset,
  isRoleView,
  isSides,
  MAX_DECLARED_PLAYERS,
  playersOf,
  MODES,
  modeOf,
  DEFAULT_MODE,
  PRESETS,
  presetNeeds,
  ROLE_VIEWS,
  roleRule,
  rulesOf,
  rulesProblems,
  seenAs,
  SIDES,
  sidesOf,
  teamColour,
  TEAM_COLOURS,
  teamsOf,
  viewsOf,
  type Assign,
  type Mode,
  type Preset,
  type RoleRule,
  type RoleView,
  type Sides,
  type XpRules,
} from './document/rules'

/**
 * What a level keeps, declared by the level.
 *
 * Re-exported beside `rules` because a caller reading `xp.data.coins.scope`
 * should not have to know which module inside the package the shape came from
 * — the same argument the block above makes about `xp.rules.preset`.
 */
export {
  DATA_NAME,
  DATA_SCOPES,
  dataOf,
  defaultsOf,
  describeScope,
  MAX_DATA_FIELDS,
  NO_DATA,
  readData,
  renameField,
  arbitrated,
  persists,
  shares,
  storeKeyOf,
  undeclared,
  withField,
  withoutField,
  type DataScope,
  type XpData,
  type XpField,
} from './document/data'

/**
 * Where somebody was when they last stopped playing, and which levels care.
 *
 * Exported from the index rather than as its own entry point because both
 * halves are wanted in the same breath: the runtime asks `resumes` before it
 * decides where to put a body, and `readProgress` the moment the store answers.
 */
export { PROGRESS_KEY, readProgress, resumes, type XpProgress } from './world/progress'

/**
 * A cartridge: an XP that names a game the host has, instead of describing a
 * world.
 *
 * On the root beside `rules` and `camera` because it is the same kind of thing -
 * a block on the document that the runtime and the store both read - and because
 * the question a consumer asks is "is this a level or a cartridge", which is not
 * a question about art or about the wire.
 */
export {
  FRAME_BACKGROUNDS,
  MAX_GAME_ID,
  backgroundOf,
  isFrameBackground,
  type FrameBackground,
  type FrameProps,
  type XpFrame,
} from './document/frame'

/**
 * What a level's cartridge is made of, on a shelf.
 *
 * Exported as a value list as well as a type because the editor draws a picker
 * from it - a second copy of these seven names in the app is a set that goes
 * out of date the first time one is added.
 */
export {
  DEFAULT_FINISH,
  FINISHES,
  HUES,
  isFinish,
  isHue,
  type Finish,
} from './document/finish'

export { TEMPLATES, templateById, type XpTemplate } from './document/templates'

export { presetFor, presetNames, type BlueprintPreset } from './document/presets'

/**
 * Whether the people in this level may say anything.
 *
 * Beside `camera` and `rules` because it is the same kind of thing: a block on
 * the document that the runtime and the editor both read, and whose default is
 * a decision rather than a fallback. See `./talk` for why absent means on.
 */
export { DEFAULT_TALK, isDefaultTalk, talkOf, type Talking, type XpTalk } from './document/talk'
export {
  baseOf,
  canonicalLocale,
  isEmptyWords,
  isLocaleCode,
  MAX_LOCALES,
  MAX_PHRASE_KEY,
  MAX_PHRASE_TEXT,
  MAX_PHRASES,
  phrasesIn,
  translator,
  type XpPhrases,
  type XpWords,
} from './document/words'

/**
 * The animation graph, from `@kxb/xp/animation`.
 *
 * Re-exported here as well as on its own path for the reason every other block
 * of the format is: `parseXp` hands one back, so the type belongs where the
 * document type is.
 */
export {
  ANIMATION_NAME,
  isLayer,
  MAX_ANIMATION_NAME,
  MAX_STATES,
  MAX_TRANSITIONS,
  type AnimationGraph,
  type AnimationState,
  type AnimationTransition,
} from './document/animation'

/**
 * The rounds and phases a level plays, when it describes its own.
 *
 * On the root rather than the engine barrel, unlike `aimOf`: a flow is part of
 * what a document *is* - the editor edits it, the parser refuses it, an export
 * carries it - rather than something happening inside a running one.
 */
export {
  allowedFor,
  allowedIn,
  flowFor,
  flowProblems,
  MAX_PHASES,
  MAX_ROUNDS,
  MAX_SAYS,
  MAX_STEPS,
  phaseCountdown,
  RESERVED_GOES,
  ROUND_AGAIN,
  RUN_OVER,
  stepFrom,
  type FlowPhase,
  type FlowStep,
  type XpFlow,
} from './document/flow'
/** The shapes a round usually has - see `applyFlowStarter` in ./document/edit. */
export {
  FLOW_STARTERS,
  flowStarterById,
  type FlowStarter,
  type FlowStarterId,
} from './document/flow-starters'
