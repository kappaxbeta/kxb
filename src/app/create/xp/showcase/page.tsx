import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

/**
 * Games that exist, taken apart.
 *
 * ---------------------------------------------------------------------------
 * A showcase of documents, not of screenshots
 * ---------------------------------------------------------------------------
 * Every picture here is drawn by the same software rasteriser the tests use,
 * from the same file the runtime plays - so a card is a claim that a document
 * exists, not that a mock-up does. The write-ups behind the cards go further:
 * they quote the actual rules and scripts, because "you could build a shooter
 * with this" is marketing and "here is the shooter's mine, and the three
 * numbers that make it fair" is evidence.
 *
 * Cards without a write-up yet say so on their face rather than linking to a
 * stub - a dead click teaches a reader not to click, which is the most
 * expensive lesson a small site can hand out.
 */

export const metadata: Metadata = {
  title: 'XP showcase — games that exist',
  description:
    'Real games built in the XP creator, taken apart rule by rule: a shooter, a board game, a machine room. Every picture is drawn from the document it describes.',
}

type Entry = {
  slug: string
  name: string
  shot: string
  shotSize: number
  alt: string
  blurb: string
  /** Present when a write-up page exists; absent renders an unlinked card. */
  href?: string
}

const FEATURE: Entry = {
  slug: 'shooter',
  name: 'Shooter',
  shot: '/xp/shots/shooter.png',
  shotSize: 900,
  alt: 'A prototype arena on two floors: a catwalk down one side, a gallery of targets on the far wall, breakable cover, crates and barrels',
  blurb:
    'A range you have to move around: two floors, a gallery of targets that get back up, two that run, and mines that come looking for you. Every one of those is a rule or a script in the file — none of it is code in the engine.',
  href: '/create/xp/showcase/shooter',
}

const ENTRIES: readonly Entry[] = [
  {
    slug: 'mensch',
    name: 'Mensch ärgere dich nicht',
    shot: '/xp/shots/mensch.png',
    shotSize: 900,
    alt: 'A board game laid out on a floor: a cross-shaped track of cells with four coloured home rows',
    blurb:
      'Four colours, four pieces each, one dice on the table. A whole board game — turns, captures, the lot — as a document, which is the proof the format is not secretly a shooter format.',
  },
  {
    slug: 'moving-parts',
    name: 'Moving parts',
    shot: '/xp/shots/moving-parts.png',
    shotSize: 900,
    alt: 'Two rooms joined by a corridor, with a lift platform, a patrolling block and an orbiting coin',
    blurb:
      'Everything a script can do that a verb cannot: a lift that carries you to a ledge no jump reaches, a block that patrols the gap in the wall, a coin that orbits and says so when you take it.',
  },
  {
    slug: 'first-room',
    name: 'First room',
    shot: '/xp/shots/first-room.png',
    shotSize: 500,
    alt: 'A small room with stairs climbing one wall and a gap in another',
    blurb:
      'The first document ever written, kept because it still teaches the two facts every level stands on: stairs climb because collision is measured shape, and the way out is a gap because a doorway is not.',
  },
] as const

function Card({ entry }: { entry: Entry }) {
  const body = (
    <>
      <div className="overflow-hidden rounded-t-2xl bg-surface-raised/40">
        <Image
          src={entry.shot}
          alt={entry.alt}
          width={entry.shotSize}
          height={entry.shotSize}
          className="h-auto w-full transition-transform duration-300 group-hover:scale-[1.02]"
          sizes="(max-width: 640px) 100vw, 33vw"
        />
      </div>
      <div className="p-5">
        <h2 className="font-medium">{entry.name}</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">{entry.blurb}</p>
        <p className="mt-3 font-mono text-[11px] text-ink-muted">
          {entry.href ? (
            <span className="text-accent">Read how it is made →</span>
          ) : (
            'Write-up on its way'
          )}
        </p>
      </div>
    </>
  )

  const frame = 'group block overflow-hidden rounded-2xl border border-line/60 bg-surface'
  return entry.href ? (
    <Link href={entry.href} className={`${frame} transition-colors hover:border-accent/60`}>
      {body}
    </Link>
  ) : (
    <article className={frame}>{body}</article>
  )
}

export default function XpShowcasePage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="max-w-2xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">Showcase</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          Games that exist, taken apart
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-ink-muted">
          Everything here is a real document the runtime plays, drawn by the same rasteriser the
          tests use. The write-ups quote the actual rules and scripts — the point is not that a game
          was made, it is how little it took.
        </p>
      </header>

      {/* The shooter first and full-width: it is the one with a write-up, and
          the write-up is the reason the page exists. */}
      <section className="mt-10">
        <Link
          href={FEATURE.href!}
          className="group grid overflow-hidden rounded-2xl border border-line/60 bg-surface transition-colors hover:border-accent/60 sm:grid-cols-2"
        >
          <div className="overflow-hidden bg-surface-raised/40">
            <Image
              src={FEATURE.shot}
              alt={FEATURE.alt}
              width={FEATURE.shotSize}
              height={FEATURE.shotSize}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              sizes="(max-width: 640px) 100vw, 50vw"
              priority
            />
          </div>
          <div className="flex flex-col justify-center p-6 sm:p-8">
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent-2">
              Featured
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">{FEATURE.name}</h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">{FEATURE.blurb}</p>
            <p className="mt-4 font-mono text-[11px] text-accent">Read how it is made →</p>
          </div>
        </Link>
      </section>

      <section className="mt-6 grid gap-6 pb-16 sm:grid-cols-2 lg:grid-cols-3">
        {ENTRIES.map((entry) => (
          <Card key={entry.slug} entry={entry} />
        ))}
      </section>
    </main>
  )
}
