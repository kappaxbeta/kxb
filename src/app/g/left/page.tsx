import Link from 'next/link'
import { CrashScreen, CRASH_ALT, CRASH_CTA } from '@/app/components/crash-screen'
import { isRegistrationOpen } from '@/domain/flags/queries'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * The way out.
 *
 * A visit ends in one of three ways - the twelve hours run out, somebody
 * revokes the link, or an admin shows them the door - and until this page
 * existed all three ended the same way: the next click 404'd, because
 * `requireTenant` had stopped recognising them and a 404 is what it gives
 * anybody it does not recognise. Correct, and a terrible goodbye. Somebody who
 * spent an afternoon in a room with people they know was told the door goes
 * nowhere.
 *
 * ---------------------------------------------------------------------------
 * Why one sentence for three endings
 * ---------------------------------------------------------------------------
 * The same choice `WaitingView` makes, for the same reason and with the same
 * discomfort. Naming which of the three happened would mean telling somebody
 * who is now a stranger something about the people still inside - that one of
 * them removed you, and by implication which one. All three have the same next
 * step, so they get the same sentence.
 *
 * It is also the only honest option: the admission row is *deleted* by both the
 * kick and the reaper, so by the time anybody lands here there is nothing left
 * to tell them apart with.
 *
 * ---------------------------------------------------------------------------
 * Reaching it is what ends the session
 * ---------------------------------------------------------------------------
 * Not a detail of the proxy - it is the reason this page can have buttons at
 * all. A Server Component cannot write a cookie, so for as long as arriving
 * here left the anonymous session intact, every door off this page led back to
 * it: `/` sends an anonymous session with no admission straight to `/g/left`,
 * and `/signup` sends anybody signed in to `/`. A browser that saw this page
 * once could not reach the product again, landing page included, until its site
 * data was cleared.
 *
 * The proxy closes the session on the way in - see `closeEndedVisit` - so by
 * the time this renders the reader is a signed-out stranger and both buttons
 * below go where they say. That is also what makes the sentence true: it says
 * the visit is over, and now it is.
 *
 * ---------------------------------------------------------------------------
 * And then the ask
 * ---------------------------------------------------------------------------
 * This is the one moment in the whole product where somebody has used the thing
 * and has no account, so it is the only place worth asking. Which ask depends
 * on whether the front door is open: a "get your own space" button that leads
 * to a closed sign-up is worse than not asking.
 */
export default async function GuestLeftPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>
}) {
  const { from } = await searchParams

  /**
   * The space's name, looked up from the slug rather than taken as text.
   *
   * `?from=` arrives on a URL and so is written by whoever is holding it. Read
   * as a name it would put an attacker's sentence inside our own layout, on our
   * own domain, above a button - which is a phishing page we hosted. Read as a
   * slug it is a database lookup that either matches a real space or does not,
   * and an unknown one simply loses the name.
   */
  const admin = createAdminClient()
  const { data: tenant } = from
    ? await admin.from('tenants_read_model').select('name').eq('slug', from).maybeSingle()
    : { data: null }

  const name = tenant?.name ?? null

  // Asked as the visitor rather than through the service role: `resolve_features`
  // is granted to `anon` precisely so this question can be asked by somebody
  // with no standing, which is exactly who is reading this page.
  const supabase = await createClient()
  const open = await isRegistrationOpen(supabase)

  return (
    <CrashScreen
      code="BYE"
      tag="Your visit ended"
      title={name ? `You have left ${name}` : 'You have left the space'}
      // The one who waves rather than the one who apologises - this is not a
      // failure, and the 404's penguin would say it was.
      avatar="fox-front"
      hue={195}
      body={
        <>
          <p>
            Your visit is over. That happens when a guest link expires, when it
            is withdrawn, or when somebody in the space closes it.
          </p>
          <p className="mt-3">
            {name
              ? `If you were not expecting that, ask whoever sent you into ${name} for a fresh link.`
              : 'If you were not expecting that, ask whoever sent you the link for a fresh one.'}
          </p>
          <p className="mt-4 text-ink">
            Did you enjoy it? You can have one of these of your own, free.
          </p>
        </>
      }
    >
      {/*
        "Free" rather than "from EUR 5/month", which is what this said until
        there was a free tier.
        
        The old line was true and was the wrong ask *here*. This is the one
        moment in the product where somebody has spent an afternoon using the
        thing and has no account - and answering that with a price is asking
        them to decide about money at the exact moment they were deciding
        whether they liked it. A free space is a smaller thing to say yes to,
        and the plans are one click further on.
      */}
      {open ? (
        <Link href="/signup" className={CRASH_CTA}>
          Try your own space — free
        </Link>
      ) : (
        // Closed sign-ups are the normal state of this product, so this is the
        // usual branch rather than the fallback. `/waitlist` is the same door
        // the landing page's "Request an invite" leads to.
        <Link href="/waitlist" className={CRASH_CTA}>
          Request an invite
        </Link>
      )}

      <Link href="/" className={CRASH_ALT}>
        Back to the start
      </Link>
    </CrashScreen>
  )
}
