import { displayNameFrom } from '@/domain/profile/username-queries'
import type { MoneyPerson } from '@/domain/bank/backoffice'
import { HideControls } from '@/app/ovaloffice/money/hide-controls'

/**
 * Who has coins, and where they are holding them.
 *
 * Every space in the right-hand column is a link into the *other* list, which
 * is the whole reason these two tables are worth having beside each other: an
 * investigation is a walk. A total looks wrong, so you look at their spaces;
 * one of those looks generous, so you look at everybody in it; one of those
 * people is where it is all coming from. Two lists that point at each other are
 * that walk, and a column of plain text is a walk you do by retyping ids.
 */
export function PeopleTable({
  people,
  names,
  selected,
  mayHide,
}: {
  people: readonly MoneyPerson[]
  names: ReadonlyMap<string, string>
  /** The person being read, so the row they came from is marked rather than lost. */
  selected: string | null
  mayHide: boolean
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-sm">
        <thead className="text-left text-[10px] uppercase tracking-[0.14em] text-ink-muted">
          <tr>
            <th className="py-2 pr-4">Who</th>
            <th className="py-2 pr-4 text-right">Total</th>
            <th className="py-2 pr-4 text-right">Wallet</th>
            <th className="py-2">Spaces</th>
          </tr>
        </thead>
        <tbody>
          {people.map((row) => (
            <tr
              key={row.userId}
              className={`border-t border-line/60 align-top ${
                row.userId === selected ? 'bg-accent/5' : ''
              }`}
            >
              <td className="py-2 pr-4">
                <a
                  href={`/ovaloffice/money?person=${row.userId}`}
                  className="underline-offset-2 hover:underline"
                >
                  {displayNameFrom(names, row.userId)}
                </a>
              </td>
              <td className="py-2 pr-4 text-right font-mono tabular-nums">{row.total}</td>
              <td className="py-2 pr-4 text-right font-mono tabular-nums text-ink-muted">
                {row.wallet}
              </td>
              <td className="py-2">
                <ul className="space-y-0.5">
                  {row.spaces.map((space) => (
                    <li key={space.tenantId} className="flex items-center gap-2">
                      {/*
                        Two links on one line, and they mean different things:
                        the name opens the space, the pair opens this person's
                        history *in* that space. The second is the one somebody
                        actually wants after spotting an odd number, and it is
                        the only place in the section where both axes are fixed
                        at once.
                      */}
                      <a
                        href={`/ovaloffice/money?space=${space.tenantId}`}
                        className="text-ink-muted underline-offset-2 hover:text-ink hover:underline"
                      >
                        {space.name ?? space.tenantId}
                      </a>
                      <a
                        href={`/ovaloffice/money?person=${row.userId}&space=${space.tenantId}`}
                        className="font-mono tabular-nums underline-offset-2 hover:underline"
                      >
                        {space.coins}
                      </a>
                      {mayHide && <HideControls tenantId={space.tenantId} userId={row.userId} />}
                    </li>
                  ))}
                </ul>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
