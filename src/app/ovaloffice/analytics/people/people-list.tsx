'use client'

import Link from 'next/link'
import type { ProfileSummary } from '@/domain/analytics/profiles'
import { sectionLabel } from '@/domain/analytics/sections'
import { Pager, TableToolbar, useTableView } from '@/app/ovaloffice/_table/table-view'
import { flagOf, lastSeenAt } from '../parts'

/**
 * The People table, with a client-side search box and pager over the rows the
 * server already fetched. The query never reaches the database - it filters the
 * bounded top-N the page handed down. See `_table/table-view` for why.
 */
export function PeopleList({ rows, range }: { rows: ProfileSummary[]; range: number }) {
  // Haystack: what an operator scans for - display name, user id, the route
  // they live in, their country and their device.
  const view = useTableView(
    rows,
    (account) =>
      `${account.username ?? ''} ${account.userId} ${sectionLabel(account.topSection)} ${
        account.country ?? ''
      } ${account.device ?? ''}`,
    { pageSize: 50 },
  )

  return (
    <>
      <TableToolbar view={view} unit="accounts" placeholder="Search people…" />

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Account</th>
              <th className="px-3 py-2 font-medium">Mostly in</th>
              <th className="px-3 py-2 font-medium">Where</th>
              <th className="px-3 py-2 text-right font-medium">Days</th>
              <th className="px-3 py-2 text-right font-medium">Views</th>
              <th className="px-3 py-2 font-medium">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {view.pageRows.map((account) => (
              <tr key={account.userId} className="border-t border-border hover:bg-secondary">
                <td className="px-3 py-2">
                  <Link
                    href={`/ovaloffice/analytics/people/${account.userId}?days=${range}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {account.username ?? 'no username'}
                  </Link>
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {sectionLabel(account.topSection)}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {account.country ? `${flagOf(account.country)} ${account.country}` : '—'}
                  <span className="ml-2 text-xs text-muted-foreground/70">{account.device}</span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{account.activeDays}</td>
                <td className="px-3 py-2 text-right tabular-nums">{account.views}</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                  {lastSeenAt(account.lastSeen)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {rows.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Nobody signed in visited in the last {range} days.
          </p>
        )}
      </div>

      <Pager view={view} />
    </>
  )
}
