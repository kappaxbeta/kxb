'use server'

import { cookies } from 'next/headers'
import { experimentById, variantKey } from '@/domain/analytics/experiment'
import { PIN_COOKIE, PIN_MAX_AGE_SECONDS } from '@/domain/analytics/pin'
import { recordBackofficeAction } from '@/domain/backoffice/audit'
import { requireBackofficeSection } from '@/lib/backoffice'

/**
 * "Show me this arm."
 *
 * The only thing in the codebase that sets the pin cookie, and it is behind
 * `requireBackofficeSection` - which is the whole basis on which the cookie is
 * defensible against a banner that promises essential cookies only. A visitor
 * who has never been through the backoffice cannot reach this action and
 * therefore never receives one. See the note in `domain/analytics/pin`.
 *
 * The admin check is not decoration: without it this is a public endpoint that
 * sets a cookie on anybody who posts to it, which is precisely the thing the
 * banner says does not happen.
 */
export async function pinArm(experimentId: string, armId: string): Promise<void> {
  const { user } = await requireBackofficeSection('experiments', 'write')

  const experiment = experimentById(experimentId)
  if (!experiment) return

  const value = variantKey(experimentId, armId)
  if (!value) return

  const jar = await cookies()
  jar.set(PIN_COOKIE, value, {
    path: '/',
    maxAge: PIN_MAX_AGE_SECONDS,
    sameSite: 'lax',
    // Not httpOnly, on purpose - it holds no secret. See the note on the file.
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
  })

  await recordBackofficeAction({
    actor: user,
    section: 'experiments',
    action: 'arm.pin',
    summary: `Pinned the ${armId} arm of ${experimentId}`,
    detail: { experimentId, armId, value },
  })
}

/** Back to being an ordinary visitor. */
export async function clearPin(): Promise<void> {
  const { user } = await requireBackofficeSection('experiments', 'write')
  const jar = await cookies()
  jar.delete(PIN_COOKIE)

  await recordBackofficeAction({
    actor: user,
    section: 'experiments',
    action: 'arm.unpin',
    summary: `Cleared the pinned experiment arm`,
    detail: {},
  })
}
