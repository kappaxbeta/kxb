/**
 * The xoin market.
 *
 * One barrel over four subjects: the unit, the pool, the clock, and the modes a
 * space can install it in. Everything a caller needs is here, so no surface
 * ever reaches past this into a file and gets a private helper by accident.
 *
 * `docs/product/xoin.md` is the argument for all of it, and is worth reading
 * before changing a number in `pool.ts` or `drift.ts` - most of them are load
 * bearing in a way the code alone does not show.
 */

export { SPECKS, SPECK_LABEL, formatXoin, xoin } from './market/units'
export {
  FEE_BPS,
  FLOOR_SPECKS,
  OPENING_COINS,
  OPENING_SPECKS,
  accepts,
  quoteBuy,
  quoteSell,
  settle,
  slippage,
  unsettle,
  spotPrice,
  type Fill,
  type Quote,
  type Reserves,
  type Side,
} from './market/pool'
export {
  EMISSION,
  EPOCH_MS,
  HALVING_EPOCHS,
  VOLATILITY,
  epochAt,
  mined,
  moodMultiplier,
  seedOf,
  sentiment,
} from './market/drift'
export { changeOver, floatAt, priceAt, seriesAt, type Market, type Tick } from './market/price'
export {
  DEFAULT_MODE,
  MODES,
  MODE_LABELS,
  readMode,
  rulesOf,
  type XoinMode,
  type XoinRules,
} from './modes'
export {
  DEMO_STAKE,
  applyFill,
  openPosition,
  profitAt,
  valueAt,
  worthAt,
  type Position,
} from './market/position'
export { DEMO_AGE_EPOCHS, demoBirth } from './play/demo'
