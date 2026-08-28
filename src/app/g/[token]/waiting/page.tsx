import { WaitingView } from '@/app/g/[token]/waiting/waiting-view'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * Where a knock waits.
 *
 * Reached only by `enterAsGuest` redirecting here, and it renders the same shell
 * as the door one step back so that pressing the button reads as moving through
 * a doorway rather than landing on a different site.
 *
 * The only thing this page knows is the space's name, read from the token
 * rather than from the visitor's session - exactly what the door itself already
 * showed them, and nothing more. Everything about whether they are in is asked
 * for by the client, one question at a time; see `knockStatus`.
 */
export default async function WaitingPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  // Service role, because the visitor holds no session for this space - which
  // is the entire state this page exists to represent.
  const admin = createAdminClient()

  const { data: link } = await admin
    .from('guest_links')
    .select('tenant_id')
    .eq('token', token)
    .maybeSingle()

  const { data: tenant } = link
    ? await admin
        .from('tenants_read_model')
        .select('name')
        .eq('id', link.tenant_id)
        .maybeSingle()
    : { data: null }

  return (
    <div className="consent-clear min-h-dvh flex items-center justify-center bg-surface p-6">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-line bg-surface-raised/40 p-8 shadow-xl">
        {/* A dead token still renders the waiting screen rather than a 404: the
            client's first poll finds no row and shows the honest ending a
            moment later, which is one screen instead of two ways of saying the
            same thing. */}
        <WaitingView spaceName={tenant?.name ?? 'the space'} />
      </div>
    </div>
  )
}
