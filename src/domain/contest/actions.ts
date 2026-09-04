'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { normaliseCode } from '@/domain/promo/application'
import { recordBackofficeAction } from '@/domain/backoffice/audit'
import { readContestSettings } from '@/domain/contest/settings'
import { asPaidTier, DEFAULT_TIER } from '@/domain/billing/tiers'
import { requireBackofficeSection } from '@/lib/backoffice'

/**
 * Running the prize draw from the backoffice.
 *
 * Two writes, and they are deliberately separate: the contest's own facts, and
 * the promo code that makes entering free. They live in two tables because they
 * are two things - one is what the document says, the other is a capability
 * somebody can spend - and an operator has to be able to fix either without
 * touching the other. What ties them together is `readContestHealth`, which
 * says on the same screen whether the promise and the code still agree.
 */

export type ContestResult = { ok: false; error: string } | { ok: true }

const settingsSchema = z.object({
  live: z.boolean(),
  code: z.string().trim().min(3).max(40),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates read YYYY-MM-DD'),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates read YYYY-MM-DD'),
  drawsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates read YYYY-MM-DD'),
  /**
   * The amounts, best first, as they were typed: "50, 25, 25".
   *
   * A string rather than three number fields, because the *number* of prizes is
   * part of what an operator is deciding and a fixed set of boxes would decide
   * it for them. Parsed below, and refused rather than silently trimmed if it
   * cannot be read - a prize list is not a field to be lenient about.
   */
  prizes: z.string().trim().min(1),
  hashtag: z.string().trim().regex(/^[A-Za-z0-9_]{2,40}$/, 'A hashtag is letters, digits and underscores'),
  handle: z.string().trim().regex(/^[A-Za-z0-9_]{2,40}$/, 'A handle is letters, digits and underscores'),
  minAge: z.coerce.number().int().min(16).max(99),
})

/** Save the contest as it now stands, and rebuild the six pages that quote it. */
export async function saveContestSettings(input: {
  live: boolean
  code: string
  startsOn: string
  endsOn: string
  drawsOn: string
  prizes: string
  hashtag: string
  handle: string
  minAge: number
}): Promise<ContestResult> {
  const parsed = settingsSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'That could not be saved' }
  }

  const code = normaliseCode(parsed.data.code)
  if (!code) {
    return { ok: false, error: 'A code is 3–40 characters: letters, digits and hyphens.' }
  }

  /*
    The amounts, from whatever separator somebody reached for. Commas, spaces
    and the euro sign are all things a person types into a box labelled
    "prizes"; a parse that rejected "€50, €25" would be technically right and
    would be worked around by typing it again more carefully.
  */
  const prizes = parsed.data.prizes
    .split(/[,\s]+/)
    .map((piece) => piece.replace(/[^\d]/g, ''))
    .filter(Boolean)
    .map(Number)

  if (prizes.length === 0 || prizes.length > 10 || prizes.some((n) => n < 1 || n > 100_000)) {
    return { ok: false, error: 'Prizes are one to ten amounts in euro, best first — e.g. 50, 25, 25.' }
  }

  // Checked here as well as by the column's constraint, so the answer is a
  // sentence rather than a constraint name. The database is what makes it true.
  if (!(parsed.data.startsOn <= parsed.data.endsOn && parsed.data.endsOn <= parsed.data.drawsOn)) {
    return {
      ok: false,
      error: 'Entries have to open before they close, and the draw comes after both.',
    }
  }

  const { user, admin } = await requireBackofficeSection('gewinnspiel', 'write')

  const { error } = await admin
    .from('contest_settings')
    .update({
      live: parsed.data.live,
      code,
      starts_on: parsed.data.startsOn,
      ends_on: parsed.data.endsOn,
      draws_on: parsed.data.drawsOn,
      prizes,
      hashtag: parsed.data.hashtag,
      handle: parsed.data.handle,
      min_age: parsed.data.minAge,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq('id', true)

  if (error) return { ok: false, error: `Could not save that: ${error.message}` }

  await recordBackofficeAction({
    actor: user,
    section: 'gewinnspiel',
    action: 'contest.save',
    summary: parsed.data.live
      ? `Contest live, entries close ${parsed.data.endsOn}`
      : 'Contest switched off',
    detail: { ...parsed.data, code, prizes },
  })

  /*
    Everything under the root layout, rather than a list of paths.

    Two sets of pages quote this row: the six conditions pages, and
    the chrome on every marketing page - the landing footer and
    `MarketingShell`'s both name the draw while it is running. A list would be
    a dozen routes long, would go stale the next time somebody adds a marketing
    page, and would fail silently: a page still advertising a draw that closed.

    It would also be a list of *app* paths, which this file may not name - the
    domain does not import the app, and `/gewinnspiel/<lang>` lives over there.
    `'layout'` on the root is the blunt instrument, it needs no such list, and
    it is the right tool for a switch thrown twice a year.

    The conditions pages render per request and so need none of this; they are
    left in the blast radius rather than carved out of it, because a revalidate
    of something already fresh costs nothing and the carve-out would be one
    more thing to remember if they ever go back to being cached.
  */
  revalidatePath('/', 'layout')
  revalidatePath('/ovaloffice/gewinnspiel')
  return { ok: true }
}

const offerSchema = z.object({
  tier: z.string(),
  freeDays: z.coerce.number().int().min(1).max(365),
  bucks: z.coerce.number().int().min(0).max(50),
  vouchers: z.coerce.number().int().min(0).max(50),
  coins: z.coerce.number().int().min(0).max(100_000),
  /** How long the code itself keeps working. 0 means until it is revoked. */
  days: z.coerce.number().int().min(0).max(3650),
})

/**
 * Make the contest's code exist, or bring it into line with the offer.
 *
 * One button rather than two, because "create it" and "it exists but grants the
 * wrong thing" are the same job from the operator's side: what should be true
 * is on the form, and this makes it true. An upsert on the code, which is the
 * unique column.
 *
 * Deliberately *not* part of saving the settings above. Changing what a live
 * code hands over is a decision about money, and it should take its own click
 * rather than riding along with a corrected hashtag.
 *
 * ---------------------------------------------------------------------------
 * What it will not do
 * ---------------------------------------------------------------------------
 * It never touches `uses`, and it never un-revokes. A code somebody pulled was
 * pulled on purpose, and the way back is the promos page, where revoking
 * happens and where the whole history is.
 */
export async function mintContestCode(input: {
  tier: string
  freeDays: number
  bucks: number
  vouchers: number
  coins: number
  days: number
}): Promise<ContestResult> {
  const parsed = offerSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'That could not be saved' }
  }

  const tier = asPaidTier(parsed.data.tier) ?? DEFAULT_TIER
  const { user, admin } = await requireBackofficeSection('gewinnspiel', 'write')

  const settings = await readContestSettings()

  const expires = parsed.data.days
    ? new Date(Date.now() + parsed.data.days * 86_400_000).toISOString()
    : null

  const { data: existing } = await admin
    .from('promo_codes')
    .select('id')
    .eq('code', settings.code)
    .maybeSingle()

  const fields = {
    label: `Gewinnspiel — entries are free while this works`,
    campaign: 'gewinnspiel',
    tier,
    free_days: parsed.data.freeDays,
    bucks: parsed.data.bucks,
    vouchers: parsed.data.vouchers,
    coins: parsed.data.coins,
    expires_at: expires,
    // Uncapped. § 5 promises anybody may enter for nothing, and a headcount on
    // the code is a headcount on the contest.
    max_uses: null,
  }

  const { error } = existing
    ? await admin.from('promo_codes').update(fields).eq('id', existing.id)
    : await admin
        .from('promo_codes')
        .insert({ ...fields, code: settings.code, created_by: user.id })

  if (error) return { ok: false, error: `Could not set the code up: ${error.message}` }

  await recordBackofficeAction({
    actor: user,
    section: 'gewinnspiel',
    action: existing ? 'contest.code.update' : 'contest.code.create',
    summary: `${existing ? 'Updated' : 'Created'} the contest code ${settings.code}`,
    detail: { code: settings.code, ...fields },
  })

  revalidatePath('/ovaloffice/gewinnspiel')
  revalidatePath('/ovaloffice/promos')
  return { ok: true }
}
