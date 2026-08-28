import { describe, expect, test } from 'bun:test'
import { listXpCatalogue, findXp, readXpDocument } from '@/domain/xps/catalogue'

/**
 * Against the real directory, not a fixture.
 *
 * The thing worth pinning here is not the mapping - that is six field
 * assignments - it is that the store agrees with what is on disk. A fixture
 * would pass forever while `public/xp/xps/` filled with documents this function
 * silently dropped, which is precisely the failure the operator catalogue's
 * comment warns about and the one a store cannot report for itself.
 */

describe('the XP catalogue', () => {
  test('lists the documents that are actually on disk', async () => {
    const xps = await listXpCatalogue()

    expect(xps.length).toBeGreaterThan(0)
    // The shipped set. Not asserted exhaustively - a new document should not
    // fail this - but these four are referenced by tests and marketing pages.
    const ids = xps.map((xp) => xp.id)
    for (const id of ['first-room', 'shooter', 'moving-parts', 'ladder-run']) {
      expect(ids).toContain(id)
    }
  })

  test('every entry carries what a card needs to draw', async () => {
    for (const xp of await listXpCatalogue()) {
      expect(xp.name.length).toBeGreaterThan(0)
      expect(xp.pieces).toBeGreaterThanOrEqual(0)
      expect(xp.things).toBeGreaterThanOrEqual(0)
      // A capability set is what the card's chips are, and `parseXp` refuses a
      // document whose capabilities the world cannot support - so an empty one
      // here means the summary dropped them rather than the document lacking
      // them.
      expect(Array.isArray(xp.capabilities)).toBe(true)
    }
  })

  test('a cover is a path that starts at the shots folder, or nothing', async () => {
    for (const xp of await listXpCatalogue()) {
      if (xp.cover === null) continue
      expect(xp.cover).toBe(`/xp/shots/${xp.id}.png`)
    }
  })

  test('newest first', async () => {
    const stamps = (await listXpCatalogue()).map((xp) => xp.updatedAt)
    expect([...stamps].sort((a, b) => b.localeCompare(a))).toEqual(stamps)
  })

  test('an id that is not on disk finds nothing rather than throwing', async () => {
    expect(await findXp('no-such-level')).toBeNull()
    expect(await readXpDocument('no-such-level')).toBeNull()
  })

  /**
   * The containment check, and the reason `findXp` goes through the listing.
   *
   * An id arrives from a URL segment. Next decodes `%2e%2e%2f` before it
   * reaches the route, so a path built by concatenation would be a real
   * traversal - and the guard is not a regex on the id but the fact that
   * nothing outside a `readdir` of one directory is ever opened.
   */
  test('a traversing id resolves to nothing', async () => {
    for (const id of ['../../../etc/passwd', '..%2F..%2Fsecrets', '/etc/passwd', '']) {
      expect(await findXp(id)).toBeNull()
      expect(await readXpDocument(id)).toBeNull()
    }
  })
})
