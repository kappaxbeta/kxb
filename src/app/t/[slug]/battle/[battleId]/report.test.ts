import { describe, expect, test } from 'bun:test'
import { report } from '@/app/t/[slug]/battle/[battleId]/report'

/**
 * The rule two bugs were needed to arrive at.
 *
 * A goal that never reached the score, and a match left unfinishable - both
 * because a request that *rejected* was treated the same as one the server
 * *refused*. The two are opposites, and until now the difference lived in a
 * comment beside each of two copies.
 */

const never = async (): Promise<void> => {
  throw new Error('sleep should not have been reached')
}
const instant = async () => {}

describe('a server that answers', () => {
  test('taking it is done, first time', async () => {
    let calls = 0
    const out = await report(async () => { calls++; return { ok: true } as const },
      { attempts: 3, backoff: () => 1, sleep: never })
    expect(out).toEqual({ at: 'done' })
    expect(calls).toBe(1)
  })

  /**
   * A decided answer is final. Trying again says the same thing more slowly,
   * and the message is a sentence the player needs to read.
   */
  test('refusing it is final, and is never retried', async () => {
    let calls = 0
    const out = await report(async () => { calls++; return { ok: false, error: 'not_live' } as const },
      { attempts: 3, backoff: () => 1, sleep: never })
    expect(out).toEqual({ at: 'refused', error: 'not_live' })
    expect(calls).toBe(1)
  })

  test('and the refusal comes back with the action’s own words', async () => {
    const out = await report(async () => ({ ok: false, error: 'already_counted' }) as const,
      { attempts: 3, backoff: () => 1, sleep: never })
    expect(out.at === 'refused' && out.error).toBe('already_counted')
  })
})

describe('a server that says nothing', () => {
  /** Nothing was decided, so the event is still worth landing. */
  test('is tried again', async () => {
    let calls = 0
    const out = await report(async () => {
      calls++
      if (calls < 3) throw new Error('network')
      return { ok: true } as const
    }, { attempts: 3, backoff: () => 1, sleep: instant })
    expect(out).toEqual({ at: 'done' })
    expect(calls).toBe(3)
  })

  test('and is given up on only after the last attempt', async () => {
    let calls = 0
    const out = await report(async () => { calls++; throw new Error('network') },
      { attempts: 3, backoff: () => 1, sleep: instant })
    expect(out).toEqual({ at: 'lost' })
    expect(calls).toBe(3)
  })

  /** Waiting after the final attempt is time spent on a decision already made. */
  test('does not wait after the attempt it gives up on', async () => {
    const waits: number[] = []
    await report(async () => { throw new Error('network') },
      { attempts: 3, backoff: (n) => n * 400, sleep: async (ms) => { waits.push(ms) } })
    expect(waits).toEqual([400, 800])
  })

  test('a single-attempt report never sleeps at all', async () => {
    const out = await report(async () => { throw new Error('network') },
      { attempts: 1, backoff: () => 1, sleep: never })
    expect(out).toEqual({ at: 'lost' })
  })

  /** A refusal arriving after a silence is still an answer, and still final. */
  test('a refusal on a later attempt stops the retries', async () => {
    let calls = 0
    const out = await report(async () => {
      calls++
      if (calls === 1) throw new Error('network')
      return { ok: false, error: 'not_live' } as const
    }, { attempts: 5, backoff: () => 1, sleep: instant })
    expect(out).toEqual({ at: 'refused', error: 'not_live' })
    expect(calls).toBe(2)
  })
})
