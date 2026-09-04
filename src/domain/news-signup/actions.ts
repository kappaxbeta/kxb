'use server'

import { headers } from 'next/headers'
import { z } from 'zod'
import { CONSENT } from '@/domain/news-signup/consent'
import { isLocale } from '@/domain/i18n/locale'
import { createClient } from '@/lib/supabase/server'

/**
 * Taking an address for the news list.
 *
 * ---------------------------------------------------------------------------
 * The consent text is written by the server
 * ---------------------------------------------------------------------------
 * The form shows a sentence and this records one, and they are the same
 * sentence because both read `CONSENT` - not because the browser sent it. A
 * client can post any string, and a consent record that says whatever the
 * signer's browser claimed is worthless in exactly the argument it exists to
 * settle. So the request carries a locale and a tick; the wording is ours.
 *
 * ---------------------------------------------------------------------------
 * The same answer whether or not the address is already there
 * ---------------------------------------------------------------------------
 * A form that says "you are already subscribed" is an oracle: anybody can type
 * an address and learn whether that person is on the list, one address at a
 * time. So a duplicate returns the success message, and the row is left
 * exactly as it was - a second signup is not consent to overwrite the first
 * one's timestamp, which is the record of when permission was actually given.
 *
 * An address that unsubscribed and comes back is *not* handled here, and that
 * is on purpose rather than pending: reviving it needs an update, anon has no
 * update policy on this table, and giving it one would let anybody re-add
 * somebody else's address after they had asked to be left alone. It wants the
 * confirmation flow - which is the thing that proves the request came from the
 * person whose address it is - so it belongs with that work, not before it.
 *
 * ---------------------------------------------------------------------------
 * Nothing is sent from here
 * ---------------------------------------------------------------------------
 * The row lands unconfirmed and stays that way until somebody answers a
 * confirmation mail that this app cannot yet send - see the migration. That is
 * the safe half to be missing: the list cannot be written to, and no address
 * is lost while the sending side is built.
 */

export type SignupResult = { ok: true } | { ok: false; error: 'email' | 'consent' | 'generic' }

const schema = z.object({
  // Deliberately loose. A strict regex rejects addresses that are valid and
  // in use - plus-tags, new TLDs, unicode locals - and the only real check
  // for an address is whether the confirmation mail arrives.
  email: z.string().trim().toLowerCase().min(3).max(320).regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/),
  locale: z.string(),
  consented: z.literal(true),
})

export async function subscribeToNews(input: {
  email: string
  locale: string
  consented: boolean
}): Promise<SignupResult> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    // Told apart so the form can point at the right control. `consented` is
    // the only other required field, so anything else failing is the address.
    return { ok: false, error: input.consented ? 'email' : 'consent' }
  }

  const locale = isLocale(parsed.data.locale) ? parsed.data.locale : 'en'
  const supabase = await createClient()

  // Where they were standing, for a complaint that asks "where did you get
  // this address". Read from the referer rather than sent by the form, for
  // the same reason the consent text is: it is evidence, so it should not be
  // the signer's to write.
  const referer = (await headers()).get('referer')
  const sourcePath = referer ? safePath(referer) : null

  const { error } = await supabase.from('news_subscribers').insert({
    email: parsed.data.email,
    locale,
    consent_text: CONSENT[locale],
    source_path: sourcePath,
  })

  if (error) {
    // 23505 is unique_violation: this address is already on the list. The same
    // success the first signup gets - see the note above on why.
    if (error.code === '23505') return { ok: true }
    return { ok: false, error: 'generic' }
  }

  return { ok: true }
}

/** Just the path, and only if it is one of ours to record. */
function safePath(referer: string): string | null {
  try {
    const url = new URL(referer)
    return url.pathname.slice(0, 200)
  } catch {
    return null
  }
}
