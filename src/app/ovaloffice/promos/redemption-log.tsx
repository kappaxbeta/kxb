'use client'

import type { RedeemSource } from '@/domain/promo/application'
import type { RedemptionView } from '@/domain/promo/queries'
import { campaignSlug } from '@/domain/analytics/campaign'
import { Pager, TableToolbar, useTableView } from '@/app/ovaloffice/_table/table-view'

/**
 * Every redemption, newest first.
 *
 * A client component now only so the shared search box and pager can run in the
 * browser - there is still nothing to *do* to a redemption, it happened. Its
 * only job is to answer the two questions the counters above cannot: *when* a
 * campaign landed, and against which `?src=` the people it brought had arrived.
 *
 * Note what is not here: no email, no user id, no name. This page is for
 * reading how a campaign performed, and a list of "these named people took the
 * free offer" is a thing worth not building by accident. The id is in the table
 * for support and for the one-per-account rule; it does not need to be on a
 * screen.
 */

const SOURCE_LABEL: Record<RedeemSource, string> = {
  link: 'followed the link',
  signup: 'at sign-up',
  picker: 'from the picker',
  space: 'inside a space',
  // The odd one out, and phrased so it reads as such in a list of arrivals:
  // nobody came through a door, somebody was put on a plan.
  grant: 'granted by an operator',
}

export function RedemptionLog({ redemptions }: { redemptions: RedemptionView[] }) {
  // Code, the door it came through and the campaign tag (as displayed) are what
  // an operator scans when tracing how one campaign landed. Called before the
  // empty-list return so the hook order stays fixed.
  const view = useTableView(
    redemptions,
    (row) => `${row.code} ${row.source} ${campaignSlug(row.campaign) ?? row.campaign ?? ''}`,
  )

  if (redemptions.length === 0) {
    return (
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Redemptions</h3>
        <p className="text-sm text-muted-foreground">
          Nothing redeemed yet.
        </p>
      </section>
    )
  }

  const live = redemptions.filter((row) => row.live).length

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">
        Redemptions
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          {redemptions.length} total · {live} still running
        </span>
      </h3>

      <TableToolbar view={view} placeholder="Search by code, source or campaign…" unit="redemptions" />

      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
        {view.pageRows.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 bg-secondary/40 px-3 py-2 text-sm"
          >
            <span className="font-mono text-xs">{row.code}</span>

            <span className="text-xs text-muted-foreground">
              {SOURCE_LABEL[row.source]}
            </span>

            {/*
              The campaign tag as it was in the URL. Stripped of its `src:`
              prefix, which exists to keep these out of the hostnames' namespace
              in `page_views` and means nothing to a person reading a list.
            */}
            {row.campaign && (
              <span className="rounded bg-card px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                {campaignSlug(row.campaign) ?? row.campaign}
              </span>
            )}

            <span className="ml-auto text-xs text-muted-foreground">
              {new Date(row.createdAt).toLocaleDateString()}
              {' · '}
              {/* Three states rather than two: a grant with no end is live and
                  has no date to run to, and printing "ended" for it - which is
                  what a null date fell through to - would be the log flatly
                  contradicting the account's own plan. */}
              {!row.live
                ? 'ended'
                : row.grantedUntil === null
                  ? 'forever'
                  : `runs to ${new Date(row.grantedUntil).toLocaleDateString()}`}
              {row.grantedSpaces !== null &&
                ` · ${row.grantedSpaces} space${row.grantedSpaces === 1 ? '' : 's'}`}
            </span>
          </li>
        ))}
      </ul>

      <Pager view={view} />
    </section>
  )
}
