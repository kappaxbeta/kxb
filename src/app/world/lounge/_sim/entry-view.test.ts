import { describe, expect, test } from 'bun:test'
import {
  advanceEntry,
  ENTRY_SECONDS,
  entryEase,
  OVERVIEW_BACK,
  OVERVIEW_RAISE,
  overviewPosition,
} from './entry-view'

describe('where the camera watches from before you click in', () => {
  const spawn = { x: 0, y: 2, z: 0 }

  test('sits above the spawn and back along the heading', () => {
    const camera = overviewPosition(spawn, { x: 0, z: 1 })

    expect(camera.y).toBe(spawn.y + OVERVIEW_RAISE)
    expect(camera.z).toBe(spawn.z - OVERVIEW_BACK)
    expect(camera.x).toBe(0)
  })

  test('follows the heading round rather than always facing one way', () => {
    const camera = overviewPosition(spawn, { x: 1, z: 0 })

    expect(camera.x).toBe(spawn.x - OVERVIEW_BACK)
    expect(camera.z).toBe(0)
  })

  test('keeps its distance whatever length the heading arrives at', () => {
    // A camera direction that is looking downward is short in the horizontal
    // plane. Trusting it would reel the overview in exactly when it should not.
    const short = overviewPosition(spawn, { x: 0, z: 0.05 })
    const unit = overviewPosition(spawn, { x: 0, z: 1 })

    expect(short.z).toBeCloseTo(unit.z, 10)
  })

  test('looks down more steeply than 45 degrees', () => {
    // The framing the constants are chosen for: a floor plan you can read, with
    // the walls still standing up in it.
    expect(OVERVIEW_RAISE).toBeGreaterThan(OVERVIEW_BACK)
  })

  test('a heading of nothing at all still gives a usable pose', () => {
    // Frame one, before the camera has been pointed anywhere.
    const camera = overviewPosition(spawn, { x: 0, z: 0 })

    expect(Number.isFinite(camera.x)).toBe(true)
    expect(Number.isFinite(camera.z)).toBe(true)
    expect(camera.y).toBe(spawn.y + OVERVIEW_RAISE)
  })

  test('is measured from the spawn, not from the origin', () => {
    // A match spreads people around a ring, and a tower moves the spawn upward.
    const perched = { x: 9, y: 14, z: -4 }
    const camera = overviewPosition(perched, { x: 0, z: 1 })

    expect(camera.x).toBe(9)
    expect(camera.y).toBe(14 + OVERVIEW_RAISE)
    expect(camera.z).toBe(-4 - OVERVIEW_BACK)
  })
})

describe('the descent to eye level', () => {
  test('takes ENTRY_SECONDS of frames to finish', () => {
    let progress = 0
    // Sixty frames a second for exactly the advertised duration.
    for (let i = 0; i < Math.round(ENTRY_SECONDS * 60); i++) {
      progress = advanceEntry(progress, 1 / 60)
    }

    expect(progress).toBeCloseTo(1, 5)
  })

  test('never overshoots, however long the frame was', () => {
    // A tab that was backgrounded mid-descent comes back with a huge delta.
    expect(advanceEntry(0.4, 30)).toBe(1)
  })

  test('a frame that took no time changes nothing', () => {
    expect(advanceEntry(0.4, 0)).toBe(0.4)
  })

  test('starts at the overview and ends at eye level', () => {
    expect(entryEase(0)).toBe(0)
    expect(entryEase(1)).toBe(1)
  })

  test('covers most of the distance early, so it settles rather than lands', () => {
    // Ease-out: half the time should already be most of the way there.
    expect(entryEase(0.5)).toBeGreaterThan(0.8)
  })

  test('never leaves the 0..1 range it is asked to blend across', () => {
    expect(entryEase(-1)).toBe(0)
    expect(entryEase(2)).toBe(1)
  })

  test('only ever moves toward eye level', () => {
    let previous = -1
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const eased = entryEase(t)
      expect(eased).toBeGreaterThanOrEqual(previous)
      previous = eased
    }
  })
})
