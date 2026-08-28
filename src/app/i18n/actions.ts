'use server'

import { revalidatePath } from 'next/cache'
import { isLocale } from '@/domain/i18n/locale'
import { writeProfileLocale } from '@/domain/profile/locale-queries'
import { writeLocale } from '@/app/i18n/preference'
import { createClient } from '@/lib/supabase/server'

/**
 * Switch the app's language.
 *
 * A Server Action because a cookie may only be written from one, and because
 * the switch has to be felt immediately: everything the server rendered - page
 * titles, metadata, copy that never reaches the client - was chosen from the
 * cookie this call replaces, so the tree has to be produced again.
 *
 * `revalidatePath('/', 'layout')` rather than the current route: the language
 * is not a property of the page it was changed on. A member who switches in
 * settings and then walks into the lounge must not find the lounge still in the
 * language they just left, and a route cached before the switch would give them
 * exactly that.
 *
 * An unknown value is ignored rather than rejected. This is a preference, the
 * caller is a `<select>`, and the only way to get here with something else is a
 * hand-written request - which is welcome to keep the language it had.
 *
 * ---------------------------------------------------------------------------
 * Two places, in this order
 * ---------------------------------------------------------------------------
 * The cookie first, because it is the one this reader is about to be handed:
 * everything below is about the *next* browser they open the app in. Then the
 * account, so the answer follows them onto a phone that has never been told -
 * see `profile_locales`.
 *
 * The account write is allowed to fail quietly. Losing it costs one click in
 * settings on the other device; making the switch itself fail because a
 * preference row would not save costs somebody the language they just asked
 * for, in a UI they are now reading in the wrong one. There is nothing to
 * report either way - the page is about to re-render in the new language, which
 * is the whole receipt.
 *
 * Nothing happens here for a guest or a signed-out reader, and nothing needs
 * to: `getUser` answers null, and the cookie above is already the whole of
 * their preference.
 */
export async function chooseLocale(value: string): Promise<void> {
  if (!isLocale(value)) return

  await writeLocale(value)

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user && !user.is_anonymous) await writeProfileLocale(supabase, user.id, value)
  } catch {
    // See above: the cookie is the part that had to land.
  }

  revalidatePath('/', 'layout')
}
