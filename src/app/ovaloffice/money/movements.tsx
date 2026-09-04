import { displayNameFrom } from '@/domain/profile/username-queries'
import type { Movement } from '@/domain/bank/backoffice'

/**
 * The history, whichever way it was asked for.
 *
 * One component for all three questions - a person's movements, a space's, and
 * one person's inside one space - because they are one list with different
 * filters in front of them, and three renderers would be three places for
 * "what a `CustomerServed` is worth" to be spelled differently.
 *
 * ---------------------------------------------------------------------------
 * Every line says where and with whom
 * ---------------------------------------------------------------------------
 * A movement used to read "-40, sent", which is a number and a verb and no
 * answer to the only question anybody opens this page with. It now says which
 * space it happened in and who was on the other end, so a line is a whole
 * sentence: *forty left Ada's purse, in the kitchen, and went to Bo*.
 *
 * The columns that are already fixed by the filter are dropped rather than
 * repeated - reading one space, every row would say the same space forty times,
 * which is a column of noise beside the one that differs. `who` appears only
 * when the list is not already one person's.
 */
export function Movements({
  movements,
  names,
  spaceNames,
  /** True when the list is already one person's, so their name is not repeated. */
  onePerson,
  /** True when it is already one space's. */
  oneSpace,
}: {
  movements: readonly Movement[]
  names: ReadonlyMap<string, string>
  spaceNames: ReadonlyMap<string, string | null>
  onePerson: boolean
  oneSpace: boolean
}) {
  if (movements.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        Nothing has moved — or nothing recently enough to be in the window this
        page reads. See <code>sweep</code>.
      </p>
    )
  }

  return (
    <ul className="space-y-1">
      {movements.map((move, index) => (
        <li
          key={`${move.at}-${index}`}
          className="flex items-baseline gap-3 border-b border-line/40 py-1 text-sm"
        >
          <span className="w-36 shrink-0 font-mono text-[11px] text-ink-muted">
            {move.at.slice(0, 16).replace('T', ' ')}
          </span>

          {!onePerson && (
            <a
              href={`/ovaloffice/money?person=${move.owner}`}
              className="w-32 shrink-0 truncate underline-offset-2 hover:underline"
            >
              {displayNameFrom(names, move.owner)}
            </a>
          )}

          <span
            className={`w-16 shrink-0 text-right font-mono tabular-nums ${
              move.amount > 0 ? 'text-ink' : 'text-ink-muted'
            }`}
          >
            {move.amount > 0 ? `+${move.amount}` : move.amount}
          </span>

          <span className="shrink-0">{move.label}</span>

          {/*
            The other end, when there was one. A mint has nobody there, which is
            the entire reason the badge on the right is worth spotting: those
            are the coins that came from nowhere.
          */}
          {move.counterparty && (
            <a
              href={`/ovaloffice/money?person=${move.counterparty}`}
              className="shrink-0 text-ink-muted underline-offset-2 hover:text-ink hover:underline"
            >
              {move.amount > 0 ? 'from' : 'to'} {displayNameFrom(names, move.counterparty)}
            </a>
          )}

          {!oneSpace && (
            <a
              href={`/ovaloffice/money?space=${move.tenantId}`}
              className="shrink-0 text-ink-muted underline-offset-2 hover:text-ink hover:underline"
            >
              in {spaceNames.get(move.tenantId) ?? move.tenantId}
            </a>
          )}

          {move.what && <span className="truncate text-ink-muted">{move.what}</span>}

          {move.minted && (
            <span className="ml-auto shrink-0 rounded border border-accent/50 px-1.5 text-[10px] uppercase tracking-[0.14em] text-accent">
              minted
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}
