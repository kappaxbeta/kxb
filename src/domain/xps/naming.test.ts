import { describe, expect, test } from 'bun:test'
import { XP_NAME_MAX } from '@/domain/xps/events'
import { nameForCopy, nameInSpace } from '@/domain/xps/naming'

describe('naming a copy', () => {
  test('the first copy is named after the original', () => {
    expect(nameForCopy('Minigolf')).toBe('Minigolf copy')
  })

  test('a copy of a copy counts rather than stutters', () => {
    // "Minigolf copy copy copy" is what a naive suffix gives you, and it is
    // unreadable by the third one.
    expect(nameForCopy('Minigolf copy')).toBe('Minigolf copy 2')
    expect(nameForCopy('Minigolf copy 2')).toBe('Minigolf copy 3')
    expect(nameForCopy('Minigolf copy 9')).toBe('Minigolf copy 10')
  })

  test('a name that merely contains the word is not a copy', () => {
    expect(nameForCopy('copy machine')).toBe('copy machine copy')
    expect(nameForCopy('Copy')).toBe('Copy copy')
  })

  /**
   * The case that would otherwise refuse the copy with a message about a name
   * nobody typed.
   */
  test('a name at the cap still produces a usable one', () => {
    const atCap = 'x'.repeat(XP_NAME_MAX)
    const copied = nameForCopy(atCap)

    expect(copied.length).toBeLessThanOrEqual(XP_NAME_MAX)
    expect(copied.length).toBeGreaterThan(0)
  })

  test('every copy of a long name stays within the cap', () => {
    let name = 'y'.repeat(XP_NAME_MAX - 3)
    for (let i = 0; i < 5; i += 1) {
      name = nameForCopy(name)
      expect(name.length).toBeLessThanOrEqual(XP_NAME_MAX)
    }
  })
})

/**
 * No two projects in a space wearing the same name.
 *
 * Asked for directly - *"don't allow same name in a space, add 2 automatic when
 * not changed"* - and the path that needed it most is the one where nobody
 * types anything: two people remixing the same level we ship got two rows both
 * reading "Steal a Plant", in a list whose whole job is telling them apart.
 */
describe('a name no other project is using', () => {
  test('a free name is returned exactly as it was given', () => {
    expect(nameInSpace('Minigolf', [])).toBe('Minigolf')
    expect(nameInSpace('Minigolf', ['Racer', 'Shooter'])).toBe('Minigolf')
  })

  test('a taken one gets the 2', () => {
    expect(nameInSpace('Minigolf', ['Minigolf'])).toBe('Minigolf 2')
  })

  test('and keeps counting rather than stopping at 2', () => {
    expect(nameInSpace('Minigolf', ['Minigolf', 'Minigolf 2'])).toBe('Minigolf 3')
    expect(nameInSpace('Minigolf', ['Minigolf', 'Minigolf 2', 'Minigolf 3'])).toBe('Minigolf 4')
  })

  test('it fills a gap rather than always taking the highest', () => {
    // "Minigolf 2" was renamed or removed, so 2 is free again. Counting from
    // the top would leave a hole and hand out 4 for no reason a reader can see.
    expect(nameInSpace('Minigolf', ['Minigolf', 'Minigolf 3'])).toBe('Minigolf 2')
  })

  test('a name that already ends in a number counts on from it', () => {
    // Rather than "Minigolf 2 2", which is what appending to whatever it was
    // handed produces and which is unreadable by the third one.
    expect(nameInSpace('Minigolf 2', ['Minigolf 2'])).toBe('Minigolf 3')
    expect(nameInSpace('Minigolf 9', ['Minigolf 9'])).toBe('Minigolf 10')
  })

  test('but a free numbered name is never renumbered', () => {
    // The trap in reading the suffix: "Minigolf 4" is what somebody typed, and
    // nothing is using it. Handing back "Minigolf 5" would be this rule
    // rewriting a name for no reason at all.
    expect(nameInSpace('Minigolf 4', ['Minigolf'])).toBe('Minigolf 4')
  })

  test('case is not what makes two names different', () => {
    // They are the same name to everybody reading the list, so they are the
    // same name here.
    expect(nameInSpace('minigolf', ['Minigolf'])).toBe('minigolf 2')
    expect(nameInSpace('MINIGOLF', ['minigolf', 'Minigolf 2'])).toBe('MINIGOLF 3')
  })

  test('and neither is the whitespace around them', () => {
    expect(nameInSpace('Minigolf', [' Minigolf '])).toBe('Minigolf 2')
  })

  test('the two rules compose: a copy of a copy that is also taken', () => {
    // `nameForCopy` proposes and this disposes, which is how duplicating one
    // project twice stops producing two "Minigolf copy"s.
    expect(nameInSpace(nameForCopy('Minigolf'), ['Minigolf', 'Minigolf copy'])).toBe(
      'Minigolf copy 2',
    )
  })

  test('a name at the cap keeps its number, and stays inside it', () => {
    /**
     * The bug the obvious version has: truncating "<80 chars> 2" to the cap cuts
     * the *number* off, so every candidate comes out identical and the search
     * hands back a name that is still taken. The room has to come out of the
     * stem.
     */
    const atCap = 'x'.repeat(XP_NAME_MAX)
    const chosen = nameInSpace(atCap, [atCap])

    expect(chosen.length).toBeLessThanOrEqual(XP_NAME_MAX)
    expect(chosen.endsWith(' 2')).toBe(true)
    expect(chosen).not.toBe(atCap)
  })

  test('and a long name that collides twice gets two different answers', () => {
    const atCap = 'z'.repeat(XP_NAME_MAX)
    const first = nameInSpace(atCap, [atCap])
    const second = nameInSpace(atCap, [atCap, first])

    expect(second).not.toBe(first)
    expect(second.length).toBeLessThanOrEqual(XP_NAME_MAX)
  })
})
