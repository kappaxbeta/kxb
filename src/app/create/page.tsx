import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import {
  Band,
  Figures,
  MarketingShell,
  NotYet,
  PageHero,
  BandScene,
  PageOutro,
  Rack,
  Shot,
  Spec,
  Traits,
} from '@/app/components/marketing-shell'
import { resolveLook } from '@/app/components/look'
import { MAX_BLUEPRINT_ACTIONS, MAX_BLUEPRINTS_PER_TENANT } from '@/domain/thingiverse/blueprint'
import { MAX_STATES } from '@/domain/thingiverse/states'

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
    'The room you are standing in is the editor: fifty-eight pieces, placed live, with everyone else still standing in it. Summon things out of 5,770 models, give them rules, states and recipes, pose your own animations. And xp, a browser game creator where things break, count and finish — or a p5.js sketch people can stand inside.',
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

/**
 * Twelve of the things a space can summon, as the renders the catalogue already
 * carries.
 *
 * Chosen for range rather than for looks: a fountain that does not fall, a
 * bench that seats three, a burger that is cooked out of four other things, a
 * crate that can be broken, a target that comes back, a kart that drives. Every
 * claim the section makes has a tile under it.
 */
const THINGS = [
  { src: '/thumbs/builder/park/fountain.webp', label: 'Fountain' },
  { src: '/thumbs/builder/park/bench.webp', label: 'Bench' },
  { src: '/thumbs/builder/cafe/coffee_machine.webp', label: 'Machine' },
  { src: '/thumbs/builder/restaurant/food_burger.webp', label: 'Burger' },
  { src: '/thumbs/builder/bakerygoods/cake_chocolate.webp', label: 'Cake' },
  { src: '/thumbs/builder/cafe/cash_register.webp', label: 'Till' },
  { src: '/xp/thumbs/resources/Containers_Crate_Large.webp', label: 'Crate' },
  { src: '/xp/thumbs/proto/Barrel_A.webp', label: 'Barrel' },
  { src: '/xp/thumbs/proto/target.webp', label: 'Target' },
  { src: '/xp/thumbs/resources/Gems_Chest.webp', label: 'Chest' },
  { src: '/xp/thumbs/resources/Food_Crate_Large_Apples.webp', label: 'Apples' },
  { src: '/xp/thumbs/cars/kart-oobi.webp', label: 'Kart' },
] as const

/**
 * When something happens to a thing. The four in `ThingAction`, and the
 * shortness is the design rather than the roadmap.
 */
const WHENS = [
  ['Touch', 'Somebody walked into it.'],
  ['Near', 'Somebody is standing close to it.'],
  ['Use', 'Somebody pressed E on it.'],
  ['Always', 'It does this on its own, forever.'],
] as const

/** What a blueprint is, in the four sentences that matter. */
const THING_PARTS = [
  {
    mark: 'thing',
    title: 'A kind of thing, and then things',
    body: 'Every ball falls the same way, so how it falls is a fact about balls — and where this one is is a fact about it. You author the first and summon as many of the second as the room can hold.',
  },
  {
    mark: 'rules',
    title: 'Four whens, eight deeds',
    body: 'Play a clip, spin, bob, vanish, say something, become something else, swing, shoot. Rows in a rail panel while you stand next to the thing, not code — every word in the list is one you can check by looking at it.',
  },
  {
    mark: 'clip',
    title: 'A timeline when one thing is not enough',
    body: 'The lid opens, waits and shuts. The sign flashes twice. A cue names a moment and a verb, and it can name the part it happens to — so a market stall spins its sign rather than spinning the stall.',
  },
  {
    mark: 'catalogue',
    title: 'Five thousand seven hundred and seventy models',
    body: 'Both catalogues at once: the eleven packs a world is built from and the forty a level is. A space should not be able to put a bench in its lounge and not a treasure chest.',
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

/**
 * What a p5 sketch gets that a level does not, and what it gives up for it.
 *
 * Every one of these is a fact about `src/app/xp/_sketch` rather than a claim
 * about p5: the containment is `srcdoc.ts`, the `xp` object is `sdk.ts`, and
 * the evaluation order is pinned by a test in `sketch.test.ts`.
 */
const SKETCH_PARTS = [
  {
    mark: 'script',
    title: 'Real JavaScript, and a real canvas',
    body: 'setup() and draw(), the way p5 has always been. A DOM, requestAnimationFrame, WebGL — everything the rules engine deliberately does not have, which is exactly when you want this instead of that.',
  },
  {
    mark: 'together',
    title: 'Multiplayer, and no netcode',
    body: 'Write xp.avatar.x in your draw loop and everybody else sees you move, smoothed, without a line of networking. xp.players is who is in the room. xp.input is one movement axis whether they are on arrows, on WASD, or on a thumbstick drawn over a phone.',
  },
  {
    mark: 'owner',
    title: 'It runs in a box with the door shut',
    body: 'An opaque-origin frame: our cookies are not its cookies, our storage is not its storage, and the only way through the wall is one message channel. Nothing loads that we did not serve, and there is no route to the network at all — so a sketch somebody else wrote is one you can open.',
  },
  {
    mark: 'pieces',
    title: 'Files, and the entry runs last',
    body: 'Split it up as you would anywhere else. Each file is evaluated on its own, in the order you wrote them, so a syntax error in one does not take its neighbours down with it.',
  },
] as const

const XO_NOT_YET = [
  'The world builder that draws a whole venue from a brief is admin-only. What you get is the in-world palette, which is the same blocks by hand.',
  'A world is one save. There are no versions and no undo beyond taking the block back off.',
  'Building is creative mode only. A world in battle mode is frozen, which is the point, but it does mean you cannot patch a floor mid-match.',
  `A thing knows ${MAX_BLUEPRINT_ACTIONS} things it can be told to do and no more. There is no scripting in a room, and there is deliberately not going to be — a level has an editor and a rules engine behind it, and a lounge has a rail panel and somebody standing up.`,
  'A recipe asks for an item by the word on its label, so two blueprints both called “patty” are a coin toss, and a recipe naming something nobody has drawn yet quietly never fires.',
  'Posing is one skeleton. Every animal and every skin shares it, which is what makes a clip portable — and it is also why you cannot animate the fountain.',
] as const

const XP_NOT_YET = [
  'No score comes back out of a match yet — it is a room you play in rather than a game that finishes.',
  'A p5.js sketch cannot reach the network at all. That is the containment doing its job, and it does mean a sketch cannot fetch anything of its own.',
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
    <MarketingShell>
      {/* No `active` here any more. The nav lost these three pills upstream — the
          pages they marked moved into a section this repository does not carry —
          so the prop narrowed to the one value left. This page is still real and
          still wears the shell; it simply has nothing in the header to light up,
          which is the honest state rather than a marker pointing at nothing. */}
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

      {/* Straight after the palette, because the palette raises the question
          this answers. Fifty-eight blocks builds you a room and then stops: a
          reader who has just been told they can lay a floor is one sentence
          away from asking what goes on it. */}
      <Band
        id="things"
        kicker="The thingiverse"
        mark="thing"
        title="And then summon something to put on it"
        hue={200}
        index={1}
      >
        <p>
          A block has no identity — cell (3, 0, 7) is dirt, and that is all there is to know about
          it. It cannot fall, it cannot be yours, and it cannot be a fountain. So there is a second
          way to put something in a room: type a word into the chat box, and the thing appears in
          front of you.
        </p>

        {/* Somebody doing it, then everything they could have done it with.
            The render first because it answers "what does this look like" in
            one glance and the rack answers "what is in it" in twelve - and a
            reader who is not sold by the first will not count the second. */}
        <BandScene
          src="/xo/scenes/summon.webp"
          alt="A fox wearing a dinosaur costume standing in a ring of green light, with a crate, two animal heads and a block of hay turning in the air around it"
          width={1280}
          height={720}
        />

        <Rack label="Things a space can summon" items={THINGS} />

        <Traits items={THING_PARTS} />

        <p>
          <strong>Four things can happen to a thing</strong>, and the list is short because a room
          is not a level: nobody is scripting it, and whoever is setting this has a rail panel open
          and is standing next to the object.
        </p>

        <Spec rows={WHENS} />

        <p>
          A space keeps up to {MAX_BLUEPRINTS_PER_TENANT} of its own, and typing{' '}
          <span className="font-mono text-ink">/thingiverse ball</span> reaches yours before it
          reaches the packs — because if somebody here has already decided what a ball is, that is
          what the word means.
        </p>
      </Band>

      <Band
        id="modes"
        kicker="Modes"
        mark="modes"
        title="Creative builds it, battle freezes it"
        hue={285}
        index={2}
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
        id="machine"
        kicker="States"
        mark="machine"
        title="A burger goes on raw and comes off cooked"
        hue={40}
        index={3}
        span="half"
      >
        <p>
          Cooked is not a pose the raw burger is holding. It is a different model, it lasts, and
          nothing about the room puts it back — so a thing gets up to {MAX_STATES} named states and
          a set of changes between them. A crate that has been broken open stays broken. A target
          that has been shot is gone for eight seconds and then is a whole target again.
        </p>
        <p>
          <strong>The recipe lives on the table, not in a book.</strong> A cutting board makes a
          salad, a pan makes a patty, and a grill makes neither — putting the recipes on the object
          is what makes the object worth walking to, and it is also what makes a recipe reviewable:
          it is right there in the panel of the thing it belongs to.
        </p>
        <p>
          And in a room set to battle, a thing has health. A crate you cannot break in a world built
          for a fight is not restraint, it is a hole.
        </p>
      </Band>

      <Band
        id="clips"
        kicker="Animation"
        mark="clip"
        title="Pose it yourself, then hang it on something"
        hue={320}
        index={3}
        span="half"
      >
        <p>
          Drag a hand and the arm follows it. A key is not a curve on one bone, it is the whole
          pose — which is what makes an animation something you can author standing up in twenty
          minutes rather than something you open a second application for.
        </p>
        <p>
          You pose the body somebody actually wears rather than a grey mannequin. Every skin shares
          the dummy&rsquo;s skeleton exactly, down to the name of the slot a hand holds things in,
          so an arm that cleared the body while you were posing still clears it on the knight.
        </p>
        <p>
          Save it to the shelf and a blueprint can name it. Now the thing you built has an animation
          nobody else has.
        </p>
      </Band>

      <Band
        id="match"
        kicker="Then play in it"
        mark="battles"
        title="A world you built is a stage you can fight on"
        hue={145}
        index={4}
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
        hue={265}
        index={4}
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

      {/* After the pillars and before the numbers, because it is the answer to
          the question the pillars raise: those four describe a level made of
          pieces and rules, and the obvious next thought is "and if I would
          rather just write it". */}
      <Band
        id="sketch"
        kicker="p5.js"
        mark="script"
        title="Or skip all of that and write a sketch"
        hue={195}
        index={1}
      >
        <p>
          A third kind of cartridge, beside the level and the world. Not pieces and not
          rules — a <span className="font-mono text-ink">p5.js</span> sketch, source and all, kept
          in the document itself. You write it in the browser, press{' '}
          <strong>Run</strong>, and it is running.
        </p>

        <Traits items={SKETCH_PARTS} />

        {/* The editor, and the reason it is here rather than only described:
            every claim in the paragraph under it is a control visible in the
            picture. A caption can say a sketch can be scheduled as a match; a
            capture with the checkbox in it lets somebody check. */}
        <Shot
          src="/img/p5-editor.webp"
          alt="The sketch editor: a file list with main.js as the entry, a blurb field, a key named KeyE mapped to boost, checkboxes for where the sketch can be played, the code in the middle, the sketch running live on the right, and a console under it"
          width={2200}
          height={1058}
          caption={
            <>
              Files down the left with one of them marked{' '}
              <span className="font-mono text-ink">ENTRY</span>, the code in the middle, and the
              sketch running beside it as you type. Under the files are the two decisions that are
              not code: which keys it wants — those become buttons on a phone — and whether it can{' '}
              <span className="text-ink">stand as a room</span> people walk into, or{' '}
              <span className="text-ink">be scheduled as a match</span>.
            </>
          }
        />

        <Shot
          src="/img/p5-phone.webp"
          alt="The sketch editor on a phone: a project called Game of Life with Run, Export and Save at the top, Files, Code and Play as tabs, a running grid of black and white cells filling the screen, and a console panel underneath"
          width={1006}
          height={1416}
          phone
          caption={
            <>
              The same editor in a hand. Files, the code and the thing itself become three tabs
              rather than three panes, and <span className="text-ink">Run</span> is where it is on
              the desktop.
            </>
          }
        />

        <p>
          And it is not a toy corner of the product. A sketch that can stand as a room is a place on
          the shelf people walk into and leave, with a guest link into it like anywhere else — and
          one scheduled as a match gets a clock and a score limit your sketch reads back out of{' '}
          <span className="font-mono text-ink">xp.match</span>.
        </p>

        {/* The payoff, and the one picture that could not be argued with: two
            people standing inside a sketch somebody wrote this afternoon. */}
        <Shot
          src="/img/p5-room.webp"
          alt="A p5.js sketch called Blob standing as a room: two green blobs with player names over them in the middle, the space’s own rails either side, and a panel of guest links into this sketch on the right"
          width={2200}
          height={1056}
          caption={
            <>
              The same kind of document, standing as a room. Two people are in this one, each
              drawn by the sketch’s own <span className="font-mono text-ink">draw()</span> and
              moved by whoever is at the other keyboard — and the rail on the right is making a
              door into it for somebody with no account. It is on the shelf beside the levels,
              under <span className="font-mono text-ink">xp5js</span>, because as far as a space is
              concerned it is one more thing you can walk into.
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
        index={2}
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
        index={3}
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
