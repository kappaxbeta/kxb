/**
 * Where a thing sits when somebody is holding it.
 *
 * ---------------------------------------------------------------------------
 * The pocket had a hand in it and nothing was ever drawn in it
 * ---------------------------------------------------------------------------
 * `./pocket` has said since it shipped that one of the eight things you are
 * carrying is *in your hand* - `inHand`, cycled with shift+L, and the thing a
 * table takes when you put something down. Nobody could see it. The word was in
 * a store, the model was on the shelf, and the body walked around empty-handed
 * holding a burger nobody else in the room knew about.
 *
 * This is the missing half: three numbers and a hand, so a pistol points
 * forwards out of a fist and a burger sits in a palm. It is a fact about the
 * *kind* of thing - every pistol is held the same way - which is why it lives
 * on the blueprint rather than on the thing or on the person.
 *
 * ---------------------------------------------------------------------------
 * Why this one is radians and everything else here is quarter turns
 * ---------------------------------------------------------------------------
 * Every other rotation in the thingiverse is a quarter turn about the up axis,
 * and that is right for what those are: a bench in a room stands square to the
 * grid, and offering it an arbitrary angle would be offering somebody the
 * chance to place a bench at 3°.
 *
 * A grip is the opposite case. A rifle in a fist is tilted on all three axes,
 * by amounts nobody can name in advance, and a gun that could only be held at
 * right angles would point at the ceiling. So this takes three angles, in
 * radians, and the composer's controls nudge them - which is the same trade the
 * animator already makes about a wrist.
 *
 * ---------------------------------------------------------------------------
 * The hand may not exist, and that is not an error
 * ---------------------------------------------------------------------------
 * Two kinds of body walk around a room. The XP rig has `handr` and `handl`; a
 * peep is seven nodes - root, body, tail and four legs - and has no arms at
 * all (see `PEEP_SPECS` in the animator's rig). A fox cannot hold a pistol in a
 * hand it has not got.
 *
 * So the hand is *where we look first*, and a body without one falls back to
 * its own root with the same numbers - which puts the thing at the fox's
 * shoulder, floating slightly, visibly held rather than invisibly dropped. The
 * same call `seatAt` makes about a socket nobody drew: the failure should be
 * something anybody can see and nudge, not a thing that silently does not
 * exist.
 */

/** Which hand. Two, because a body has two. */
export const HANDS = ['right', 'left'] as const
export type Hand = (typeof HANDS)[number]

/**
 * What each hand is called in the rigs we draw.
 *
 * The loaded names, with the dots already gone: three.js sanitises a node name
 * on the way in (`hand.r` becomes `handr`), which is the same normalisation
 * `boneKey` does in the animator and the reason a clip authored there binds at
 * all. Anything looking a hand up has to use these, not what the GLB's own
 * inspector shows.
 */
export const HAND_NODES: Record<Hand, string> = { right: 'handr', left: 'handl' }

/**
 * How far from the hand a held thing may sit, in cells.
 *
 * A metre and a half, which is a bat held out at arm's length and is well past
 * anything a grip wants. It is a bound rather than a taste: this offset is
 * added inside the hand's own frame and follows the body around, so a large one
 * is a thing orbiting somebody at a distance rather than a thing they are
 * holding.
 */
export const MAX_HOLD_OFFSET = 1.5

/** How much bigger or smaller a thing may be drawn while held. */
export const MIN_HOLD_SCALE = 0.1
export const MAX_HOLD_SCALE = 4

/** How long the clip's name may be. The bound every clip name here gets. */
export const MAX_HOLD_CLIP = 64

export interface HoldSpec {
  hand: Hand
  /** Where it sits, in the hand's own frame, in cells. */
  at: { x: number; y: number; z: number }
  /** How it is turned in the hand, in radians about each axis. */
  turn: { x: number; y: number; z: number }
  /**
   * Multiplier on the thing's own scale, while it is held.
   *
   * Its own number rather than reusing `BlueprintSpec.scale`, because the two
   * answer different questions and a shared one would have to be wrong for one
   * of them: a crate standing in a room is a crate, and the same crate carried
   * under an arm is a prop that has to fit a fist. Rifles want ~0.6; a burger
   * wants 1.
   */
  scale: number
  /**
   * What the body plays while holding it, or nothing.
   *
   * Unchecked against any pack, for the reason every clip name in this domain
   * is unchecked (see `BlueprintSpec.clip`): which clips exist is a fact about
   * the *body*, there are two kinds of body in a room, and a name checked
   * against one would refuse a blueprint that is fine on the other. A name that
   * finds nothing plays nothing and the body carries on walking, which is what
   * holding something should look like when nobody has posed a grip yet.
   */
  clip?: string | null
}

/** A thing held in the right fist, its own size, pointing the way you face. */
export function freshHold(): HoldSpec {
  return {
    hand: 'right',
    // Nudged out of the wrist rather than sitting on it: a model centred on the
    // hand node is a model with a fist through the middle of it.
    at: { x: 0, y: 0.08, z: 0.1 },
    turn: { x: 0, y: 0, z: 0 },
    scale: 1,
    clip: null,
  }
}

/** Whether this is a thing somebody can be seen holding. */
export function holdable(spec: { hold?: HoldSpec }): boolean {
  return spec.hold !== undefined
}

/**
 * Whatever is wrong with a grip, said in words.
 *
 * Its own function for the reason `usingProblems` is: the composer draws this
 * as one panel with a body in it and wants to mark that panel, rather than
 * telling somebody adjusting a wrist about the recipe they have not written.
 */
export function holdProblems(hold: HoldSpec): string[] {
  const problems: string[] = []

  if (!(HANDS as readonly string[]).includes(hold.hand)) {
    problems.push(`${hold.hand} is not a hand`)
  }

  for (const axis of ['x', 'y', 'z'] as const) {
    const at = hold.at[axis]
    if (!Number.isFinite(at) || Math.abs(at) > MAX_HOLD_OFFSET) {
      problems.push(`a held thing sits within ${MAX_HOLD_OFFSET} cells of the hand`)
    }
    const turn = hold.turn[axis]
    // A full turn either way, which is every angle there is. Past that a number
    // is only ever a typo - and an unbounded one is a quaternion built from
    // `Infinity`, which is a body that stops being drawn.
    if (!Number.isFinite(turn) || Math.abs(turn) > Math.PI * 2) {
      problems.push('a grip turns by up to a full turn on each axis')
    }
  }

  if (
    !Number.isFinite(hold.scale) ||
    hold.scale < MIN_HOLD_SCALE ||
    hold.scale > MAX_HOLD_SCALE
  ) {
    problems.push(`a held thing is drawn at ${MIN_HOLD_SCALE}-${MAX_HOLD_SCALE} of its size`)
  }

  if (hold.clip !== undefined && hold.clip !== null) {
    if (hold.clip.trim() === '') problems.push('a clip must be named, or absent')
    if (hold.clip.length > MAX_HOLD_CLIP) {
      problems.push(`a clip name must be under ${MAX_HOLD_CLIP} characters`)
    }
  }

  return problems
}
