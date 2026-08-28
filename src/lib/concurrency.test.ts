import { describe, expect, it } from 'bun:test'
import { mapWithConcurrency } from '@/lib/concurrency'

describe('mapWithConcurrency', () => {
  it('returns results in input order, not completion order', async () => {
    // Later items finish first. If the implementation pushed as it went, this
    // would come back reversed - which would silently misattribute every error
    // a batch job reports.
    const results = await mapWithConcurrency([30, 20, 10], 3, async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, ms))
      return ms
    })

    expect(results.map((r) => (r.ok ? r.value : null))).toEqual([30, 20, 10])
  })

  it('never exceeds the limit', async () => {
    let inFlight = 0
    let peak = 0

    await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight--
    })

    expect(peak).toBe(4)
  })

  it('keeps going when one item throws', async () => {
    // The whole reason this returns Settled rather than rejecting: one broken
    // Stripe record must not stop the rest of the run.
    const results = await mapWithConcurrency([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error('boom')
      return n
    })

    expect(results[0]).toEqual({ ok: true, value: 1 })
    expect(results[1]?.ok).toBe(false)
    expect(results[2]).toEqual({ ok: true, value: 3 })
  })

  it('wraps a non-Error throw rather than losing it', async () => {
    const results = await mapWithConcurrency(['x'], 1, async () => {
      throw 'a string, as libraries sometimes do'
    })

    expect(results[0]?.ok).toBe(false)
    expect(results[0]!.ok === false && results[0]!.error.message).toContain('a string')
  })

  it('handles an empty list and a nonsense limit', async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([])

    // A limit of zero must not hang.
    const results = await mapWithConcurrency([1, 2], 0, async (n) => n)
    expect(results.map((r) => (r.ok ? r.value : null))).toEqual([1, 2])
  })
})
