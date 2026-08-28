import type { Metadata } from 'next'
import Link from 'next/link'

import {
  AnnotatedFigure,
  C,
  Code,
  DocsShell,
  DocTitle,
  Em,
  K,
  P,
  Pairs,
  Section,
} from '../shell'

/**
 * The player: where they arrive, what they are, what they can press, and
 * what is in their hand.
 *
 * The gun walkthrough is the shooter's actual pistol, because "how do I make
 * a gun" is the question this page exists for and an invented example would
 * teach an invented gun.
 */

export const metadata: Metadata = {
  title: 'XP docs — the player',
  description:
    'Spawns, goals and marks; the body — dummy, peep or any blueprint; the movement numbers — speed, jump, gravity, acceleration, drag; the level’s own keys and how rules hear them; and a worked example: making a gun.',
}

const SECTIONS = [
  { id: 'marks', label: 'Spawns, goals, marks' },
  { id: 'the-body', label: 'The body' },
  { id: 'movement', label: 'Movement' },
  { id: 'keys', label: 'Moves and keys' },
  { id: 'a-gun', label: 'Making a gun' },
] as const

export default function PlayerPage() {
  return (
    <DocsShell current="player" sections={SECTIONS}>
      <DocTitle kicker="The editor">The player</DocTitle>
      <P>
        Five questions, one page: where a person arrives, what they arrive <Em>as</Em>, how the
        level moves underfoot, what they can press, and what is in their hand. All of it lives on
        the Player row of the Scene panel and the form it opens.
      </P>

      <Section id="marks" title="Spawns, goals, and the other marks">
        <AnnotatedFigure
          src="/img/docs/xp/editor-player.webp"
          alt="The Scene panel with marks and the player selected, and the Properties panel showing the player form: position, facing, body, keys, holding and grip"
          width={2400}
          height={1350}
          caption="The shooter's player selected: marks bottom-left, the player form on the right."
          markers={[
            {
              x: 5.6,
              y: 71,
              label:
                'Marks — the level’s facts: a spawn per side, red and blue goals, start and finish, points. A new one lands under the pointer.',
            },
            {
              x: 8,
              y: 89.8,
              label: 'The player row: one per level, selectable like anything else.',
            },
            {
              x: 91.5,
              y: 19,
              label:
                'Where a person arrives when no spawn mark says otherwise, and which way they face.',
            },
            {
              x: 91.5,
              y: 53.5,
              label: 'The body — the built-in dummy, or any blueprint in the level.',
            },
            {
              x: 91.5,
              y: 64,
              label:
                'The level’s own keys: each emits its name, and a rule decides what that means.',
            },
            {
              x: 91.5,
              y: 79,
              label: 'Holding: a blueprint on a socket. A gun is one with damage and range.',
            },
            {
              x: 91.5,
              y: 89.4,
              label: 'The grip: six numbers for how it sits in the hand, with a reset.',
            },
          ]}
        />
        <P>
          Marks matter more than they look, because the document&apos;s claims are checked against
          them. A level that says <Em>battle</Em> needs a spawn for each side; a ball game needs a
          red goal and a blue goal; a race needs a start and a finish. The refusal is made in the{' '}
          <Link href="/create/xp/docs/flow" className="text-accent hover:underline">
            Flow panel
          </Link>{' '}
          before the click, and by the parser on load — by name.
        </P>
        <Pairs
          rows={[
            [
              'spawn',
              'Where a side starts, with a team and a facing. Spawns ignore width and height.',
            ],
            [
              'red / blue',
              'The goals — where a side scores. A goal has a size, because a ball has to fit through it.',
            ],
            ['start / finish', 'The two ends of a race. Crossing the finish is what ranks a run.'],
            ['point', 'A named spot for rules to aim at — a teleport destination, a waypoint.'],
          ]}
        />
        <P>
          The player&apos;s own position is the fallback: where a person arrives when no spawn mark
          says otherwise. Set it by dragging the body in the viewport, or from the form — the drag
          pad moves it on the floor, <Em>height is the y field</Em>.
        </P>
      </Section>

      <Section id="the-body" title="The body — dummy, peep, or any blueprint">
        <P>
          Absent means the built-in dummy, and that is the common case. Everything else is a
          blueprint: pick one in the <Em>body</Em> dropdown and the player arrives as it — a
          marksman, a kart, a bird. The two starters in the{' '}
          <Link href="/create/xp/docs/blueprints" className="text-accent hover:underline">
            Blueprints panel
          </Link>{' '}
          cover the usual cases in one press: <Em>+ player</Em> makes a body from the dummy,{' '}
          <Em>+ peep</Em> makes one from the animal skeleton — same idea, different rig, which
          matters the moment you animate it, because{' '}
          <Link href="/create/xp/docs/animator" className="text-accent hover:underline">
            a clip is bound to its rig
          </Link>
          .
        </P>
        <P>
          A body is a blueprint like any other: give it <C>hp</C> and it can be hurt, give it{' '}
          <C>ammo</C> and rounds are counted, give it a rest <Em>pose</Em> and it stands how you
          posed it. Once the model has sockets, <Em>avatar at</Em> chooses where the person&apos;s
          own avatar hangs — riding a kart rather than being one — and <Em>everybody is</Em>{' '}
          decides what other players arrive as; the shooter keeps everyone as the body above,
          exactly as it is drawn.
        </P>
      </Section>

      <Section id="movement" title="Movement — the level's own feel">
        <P>
          Six numbers on the Player form, under <Em>Movement</Em>, and every one of them has a
          built-in the level gets by staying quiet. They are in the units a course is counted in —{' '}
          <Em>cells</Em> — so you can check a number against your own floor plan.
        </P>
        <Pairs
          rows={[
            [
              'walk · sprint',
              <>
                Cells a second on the ground — 7 and 13 unless you say otherwise. They are two
                numbers, not a multiplier: set them equal and Shift simply does nothing, which is
                how a board game switches sprinting off.
              </>,
            ],
            [
              'jump',
              <>
                Cells a single jump clears — 1.56 built in, so one block is comfortable and two are
                a wall. Height, not hang time: the conversion to speed runs through the
                level&apos;s own gravity, so a jump keeps clearing the blocks you counted whatever
                world it is on.
              </>,
            ],
            [
              'gravity',
              <>
                Cells a second squared, downwards — 26 built in, deliberately heavier than Earth so
                falls feel short. Lower is floatier, higher is snappier; <C>jump</C> and every
                bounce stay in cells either way.
              </>,
            ],
            [
              'acceleration · drag',
              <>
                How quickly the pace arrives, and how quickly a let-go stick gives it back — cells
                a second squared, and <Em>zero means instantly</Em>, which is the built-in feel.
                Ice is a small drag; a heavy kart is a small acceleration; most levels want
                neither.
              </>,
            ],
          ]}
        />
        <P>
          The warning that comes with all of them: <Em>a changed number wants its course driven,
          not measured</Em>. A longer jump can sail over the platform it used to land on, and a
          faster sprint crosses a gap the walk was sized for — the geometry checks stay green
          either way, because a budget can only prove a gap is crossable, never that it is still
          the thing you land on.
        </P>
      </Section>

      <Section id="keys" title="Moves, and the level's own keys">
        <P>
          Moving costs nothing to set up: walking, sprinting, the double jump, and the camera are
          in every XP. Click to look, <K>WASD</K> to move, <K>Shift</K> to sprint, <K>Space</K> to
          jump — twice in the air for the second one — and <K>V</K> for the camera behind the body.
          Click fires, if the body is holding something with <C>damage</C> on it.
        </P>
        <P>
          Everything else is a <Em>level key</Em>: up to five bindings, each captured by pressing
          the actual key — not typed as text — and paired with a name. The names offered are the
          conventional ones (<C>grab</C>, <C>use</C>, <C>attack</C>, <C>shoot</C>), but a name is
          just a name. <Em>Each key emits its name, and a rule decides what it means</Em> — the
          key is the vocabulary, the rules are the grammar:
        </P>
        <Code lang="rules">{`the lever   on: pressed (key use, within 2)   do: emit "thrown"
the gate    on: emitted "thrown"              do: setProp open = 1`}</Code>
        <P>
          <C>pressed</C> takes an optional distance, so &quot;press E at the lever&quot; is one
          rule and no script. Two more places read the same names: a{' '}
          <Link href="/create/xp/docs/flow" className="text-accent hover:underline">
            flow phase&apos;s
          </Link>{' '}
          <C>allow</C> gates which keys are live — a dice phase where only <C>roll</C> works is{' '}
          <C>allow: [&quot;roll&quot;]</C> — and a <C>pressed</C> rule cannot exist before a key
          does, so the picker says &quot;bind a key first&quot; rather than saving something that
          would never fire.
        </P>
      </Section>

      <Section id="a-gun" title="Worked example: making a gun">
        <P>
          The shooter&apos;s pistol, from nothing. What makes it a gun is <Em>two properties</Em>;
          everything else is placement.
        </P>
        <Pairs
          rows={[
            [
              '1 · The blueprint',
              <>
                New blueprint, pick a model. Give it <C>damage: 25</C> and <C>range: 60</C> —
                that is the whole weapon system. A blueprint with neither is just something you
                are carrying.
              </>,
            ],
            [
              '2 · Into the hand',
              <>
                On the player form, set <Em>holding</Em> to the blueprint and <Em>in hand</Em> to
                the socket. Click now fires: a hit deals the <C>damage</C>, out to the{' '}
                <C>range</C>.
              </>,
            ],
            [
              '3 · The grip',
              'If it sits wrong, the grip’s six numbers move and turn it in the hand. Press Try, look, adjust — the reset puts it back.',
            ],
            [
              '4 · Ammo, if you want it',
              <>
                Give the <Em>body</Em> an <C>ammo</C> property and rounds are counted; leave it
                off and they are not. Ammo lives on the player, not the gun — which is what lets
                an ammo box be one rule:
              </>,
            ],
          ]}
        />
        <Code lang="rules">{`the ammo box   on: enter   do: addProp ammo +12 (other)  ·  sound "pickup"
                                deactivate self, 15 seconds`}</Code>
        <P>
          Taking the gun away is a verb too: <C>disarm</C> and <C>arm</C>, from any rule — a
          no-weapons lobby phase is one <C>does</C> in the flow. The{' '}
          <Link href="/create/xp/showcase/shooter" className="text-accent hover:underline">
            shooter write-up
          </Link>{' '}
          shows the whole loadout in play.
        </P>
      </Section>
    </DocsShell>
  )
}
