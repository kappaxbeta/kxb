/**
 * The controls panel, as data.
 *
 * The whole claim of ./controls.ts is that the panel cannot disagree with the
 * level, so nearly every test here is a *correspondence*: what the document
 * bound is what the panel shows, in the document's order, under the document's
 * own names. A panel that merely rendered would pass none of these by accident.
 */
import { describe, expect, test } from 'bun:test'
import { keyLabel, xpControls } from '@/app/xp/_runtime/input/controls'
import { XP_DE } from '@/app/i18n/xp'

const bind = (key: string, does: string) => ({ key, does })

/** Every label in the panel, in order. */
const labels = (rows: ReturnType<typeof xpControls>) => rows.map((r) => r.label)

/** What is printed on the keycaps of a row, if any. */
const caps = (row: ReturnType<typeof xpControls>[number]) =>
  row.glyphs.flatMap((g) => (g.kind === 'key' ? [g.label] : []))

describe('a keycap says what is written on the key', () => {
  test('a letter, a digit and an arrow', () => {
    expect(keyLabel('KeyE')).toBe('E')
    expect(keyLabel('Digit4')).toBe('4')
    expect(keyLabel('ArrowUp')).toBe('↑')
  })

  /**
   * Wrong-looking rather than blank. A code nothing recognises is a document
   * doing something unusual, and an empty keycap reads as a broken level rather
   * than as an unusual binding.
   */
  test('something unrecognised falls through as itself', () => {
    expect(keyLabel('Backquote')).toBe('Backquote')
    expect(keyLabel('')).toBe('')
  })

  test('the prefix is not stripped off a word that merely starts with it', () => {
    // "Keyboard" is not a code, but the length check is what stops `slice(3)`
    // turning any Key-prefixed string into nonsense.
    expect(keyLabel('KeyboardLayout')).toBe('KeyboardLayout')
  })
})

describe('the panel is built from player.keys', () => {
  test('a bound key appears under the name the document gave it', () => {
    const rows = xpControls({ keys: [bind('KeyE', 'grab')], isTouch: false })
    const grab = rows.find((r) => r.label === 'grab')
    expect(grab).toBeDefined()
    expect(caps(grab!)).toEqual(['E'])
  })

  /**
   * Raw, not prettified. The rules match `does` exactly, so a panel that
   * title-cased it would name a different action from the one the script fires.
   */
  test('the name is printed as written, spaces and all', () => {
    const rows = xpControls({ keys: [bind('KeyF', 'open the hatch')], isTouch: false })
    expect(labels(rows)).toContain('open the hatch')
  })

  test('in the order the document bound them', () => {
    const rows = xpControls({
      keys: [bind('KeyQ', 'first'), bind('KeyE', 'second'), bind('KeyR', 'third')],
      isTouch: false,
    })
    const bound = labels(rows).filter((l) => ['first', 'second', 'third'].includes(l))
    expect(bound).toEqual(['first', 'second', 'third'])
  })

  test('a document that binds nothing still explains how to walk', () => {
    const rows = xpControls({ keys: [], isTouch: false })
    expect(labels(rows)).toContain('Move')
    expect(labels(rows)).toContain('Jump ×2')
    expect(labels(rows)).toContain('Sprint')
  })

  /**
   * The drift this file exists to prevent, as an assertion: nothing in the
   * panel claims an action the document did not bind.
   */
  test('nothing is promised that the level did not bind', () => {
    const rows = xpControls({ keys: [bind('KeyE', 'grab')], isTouch: false })
    expect(labels(rows)).not.toContain('use')
    expect(labels(rows)).not.toContain('attack')
    expect(labels(rows)).not.toContain('shoot')
  })
})

describe('the rows every body has', () => {
  /**
   * Dance is last and unconditional in the lounge and must be here too.
   * Somebody who has played one world of this product should not have to learn
   * a second answer to the same question.
   */
  test('dance is last, whatever the level bound', () => {
    for (const keys of [[], [bind('KeyE', 'grab')], [bind('KeyE', 'a'), bind('KeyQ', 'b')]]) {
      const touch = xpControls({ keys, isTouch: true })
      expect(touch[touch.length - 1]!.label).toBe('Dance')
    }
  })

  test('and on a keyboard it comes after the level’s own keys', () => {
    const rows = xpControls({ keys: [bind('KeyE', 'grab')], isTouch: false })
    const all = labels(rows)
    expect(all.indexOf('Dance')).toBeGreaterThan(all.indexOf('grab'))
  })

  test('a room with no way out does not offer one', () => {
    expect(labels(xpControls({ keys: [], isTouch: false, canLeave: false }))).not.toContain('Leave')
    expect(labels(xpControls({ keys: [], isTouch: false }))).toContain('Leave')
  })
})

describe('a thumb cannot press what a keyboard can', () => {
  /**
   * The two halves of one promise: the button that acts is the button the panel
   * prints. They agree by construction - both come from `thumbKeys` - and this
   * is what would catch somebody deriving one of them a second way.
   */
  test('a bound key is a button, drawn with the face it has on screen', () => {
    const rows = xpControls({ keys: [bind('KeyE', 'open the hatch')], isTouch: true })
    const grab = rows.find((r) => r.label === 'open the hatch')

    expect(grab).toBeDefined()
    expect(grab!.unreachable).toBeUndefined()
    expect(grab!.glyphs).toEqual([{ kind: 'key', label: 'OPEN', tone: 'pink', wide: true }])
  })

  test('an action the buttons drop is not promised by the panel either', () => {
    // Two keys, one action: one circle on screen, so one row here.
    const rows = xpControls({
      keys: [bind('KeyE', 'grab'), bind('Enter', 'grab')],
      isTouch: true,
    })

    expect(rows.filter((r) => r.label === 'grab')).toHaveLength(1)
  })

  test('the keyboard panel marks nothing unreachable', () => {
    const rows = xpControls({ keys: [bind('KeyE', 'grab')], isTouch: false })
    expect(rows.some((r) => r.unreachable)).toBe(false)
  })

  /**
   * Different verbs, not the same list with the keys swapped. A thumbstick has
   * no sprint - you push it further - and a mouse has no drag-to-look.
   */
  test('touch talks about fingers and the keyboard talks about keys', () => {
    const touch = labels(xpControls({ keys: [], isTouch: true }))
    expect(touch).toContain('Drag to look')
    expect(touch).not.toContain('Sprint')

    const desk = labels(xpControls({ keys: [], isTouch: false }))
    expect(desk).not.toContain('Drag to look')
    expect(desk).toContain('Sprint')
  })
})

/**
 * The rows that replaced the hardcoded hint in ./hud.
 *
 * That line said "WASD move · shift sprint · space jump · V first person · esc
 * release" and was a second copy of a list nobody maintained - it never
 * mentioned dance, and it could not mention `player.keys` at all. These are the
 * two of its facts that were worth keeping, and they are conditional now.
 */
describe('the rows the corner hint used to carry', () => {
  test('V says what pressing it will do, not what it is called', () => {
    const inFirst = labels(xpControls({ keys: [], isTouch: false, view: 'first' }))
    expect(inFirst).toContain('Third person')
    expect(inFirst).not.toContain('First person')

    const inThird = labels(xpControls({ keys: [], isTouch: false, view: 'third' }))
    expect(inThird).toContain('First person')
  })

  test('fire only when the document arms you', () => {
    expect(labels(xpControls({ keys: [], isTouch: false, armed: true }))).toContain('Fire')
    expect(labels(xpControls({ keys: [], isTouch: false }))).not.toContain('Fire')
  })
})

describe('calling a vote', () => {
  test('no row for it in a level with nobody to vote against', () => {
    // Which is most levels. A row for a key that would be refused teaches
    // somebody a control the game does not have.
    expect(labels(xpControls({ keys: [], isTouch: false }))).not.toContain('Call a vote')
  })

  test('a row once there is a room and somebody standing in it', () => {
    expect(labels(xpControls({ keys: [], isTouch: false, canCallVote: true }))).toContain('Call a vote')
  })
})

/**
 * Saying something, and pulling a face.
 *
 * They are two rows and two *different* conditions, which is the only thing
 * worth testing here: the picker needs somebody in the room to pull a face at,
 * and chat reaches the space. A level with one person in it has no faces worth
 * offering and a conversation worth having.
 */
describe('the two ways of saying something', () => {
  test('neither row in a level with no room and no conversation', () => {
    const rows = labels(xpControls({ keys: [], isTouch: false }))
    expect(rows).not.toContain('Emotes')
    expect(rows).not.toContain('Say something')
  })

  test('faces need somebody to pull one at', () => {
    expect(labels(xpControls({ keys: [], isTouch: false, canEmote: true }))).toContain('Emotes')
  })

  test('chat does not, because the people it reaches are not all in the level', () => {
    expect(labels(xpControls({ keys: [], isTouch: false, canChat: true }))).toContain(
      'Say something',
    )
    expect(labels(xpControls({ keys: [], isTouch: false, canChat: true }))).not.toContain('Emotes')
  })

  test('on a thumb both are buttons rather than keys', () => {
    // A phone has no Enter until something is focused, so the thing that opens
    // the box has to be on the screen.
    const rows = xpControls({ keys: [], isTouch: true, canChat: true, canEmote: true })
    expect(labels(rows)).toContain('Say something')
    expect(rows.find((row) => row.label === 'Say something')?.glyphs).toEqual([
      { kind: 'key', label: 'Say', tone: 'pink', wide: true },
    ])
  })
})

/**
 * The same panel in German.
 *
 * Two claims, and the second is the one worth a test: what a key *does* is
 * translated, and what is *printed on the key* is not. A German keyboard has
 * `Shift` and `Esc` on it, and a panel that helpfully said `Umschalt` would be
 * telling somebody to press a key that is not in front of them.
 */
describe('the words change and the keycaps do not', () => {
  const de = XP_DE.controls

  test('a row says what the key does, in German', () => {
    const rows = xpControls({ keys: [], isTouch: false, words: de })
    expect(labels(rows)).toContain('Sprinten')
    expect(labels(rows)).toContain('Doppelsprung')
  })

  test('the caps still say Space, Shift and Esc', () => {
    const rows = xpControls({ keys: [], isTouch: false, words: de })
    const printed = rows.flatMap(caps)
    expect(printed).toContain('Space')
    expect(printed).toContain('Shift')
    expect(printed).toContain('Esc')
  })

  /**
   * The author's own word, untouched.
   *
   * `does` is what the rules match on. A panel that translated it would promise
   * a verb the level does not have - and the level is the thing that is right.
   */
  test("a document's own action keeps its name", () => {
    const rows = xpControls({ keys: [bind('KeyF', 'open the hatch')], isTouch: false, words: de })
    expect(labels(rows)).toContain('open the hatch')
  })

  /** The buttons a phone draws are ours, so those do change. */
  test('the soft buttons are drawn by us, and translate', () => {
    const rows = xpControls({ keys: [], isTouch: true, words: de })
    expect(rows.flatMap(caps)).toContain('Sprung')
  })
})
