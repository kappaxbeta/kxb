import 'server-only'
import { requireBackofficeAdmin } from '@/lib/backoffice'

/**
 * Who may open the XP creator.
 *
 * An operator tool, so the answer in production is "a backoffice admin, and
 * nobody else" - the same gate `/ovaloffice` uses, which `notFound()`s rather
 * than redirecting, so an unauthorised visitor cannot even confirm the route
 * exists.
 *
 * ---------------------------------------------------------------------------
 * Why development is open
 * ---------------------------------------------------------------------------
 * Not laziness, and not a convenience for whoever is signed in. The creator is
 * a 3D editor, and the only honest way to check a 3D editor is to look at it:
 * a scale that is out by a factor of four, a model pivoted through the floor, a
 * picker tile that draws the wrong thing. None of those fail a test, and all of
 * them are obvious in a browser.
 *
 * Behind the backoffice gate that check costs a signed-in admin session, which
 * means the local Supabase stack up, a user seeded and a login flow completed
 * before you can look at a wall. So on a developer's own machine the page is
 * open, and in every deployed environment it is not.
 *
 * The condition is `NODE_ENV`, which Next sets itself and which no request can
 * influence - not an env var somebody could set on the server by accident, and
 * not a header. `next build` produces `production` whatever the machine, so a
 * preview deploy, a staging box and kxb.team are all gated, and the only thing
 * that is open is `next dev`.
 */
export async function requireXpAccess(): Promise<void> {
  if (process.env.NODE_ENV === 'development') return
  await requireBackofficeAdmin()
}
