import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

/**
 * The XP creator, as a page for people who are not us.
 *
 * ---------------------------------------------------------------------------
 * Not linked from anywhere, and `noindex`
 * ---------------------------------------------------------------------------
 * Deliberately reachable only by knowing the address. The creator is behind a
 * backoffice gate and the multiplayer half is behind a per-space flag, so a page
 * that sold it to the open web would be selling something almost nobody can open
 * yet - and a search result for a product you cannot get into is worse than no
 * search result at all.
 *
 * `robots: noindex` says the same thing to a crawler that not linking it says to
 * a person. Both come off in one edit on the day this is ready, and until then
 * the page is a thing to show somebody rather than a thing to be found.
 *
 * English only. The rest of the marketing surface is translated; this is not,
 * because a page that is not launched should not be paying translation cost on
 * every copy change - and half-translated is worse than plainly English.
 */

export const metadata: Metadata = {
  title: 'XP — build a game, not a level',
  description:
    'A game creator that runs in a browser: build a world out of pieces, give the things in it rules, and play it with other people.',
  robots: { index: false, follow: false },
}

/**
 * Everything on this page is a claim about something that exists.
 *
 * Written from the manual rather than from ambition - the numbers are the
 * measured ones, and every feature named here is one somebody can be shown
 * today. A page describing the roadmap as though it shipped is the fastest way
 * to make the parts that *did* ship look like more of the same.
 */
const PILLARS = [
  {
    title: 'Build it out of pieces',
    body: 'Eighty-six prototype models — walls, floors, slopes, stairs, crates, targets. Drag one in and it lands where you let go. Collision is worked out once, when the level opens, so a room of four thousand pieces costs the same to walk around as a room of four.',
  },
  {
    title: 'Give things rules',
    body: 'A crate that breaks, a pickup that refills you, a barrel that takes you with it. Rules are rows in a panel rather than code: four events, six comparisons, eight verbs. There is nothing you can write that fails while somebody is playing.',
  },
  {
    title: 'Write a script when a rule will not do',
    body: 'A platform that rises, a turret that tracks, a door that opens as you approach. JavaScript in a sandbox, with three hooks and no way to reach the network — so a level somebody else wrote is a level you can open.',
  },
  {
    title: 'Play it with other people',
    body: 'A match is a room. Everybody who joins sees each other move, in the level you built, with the rules you gave it. Send a link and somebody outside your space can walk in.',
  },
] as const

/**
 * The numbers, and where each one comes from.
 *
 * Measured rather than chosen, every one of them, which is the only reason they
 * are worth printing. `bun run xp:bench` produces the first two; the third is the
 * catalogue's own length.
 */
const FACTS = [
  { value: '8,000', label: 'pieces in a level', note: 'a fifth of a second to load' },
  { value: '1,000', label: 'things with rules', note: 'the tighter limit — these cost per frame' },
  { value: '86', label: 'models to build with', note: 'measured, so a wall is really four metres' },
] as const

export default function XpCreatorPage() {
  return (
    <main className="min-h-dvh">
      {/* --- the top ------------------------------------------------------ */}
      <section className="relative overflow-hidden border-b border-line/40">
        {/*
          One soft light behind the title rather than a gradient across the whole
          section: the screenshot below is the brightest thing on the page and
          has to stay that way, so the chrome above it glows and does not shout.
        */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 left-1/2 size-[42rem] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl"
        />

        <div className="relative mx-auto max-w-5xl px-6 pb-16 pt-24 sm:pt-32">
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
            XP · a game creator
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">
            Build a game, not a level.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-muted">
            Most world builders give you somewhere to stand. This gives you
            somewhere to <em className="not-italic text-ink">play</em>: things
            that break, targets that count, a gun in your hand, and other people
            in the room with you.
          </p>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-muted">
            It runs in a browser. There is nothing to install and nothing to
            compile — a game is one file, and the file is the whole game.
          </p>
          {/* The two doors the nav also offers, said here because a hero that
              ends without one leaves "and now what?" to the reader. */}
          <div className="mt-8 flex flex-wrap items-center gap-4 text-sm">
            <Link
              href="/create/xp/docs"
              className="rounded-full bg-accent px-6 py-2.5 font-medium text-surface transition-colors hover:bg-accent/85"
            >
              How to make one
            </Link>
            <Link
              href="/create/xp/showcase"
              className="rounded-full px-6 py-2.5 text-ink-muted transition-colors hover:text-ink"
            >
              Games that exist →
            </Link>
          </div>
        </div>
      </section>

      {/* --- the picture --------------------------------------------------- */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        {/* Capped rather than filling the column: the shot is square, and a
            square at the full width of a five-xl container is a picture that
            pushes everything it is meant to introduce below the fold. */}
        <figure className="mx-auto max-w-2xl">
          <div className="overflow-hidden rounded-2xl border border-line/60 bg-surface-raised/40">
            {/*
              The shooter demo, drawn by the same rasteriser the tests use — so
              this is a picture of a real document rather than a mock-up. It is
              also the honest look of the thing: prototype grey, because the art
              is a construction kit and pretending otherwise sets up a
              disappointment on the first click.
            */}
            <Image
              src="/xp/shots/shooter.png"
              alt="A prototype arena on two floors: a catwalk down one side, a gallery of targets on the far wall, breakable cover, crates and barrels"
              width={900}
              height={900}
              className="h-auto w-full"
              priority
            />
          </div>
          <figcaption className="mt-3 font-mono text-[11px] leading-relaxed text-ink-muted">
            The shooter demo. Every target, crate and barrel in it breaks because
            of a rule in the document — not a line of code in the engine.
          </figcaption>
        </figure>
      </section>

      {/* --- what it does -------------------------------------------------- */}
      <section className="mx-auto max-w-5xl px-6 pb-8">
        <div className="grid gap-px overflow-hidden rounded-2xl border border-line/60 bg-line/40 sm:grid-cols-2">
          {PILLARS.map((pillar) => (
            <article key={pillar.title} className="bg-surface p-6 sm:p-8">
              <h2 className="text-lg font-medium">{pillar.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-ink-muted">{pillar.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* --- the numbers --------------------------------------------------- */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="grid gap-8 sm:grid-cols-3">
          {FACTS.map((fact) => (
            <div key={fact.label}>
              <p className="font-mono text-3xl tabular-nums text-accent">{fact.value}</p>
              <p className="mt-1 text-sm font-medium">{fact.label}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">{fact.note}</p>
            </div>
          ))}
        </div>
        <p className="mt-8 max-w-2xl text-xs leading-relaxed text-ink-muted">
          Every one of those is measured rather than picked — which is why they
          are worth printing. A limit chosen by feel is a limit you find out about
          in front of other people.
        </p>
      </section>

      {/* --- how it fits together ------------------------------------------ */}
      <section className="border-y border-line/40 bg-surface/40">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="text-2xl font-semibold tracking-tight">How a game gets made</h2>
          <ol className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Lay the ground', 'Drag out a floor, run some walls, drop a ramp. Pieces snap to what is under the cursor rather than to a fixed height.'],
              ['Put things in it', 'Crates, targets, pickups. Anything with a name can be found by a rule or a script.'],
              ['Say what happens', 'When this is shot and its health hits zero: break it, score a point, leave the pieces behind.'],
              ['Play it together', 'Start a match on it. Everybody who joins is in the same room and can see each other.'],
            ].map(([title, body], index) => (
              <li key={title}>
                <p className="font-mono text-[11px] text-accent-2">0{index + 1}</p>
                <h3 className="mt-2 font-medium">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* --- the editor, and the date it is not ------------------------------
          Two captures of the running thing, and the sentence that has to sit
          under the first of them.

          The page above this is all claims about what the software does. The
          claims are true, but a page that only asserts is a page a stranger has
          to take on trust - and the two things hardest to take on trust here are
          exactly the two things a picture settles in a second: that there is a
          real editor rather than a JSON file, and that two people can be in the
          same level.

          The `Not open yet` is not a disclaimer bolted onto the caption. It is
          the reason the picture is allowed on the page at all: showing the
          editor without it would be selling a door that does not open, which is
          the one thing this page's own opening comment says it will not do.
      */}
      {/* No `bg-surface/40` band here, unlike the section above it: two tinted
          bands back to back are one tall tinted band with a two-pixel rule
          across the middle, and the page loses the beat it was using the tint
          to mark. */}
      <section>
        <div className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="text-2xl font-semibold tracking-tight">The editor, and where it is</h2>

          <figure className="mt-8">
            <div className="overflow-hidden rounded-2xl border border-line/60 bg-surface-raised/40">
              <Image
                src="/img/xp-editor.webp"
                alt="The xp editor: a blueprint list on the left, a 3D viewport with a wall and a barrel in the middle, a document panel of game modes below it, and a JavaScript file open in a script panel on the right"
                width={2200}
                height={1059}
                className="h-auto w-full"
                sizes="(max-width: 1080px) 100vw, 1024px"
              />
            </div>
            <figcaption className="mt-3 max-w-3xl font-mono text-[11px] leading-relaxed text-ink-muted">
              <strong className="font-medium text-ink">Not open to the public yet.</strong>{' '}
              Blueprints down the left, the level in the middle, the document under it — modes,
              packs, what the player is — and on the right a script one of the things in the level
              runs. Every panel here is a panel that exists; it is behind a gate while it is being
              built, and it opens on an <span className="text-ink">xp</span> space later. Ask if you
              would like to be shown it before then.
            </figcaption>
          </figure>

          <figure className="mt-12">
            <div className="overflow-hidden rounded-2xl border border-line/60 bg-surface-raised/40">
              <Image
                src="/img/xp-match.webp"
                alt="Two players standing on the green platforms of an xp parkour level called Sidestep, a clock running above them, and a panel below reading waiting to start with one of two ready"
                width={2200}
                height={1046}
                className="h-auto w-full"
                sizes="(max-width: 1080px) 100vw, 1024px"
              />
            </div>
            <figcaption className="mt-3 max-w-3xl font-mono text-[11px] leading-relaxed text-ink-muted">
              The player, which does work today. A level called Sidestep with two people standing in
              it — one of them a guest who arrived through a link — a clock over the top, and a
              panel counting who is ready. A match is a room, so there is no server to rent and
              nothing for either of them to install.
            </figcaption>
          </figure>
        </div>
      </section>

      {/* --- the honest part ----------------------------------------------- */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="text-2xl font-semibold tracking-tight">What it does not do yet</h2>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-muted">
          Said here rather than discovered later. A page that lists only what
          works is one nobody trusts the second time.
        </p>
        <ul className="mt-6 grid max-w-3xl gap-4 text-sm leading-relaxed text-ink-muted sm:grid-cols-2">
          {[
            'No score comes back out of a match yet — it is a room you play in rather than a game that finishes.',
            'Shots hit the level and the things in it, not other players. Nobody owns anything and nothing is reconciled.',
            'Collision is cell-shaped: a wall is solid where it looks solid to within half a metre.',
            'The art is one prototype kit. It is grey on purpose, and it is the only kit so far.',
          ].map((line) => (
            <li key={line} className="flex gap-3">
              <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-accent-2" />
              {line}
            </li>
          ))}
        </ul>
      </section>

      <footer className="border-t border-line/40">
        <div className="mx-auto max-w-5xl px-6 py-10">
          <p className="font-mono text-[11px] text-ink-muted">
            XP is in development. Ask if you would like to see it.
          </p>
        </div>
      </footer>
    </main>
  )
}
