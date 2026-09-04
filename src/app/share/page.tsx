import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import {
  Band,
  Figures,
  MarketingShell,
  NotYet,
  PageHero,
  PageOutro,
  Shot,
  Spec,
  Steps,
  TagField,
} from '@/app/components/marketing-shell'
import { resolveLook } from '@/app/components/look'
import {
  ADMISSION_TTL_HOURS,
  KNOCK_TTL_MINUTES,
  LINK_TTL_DAYS,
} from '@/domain/guests/application'
import { WORLD_TAGS } from '@/domain/worlds/tags'

/**
 * Every way there is to get somebody else into what you made.
 *
 * ---------------------------------------------------------------------------
 * The one page that is mostly rules
 * ---------------------------------------------------------------------------
 * /play is what there is to do and /create is how to make it; this is the one
 * somebody reads with a specific worry - who can get in, for how long, and what
 * they can break. So it is written as answers rather than as pitch: the link
 * lives seven days, the visit lives twelve hours, the knock lapses in ten
 * minutes, and the last owner cannot leave. Numbers, not adjectives.
 *
 * And now literally: all three of those clocks are *imported* rather than typed
 * out - `LINK_TTL_DAYS`, `ADMISSION_TTL_HOURS` and `KNOCK_TTL_MINUTES` from
 * `domain/guests/application`, set as figures because they are the three facts
 * this page exists to state. The tag list is imported for the same reason, so
 * the page cannot advertise a filter the catalogue does not have.
 *
 * The seat cap is deliberately *not* stated as a number. It is a flag, it moves,
 * and the landing page already reads it live - a second page hard-coding "12"
 * is the copy that goes stale the day somebody changes it.
 */

export const metadata: Metadata = {
  title: 'Share — links, rooms, members and the catalogue',
  description:
    'Add people to your space, open rooms with their own rules, send a guest link that expires when you say, publish a world to the catalogue, and make a film of it all.',
}

/**
 * The three clocks a guest link runs on, off the domain.
 *
 * Figures rather than a list, because these three numbers are the answer to the
 * question the page is opened with. The notes carry the part a number cannot: a
 * revocation is immediate, a visit ends by itself, an unanswered knock does not
 * pile up in a list.
 */
const LINK_CLOCKS = [
  {
    value: String(LINK_TTL_DAYS),
    unit: 'days',
    label: 'how long a link lives',
    note: 'by default, and you pick. Revoking it kills it everywhere, immediately.',
  },
  {
    value: String(ADMISSION_TTL_HOURS),
    unit: 'hours',
    label: 'how long one visit lasts',
    note: 'then they are out — much shorter than the link that granted it, on purpose.',
  },
  {
    value: String(KNOCK_TTL_MINUTES),
    unit: 'min',
    label: 'before an unanswered knock lapses',
    note: 'rather than sitting in a list nobody reads.',
  },
] as const

/** What a room can be set to, independently of every other room. */
const ROOM_SETTINGS = [
  ['Listed or unlisted', 'Unlisted means it is not in the list, not that it is locked.'],
  ['Creative or battle', 'Per room, so one can be building while another is fighting.'],
  ['A cap', 'Heads at once, or “whatever the event says”.'],
  [
    'Guests may build',
    'Or may not. This can only narrow what the space already allows, never widen it.',
  ],
  [
    'Chat follows the room',
    'Moving rooms moves the conversation. The lounge has its own, and the rail switches between them without moving you.',
  ],
] as const

/** How a match actually runs. The order is the information - hence `Steps`. */
const MATCH_STEPS = [
  {
    title: 'Somebody sets it up',
    body: 'Name, mode, and where. Football and races get their clock and score limit here.',
  },
  {
    title: 'People join the lobby and pick a side',
    body: 'Guests can do this — picking a side is the reason they were let in.',
  },
  {
    title: 'Whoever set it up starts it',
    body: 'And only they can call it off. That rule is in the log, so a client cannot argue with it.',
  },
  {
    title: 'The clock starts from the server',
    body: 'Rather than from whichever browser pressed the button, so everyone’s match is the same length.',
  },
] as const

const NOT_YET = [
  'A guest link enters one space. There is no link that hands somebody several.',
  'Roles are owner, admin and member. There is no custom permission set and no per-surface role.',
  'The catalogue has favourites and tags, but no ratings, no comments and no follower list.',
  'A published world is a copy when somebody takes it. Fix yours afterwards and their copy does not change.',
] as const

export default async function SharePage({
  searchParams,
}: {
  searchParams: Promise<{ look?: string }>
}) {
  const { look, variant } = await resolveLook((await searchParams).look)

  return (
    <MarketingShell>
      {/* No `active` here any more. The nav lost these three pills upstream — the
          pages they marked moved into a section this repository does not carry —
          so the prop narrowed to the one value left. This page is still real and
          still wears the shell; it simply has nothing in the header to light up,
          which is the honest state rather than a marker pointing at nothing. */}
            <div className="bento doc" data-look={look} data-variant={variant ?? undefined}>
        <PageHero
          eyebrow="Share"
          mark="link"
          title="It’s not much of an arcade on your own"
          sub="Every way there is to get somebody else into what you made — from adding a colleague, to a link you hand a stranger, to putting a world in the catalogue where anybody can find it."
          hue={200}
          art="/xo/scenes/heap-share.webp"
        />

        <section className="usecases col-span-6">
          <article className="usecase" style={{ '--box-hue': 285 } as React.CSSProperties}>
            <div className="usecase-art">
              <Image
                src="/xo/scenes/instant-link.webp"
                alt="A panda, a penguin and a fox standing together on a small grass island, each with an emote over their head"
                width={1500}
                height={1000}
                className="usecase-shot"
                sizes="(max-width: 900px) 100vw, 55vw"
              />
            </div>
            <div>
              <p className="usecase-kicker">Doors open</p>
              <h2 className="usecase-title">One link, and they’re already inside</h2>
              <p className="usecase-body text-sm">
                Put the door in the calendar invite, the Discord announcement, the group chat.
                Whoever opens it types a name, picks one of twenty-four animals, and walks in.
                Nothing to accept, nothing to install, no password to invent.
              </p>
            </div>
          </article>
        </section>

        <Band
          id="members"
          kicker="Your people"
          mark="members"
          title="You pay for a space, not for seats"
          hue={200}
          index={0}
          span="half"
        >
          <p>
            Invite by email. They turn up as <strong>owner</strong>, <strong>admin</strong> or{' '}
            <strong>member</strong>, and you can change that later. Adding somebody costs nothing —
            the price is per space, and the seat cap while the beta runs is shown live on the{' '}
            <Link href="/#pricing" className="text-accent transition hover:opacity-80">
              pricing section
            </Link>{' '}
            rather than written into this sentence, because it is a flag and it moves.
          </p>
          <p>
            The last owner cannot leave. Not “shouldn’t” — the rule lives in the domain, so the
            button is not there to press and no amount of clicking around it will produce a space
            with nobody in charge of it.
          </p>
        </Band>

        <Band
          id="rooms"
          kicker="Rooms"
          mark="rooms"
          title="One space, several rooms, different rules in each"
          hue={265}
          index={1}
          span="half"
        >
          <p>
            A room is its own world with its own settings, and the rail switches which one you are
            in without moving you out of the space.
          </p>
          <Spec rows={ROOM_SETTINGS} />
          <p>
            Closing a room keeps every block in it. It just leaves the list — so a room you closed
            after last month’s event is a room you can reopen exactly as it was. And when one fills
            up, new arrivals are routed to the emptiest room rather than bounced: an event that gets
            busier than anybody planned degrades into more rooms instead of into a worse frame rate.
          </p>
        </Band>

        <Band
          id="links"
          kicker="Guests"
          mark="link"
          title="A link is a door you prop open, not an invitation"
          hue={285}
          index={2}
          peep={{ avatar: 'fox', angle: 'three' }}
        >
          <p>
            The two look alike and are near-inverses. An invitation creates an <em>account</em> and
            enters no space. A guest link enters exactly <em>one</em> space and creates no account. So
            there is no email anywhere in it — not on the link, not at the door. What the door asks
            for instead is a display name, because the one thing the room genuinely needs is
            something to write on their nameplate.
          </p>

          <Figures items={LINK_CLOCKS} />

          <p>
            A link lets in one person or as many as turn up — those are the two the UI offers. Or
            nobody automatically: with a knock, they stand at the door with a name and you let them
            in.
          </p>

          {/* The rail in this capture is the subject of the whole band: it is
              the panel the two checkboxes above are described from. Shown here
              rather than at the top of the page because the reader has just been
              told what single-entry and knock mean, and this is where they get
              to see the two boxes they were told about. */}
          <Shot
            src="/img/level-lobby.webp"
            alt="A parkour level called Ladder Run waiting to start, with a clock running above it and a right rail of guest links: single-entry and knock checkboxes, a create-link button, an open link into the lounge, and a QR code"
            width={2200}
            height={1062}
            cutRight="3%"
            caption={
              <>
                The rail on the right of a running level: the two settings above as checkboxes, the
                links already made, and a code somebody can point a phone at. What is behind it is a
                parkour level waiting for a second person to reach the line — the door and the room
                it opens onto, in one window.
              </>
            }
          />
          <p>
            And a window, for looking without entering: a space’s lounge can be made publicly
            viewable at its own address. Read-only, nobody walks in. That is a window, not a door,
            and it is a separate switch on purpose.
          </p>
        </Band>

        <Band
          id="catalogue"
          kicker="Discovery"
          mark="catalogue"
          title="Publish a world and let strangers play in it"
          hue={90}
          index={3}
          span="half"
        >
          <p>
            Anything you build can go into the public catalogue, with up to six tags on it. The
            vocabulary is fixed rather than free text, which is what makes the filters worth having:
            every one of them has results, and none of them are the same filter spelled two ways.
          </p>
          {/* Imported from the domain rather than typed out, so a tag added in a
              pull request appears here and a tag renamed cannot leave this page
              advertising a filter that no longer exists. */}
          <TagField tags={WORLD_TAGS} />
          <p>
            Somebody who finds yours can drop it into their own space. Their copy, your original,
            and no relationship between the two after that — which is the trade: they cannot break
            yours, and you cannot patch theirs.
          </p>
        </Band>

        <Band
          id="studio"
          kicker="Studio"
          mark="studio"
          title="Make a little film of it and send that instead"
          hue={320}
          index={4}
          span="half"
        >
          <p>
            Screenshots of a 3D world are never quite it. So there are three studios, using the same
            models the world does: a <strong>video</strong> studio where you walk your peeps around,
            give them something to say and move the camera; a <strong>picture</strong> studio for one
            staged, lit frame; and a <strong>banner</strong> studio for the wide one.
          </p>
          <p>
            They are your peeps, in your space. Make one for a colleague who missed it, or for the
            top of the announcement, or just because a fox saying something daft is funnier than a
            paragraph about a fox.
          </p>
        </Band>

        <Band
          id="matches"
          kicker="Matches"
          mark="battles"
          title="Challenge a space that isn’t yours"
          hue={25}
          index={5}
          peep={{ avatar: 'tiger', angle: 'low' }}
        >
          <p>
            A <strong>battlefield</strong> is an arena you published for other people to fight in.
            Yours stays yours; the match happens in a copy of it.
          </p>

          <Steps steps={MATCH_STEPS} />

          <p>
            Tournaments, challenges between spaces and the world catalogue are for members. A guest
            at a weekend event has no space to be challenged by, and two dead links is a worse room
            than a smaller one.
          </p>
        </Band>

        <NotYet items={NOT_YET} hue={225} />

        <PageOutro title="Somebody’s waiting for the link." hue={200} />

        <p className="col-span-6 text-center text-sm text-ink-muted">
          Next:{' '}
          <Link href="/play" className="text-accent transition hover:opacity-80">
            what there is to do in there
          </Link>{' '}
          ·{' '}
          <Link href="/create" className="text-accent transition hover:opacity-80">
            how to build it
          </Link>
        </p>
      </div>
    </MarketingShell>
  )
}
