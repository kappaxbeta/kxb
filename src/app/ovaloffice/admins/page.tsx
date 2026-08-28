import { PeopleRoles } from '@/app/ovaloffice/admins/people-roles'
import { listBackofficePeople } from '@/domain/backoffice/queries'
import { requireBackofficeSection } from '@/lib/backoffice'

export const dynamic = 'force-dynamic'

export default async function AdminsPage() {
  // Superadmin-only: `admins` is a superadmin-only section, so this gate lets
  // nobody but a superadmin in - the finer roles cannot reach the page that
  // hands them out.
  const { user, supabase } = await requireBackofficeSection('admins')
  const people = await listBackofficePeople(supabase)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">People &amp; roles</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Who can reach the backoffice, and how much of it. A superadmin sees
          everything and manages this list; everyone else gets the sections you
          grant them, to view or to write.
        </p>
      </div>

      <PeopleRoles people={people} currentEmail={user.email ?? ''} />
    </div>
  )
}
