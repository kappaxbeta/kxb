/**
 * Pinning yourself to one arm of an experiment.
 *
 * ---------------------------------------------------------------------------
 * A staff cookie, and only a staff cookie
 * ---------------------------------------------------------------------------
 * The site's banner promises essential cookies only, and an experiment bucket
 * is not essential - which is why ordinary visitors are assigned an arm per
 * visit with no cookie at all (see `assignArm`). That is not being quietly
 * reversed here.
 *
 * What this is instead: a cookie that is *only ever set from the backoffice*,
 * by a signed-in admin clicking "preview this arm". A visitor who has not been
 * through `/ovaloffice` never receives it, never sends it, and is unaffected by
 * its existence. It exists because reviewing two art directions by reloading
 * until chance obliges is not reviewing them.
 *
 * If it should ever hold a bucket for the public instead, that is a change to
 * the banner and the privacy page before it is a change to this file. The
 * lawful basis for an analytics cookie is consent, and consent means the banner
 * has to offer it and the default has to be off.
 *
 * ---------------------------------------------------------------------------
 * Why it is not httpOnly
 * ---------------------------------------------------------------------------
 * Deliberately readable by script, because it holds no secret: it is the name
 * of an arm that is already visible in the DOM of the page it selected. Making
 * it httpOnly would imply it protects something, and it protects nothing - the
 * worst a forged value can do is show its owner the other layout.
 *
 * It carries no authority of any kind. Nothing reads it to decide access, and
 * `parseVariant` refuses any value that is not an arm we issued, so the useful
 * range of tampering is "see the arm you could already see via `?look=`".
 */

import { parseVariant } from './experiment'

export const PIN_COOKIE = 'kxb_arm'

/** A week. Long enough to review over a couple of sittings, short enough to lapse. */
export const PIN_MAX_AGE_SECONDS = 7 * 24 * 60 * 60

/**
 * The arm a pin cookie names, or null.
 *
 * Validated rather than trusted even though only staff are meant to hold one:
 * it arrives on a request like anything else, and a value we never issued is
 * not a new arm. Same rule the beacon applies to the arm it reports.
 */
export function pinnedArm(
  cookieValue: string | null | undefined,
  experimentId: string,
): string | null {
  const parsed = parseVariant(cookieValue)
  if (!parsed || parsed.experimentId !== experimentId) return null
  return parsed.armId
}
