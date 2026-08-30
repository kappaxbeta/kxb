import { Diamond, Gamepad2, Lock, MousePointerClick } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { SVGProps } from 'react'
import { BlockDrift } from '@/app/components/block-drift'
import { FeaturedEvents } from '@/app/components/featured-events'
import { LoungePanel, PalettePanel } from '@/app/components/holo-panels'
import { IntroVideo } from '@/app/components/intro-video'
import Logo from '@/app/components/logo'
import { type MarkName, Mark } from '@/app/components/marketing-icons'
import { PeepStage } from '@/app/components/peep-stage'
import { ShootingStars } from '@/app/components/shooting-stars'
import { World } from '@/app/components/world'
import {
  type ChipId,
  type DoorId,
  fill,
  type LandingDict,
  type CueId,
  type PlanId,
  type RowId,
  type ScreenId,
} from '@/app/i18n/landing'
import {
  DEFAULT_LOCALE,
  landingHref,
  LOCALES,
  type Locale,
  switchHref,
} from '@/app/i18n/locales'
import { type Tier, tierLimit, tierPrice } from '@/domain/billing/tiers'
import { landingTiers, type TierRow } from '@/domain/billing/tier-table'
import { type EventDoorView, listFeaturedDoors } from '@/domain/events/door'
import { globalSeatLimit, isRegistrationOpen } from '@/domain/flags/queries'
import { landingPath } from '@/domain/tenants/last-space'
import type { Client } from '@/es/store'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient, getUser } from '@/lib/supabase/server'

/**
 * The landing page, in whichever language it was asked for.
 *
 * The words live in `@/app/i18n/landing`; what is left in this file is the
 * shape of the page - hues, spans, which animal leans on which card, which
 * render goes with which row. That split is the point: a translator never
 * touches a coordinate, and a card cannot lose its picture by being translated.
 *
 * Both `/` and `/de` render this. Signed-in people never see either: they go
 * back to the space they were last in, or to the picker when there is no answer
 * to that question yet.
 *
 * ---------------------------------------------------------------------------
 * The running order
 * ---------------------------------------------------------------------------
 * Hero, three doors, four rows, the world, the plan, the price, how to get in,
 * questions. The hero is untouched - it is the one part of the old page that
 * was never the problem - and everything under it was reordered around a single
 * complaint: the page sold before it showed. It used to put "Plan an event" in
 * the hero and "Who it is for" directly beneath, which is objection-handling
 * before anybody has objected.
 *
 * The nine feature cards and six use-case rows that used to fill the middle are
 * now /play, /create and /share. What is left here is four rows - the least
 * that still shows a real room - and three doors pointing at the pages that go
 * deeper. A landing page is not the manual; it is the reason to open one.
 */

/** The one handle, held once because both accounts answer to the same name. */
const SOCIAL_HANDLE = '@kxbteam'

/**
 * The two marks, drawn here rather than imported.
 *
 * lucide dropped its brand icons in v1 - there is no `Instagram` to import any
 * more, and `Twitter` was the bird, which is the wrong company now. lucide's
 * `X` is the close-window cross, and a plain ✕ beside a camera glyph reads as
 * "dismiss", not as a link to a profile.
 *
 * So: the camera in the same hand as `marketing-icons.tsx` - one weight,
 * `currentColor`, no fill - and the X logo as the solid glyph it actually is,
 * because that mark has no line-drawn form that still looks like itself. Both
 * on a 24-unit grid so `size-4` sizes them together.
 */
function InstagramMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="2.75" y="2.75" width="18.5" height="18.5" rx="5" />
      <circle cx="12" cy="12" r="3.75" />
      <path d="M17.4 6.6h.01" />
    </svg>
  )
}

function XMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

/**
 * Where the two accounts are, in the order they get looked at.
 *
 * `wordmark` says the glyph already spells the name, which is only true of X:
 * printing the label beside it gives you "𝕏 X", the same letter twice. So the
 * name still exists for `aria-label` and the tooltip, and the footer prints it
 * only where the icon is a picture rather than a word.
 */
const SOCIALS = [
  { name: 'Instagram', href: 'https://instagram.com/kxbteam', icon: InstagramMark },
  { name: 'X', href: 'https://x.com/kxbteam', icon: XMark, wordmark: true },
] as const

/** What the landing page needs to know about who may join, and how many. */
export interface AccessTerms {
  registrationOpen: boolean
  /** null means no cap. */
  seatLimit: number | null
  /**
   * Events the backoffice has put on the page, usually none.
   *
   * Part of the terms rather than a separate prop because it is the same kind
   * of thing as the two above: something read from the database that changes
   * what the page says, and that the page has to be honest about rather than
   * assume.
   */
  featured: EventDoorView[]
  /**
   * The tiers to draw, cheapest first, as the table has them.
   *
   * Rows rather than the constants, so a price or a limit changes without a
   * deploy and `shown_on_landing` decides what appears here. `readTierTable`
   * falls back to the compiled numbers when the query fails, so an outage
   * quotes the last reviewed terms rather than emptying the pricing section.
   */
  tiers: TierRow[]
}

/**
 * The three reads both language routes make, and the signed-in bounce.
 *
 * Shared so the two pages cannot drift into asking different questions - a `/de`
 * that forgot to check the registration flag would offer a sign-up door on an
 * installation that is invitation-only, which is exactly the failure the flags
 * exist to prevent.
 */
export async function landingTerms(): Promise<AccessTerms> {
  const supabase = await createClient()
  const user = await getUser()
  if (user) redirect(await landingPath(supabase, user))

  const [registrationOpen, seatLimit, featured, tiers] = await Promise.all([
    isRegistrationOpen(supabase),
    globalSeatLimit(supabase),
    listFeaturedDoors(createAdminClient() as unknown as Client),
    /*
     * Which cards to draw, and what each one holds.
     *
     * From the table, so a price or a limit changes without a deploy - and so
     * `shown_on_landing` means something, which is how a tier can be sellable
     * to anybody holding the link and still stay out of the shop window.
     *
     * `readTierTable` falls back to the compiled constants when the query
     * fails, so this page keeps quoting the last numbers anybody reviewed
     * rather than rendering an empty pricing section.
     */
    landingTiers(supabase),
  ])

  return { registrationOpen, seatLimit, featured, tiers }
}

/**
 * One peep leaning into the corner of a card.
 *
 * The renders live in `public/xo/shots/<avatar>-<angle>.webp` and were shot off
 * the same GLBs the lounge loads, so a card cannot advertise an animal the
 * product does not have. Decorative, hence the empty alt: the card's heading
 * already says what the card is, and "a render of a fox" adds nothing to a
 * screen reader but noise.
 */
function BoxPeep({ avatar, angle }: { avatar: string; angle: string }) {
  return (
    <Image
      src={`/xo/shots/${avatar}-${angle}.webp`}
      alt=""
      width={512}
      height={512}
      className="box-peep"
    />
  )
}

/**
 * One monthly tier, priced.
 *
 * A component rather than two copies of the markup because the two cards differ
 * in exactly four things - the words, the price, the hue and the animal - and
 * the fifth thing they must never differ in is the shape of the price. A
 * visitor comparing €5 against €10 is doing it by eye, in one glance, and two
 * hand-written cards drift in the ways that break that glance: a bigger
 * typeface on one, a "/ month" missing from the other.
 */
function TierCard({
  tier,
  copy,
  per,
  hue,
  index,
  avatar,
  href,
  cta,
  extraLine,
  soonLabel,
}: {
  tier: Tier
  copy: { tag: string; note: string; lines: readonly string[]; soon?: readonly string[] }
  per: string
  hue: number
  index: number
  avatar: string
  href: string
  cta: string
  extraLine?: string
  /** Word for the not-yet-built group. Absent when the card has no such group. */
  soonLabel?: string
}) {
  const lines = extraLine ? [extraLine, ...copy.lines] : copy.lines
  const soon = copy.soon ?? []

  return (
    <section
      className="box rise col-span-2 flex flex-col"
      style={{ '--box-hue': hue, '--i': index } as React.CSSProperties}
    >
      <p className="box-tag">{copy.tag}</p>
      <p className="mt-4 text-5xl font-semibold">
        {tierPrice(tier)}
        {/* No "/ month" beside free. `tierPrice` returns the word rather than
            "EUR 0", and "free / month" invites the reader to wonder what
            happens in month two. */}
        {tier === 'free' ? null : (
          <span className="ml-1.5 text-base font-normal text-ink-muted">{per}</span>
        )}
      </p>
      <p className="mt-1 font-mono text-sm text-accent">{tier}</p>
      <p className="mt-2 text-sm text-ink-muted">{copy.note}</p>
      <ul className="mt-6 space-y-2 text-sm">
        {lines.map((line) => (
          <li key={line} className="flex gap-2">
            <span className="text-accent">→</span>
            <span className="text-ink-muted">{line}</span>
          </li>
        ))}
      </ul>

      {/*
        What is in the plan but not built yet, under its own heading.

        Its own group rather than badges sprinkled through the list above,
        because this is the card a stranger decides on: a mixed list where half
        the rows carry a caveat is a list most people read as though none of
        them did. A ruled-off group with the word over it cannot be skimmed
        into a promise.

        The arrow changes from → to ·, and the colour drops, so the difference
        survives being read at a glance and without the heading.
      */}
      {soon.length > 0 && soonLabel && (
        <div className="mt-4 border-t border-line/60 pt-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted/70">
            {soonLabel}
          </p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {soon.map((line) => (
              <li key={line} className="flex gap-2">
                <span className="text-ink-muted/50">·</span>
                <span className="text-ink-muted/70">{line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Link
        href={href}
        className="mt-7 inline-block self-start rounded-full bg-accent px-6 py-3 font-medium text-white transition"
      >
        {cta}
      </Link>
      <BoxPeep avatar={avatar} angle="three" />
    </section>
  )
}

/**
 * The three doors, and where each one goes.
 *
 * Three pages rather than three anchors, which is the change that let the
 * middle of this page shrink. Everything a curious reader used to have to
 * scroll past - the surfaces, the modes, the rules of a match - is on the far
 * side of one of these, so the page can be short without the product looking
 * small.
 *
 * Their hues and their animals are theirs alone, and none of them appear
 * anywhere else on the page: three cards that borrow a colour from the rows
 * below read as a slice of the rows below.
 *
 * ---------------------------------------------------------------------------
 * `mark` and `inside`
 * ---------------------------------------------------------------------------
 * `mark` is the door's own drawing, and it is the same drawing the page behind it
 * wears in its hero - so the thing somebody clicked and the thing they arrive at
 * agree without a word being repeated.
 *
 * `inside` is a row of the marks of what is actually on that page: the pitch, the
 * arena, the track and the café behind /play; the palette, the pieces and the
 * studio behind /create. It is a signpost rather than a decoration - three cards
 * whose blurbs are three sentences long all look equally deep, and the row is
 * what says one of these is six subjects and another is two.
 *
 * Deliberately unlabelled and `aria-hidden`. Labels here would be seven new
 * strings in two languages for words that already appear on the page they point
 * at, and the blurb above already says what is through the door in a sentence a
 * screen reader can read.
 */
const DOORS: {
  id: DoorId
  href: string
  hue: number
  mark: MarkName
  inside: MarkName[]
  peep: { avatar: string; angle: string }
}[] = [
  {
    id: 'play',
    href: '/play',
    hue: 145,
    mark: 'football',
    inside: ['battles', 'football', 'races', 'tournaments', 'cafe', 'lounge'],
    peep: { avatar: 'penguin', angle: 'front' },
  },
  {
    id: 'create',
    href: '/create',
    hue: 265,
    mark: 'pieces',
    inside: ['palette', 'modes', 'rules', 'script', 'studio'],
    peep: { avatar: 'koala', angle: 'three' },
  },
  {
    id: 'share',
    href: '/share',
    hue: 200,
    mark: 'link',
    inside: ['members', 'rooms', 'link', 'catalogue', 'studio'],
    peep: { avatar: 'parrot', angle: 'front' },
  },
]

function DoorCard({
  slot,
  dict,
  index,
}: {
  slot: (typeof DOORS)[number]
  dict: LandingDict
  index: number
}) {
  const copy = dict.doors[slot.id]
  return (
    <article
      className="box door rise col-span-2 flex flex-col"
      style={{ '--box-hue': slot.hue, '--i': index } as React.CSSProperties}
    >
      <span className="door-mark">
        <Mark name={slot.mark} />
      </span>
      <h2 className="font-pixel mt-4 text-lg uppercase">{copy.name}</h2>
      <p className="mt-3 max-w-[42ch] text-sm leading-relaxed text-ink-muted">{copy.blurb}</p>
      {/* `mt-auto` rather than a fixed margin: the three blurbs are different
          lengths and a row of cards whose links sit at three different heights
          reads as three unrelated cards. */}
      <div className="door-inside mt-auto" aria-hidden>
        {slot.inside.map((mark) => (
          <Mark key={mark} name={mark} />
        ))}
      </div>
      <Link href={slot.href} className="door-cta">
        {copy.cta} →
      </Link>
      <BoxPeep avatar={slot.peep.avatar} angle={slot.peep.angle} />
    </article>
  )
}

/**
 * Four rows, each a real frame of the real product.
 *
 * There were six of these and nine feature cards above them; this is what
 * survived the cut, and the test each one had to pass is whether it shows
 * something happening *between people*. A picture of a room is a picture of a
 * room. A picture of six animals converging on a ball is the pitch.
 *
 * Read top to bottom they are the arc of the whole thing rather than a menu:
 * something to do, the night it turns into, the fact that you built the place
 * it happened in, and the link that got everybody there. The last one is the
 * mechanic the entire product rests on, and it goes last because by then it is
 * the obvious question.
 *
 * Every render is shot off the same models the lounge loads, so the scene in
 * the picture is a scene somebody can be standing in ten minutes later.
 */
const ROWS: {
  id: RowId
  scene: string
  width: number
  height: number
  hue: number
  href: string
  deco: { model: string; x: number; y: number; scale: number; hue: number }[]
}[] = [
  {
    id: 'football',
    scene: 'football-crowd',
    width: 1600,
    height: 1000,
    hue: 145,
    href: '/play',
    deco: [
      { model: 'melon', x: 8, y: 16, scale: 0.42, hue: 140 },
      { model: 'hay_bale', x: 92, y: 78, scale: 0.5, hue: 55 },
      { model: 'stone_with_gold', x: 88, y: 14, scale: 0.32, hue: 85 },
    ],
  },
  {
    /**
     * The one row that is a screenshot rather than a cut-out render, opaque
     * corners and all - which `.usecase-shot` has been rounding off in
     * anticipation of since the day it was written.
     */
    id: 'party',
    scene: 'party-club',
    width: 862,
    height: 564,
    hue: 285,
    href: '/play#lounge',
    deco: [
      { model: 'battery', x: 7, y: 16, scale: 0.44, hue: 285 },
      { model: 'melon', x: 93, y: 74, scale: 0.4, hue: 145 },
      { model: 'water', x: 90, y: 14, scale: 0.3, hue: 200 },
    ],
  },
  {
    id: 'build',
    scene: 'desk-duo',
    width: 1500,
    height: 1000,
    hue: 200,
    href: '/create',
    deco: [
      { model: 'computer', x: 8, y: 16, scale: 0.46, hue: 200 },
      { model: 'battery', x: 92, y: 74, scale: 0.4, hue: 265 },
      { model: 'glass', x: 90, y: 15, scale: 0.32, hue: 320 },
    ],
  },
  {
    id: 'link',
    scene: 'instant-link',
    width: 1500,
    height: 1000,
    hue: 285,
    href: '/share',
    deco: [
      { model: 'gift', x: 8, y: 15, scale: 0.44, hue: 320 },
      { model: 'battery', x: 92, y: 72, scale: 0.4, hue: 285 },
      { model: 'glass', x: 89, y: 16, scale: 0.3, hue: 200 },
    ],
  },
]

/**
 * Screenshots of the software, after the four rows and before the price.
 *
 * The rows above are all room: a pitch, a club, a workbench, three animals on an
 * island. That is the product, but it is not all of what somebody is buying, and
 * the page used to go straight from a picture of a lawn to a card asking for €5
 * a month. A stranger who read every word of it still had no idea what the thing
 * looks like on a Tuesday when nobody is playing.
 *
 * Every one of these is a screenshot rather than a render - the only ones on the
 * page - which is the honest form for a surface made of type and controls.
 * `pictures are shot, not drawn` was never a rule about three.js; it is a rule
 * about advertising something that exists, and a capture of the running app is
 * the strictest version of it.
 *
 * ---------------------------------------------------------------------------
 * Why four, and why in this order
 * ---------------------------------------------------------------------------
 * It was two, and both of them were the space *between* visits: the board and
 * the studio. Which meant the one thing this band existed to answer - what does
 * the app look like while the thing in the four rows above is happening - was
 * the one thing neither picture showed. `lounge` and `level` go first and fix
 * exactly that: the room standing still, then the room with a clock over it and
 * a door beside it.
 *
 * Three of the four are `wide`. That is not a rhythm choice - it is the aspect.
 * All three are 2:1 captures of the whole app, left rail included, and a left
 * rail at half the content column stops being a rail and becomes grey texture.
 * The studio frame is 1.4:1 and reads fine beside its caption, which is what
 * `.screen-beat-split` is for.
 *
 * Placed here because this is the last thing before the plan and the price.
 * Everything above is the reason to want one; this is what one is.
 */
const SCREENS: {
  id: ScreenId
  src: string
  width: number
  height: number
  hue: number
  href: string
  /** The plate's width where it stops being the whole column. */
  sizes: string
  /** A full-width plate with a masthead over it, rather than a plate beside a caption. */
  wide: boolean
  /** How much of the right edge fades, where the capture cut through a control. */
  cutRight?: string
}[] = [
  {
    id: 'lounge',
    src: '/img/lounge-room.webp',
    width: 2200,
    height: 1064,
    hue: 320,
    href: '/play',
    sizes: '(max-width: 1180px) 100vw, 1104px',
    wide: true,
  },
  {
    id: 'level',
    src: '/img/level-lobby.webp',
    width: 2200,
    height: 1062,
    hue: 35,
    href: '/share',
    sizes: '(max-width: 1180px) 100vw, 1104px',
    wide: true,
    // The guest-links rail carries on below the fold of the capture, and the QR
    // overlay sits on top of it - so the right edge is mid-panel.
    cutRight: '3%',
  },
  {
    id: 'space',
    src: '/img/space-board.webp',
    width: 2200,
    height: 1056,
    hue: 285,
    href: '/share',
    sizes: '(max-width: 1180px) 100vw, 1104px',
    wide: true,
  },
  {
    id: 'studio',
    src: '/img/studio-timeline.webp',
    width: 1400,
    height: 1003,
    hue: 320,
    href: '/create#studio',
    sizes: '(max-width: 900px) 100vw, 620px',
    wide: false,
    // The capture caught the right-hand panel mid-button - see `.screen::after`.
    cutRight: '4%',
  },
]

/**
 * The studio's own control bar, rebuilt, under the picture of it.
 *
 * The same four buttons in the same order, drawn with the same lucide icons the
 * editor draws them with - imported rather than redrawn, so the row under the
 * screenshot cannot drift from the row in it. Pressing one says what it does.
 *
 * ---------------------------------------------------------------------------
 * Why radios
 * ---------------------------------------------------------------------------
 * Four radios in a group with the labels styled as the buttons, and the notes
 * shown by `:checked ~`. No client component, no state, and no hydration: it
 * works on the first paint, arrow keys move through it because that is what a
 * radio group does, and all four answers are in the DOM for a crawler whether
 * or not anybody pressed anything. The same argument the FAQ's `<details>` won.
 *
 * The shape is the app's, not this page's - `0.5rem` corners and a hairline on
 * black rather than the pill every other button here wears. That is deliberate
 * and is the whole point of the row: these are the controls in the picture
 * directly above them, and a row of fuchsia pills would read as landing-page
 * chips and lose the only thing they are here to say.
 */
const CUES: { id: CueId; icon: React.ReactNode }[] = [
  { id: 'walk', icon: <MousePointerClick className="size-4" aria-hidden /> },
  { id: 'drive', icon: <Gamepad2 className="size-4" aria-hidden /> },
  { id: 'lock', icon: <Lock className="size-4" aria-hidden /> },
  // Filled and cyan, because in the studio this button makes a camera key and
  // the timeline draws that key as exactly this diamond.
  { id: 'key', icon: <Diamond className="size-4 fill-accent-2/70 text-accent-2" aria-hidden /> },
]

function StudioCues({ dict }: { dict: LandingDict }) {
  /*
   * A plain div rather than a `<fieldset>`: a fieldset lifts its legend out of
   * its own layout box, so as a grid container it puts the prompt outside the
   * grid and the gap under it stops existing. The radios group themselves by
   * `name`, and the role and the label say the rest.
   */
  return (
    <div className="cue-strip" role="radiogroup" aria-labelledby="cue-lead">
      <p className="cue-lead" id="cue-lead">
        {dict.cues.lead}
      </p>
      {/*
        All four inputs first, and every one of them a sibling of both the row
        and the notes - which is what lets `:checked ~` reach either. Hidden
        rather than absent: a hidden radio is still focusable, and the label it
        belongs to lights up for `:focus-visible` in its place.
      */}
      {CUES.map((cue, i) => (
        <input
          key={cue.id}
          type="radio"
          name="studio-cue"
          id={`cue-${cue.id}`}
          className="sr-only cue-radio"
          defaultChecked={i === 0}
        />
      ))}
      <div className="cue-row">
        {CUES.map((cue) => (
          <label key={cue.id} htmlFor={`cue-${cue.id}`} className="cue-tab">
            {cue.icon}
            {/* Not translated: the product's UI is English everywhere, so a
                German reader pressing "Walk here" here will find "Walk here"
                there. The sentence under it is the part that is theirs. */}
            <span>{dict.cues.items[cue.id].label}</span>
          </label>
        ))}
      </div>
      {/*
        All four notes stacked in one grid cell rather than one swapped in.
        The cell is as tall as the longest of them, so pressing through the row
        never moves the page under the finger doing the pressing.
      */}
      <div className="cue-notes">
        {CUES.map((cue) => (
          <p key={cue.id} className={`cue-note cue-note-${cue.id}`}>
            {dict.cues.items[cue.id].note}
          </p>
        ))}
      </div>
    </div>
  )
}

function ScreenBeat({
  shot,
  dict,
  wide,
}: {
  shot: (typeof SCREENS)[number]
  dict: LandingDict
  /** The full-width plate with a masthead over it, rather than a plate beside a caption. */
  wide: boolean
}) {
  const copy = dict.screens[shot.id]
  return (
    <article
      className={`screen-beat ${wide ? 'screen-beat-wide' : 'screen-beat-split'}`}
      style={{ '--box-hue': shot.hue } as React.CSSProperties}
    >
      <div className="screen-note">
        <div>
          <p className="usecase-kicker">{copy.kicker}</p>
          {/* No `font-medium` and no negative tracking: the face ships one
              weight, and the letterforms are drawn around one-pixel gaps that
              tightening closes. */}
          <h3 className="usecase-title">{copy.title}</h3>
        </div>
        <div>
          <p className="usecase-body text-sm">{copy.body}</p>
          <Link
            href={shot.href}
            className="mt-4 inline-block text-sm font-medium text-accent transition hover:opacity-80"
          >
            {copy.cta} →
          </Link>
        </div>
      </div>
      <div className="screen-art">
        {/* The strip of grid the screen stands on. Decorative, and the only
            thing in this band that is not the product itself. */}
        <span className="neon-floor" />
        <div className="screen" style={{ '--screen-cut-right': shot.cutRight } as React.CSSProperties}>
          <Image
            src={shot.src}
            alt={copy.alt}
            width={shot.width}
            height={shot.height}
            className="screen-shot"
            sizes={shot.sizes}
          />
        </div>
      </div>
      {/* Only the studio has controls sitting on its picture. */}
      {shot.id === 'studio' && <StudioCues dict={dict} />}
    </article>
  )
}

/**
 * The page furniture for a tier: its hue, and which animal leans on the card.
 *
 * Here rather than in the `tiers` table, and the line is worth drawing. That
 * table is commerce - what a plan costs and what it holds - and it changes
 * without a deploy. A hue and an avatar are layout, they are checked by looking
 * at the page, and a row in a database naming `fox-front` would be a broken
 * image nobody notices until a stranger does.
 *
 * A tier with no entry draws no card, which is the safe direction: a new row
 * appears in the backoffice and on the billing page immediately, and reaches
 * the shop window when somebody has chosen how it should look.
 */
const TIER_LOOK: Partial<Record<Tier, { hue: number; avatar: string }>> = {
  free: { hue: 200, avatar: 'fox' },
  xo: { hue: 355, avatar: 'lion' },
  // Not fox - it is already on the demo greeters. See the note on the event
  // card about one animal per page.
  xp: { hue: 35, avatar: 'elephant' },
}

/**
 * "Up to N people", per card, from the tier rather than from the flag.
 *
 * This used to be one line on the xo card reading `seatLimit`, which is the
 * *installation's* `seat_limit` flag - off in every ordinary deployment. So the
 * page told strangers "invite as many people as you like" while xo allowed six.
 * The same class of mistake as the invite path, on the one surface where being
 * wrong costs trust before anybody has an account.
 *
 * The number is seats plus concurrent guests, which is what a reader counts -
 * `docs/product/pricing.md` §13 says so in as many words. Copy that says "6
 * people" for a space that holds nine is read as a lie by whoever counts.
 *
 * The platform ceiling still wins where it is set and stricter. It is a real
 * cap when an operator turns it on, and quoting terms we would then refuse is
 * the thing this whole function exists to stop.
 */
function peopleLine(dict: LandingDict, tier: Tier, ceiling: number | null): string {
  const seats = tierLimit(tier, 'seats')
  const guests = tierLimit(tier, 'guests')

  // `null` is unlimited on both, and no tier has an unlimited headcount today -
  // but the table is allowed to grow one, and a card silently printing "NaN
  // people" would be worse than a sentence that is merely vague.
  if (seats === null || guests === null) return dict.pricing.monthly.unlimitedLine

  /*
   * The ceiling clamps *seats*, and only seats.
   *
   * `seat_limit` counts members - "people per space" is its own label, and
   * `quota.ts` maps it to `seats` while guests get `guest_limit` of their own.
   * Clamping the sum by it, which this did first, quietly understated the top
   * card: a ceiling of 12 turned xp's twenty into twelve, as though it had
   * taken the guests away too.
   *
   * Note what this means in practice, because it looks like the control is
   * dead: no tier allows more than twelve seats, so a `seat_limit` of twelve is
   * not stricter than anything and changes no card. It has to go *below* a
   * tier's seat count before the page moves.
   */
  const held = Math.min(seats, ceiling ?? Number.POSITIVE_INFINITY) + guests
  return fill(dict.pricing.monthly.cappedLine, { n: held })
}

/** The plan, in three beats. Hues run cool to warm as the certainty drops. */
const PLAN: { id: PlanId; hue: number; live: boolean }[] = [
  { id: 'xo', hue: 145, live: true },
  { id: 'xp', hue: 35, live: false },
  { id: 'runtime', hue: 265, live: false },
]

/**
 * What the header pill points at.
 *
 * Only places that exist. A nav that lists a Community tab because the mockup
 * had one is a nav that lies on its first click. All three are now pages rather
 * than anchors, so the pill works from every one of them and not only from
 * here - which an anchor row silently does not.
 */
const SECTIONS = [
  { key: 'play', href: '/play' },
  { key: 'create', href: '/create' },
  { key: 'share', href: '/share' },
  { key: 'pricing', href: '#pricing' },
] as const

/** Shared attributes for the chip icons: 15px, stroked, inherit the hue. */
const ICON = {
  viewBox: '0 0 16 16',
  width: 15,
  height: 15,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.4,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

/**
 * The strip under the hero: one chip per surface, each an icon and a word.
 *
 * They used to jump to a card further down this page. The cards are on /play
 * now, so the chips are links out rather than anchors - which is the honest
 * version of what they always were, a table of contents for the arcade rather
 * than for this document.
 *
 * Drawn inline rather than pulled from an icon set - six small line drawings
 * are not worth a dependency.
 */
const CHIPS: { id: ChipId; hue: number; href: string; icon: React.ReactNode }[] = [
  {
    id: 'lounge',
    hue: 320,
    href: '/play#lounge',
    icon: (
      <svg {...ICON}>
        <path d="M8 1.5 14 5v6l-6 3.5L2 11V5l6-3.5Z" />
        <path d="M2 5l6 3.5L14 5M8 8.5V15" />
      </svg>
    ),
  },
  {
    id: 'football',
    hue: 145,
    href: '/play#football',
    icon: (
      <svg {...ICON}>
        <circle cx="8" cy="8" r="6.3" />
        <path d="M8 4.6 11.2 7l-1.2 3.7H6L4.8 7 8 4.6Z" />
      </svg>
    ),
  },
  {
    id: 'battles',
    hue: 25,
    href: '/play#battles',
    icon: (
      <svg {...ICON}>
        <path d="M2.5 2.5l11 11M13.5 2.5l-11 11M2 11.2 4.8 14M14 11.2 11.2 14" />
      </svg>
    ),
  },
  {
    /*
      A board, because the arcade grew one and the strip is what the strip is
      for: it names the things that are actually in there. Amber rather than
      another neon - it sits between the fight and the race in the row, and the
      four counters on a board are the one thing here that is played sitting
      down.
    */
    id: 'boardgames',
    hue: 75,
    href: '/play#boardgames',
    icon: (
      <svg {...ICON}>
        <rect x="2" y="2" width="12" height="12" rx="1.5" />
        <path d="M2 6h12M2 10h12M6 2v12M10 2v12" />
      </svg>
    ),
  },
  {
    id: 'races',
    hue: 90,
    href: '/play#races',
    icon: (
      <svg {...ICON}>
        <path d="M3.5 2v12" />
        <path d="M3.5 3h9l-2 2.6 2 2.6h-9" />
      </svg>
    ),
  },
  {
    id: 'tournaments',
    hue: 55,
    href: '/play#tournaments',
    icon: (
      <svg {...ICON}>
        <path d="M5 2.5h6V6a3 3 0 0 1-6 0V2.5Z" />
        <path d="M5 3.5H2.8a2.4 2.4 0 0 0 2.4 2.9M11 3.5h2.2a2.4 2.4 0 0 1-2.4 2.9M8 9v2.5M5.8 13.5h4.4M6.5 11.5h3v2h-3Z" />
      </svg>
    ),
  },
  {
    id: 'cafe',
    hue: 40,
    href: '/play#cafe',
    icon: (
      <svg {...ICON}>
        <path d="M2.5 5.5h8.5V10a3.5 3.5 0 0 1-3.5 3.5H6A3.5 3.5 0 0 1 2.5 10V5.5Z" />
        <path d="M11 6.5h1.3a1.9 1.9 0 1 1 0 3.8H11M5.2 3.4c.6-.6 0-1 .5-1.6M8 3.4c.6-.6 0-1 .5-1.6" />
      </svg>
    ),
  },
]

/**
 * EN / DE / BG, in the header pill.
 *
 * Plain links rather than a `<select>` or a dropdown. Three languages still fit
 * in the width of the word "Pricing", so a control that has to be opened before
 * it shows its options is machinery around a link - and a `<select>` here would
 * need client JS to navigate, on a page that is otherwise entirely
 * server-rendered.
 *
 * Each link goes through `/lang/{code}`, which writes the cookie and lands on
 * the page. It used to point straight at the page and write nothing; the note
 * on that route handler is the whole argument for the hop, and the short of it
 * is that the landing pages carry their locale in the path while everything
 * under them reads a cookie, so a switch that only changed the path changed the
 * front page and nothing behind it.
 *
 * `aria-current` rather than only a colour, so the active language is announced
 * rather than merely looking brighter.
 */
function LanguageSwitch({ locale }: { locale: Locale }) {
  /*
   * Below `sm`, only the languages you are not reading.
   *
   * The header pill has 38px of slack at 375px and each code with its separator
   * costs about 29px, so the full set does not fit and never did - with two
   * locales this dropped the active one and showed a lone "EN", which was
   * exactly enough. Three do not fit either way, so below `sm` the control
   * collapses to the *next* language rather than to all the others: one tap
   * cycles EN → DE → BG → EN, which is a whole control in one code's width.
   *
   * At `sm` and up there is room for the honest thing, so all three are drawn
   * with the current one marked.
   */
  const next = LOCALES[(LOCALES.indexOf(locale) + 1) % LOCALES.length]

  return (
    <span className="mx-1 inline-flex items-center gap-1 text-xs" aria-label="Language">
      <Link
        href={switchHref(next)}
        hrefLang={next}
        lang={next}
        className="uppercase text-ink-muted transition hover:text-ink sm:hidden"
      >
        {next}
      </Link>

      {LOCALES.map((code, i) => {
        const active = code === locale
        return (
          <span key={code} className="hidden items-center gap-1 sm:inline-flex">
            {i > 0 && <span className="text-ink-muted/40">/</span>}
            {active ? (
              <span aria-current="true" className="font-medium text-ink uppercase">
                {code}
              </span>
            ) : (
              <Link
                href={switchHref(code)}
                hrefLang={code}
                lang={code}
                className="uppercase text-ink-muted transition hover:text-ink"
              >
                {code}
              </Link>
            )}
          </span>
        )
      })}
    </span>
  )
}

export function Landing({
  registrationOpen,
  seatLimit,
  featured,
  tiers,
  dict,
  locale,
}: AccessTerms & { dict: LandingDict; locale: Locale }) {
  /**
   * One door, whatever the flag says.
   *
   * The label no longer changes with it, and that is deliberate. "Sign up" and
   * "Request an invite" are two different promises and the page used to make
   * whichever one the flag allowed; "Join the beta" is true on both sides of
   * the switch, which means the nav, the hero and the closing band can all say
   * the same words without any of them lying on a given day.
   */
  const joinHref = registrationOpen ? '/signup' : '/waitlist'

  /**
   * The legal pages, in the language the page is being read in.
   *
   * German is the canonical version of both and lives at the bare path,
   * because an Impressum is a German legal obligation and the English one is a
   * courtesy translation rather than the document. So the English landing page
   * links to the courtesy copies and the German one to the originals.
   */
  const legal =
    locale === 'de'
      ? { imprint: '/impressum', terms: '/agb', privacy: '/datenschutz' }
      : { imprint: '/impressum/en', terms: '/agb/en', privacy: '/datenschutz/en' }

  return (
    /**
     * `lang` here rather than on `<html>`, which the root layout pins to "en".
     *
     * A layout in the App Router is not told which route rendered it, so the
     * document element cannot follow the locale without giving `/de` a root
     * layout of its own - a second `<html>`, a second font setup and a second
     * place for the theme class to drift. Declaring it on the subtree that
     * actually holds the words is valid HTML and is what a screen reader
     * reads: the nearest `lang` wins, so a German page is announced in German.
     * Everything outside this element is chrome with no prose in it.
     */
    <main lang={locale} className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
      <ShootingStars />
      {/* Tighter on a phone. Every rem above the fold is a rem of the crowd
          below it, and the header is the one band up here that is chrome
          rather than content - see the note on `.hero-scene`'s margin. */}
      <header className="flex items-center justify-between gap-3 py-4 sm:py-6">
        <Link href={landingHref(locale)} className="enter-mark flex items-center gap-3">
          {/* The badge rides on the mark now rather than sitting beside it, so
              there is nothing here to drop on a narrow screen: the pair is one
              object and costs the width of one. This is the only place that
              asks for it - see the note on the prop. */}
          <Logo badge />
        </Link>
        {/* Borderless: the links float on the sky, and the outlined sign-up is
            the only edge up here. The hero below is all boxes - the header
            reads as part of the room by not being one. */}
        <nav className="enter nav-pill" style={{ '--i': 1 } as React.CSSProperties}>
          {SECTIONS.map((section) => (
            <Link key={section.href} href={section.href} className="nav-pill-link">
              {dict.nav[section.key]}
            </Link>
          ))}
          {/* Literal for the same reason as the footer: "Community" is the
              same word in all three page languages. */}
          <Link href={locale === 'de' ? '/de/community' : '/community'} className="nav-pill-link">
            Community
          </Link>
          <LanguageSwitch locale={locale} />
          <Link href="/login" className="nav-pill-link nav-pill-quiet">
            {dict.nav.signIn}
          </Link>
          <Link href={joinHref} className="nav-pill-cta">
            {dict.nav.join}
          </Link>
        </nav>
      </header>

      <div className="bento">
        {/* Hero. The crowd is the pitch, so it gets the whole width and the
            floor to stand on; the copy sits above it rather than beside it. */}
        <section
          className=" col-span-6 pt-0 text-center sm:pt-0"
          style={{ '--box-hue': 320 } as React.CSSProperties}
        >
          <BlockDrift />

          <p className="box-tag enter justify-center" style={{ '--i': 3 } as React.CSSProperties}>
            {registrationOpen ? dict.hero.eyebrowOpen : dict.hero.eyebrowClosed}
          </p>
          {/* No `font-semibold` and no `tracking-tight`: the face ships one
              weight, so bold is synthesised by smearing the pixels sideways,
              and negative tracking closes the one-pixel gaps the letterforms
              are drawn around. */}
          <h1
            /* The pixel face is drawn on a wide grid and set in caps here, so it
               eats about a third more width than the size suggests: at `text-4xl`
               a 375px screen got two full lines of headline before anything else
               on the page, and the room underneath it was that much further down.
               Fluid rather than a second breakpoint, because the range that
               needs fixing is 320-640px and a step in the middle of it just
               moves the too-big screen somewhere else. Capped at the old size so
               nothing changes for anybody who already had the width for it. */
            className="enter uppercase font-pixel mx-auto mt-4 max-w-4xl text-[clamp(1.5rem,6.4vw,2.25rem)] leading-[1.2] sm:mt-5 sm:text-6xl"
            style={{ '--i': 4 } as React.CSSProperties}
          >
            {dict.hero.headlineLead}{' '}
            {/* `inline-block` so the second clause breaks as a unit.
                Left to wrap on its own it split mid-phrase on a phone - line one
                ended "…CHAT <3 HERE TO" and line two was the single word
                "PLAY.", which puts the stance on one line and the punchline on
                another and reads as a widow rather than as a turn. As a block it
                either fits beside the first clause or moves down whole, so the
                break always falls on the divider. */}
            <span className="ignite neon-breathe text-accent inline-block">
              {dict.hero.headlineAccent}
            </span>
          </h1>
          {/*
            The stance, then the mechanic, in that order and both above the fold.

            The headline is a position rather than a description - it says what
            this is *not*, which is the entire category it would otherwise be
            compared to and lose against. That is worth the whole headline, but
            it leaves a stranger knowing how we feel and not what the thing is,
            and a hero that only takes a stance is a hero nobody can repeat to a
            colleague. So the sentence that explains it is directly underneath
            rather than further down the page: one line, the mechanic, no
            adjectives.
          */}
          <p
            className="enter mx-auto mt-4 max-w-xl text-base leading-snug text-ink-muted sm:mt-5 sm:leading-relaxed sm:text-lg"
            style={{ '--i': 5 } as React.CSSProperties}
          >
            {dict.hero.sub}
          </p>
          {/*
            The demo first, literally first, and joining next to it.

            The page's whole claim is a room you can be standing in, and this is
            the only control on it that lets somebody do exactly that without
            deciding anything first - no address, no account, no page of terms.
            How many take it is the number /demo/join answers - see that route.

            `.summon-cta` is the battle wizard's own button, borrowed rather
            than copied: it shimmers, which is what makes it read as the live
            thing on a page of links, and sharing the class keeps the sweep, the
            hover and the reduced-motion rule in one place.
          */}
          <div
            className="enter mt-6 flex flex-col items-center justify-center gap-3 sm:mt-8 sm:flex-row sm:gap-4"
            style={{ '--i': 6 } as React.CSSProperties}
          >
            <Link
              href="/demo"
              className="summon-cta cta-pixel w-full max-w-xs rounded-full px-8 py-3.5 text-center text-lg transition sm:w-auto sm:max-w-none"
            >
              {dict.hero.ctaDemo}
            </Link>
            <Link
              href={joinHref}
              className="cta-pixel w-full max-w-xs rounded-full bg-accent px-8 py-3.5 text-center text-lg text-white transition sm:w-auto sm:max-w-none"
            >
              {dict.hero.ctaJoin}
            </Link>
            {/*
              The recording, third in the row and last of the three.

              Third on purpose. The page's claim is that you can be standing in
              a room in one click, and putting a ninety-second video ahead of
              the control that does that would be answering "can I try it?"
              with "let me explain first". But it belongs *in* this row rather
              than further down the page: the visitor who is not ready to click
              into a world is deciding right here whether this is worth any more
              of their time, and everything below is more words.
            */}
            <IntroVideo dict={dict.intro} locale={locale} variant="cta" />
          </div>

          {/*
            The small print and the room, in that order on a desktop and the
            other way round on a phone. See the long note in git history: on a
            phone the terms are the only thing in the stack nobody came here to
            read, and they were standing in front of the crowd.
          */}
          <div className="flex flex-col">
            <p
              className="enter order-2 mt-4 text-sm text-ink-muted sm:order-1 sm:mt-6"
              style={{ '--i': 6 } as React.CSSProperties}
            >
              <span className="text-ink">
                {seatLimit === null
                  ? dict.terms.unlimitedMembers
                  : fill(dict.terms.upToMembers, { n: seatLimit })}
              </span>{' '}
              {dict.terms.perSpace}
            </p>

            {/*
              The trio on its podium, with a hologram either side, standing in a
              room of their own. The horizon and the floor belong to the stage
              rather than to the section, so the podium stands on the floor
              rather than floating over it - one wrapper, one perspective, one
              room.
            */}
            <div
              className="hero-scene enter order-1 mt-12 sm:order-2 sm:mt-16"
              style={{ '--i': 7 } as React.CSSProperties}
            >
              <span className="neon-horizon" />
              <span className="neon-floor" />
              <LoungePanel dict={dict} />
              <PeepStage />
              <PalettePanel dict={dict} />
            </div>
          </div>

          {/* Every surface as an icon and a word, each one a door into /play. */}
          <nav className="chip-row enter" style={{ '--i': 8 } as React.CSSProperties}>
            {CHIPS.map((chip) => (
              <Link
                key={chip.id}
                href={chip.href}
                className="chip"
                style={{ '--hue': chip.hue } as React.CSSProperties}
              >
                {chip.icon}
                <span>{dict.chips[chip.id]}</span>
              </Link>
            ))}
          </nav>
        </section>

        {/*
          Directly under the hero, and above everything that argues.

          The hero's claim is "a room you send as a link", and the next thing on
          the page should be a room somebody is sending. Renders nothing when
          nothing is featured, which is most weeks.
        */}
        <FeaturedEvents doors={featured} dict={dict} locale={locale} />

        {/* The three doors. Short on purpose: each one is a page. */}
        <header className="col-span-6 mt-4 text-center">
          <p className="box-tag justify-center" style={{ '--box-hue': 285 } as React.CSSProperties}>
            {dict.doorsHeader.tag}
          </p>
          <h2 className="font-pixel mx-auto mt-4 max-w-3xl text-2xl leading-[1.25] uppercase sm:text-3xl">
            {dict.doorsHeader.title}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-ink-muted">
            {dict.doorsHeader.body}
          </p>
        </header>

        {DOORS.map((slot, i) => (
          <DoorCard key={slot.id} slot={slot} dict={dict} index={i} />
        ))}

        {/*
          The community edition, as its own box rather than only a nav link -
          because on a phone there is no header pill, and the one fact this
          section carries (the code is public) deserves better than a footer
          link. It stands directly behind the three doors: the fourth door,
          for the reader whose first question is the source. The beaver builds the thing; naturally it fronts this card.
        */}
        <section
          className="box rise col-span-6"
          style={{ '--box-hue': 265, '--i': 6 } as React.CSSProperties}
        >
          <h2 className="font-pixel text-xl uppercase leading-[1.3] sm:text-2xl">
            {dict.community.title}
          </h2>
          <p className="band-prose mt-4 max-w-2xl text-sm leading-relaxed text-ink-muted">
            {dict.community.body}
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:gap-4">
            <Link
              href={locale === 'de' ? '/de/community' : '/community'}
              className="w-full max-w-xs rounded-full bg-accent px-7 py-3 text-center font-semibold transition sm:w-auto sm:max-w-none"
            >
              {dict.community.ctaHandbook}
            </Link>
            <a
              href="https://github.com/kappaxbeta/kxb"
              className="w-full max-w-xs rounded-full border border-line bg-surface-raised/70 px-7 py-3 text-center backdrop-blur-sm transition hover:bg-surface-raised sm:w-auto sm:max-w-none"
            >
              {dict.community.ctaGithub}
            </a>
          </div>
          <BoxPeep avatar="beaver" angle="three" />
        </section>

        {/* Not a box, on purpose - see `.usecases`. */}
        <section className="usecases col-span-6">
          {ROWS.map((row, i) => {
            const copy = dict.rows[row.id]
            return (
              <article
                key={row.id}
                className={`usecase ${i % 2 === 1 ? 'usecase-flip' : ''}`}
                style={{ '--box-hue': row.hue } as React.CSSProperties}
              >
                <div className="usecase-art">
                  {/* The hero's drifting palette, in the air around the pitch.
                      With no card behind these rows, this is what fills the
                      margin the cut-out leaves. */}
                  <BlockDrift blocks={row.deco} shapes={[]} priority={false} />
                  <Image
                    src={`/xo/scenes/${row.scene}.webp`}
                    alt={copy.alt}
                    width={row.width}
                    height={row.height}
                    className="usecase-shot"
                    style={{ '--i': i } as React.CSSProperties}
                    sizes="(max-width: 900px) 100vw, 55vw"
                  />
                </div>
                <div>
                  <p className="usecase-kicker">{copy.kicker}</p>
                  <h3 className="usecase-title">{copy.title}</h3>
                  <p className="usecase-body text-sm">{copy.body}</p>
                  <Link
                    href={row.href}
                    className="mt-4 inline-block text-sm font-medium text-accent transition hover:opacity-80"
                  >
                    {copy.cta} →
                  </Link>
                </div>
              </article>
            )
          })}
        </section>

        {/*
          The software, once the room has been sold.

          Deliberately after the four rows and before the plan: the rows are the
          reason to want one, and this is what one actually is. A visitor meets
          the price two sections later having seen the surface it buys.
        */}
        <header className="col-span-6 mt-4 text-center">
          <p className="box-tag justify-center" style={{ '--box-hue': 285 } as React.CSSProperties}>
            {dict.screensHeader.tag}
          </p>
          <h2 className="font-pixel mx-auto mt-4 max-w-3xl text-2xl leading-[1.25] uppercase sm:text-3xl">
            {dict.screensHeader.title}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-ink-muted">
            {dict.screensHeader.body}
          </p>
        </header>

        <section className="screens col-span-6">
          {SCREENS.map((shot) => (
            <ScreenBeat key={shot.id} shot={shot} dict={dict} wide={shot.wide} />
          ))}
        </section>

        <World dict={dict} />

        {/*
          The plan, said out loud, before the price.

          Two of these three are not built, and putting them above the price
          rather than below it is the deliberate part: somebody deciding whether
          to pay €5 should have already read what is shipped, what is soon and
          what is only planned, in those words. A roadmap under a price reads as
          justification for it; a roadmap above one reads as the thing you are
          being asked to join.
        */}
        <section
          id="plan"
          className="box rise col-span-6"
          style={{ '--box-hue': 200, '--i': 0 } as React.CSSProperties}
        >
          <p className="box-tag">{dict.plan.tag}</p>
          <h2 className="font-pixel mt-4 max-w-3xl text-xl leading-[1.3] uppercase sm:text-2xl">
            {dict.plan.title}
          </h2>

          <ol className="plan-list">
            {PLAN.map((beat) => {
              const copy = dict.plan.items[beat.id]
              return (
                <li
                  key={beat.id}
                  className="plan-beat"
                  style={{ '--box-hue': beat.hue } as React.CSSProperties}
                >
                  <p className="plan-beat-head">
                    <span className="plan-beat-name">{copy.name}</span>
                    {/* The word is the badge. A dot before it rather than a
                        pill around it, because three pills in a column read as
                        three buttons. */}
                    <span className={`plan-when ${beat.live ? 'plan-when-live' : ''}`}>
                      {copy.when}
                    </span>
                  </p>
                  <p className="plan-beat-body">{copy.body}</p>
                </li>
              )
            })}
          </ol>

          <p className="mt-8 max-w-2xl text-sm leading-relaxed text-ink-muted">
            {dict.plan.closing}
          </p>
        </section>

        {/*
          Three prices, and only two of them are the same kind of thing.

          xo and xp are the product: two Stripe prices, self-serve Checkout, and
          the tier read back off the space's own subscription - see
          domain/billing/tiers.ts. The event one is *not* wired to anything and
          deliberately is not. The monthly prices recur and grant a space
          somebody keeps; an event is a date, a brief and a room built to it,
          which is quoted and invoiced by a human. Hence "From €200" rather than
          a number.

          The numbers on the two monthly cards come from `tierPrice()` rather
          than the dictionary, so the price a visitor is quoted here cannot
          drift from the price Checkout charges them.
        */}
        <header id="pricing" className="col-span-6 mt-4 text-center">
          <p className="box-tag justify-center" style={{ '--box-hue': 55 } as React.CSSProperties}>
            {dict.pricing.tag}
          </p>
          <h2 className="font-pixel mx-auto mt-4 max-w-3xl text-2xl leading-[1.25] uppercase sm:text-3xl">
            {dict.pricing.title}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-ink-muted">
            {dict.pricing.body}
          </p>
          {/* The fourth option the cards do not show: the code is public, and
              hosting it yourself costs a server instead of a tier. Said in the
              pricing section on purpose - a price table that hides the free
              exit reads like it is hiding it. "Community Edition" is left as a
              product name rather than a dictionary key, like the footer's
              "Community". */}
          <p className="mx-auto mt-3 max-w-2xl text-sm text-ink-muted">
            <Link
              href={locale === 'de' ? '/de/community/start-kxb' : '/community/start-kxb'}
              className="text-accent-2 hover:underline"
            >
              {locale === 'de'
                ? 'Oder betreib die Community Edition selbst →'
                : 'Or run the Community Edition yourself →'}
            </Link>
          </p>
        </header>

        {/*
          The tiers, cheapest first, from the table.

          Mapped rather than written out, so `shown_on_landing` decides what
          appears and a fourth tier needs a row and a block of copy rather than
          a fourth copy of this markup. The hue and the animal stay here: they
          are page furniture, not commerce, and a row in a database has no
          business naming an avatar.

          Every card carries its own headcount line. One line used to sit on the
          xo card and speak for both, which was fine while the number was the
          same on both - it is the difference between them now, and the first
          thing anybody compares.
        */}
        {tiers.map((row, position) => {
          const look = TIER_LOOK[row.tier]
          const copy = dict.pricing.monthly[row.tier]
          if (!look || !copy) return null

          return (
            <TierCard
              key={row.tier}
              tier={row.tier}
              copy={copy}
              per={dict.pricing.monthly.per}
              hue={look.hue}
              index={position + 1}
              avatar={look.avatar}
              href={joinHref}
              {...(row.tier === 'xp' ? { soonLabel: dict.pricing.monthly.soonLabel } : {})}
              cta={
                registrationOpen ? dict.pricing.monthly.ctaOpen : dict.pricing.monthly.ctaClosed
              }
              extraLine={peopleLine(dict, row.tier, seatLimit)}
            />
          )
        })}

        <section
          className="box rise col-span-2"
          style={{ '--box-hue': 285, '--i': 3 } as React.CSSProperties}
        >
          <p className="box-tag">{dict.pricing.event.tag}</p>
          <p className="mt-4 text-5xl font-semibold">{dict.pricing.event.price}</p>
          <p className="mt-2 text-sm text-ink-muted">{dict.pricing.event.note}</p>
          <ul className="mt-6 space-y-2 text-sm">
            {dict.pricing.event.lines.map((line) => (
              <li key={line} className="flex gap-2">
                <span className="text-accent">→</span>
                <span className="text-ink-muted">{line}</span>
              </li>
            ))}
          </ul>
          <Link
            href="/events"
            className="mt-7 inline-block rounded-full bg-accent px-6 py-3 font-medium text-white transition"
          >
            {dict.pricing.event.cta}
          </Link>
          {/* One animal per card, page-wide: the cast is twenty-four strong and
              a face turning up twice makes the second card look like a copy of
              the first. */}
          <BoxPeep avatar="deer" angle="three" />
        </section>

        {/*
          How somebody actually gets in, numbered.

          The one band on the page that is instructions rather than argument,
          and it exists because every other CTA here is a button with two words
          on it. "Join the beta" does not tell anybody that the demo costs
          nothing, that there is a code, or that the thing is no fun alone -
          and all three of those are the difference between a click and a
          second person in the room.
        */}
        <section
          className="box rise col-span-6"
          style={{ '--box-hue': 145, '--i': 4 } as React.CSSProperties}
        >
          <h2 className="font-pixel text-xl uppercase leading-[1.3] sm:text-2xl">
            {dict.steps.title}
          </h2>
          <ol className="step-list">
            {dict.steps.items.map((step, i) => (
              <li key={step.title} className="step">
                <p className="step-index">{`0${i + 1}`}</p>
                <p className="step-title">{step.title}</p>
                <p className="step-body">{step.body}</p>
                {/* The code sits inside step two rather than under the list,
                    because a code floating below three numbered steps is a code
                    half the readers will not connect to the step that needs
                    it. */}
                {i === 1 && <p className="step-code">{dict.steps.code}</p>}
              </li>
            ))}
          </ol>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:gap-4">
            <Link
              href="/demo"
              className="summon-cta cta-pixel w-full max-w-xs rounded-full px-7 py-3 text-center transition sm:w-auto sm:max-w-none"
            >
              {dict.closing.ctaDemo}
            </Link>
            <Link
              href={joinHref}
              className="cta-pixel w-full max-w-xs rounded-full border border-line bg-surface-raised/70 px-7 py-3 text-center backdrop-blur-sm transition hover:bg-surface-raised sm:w-auto sm:max-w-none"
            >
              {dict.closing.ctaJoin}
            </Link>
          </div>
        </section>

        {/*
          The questions, as `<details>`.

          No client component and no state: the disclosure is the browser's own,
          which means it works before hydration, it is keyboard-operable without
          anybody writing that, and the answers are in the DOM for a crawler
          whether or not anybody opened them. A React accordion here would be
          three of those four things worse for no gain.
        */}
        <section
          className="box rise col-span-6"
          style={{ '--box-hue': 225, '--i': 5 } as React.CSSProperties}
        >
          <h2 className="font-pixel text-xl uppercase leading-[1.3] sm:text-2xl">
            {dict.faq.title}
          </h2>
          <div className="faq-list">
            {dict.faq.items.map((item) => (
              <details key={item.q} className="faq-item">
                <summary className="faq-q">{item.q}</summary>
                <p className="faq-a">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Closing. The demo first here too - it is the only control on this
            page that costs the reader nothing to press. */}
        <section
          className="box rise col-span-6 py-12 text-center"
          style={{ '--box-hue': 300 } as React.CSSProperties}
        >
          <span className="neon-horizon" />
          <span className="neon-floor" />
          <h2 className="text-2xl font-semibold tracking-tight sm:text-4xl">
            {dict.closing.title}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-muted">{dict.closing.body}</p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
            <Link
              href="/demo"
              className="summon-cta cta-pixel w-full max-w-xs rounded-full px-8 py-3 text-center transition sm:w-auto sm:max-w-none"
            >
              {dict.closing.ctaDemo}
            </Link>
            <Link
              href={joinHref}
              className="cta-pixel w-full max-w-xs rounded-full border border-line bg-surface-raised/70 px-7 py-3 text-center backdrop-blur-sm transition hover:bg-surface-raised sm:w-auto sm:max-w-none"
            >
              {dict.closing.ctaJoin}
            </Link>
          </div>
        </section>
      </div>

      <footer className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-line/50 pt-6 text-sm text-ink-muted">
        <span>κXβ · unkown.t</span>
        <nav className="flex flex-wrap gap-5">
          <Link href="/events" className="nav-link">
            {dict.footer.events}
          </Link>
          {/* The handbook. "Community" is the same word in all three page
              languages, so it is a literal rather than a dictionary key - the
              German handbook lives under its own prefix and gets linked to
              directly. */}
          <Link href={locale === 'de' ? '/de/community' : '/community'} className="nav-link">
            Community
          </Link>
          <Link href={legal.imprint} className="nav-link">
            {dict.footer.impressum}
          </Link>
          <Link href={legal.terms} className="nav-link">
            {dict.footer.terms}
          </Link>
          <Link href={legal.privacy} className="nav-link">
            {dict.footer.privacy}
          </Link>
          <Link href="/contact" className="nav-link">
            {dict.footer.contact}
          </Link>
          <Link href="/login" className="nav-link">
            {dict.footer.signIn}
          </Link>
          {/*
           * The two accounts, as plain anchors rather than `<Link>`, because
           * neither is a route in this app and the router has nothing to
           * prefetch. `rel="me"` is what tells the profile at the other end
           * that this site is claiming it, and `noopener` is the usual price
           * of `target="_blank"`.
           *
           * The visible label is the platform, not the handle, because the
           * handle is the same on both and a footer that reads "@kxbteam
           * @kxbteam" is saying one thing twice. It is still in `aria-label`
           * and in the tooltip, where somebody looking for the account will
           * find it - and the X link drops the label as well, since its glyph
           * is already the letter.
           */}
          {SOCIALS.map((social) => (
            <a
              key={social.name}
              href={social.href}
              target="_blank"
              rel="me noopener noreferrer"
              title={`${social.name} · ${SOCIAL_HANDLE}`}
              aria-label={`${social.name} — ${SOCIAL_HANDLE}`}
              className="nav-link inline-flex items-center gap-1.5"
            >
              <social.icon aria-hidden className="size-4" />
              {'wordmark' in social ? null : social.name}
            </a>
          ))}
        </nav>
      </footer>
    </main>
  )
}

export { DEFAULT_LOCALE }
