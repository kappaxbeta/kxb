/**
 * The sounds a level can ask for, and which files each one is.
 *
 * docs/xp/backlog.md §0.5's *"sound effects, as a pack"*. The shape is the art
 * packs' shape: a directory under `public/xp/packs/`, its own address space, and
 * a document names a member of it — `sfx/hit` reads exactly like
 * `proto/Primitive_Wall` and for the same reason.
 *
 * ---------------------------------------------------------------------------
 * Hand-written, where the model catalogue is generated
 * ---------------------------------------------------------------------------
 * The entry asked for "a generated catalogue", and that is right for models:
 * `xp:catalogue` lists what is in a directory, and a directory listing is the
 * whole truth about a folder of glTFs.
 *
 * It is not the whole truth about sound. Five recordings of a punch are **one**
 * sound with five takes, not five sounds — an author wants `hit`, and a picker
 * offering `impactPunch_medium_003` is a picker that makes them audition files.
 * Grouping takes, and saying how loud a jingle is next to a footstep, is
 * judgement rather than a listing, which is exactly why the lounge's own
 * `src/lib/audio/catalogue.ts` is hand-written too.
 *
 * What is generated instead is the *check*: `sounds.test.ts` asserts every file
 * named here is on disk, which is the property a listing would have given and
 * the one that actually breaks. A name with no file behind it is silence in
 * play, which is the failure this whole family of bugs keeps taking.
 *
 * ---------------------------------------------------------------------------
 * Not a `PACKS` entry, and why not
 * ---------------------------------------------------------------------------
 * The entry guessed this would be one. `Pack` is `ext`, `scale`, `lift` and
 * `prefix` — every field is about putting a mesh on a grid, and a sound has
 * none of them. Adding one would have meant inventing a scale for a punch.
 *
 * What it does share is the part that matters when an XP is handed to somebody:
 * the licence and where the files came from, which travel the same way a model
 * pack's do. See `SFX`.
 */

/** Where the files live. One directory, like a model pack's `path`. */
export const SOUND_PACK = {
  id: 'sfx',
  label: 'Sound effects',
  path: '/xp/packs/sfx',
  ext: '.ogg',
  author: 'Kenney',
  /**
   * CC0, typed as the literal for the reason `Pack.licence` is: an XP is meant
   * to be handed over, and the moment audio with conditions gets in, that stops
   * being free.
   */
  licence: 'CC0' as const,
  source: 'https://kenney.nl/assets/impact-sounds',
}

export interface XpSound {
  /**
   * The takes this sound can use, as bare filenames without the extension.
   *
   * More than one where a sound repeats: five punches cycled read as a fight,
   * and one punch played five times reads as a bug. Copied reasoning from the
   * lounge's catalogue, which learned it the hard way.
   */
  takes: readonly string[]
  /**
   * How loud, relative to the others, before the player's own volume applies.
   *
   * The packs are not mastered to a common level and a jingle is a great deal
   * hotter than a tap.
   */
  gain: number
  /**
   * The shortest gap between two plays, in milliseconds.
   *
   * A trigger can fire every frame — a rule on `collide` against a wall you are
   * leaning on will — and sixty taps a second is not a sound, it is a buzz and
   * sixty overlapping voices. A floor here is simpler than asking every rule to
   * be sensible, and it is the kind of thing that only wants to live once.
   */
  minGapMs: number
}

/**
 * Eight sounds, named for what happens rather than for what recorded it.
 *
 * The names are the vocabulary an author types, so they are verbs and nouns
 * from a level's world — `hit`, `land`, `pickup` — and never the pack's own
 * filenames, which are a fact about who drew them.
 */
export const XP_SOUNDS: Record<string, XpSound> = {
  /** A blow landing on something. Five takes, because fights repeat. */
  hit: { takes: numbered('impactPunch_medium', 5), gain: 1, minGapMs: 0 },
  /** Something heavy meeting the floor. */
  thud: { takes: numbered('impactPlank_medium', 5), gain: 0.9, minGapMs: 60 },
  /** Feet, or anything soft arriving. */
  land: { takes: numbered('impactSoft_heavy', 5), gain: 0.8, minGapMs: 80 },
  /** A light knock — a door, a crate, a bat on a ball. */
  tap: { takes: numbered('impactWood_light', 5), gain: 0.7, minGapMs: 40 },
  /** Something gained: a coin, a pickup, a door opening. */
  pickup: { takes: ['highUp'], gain: 0.6, minGapMs: 80 },
  /** Something lost or refused. The other half of `pickup`. */
  drop: { takes: ['lowDown'], gain: 0.6, minGapMs: 80 },
  /** A button, a switch, a confirmation. */
  click: { takes: ['click_002'], gain: 0.5, minGapMs: 40 },
  /**
   * A win, a round ending, a fanfare.
   *
   * Quietest of the lot at 0.35 and a full second of floor: it is the longest
   * and hottest file in the pack, and two of them overlapping is a mess in a
   * way two punches are not.
   */
  fanfare: { takes: ['jingles-retro_09'], gain: 0.35, minGapMs: 1000 },
}

/** `impactPunch_medium` and 5 → `impactPunch_medium_000` … `_004`. */
function numbered(stem: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${stem}_${String(index).padStart(3, '0')}`)
}

/** Every name a document may use, for the editor's picker and for the parser. */
export const SOUND_NAMES: readonly string[] = Object.keys(XP_SOUNDS).sort()

/**
 * Is this a sound this build can play?
 *
 * The guard the parser uses, and it is a *closed* list rather than a shape
 * check — unlike `pose`, which is validated for shape only because which clips
 * exist is a fact about the host. The difference is real: a clip that does not
 * load leaves a body in its last pose, which is visible, while a sound that
 * does not load is silence, which is indistinguishable from a rule that never
 * fired. So this refuses in the editor, where it is cheap.
 *
 * It also means a name never reaches a URL unchecked, which is the same
 * argument `isXpId` makes: `soundUrl` builds a path out of this string.
 */
export function isSound(value: unknown): value is string {
  return typeof value === 'string' && Object.hasOwn(XP_SOUNDS, value)
}

/**
 * One take of a sound, as a URL the host can fetch.
 *
 * `pick` is handed in rather than taken from `Math.random`, which this package
 * does not have — see `random.ts`. Unlike a die roll it does **not** have to
 * agree between clients: a sound is presentation, and two people hearing
 * different takes of the same punch is what makes a fight sound like a fight.
 * The host passes whatever it likes.
 */
export function soundUrl(name: string, pick: number): string | null {
  /**
   * Through `isSound` rather than a truthiness check on the lookup.
   *
   * `XP_SOUNDS['__proto__']` is `Object.prototype` — truthy, and then `.takes`
   * is undefined and this throws. A plain index into a `Record` walks the
   * prototype chain, which is why `isSound` reaches for `Object.hasOwn`, and
   * why the one guard is used at both doors rather than written twice.
   */
  if (!isSound(name)) return null
  const sound = XP_SOUNDS[name]!
  const take = sound.takes[Math.floor(pick * sound.takes.length) % sound.takes.length]
  return take ? `${SOUND_PACK.path}/${take}${SOUND_PACK.ext}` : null
}
