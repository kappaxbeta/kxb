/**
 * Run an async function over a list, a few at a time.
 *
 * ---------------------------------------------------------------------------
 * Why not `Promise.all`, and why not a plain loop
 * ---------------------------------------------------------------------------
 * `Promise.all(items.map(fn))` starts everything at once. Against a third party
 * that rate-limits - Stripe, chiefly - that turns a list of a thousand into a
 * thousand simultaneous requests and a wall of 429s, which is slower than doing
 * them one at a time and much harder to reason about afterwards.
 *
 * A plain `for` loop has the opposite problem: it spends the whole run waiting
 * on network latency with nothing in flight. At 200 ms a call, a thousand items
 * is over half an hour of a Node process doing nothing.
 *
 * A small fixed window is the honest middle. Six concurrent calls against a
 * 200 ms API is roughly thirty a second, which finishes a thousand in under a
 * minute and stays far below anybody's rate limit.
 *
 * ---------------------------------------------------------------------------
 * Failures are values, not throws
 * ---------------------------------------------------------------------------
 * `fn` rejecting resolves to `{ ok: false }` for that item rather than
 * rejecting the whole run. This is deliberate and it is the same rule the
 * entitlement sync already stated for itself: one person's broken Stripe record
 * must not stop the other 999 from being reconciled. Callers that want
 * all-or-nothing can check the results themselves; callers that want
 * best-effort - which is every batch job here - get it by default.
 */

export type Settled<T> = { ok: true; value: T } | { ok: false; error: Error }

/**
 * Map over `items` with at most `limit` calls in flight.
 *
 * Results come back in input order regardless of the order they finished in,
 * because a caller reporting "the first five failures" means the first five in
 * the list, not whichever five happened to lose their races.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<Settled<R>[]> {
  if (items.length === 0) return []

  // A limit below one would start no workers at all and hang forever. Clamping
  // rather than throwing: this is arithmetic on a config constant, and a job
  // that quietly runs serially is a better failure than a job that never
  // returns.
  const workers = Math.max(1, Math.min(Math.floor(limit), items.length))

  const results = new Array<Settled<R>>(items.length)

  // One shared cursor, read and incremented by each worker as it frees up.
  // That is what makes this a *window* rather than fixed-size chunks: a slow
  // item holds up only its own worker, not the five beside it waiting at a
  // barrier for the batch to finish.
  let next = 0

  async function work(): Promise<void> {
    for (;;) {
      const index = next++
      if (index >= items.length) return

      try {
        results[index] = { ok: true, value: await fn(items[index]!, index) }
      } catch (error) {
        results[index] = {
          ok: false,
          error: error instanceof Error ? error : new Error(String(error)),
        }
      }
    }
  }

  await Promise.all(Array.from({ length: workers }, () => work()))

  return results
}
