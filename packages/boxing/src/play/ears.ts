/**
 * Somewhere to make a noise — the port, not an implementation.
 *
 * ---------------------------------------------------------------------------
 * Why sound is a port and the renderer is not
 * ---------------------------------------------------------------------------
 * This package ships its own drawing, because the pixels *are* the game and a
 * boxing match that arrives without its sprites is half a package. Audio is the
 * other way round: what a punch sounds like is a recording somebody licensed,
 * a volume the player set, a mute they can toggle, and - in this app - a duck
 * against the radio. All of that belongs to the host, and a game that shipped
 * its own `new Audio()` would ignore every bit of it.
 *
 * So the game says *what happened* and the host decides what it sounds like,
 * which is the same arrangement `@kxb/xp/host` uses for everything else.
 *
 * It is optional on `<BoxingGame>`, and that is a real contract rather than
 * politeness: a host with no audio gets a silent fight rather than a refused
 * one.
 */

import type { Corner, FightEvent } from '../rules/fight'

export interface Ears {
  /**
   * One step's events, or one that arrived over the wire.
   *
   * A list rather than a single event because a step can produce several and
   * the host may want to collapse them - four hits in one frame is a clip, not
   * a chord.
   */
  hear(events: readonly FightEvent[]): void
  /**
   * The first gesture happened.
   *
   * Browsers refuse to start an audio context without one, and the game is the
   * only thing that knows when a key or a thumb first arrived. A host with no
   * such restriction can leave this empty.
   */
  wake(): void
}

/**
 * How a host is asked for a pair of ears.
 *
 * A factory taking the corner, rather than an `Ears` handed in ready-made, and
 * the reason is that *which corner you are* is not known until the session has
 * joined - it comes from sorting player ids, which needs the roster.
 *
 * It matters because the whole mapping turns on it: the same punch is a hit or
 * a wince depending which end of it you are on, and a host that had to guess
 * before joining would play the other fighter's fight. The first version made
 * the host stitch the corner in afterwards through a mutable closure, which
 * worked, could not be expressed without reassigning a captured variable after
 * render, and was one more thing to get wrong. A parameter says it once.
 */
export type EarsFor = (mine: Corner) => Ears
