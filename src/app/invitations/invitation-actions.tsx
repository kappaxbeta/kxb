'use client'

import { useState, useTransition } from 'react'
import { acceptInvitation, declineInvitation } from '@/domain/tenants/actions'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * Accept redirects into the workspace on success; decline stays here and lets
 * revalidation drop the row.
 */
export function InvitationActions({ slug }: { slug: string }) {
  const refusal = useRefusal()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (!result.ok) setError(refusal(result.error ?? 'Something went wrong'))
    })
  }

  return (
    <div className="flex items-center gap-2">
      {error && (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={isPending}
        onClick={() => run(() => acceptInvitation(slug))}
        className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
      >
        Accept
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => run(() => declineInvitation(slug))}
        className="rounded-lg border border-line px-3 py-1.5 text-sm transition hover:bg-surface disabled:opacity-50"
      >
        Decline
      </button>
    </div>
  )
}
