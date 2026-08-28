/**
 * `@kxb/boxing` - a boxing match, and the wire it is played over.
 *
 * ---------------------------------------------------------------------------
 * What this is, and what it is not
 * ---------------------------------------------------------------------------
 * It is a game that *integrates* `@kxb/xp` as an SDK. It is not an XP: there is
 * no document, no level, nothing the editor can open and nothing the runtime
 * loads. It imports the ports in `@kxb/xp/host` - an identity, a transport, a
 * clock, an authority - and in exchange gets multiplayer against our Supabase,
 * against two tabs on a laptop, or against a backend nobody here has seen.
 *
 * That is the distinction worth keeping: `@kxb/xp` is a general engine with a
 * general document, and a fighting game is a pile of very specific rules about
 * seventy-millisecond windows. Expressing those as a level would mean bending
 * both. Importing five interfaces does not bend anything.
 *
 * ---------------------------------------------------------------------------
 * The surface
 * ---------------------------------------------------------------------------
 * | Import | What it answers |
 * |---|---|
 * | `@kxb/boxing` | the match: state, rules, one step |
 * | `@kxb/boxing/moves` | the frame data - what a punch costs and how long it takes |
 * | `@kxb/boxing/net` | play one over an `XpHost` |
 * | `@kxb/boxing/wire` | what goes over the socket, and how to read it |
 * | `@kxb/boxing/arbiter` | the result, at the one tier no client may decide |
 * | `@kxb/boxing/art` | which cell of which atlas draws which move |
 *
 * Everything except `./net` and `./arbiter` is pure: numbers in, numbers out,
 * no browser, no canvas, no network. `bun test packages/boxing` runs whole
 * three-round matches in milliseconds, which is the only reason the rules can
 * be trusted - the Browser pane this was built in never fires
 * `requestAnimationFrame`, so a running fight cannot be watched.
 */

export {
  KNOCKOUT_PUNCH,
  CLOSEST,
  CORNERS,
  MAX_HEALTH,
  MAX_STAMINA,
  NO_INTENT,
  REGEN,
  RING_HALF,
  RISEN_HEALTH,
  ROUNDS,
  ROUND_RECOVERY,
  ROUND_SECONDS,
  SHORTEST_ROUND,
  LONGEST_ROUND,
  roundsOf,
  REST_SECONDS,
  THREE_KNOCKDOWN,
  WALKOUT_SECONDS,
  cornerOf,
  elapsedOf,
  facingOf,
  fighter,
  free,
  gapOf,
  newFight,
  opposite,
  score,
  stepFight,
  type Corner,
  type Fight,
  type FightEvent,
  type FightInput,
  type Fighter,
  type Intent,
  type Phase,
  type RoundCard,
  type Verdict,
} from './rules/fight'

/**
 * The contact rules, from the root rather than their own entry point.
 *
 * Both halves are wanted in the same breath: a caller reading a `contact` off a
 * `FightEvent` needs the type, and a HUD drawing it needs to know whether it
 * took any health. Two imports for one switch statement would be a door nobody
 * thanks you for.
 */
export {
  COUNTER,
  healthCost,
  resolve,
  staggers,
  type Contact,
  type Defence,
} from './rules/contact'

export {
  BODY_RADIUS,
  CHIP,
  MOVES,
  PARRY_STUN,
  PIXEL,
  PUNCHES,
  durationOf,
  isPunch,
  phaseOf,
  type Move,
  type MoveKind,
  type MoveName,
  type MovePhase,
  type PunchName,
} from './rules/moves'

/**
 * The characters, from the root as well as `./art`.
 *
 * Because picking one is a thing a *host* does before it draws anything - which
 * corner is which fighter - rather than something the animation code does. A
 * caller that only wants to know who is in the red corner should not have to
 * reach for the module that knows about texture rows.
 */
export {
  BOXER,
  CHARACTERS,
  HITMAN,
  characterById,
  characterFor,
} from './art/characters'
export type { Character } from './art/sprites'

export { BOXING_BG, BOXING_DE, BOXING_EN, say, wordsFor, type BoxingWords } from './play/words'
