import Image from 'next/image'
import Link from 'next/link'
import { BoardLive } from '@/app/t/[slug]/dashboard/board-live'
import { StreakBadge } from '@/app/t/[slug]/dashboard/streak-badge'
import { avatarShotUrl } from '@/domain/lounge/avatars'
import { workspaceDict } from '@/app/i18n/workspace'
import type { Locale } from '@/domain/i18n/locale'

/**
 * The top of a space's front page.
 *
 * One object, not a band of status cards. The three facts a member wants on
 * arriving - which space this is, who else is in it, and whether anything is
 * happening - are small enough that giving each its own panel would say they
 * were three subjects rather than one sentence about a room. So they are a
 * heading, a line under it, and a row of faces.
 *
 * The one control is the way in. `.summon-cta` is the loudest thing the design
 * system owns and is reserved for the single control a surface exists for; on
 * the front door of a space that is walking into it, which is the whole product
 * argument - the room sells itself and everything else here is what you read
 * while you are not in it yet.
 */
export function Masthead({
  slug,
  name,
  people,
  memberCount,
  rooms,
  radio,
  canEnter,
  streak,
  locale,
}: {
  slug: string
  name: string
  /** The roster, already trimmed to what the row draws. */
  people: { userId: string; username: string; avatar: string }[]
  /** Everybody, including the ones beyond the end of the row. */
  memberCount: number
  rooms: number
  /** What is on, if the space has a radio and anything has ever been on it. */
  radio: { title: string | null; playing: boolean } | null
  /** Whether there is a lounge to walk into. */
  canEnter: boolean
  /** The reader's own streak in this space, and their best ever. */
  streak: { current: number; longest: number }
  /** Resolved by the page. A server component - see `StreakBadge`. */
  locale: Locale
}) {
  const hidden = memberCount - people.length

  return (
    <header className="border-b border-line/60 pb-6">
      {/* Your streak, above the space's name - the one line here that is about
          you, and the way into the leaderboard. See <StreakBadge>. */}
      <div className="mb-4">
        <StreakBadge
          slug={slug}
          current={streak.current}
          longest={streak.longest}
          locale={locale}
        />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          {/*
            The space's own name, in the pixel face, in caps.
            No label above it saying what kind of page this is: the rail on the
            left is already showing you where you are, and the one thing worth
            the biggest type on the page is the name of the room you are in.
          */}
          <h1 className="font-pixel text-[clamp(1.35rem,4.6vw,2.25rem)] leading-[1.18] break-words uppercase">
            {name}
          </h1>

          {/* One line, in the order somebody would say it out loud. The live
              half - the radio, and the party if there is one - is a client
              component because a party is a broadcast rather than a row. */}
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
            <span className="tabular-nums">
              {memberCount} {memberCount === 1 ? 'person' : 'people'}
            </span>
            {rooms > 0 && (
              <>
                <Dot />
                <span className="tabular-nums">
                  {rooms} {rooms === 1 ? 'room' : 'rooms'}
                </span>
              </>
            )}
            <BoardLive radio={radio} />
          </p>
        </div>

        {canEnter && (
          <Link
            href={`/t/${slug}/lounge`}
            className="summon-cta shrink-0 rounded-full px-6 py-2.5 text-sm font-medium"
          >
            {workspaceDict(locale).board.walkIn}
          </Link>
        )}
      </div>

      {/*
        The cast.
        Members rather than who is currently standing in the lounge, and the
        line above says so in those words - presence lives on a realtime channel
        that a server-rendered page has no reading of, and a roster that claimed
        to be presence would be wrong most of the time it was looked at.
      */}
      {people.length > 0 && (
        <ul className="mt-5 flex flex-wrap items-center gap-1.5">
          {people.map((person) => (
            <li key={person.userId}>
              <span
                title={person.username}
                className="relative grid size-9 place-items-center overflow-hidden rounded-full border border-line/70 bg-surface"
              >
                <Image
                  src={avatarShotUrl(person.avatar)}
                  alt={person.username}
                  fill
                  sizes="36px"
                  className="scale-110 object-contain p-0.5"
                />
              </span>
            </li>
          ))}
          {hidden > 0 && (
            <li className="grid size-9 place-items-center rounded-full border border-dashed border-line/70 text-[0.65rem] tabular-nums text-ink-muted">
              +{hidden}
            </li>
          )}
        </ul>
      )}
    </header>
  )
}

/** The separator between facts in the line. A glyph, so it never wraps alone. */
function Dot() {
  return (
    <span aria-hidden className="text-line">
      ·
    </span>
  )
}
