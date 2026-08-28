import Image from 'next/image'
import Link from 'next/link'
import { EventRunOfShow } from '@/app/components/event-run-of-show'
import { eventsDict } from '@/app/i18n/events'
import { localePath, type Locale } from '@/app/i18n/locales'
import { contactIdentity } from '@/domain/contact/actions'

/*
 * ---------------------------------------------------------------------------
 * THE RUN OF SHOW - direction contract
 * ---------------------------------------------------------------------------
 * THESIS: the page is the organiser's own cue sheet, and it fills itself in as
 * they answer. It refuses the category default: an explainer band of numbered
 * cards above a stepped form with a progress bar.
 *
 * OWN-WORLD: the committed world - indigo-black ground, fuchsia interactive,
 * cyan cold edge, the pixel face in caps, real product renders. New to it: a
 * ruled cue column, tabular cue numbers, and an owner column reading Yours/Ours.
 *
 * STORY: an organiser sees the whole show on one sheet, understands that only
 * three cues are theirs, fills them while the room assembles beside them, sends.
 *
 * FIRST VIEWPORT: the masthead with the €200 floor as a ruled field, then cue 01
 * open with its three questions, the plate beside it showing an empty plot.
 * ---------------------------------------------------------------------------
 */

/**
 * The booking page, in whichever language it was asked for.
 *
 * Split off from /contact rather than added to it as a subject line, because
 * the two are answered by different work. A support message is read and fixed;
 * this is read and *quoted*, and a quote needs three facts - what, when, how
 * many - that the support form has no business asking a person whose upload is
 * broken. Both still land in `contact_messages`, tagged `business`.
 *
 * The words are in `@/app/i18n/events`. What stays here is the shape: which cue
 * carries which render, and at what size.
 */

/**
 * The five cues that are ours, in the order they happen.
 *
 * This is the page's argument, and it is made by the column on the right rather
 * than by any sentence: three cues say Yours and five say Ours. What used to be
 * a "what that gets you" list of five bullets is these five rows - the same
 * five promises, each put at the point in the day it actually comes true, which
 * is the difference between a feature list and a plan.
 */
const OURS = [
  { id: 'price' as const, scene: null },
  { id: 'build' as const, scene: { name: 'venue-3-fitout', width: 1400, height: 1000 } },
  { id: 'brand' as const, scene: { name: 'venue-4-branded', width: 1400, height: 1000 } },
  { id: 'doors' as const, scene: { name: 'venue-5-doors', width: 1400, height: 1000 } },
  { id: 'after' as const, scene: null },
]

export async function EventsSheet({ locale }: { locale: Locale }) {
  const defaults = await contactIdentity()
  const dict = eventsDict(locale)
  const path = localePath(locale, '/events')

  // German is the original of both legal documents and lives at the bare path;
  // the English pages are courtesy translations at `/…/en`. See legal/shell.
  const imprint = locale === 'de' ? '/impressum' : '/impressum/en'

  return (
    <main lang={locale} className="sheet">
      <Link href={localePath(locale, '/')} className="nav-link text-sm">
        {dict.back}
      </Link>

      {/*
        The masthead, written as a document header rather than as a hero.

        A run of show opens with the facts somebody checks before reading a
        single cue - what this is, what it costs, how much of it is theirs - so
        those are set as ruled fields rather than as prose. The price in
        particular is stated here and as a floor, because quoted work has to
        name a number somewhere or the form becomes a trap that costs an enquiry
        to escape. "From" is the honest shape of it: an afternoon for thirty is
        not a three-track conference.
      */}
      <header className="sheet-head">
        <p className="sheet-doc">{dict.head.doc}</p>
        <h1 className="sheet-title">{dict.head.title}</h1>
        <p className="sheet-standfirst">
          {dict.head.standfirstLead}
          <span className="text-ink">{dict.head.standfirstStrong}</span>
          {dict.head.standfirstTail}
        </p>

        <dl className="sheet-fields">
          <div>
            <dt>{dict.head.fees.fee}</dt>
            <dd>
              {dict.head.feeValue}
              <span className="sheet-field-note">{dict.head.feeNote}</span>
            </dd>
          </div>
          <div>
            <dt>{dict.head.fees.cues}</dt>
            <dd>
              {dict.head.cuesValue}
              <span className="sheet-field-note">{dict.head.cuesNote}</span>
            </dd>
          </div>
          <div>
            <dt>{dict.head.fees.attendees}</dt>
            <dd>
              {dict.head.attendeesValue}
              <span className="sheet-field-note">{dict.head.attendeesNote}</span>
            </dd>
          </div>
        </dl>

        <p className="sheet-aside">
          {dict.head.asideLead}
          <Link href={`${localePath(locale, '/')}#pricing`}>{dict.head.asideLink}</Link>
          {dict.head.asideTail}
        </p>
      </header>

      {/* Cues 01-03. See the component: one form, three fieldsets taking turns.
          `path` carries the locale, which is also how the server action knows
          which language to answer a rejection in - see localeFromPath. */}
      <EventRunOfShow defaults={defaults} path={path} locale={locale} />

      {/*
        The seam, said out loud once.

        The sheet is one column of eight cues and the only thing that changes
        halfway down it is who is holding the next one. That is the entire offer,
        so it gets a rule and a line of type rather than being left for the
        owner column to imply.
      */}
      <p className="sheet-seam">
        <span>{dict.seam.yours}</span>
        <span>{dict.seam.ours}</span>
      </p>

      <ol className="cuelist cuelist-ours" start={4}>
        {OURS.map((cue, i) => {
          const copy = dict.ours[cue.id]
          return (
            <li key={cue.id} className="cue" data-owner="us">
              <p className="cue-head">
                <span className="cue-no">{String(i + 4).padStart(2, '0')}</span>
                <span className="cue-label">{copy.label}</span>
                <span className="cue-owner">{dict.owner.ours}</span>
                <span className="cue-at">{copy.at}</span>
              </p>
              <div className="cue-body">
                <div className="cue-body-inner">
                  <p className="cue-copy">{copy.body}</p>
                  {cue.scene && (
                    <Image
                      src={`/xo/scenes/${cue.scene.name}.webp`}
                      alt={copy.alt ?? ''}
                      width={cue.scene.width}
                      height={cue.scene.height}
                      className="cue-shot"
                      sizes="(max-width: 767px) 90vw, 22vw"
                    />
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ol>

      {/*
        The way out, for somebody who came here by mistake.

        This page is reached from three buttons on the front page, and one of
        those readers is going to have a broken login rather than a hackathon.
        Sending them to the support form is cheaper than having them write a bug
        report into a booking enquiry.
      */}
      <p className="sheet-foot">
        {dict.foot.lead}
        <Link href={localePath(locale, '/contact')}>{dict.foot.contactLink}</Link>
        {dict.foot.middle}
        <Link href={imprint}>{dict.foot.imprintLink}</Link>
        {dict.foot.tail}
      </p>
    </main>
  )
}
