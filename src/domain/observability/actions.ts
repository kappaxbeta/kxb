'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { recordBackofficeAction } from '@/domain/backoffice/audit'
import { recordError } from '@/domain/observability/record'
import { requireBackofficeSection } from '@/lib/backoffice'
import { createClient } from '@/lib/supabase/server'

/**
 * What the browser is allowed to tell us about a crash.
 *
 * Everything here arrives from a page that is already broken, which means it
 * arrives from somewhere with no working invariants - so it is parsed rather
 * than trusted, and the lengths are capped before anything reaches the table.
 * `digest` is the interesting field: it is the one value that also appears in
 * the container logs, so a client report and the server error that caused it
 * land in the same group without either side knowing about the other.
 */
const browserErrorSchema = z.object({
  message: z.string().min(1).max(2_000),
  digest: z.string().max(200).nullish(),
  stack: z.string().max(8_000).nullish(),
  path: z.string().max(500).nullish(),
  source: z.enum(['client', 'not-found']),
})

export type BrowserErrorInput = z.input<typeof browserErrorSchema>

/**
 * The error boundary and the 404 page, reporting themselves.
 *
 * Returns nothing and refuses nothing. A visitor who has just been shown a
 * broken page has no use for a second failure about the failure, and the caller
 * has nothing it could usefully do with a rejection.
 */
export async function reportBrowserError(input: BrowserErrorInput): Promise<void> {
  const parsed = browserErrorSchema.safeParse(input)
  if (!parsed.success) return

  await recordError({
    ...parsed.data,
    userId: await currentUserId(),
    userAgent: (await headers()).get('user-agent'),
  })
}

/**
 * Who is reporting, when that is knowable.
 *
 * Swallows its own failure: the thing being reported is quite often auth
 * itself, and losing the whole report because the session lookup went the same
 * way as the page would defeat the point.
 */
async function currentUserId(): Promise<string | null> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    return user?.id ?? null
  } catch {
    return null
  }
}

export type TriageResult = { ok: true } | { ok: false; error: string }

/**
 * Mark a whole group dealt with, or put it back.
 *
 * By fingerprint rather than by row, because the fingerprint is what the page
 * shows: resolving "this crash" and leaving four hundred of its occurrences
 * open would make the counts lie the moment anybody used the button.
 */
export async function resolveErrorGroup(fingerprint: string): Promise<TriageResult> {
  return setGroupStatus(fingerprint, 'resolved')
}

export async function reopenErrorGroup(fingerprint: string): Promise<TriageResult> {
  return setGroupStatus(fingerprint, 'open')
}

async function setGroupStatus(
  fingerprint: string,
  status: 'open' | 'resolved',
): Promise<TriageResult> {
  const { user, admin } = await requireBackofficeSection('errors', 'write')

  const { error } = await admin
    .from('error_reports')
    .update({
      status,
      resolved_at: status === 'resolved' ? new Date().toISOString() : null,
      resolved_by: status === 'resolved' ? user.id : null,
    })
    .eq('fingerprint', fingerprint)

  if (error) return { ok: false, error: error.message }

  await recordBackofficeAction({
    actor: user,
    section: 'errors',
    action: status === 'resolved' ? 'group.resolve' : 'group.reopen',
    summary: `${status === 'resolved' ? 'Resolved' : 'Reopened'} error group ${fingerprint}`,
    detail: { fingerprint, status },
  })

  revalidatePath('/ovaloffice/errors')
  return { ok: true }
}
