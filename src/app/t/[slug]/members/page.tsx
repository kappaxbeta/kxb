import type { Metadata } from 'next'
import { MembersPanel } from '@/app/t/[slug]/members/members-panel'
import { listInvitations, listMembers } from '@/domain/tenants/queries'
import { hasRole, requireTenant } from '@/lib/tenant'
import { workspaceDict } from '@/app/i18n/workspace'
import { readLocale } from '@/app/i18n/preference'

/** The tab. `generateMetadata`, because a static export cannot be two languages. */
export async function generateMetadata(): Promise<Metadata> {
  return { title: workspaceDict(await readLocale()).titles.people }
}

export const dynamic = 'force-dynamic'

export default async function MembersPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const context = await requireTenant(slug)
  const { supabase, tenant, user } = context

  const [members, invitations] = await Promise.all([
    listMembers(supabase, tenant.id),
    listInvitations(supabase, tenant.id),
  ])

  return (
    <MembersPanel
      slug={slug}
      currentUserId={user.id}
      currentRole={tenant.role}
      archived={tenant.archived}
      members={members}
      invitations={invitations}
      // Mirrors the rules in the tenant decider so the UI can hide what would
      // be refused. The decider is still the one that enforces them - this only
      // decides what to render.
      canInvite={hasRole(context, ['owner', 'admin']) && !tenant.archived}
      canManageRoles={hasRole(context, ['owner'])}
    />
  )
}
