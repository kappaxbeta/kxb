import type { Metadata } from 'next'
import Link from 'next/link'

import {
  AnnotatedFigure,
  C,
  Code,
  DocsShell,
  DocTitle,
  Em,
  Flow,
  P,
  Pairs,
  Section,
} from '../shell'

/**
 * The flow editor: where a level can be played, and the round it plays.
 *
 * Written from manual.md §6.1c and the panel itself. The mensch board game is
 * the level the block was built for, and its roll → move loop is the example
 * here for that reason - a flow explained with a made-up example teaches the
 * syntax and not the point.
 */

export const metadata: Metadata = {
  title: 'XP docs — the flow editor',
  description:
    'The Flow panel: where a level can be played (a room, a battle, a ball game, a race), and the flow block — phases, transitions, and what wins.',
}

const SECTIONS = [
  { id: 'where', label: 'Where it can be played' },
  { id: 'mode', label: 'What this is, and what you do in it' },
  { id: 'a-run', label: 'A live world, or a run' },
  { id: 'phases', label: 'Phases and transitions' },
  { id: 'wins', label: 'What wins' },
  { id: 'graph', label: 'The graph' },
] as const

export default function FlowPage() {
  return (
    <DocsShell current="flow" sections={SECTIONS}>
      <DocTitle kicker="The editor">The flow editor</DocTitle>
      <P>
        Two questions live in the Flow panel, and they are the two biggest facts about a level:{' '}
        <Em>where can it be played</Em>, and <Em>what kind of game is it</Em> — a live world people
        walk around in, or a run with stages that ends.
      </P>

      <Section id="where" title="Where it can be played">
        <AnnotatedFigure
          src="/img/docs/xp/editor-flow.webp"
          alt="The Flow panel open on the shooter: where it can be played as checkboxes, and the run-shape picker below"
          width={2400}
          height={1350}
          caption="The shooter's Flow panel: playable as a room and as a battle."
          markers={[
            {
              x: 91.5,
              y: 34,
              label:
                'As a room / as a battle — anybody can keep it standing and walk in, and the battle lobby can run a match on it: sides, a score, an end.',
            },
            {
              x: 91.5,
              y: 55,
              label:
                'As a ball game / as a race — each greyed with its reason until the world backs it up: a goal at each end, a start and a finish.',
            },
            {
              x: 91.5,
              y: 70,
              label:
                'What kind of game is this? A level is a live world, or it plays a run with stages — pick the shape closest to yours and move its pieces.',
            },
            {
              x: 91.5,
              y: 88.5,
              label: 'The shape this level has now — the shooter is a live world: no start, no end.',
            },
          ]}
        />
        <P>
          These are the document&apos;s <Em>capabilities</Em>, said as checkboxes. A claim the
          world cannot back up is greyed out with the reason beside it — the same refusal the
          parser makes on load, said before the click instead of as a save that silently does
          nothing.
        </P>
      </Section>

      <Section id="mode" title="What this is, and what you do in it">
        <P>
          Two questions, and they used to be one. <C>preset</C> answers{' '}
          <Em>what you do</Em> — shoot, score, run a course — and it had been quietly answering a
          second one as well: whether a round is happening at all. The tell was that its list read
          as four styles and an absence, because <C>freestyle</C> is not a game you play, it is a
          statement that no game is being played.
        </P>
        <P>
          So <C>mode</C> is that second question on its own, above the styles in the panel:
        </P>
        <Pairs
          rows={[
            [
              <C key="space">space</C>,
              'A place that is simply there. No round, nothing to win, and what happens in it stays. This is what a level says by not saying anything.',
            ],
            [
              <C key="lobby">lobby</C>,
              'Where people gather before or between rounds — and it can still keep score. The rest of the block applies unchanged, which is the whole reason it is a mode rather than a flag.',
            ],
            [
              <C key="battle">battle</C>,
              'A run: it starts, it ends, and what it counted goes with it.',
            ],
          ]}
        />
        <P>
          Keeping them as one list would mean a <C>lobby-shooter</C> beside <C>shooter</C>, and
          then a <C>lobby-football</C> — a product of two lists rather than a list. A deathmatch
          running all evening in the corner of a foyer and a deathmatch that starts and ends are
          the same <Em>style</Em>.
        </P>
        <P>
          <Em>And a level can carry a round per mode.</Em> <C>flow</C> is the one it plays when
          nothing more specific is said; <C>flows</C> keys a round to a mode:
        </P>
        <Code lang="data">{`"flow":  { "start": "idle", "phases": { … } },
"flows": {
  "lobby":  { "start": "waiting", "phases": { … } },
  "battle": { "start": "warmup",  "phases": { … } }
}`}</Code>
        <P>
          A foyer with a kickabout in the corner has a round of its own — a whistle, a kick off, a
          score that resets — and it is not the round the foyer runs the rest of the evening. Said
          with one flow, that is a state machine with a second state machine written along its
          edges.
        </P>
        <P>
          A mode with no round of its own plays <C>flow</C>, so a level with one round that
          happens to be scheduled as a match does not write its phases twice. The fallback only
          goes one way: a round under <C>flows.battle</C> never runs in a room, because a foyer
          that suddenly has a whistle in it is the quiet kind of wrong.
        </P>
        <P>
          <Em>And a round can name the place it is played in.</Em> <C>scene</C> on a flow, by its
          key in the level&apos;s <C>scenes</C> table — entering the round takes you there, the way
          walking through a door does:
        </P>
        <Code lang="data">{`"flows": {
  "lobby":  { "scene": "foyer", "start": "waiting", "phases": { … } },
  "battle": { "scene": "arena", "start": "warmup",  "phases": { … } }
}`}</Code>
        <P>
          The run names the scene, not the other way round: one arena hosting three different
          rulesets is the normal case, and a scene carrying its own ruleset would make it the
          exception. A scene the document does not have is refused when the level loads, naming
          the round it is on, because a round that jumps to a room that is not there is a level
          that starts and then goes nowhere. Naming nothing moves nobody.
        </P>
        <P>
          Which one is running is the <Em>session&apos;s</Em> answer rather than the file&apos;s —
          a battle scheduled on a lobby is a battle for as long as it lasts. A script can ask:{' '}
          <C>world.mode</C>, <C>world.style</C>, and <C>world.live</C> for whether anybody else is
          in here.
        </P>
      </Section>

      <Section id="a-run" title="A live world, or a run">
        <P>
          Most levels are a place people are in: no start, no end, things work, nothing finishes.
          A <Em>run</Em> is the other kind — kick-off, play, full time; roll, move, next seat — and
          the flow block is a level saying what its own stages are, instead of being one of five
          presets. The board game is the level this was built for:
        </P>
        <Flow
          steps={[
            {
              title: 'roll',
              body: 'Only the roll key is live. A rule on the dice emits "rolled".',
            },
            {
              title: 'move',
              body: 'The level says "your go"; only use is live. Moving emits "moved" — a six emits "six".',
            },
            {
              title: 'back to roll',
              body: '"six" loops to roll for another throw; "moved" passes the turn.',
            },
            {
              title: 'wins',
              body: 'First colour with four pieces home — checked from the level’s own data.',
            },
          ]}
        />
      </Section>

      <Section id="phases" title="Phases and transitions">
        <P>
          Nothing in the block is new vocabulary. A phase&apos;s <C>does</C> is the same verb list
          a rule&apos;s <C>do</C> is, and it runs <Em>once, on entering</Em>. A transition fires on
          a <C>when</C> (a condition), an <C>on</C> (an emitted event name — a rule that finishes a
          turn says so, and the flow hears it), or an <C>after</C> (seconds). The parser refuses a
          step with none of the three — a step that fires on nothing is a silent forever.
        </P>
        <Code lang="data" title="the flow block, in the document">{`"flow": {
  "start": "roll",
  "phases": {
    "roll": { "allow": ["roll"], "next": [{ "on": "rolled", "go": "move" }] },
    "move": {
      "does": [{ "op": "emit", "event": "your go" }],
      "allow": ["use"],
      "next": [
        { "on": "six",   "go": "roll" },
        { "on": "moved", "go": "roll" }
      ]
    }
  }
}`}</Code>
        <P>
          <C>allow</C> names which of the player&apos;s keys are live in a phase. Absent is all of
          them; <Em>empty is none</Em> — the useful one, because it is how a phase says{' '}
          <Em>watch, do not touch</Em>. A press the phase does not allow is dropped, not queued.
        </P>
        <P>
          Two refusals are the point of the block: a destination that does not exist, and a phase
          nothing can reach. Neither is an error in any programming language, and both are always
          a mistake here — so the panel refuses them instead of letting a run freeze with nothing
          in any log to say why. The limits are 32 phases and 8 ways out of each.
        </P>
      </Section>

      <Section id="wins" title="What wins">
        <P>
          <C>wins</C> is the field that makes a flow a game rather than a loop: a condition on the
          level&apos;s own data, checked from the first frame of the run. When it holds, the run
          ends, every entity hears <C>finished</C>, and a rematch is offered.
        </P>
        <Code lang="data">{`"wins": { "of": "world", "prop": "mine-home", "is": ">=", "value": 4 }`}</Code>
        <P>
          It says <Em>that</Em> the run is won, not who won — the scoreboard has been answering
          &quot;who is ahead&quot; all along. And what it counts has to be scoped to the run: a
          field that survives the game still holds last game&apos;s four, and the next run would be
          won on its opening frame. The parser refuses that, and names the field.
        </P>
      </Section>

      <Section id="graph" title="The graph">
        <P>
          The panel draws the flow as a graph, laid out by distance from the start, because the one
          thing nested JSON cannot show is the shape of a state machine. Drag between two nodes to
          point an arrow; a phase&apos;s <C>does</C> is the same verb rows the{' '}
          <Link href="/create/xp/docs/rules" className="text-accent hover:underline">
            rules panel
          </Link>{' '}
          draws. Start from the shape closest to yours — the presets are shapes, not modes — and
          move its pieces.
        </P>
      </Section>
    </DocsShell>
  )
}
