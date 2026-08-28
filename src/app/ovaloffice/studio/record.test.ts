import { describe, expect, test } from 'bun:test'
import { canRecord, captureNote } from '@/app/ovaloffice/studio/record'

/**
 * The part of recording that can be checked without a canvas.
 *
 * `MediaRecorder` encodes in real time and drops frames rather than slowing
 * down when it cannot keep up, so the only thing standing between a stuttery
 * clip and a stuttery clip that gets posted is this verdict. Worth a test even
 * though the capture around it is not reachable from here.
 */

const capture = (drawn: number, wanted: number, elapsed: number) => ({
  blob: new Blob(),
  drawn,
  wanted,
  elapsed,
})

describe('the verdict on a take', () => {
  test('is quiet when the recorder kept up', () => {
    expect(captureNote(capture(240, 240, 8)).dropped).toBe(false)
  })

  test('stays quiet about a handful of missed frames', () => {
    // Six frames short over eight seconds is invisible, and warning about it
    // would train everybody to ignore the warning that matters.
    expect(captureNote(capture(234, 240, 8)).dropped).toBe(false)
  })

  test('speaks up once the shortfall is enough to see', () => {
    const note = captureNote(capture(120, 240, 8))
    expect(note.dropped).toBe(true)
    expect(note.text).toContain('too heavy')
  })

  test('reports the rate actually achieved, not the one asked for', () => {
    expect(captureNote(capture(120, 240, 8)).text).toContain('15')
  })

  test('does not divide by zero on a take that recorded nothing', () => {
    expect(() => captureNote(capture(0, 0, 0))).not.toThrow()
    expect(Number.isFinite(Number(captureNote(capture(0, 240, 0)).text.match(/\d+/)?.[0]))).toBe(
      true,
    )
  })
})

describe('whether recording is possible at all', () => {
  test('is false where there is no MediaRecorder, rather than throwing', () => {
    // Which is this environment - the point being that the button asks before
    // it offers, instead of failing at the click.
    expect(canRecord()).toBe(false)
  })
})
