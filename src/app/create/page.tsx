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
  Traits,
} from '@/app/components/marketing-shell'
import { resolveLook } from '@/app/components/look'

/**
 * The two ways to make something here.
 *
 * ---------------------------------------------------------------------------
 * Two tabs, and they are not a beginner mode and an advanced one
 * ---------------------------------------------------------------------------
 * xo builds the *room*: a voxel world you place standing inside it, with other
 * people standing inside it. xp builds the *game*: pieces with rules, scripts,
 * a match that finishes. They share a company and almost nothing else, and the
 * page is two tabs rather than two sections because a reader who wants one of
 * them is not skimming past the other on the way - they are picking.
 *
 * ---------------------------------------------------------------------------
 * The tab is a query key, not React state
 * ---------------------------------------------------------------------------
 * `?tab=xp` rather than a `useState`, which keeps the whole page a server
 * component with no client bundle - the same trick `/worlds` plays with its
 * filters, and for the same two payoffs. The second one is the one that
 * matters here: "the xp half of the create page" becomes a URL somebody can
 * paste into a chat, which is exactly what gets pasted when anyone asks what
 * xp is.
 *
 * Anything that is not `xp` is xo, deliberately - a typo'd tab lands on the
 * shipped half rather than on an error, and the shipped half is the honest
 * default for a stranger.
 */

export const metadata: Metadata = {
  title: 'Create — build the room, or build the game',
  description:
    'The room you are standing in is the editor: fifty-eight pieces, placed live, with everyone else still standing in it. And xp, a browser game creator where things break, count and finish.',
}

type Tab = 'xo' | 'xp'

/** The two tabs, as links. Order is shipped-first. */
const TABS: { id: Tab; label: string; note: string }[] = [
  { id: 'xo', label: 'xo', note: 'build the room' },
  { id: 'xp', label: 'xp', note: 'build the experience' },
]

/** The two modes a world is in, which is the whole permission system. */
const XO_MODES = [
  ['Creative', 'Blocks go down and come up. This is where a room gets built.'],
  [
    'Battle',
    'The world is frozen. Nobody’s floor disappears mid-match, because that is exactly what somebody losing would try.',
  ],
] as const

/** What an xo world is built out of. */
const XO_PARTS = [
  {
    mark: 'palette',
    title: 'Fifty-eight pieces',
    body: 'Walls, floors, slopes, stairs, plants, furniture, lights. Three groups, one palette, and it is the same palette in every world you own.',
  },
  {
    mark: 'football',
    title: 'Goalposts',
    body: 'Their own thing rather than a block, because a goal has to know it is a goal. Place two and the world is a pitch.',
  },
  {
    mark: 'rooms',
    title: 'Rooms',
    body: 'Open one, name it, cap it, list it or keep it off the list, set it creative or battle, and decide whether guests may build in it. Closing a room keeps everything in it — it just leaves the list.',
  },
  {
    mark: 'catalogue',
    title: 'The catalogue',
    body: 'Every world anybody published, filtered by twelve tags that are a fixed vocabulary rather than free text — so every filter has results in it and none of them are the same filter spelled two ways. Drop one into your space and it is yours to change.',
  },
  {
    mark: 'pieces',
    title: 'Save as arena',
    body: 'Any world you have built becomes a thing you can load into any world you own. Swapping the lounge for last month’s arena is one click, and the arena it came from is untouched.',
  },
] as const

/** The three studios. */
const STUDIOS = [
  ['Video', 'Walk the cast about, give them lines, move the camera, record it.'],
  ['Picture', 'One frame, staged and lit, as a still.'],
  ['Banner', 'The wide one, for the top of a page of the space.'],
] as const

const XP_PILLARS = [
  {
    mark: 'pieces',
    title: 'Build it out of packs',
    body: 'Eighty-six prototype models — walls, floors, slopes, stairs, crates, targets. Drag one in and it lands where you let go. Collision is worked out once, when the level opens, so a room of four thousand pieces costs the same to walk around as a room of four.',
  },
  {
    mark: 'rules',
    title: 'Give things rules',
    body: 'A crate that breaks, a pickup that refills you, a barrel that takes you with it. Rules are rows in a panel rather than code: four events, six comparisons, eight verbs. There is nothing you can write that fails while somebody is playing.',
  },
  {
    mark: 'script',
    title: 'Write a script when a rule won’t do',
    body: 'A platform that rises, a turret that tracks, a door that opens as you approach. JavaScript in a sandbox, three hooks, and no way to reach the network — so a level somebody else wrote is a level you can safely open.',
  },
  {
    mark: 'together',
    title: 'Play it with other people',
    body: 'A match is a room. Everybody who joins sees each other move, in the level you built, under the rules you gave it. Send a link and somebody outside your space walks in.',
  },
] as const

/**
 * The numbers, and where each one comes from.
 *
 * Measured rather than chosen, every one of them, which is the only reason they
 * are worth printing. `bun run xp:bench` produces the first two; the third is
 * the catalogue's own length.
 */
const XP_FACTS = [
  { value: '8,000', label: 'pieces in a level', note: 'a fifth of a second to load' },
  { value: '1,000', label: 'things with rules', note: 'the tighter limit — these cost per frame' },
  /* No `+` on this one: the pixel face draws one, but at a fifth of the figure's
   * size next to a numeral it reads as a full stop. The note carries it. */
  {
    value: '86',
    label: 'models to build with',
    note: 'and going upward. Measured, so a wall really is four metres.',
  },
] as const

const XO_NOT_YET = [
  'The world builder that draws a whole venue from a brief is admin-only. What you get is the in-world palette, which is the same blocks by hand.',
  'A world is one save. There are no versions and no undo beyond taking the block back off.',
  'Building is creative mode only. A world in battle mode is frozen, which is the point, but it does mean you cannot patch a floor mid-match.',
] as const

const XP_NOT_YET = [
  'No score comes back out of a match yet — it is a room you play in rather than a game that finishes.',
  'Shots hit the level and the things in it, not other players. Nobody owns anything and nothing is reconciled.',
  'Collision is cell-shaped: a wall is solid where it looks solid, to within half a metre.',
  'The art is one prototype kit. It is grey on purpose, and it is the only kit so far.',
] as const

export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; look?: string }>
}) {
  const { tab, look: rawLook } = await searchParams
  const active: Tab = tab === 'xp' ? 'xp' : 'xo'
  const { look, variant } = await resolveLook(rawLook)

  return (
    <MarketingShell active="create">
      <div className="bento doc" data-look={look} data-variant={variant ?? undefined}>
        <PageHero
          eyebrow="Create"
          mark="pieces"
          title="Build it while they’re standing in it"
          sub="There are two ways to make something here, and they are genuinely different things rather than a beginner mode and an advanced one. xo builds the room. xp builds the experience."
          hue={265}
          art="/xo/scenes/heap-create.webp"
        />

        {/* The switch. Two links, so the choice is in the URL and the page stays
            a server component - see the note at the top of this file. */}
        <nav className="col-span-6 flex justify-center gap-2" aria-label="What to build">
          {TABS.map((option) => {
            const current = option.id === active
            return (
              <Link
                key={option.id}
                /* The look rides along, or a visitor in the dusk arm who
                   switches tab is silently moved into the other arm - which
                   would put their clicks on the wrong side of the test. */
                href={`/create?${new URLSearchParams({
                  ...(option.id === 'xp' ? { tab: 'xp' } : {}),
                  ...(look === 'dusk' ? { look } : {}),
                })}`}
                aria-current={current ? 'page' : undefined}
                className={`flex items-baseline gap-2 rounded-full border px-5 py-2.5 text-sm transition ${
                  current
                    ? 'border-accent/60 bg-accent/10 text-ink'
                    : 'border-line bg-surface-raised/50 text-ink-muted hover:text-ink'
                }`}
              >
                <span className="font-mono font-medium">{option.label}</span>
                <span className="text-xs text-ink-muted">{option.note}</span>
              </Link>
            )
          })}
        </nav>

        {active === 'xo' ? <XoTab /> : <XpTab />}
      </div>
    </MarketingShell>
  )
}

function XoTab() {
  return (
    <>
      <section className="usecases col-span-6">
        <article className="usecase" style={{ '--box-hue': 200 } as React.CSSProperties}>
          <div className="usecase-art">
            <Image
              src="/xo/scenes/desk-duo.webp"
              alt="Three animals on a stone floor between two brick workstations with monitors on them"
              width={1500}
              height={1000}
              className="usecase-shot"
              sizes="(max-width: 900px) 100vw, 55vw"
            />
          </div>
          <div>
            <p className="usecase-kicker">xo</p>
            <h2 className="usecase-title">The editor is the room</h2>
            <p className="usecase-body text-sm">
              There is no build screen to go to and come back from. You are standing in the world,
              holding a block, with everybody else still standing in it — and what you place appears
              under their feet as you place it.
            </p>
          </div>
        </article>
      </section>

      <Band
        id="palette"
        kicker="The palette"
        mark="palette"
        title="What you build with"
        hue={265}
        index={0}
        peep={{ avatar: 'bee', angle: 'side' }}
      >
        <Traits items={XO_PARTS} />
      </Band>

      <Band
        id="modes"
        kicker="Modes"
        mark="modes"
        title="Creative builds it, battle freezes it"
        hue={285}
        index={1}
      >
        <p>
          A world is in one of two modes, and the mode is the whole permission system for building.
        </p>
        <Spec rows={XO_MODES} />
        <p>
          Flipping the switch is how you say “we’re done building, we’re playing now”. A room has
          its own switch, so one corner of a space can be building while another is fighting.
        </p>
      </Band>

      <Band
        id="match"
        kicker="Then play in it"
        mark="battles"
        title="A world you built is a stage you can fight on"
        hue={145}
        index={2}
        span="half"
      >
        <p>
          Set the goals down and start a football match, and the ball lands in the thing you made.
          Or run a tournament in it. Or publish it as a battlefield and let other spaces come and
          fight in it — yours stays exactly as you left it, because the match happens in a copy.
        </p>
        <p>
          <Link href="/play" className="text-accent transition hover:opacity-80">
            Everything there is to play →
          </Link>
        </p>
      </Band>

      <Band
        id="studio"
        kicker="Studio"
        mark="studio"
        title="Make a film of it and send that instead"
        hue={320}
        index={3}
        span="half"
      >
        <p>Three studios, off the same models the world uses.</p>
        <Spec rows={STUDIOS} />
        <p>
          The peeps in it are the peeps in your world, so a film you make of your space is a film of
          your actual space. Send it to whoever wasn’t there.
        </p>
      </Band>

      <NotYet items={XO_NOT_YET} hue={225} />

      <PageOutro
        title="Walk in and put a block down."
        hue={265}
        secondary={{ href: '/create?tab=xp', label: 'See xp instead' }}
      />
    </>
  )
}

function XpTab() {
  return (
    <>
      <section className="usecases col-span-6">
        {/* `usecase-square` because the xp shot is a 1:1 frame where the landing
            page's rows are 8:5 - at the band's own 1.25fr the square one stood a
            head taller than its own caption and the row read as a picture with a
            note beside it. */}
        <article
          className="usecase usecase-square"
          style={{ '--box-hue': 35 } as React.CSSProperties}
        >
          <div className="usecase-art">
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
              className="usecase-shot"
              sizes="(max-width: 900px) 100vw, 55vw"
            />
          </div>
          <div>
            <p className="usecase-kicker">xp</p>
            <h2 className="usecase-title">Build a game, not a level</h2>
            <p className="usecase-body text-sm">
              Most world builders give you somewhere to stand. This gives you somewhere to{' '}
              <em className="not-italic text-ink">play</em>: things that break, targets that count,
              a gun in your hand, and other people in the room with you. It runs in a browser, there
              is nothing to compile, and a game is one file — the file is the whole game.
            </p>
          </div>
        </article>
      </section>

      <Band
        id="pillars"
        kicker="What it does"
        mark="pieces"
        title="Pieces, rules, scripts, and other people"
        hue={35}
        index={0}
        peep={{ avatar: 'elephant', angle: 'three' }}
      >
        <Traits items={XP_PILLARS} />

        {/* The fourth trait above says "play it with other people", which is the
            one of the four a reader is most entitled to disbelieve. This is that
            sentence with two people in it. */}
        <Shot
          src="/img/xp-match.webp"
          alt="Two players standing on the green platforms of an xp parkour level called Sidestep, a clock running above them, and a panel below reading waiting to start with one of two ready"
          width={2200}
          height={1046}
          cutRight="3%"
          caption={
            <>
              A level called <span className="text-ink">Sidestep</span> with two people in it, one
              of them a guest who came through a link. Same level, same rules, and each of them can
              see the other move. A match is a room — there is no separate server to rent and
              nothing for either of them to install.
            </>
          }
        />
      </Band>

      <Band
        id="numbers"
        kicker="The numbers"
        mark="gauge"
        title="All measured, which is why they’re worth printing"
        hue={55}
        index={1}
      >
        <Figures items={XP_FACTS} />
        <p>
          Every one of those is measured rather than picked. A limit chosen by feel is a limit you
          find out about in front of other people.
        </p>
      </Band>

      <Band
        id="where"
        kicker="Where it is"
        mark="roadmap"
        title="The player ships today. The editor is soon, out loud."
        hue={285}
        index={2}
      >
        <p>
          An <span className="font-mono text-ink">xp</span> space is €15 a month and gets the XP
          player today, plus the ability to fight a match inside an XP. The editor, XP story and XP
          in VR are on the price card under <em>Soon</em> rather than in the feature list, because
          that is what they are.
        </p>

        {/* The editor exists and is not yours yet, and both halves of that
            sentence have to be in the same place. A picture without the caption
            is a promise; the caption without the picture is a roadmap line
            nobody believes. Together they are the honest version: here is the
            thing, here is the reason you cannot open it this afternoon. */}
        <Shot
          src="/img/xp-editor.webp"
          alt="The xp editor: a blueprint list on the left, a 3D viewport with a wall and a barrel in the middle, a document panel of game modes below it, and a JavaScript file open in a script panel on the right"
          width={2200}
          height={1059}
          caption={
            <>
              <strong className="text-ink">Not open yet.</strong> This is the editor as it stands
              today — blueprints down the left, the level in the middle, the document under it, and
              a script on the right that a thing in the level runs. It is behind a gate while it is
              being built, and it opens to everybody on an{' '}
              <span className="font-mono text-ink">xp</span> space later. Ask if you would like to
              be shown it before then.
            </>
          }
        />

        <p>
          The multiplayer half is behind a per-space flag while the beta runs. If you want it turned
          on, say so when you join and we’ll turn it on.
        </p>
      </Band>

      <NotYet items={XP_NOT_YET} hue={225} />

      <PageOutro
        title="Two people and a level is a game."
        hue={35}
        secondary={{ href: '/create', label: 'See xo instead' }}
      />
    </>
  )
}
