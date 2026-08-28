import { describe, expect, test } from 'bun:test'
import { parseXp, type XpDocument } from '@kxb/xp'
import {
  builtinIsPublished,
  builtinOverride,
  listBuiltinIds,
  listShippedIds,
  NO_OVERLAY,
  readBuiltinDocument,
  safeBuiltinId,
  type BuiltinOverlay,
  type BuiltinOverlays,
} from '@/domain/xps/builtins'
import { listBuiltinXps } from '@/domain/xps/playable'

/**
 * The overlay over the levels we ship.
 *
 * Run against the real directory rather than a fixture, for the reason
 * `playable.test.ts` already argues about the documents themselves: the claim
 * is about the levels this product actually ships, and a fixture would prove
 * the arithmetic while letting a real one drift.
 *
 * What is faked is only the *table* - a `BuiltinOverlays` map, which is what
 * `readBuiltinOverlays` produces and every consumer takes. That keeps these
 * tests off the network without pretending about the disk.
 */

const overlay = (over: Partial<BuiltinOverlay> = {}): BuiltinOverlay => ({
  published: true,
  document: null,
  bytes: null,
  updatedAt: new Date(0).toISOString(),
  ...over,
})

/** One of ours, whichever comes first alphabetically. Never empty in this repo. */
async function anId(): Promise<string> {
  const ids = await listShippedIds()
  expect(ids.length).toBeGreaterThan(0)
  return ids[0]!
}

/** A real document, renamed - the shape an operator's upload produces. */
async function renamed(id: string, name: string): Promise<XpDocument> {
  const document = await readBuiltinDocument(id)
  expect(document).not.toBeNull()
  const parsed = parseXp({ ...document, name })
  expect(parsed.ok).toBe(true)
  return (parsed as { ok: true; document: XpDocument }).document
}

describe('an id that could name a file', () => {
  test('the alphabet is the one the routes and the table share', () => {
    expect(safeBuiltinId('steal-a-plant')).toBe('steal-a-plant')
    expect(safeBuiltinId('a1')).toBe('a1')
  })

  /**
   * The property the whole module leans on: this string is joined onto a path
   * on the way to `readFile`, and hex-and-hyphens cannot walk out of a
   * directory.
   */
  test('nothing that could walk out of the directory survives it', () => {
    expect(safeBuiltinId('../../etc/passwd')).toBeNull()
    expect(safeBuiltinId('Steal')).toBeNull()
    expect(safeBuiltinId('-leading')).toBeNull()
    expect(safeBuiltinId('')).toBeNull()
  })
})

describe('no rows means exactly what the image holds', () => {
  test('every level we ship is listed, and none of them is unlisted', async () => {
    const shipped = await listShippedIds()
    expect(await listBuiltinIds(NO_OVERLAY)).toEqual([...shipped].sort())
    expect(shipped.every((id) => builtinIsPublished(NO_OVERLAY, id))).toBe(true)
  })

  /**
   * The fail-*open* default, asserted rather than left implicit. A caller with
   * no client sees the disk whole - which is what the tests, the scripts and
   * the operator catalogue at `/xp` want, and is why the parameter is optional.
   */
  test('and a caller with no overlay at all gets the same list', async () => {
    const shelf = await listBuiltinXps()
    const shipped = await listShippedIds()
    expect(shelf.length).toBe(shipped.length)
  })
})

describe('taking one off the shelf', () => {
  test('it stops being offered, and the rest are untouched', async () => {
    const id = await anId()
    const overlays: BuiltinOverlays = new Map([[id, overlay({ published: false })]])

    expect(builtinIsPublished(overlays, id)).toBe(false)

    const shelf = await listBuiltinXps(overlays)
    expect(shelf.some((xp) => xp.id === id)).toBe(false)
    expect(shelf.length).toBe((await listShippedIds()).length - 1)
  })

  /**
   * Unlisting is about the shelf, not about the id: the level is still there to
   * be opened by the operator who pulled it, which is what makes the switch
   * usable rather than a door they lock themselves behind.
   */
  test('the document is still readable, because unlisted is not deleted', async () => {
    const id = await anId()
    const overlays: BuiltinOverlays = new Map([[id, overlay({ published: false })]])
    expect(await readBuiltinDocument(id, overlays)).not.toBeNull()
  })
})

describe('putting a document in over one', () => {
  test('the override is what is read, not the file', async () => {
    const id = await anId()
    const document = await renamed(id, 'Something Else Entirely')
    const overlays: BuiltinOverlays = new Map([[id, overlay({ document })]])

    expect(builtinOverride(overlays, id)?.name).toBe('Something Else Entirely')
    expect((await readBuiltinDocument(id, overlays))?.name).toBe('Something Else Entirely')
  })

  test('and it is what the shelf describes', async () => {
    const id = await anId()
    const document = await renamed(id, 'Something Else Entirely')
    const overlays: BuiltinOverlays = new Map([[id, overlay({ document })]])

    const entry = (await listBuiltinXps(overlays)).find((xp) => xp.id === id)
    expect(entry?.name).toBe('Something Else Entirely')
  })
})

describe('putting a level in that no file ships', () => {
  /**
   * The half of this that a directory walk would silently drop: the upload
   * lands, the row exists, and nothing ever lists it. That is the bug
   * `listBuiltinIds` exists to prevent.
   */
  test('it joins the shelf even though there is nothing on disk', async () => {
    const document = await renamed(await anId(), 'Brand New')
    const overlays: BuiltinOverlays = new Map([['brand-new', overlay({ document })]])

    expect(await listBuiltinIds(overlays)).toContain('brand-new')

    const entry = (await listBuiltinXps(overlays)).find((xp) => xp.id === 'brand-new')
    expect(entry?.name).toBe('Brand New')
  })

  /** A row holding neither a document nor a file is a stale switch, not a level. */
  test('a row with nothing in it does not invent one', async () => {
    const overlays: BuiltinOverlays = new Map([['gone', overlay({ published: false })]])
    expect(await listBuiltinIds(overlays)).not.toContain('gone')
    expect(await readBuiltinDocument('gone', overlays)).toBeNull()
  })
})
