import { describe, expect, it } from 'bun:test'
import { quantise } from '@/domain/studio/quantise'

/** A frame of one colour, `n` pixels wide. */
function flat(n: number, r: number, g: number, b: number, a = 255): Uint8ClampedArray {
  const out = new Uint8ClampedArray(n * 4)
  for (let i = 0; i < n; i += 1) {
    out[i * 4] = r
    out[i * 4 + 1] = g
    out[i * 4 + 2] = b
    out[i * 4 + 3] = a
  }
  return out
}

/** A frame of `n` distinct colours, walking the red channel. */
function ramp(n: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(n * 4)
  for (let i = 0; i < n; i += 1) {
    out[i * 4] = i % 256
    out[i * 4 + 1] = (i >> 8) % 256
    out[i * 4 + 2] = 0
    out[i * 4 + 3] = 255
  }
  return out
}

describe('quantise', () => {
  it('keeps every colour exactly when they all fit', () => {
    const frame = new Uint8ClampedArray([
      10, 20, 30, 255,
      40, 50, 60, 255,
      10, 20, 30, 255,
    ])

    const { palette, frames, transparent } = quantise([frame])

    expect(transparent).toBeNull()
    expect(palette).toEqual([
      [10, 20, 30],
      [40, 50, 60],
    ])
    expect([...frames[0]]).toEqual([0, 1, 0])
  })

  it('builds one palette across every frame', () => {
    const { palette, frames } = quantise([flat(2, 255, 0, 0), flat(2, 0, 0, 255)])

    expect(palette).toEqual([
      [255, 0, 0],
      [0, 0, 255],
    ])
    expect([...frames[0]]).toEqual([0, 0])
    expect([...frames[1]]).toEqual([1, 1])
  })

  it('gives transparency its own index, and points every hole at it', () => {
    const frame = new Uint8ClampedArray([
      10, 20, 30, 255,
      0, 0, 0, 0,
      10, 20, 30, 12,
    ])

    const { palette, frames, transparent } = quantise([frame])

    expect(transparent).toBe(1)
    expect(palette).toHaveLength(2)
    expect([...frames[0]]).toEqual([0, 1, 1])
  })

  it('cuts at half opacity, not at any alpha at all', () => {
    const frame = new Uint8ClampedArray([
      10, 20, 30, 127,
      10, 20, 30, 128,
    ])

    const { frames, transparent } = quantise([frame])

    expect(transparent).toBe(1)
    expect([...frames[0]]).toEqual([1, 0])
  })

  it('says nothing is transparent when nothing is', () => {
    expect(quantise([flat(4, 1, 2, 3)]).transparent).toBeNull()
  })

  it('fits inside the table when there are more colours than entries', () => {
    const { palette, frames, transparent } = quantise([ramp(1000)])

    expect(transparent).toBeNull()
    expect(palette.length).toBeLessThanOrEqual(256)
    expect(frames[0]).toHaveLength(1000)
    for (const index of frames[0]) expect(index).toBeLessThan(palette.length)
  })

  it('leaves room for the hole when a crowded frame also has one', () => {
    const crowded = ramp(1000)
    crowded[3] = 0

    const { palette, transparent } = quantise([crowded])

    expect(transparent).not.toBeNull()
    // 255 colours and the hole. Never 257, which is a table no decoder can read.
    expect(palette.length).toBeLessThanOrEqual(256)
    expect(transparent).toBe(palette.length - 1)
  })

  it('does not spin on a picture with fewer colours than the box count', () => {
    // Two colours, asked to fill 255 boxes: the cut has to stop when no box can
    // be split rather than looping forever on one that cannot.
    const two = new Uint8ClampedArray(8)
    two.set([1, 1, 1, 255], 0)
    two.set([2, 2, 2, 255], 4)

    const { palette } = quantise([two])
    expect(palette).toHaveLength(2)
  })
})
