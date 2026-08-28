import * as React from 'react'
import { requireBackofficeUser } from '@/lib/backoffice'
import { env } from '@/lib/env'
import { readBackofficeAccess } from '@/domain/backoffice/queries'
import { countPendingApplications } from '@/domain/access/queries'
import { countOpenContactMessages } from '@/domain/contact/queries'
import { countOpenErrorGroups } from '@/domain/observability/queries'
import { resolveFeatures } from '@/domain/flags/queries'
import { perfEnabledAnywhere } from '@/domain/perf/queries'

import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/ovaloffice/app-sidebar'
import { Separator } from '@/components/ui/separator'

export default async function OvalofficeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, admin, supabase } = await requireBackofficeUser()

  const access = await readBackofficeAccess(supabase, user.email)

  const [openContact, waitingApplications, openErrors, features, perf] =
    await Promise.all([
      countOpenContactMessages(admin),
      countPendingApplications(admin),
      countOpenErrorGroups(admin),
      // No tenant: the backoffice belongs to the platform, so only the global
      // default and this admin's own override take part.
      resolveFeatures(supabase),
      /**
       * Asked separately, and not through `resolveFeatures`, for the reason
       * argued at `perfEnabledAnywhere`: measurement is routinely turned on for
       * one space with the global switch left off, and the platform-level
       * resolution above cannot see that - so the tab would hide itself from the
       * operator who had just enabled it.
       */
      perfEnabledAnywhere(admin),
    ])

  const counts = {
    openContact,
    waitingApplications,
    openErrors,
  }

  return (
    <div className="dark bg-background text-foreground min-h-screen">
      <SidebarProvider>
        <AppSidebar
          counts={counts}
          userEmail={user.email}
          features={{ renders: features.renders, perf }}
          access={access}
          // Direct database access is a superadmin's tool; a scoped operator
          // never sees the link. The URL is derived, not a section page.
          studioUrl={access.superadmin ? env.studioUrl() : undefined}
        />
        <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-medium">Backoffice Redux</h1>
          </div>
        </header>
        <main className="flex-1 p-6 bg-muted/20">
          {children}
        </main>
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}
