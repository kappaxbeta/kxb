import { displayNameFrom } from '@/domain/profile/username-queries'
import type { MoneySpace } from '@/domain/bank/backoffice-spaces'

/**
 * What is in each space, and who is in it.
 *
 * The mirror of the people table, and the half that was missing. A person's
 * history crosses spaces and a space's crosses people, so a question about one
 * asked in the other's table is a question assembled by eye.
 *
 * Sorted by what the members hold rather than by the bank, because that is the
 * figure saying how much play money is loose in there. `taken` beside the bank
 * balance for the reason the owner's own card gives: a bank at zero having
 * taken nothing and a bank at zero having taken forty thousand are different
 * spaces, and only the pair tells them apart.
 */
export function SpacesTable({
  spaces,
  names,
  selected,
}: {
  spaces: readonly MoneySpace[]
  names: ReadonlyMap<string, string>
  selected: string | null
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[44rem] text-sm">
        <thead className="text-left text-[10px] uppercase tracking-[0.14em] text-ink-muted">
          <tr>
            <th className="py-2 pr-4">Space</th>
            <th className="py-2 pr-4 text-right">In purses</th>
            <th className="py-2 pr-4 text-right">Bank</th>
            <th className="py-2 pr-4 text-right">Taken</th>
            <th className="py-2">People</th>
          </tr>
        </thead>
        <tbody>
          {spaces.map((space) => (
            <tr
              key={space.tenantId}
              className={`border-t border-line/60 align-top ${
                space.tenantId === selected ? 'bg-accent/5' : ''
              }`}
            >
              <td className="py-2 pr-4">
                <a
                  href={`/ovaloffice/money?space=${space.tenantId}`}
                  className="underline-offset-2 hover:underline"
                >
                  {space.name ?? space.tenantId}
                </a>
              </td>
              <td className="py-2 pr-4 text-right font-mono tabular-nums">{space.purses}</td>
              <td className="py-2 pr-4 text-right font-mono tabular-nums text-ink-muted">
                {space.bank ? space.bank.coins : '—'}
              </td>
              <td className="py-2 pr-4 text-right font-mono tabular-nums text-ink-muted">
                {space.bank ? space.bank.taken : '—'}
              </td>
              <td className="py-2">
                <ul className="space-y-0.5">
                  {space.members.map((member) => (
                    <li key={member.userId} className="flex items-center gap-2">
                      <a
                        href={`/ovaloffice/money?person=${member.userId}`}
                        className="text-ink-muted underline-offset-2 hover:text-ink hover:underline"
                      >
                        {displayNameFrom(names, member.userId)}
                      </a>
                      <a
                        href={`/ovaloffice/money?person=${member.userId}&space=${space.tenantId}`}
                        className="font-mono tabular-nums underline-offset-2 hover:underline"
                      >
                        {member.coins}
                      </a>
                    </li>
                  ))}
                  {space.members.length === 0 && (
                    // A bank and nobody holding a purse. Said rather than left
                    // blank: it means the space took money from people who have
                    // since gone, which is a thing to be able to see.
                    <li className="text-ink-muted">nobody holds a purse here</li>
                  )}
                </ul>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
