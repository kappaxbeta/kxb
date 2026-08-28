/**
 * An XP that is not a level: a cartridge pointing at a game the host already has.
 *
 * ---------------------------------------------------------------------------
 * What this block is for
 * ---------------------------------------------------------------------------
 * Everything else in this format describes a *world* - pieces on a grid, bodies
 * with rules on them, a camera to watch it from - and the runtime draws it. That
 * covers a great deal and it does not cover a game whose rules are code:
 * `@kxb/boxing` is seventy-millisecond punch windows, a defender-authoritative
 * hit model and two sprite atlases, and there is no arrangement of blueprints
 * and triggers that is it.
 *
 * The temptation is to say such a game simply is not an XP, and to give it its
 * own route, its own store listing and its own way of being scheduled. That was
 * the first version and it is three parallel implementations of things the
 * product already has: the store lists XPs, the battle wizard picks an XP, a
 * match room opens an XP. A game outside that is a game outside all of it.
 *
 * So a framed XP is a **document that names a game instead of describing one**.
 * It is listed, picked, scheduled and opened by exactly the machinery that was
 * already there, and the one thing that changes is what gets mounted at the end.
 *
 * ---------------------------------------------------------------------------
 * The engine does not know what any of these are
 * ---------------------------------------------------------------------------
 * `game` is an opaque string and stays one. This package has no registry of
 * games, no import of one, and no opinion about what `"boxing"` means - the
 * *host* keeps that map, the same way it keeps the transport and the clock.
 *
 * That is not fastidiousness. A document naming a game the host has never heard
 * of has to be refusable *by the host*, with a sentence naming what is missing,
 * exactly like `backend.needs`. An engine that owned the list would be an engine
 * that has to be edited to add a game, which is the coupling this whole package
 * exists to avoid.
 *
 * ---------------------------------------------------------------------------
 * What a framed document does not have
 * ---------------------------------------------------------------------------
 * A world. `parseXp` stops requiring `world`, `blueprints`, `spawn` and `enter`
 * when this block is present, and materialises an empty world so that every
 * reader downstream - the battle's mode, the store's counts, the editor's
 * refusal to open one - goes on working against a shape it already understands
 * rather than against a new optional.
 *
 * It also stops checking `capabilities` against the world, and it has to: those
 * checks exist so that a level claiming `match` with one spawn is refused before
 * anybody plays it, and a framed game's spawns are inside code this package
 * cannot see. The claim is taken on trust here and is the framed game's to keep.
 */

import type { XpHost } from '../net/host'

/**
 * What every framed game is handed, whatever game it is.
 *
 * ---------------------------------------------------------------------------
 * The contract, so that mounting one is not a special case per game
 * ---------------------------------------------------------------------------
 * A host that hard-codes `if (game === 'boxing')` has a registry with one entry
 * and a second game's worth of plumbing still to write. This is the shape that
 * makes it a *list*: the platform builds these four things from the document and
 * its own facilities, and hands them over without knowing what it is mounting.
 *
 * Deliberately not a React type. This package holds no components - the renderer
 * is the host's job, and it is the host that turns this into props.
 *
 * What each game does with `settings` is its own business, and it is the only
 * field here whose meaning the platform does not know.
 */
export interface FrameProps {
  /**
   * Everything the game cannot supply for itself: who you are, how a message
   * reaches the other players, what time it is, somewhere to keep a result.
   *
   * Already checked against the document's `backend.needs` before it arrives -
   * see `missingCapabilities` in `../net/host`. A game may assume the
   * capabilities it declared are present, which is the whole point of declaring
   * them.
   */
  host: XpHost
  /**
   * The room. Everybody handed the same string is in the same instance.
   *
   * The *host's* room id, not a name the game invents: a battle passes its own
   * id, an XP room passes the room's, and a game that prefixed it would open a
   * channel inside the room that nobody else is on.
   */
  topic: string
  /**
   * Where this game's own files are served from, with no trailing slash.
   *
   * A game ships its art in its package and the platform publishes it
   * somewhere; which URL that is belongs to the deployment. See
   * `packages/boxing/src/art/characters.ts` for the same argument from the
   * game's side.
   */
  assets: string
  /**
   * Whether something is behind the game that should show through.
   *
   * Resolved from `XpFrame.background` so the game does not have to read the
   * document - it is handed the answer, like everything else here.
   */
  transparent: boolean
  /**
   * Whether the *platform* has already decided the match is on.
   *
   * ---------------------------------------------------------------------------
   * Three states, because there are three situations
   * ---------------------------------------------------------------------------
   * - `null` — nothing outside this game has a lobby. Run your own: show who is
   *   here, take their consent, start when they agree.
   * - `false` — something outside **does** have one, and it has not started yet.
   *   Show no lobby of your own and do not begin.
   * - `true` — that thing says go.
   *
   * A boolean could not say the first of those, and the first is the one that
   * was got wrong: a battle room has its own sides, its own ready buttons and
   * its own whistle, and a framed game that also ran a lobby produced *two* -
   * one saying "waiting for the start, 0/2 ready" while the other had already
   * fought a round above it. Both were working. Neither was listening to the
   * other, and a player pressing ready in one of them had no way to know which.
   */
  started: boolean | null

  /**
   * What the *host* decided about this particular match.
   *
   * ---------------------------------------------------------------------------
   * Not `settings`, and the difference is who wrote it
   * ---------------------------------------------------------------------------
   * `settings` below is the document's - the same on every copy of the game,
   * authored once. This is the room's: the wizard that scheduled this match
   * offers a time limit and a score limit, and somebody chose three minutes for
   * *this* fight and five for the next.
   *
   * They were not reaching the game at all. A host would set three minutes, the
   * lobby would say three minutes, and the game would play its own default -
   * which is the worst kind of setting, because it is displayed.
   *
   * Both are nullable and both mean *the game decides*, which is the honest
   * default: a game whose rounds are part of its design should not be forced to
   * invent a mapping for a number nobody set.
   */
  match: {
    /** The whole match's playing time, in seconds. */
    timeLimit: number | null
    /** First to this many, in whatever the game counts. */
    scoreLimit: number | null
  }

  /**
   * The document's own `frame.settings`, untouched.
   *
   * `unknown` because the platform has no schema for it and should not: it came
   * out of a file, and the game reads it the way `parseXp` reads a document.
   */
  settings: unknown
}

/** How the host should sit the game in the page. */
export const FRAME_BACKGROUNDS = ['transparent', 'own'] as const
export type FrameBackground = (typeof FRAME_BACKGROUNDS)[number]

export const isFrameBackground = (value: unknown): value is FrameBackground =>
  typeof value === 'string' && (FRAME_BACKGROUNDS as readonly string[]).includes(value)

/** The longest a game id may be. Long enough for a name, short enough to log. */
export const MAX_GAME_ID = 64

export interface XpFrame {
  /**
   * Which game, by a name the host knows.
   *
   * Opaque here - see the header. A host that does not recognise it refuses the
   * document and says which name it did not know, which is a far better failure
   * than a blank canvas.
   */
  game: string

  /**
   * What is behind it.
   *
   * `transparent` is the default and the reason is the room this is played in:
   * a match room is a page with its own background, a header and a rail, and a
   * game that paints its own black rectangle inside that is a hole cut in the
   * product. Transparent means the page shows through wherever the game does
   * not draw, which is what makes an embedded game look embedded.
   *
   * `own` is for a game whose picture goes to the edges and would rather not
   * composite against anything - a photograph, a video, a shader that assumes
   * it owns every pixel.
   */
  background?: FrameBackground

  /**
   * Anything the game itself wants, passed through untouched.
   *
   * Deliberately `unknown` and deliberately not validated here. This package
   * cannot know what a boxing match's settings are, and a schema for them would
   * be this package growing an opinion about every game anybody writes. The
   * host hands it to the game, and the game reads it the way `parseXp` reads a
   * document: carefully, because it came from a file.
   */
  settings?: unknown
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Read a `frame` block, or say why not.
 *
 * Returns `undefined` for an absent block, which is every document ever
 * written - the common case stays free, the same rule `rules`, `camera` and
 * `backend` follow.
 */
export function readFrame(
  raw: unknown,
  at: string,
  problems: { at: string; message: string }[],
): XpFrame | undefined {
  if (raw === undefined) return undefined

  if (!isObject(raw)) {
    problems.push({ at, message: 'not an object' })
    return undefined
  }

  const game = raw.game
  if (typeof game !== 'string' || game.length === 0) {
    problems.push({ at: `${at}.game`, message: 'missing' })
    return undefined
  }
  if (game.length > MAX_GAME_ID) {
    problems.push({ at: `${at}.game`, message: `longer than ${MAX_GAME_ID}` })
    return undefined
  }
  /**
   * A narrow alphabet, because this string is going to be a lookup key and,
   * in every host that has more than one game, very probably a path segment or
   * a chunk name. Refusing the exotic here costs an author nothing and means no
   * consumer downstream has to wonder whether it was sanitised.
   */
  if (!/^[a-z0-9][a-z0-9-]*$/.test(game)) {
    problems.push({ at: `${at}.game`, message: 'only lower-case letters, digits and dashes' })
    return undefined
  }

  if (raw.background !== undefined && !isFrameBackground(raw.background)) {
    problems.push({
      at: `${at}.background`,
      message: `expected one of ${FRAME_BACKGROUNDS.join(', ')}`,
    })
    return undefined
  }

  return {
    game,
    ...(raw.background !== undefined ? { background: raw.background } : {}),
    ...(raw.settings !== undefined ? { settings: raw.settings } : {}),
  }
}

/** What is behind a framed game, defaulted. See `XpFrame.background`. */
export const backgroundOf = (frame: XpFrame): FrameBackground =>
  frame.background ?? 'transparent'
