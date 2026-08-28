import { describe, expect, test } from 'bun:test'
import { roomSlug, ROOM_SLUG_MAX, slugifyRoomName } from '@/domain/rooms/slug'

const ROOM = '33333333-3333-4333-8333-333333333333'

/**
 * The slug is the room's address, and the read model's unique index is keyed on
 * it - so these are not cosmetic. A change here moves every room's URL and can
 * make two rooms that used to coexist collide.
 */
describe('slugifyRoomName', () => {
  test('a plain name is lowercased and hyphenated', () => {
    expect(slugifyRoomName('The Workshop')).toBe('the-workshop')
  })

  test('punctuation collapses to single dashes', () => {
    expect(slugifyRoomName('Design // Review (2)')).toBe('design-review-2')
  })

  test('accents survive as their letters', () => {
    expect(slugifyRoomName('Café Ünten')).toBe('cafe-unten')
  })

  test('no leading or trailing dashes, whatever the name ends with', () => {
    expect(slugifyRoomName('  — Lounge —  ')).toBe('lounge')
  })

  test('long names are cut without leaving a dangling dash', () => {
    const slug = slugifyRoomName(`${'a'.repeat(ROOM_SLUG_MAX - 1)} bbbb`)
    expect(slug.length).toBeLessThanOrEqual(ROOM_SLUG_MAX)
    expect(slug.endsWith('-')).toBe(false)
  })

  test('a name with nothing sluggable in it produces nothing', () => {
    expect(slugifyRoomName('🎈🎈')).toBe('')
  })
})

describe('roomSlug', () => {
  test('a usable name is the address', () => {
    expect(roomSlug('Storage', ROOM)).toBe('storage')
  })

  /**
   * The fallback exists so that two rooms named only in emoji do not both
   * slugify to the empty string and collide on the unique index. Unreadable,
   * but reachable - and a rename fixes it.
   */
  test('an unusable name falls back to the room id', () => {
    expect(roomSlug('🎈🎈', ROOM)).toBe(ROOM)
  })
})
