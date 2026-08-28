import { notFound } from 'next/navigation'
import { RendersList } from '@/app/ovaloffice/renders/renders-list'
import { resolveFeatures } from '@/domain/flags/queries'
import { listRenderJobs, renderQueueDepth } from '@/domain/renders/queries'
import { env } from '@/lib/env'
import { requireBackofficeSection } from '@/lib/backoffice'

export const metadata = { title: 'Renders' }

/**
 * The render queue.
 *
 * An operations view of something that drains, so it is the top of the list and
 * not a paged history - see `listRenderJobs`. What it is actually for is
 * answering two questions at a glance: is anything stuck, and does the picture
 * look right. Hence the thumbnails: a job that says `done` and shows an empty
 * frame is a failure the status column cannot describe.
 *
 * Behind the `renders` flag. The nav hides the link when it is off, and this
 * refuses independently - a hidden link is not an access control, and this page
 * is reachable by typing it.
 */
export default async function RendersPage() {
  const { supabase } = await requireBackofficeSection('renders')

  const features = await resolveFeatures(supabase)
  if (!features.renders) notFound()

  const [jobs, depth] = await Promise.all([
    listRenderJobs(supabase),
    renderQueueDepth(supabase),
  ])

  const supabaseUrl = env.supabaseUrl()

  return (
    <section>
      <header className="mb-4">
        <h2 className="text-lg font-medium">Renders</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Scenes drawn by the worker rather than by a browser somebody is
          sitting in front of. A job is registered before anything is drawn, so
          everything ever asked for is here — including what failed.
        </p>
      </header>

      <dl className="mb-6 grid grid-cols-3 gap-3 sm:max-w-md">
        {(
          [
            ['Waiting', depth.pending],
            ['Drawing', depth.running],
            ['Failed', depth.failed],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-border px-4 py-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 font-mono text-xl">{value}</dd>
          </div>
        ))}
      </dl>

      {jobs.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Nothing has been asked for yet.
        </p>
      ) : (
        <RendersList jobs={jobs} supabaseUrl={supabaseUrl} />
      )}
    </section>
  )
}
