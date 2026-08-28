import { AuditLog } from '@/app/ovaloffice/audit/audit-log'
import { listAuditEntries } from '@/domain/backoffice/audit'
import { requireBackofficeSection } from '@/lib/backoffice'

export const dynamic = 'force-dynamic'

export default async function AuditPage() {
  // Superadmin, or anybody granted the `audit` section — the same rule the RLS
  // on the table enforces.
  const { supabase } = await requireBackofficeSection('audit')
  const entries = await listAuditEntries(supabase)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Audit log</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          What has been done from the backoffice — who, in which section, and
          against what. Append-only; nobody edits a line of it.
        </p>
      </div>

      <AuditLog entries={entries} />
    </div>
  )
}
