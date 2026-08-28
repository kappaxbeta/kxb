/**
 * Every sound the app can make, and what each one is for.
 *
 * One table rather than paths typed at the call sites, for two reasons. The
 * packs under public/audio are named after what was recorded - a punch, a
 * plank, a rising blip - and the scenes care about what *happened* - a hit, a
 * block placed, somebody arriving. Naming the event here means swapping the
 * recording is an edit to one line, and it means the scene code reads as the
 * game rather than as a file listing.
 *
 * The second reason is that the pack filenames are the one thing in this
 * feature that cannot be checked by the type system - they are strings that
 * must match files on disk. Keeping them together is what makes them auditable
 * in one glance, and what lets `catalogue.test.ts` walk the whole table.
 */

/** Pack roots. The directory names have spaces in them; see `asset`. */
const IMPACT = '/audio/Impact Sounds/Audio'
const DIGITAL = '/audio/Digital Audio/Audio'
const INTERFACE = '/audio/Interface Sounds/Audio'
const JINGLES = '/audio/Music Jingles/Audio (Retro)'

/**
 * A path the browser will actually fetch.
 *
 * The pack directories ship with spaces and parentheses in their names, and
 * while `fetch` would encode a space for us, it leaves other characters alone
 * and the encoding rules differ subtly between `fetch`, `<audio src>` and a
 * `new URL()`. Encoding once, here, means every consumer is handed the same
 * string and none of them has to know the assets came out of a zip with human
 * folder names in it.
 */
function asset(path: string): string {
  return encodeURI(path)
}

/** `impactPunch_medium_000.ogg` … `_004.ogg`, as one call. */
function numbered(root: string, stem: string, count: number): readonly string[] {
  return Array.from({ length: count }, (_, index) =>
    asset(`${root}/${stem}_${String(index).padStart(3, '0')}.ogg`),
  )
}

/**
 * The background loop.
 *
 * The copy at the root of public/audio rather than the one inside the Music
 * Loops pack: it is the track this app plays, and a file the rest of the pack
 * can be deleted around should the licence ever change.
 */
export const MUSIC_TRACK = asset('/audio/Mission Plausible.ogg')

/**
 * The events worth hearing.
 *
 * Chosen so that the four things the game does *to you* - being hit, somebody
 * arriving, a goal, a block landing - each have their own voice, and nothing
 * else does. Every sound added past that point is one more thing competing with
 * those four for the player's attention.
 */
export type SoundId =
  /** You landed a hit on somebody. */
  | 'hit'
  /** Somebody landed one on you. Distinct from `hit`, so you can tell which way it went. */
  | 'hurt'
  /** Your health reached zero. */
  | 'defeat'
  /** Somebody walked into the room you are in. */
  | 'arrive'
  /** Somebody left it. */
  | 'depart'
  /** A goal, or a match won. */
  | 'win'
  /** A block placed. */
  | 'build'
  /** A block taken away. */
  | 'demolish'
  /** A button in the audio settings, so the sliders can be heard while dragged. */
  | 'click'

interface Sound {
  /**
   * The recordings this event can use. More than one where the sound repeats
   * often: five punches cycled at random read as a fight, and one punch played
   * five times reads as a bug.
   */
  variants: readonly string[]
  /**
   * How loud this event is relative to the others, before the player's own
   * volume is applied. The packs are not mastered to a common level and a
   * jingle is a great deal hotter than a footstep.
   */
  gain: number
  /**
   * The shortest gap between two plays of this sound, in milliseconds.
   *
   * Building is a drag: hold the mouse down and blocks land faster than the
   * ear can separate them, which turns a satisfying knock into a buzz and
   * stacks dozens of overlapping voices into clipping. A floor here is far
   * simpler than asking every call site to rate-limit itself, and it is the
   * kind of rule that only ever wants to live in one place.
   */
  minGapMs: number
}

export const SOUNDS: Record<SoundId, Sound> = {
  hit: {
    variants: numbered(IMPACT, 'impactPunch_medium', 5),
    gain: 1,
    // No floor. Landing two hits quickly is the good case, and swallowing the
    // second one would hide the thing the player just did well.
    minGapMs: 0,
  },
  hurt: {
    // Softer and duller than the punch you land, which is the whole point: in a
    // scrap you need to know whose blow it was without looking at the bar.
    variants: numbered(IMPACT, 'impactSoft_heavy', 5),
    gain: 1,
    minGapMs: 0,
  },
  defeat: {
    variants: [asset(`${DIGITAL}/lowDown.ogg`)],
    gain: 0.9,
    minGapMs: 0,
  },
  arrive: {
    // A rising blip against `depart`'s falling one. The pair is the message -
    // either alone is just a noise, and together they say which way the door went.
    variants: [asset(`${DIGITAL}/highUp.ogg`)],
    gain: 0.55,
    /**
     * A second between arrivals.
     *
     * Presence syncs the whole roster, so five people already standing in a
     * room can be delivered as five arrivals in one frame when the channel
     * reconnects. That is a chord, not a doorbell.
     */
    minGapMs: 900,
  },
  depart: {
    variants: [asset(`${DIGITAL}/lowDown.ogg`)],
    gain: 0.45,
    minGapMs: 900,
  },
  win: {
    variants: [asset(`${JINGLES}/jingles-retro_09.ogg`)],
    // Mastered hot, like every jingle in that pack, and it plays over the top
    // of whatever else is happening.
    gain: 0.7,
    // A goal resets to kickoff, so two inside a second means something has gone
    // wrong upstream - and a doubled fanfare is how it would sound.
    minGapMs: 1500,
  },
  build: {
    variants: numbered(IMPACT, 'impactWood_light', 5),
    gain: 0.5,
    minGapMs: 55,
  },
  demolish: {
    variants: numbered(IMPACT, 'impactPlank_medium', 5),
    gain: 0.5,
    minGapMs: 55,
  },
  click: {
    variants: [asset(`${INTERFACE}/click_002.ogg`)],
    gain: 0.6,
    minGapMs: 40,
  },
}

/**
 * One recording for this event.
 *
 * `random` is injectable so the test can pin the choice; nothing in the app
 * passes it.
 */
export function pickVariant(id: SoundId, random: () => number = Math.random): string {
  const { variants } = SOUNDS[id]
  return variants[Math.min(variants.length - 1, Math.floor(random() * variants.length))]
}

/** Every file the catalogue names, for preloading and for the test to stat. */
export function allSoundFiles(): string[] {
  return Object.values(SOUNDS).flatMap((sound) => [...sound.variants])
}
