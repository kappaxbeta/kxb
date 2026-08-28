'use client'

import type { BoxingWords } from './words'
import { NO_INTENT } from '../rules/fight'
import type { Intent } from '../rules/fight'
import type { PunchName } from '../rules/moves'

/**
 * A keyboard, turned into the one thing the rules understand.
 *
 * ---------------------------------------------------------------------------
 * Why the game does not read a key anywhere
 * ---------------------------------------------------------------------------
 * `@kxb/boxing`'s `Intent` is deliberately not keys - it is `walk`, `punch`,
 * `guard`, and the package has never heard of a keyboard. This file is the
 * whole of the translation, and it lives in the app for the same reason
 * `localHost` does: a pad, a phone's thumb controls and a bot all produce an
 * `Intent`, and an engine that read `KeyboardEvent` would only ever work
 * against one of them.
 *
 * ---------------------------------------------------------------------------
 * Held against edge, which is most of what this file is
 * ---------------------------------------------------------------------------
 * `Intent` splits them and means it: `walk` and `guard` are *held* - true for
 * as long as the key is down - and `punch`, `dash`, `parry` and `slip` are
 * *edges*, true on exactly one frame however long the key is held.
 *
 * Without the split a held punch key is a machine gun, and the commitment rules
 * in the frame data - the whole source of risk in the game - stop meaning
 * anything, because whiffing is free if the next punch starts by itself.
 *
 * The edge is consumed by `take()` rather than cleared by the key going up: a
 * player who taps a key inside one frame must still get the punch, and a
 * keyup-driven reset loses exactly those inputs. So a press *arms* it and the
 * frame that reads it disarms it.
 *
 * ---------------------------------------------------------------------------
 * Two hands, because both of them are busy
 * ---------------------------------------------------------------------------
 * Movement on the left (`A`/`D`, and the arrows for anybody would rather),
 * punches on the right (`J K L I O`), defence in the middle (`Space` guard,
 * `F` parry, `S` slip). It is the layout every fighting game on a keyboard
 * uses, and the reason is that guard has to be reachable *while* moving and
 * punching, which a single-hand layout cannot do.
 */

/** What each key does. Lower-cased `event.key`, so layout-independent for letters. */
const BINDINGS: Record<
  string,
  Held | { punch: PunchName } | 'dashLeft' | 'dashRight' | 'parry' | 'slip'
> = {
  // Held
  a: 'left',
  arrowleft: 'left',
  d: 'right',
  arrowright: 'right',
  ' ': 'guard',
  shift: 'guard',

  // Edges
  j: { punch: 'jab' },
  k: { punch: 'cross' },
  l: { punch: 'hook' },
  i: { punch: 'uppercut' },
  o: { punch: 'overhand' },
  f: 'parry',
  s: 'slip',
  arrowdown: 'slip',
  q: 'dashLeft',
  e: 'dashRight',
}

type Holds = Record<Held, boolean>

/**
 * The reader.
 *
 * A class-free closure rather than a hook, because it is read inside
 * `useFrame` - which runs outside React's render - and a hook's state would
 * mean a re-render sixty times a second to move a boxer sideways.
 */
export interface Pad {
  /** Attach to the window. Returns a detach. */
  listen(): () => void
  /** This frame's intent. Consumes any armed edges. */
  take(): Intent
  /** Whether anything is currently pressed, for a "press a key" prompt. */
  touched(): boolean

  /**
   * The same buffer, written by something that is not a keyboard.
   *
   * The thumb controls in `./touch` call these, and the frame loop reads
   * `take()` without ever learning which device it came from - the same shape
   * `Intent` itself has, one level down. A second `Pad` for touch would be a
   * second set of edge-consumption rules to keep in step, and getting *those*
   * subtly different between mouse and thumb is how a punch ends up firing
   * twice on a phone and once on a laptop.
   */
  press(action: Edge): void
  hold(action: Held, down: boolean): void
}

/**
 * The held actions, by the name the controls use rather than the key.
 *
 * `left` and `right` rather than `out` and `in`, and that is the fix rather
 * than a rename. The two fighters face each other, so *towards the opponent*
 * points right for one corner and left for the other - which meant the blue
 * player pressed `D` and walked left. A player's hands know left and right;
 * only the game knows which corner they are in, so the pad reports the key and
 * `advance` turns it into approach or retreat. See `Intent.walk`.
 */
export type Held = 'left' | 'right' | 'guard'

/** The one-shot actions. A punch carries which. */
export type Edge =
  | { kind: 'punch'; punch: PunchName }
  | { kind: 'dash'; towards: 1 | -1 }
  | { kind: 'parry' }
  | { kind: 'slip' }

export function pad(): Pad {
  const held: Holds = { left: false, right: false, guard: false }
  let punch: PunchName | null = null
  let dash: -1 | 0 | 1 = 0
  let parry = false
  let slip = false
  let touched = false

  const down = (event: KeyboardEvent) => {
    const binding = BINDINGS[event.key.toLowerCase()]
    if (!binding) return
    // Only the keys we use. A blanket `preventDefault` would break the browser's
    // own shortcuts on a page that is not full-screen, and space in particular
    // scrolls the page under the canvas if it is left alone.
    event.preventDefault()
    touched = true

    if (typeof binding === 'object') {
      // Armed rather than assigned-and-held: see the header. `repeat` is
      // rejected so holding a punch key does not re-arm it every time the OS
      // repeats, which would be the machine gun by another route.
      if (!event.repeat) punch = binding.punch
      return
    }

    switch (binding) {
      case 'left':
      case 'right':
      case 'guard':
        held[binding] = true
        return
      case 'dashRight':
        if (!event.repeat) dash = 1
        return
      case 'dashLeft':
        if (!event.repeat) dash = -1
        return
      case 'parry':
        if (!event.repeat) parry = true
        return
      case 'slip':
        if (!event.repeat) slip = true
        return
    }
  }

  const up = (event: KeyboardEvent) => {
    const binding = BINDINGS[event.key.toLowerCase()]
    if (typeof binding !== 'string') return
    if (binding === 'left' || binding === 'right' || binding === 'guard') held[binding] = false
  }

  /**
   * Let everything go when the page does.
   *
   * Without this, alt-tabbing while walking forwards is a boxer who walks into
   * the ropes for as long as you are away: the keyup happens in another window
   * and never reaches us.
   */
  const blur = () => {
    held.left = false
    held.right = false
    held.guard = false
  }

  return {
    listen() {
      window.addEventListener('keydown', down)
      window.addEventListener('keyup', up)
      window.addEventListener('blur', blur)
      return () => {
        window.removeEventListener('keydown', down)
        window.removeEventListener('keyup', up)
        window.removeEventListener('blur', blur)
      }
    },

    take(): Intent {
      const intent: Intent = {
        ...NO_INTENT,
        walk: held.right && !held.left ? 1 : held.left && !held.right ? -1 : 0,
        guard: held.guard,
        punch,
        dash,
        parry,
        slip,
      }
      // Consumed. Every edge is true for exactly the frame that reads it.
      punch = null
      dash = 0
      parry = false
      slip = false
      return intent
    },

    touched: () => touched,

    press(action) {
      touched = true
      switch (action.kind) {
        case 'punch':
          punch = action.punch
          return
        case 'dash':
          dash = action.towards
          return
        case 'parry':
          parry = true
          return
        case 'slip':
          slip = true
          return
      }
    },

    hold(action, down) {
      if (down) touched = true
      held[action] = down
    },
  }
}

/**
 * For the controls card, so the keys on screen and the keys above cannot drift.
 *
 * The second half is a *dictionary key* rather than the word itself. The keycaps
 * are the same in every language - `J` is `J` on a QWERTZ board too - and what
 * they do is not, so the two halves of this table now live in two places on
 * purpose: the physical key here, beside the handler that reads it, and the verb
 * in `./words`. Typed as `keyof`, so a control added here without a word to go
 * with it does not compile.
 */
export const CONTROLS: readonly (readonly [string, keyof BoxingWords['keys']])[] = [
  ['A / D', 'move'],
  ['Q / E', 'dash'],
  ['Space', 'guard'],
  ['S', 'slip'],
  ['F', 'parry'],
  ['J', 'jab'],
  ['K', 'cross'],
  ['L', 'hook'],
  ['I', 'uppercut'],
  ['O', 'overhand'],
]
