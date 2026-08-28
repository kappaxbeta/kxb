import 'server-only'
import { isLocale, type Locale } from '@/domain/i18n/locale'
import type { Client } from '@/es/store'

/**
 * The language this account has chosen, or null for somebody who never has.
 *
 * Null is the answer for a new account, for a guest, and for anybody signed
 * out - and it means *no opinion* rather than English. Keeping "unset" distinct
 * from "chose English" is what lets a browser's `Accept-Language` still be
 * heard: an account that has never answered should get the language its
 * browser is asking for, not the one this table would default to.
 *
 * A locale this build does not speak degrades to null for the same reason a
 * retired avatar degrades to the default - the row keeps what was chosen, but a
 * dictionary we no longer ship must not be handed to a renderer. The `check`
 * constraint on the column makes that unreachable today; this is the second
 * lock, and it is the one that survives a migration adding a third language and
 * a rollback taking it away again.
 */
export async function readProfileLocale(
  supabase: Client,
  userId: string | null | undefined,
): Promise<Locale | null> {
  if (!userId) return null

  const { data, error } = await supabase
    .from('profile_locales')
    .select('locale')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load locale: ${error.message}`)
  }

  const locale = data?.locale
  return locale && isLocale(locale) ? locale : null
}

/**
 * Remember the language on the account as well as in the browser.
 *
 * Called from `chooseLocale` beside the cookie write, and deliberately *after*
 * it: the cookie is what this request's own reader is about to be handed, and a
 * failure here should not cost them the switch they just asked for. See the
 * note on the caller.
 *
 * An upsert rather than an insert-or-update pair, because there is exactly one
 * row per account and the question "have you answered before" is not one the
 * caller should have to ask.
 */
export async function writeProfileLocale(
  supabase: Client,
  userId: string,
  locale: Locale,
): Promise<void> {
  const { error } = await supabase
    .from('profile_locales')
    .upsert(
      { user_id: userId, locale, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )

  if (error) {
    throw new Error(`Failed to save locale: ${error.message}`)
  }
}
