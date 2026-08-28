import { DemoLounge } from '@/app/demo/demo-lounge'
import { demoDict } from '@/app/i18n/demo'
import type { Locale } from '@/app/i18n/locales'
import { campaignSlug, campaignSource } from '@/domain/analytics/campaign'
import { isRegistrationOpen } from '@/domain/flags/queries'
import { createClient } from '@/lib/supabase/server'

/**
 * The demo.
 *
 * Public, unauthenticated, and the only route in the app that renders a world
 * without a workspace behind it. `/v/[slug]` looks similar and is not the same
 * thing at all: that is somebody's real lounge with the controls taken away,
 * so it needs a tenant, a projection run and a public-showcase flag. This has
 * no tenant to need - the world is a pure function evaluated in the browser -
 * which is what lets it be linked from the front page without deciding whose
 * room strangers get to look at.
 *
 * Signed-in visitors are *not* redirected away, unlike the landing page. Someone
 * with an account may well be here to show a colleague what the room is, and
 * bouncing them into their own workspace mid-sentence would be the app arguing
 * with them.
 *
 * The only thing this needs a request for is which door to offer at the end,
 * which is a flag an admin can change without a deploy - so it is read here
 * rather than assumed, exactly as the landing page reads it.
 */
export async function DemoPanel({
  searchParams,
  locale,
}: {
  searchParams: Promise<{ src?: string }>
  locale: Locale
}) {
  const dict = demoDict(locale)
  const supabase = await createClient()
  const open = await isRegistrationOpen(supabase).catch(() => false)

  /**
   * The `?src=` this visitor arrived on, handed to the join button.
   *
   * `/demo?src=tiktok` is counted with its source by the beacon in the root
   * layout, but the click on the join button is counted separately, by the
   * route behind it - and that route only sees its own URL. Without this the
   * report can say a hundred people came from TikTok and forty asked to join,
   * and cannot say whether they were the same forty.
   *
   * Resolved here rather than from `location` in the client, so the button is
   * right in the markup that is sent: read after hydration it would be a state
   * update in an effect, which is a cascading render, and read during one it
   * would be a hydration mismatch. The page already awaits a flag, so it was
   * never static and this costs it nothing.
   *
   * `campaignSource` validates; `campaignSlug` gives back the tag it stored, so
   * what goes on the link is the visitor's own spelling of it rather than a
   * second one that reports as a different channel.
   */
  const slug = campaignSlug(campaignSource((await searchParams).src))
  /**
   * The join route is not translated and does not need to be: it counts the
   * click and redirects. Keeping one path for both languages keeps the number
   * it reports comparable across them.
   */
  const joinHref = slug ? `/demo/join?src=${encodeURIComponent(slug)}` : '/demo/join'

  return (
    <DemoLounge
      joinLabel={open ? dict.joinOpen : dict.joinClosed}
      joinHref={joinHref}
      locale={locale}
    />
  )
}
