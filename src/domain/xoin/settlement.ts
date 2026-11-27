/**
 * The order of a trade's two writes, and what to do when the second one fails.
 *
 * ---------------------------------------------------------------------------
 * Why this is a file and not four lines inside the action
 * ---------------------------------------------------------------------------
 * A trade is two writes on two streams - the market's book and somebody's purse
 * - and there is no transaction across them. `docs/product/xoin.md` §5.1 argues
 * the ordering; this is the ordering, lifted out of `tradeXoin` so that it can
 * be *tested*.
 *
 * That mattered enough to be worth a file. Inside the action the sequence is
 * wrapped in `requireTenant`, a database and a service-role client, so the only
 * way to find out what happens when the purse refuses is to make a purse
 * refuse - which nothing in this repo can do on demand. Out here it is four
 * branches over three injected effects, and every one of them is a test.
 *
 * The branch that most needs one is not the failure, it is the *non*-failure:
 * a reversal must never run when the fill was never recorded. Reversing a trade
 * that did not happen would move the book the wrong way and hand somebody a
 * position out of nothing - a way to mint xoin out of a concurrency error.
 */

export type Outcome = { ok: true } | { ok: false; error: string }

export interface TradeEffects {
  /** Append the fill. Its failure means nothing happened. */
  record: () => Promise<Outcome>
  /** Move the coins. Its failure is the one hole in the ordering. */
  pay: () => Promise<Outcome>
  /** Put the book and the position back. Cannot fail for want of money. */
  reverse: (why: string) => Promise<Outcome>
}

/**
 * Record, then pay, and put it back if paying fails.
 *
 * The book goes first because it is the write whose failure means nothing
 * happened - the market stream is the contended one, so its failure is the
 * likely one, and having it happen before any coin moves means the player
 * simply sees "try again". Going the other way round would make the common
 * failure "your coins have gone and there is no trade": the same outcome, with
 * somebody's money in it.
 */
export async function completeTrade(effects: TradeEffects): Promise<Outcome> {
  const recorded = await effects.record()
  if (!recorded.ok) return recorded

  const paid = await effects.pay()
  if (paid.ok) return { ok: true }

  const reversed = await effects.reverse(paid.error)

  return reversed.ok
    ? { ok: false, error: `${paid.error} The trade was put back.` }
    : {
        /*
         * Both halves failed. Rare enough to say out loud rather than smooth
         * over: the book has moved and the purse has not, and somebody should
         * look. Reporting a plain failure would leave a position nobody can
         * explain, which is worse than an alarming sentence.
         */
        ok: false,
        error: `${paid.error} The trade could not be put back either - tell an admin.`,
      }
}
