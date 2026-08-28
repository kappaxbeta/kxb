/**
 * What an XP's controls panel says, generated rather than written.
 *
 * Provenance: the glyph vocabulary and the `ControlRow` shape are copied from
 * `src/app/world/hud.tsx`, per the copy rule in docs/xp/creator.md §1.3 and the
 * lint rule that enforces it - `src/app/xp/**` may not import `@/app/world/*`.
 * The visual half is copied alongside it in ./controls-panel.tsx. What is *not*
 * copied is `loungeControls`, which is the thing this file replaces: the lounge
 * knows its own six keys and can write them out, and an XP does not.
 *
 * ---------------------------------------------------------------------------
 * Why this is generated
 * ---------------------------------------------------------------------------
 * `player.keys` lets a document bind up to five keys, each with a `does` name
 * the rules listen for. A hand-written panel would be a second copy of that
 * list, and the first thing anybody would notice is that it disagreed with the
 * level - a panel promising `grab` on E for a document that moved it to Q is
 * worse than no panel, because it is believed.
 *
 * So the rows come *from* `player.keys`. The only rows written out here are the
 * ones every body has - move, jump, sprint, dance - which are the ones the
 * format reserves precisely because no document can change them.
 */

/**
 * One thing you press.
 *
 * A union rather than a string, because a mouse button and the WASD cross are
 * not letters and cannot be drawn as one.
 */
export type Glyph =
  | { kind: 'key'; label: string; tone: 'cyan' | 'pink'; wide: boolean }
  | { kind: 'mouse'; button: 'left' | 'right' }
  | { kind: 'wasd' }
  | { kind: 'gesture'; motion: 'pan' | 'stick' }

/** A key. Cyan by convention: movement, navigation, the passive half. */
export function key(label: string): Glyph {
  // Anything longer than two characters is a word wearing a keycap - "Shift",
  // "Space" - and a square would either clip it or blow the row's height.
  return { kind: 'key', label, tone: 'cyan', wide: label.length > 2 }
}

/** A key that does something to the world. Fuchsia, as everywhere else. */
export function actionKey(label: string): Glyph {
  return { kind: 'key', label, tone: 'pink', wide: label.length > 2 }
}

export function mouse(button: 'left' | 'right'): Glyph {
  return { kind: 'mouse', button }
}

/** The movement cross, drawn as one unit rather than four loose caps. */
export function wasd(): Glyph {
  return { kind: 'wasd' }
}

/** A thing you do with a finger, drawn rather than named. */
export function gesture(motion: 'pan' | 'stick'): Glyph {
  return { kind: 'gesture', motion }
}

/** A line in the panel: what you press, and what it does. */
export interface ControlRow {
  glyphs: Glyph[]
  label: string
  /**
   * True when the level binds this and the current device cannot press it.
   *
   * Carried rather than dropped, for the reason `bindingsFor` in ./vr states at
   * length: a binding with nowhere to go is a thing the author needs told, and
   * silently omitting the row is how they find out from a player instead. The
   * panel greys these rather than hiding them.
   */
  unreachable?: boolean
}

export function row(glyphs: Glyph[], label: string): ControlRow {
  return { glyphs, label }
}

/**
 * A `KeyboardEvent.code` as something to print on a keycap.
 *
 * The document stores codes because a code is the *physical* key, so a level
 * does not move its buttons when somebody changes keyboard layout. A panel that
 * printed the code would say "KeyE", which is not what is written on the key
 * and not what anybody would say out loud.
 *
 * Deliberately not a lookup table of every code there is. The three prefixes
 * cover everything a document can legally bind - the reserved list already
 * takes the movement keys and the modifiers - and anything unrecognised falls
 * through as itself, which is wrong-looking rather than blank. A blank keycap
 * is a panel bug that reads as a level bug.
 */
export function keyLabel(code: string): string {
  if (code.startsWith('Key') && code.length === 4) return code.slice(3)
  if (code.startsWith('Digit') && code.length === 6) return code.slice(5)
  if (code.startsWith('Numpad')) return code.slice(6)
  const arrows: Record<string, string> = {
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
  }
  return arrows[code] ?? code
}

import { thumbKeys } from '@/app/xp/_runtime/input/touch-keys'
import { XP_EN, type XpDict } from '@/app/i18n/xp'

export interface XpControlsInput {
  /** `player.keys` - what this document bound, in the order it bound them. */
  keys: readonly { key: string; does: string }[]
  isTouch: boolean
  /**
   * Which camera is on, so the `V` row says what pressing it will *do* rather
   * than what it is called. "First person" on a row you are already in first
   * person for is a row that reads as broken.
   */
  view?: 'first' | 'third'
  /** Whether the document arms the player, which is the only thing that fires. */
  armed?: boolean
  /**
   * Whether the level can be left from here. A room you were sent into by a
   * `load` has somewhere to go back to; the one you opened directly does not.
   */
  canLeave?: boolean
  /**
   * Whether there is an arbiter to hold a vote, and somebody standing to call
   * one.
   *
   * Off everywhere else, and off is the common case: most levels have nobody
   * to vote against. A row for a key that would be refused is a row that
   * teaches somebody a control the game does not have.
   */
  canCallVote?: boolean
  /**
   * Whether there is anybody to pull a face at.
   *
   * The picker only mounts in a room — an emote in an empty level is a control
   * whose whole effect is over your own head — so a row for it anywhere else
   * would name a button that is not on the screen.
   */
  canEmote?: boolean
  /**
   * Whether there is anywhere for a message to go.
   *
   * A *different* condition from `canEmote` and not a typo for it: the picker
   * needs somebody in the room to pull a face at, and chat reaches the space —
   * so a level with one person in it has no faces worth offering and a
   * conversation worth having. See the host memo in ./scene.
   */
  canChat?: boolean
  /**
   * What the rows say, in the reader's language.
   *
   * Defaulted rather than required, which keeps this callable from a test that
   * is asking about the *shape* of the list - which rows appear for which
   * document - rather than about the words in it. The scene passes the dictionary
   * it read from context.
   *
   * The keycaps are not in here and never will be: `Space` and `Shift` are
   * printed on the reader's own keyboard. What a document binds is not in here
   * either - see the note on `does` below.
   */
  words?: XpDict['controls']
}

/**
 * The panel's rows, for a keyboard or for a thumb.
 *
 * Two lists rather than one with the keys swapped, which is the shape the
 * lounge arrived at and the reason is the same: they are different *verbs*.
 * There is no `Shift` on a thumbstick - you push the stick past its ring - and
 * no "drag to look" on a mouse.
 */
export function xpControls({
  keys,
  isTouch,
  view = 'third',
  armed = false,
  canLeave = true,
  canCallVote = false,
  canEmote = false,
  canChat = false,
  words = XP_EN.controls,
}: XpControlsInput): ControlRow[] {
  if (isTouch) {
    const rows = [
      row([gesture('stick')], words.move),
      /**
       * And the same stick again, for the thing it does past its ring.
       *
       * Two rows for one control, which the keyboard list also has (`W` moves,
       * `Shift` runs) - they are two verbs. It sits directly under `move`
       * because that is where somebody reading the panel is when the question
       * "and how do I go faster" occurs to them.
       */
      row([gesture('stick')], words.pushToRun),
      row([gesture('pan')], words.dragToLook),
      // "Jump ×2" rather than "Jump": a second jump you have to discover by
      // falling off something is a second jump most people never find, and the
      // control for it is the one they are already holding.
      row([actionKey(words.faces.jump)], words.doubleJump),
    ]

    /**
     * The level's own keys, which now have buttons.
     *
     * Read through `thumbKeys` rather than off `keys` directly, and that is the
     * whole point of the shared function: this panel prints what the thumb can
     * press because both come from one list. An action the buttons drop - an
     * unnamed one, or a second key bound to an action that already has a circle
     * - is an action this does not promise either.
     *
     * The face of the button is the glyph, not the whole name, so somebody
     * looking from the panel to the screen is matching the same six characters
     * rather than translating.
     */
    for (const action of thumbKeys(keys)) {
      rows.push(row([actionKey(action.label)], action.title))
    }

    // Last and unconditional, exactly like the G row on a keyboard.
    rows.push(row([actionKey(words.faces.dance)], words.dance))
    // And the faces, when there is anybody to pull one at. A thumb reaches the
    // button rather than a key, so the glyph is the button's own face.
    if (canEmote) rows.push(row([actionKey(words.faces.face)], words.emotes))
    // Chat is a button here too rather than a key, and that is not a shortcut:
    // a phone has no Enter until something is focused, so the thing that opens
    // the box has to be on the screen. See the `touch` branch in ./chat-panel.
    if (canChat) rows.push(row([actionKey(words.faces.say)], words.saySomething))
    return rows
  }

  const rows = [
    row([wasd()], words.move),
    row([key('Space')], words.doubleJump),
    row([key('Shift')], words.sprint),
  ]
  // Only when there is something to fire. A row about the mouse in a level with
  // no weapon is the same promise-of-nothing the generated rows exist to avoid.
  if (armed) rows.push(row([mouse('left')], words.fire))

  /**
   * The document's bindings, in its own order, labelled with its own words.
   *
   * `does` is printed raw rather than prettified. It is a name the author chose
   * and the rules match on it exactly, so "open the hatch" should read as "open
   * the hatch" - title-casing it here would make the panel and the script
   * disagree about what the action is called, which is the one thing a
   * generated panel exists to prevent. It is not translated either, and for the
   * same reason: it is the author's word, not ours.
   */
  for (const binding of keys) {
    rows.push(row([actionKey(keyLabel(binding.key))], binding.does))
  }

  // Dance last and always, because it is what a body can do rather than what a
  // level allowed - and because that is where the lounge puts it, and two
  // answers to "how do I dance" is one too many.
  rows.push(row([actionKey('G')], words.dance))
  // Beside dance, because they are the same kind of thing - what a body can do
  // rather than what a level allowed - and `Z` is where the lounge put it.
  if (canEmote) rows.push(row([actionKey('Z')], words.emotes))
  // Beside the faces, because they are the two ways of saying something and
  // somebody looking for one will find the other. Enter is where every game
  // with a chat box has put it.
  if (canChat) rows.push(row([actionKey('Enter')], words.saySomething))
  // What pressing it will do, not what it is called - see `view` above.
  rows.push(row([key('V')], view === 'first' ? words.thirdPerson : words.firstPerson))
  if (canCallVote) rows.push(row([actionKey('B')], words.callAVote))
  rows.push(row([key('H')], words.controls))
  if (canLeave) rows.push(row([key('Esc')], words.leave))
  return rows
}
