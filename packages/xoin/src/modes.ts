/**
 * What a space chose xoin to be.
 *
 * ---------------------------------------------------------------------------
 * Why this is a setting and not a decision we made once
 * ---------------------------------------------------------------------------
 * `docs/product/economy.md` §1 says there is one coin, and means it: a second
 * currency is two balances, two places to earn, and the immediate question of
 * whether they exchange. A feature called a cryptocoin walks straight into
 * that, and the honest resolution is not to pick a side on everybody's behalf -
 * it is to make the side a space picks, and to make the safe one the default.
 *
 * So a market has a mode, the mode is per space, and a space that has installed
 * nothing has `demo`. Every rule that follows from the choice is spelled out in
 * `rulesOf` rather than left as a series of `if (mode === ...)` scattered
 * through the callers, because the whole risk of this feature is a surface that
 * forgets which mode it is in and moves a real coin.
 */

export const MODES = ['demo', 'asset', 'currency'] as const

export type XoinMode = (typeof MODES)[number]

/** What a space gets by installing nothing. */
export const DEFAULT_MODE: XoinMode = 'demo'

export interface XoinRules {
  /** Whether a trade touches the member's real purse. */
  spendsPurse: boolean
  /** Whether the fee on a trade reaches the space's bank. */
  banksFees: boolean
  /**
   * Whether a xoin holding is a balance in its own right - earnable, spendable
   * on the things coins buy, and shown outside this cartridge.
   */
  isCurrency: boolean
  /**
   * Whether the economy flag has to be on as well.
   *
   * Anything that moves a coin does. `demo` does not, which is what lets a
   * space that has never opted into an economy still put the game on a shelf.
   */
  needsEconomy: boolean
}

/**
 * The three, and the argument for each.
 *
 * `demo` - a sandbox with a fake stake. The market is real in the only sense
 * that matters to a chart: the price moves on a schedule everybody's client
 * agrees about. Nothing leaves the cartridge, so nothing here can be lost, and
 * no flag beyond `xoin` has to be on. This is the mode a space gets by not
 * choosing, and the mode most spaces should stay in - it is the whole game
 * minus the part where somebody is upset.
 *
 * `asset` - coins buy xoin and xoin sells for coins, and §1 survives untouched
 * because xoin is never money here. It is a thing you hold, priced in the one
 * currency, the way a blueprint or a skin is a thing you hold. The purse is at
 * risk, the space's bank takes the fee, and the pool cannot pay out coins that
 * were not paid in.
 *
 * `currency` - the mode that actually overturns §1, chosen deliberately by a
 * space that wants two balances. It carries one rule the other two do not need
 * and that is not negotiable: **xoin never leaves for the wallet.** §3.1 shuts
 * the door on coins earned where the rules do not apply; a second currency with
 * no such door would be the same hole with a different name, so there is no
 * door at all. Xoin is spendable in the space that minted it and nowhere else.
 */
export function rulesOf(mode: XoinMode): XoinRules {
  switch (mode) {
    case 'demo':
      return { spendsPurse: false, banksFees: false, isCurrency: false, needsEconomy: false }
    case 'asset':
      return { spendsPurse: true, banksFees: true, isCurrency: false, needsEconomy: true }
    case 'currency':
      return { spendsPurse: true, banksFees: true, isCurrency: true, needsEconomy: true }
  }
}

/** For the settings card, so the copy and the rules cannot drift apart. */
export const MODE_LABELS: Record<XoinMode, string> = {
  demo: 'Demo',
  asset: 'An asset, priced in coins',
  currency: 'A second currency',
}

/**
 * Anything a caller was handed that is not one of the three is `demo`.
 *
 * Fail-safe in the same direction the `economy` flag falls back in, and for the
 * same reason: a row written by a version that knew a fourth mode, or a column
 * that somehow holds rubbish, must not be read as permission to take coins off
 * somebody. The failure this produces is a space that briefly plays for fun.
 */
export function readMode(value: unknown): XoinMode {
  return MODES.includes(value as XoinMode) ? (value as XoinMode) : DEFAULT_MODE
}
