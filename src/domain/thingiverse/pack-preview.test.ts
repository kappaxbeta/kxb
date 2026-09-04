import { describe, expect, test } from 'bun:test'
import { MODEL_PACKS, thumbnailFor } from '@/domain/thingiverse/models'
import {
  COVER_SIZE,
  packPreview,
  packPreviews,
  splitPreviews,
} from '@/domain/thingiverse/pack-preview'

describe('a pack cover', () => {
  test('shows four of the pack it names', () => {
    const preview = packPreview('xp:adventurers')
    expect(preview?.models).toHaveLength(COVER_SIZE)
    expect(preview?.models.every((id) => id.startsWith('xp:adventurers/'))).toBe(true)
  })

  test('a pack smaller than a cover shows what it has, not a padded row', () => {
    const small = MODEL_PACKS.find((pack) => pack.size > 0 && pack.size < COVER_SIZE)
    // Guarded rather than assumed: a pack this small is a fact about what we
    // ship today, and the test should still be meaningful the day none is.
    if (!small) return
    expect(packPreview(small.id)?.models).toHaveLength(small.size)
  })

  /**
   * The whole reason the sampling is not `slice(0, 4)`. A pack of arrows sorted
   * by filename opens on four colours of the same shape, and a cover that says
   * "arrows" about a hundred and fifty-six things is a cover that lied.
   */
  test('the picks are spread through the pack rather than taken off the front', () => {
    const preview = packPreview('xp:shapes')
    if (!preview || preview.pack.size <= COVER_SIZE) return

    const all = packPreview('xp:shapes', preview.pack.size)?.models ?? []
    const front = all.slice(0, COVER_SIZE)
    expect(preview.models).not.toEqual(front)
    // And none of them is the very first or the very last, which is what
    // sampling at the middle of each interval buys.
    expect(preview.models).not.toContain(all[0])
    expect(preview.models).not.toContain(all[all.length - 1])
  })

  test('the same pack twice is the same cover', () => {
    expect(packPreview('xp:dungeon')).toEqual(packPreview('xp:dungeon'))
  })

  test('the thumbnails line up with the models', () => {
    const preview = packPreview('park')
    expect(preview?.thumbnails).toEqual(preview?.models.map(thumbnailFor) ?? [])
  })

  test('a pack nothing ships is nothing, not a throw', () => {
    expect(packPreview('nope')).toBeNull()
    expect(packPreview('xp:nope')).toBeNull()
  })
})

describe('every pack', () => {
  test('gets a cover, in the order the pickers list them', () => {
    const previews = packPreviews()
    expect(previews).toHaveLength(MODEL_PACKS.length)
    expect(previews.map((preview) => preview.pack.id)).toEqual(
      MODEL_PACKS.map((pack) => pack.id),
    )
  })

  test('and every cover has at least one picture in it', () => {
    for (const preview of packPreviews()) {
      expect(preview.models.length).toBeGreaterThan(0)
      expect(preview.thumbnails.every((url) => url !== '')).toBe(true)
    }
  })

  test('the split is the namespace and nothing else', () => {
    const { rooms, levels } = splitPreviews(packPreviews())
    expect(rooms.length + levels.length).toBe(MODEL_PACKS.length)
    expect(rooms.every((preview) => !preview.pack.id.startsWith('xp:'))).toBe(true)
    expect(levels.every((preview) => preview.pack.id.startsWith('xp:'))).toBe(true)
  })
})
