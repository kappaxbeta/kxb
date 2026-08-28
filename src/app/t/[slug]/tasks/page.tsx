import type { Metadata } from 'next'
import { TaskList } from '@/app/t/[slug]/tasks/task-list'
import { tasksProjection } from '@/domain/tasks/projection'
import { listRecentEvents, listTasks } from '@/domain/tasks/queries'
import { listMembers } from '@/domain/tenants/queries'
import { runProjection } from '@/es/projection'
import { requireFeature, requireTenant } from '@/lib/tenant'
import { workspaceDict } from '@/app/i18n/workspace'
import { readLocale } from '@/app/i18n/preference'

// Always render fresh: the read model changes on every command, and in a shared
// workspace it can change because of somebody else.
/** The tab. `generateMetadata`, because a static export cannot be two languages. */
export async function generateMetadata(): Promise<Metadata> {
  return { title: workspaceDict(await readLocale()).titles.tasks }
}

export const dynamic = 'force-dynamic'

export default async function TasksPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const context = await requireTenant(slug, {
    guests: 'event',
    surface: 'tasks',
  })
  // Both gates, and the flag is the outer one: an event may still list `tasks`
  // among the surfaces it opened, and a host cannot open a surface this
  // installation has withdrawn.
  requireFeature(context, 'tasks')
  const { supabase, tenant } = context

  // Catch up on first load too, not just after a command. This is what makes a
  // brand new workspace (or a projection you just reset) show correct data
  // without needing a write first - and in a shared workspace it is also how
  // one member's writes reach another member's screen.
  await runProjection(supabase, tasksProjection, tenant.id)

  const [tasks, events, members] = await Promise.all([
    listTasks(supabase, tenant.id),
    listRecentEvents(supabase, tenant.id),
    listMembers(supabase, tenant.id),
  ])

  // The log stores actor ids; people recognise each other by handle.
  const nameByUserId = Object.fromEntries(
    members.map((member) => [member.userId, member.username]),
  )

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <TaskList
        slug={slug}
        tasks={tasks}
        archived={tenant.archived}
        nameByUserId={nameByUserId}
      />
    </div>
  )
}
