import type { Metadata } from 'next'
import Link from 'next/link'

import { C, Code, DocsShell, DocTitle, Em, Flow, K, P, Pairs, Section } from './shell'

/**
 * How to make an XP, for people who are not us.
 *
 * ---------------------------------------------------------------------------
 * The walkthrough, in front of the reference
 * ---------------------------------------------------------------------------
 * This page is the internal `docs/xp/editor-guide.md` retold for an external
 * reader: the whole journey once, at walking pace. The pages beside it in the
 * sidebar go deeper on each room - the window, the tools, the animator, the
 * rules and the script API - and they are inventories rather than journeys.
 * The overlap between this page and those is deliberate: a walkthrough that
 * says "see reference" at every step is a table of contents wearing a
 * walkthrough's clothes.
 *
 * What was left out: repo paths, test commands and the operator gate. A
 * public page that says "now edit a file in the repository" is documentation
 * for a product that does not exist; the home page says once, properly, that
 * the editor is not open yet.
 */

export const metadata: Metadata = {
  title: 'XP docs — how to make a game',
  description:
    'How an XP gets made: lay the world out of pieces, turn things into blueprints, give them rules, write a script when a rule will not do, and play it.',
}

const SECTIONS = [
  { id: 'what-an-xp-is', label: 'What an XP is' },
  { id: 'how-it-works', label: 'How it works' },
  { id: 'the-window', label: 'The window' },
  { id: 'tools', label: 'The tools' },
  { id: 'building', label: 'Building' },
  { id: 'two-kinds-of-thing', label: 'Two kinds of thing' },
  { id: 'rules', label: 'Rules' },
  { id: 'scripts', label: 'Scripts' },
  { id: 'physics', label: 'Physics' },
  { id: 'the-player', label: 'The player' },
  { id: 'the-document', label: 'Mode, marks, camera' },
  { id: 'trying-it', label: 'Trying it' },
  { id: 'gotchas', label: 'What will catch you' },
] as const

export default function XpDocsPage() {
  return (
    <DocsShell current="" sections={SECTIONS}>
      <DocTitle kicker="How to make a game">How to make an XP</DocTitle>
      <P>
        What to press, in the order you will want to press it: lay the world out of pieces, turn
        the things in it into blueprints, give the blueprints rules, write a script when a rule
        will not do, and play it. The{' '}
        <Link href="/create/xp/showcase" className="text-accent hover:underline">
          showcase
        </Link>{' '}
        walks real games built exactly this way, and the sidebar goes deeper on every room this
        page walks through.
      </P>

      <Section id="what-an-xp-is" title="What an XP is">
        <P>
          An XP is <Em>one document</Em>: the world, the things in it, their rules, their scripts,
          who the player is and what ends the game — all of it in one file the runtime reads. There
          is no build step and no server of yours behind it. Copy the file and you have copied the
          game; send a link and somebody is playing it.
        </P>
        <P>
          That is the fact everything else in this guide leans on. Every panel in the editor is a
          view of some part of that document, and nothing you can click produces a document the
          runtime would refuse — anything that would be refused is refused at the click instead,
          with the reason next to it.
        </P>
      </Section>

      <Section id="how-it-works" title="How it works">
        <Flow
          steps={[
            {
              title: 'One document',
              body: 'The world, the things, their rules and scripts, the player, what wins — one file is the whole game.',
            },
            {
              title: 'The editor edits it',
              body: 'Every panel is a view of one part of the file. Try plays a snapshot over the editor, solo and free.',
            },
            {
              title: 'The runtime plays it',
              body: 'The same component everywhere: the editor’s Try, the public link, a match.',
            },
            {
              title: 'A match is a room',
              body: 'Everybody who joins runs the same rules from the same inputs — no server of yours anywhere.',
            },
          ]}
        />
        <P>
          The last box explains most of the design decisions you will meet in these docs: because
          every client runs the same document from the same inputs, everything in it has to be{' '}
          <Em>deterministic</Em>. That is why scripts have <C>world.random()</C> instead of{' '}
          <C>Math.random</C>, why movement is computed from the shared clock rather than
          accumulated, and why a script&apos;s cut-off is counted in operations rather than
          milliseconds — two machines must always agree on what just happened.
        </P>
      </Section>

      <Section id="the-window" title="The window">
        <P>
          The editor is panels in a frame — drag them, split them, stack them into tabs. The layout
          saves itself and comes back. Everything is optional except the viewport, which is the
          work. The <Link href="/create/xp/docs/editor" className="text-accent hover:underline">window page</Link>{' '}
          takes each panel apart; the short version:
        </P>
        <Pairs
          rows={[
            ['Viewport', 'The level. Drag to draw, right-drag to pan.'],
            ['Scene', 'Things by name, architecture folded by model, the marks, the player.'],
            [
              'Models',
              <>
                The catalogue, searchable. Click to pick, <Em>drag to place</Em>.
              </>,
            ],
            ['Tools', 'What a drag does, the working height, the turn, and whether there is ground.'],
            ['Rules', "A blueprint's triggers, as rows."],
            ['Scripts', 'JavaScript, by name, and which blueprints run it.'],
            ['Document', 'The counts, the capabilities, and what the level would be refused for.'],
          ]}
        />
        <P>
          Keep <Em>Document</Em> open while you work. It is the only panel that tells you things
          you cannot see by looking — whether the claims and the marks line up, and what would stop
          the level opening if it were reloaded right now.
        </P>
      </Section>

      <Section id="tools" title="The tools">
        <Pairs
          rows={[
            [
              'Select',
              <>
                Click a thing to find out what it is. <Em>Never builds.</Em>
              </>,
            ],
            ['Place', 'One piece where you let go, then hands you back to Select.'],
            ['Draw', 'Paints while the button is down.'],
            ['Erase', 'Takes away what a drag crosses.'],
            ['Line', 'Two corners, a straight run.'],
            ['Fill', 'Two corners, filled.'],
            ['Room', 'Two corners, four walls and no ceiling.'],
          ]}
        />
        <P>
          Select is the default, because the first thing anybody does with a level they already
          have is click something to find out what it is. Place hands you back to Select{' '}
          <Em>holding the piece it just laid</Em> — the next thing you do after putting a crate
          somewhere is nudge it, turn it, or look at it, none of which Place can do. The keys, the
          working plane and the handles are on the{' '}
          <Link href="/create/xp/docs/tools" className="text-accent hover:underline">
            tools page
          </Link>
          .
        </P>
      </Section>

      <Section id="building" title="Building">
        <P>
          <Em>Lay a floor:</Em> pick a floor tile in Models, choose Fill, drag a rectangle. Height
          is the working level (<K>Q</K> and <K>W</K>) — <Em>except</Em> when the pointer is over
          something, in which case the piece goes on top of what you are pointing at. The slider
          answers for the empty parts of the world; the geometry answers everywhere else.
        </P>
        <P>
          <Em>Walls:</Em> a wall is four wide, four high, one deep. <K>R</K> turns it. Line runs
          one along an edge; Room gives you four from two corners.
        </P>
        <P>
          <Em>A door is a gap in a wall run.</Em> Collision is cell-shaped and a cell is a metre,
          so a 1.6-metre doorway straddles two cells, fills neither, and rasterises solid. Leave a
          piece out instead.
        </P>
        <P>
          <Em>Put one thing somewhere exact:</Em> drag it out of Models into the viewport. It lands
          where you let go — on a floor, against a wall, or on the working plane — already selected,
          with the handles on it. Placements are not on a grid: a crate can sit at 2.3, a wall can
          stand at an angle. What stays cell-shaped is collision, so a wall at 2.5 is solid where
          it looks solid to within half a metre.
        </P>
      </Section>

      <Section id="two-kinds-of-thing" title="Two kinds of thing">
        <P>
          A <Em>placement</Em> is architecture: walls, floors, stairs. It rasterises into cells
          once, when the level opens, and never moves. It has no name, no properties, no rules —
          which is why a room of four thousand pieces costs the same to walk around as a room of
          four.
        </P>
        <P>
          An <Em>entity</Em> is a thing: a crate, a pickup, a target, a door. It has its own
          collision box exactly where the model is, it can hold properties, it can have rules, and
          it can stop existing. Entities come from <Em>blueprints</Em> — a kind of thing, named,
          with a model and optional properties and rules. Every crate made from the <C>crate</C>{' '}
          blueprint gets the same rules, which is what makes forty of them one edit.
        </P>
        <P>
          Rule of thumb: if it needs a name or a rule, it is an entity. If a placed piece turns out
          to need behaviour, select it and press <Em>make it a blueprint</Em> — it becomes an
          entity in its place, and the placement is consumed rather than left behind.
        </P>
      </Section>

      <Section id="rules" title="Rules">
        <P>
          A rule is three things: <Em>on</Em> (the event), an optional <Em>when</Em> (one property
          against one number), and <Em>do</Em> (a list of verbs). The vocabulary is closed — that
          is why it fits on a panel rather than needing a language, and why there is nothing you
          can write that fails while somebody is playing. The whole vocabulary is on the{' '}
          <Link href="/create/xp/docs/rules" className="text-accent hover:underline">
            rules page
          </Link>
          ; the recipe that teaches the shape of every rule is a crate that breaks:
        </P>
        <P>
          Give the blueprint an <C>hp</C> property, add a rule on <C>damaged</C> when{' '}
          <C>hp &lt;= 0</C>, and make the verbs <C>spawn</C> (the pieces left behind), <C>score</C>,
          then <C>despawn</C>. Order matters: anything after <C>despawn</C> is writing to a corpse,
          so the rule stops there.
        </P>
        <P>
          <Em>One thing telling another</Em> is <C>emit</C> and <C>emitted</C>: a bell that emits{' '}
          <C>&quot;ring&quot;</C> when pressed, a gate that listens for it and opens, lights that
          listen for the same name and come on. Every listener hears it — the bell does not name
          the gate, so a third thing that reacts is a new rule and no edit to the bell.
        </P>
      </Section>

      <Section id="scripts" title="Scripts">
        <P>
          For behaviour a rule cannot express: JavaScript, in a sandbox, with three hooks —{' '}
          <C>onSpawn</C>, <C>onTick(dt)</C> and <C>onTrigger(event, other)</C>. In scope:{' '}
          <C>self</C>, <C>world</C>, <C>getEntityByName</C> and <C>log</C>. Nothing else is — no{' '}
          <C>fetch</C>, no <C>Date</C>, no <C>Math.random</C> — so a level somebody else wrote is a
          level you can open. The{' '}
          <Link href="/create/xp/docs/scripts" className="text-accent hover:underline">
            script API page
          </Link>{' '}
          lists everything a script can reach.
        </P>
        <P>
          The platform that makes a level three-dimensional is four lines, and the shape of it is
          worth learning once: position is a function of the world clock rather than an
          accumulator, so two browsers that have been running for different lengths of time still
          draw it in the same place.
        </P>
        <Code>{`function onTick(dt) {
  self.y = 3 + Math.sin(world.time * 0.8) * 2
}`}</Code>
        <P>
          <Em>When to reach for one:</Em> anything that is &quot;when X happens, do Y&quot; is a
          rule — it fires immediately and shows as rows a panel can explain. A script is for
          computing a position, a distance, an angle, a cadence — or remembering something between
          frames. Properties are the memory: <C>self.set(&apos;toB&apos;, 1)</C> is visible in the
          inspector and saves with the document; a module-level variable would be neither.
        </P>
      </Section>

      <Section id="physics" title="Physics">
        <P>
          Every thing answers two opposite questions, and the controls sit together because the
          questions do. <Em>Collides as</Em> is: does this stop other things. <Em>Physics</Em> is:
          does this get stopped. On, the thing becomes a body — it falls, lands, bounces off
          walls, and walking into it pushes it, with no rule and no script anywhere. All four
          combinations are useful: a coin you walk straight through that still falls to the floor
          is walk-through with physics on.
        </P>
        <P>
          <Em>A push is not a hit</Em>, and the difference is most of how this feels. Walking into
          something moves it along in front of you at your pace and it stops when you stop —
          nothing is stored, so a touch cannot send it across the level. To make it roll on by
          itself you have to hit it: a dash, or a kick from a script.
        </P>
        <Pairs
          rows={[
            [
              <C key="g">gravity</C>,
              'A multiple of the world’s. 0 floats where you leave it; below zero rises, which is a balloon.',
            ],
            [<C key="b">bounce</C>, 'How much speed comes back off a surface. 0 stops dead.'],
            [<C key="m">mass</C>, 'Divides every push. 1 is a football; 20 barely notices you.'],
            [
              <C key="f">friction</C>,
              'How fast a roll dies on the ground. The one you will actually reach for.',
            ],
            [<C key="d">drag</C>, 'The same, in the air.'],
            [
              <C key="r">roll</C>,
              'Degrees it turns per cell travelled, so a ball does not look like it is skating.',
            ],
          ]}
        />
      </Section>

      <Section id="the-player" title="The player">
        <P>
          Absent means the built-in dummy, and that is the common case — most levels want a person
          in them, not a paragraph about what a person is. Set a <Em>body</Em> to be something
          else: a kart, a bird, a tank. What somebody is <Em>holding</Em> is a blueprint on a
          socket, and what makes it a weapon is its properties — <C>damage</C> and <C>range</C>,
          read when the trigger is pulled. A blueprint with neither is just something you are
          carrying.
        </P>
        <P>
          Give the body an <C>ammo</C> property and rounds are counted; leave it off and they are
          not. Ammo lives on the player rather than the gun, because an ammo box hands it to
          whoever walked in. Spawns and goals, the peep body, the level&apos;s own keys and a
          worked gun are on{' '}
          <Link href="/create/xp/docs/player" className="text-accent hover:underline">
            the player page
          </Link>
          .
        </P>
      </Section>

      <Section id="the-document" title="Mode, marks, camera">
        <P>
          Three things are true of the level rather than of whatever is selected. <Em>Mode</Em> is
          the preset — freestyle, deathmatch, football, parkour, shooter — plus what ends it. A
          preset the world cannot back up is greyed out with the reason beside it: football needs
          a goal at each end, parkour a start and a finish. <Em>Sides</Em> is who is against whom,
          a separate question — a deathmatch can be every player for themselves or two sides of
          four.
        </P>
        <P>
          <Em>Marks</Em> are the facts about a level: where a side spawns, where red scores, where
          a run starts and finishes. They matter more than they look, because the document&apos;s
          claims are checked against them — a level saying &quot;match&quot; with fewer than two
          spawns is refused on load, by name. So a level can be perfect and still refuse to open,
          and the Document panel is where it tells you why.
        </P>
        <P>
          <Em>Camera</Em> is where the world is watched from, and it is an input mode as much as a
          view — keys are read against wherever the camera calls forward. Follow is behind the
          body; side-on is a platformer; fixed is nailed to one spot, and left without angles it
          watches the player.
        </P>
      </Section>

      <Section id="trying-it" title="Trying it">
        <P>
          <Em>Play</Em> takes a snapshot and opens it over the editor — no save, no session, no
          room. It is the one screen where looking at the thing costs nothing, and there is a
          phone-shaped toggle for how it feels under a thumb.
        </P>
        <P>
          The <Em>Log</Em> keeps everything the level said this run: a pickup collected, a
          script&apos;s <C>log</C>, a rule that refused. It collects whether or not the panel is
          open, so opening it shows what already happened rather than starting from the moment you
          wondered. A turret that quietly does nothing is the failure it exists to prevent.
        </P>
      </Section>

      <Section id="gotchas" title="Things that will catch you">
        <Pairs
          rows={[
            [
              'A flush target is unhittable',
              'Architecture rasterises into the cells it mostly covers, so a target mounted flat against its own stand is swallowed by the stand’s cells — every shot lands on the post. Give it clearance.',
            ],
            [
              'A door is a gap',
              'The same cell approximation from the other side: a modelled doorway rasterises shut. Leave a piece out of the wall run.',
            ],
            [
              'Distinct models are the cost',
              'The renderer pays per distinct model, not per piece — four thousand walls of one kind are cheaper than forty of a hundred kinds. The Scene panel warns past a dozen.',
            ],
            [
              'Unnamed means unaddressable',
              'A rule or a script can only find an entity by name. The Document panel counts the nameless.',
            ],
            [
              'A buried body never moves',
              'A body standing inside something cannot move at all, and nothing says why. Its footprint is around its middle — if its bottom is under the floor, move it up, not down.',
            ],
          ]}
        />
        <P>
          Stuck on something this page does not answer? The{' '}
          <Link href="/create/xp/showcase" className="text-accent hover:underline">
            showcase
          </Link>{' '}
          takes real games apart rule by rule — the shooter is the place to start.
        </P>
      </Section>
    </DocsShell>
  )
}
