import { afterEach, describe, expect, test } from 'bun:test'
import { fileFromDataUrl, saveShot } from '@/app/world/lounge/_sim/save-shot'

/**
 * The routing decision, which is the whole of the iOS bug.
 *
 * The picture itself needs a WebGL canvas and cannot be reached from here, but
 * *where it goes* is plain logic: an anchor download on a desktop, the share
 * sheet on a phone, because on iOS the anchor puts the file somewhere Photos
 * cannot see. Worth pinning, because both branches are invisible on the machine
 * they are written on.
 */

// A one-pixel PNG, so `fileFromDataUrl` has real bytes to decode.
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

/**
 * Bun runs these without a DOM, so the browser this code talks to is built by
 * hand: the three globals `saveShot` touches and nothing else.
 */
const set = (name: string, value: unknown) =>
  Object.defineProperty(globalThis, name, { configurable: true, value })

/** A device, described by the two things `saveShot` branches on. */
function device({
  coarse,
  canShare,
  share,
}: {
  coarse: boolean
  canShare: boolean
  share?: () => Promise<void>
}) {
  set('navigator', {
    canShare: () => canShare,
    share: share ?? (() => Promise.resolve()),
  })
  set('window', { matchMedia: (query: string) => ({ matches: coarse, media: query }) })
}

/** Records whether the anchor route was taken, and with what filename. */
function watchDownloads(): { names: string[] } {
  const names: string[] = []
  set('document', {
    createElement: () => {
      const link = { href: '', download: '', click: () => names.push(link.download) }
      return link
    },
  })
  return { names }
}

afterEach(() => {
  for (const name of ['navigator', 'window', 'document']) {
    Reflect.deleteProperty(globalThis, name)
  }
})

describe('a data URL as a file', () => {
  test('keeps the name and the type the sheet will show', () => {
    const file = fileFromDataUrl(PIXEL, 'lounge-2026-08-03.png')
    expect(file.name).toBe('lounge-2026-08-03.png')
    expect(file.type).toBe('image/png')
    expect(file.size).toBeGreaterThan(0)
  })
})

describe('where a shot goes', () => {
  test('downloads on a machine with a pointer', async () => {
    const downloads = watchDownloads()
    device({ coarse: false, canShare: true })

    expect(await saveShot(PIXEL, 'room.png')).toBe('downloaded')
    expect(downloads.names).toEqual(['room.png'])
  })

  test('goes to the share sheet on a touch device', async () => {
    // The bug this file exists for: the anchor below would have "downloaded"
    // to a folder Photos cannot see.
    const downloads = watchDownloads()
    device({ coarse: true, canShare: true })

    expect(await saveShot(PIXEL, 'room.png')).toBe('shared')
    expect(downloads.names).toEqual([])
  })

  test('downloads on a touch device that cannot share files', async () => {
    const downloads = watchDownloads()
    device({ coarse: true, canShare: false })

    expect(await saveShot(PIXEL, 'room.png')).toBe('downloaded')
    expect(downloads.names).toEqual(['room.png'])
  })

  test('leaves a dismissed sheet alone', async () => {
    const downloads = watchDownloads()
    const abort = () => Promise.reject(Object.assign(new Error('cancel'), { name: 'AbortError' }))
    device({ coarse: true, canShare: true, share: abort })

    expect(await saveShot(PIXEL, 'room.png')).toBe('cancelled')
    expect(downloads.names).toEqual([])
  })

  test('falls back when the browser refuses the share', async () => {
    const downloads = watchDownloads()
    const refuse = () => Promise.reject(new Error('not allowed'))
    device({ coarse: true, canShare: true, share: refuse })

    expect(await saveShot(PIXEL, 'room.png')).toBe('downloaded')
    expect(downloads.names).toEqual(['room.png'])
  })
})
