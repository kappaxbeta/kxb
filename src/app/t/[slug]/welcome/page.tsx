import type { Metadata } from 'next'
import { PeepWindow } from '@/app/t/[slug]/welcome/peep-window'
import { readProfileAvatar } from '@/domain/profile/avatar-queries'
import { requireTenant } from '@/lib/tenant'
import { workspaceDict } from '@/app/i18n/workspace'
import { readLocale } from '@/app/i18n/preference'

/** The tab. `generateMetadata`, because a static export cannot be two languages. */
export async function generateMetadata(): Promise<Metadata> {
  return { title: workspaceDict(await readLocale()).titles.welcome }
}

export const dynamic = 'force-dynamic'

/**
 * Where accepting an invitation lands.
 *
 * Joining a space used to drop people straight onto the task list, which is a
 * correct destination and a wasted moment: the one thing everybody already in
 * that space will see of you is an animal you have never been asked about, and
 * by the time you notice you are a penguin like the other four penguins, you
 * are somewhere else in the app and not thinking about it.
 *
 * So the join gets a door. One question, answered in a click, and the button
 * out is the destination this route replaced.
 *
 * Inside /t/[slug] rather than a top-level route, because the workspace is the
 * whole point of the moment - the layout has already proved membership, and the
 * name in the heading is the one they were invited to. The avatar itself is not
 * scoped to it: it is the same peep in every space, which the copy says out
 * loud so nobody picks a fox here expecting to be a penguin elsewhere.
 */
export default async function TenantWelcomePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const { tenant, supabase, user } = await requireTenant(slug)

  const avatar = await readProfileAvatar(supabase, user.id)

  return <PeepWindow slug={slug} tenantName={tenant.name} initialAvatar={avatar} />
}
