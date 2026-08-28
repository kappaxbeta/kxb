'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { ANALYTICS_OPT_OUT_COOKIE, optOutCookie } from '@/domain/analytics/opt-out'

/**
 * The two halves of the switch on /notme.
 *
 * Server Actions rather than a route handler, because this is the only kind of
 * thing that can both write a cookie and re-render the page that shows its
 * state - a Server Component cannot set one, and a GET route that toggled a
 * cookie could be fired by any image tag on any site.
 *
 * `revalidatePath` because the page's whole content is the cookie it just
 * changed, and the answer on screen has to be the new one.
 */

export async function stopCountingMe(): Promise<void> {
  const jar = await cookies()
  const { value, options } = optOutCookie()
  jar.set(ANALYTICS_OPT_OUT_COOKIE, value, options)
  revalidatePath('/notme')
}

export async function countMeAgain(): Promise<void> {
  const jar = await cookies()
  jar.delete(ANALYTICS_OPT_OUT_COOKIE)
  revalidatePath('/notme')
}
