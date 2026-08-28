import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'bun:test'
import {
  MUSIC_TRACK,
  SOUNDS,
  allSoundFiles,
  pickVariant,
  type SoundId,
} from '@/lib/audio/catalogue'

/**
 * The only part of this feature a type can't check.
 *
 * Everything else about the audio system is types and pure functions. The
 * catalogue is strings that have to match files in public/, and the failure
 * mode when they do not is the worst kind: no error anywhere, just a game that
 * has quietly stopped making one of its noises. Since the packs are pruned to
 * only what is used, this is also what stops a future tidy-up from deleting a
 * file that is still referenced.
 */

/** A URL from the catalogue, back to the path on disk it came from. */
function onDisk(url: string): string {
  return join(process.cwd(), 'public', decodeURIComponent(url))
}

describe('the sound files', () => {
  it('all exist', () => {
    const missing = allSoundFiles().filter((url) => !existsSync(onDisk(url)))
    expect(missing).toEqual([])
  })

  it('includes the background track', () => {
    expect(existsSync(onDisk(MUSIC_TRACK))).toBe(true)
  })

  it('are escaped, because the pack directories have spaces in them', () => {
    // An unescaped space survives `fetch` and fails on other paths, which is
    // the sort of thing that works in dev and 404s behind a proxy.
    for (const url of [...allSoundFiles(), MUSIC_TRACK]) {
      expect(url).not.toContain(' ')
      expect(url.startsWith('/audio/')).toBe(true)
    }
  })
})

describe('the catalogue', () => {
  it('gives every sound at least one recording', () => {
    for (const [id, sound] of Object.entries(SOUNDS)) {
      expect(sound.variants.length, `${id} has no variants`).toBeGreaterThan(0)
    }
  })

  it('keeps the two sides of a fight distinguishable', () => {
    // The whole reason `hurt` exists as its own sound: in a scrap you must be
    // able to tell a hit you landed from one you took without reading a bar.
    expect(SOUNDS.hit.variants).not.toEqual(SOUNDS.hurt.variants)
  })

  it('throttles only the sounds that repeat', () => {
    // A hit is never swallowed - landing two quickly is the good case.
    expect(SOUNDS.hit.minGapMs).toBe(0)
    // Building drags, and arrivals come in roster-sized batches.
    expect(SOUNDS.build.minGapMs).toBeGreaterThan(0)
    expect(SOUNDS.arrive.minGapMs).toBeGreaterThan(0)
  })
})

describe('pickVariant', () => {
  it('walks the whole list', () => {
    const ids = Object.keys(SOUNDS) as SoundId[]
    for (const id of ids) {
      const { variants } = SOUNDS[id]
      expect(pickVariant(id, () => 0)).toBe(variants[0])
      expect(pickVariant(id, () => 0.999)).toBe(variants[variants.length - 1])
    }
  })

  it('stays in range when random() returns exactly 1', () => {
    // Math.random() never does, but the guard is what keeps a stubbed or
    // patched source of randomness from returning undefined here - which would
    // reach `fetch(undefined)` and 404 rather than throw anywhere useful.
    expect(pickVariant('hit', () => 1)).toBe(
      SOUNDS.hit.variants[SOUNDS.hit.variants.length - 1],
    )
  })
})
