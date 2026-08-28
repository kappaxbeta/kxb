import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import Logo from '@/app/components/logo'
import { ShootingStars } from '@/app/components/shooting-stars'
import { type EventDoorView, getEventDoor } from '@/domain/events/door'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Client } from '@/es/store'

/**
 * The event's own front page, for people who are not signed in.
 *
 * `/t/[slug]` is behind `requireTenant`, and rightly: everything under it is
 * the inside of somebody's space. But an event is a thing that gets *sent* -
 * posted in a Discord, printed on a badge, put in a talk's last slide - and
 * until now the only public artefact an organiser had was a raw `/g/<token>`,
 * which unfurls as one line and shows the visitor nothing about the event they
 * are being invited to.
 *
 * So this is the outside of the door: the banner the host composed, whatever
 * they wrote in the header, when it runs, and one button that walks in. It
 * lives at `/e/` rather than at `/t/` because the two are different pages with
 * different rules and only one of them is public - and because a layout cannot
 * conditionally not apply. `requireTenant` sends signed-out visitors here.
 *
 * ---------------------------------------------------------------------------
 * Only event spaces, and why that is the whole rule
 * ---------------------------------------------------------------------------
 * `getEventDoor` returns null for a space that is not running an event, and
 * this page sends that visitor to `/login` - which is precisely where a
 * signed-out request to `/t/<slug>` has always ended up. An ordinary workspace
 * stays exactly as invisible as it is today: "no such space" and "a space you
 * are not standing outside of" produce the same login form, so the address bar
 * answers no questions.
 *
 * The proxy sends every signed-out `/t/<slug>` here rather than to `/login`
 * directly, deliberately without checking which kind of space it is - see the
 * note there. That is why this branch is a redirect and not a 404: it is the
 * other half of that hop, and a member who bookmarked their workspace and got
 * signed out has to land on a form they can use.
 *
 * An event space is different in kind. It was bought to be advertised, its
 * name is already on the guest link's unfurl, and the host is the one who
 * decides whether there is a banner and a button here at all.
 */

export const dynamic = 'force-dynamic'

/**
 * The unfurl, which is most of what this page is for.
 *
 * `noindex` is not decoration. When the host has attached a guest link, this
 * page carries a live token in an href - that is the feature - and a crawler
 * filing it away turns "a link I sent to my attendees" into "a link anybody
 * can find by searching". The unfurl still works, because unfurlers fetch the
 * page rather than consult an index.
 *
 * The description is the host's own blurb where there is one. Theirs is about
 * this event; ours can only be about events in general.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const door = await getEventDoor(createAdminClient() as unknown as Client, slug)

  if (!door) return { robots: { index: false, follow: false } }

  const title = door.headline ?? `${door.name} — you're invited`
  const description =
    door.blurb ?? 'A room you walk into from a link. No account, no install, nothing to download.'

  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      type: 'website',
      // The banner is the picture, when there is one. It is already a 16:9
      // frame with the headline burned into it, which is exactly the shape an
      // unfurl wants and the reason composing one is worth an afternoon.
      images: door.banner ? [`/api/event-banners/${door.banner.id}`] : undefined,
    },
    twitter: {
      card: door.banner ? 'summary_large_image' : 'summary',
      title,
      description,
    },
  }
}

export default async function EventDoorPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  // Service role, because the visitor has no session and nothing on
  // `event_spaces` is readable without one. What crosses the boundary is the
  // shape of `EventDoorView` and nothing else - see the note at the top of
  // `@/domain/events/door`.
  const door = await getEventDoor(createAdminClient() as unknown as Client, slug)

  if (!door) redirect('/login')

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <ShootingStars />

      <div className="relative mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-8 px-5 py-10 sm:py-16">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" aria-label="kxb.team">
            <Logo />
          </Link>
          {/*
            The way back in for somebody who already belongs here. A member
            landing on this page arrived from a link meant for strangers, and
            the door has nothing for them - their room is one click away and
            this is the only place that says so.
          */}
          <Link
            href={`/login?next=/t/${door.slug}`}
            className="rounded-full border border-line px-3.5 py-1.5 text-xs text-ink-muted transition hover:border-accent/60 hover:text-ink"
          >
            I have an account
          </Link>
        </header>

        <main className="flex flex-1 flex-col gap-8">
          {door.banner && (
            /*
              The banner, and the whole banner is the button.

              The composer paints a call-to-action pill into the picture - see
              `HeroCta`, which is explicit that it is drawn rather than
              clickable - and a picture of a button above a real button is the
              kind of double that makes a page read as a template. Wrapping the
              frame means the painted pill does what it looks like it does, and
              the real control underneath stays for anybody navigating by
              keyboard or reading the page aloud.

              Not a `next/image`: the source is a dynamic route whose bytes
              change when the host re-saves, and the optimiser would cache a
              transform of them under a URL that has not changed. `width` and
              `height` come off the document so the space is reserved before
              the picture lands.
            */
            <BannerFrame door={door} />
          )}

          <section className="space-y-4">
            <Phase door={door} />

            {door.headline && (
              <h1 className="text-balance text-2xl font-semibold leading-tight text-ink sm:text-3xl">
                {door.headline}
              </h1>
            )}

            {door.blurb && (
              <p className="max-w-2xl whitespace-pre-line text-sm leading-relaxed text-ink-muted sm:text-base">
                {door.blurb}
              </p>
            )}

            <Cta door={door} />

            {door.links.length > 0 && (
              <ul className="flex flex-wrap gap-2 pt-1">
                {door.links.map((link) => (
                  <li key={`${link.name}-${link.url}`}>
                    {/* Plain anchors: every one of these goes somewhere that is
                        not this app, and `noopener` because a tab opened from a
                        public page is opened by a stranger's URL. */}
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-xs text-ink-muted transition hover:border-accent/60 hover:text-ink"
                    >
                      {link.name}
                      <span aria-hidden className="opacity-50">
                        ↗
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>

        <footer className="text-xs text-ink-muted">
          {door.name} runs on{' '}
          <Link href="/" className="underline underline-offset-2 hover:text-ink">
            kxb.team
          </Link>
          . A room you send as a link.
        </footer>
      </div>
    </div>
  )
}

/** The banner, linked when there is somewhere live to go. */
function BannerFrame({ door }: { door: EventDoorView }) {
  const banner = door.banner
  if (!banner) return null

  const picture = (
    // eslint-disable-next-line @next/next/no-img-element -- see BannerFrame's note
    <img
      src={`/api/event-banners/${banner.id}`}
      width={banner.width}
      height={banner.height}
      // The headline is already burned into the picture, so a description of
      // the picture would be that sentence twice for somebody hearing it read.
      // The alt is what the picture *is* to a person who cannot see it.
      alt={door.headline ? `${door.name}: ${door.headline}` : door.name}
      className="w-full rounded-3xl border border-line/60 shadow-2xl"
    />
  )

  if (!door.cta?.live) return picture

  return (
    <Link
      href={door.cta.href}
      aria-label={`${door.cta.label} — ${door.name}`}
      className="block rounded-3xl outline-none transition focus-visible:ring-2 focus-visible:ring-accent"
    >
      {picture}
    </Link>
  )
}

/**
 * When it runs, in a sentence.
 *
 * The same three phases the in-room banner uses and the same colours, because
 * somebody who sees this page and then walks in should not have to learn a
 * second vocabulary. The wording is different: this reader is outside, so the
 * question is "can I come in", not "how long have I got".
 */
function Phase({ door }: { door: EventDoorView }) {
  const when = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    })

  const tone = {
    upcoming: {
      dot: 'bg-sky-400',
      text: 'text-sky-100',
      line: `Doors open ${when(door.opensAt)}`,
    },
    running: {
      dot: 'bg-emerald-400 animate-pulse',
      text: 'text-emerald-100',
      line: `Open now — until ${when(door.closesAt)}`,
    },
    ended: {
      dot: 'bg-ink-muted',
      text: 'text-ink-muted',
      line: `Ended ${when(door.closesAt)}`,
    },
  }[door.phase]

  return (
    <p className={`flex items-center gap-2 text-xs uppercase tracking-[0.14em] ${tone.text}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden />
      {tone.line}
    </p>
  )
}

/**
 * The button, or the sentence that explains why there is not one.
 *
 * Four states, and they are four different things a visitor needs told:
 *
 *   * A live link during a running event - the only case with a button.
 *   * A live link before the doors open. The button is deliberately still
 *     there: `/g/[token]` refuses politely and explains, and a page that hid
 *     it would leave somebody who arrived early with nothing to do but leave.
 *   * An ended event. Nothing to walk into, and saying so is kinder than a
 *     button that fails.
 *   * No link, or a spent one. The host either has not put one up or has taken
 *     it down, and both mean the same thing to the reader: this is not the way
 *     in, ask whoever sent you.
 */
function Cta({ door }: { door: EventDoorView }) {
  if (door.phase === 'ended') {
    return (
      <p className="text-sm text-ink-muted">
        This event is over. Everything built in it is still standing — new
        visitors just cannot be let in any more.
      </p>
    )
  }

  if (!door.cta?.live) {
    return (
      <p className="text-sm text-ink-muted">
        There is no open door on this page right now. If you were sent a link,
        use that one.
      </p>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-3 pt-1">
      <Link
        href={door.cta.href}
        className="rounded-full bg-accent px-6 py-3 text-sm font-medium text-surface shadow-lg transition hover:brightness-110"
      >
        {door.cta.label}
      </Link>
      <span className="text-xs text-ink-muted">
        {door.cta.knock
          ? 'Pick a name — somebody inside lets you in.'
          : 'No account, no install. Pick a name and you are in.'}
      </span>
    </div>
  )
}
