'use client'

import type { AuditEntry } from '@/domain/backoffice/audit'
import { sectionLabel } from '@/domain/backoffice/sections'
import { Pager, TableToolbar, useTableView } from '@/app/ovaloffice/_table/table-view'

/**
 * The backoffice audit log, read.
 *
 * One line per consequential action, newest first, searchable and paged like
 * every other backoffice list. The summary is the sentence somebody wrote when
 * they built the action; the section and actor are what you filter by when you
 * are answering "who touched this and when".
 */
export function AuditLog({ entries }: { entries: AuditEntry[] }) {
  // Actor, section and the written summary are what a search is for; the action
  // key is included so `grant.revoke` finds the revocations.
  const view = useTableView(entries, (entry) =>
    `${entry.actorEmail} ${sectionLabel(entry.section)} ${entry.section} ${entry.action} ${entry.summary}`,
  )

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing has been logged yet.</p>
  }

  return (
    <div>
      <TableToolbar view={view} placeholder="Search by person, section or action…" unit="entries" />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-left text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-2 pr-4 font-medium">When</th>
              <th className="py-2 pr-4 font-medium">Who</th>
              <th className="py-2 pr-4 font-medium">Section</th>
              <th className="py-2 pr-4 font-medium">What</th>
            </tr>
          </thead>
          <tbody>
            {view.pageRows.map((entry) => (
              <tr key={entry.id} className="border-t border-border align-top">
                <td className="whitespace-nowrap py-2 pr-4 font-mono text-[11px] text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleString()}
                </td>
                <td className="py-2 pr-4">{entry.actorEmail}</td>
                <td className="py-2 pr-4 text-muted-foreground">{sectionLabel(entry.section)}</td>
                <td className="py-2 pr-4">
                  <span className="text-foreground">{entry.summary}</span>
                  <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                    {entry.action}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pager view={view} />
    </div>
  )
}
