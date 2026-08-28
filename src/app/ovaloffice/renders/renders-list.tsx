'use client'

import { Pager, TableToolbar, useTableView } from '@/app/ovaloffice/_table/table-view'
import { MAX_ATTEMPTS, type RenderJob, renderUrl } from '@/domain/renders/jobs'

export function RendersList({
  jobs,
  supabaseUrl,
}: {
  jobs: RenderJob[]
  supabaseUrl: string
}) {
  // Haystack: source label, status, id, and "platform" for the tenant-less jobs.
  const view = useTableView(
    jobs,
    (job) =>
      `${job.source} ${job.status} ${job.id}${job.tenantId === null ? ' platform' : ''}`,
  )

  return (
    <div>
      <TableToolbar view={view} placeholder="Search renders…" unit="jobs" />

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {view.pageRows.map((job) => (
          <li
            key={job.id}
            className="overflow-hidden rounded-2xl border border-border"
          >
            <span className="flex aspect-video w-full items-center justify-center bg-secondary/60">
              {job.storagePath ? (
                /* eslint-disable-next-line @next/next/no-img-element --
                   the whole point of this page is to show the bytes that were
                   actually uploaded. next/image would re-encode them, which
                   would hide exactly the defect somebody is here to spot. */
                <img
                  src={renderUrl(supabaseUrl, job.storagePath)}
                  alt={`Render ${job.id}`}
                  width={job.width}
                  height={job.height}
                  className="h-full w-full object-contain"
                />
              ) : (
                <span className="text-xs text-muted-foreground">
                  {job.status === 'failed' ? 'no picture' : 'waiting'}
                </span>
              )}
            </span>

            <div className="flex items-baseline gap-2 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm">{job.source}</span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {job.width}×{job.height}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 pb-2.5 text-xs text-muted-foreground">
              <span
                className={
                  job.status === 'failed'
                    ? 'text-destructive'
                    : job.status === 'done'
                      ? 'text-accent'
                      : undefined
                }
              >
                {job.status}
              </span>
              {/* Only once it means something. "1 of 3" on every row is noise;
                  a second attempt is the thing worth noticing, because it
                  means a worker died rather than that a job was refused. */}
              {job.attempts > 1 && (
                <span>
                  attempt {job.attempts} of {MAX_ATTEMPTS}
                </span>
              )}
              {job.tenantId === null && <span>platform</span>}
            </div>

            {job.error && (
              <p className="border-t border-border px-3 py-2 text-xs leading-relaxed text-destructive">
                {job.error}
              </p>
            )}
          </li>
        ))}
      </ul>

      <Pager view={view} />
    </div>
  )
}
