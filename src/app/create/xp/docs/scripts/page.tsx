import type { Metadata } from 'next'
import Link from 'next/link'

import {
  AnnotatedFigure,
  C,
  Code,
  DocsShell,
  DocTitle,
  Em,
  Grid,
  P,
  Pairs,
  Section,
} from '../shell'

/**
 * The script API, all of it.
 *
 * Written from the internal inventory whose every code block is run by a
 * test against the same interpreter a browser runs - which is the only
 * reason a public API page can afford to be this specific. If this page and
 * the engine disagree, the engine and its tests are right and this page is
 * stale.
 */

export const metadata: Metadata = {
  title: 'XP docs — the script API',
  description:
    'Everything a script in an XP can reach: the three hooks, the entity API on self, the world clock and dice, emit and score, the sandbox limits, and the recipes.',
}

const SECTIONS = [
  { id: 'what', label: 'What a script is' },
  { id: 'hooks', label: 'The three hooks' },
  { id: 'events', label: 'What onTrigger hears' },
  { id: 'self', label: 'self — the entity' },
  { id: 'world', label: 'world — clock, dice, data' },
  { id: 'removed', label: 'What was taken away' },
  { id: 'errors', label: 'When one goes wrong' },
  { id: 'limits', label: 'Limits and cost' },
  { id: 'cannot', label: 'What a script cannot do' },
] as const

export default function ScriptsPage() {
  return (
    <DocsShell current="scripts" sections={SECTIONS}>
      <DocTitle kicker="Reference">The script API</DocTitle>
      <P>
        JavaScript in a sandboxed interpreter, with a genuinely closed scope: <C>self</C>,{' '}
        <C>world</C>, <C>getEntityByName</C> and <C>log</C> are in it, and nothing else is. The
        dividing line against{' '}
        <Link href="/create/xp/docs/rules" className="text-accent hover:underline">
          rules
        </Link>{' '}
        is one sentence: verbs for what happens, scripts for what a thing <Em>knows</Em> — a
        position that depends on last frame&apos;s, a count, a distance, a cadence.
      </P>

      <Section id="what" title="What a script is">
        <AnnotatedFigure
          src="/img/docs/xp/editor-scripts.webp"
          alt="The Scripts panel open beside the shooter's viewport, listing the rail, mine and dust scripts with how many blueprints run each"
          width={2400}
          height={1350}
          caption="The shooter's Scripts panel: three scripts behind fifty-seven things."
          markers={[
            {
              x: 91,
              y: 18,
              label:
                'The document’s scripts, each with how many blueprints run it. Opening one gets an editor with autocomplete, live compile checks, and a one-second dry run.',
            },
            {
              x: 91,
              y: 33,
              label:
                'The panel’s own dividing line: triggers and verbs stay the better answer for anything that fits them — they read as three rows rather than thirty lines.',
            },
          ]}
        />
        <P>
          The source lives in the document — an XP is one file, and a level whose behaviour is in
          four other files arrives half missing. Each source is capped at 64&nbsp;kB, and{' '}
          <Em>each entity gets its own run of its script</Em>: two turrets sharing{' '}
          <C>patrol</C> each get their own variables, because a script is compiled as a factory,
          not evaluated as a module.
        </P>
        <P>
          A script attaches to a blueprint — or to the level itself, as a <Em>director</Em>: no
          body, <C>self</C> is a handle onto nothing, and everything goes through <C>world</C> and{' '}
          <C>getEntityByName</C>. The director gets <C>onSpawn</C> and <C>onTick</C>, never{' '}
          <C>onTrigger</C>.
        </P>
      </Section>

      <Section id="hooks" title="The three hooks">
        <Pairs
          rows={[
            [
              <C key="1">onSpawn()</C>,
              'Once, when the thing comes into being — placed by the document, spawned by a rule, or spawned by another script.',
            ],
            [
              <C key="2">onTick(dt)</C>,
              <>
                Every frame; <C>dt</C> is seconds, capped at 0.05. A script with no{' '}
                <C>onTick</C> costs nothing per frame.
              </>,
            ],
            [
              <C key="3">onTrigger(event, other)</C>,
              'Something happened to it — the events below. Runs after the entity’s own verbs, so a property read sees what the rules just did.',
            ],
          ]}
        />
        <P>
          All three are optional. Within a frame: new entities get their <C>onSpawn</C>, then
          every <C>onTick</C> runs, then what the scripts set off among themselves is delivered — a
          thing spawned this frame gets its <C>onSpawn</C> this frame and its first tick the next.
        </P>
      </Section>

      <Section id="events" title="What onTrigger hears">
        <Grid
          head={['Event', 'other is', 'Fires when']}
          rows={[
            [<C key="1">enter</C>, 'whoever walked in', 'a body starts overlapping this entity'],
            [<C key="2">exit</C>, 'whoever walked out', 'it stops overlapping'],
            [<C key="3">collide</C>, 'whoever hit it', 'a collision, as opposed to an overlap'],
            [<C key="4">held</C>, 'the holder', 'it goes into anybody’s hands'],
            [<C key="5">dropped</C>, <C key="5b">null</C>, 'it is put down, however'],
            [
              <C key="6">damaged</C>,
              <C key="6b">null</C>,
              'only when a script dealt the damage, same frame',
            ],
          ]}
        />
        <P>
          Two things decide whether a script hears anything at all. A blueprint only receives{' '}
          <C>enter</C>/<C>exit</C> if it carries at least one trigger — a bare listener is
          conventionally a harmless <C>emit</C>. And the rest of the vocabulary —{' '}
          <C>pressed</C>, <C>finished</C>, <C>returned</C>, <C>emitted</C> — fires{' '}
          <Em>rules, never scripts</Em>: a script that must react to the whistle watches a
          property a rule wrote.
        </P>
      </Section>

      <Section id="self" title="self — the entity">
        <Pairs
          rows={[
            [
              <C key="1">.x .y .z .rotation .scale</C>,
              'Read and write. Reading gives world coordinates; writing moves it locally — the one asymmetry, and it only shows on something with a parent.',
            ],
            [<C key="2">.moveTo(x,y,z) / .moveBy(dx,dy,dz)</C>, 'One crossing instead of three.'],
            [<C key="3">.alive</C>, 'Whether it still exists.'],
            [<C key="4">.held</C>, 'Read-only: in anybody’s hands, ours or a peer’s.'],
            [
              <C key="5">.get(k) / .set(k,v) / .add(k,v)</C>,
              'Properties. Numbers only; a missing one reads as zero.',
            ],
            [
              <C key="6">.damage(n) / .heal(n)</C>,
              <>
                <C>damage</C> runs the entity&apos;s own <C>damaged</C> rules and its{' '}
                <C>onTrigger</C>; <C>heal</C> is <C>add(&apos;hp&apos;, n)</C> and wakes nothing.
              </>,
            ],
            [
              <C key="7">.spawn(blueprint, dx, dy, dz)</C>,
              'Relative to this entity. Gives back the new entity, or null.',
            ],
            [<C key="8">.despawn()</C>, 'Finally.'],
            [
              <C key="9">.score(n) / .emit(event)</C>,
              'Effects — the host decides what they mean. score credits the entity you called it on.',
            ],
            [
              <C key="10">.distanceTo(o) / .flatDistanceTo(o)</C>,
              'Flat ignores height, which is what “how close” means in a level with stairs.',
            ],
            [
              <C key="11">.push(x,y,z) / .speed / .dx .dy .dz</C>,
              'For bodies: hit it, ask how fast it is going, steer or stop it.',
            ],
            [
              <C key="12">.runAnimation(clip, loop?, parts?)</C>,
              <>
                Plays a document clip; <C>parts</C> like <C>[&apos;arms&apos;]</C> lays it over
                what the body is doing. <C>runAnimation(null)</C> clears it.
              </>,
            ],
            [
              <C key="13">.intensity .range .colour .angle</C>,
              'Lamps only — writable on a blueprint the document gave a light block, clamped rather than refused. On anything else, writes do nothing.',
            ],
          ]}
        />
      </Section>

      <Section id="world" title="world — the clock, the dice, the data">
        <Pairs
          rows={[
            [<C key="1">world.tick / world.time</C>, 'Frames since the start, and seconds — the number every client agrees about, which makes it the only correct basis for movement and cooldowns.'],
            [
              <C key="2">world.random() / roll(n) / randomInt(a,b) / pick(list)</C>,
              'Deterministic chance from the room’s seed — every client rolls the same. randomInt is inclusive at both ends; pick of an empty list is undefined, not a crash.',
            ],
            [
              <C key="3">world.get(k) / set / add</C>,
              'The level’s declared data. An undeclared field does not stick — get reads 0, set says so in the log.',
            ],
            [
              <C key="4">world.spend(k, n)</C>,
              'Take some if there is some, and answer whether there was. One call, so checking and taking cannot come apart.',
            ],
            [<C key="5">log(...)</C>, 'To the host’s log panel, capped at 200 lines. Not a console.'],
          ]}
        />
        <P>
          One gap worth knowing before it costs you an evening: the level&apos;s data is{' '}
          <Em>not reachable from <C>onTrigger</C></Em> — reads answer 0 and writes do nothing,
          silently. The pattern round it is a flag: the hook sets a variable, and <C>onTick</C>{' '}
          does the spending.
        </P>
        <Code>{`let asked = false

function onTrigger(event) {
  if (event === 'enter') asked = true
}

function onTick() {
  if (!asked) return
  asked = false
  if (world.spend('coins', 5)) self.spawn('prize', 0, 1, 0)
  else log('not enough coins')
}`}</Code>
      </Section>

      <Section id="removed" title="What was taken away">
        <P>
          A fresh sandbox simply is the language: no <C>fetch</C>, no <C>setTimeout</C>, no{' '}
          <C>window</C>. Two more are removed <Em>deliberately</Em>, because two clients run the
          same script over the same entities and have to agree: <C>Date</C> is deleted — a clock is
          per machine — and <C>Math.random</C> <Em>throws</Em>, with a message naming the
          replacement, rather than disappearing. Both are the first things anybody reaches for,
          and a script using either looks correct on the machine it was written on and
          desynchronises everywhere else.
        </P>
        <P>
          There is no <C>setTimeout</C> because a delay is <C>world.time</C> and a number you
          kept — the only version of a delay two clients agree about:
        </P>
        <Code>{`let ready = 0

function onTick() {
  if (world.time < ready) return
  ready = world.time + 1
  self.add('shots', 1)
}`}</Code>
      </Section>

      <Section id="errors" title="When one goes wrong">
        <P>
          One throw stops <Em>that entity&apos;s</Em> script, permanently, for that run — it would
          otherwise throw the same failure sixty times a second and bury the one that mattered.
          The rest of the level keeps running. Failures are shown on the HUD during play with the
          script&apos;s name and your line numbers; compile errors arrive as document problems
          when the level opens. A script that quietly stopped is the failure all of this exists to
          prevent.
        </P>
      </Section>

      <Section id="limits" title="Limits, and what a hook costs">
        <Pairs
          rows={[
            [
              'Source',
              'Sixty-four kilobytes per script — every byte is compiled before anything draws.',
            ],
            ['Memory', 'Four megabytes, shared by every script in one XP.'],
            [
              'Fuel',
              'Roughly twenty thousand operations per hook call — an accidental while(true) is cut off. A count of operations rather than a deadline, so a slow machine and a fast one cut off at the same place and stay in sync.',
            ],
            ['Log', 'Two hundred lines, oldest dropped.'],
          ]}
        />
        <P>
          The real cost is not lines of JavaScript but <Em>crossings</Em> — each call that touches
          the world crosses the sandbox boundary. A thousand entities doing arithmetic is four per
          cent of a frame; the same thousand looking each other up is most of one. Cache what{' '}
          <C>getEntityByName</C> gave you, read <C>self.x</C> once into a variable — the way to
          raise the ceiling is to touch the world less, not to write less code.
        </P>
      </Section>

      <Section id="cannot" title="What a script cannot do">
        <Pairs
          rows={[
            [
              'React to the whistle',
              'finished, pressed and returned fire rules, never scripts. Watch a property a rule wrote.',
            ],
            [
              'Hear an emitted name',
              'emit reaches rules. A script listens by having such a rule write a property it watches.',
            ],
            ['Wait', 'No setTimeout — a deadline in world.time is the only delay clients agree on.'],
            [
              'Keep a secret',
              'Everything a script computes, every client can recompute. Hidden state needs a server.',
            ],
            [
              'Push you',
              'Being carried is standing on top of something; a block moving into you stops you, like a wall somewhere else next frame.',
            ],
          ]}
        />
        <P>
          For working code to start from, the{' '}
          <Link href="/create/xp/showcase/shooter" className="text-accent hover:underline">
            shooter write-up
          </Link>{' '}
          walks two real scripts — the runner on a clock and the mine that comes for you — line by
          line.
        </P>
      </Section>
    </DocsShell>
  )
}
