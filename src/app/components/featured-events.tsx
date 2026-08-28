import Link from 'next/link'
import { fill, type LandingDict } from '@/app/i18n/landing'
import type { Locale } from '@/app/i18n/locales'
import type { EventDoorView } from '@/domain/events/door'

/**
 * What is actually happening here this week, on the front page.
 *
 * The rest of the landing page argues that a room is worth an afternoon. This
 * band is the only part of it that can say "and there is one on Saturday" - a
 * real event, with a real banner its host composed, and a button that puts a
 * stranger inside it without an account. That is the page's own claim, made by
 * example rather than in a sentence.
 *
 * Rendered from the backoffice's `featured` flag rather than from anything the
 * host controls - see 20260909000000_event_banners.sql on why a self-serve
 * checkbox here would be a billboard we were renting by accident.
 *
 * Draws nothing when there is nothing featured, which is most weeks. That is
 * the important property: the front page must not have a permanent empty shelf
 * on it labelled "upcoming events", because a shelf that is usually empty is
 * worse than no shelf. This band exists only while there is something on it.
 */
export function FeaturedEvents({
  doors,
  dict,
  locale,
}: {
  doors: EventDoorView[]
  dict: LandingDict
  locale: Locale
}) {
  if (doors.length === 0) return null

  return (
    <section className="col-span-6 mt-4" aria-label={dict.featured.sectionLabel}>
      <p className="box-tag justify-center" style={{ '--box-hue': 145 } as React.CSSProperties}>
        {dict.featured.tag}
      </p>

      <ul
        className={`mx-auto mt-6 grid max-w-5xl gap-4 ${
          // One is the common case and gets the full width, because a lone card
          // at a third of the page reads as the leftovers of a row.
          doors.length === 1 ? 'grid-cols-1' : 'sm:grid-cols-2'
        }`}
      >
        {doors.map((door) => (
          <li key={door.slug}>
            <FeaturedCard door={door} dict={dict} locale={locale} />
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * One event, as its own banner.
 *
 * The card is deliberately almost nothing: a frame, the picture, and one line
 * under it. The banner already carries the headline, the sky and the button -
 * the host spent an afternoon on it - and a card that re-stated all of that in
 * our type would be arguing with the thing it is showing.
 *
 * The whole card goes to `/e/<slug>` rather than straight to the guest link.
 * That is a decision worth stating: the door page is where the terms are - when
 * it runs, what the host wrote, whether the link is still live - and sending
 * somebody from a front page they are browsing directly into a name-and-animal
 * form is a step faster than they asked for. The door is one more click and it
 * is the click where they find out what they are joining.
 */
function FeaturedCard({
  door,
  dict,
  locale,
}: {
  door: EventDoorView
  dict: LandingDict
  locale: Locale
}) {
  const opens = new Date(door.opensAt)
  // The page's locale rather than the visitor's, so the date reads in the same
  // language as the sentence around it. `undefined` here would format a German
  // page's date in whatever the server's default happens to be.
  const when =
    door.phase === 'running'
      ? dict.featured.openNow
      : fill(dict.featured.opens, {
          date: opens.toLocaleDateString(locale, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          }),
        })

  return (
    <Link
      href={`/e/${door.slug}`}
      className="group block overflow-hidden rounded-3xl border border-line/60 bg-surface-raised/30 transition hover:border-accent/60"
    >
      {door.banner && (
        // Not `next/image`: the bytes behind this URL change when the host
        // re-saves the banner, and the optimiser would serve a cached transform
        // of the old ones under a URL that has not changed. `width`/`height`
        // come off the document, so the row does not reflow when it loads.
        // eslint-disable-next-line @next/next/no-img-element -- see above
        <img
          src={`/api/event-banners/${door.banner.id}`}
          width={door.banner.width}
          height={door.banner.height}
          alt={door.headline ? `${door.name}: ${door.headline}` : door.name}
          className="w-full transition duration-500 group-hover:scale-[1.02]"
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
        <span className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-ink-muted">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              door.phase === 'running' ? 'animate-pulse bg-emerald-400' : 'bg-sky-400'
            }`}
            aria-hidden
          />
          {when}
        </span>
        {/* The host's own button copy, not ours - it is the one word they chose
            for this. Rendered as a label inside the card's link rather than as
            a second anchor, because a link inside a link is neither. */}
        <span className="text-sm text-ink-muted transition group-hover:text-ink">
          {door.cta?.live ? door.cta.label : dict.featured.seeEvent} →
        </span>
      </div>
    </Link>
  )
}
