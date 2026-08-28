import { cookies } from 'next/headers'
import { assignArm, experimentById, variantKey } from '@/domain/analytics/experiment'
import { PIN_COOKIE, pinnedArm } from '@/domain/analytics/pin'

/**
 * Which art direction this render wears, and what to record it as.
 *
 * Its own file rather than a second export from `marketing-shell` because it is
 * the only piece of the marketing surface that touches `next/headers`, and that
 * import makes a module server-only - which the shell, full of components other
 * things render, must not be.
 *
 * ---------------------------------------------------------------------------
 * Three sources, in order of who gets to insist
 * ---------------------------------------------------------------------------
 *   1. `?look=` in the URL. Anybody may set it; it is how the two arms are
 *      opened side by side in two tabs.
 *   2. The staff pin cookie, set only from the backoffice. See `domain/analytics/pin`.
 *   3. A fair draw, which is what every ordinary visitor gets.
 *
 * The URL wins over the pin so that a pinned admin can still follow a link
 * somebody sent them and see what that link shows. The pin wins over the draw
 * because a pin exists precisely to stop the draw happening.
 *
 * `variant` is null when the experiment has been retired from the registry but
 * a page still asks for it - in which case the page renders its default look
 * and nothing is recorded, which is the correct behaviour for a test that is
 * over.
 */

/** The experiment these three pages are under. */
export const LOOK_EXPERIMENT = 'look'

export type Look = 'bento' | 'dusk'

export interface ResolvedLook {
  look: Look
  /** `look:bento` / `look:dusk`, for `data-variant` and the beacon. */
  variant: string | null
}

export async function resolveLook(override: string | undefined): Promise<ResolvedLook> {
  const experiment = experimentById(LOOK_EXPERIMENT)
  // No experiment means no test: render the shipped look and record nothing.
  if (!experiment) return { look: 'bento', variant: null }

  const jar = await cookies()
  const pinned = pinnedArm(jar.get(PIN_COOKIE)?.value ?? null, LOOK_EXPERIMENT)

  const arm = assignArm(experiment, override ?? pinned)
  return {
    look: arm === 'dusk' ? 'dusk' : 'bento',
    variant: variantKey(LOOK_EXPERIMENT, arm),
  }
}
