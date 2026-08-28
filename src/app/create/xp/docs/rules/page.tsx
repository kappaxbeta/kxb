import type { Metadata } from 'next'
import Link from 'next/link'

import { C, Code, DocsShell, DocTitle, Em, Grid, P, Pairs, Section } from '../shell'

/**
 * The rules vocabulary, complete.
 *
 * A closed vocabulary is only worth having if somewhere lists all of it, and
 * this is that list for readers who are not us: every event, every verb,
 * every target. The engine-side guarantee is a test that fails when the
 * vocabulary and the internal docs drift; this page is written from those
 * docs and inherits the same discipline second-hand.
 */

export const metadata: Metadata = {
  title: 'XP docs — rules & verbs',
  description:
    'The complete rules vocabulary of an XP: every event a trigger can listen for, every verb it can run, and how emit and emitted wire things together.',
}

const SECTIONS = [
  { id: 'shape', label: 'The shape of a rule' },
  { id: 'events', label: 'The events' },
  { id: 'verbs', label: 'The verbs' },
  { id: 'emit', label: 'emit and emitted' },
  { id: 'refusals', label: 'What the panel refuses' },
] as const

export default function RulesPage() {
  return (
    <DocsShell current="rules" sections={SECTIONS}>
      <DocTitle kicker="Reference">Rules &amp; verbs</DocTitle>
      <P>
        A rule is three things: <Em>on</Em> (an event), an optional <Em>when</Em> (one property
        against one number, on <C>self</C>, <C>other</C> or the level&apos;s data), and{' '}
        <Em>do</Em> (a list of verbs). The vocabulary is closed, which is why it fits on a panel —
        and why nothing you can write here fails while somebody is playing.
      </P>

      <Section id="shape" title="The shape of a rule">
        <Code lang="rules">{`on: damaged   when: hp <= 0
do: spawn shard  ·  score 1  ·  emit "target down"  ·  despawn`}</Code>
        <P>
          Verbs run in order, and <C>despawn</C> stops the rule — anything after it would be
          writing to a corpse. <C>target</C> on a verb is <C>self</C> or <C>other</C>; for{' '}
          <C>setProp</C> and <C>addProp</C> it can also be <C>world</C>, writing a declared data
          field.
        </P>
      </Section>

      <Section id="events" title="The events">
        <Grid
          head={['Event', 'Fires when', 'other is']}
          rows={[
            [<C key="1">enter</C>, 'the player walks into it', 'the player'],
            [<C key="2">exit</C>, 'the player walks out', 'the player'],
            [
              <C key="3">collide</C>,
              'another entity touches it — a ball rolling into a goal fires this, never enter',
              'what hit it',
            ],
            [
              <C key="4">damaged</C>,
              'its hp changed by a shot, a rule or a script',
              'whoever dealt it',
            ],
            [<C key="5">spawned</C>, 'it comes into being', '—'],
            [
              <C key="6">pressed</C>,
              'a bound key is pressed — needs a key in player.keys first, optionally within a distance',
              'the presser',
            ],
            [<C key="7">held</C>, 'it goes into somebody’s hands', 'the holder'],
            [<C key="8">dropped</C>, 'it is put down', '—'],
            [
              <C key="9">returned</C>,
              'it comes back from a timed deactivate — the respawn trick',
              '—',
            ],
            [
              <C key="10">emitted</C>,
              'any emit says the name it listens for',
              'the emitter',
            ],
            [<C key="11">finished</C>, 'the match ends', '—'],
          ]}
        />
      </Section>

      <Section id="verbs" title="The verbs">
        <Pairs
          rows={[
            [
              <C key="1">damage / heal</C>,
              <>
                Changes <C>hp</C>, clamped at zero. Heal by 999 is the document&apos;s way of
                saying &quot;whatever full is&quot;.
              </>,
            ],
            [<C key="2">setProp / addProp</C>, 'Writes or adds to a property — including the level’s own data via target world.'],
            [
              <C key="3">despawn</C>,
              <>
                Removes it, finally. <Em>A rule stops here.</Em> The thing that comes back later is
                a new one, spawned by something still alive — or a deactivate.
              </>,
            ],
            [<C key="4">spawn</C>, 'Makes one from a blueprint, offset from this entity.'],
            [
              <C key="5">deactivate / activate</C>,
              <>
                Off and back on — for a number of seconds, or until something turns it back. Coming
                back fires <C>returned</C>, which is how poppers stand back up and pickups meter
                themselves.
              </>,
            ],
            [
              <C key="6">carry / drop / unhand</C>,
              'Hangs it off whoever set the rule off; lets go of one thing, or of everything.',
            ],
            [<C key="7">disarm / arm</C>, 'Takes the weapon away and gives it back.'],
            [<C key="8">stun</C>, 'Roots a player where they stand, still standing.'],
            [
              <C key="9">teleport</C>,
              'Sends it to a named entity or a mark. The picker takes a name not placed yet, for forward references.',
            ],
            [<C key="10">checkpoint</C>, 'Where this player comes back to.'],
            [<C key="11">load</C>, 'A door out — another XP, by name.'],
            [<C key="12">sound</C>, 'The host plays it, from a closed list.'],
            [
              <C key="13">score</C>,
              'Credits whoever set the rule off. What a score means is the host’s business — that is what lets one level be a practice range and a match.',
            ],
            [<C key="14">emit</C>, 'Says a name out loud. See below.'],
            [
              <C key="15">animate</C>,
              <>
                Plays a document clip on an entity — see{' '}
                <Link href="/create/xp/docs/animator" className="text-accent hover:underline">
                  the animator
                </Link>
                .
              </>,
            ],
          ]}
        />
      </Section>

      <Section id="emit" title="emit and emitted">
        <P>
          <C>emit</C> says a name; every <C>emitted</C> rule listening for that exact name hears
          it. The sender does not name a receiver — so a third thing that reacts is a new rule and
          no edit to the emitter, which is the whole point:
        </P>
        <Code lang="rules">{`the bell    on: pressed (key use)    do: emit "ring"
the gate    on: emitted "ring"       do: setProp open = 1
the lights  on: emitted "ring"       do: activate`}</Code>
        <P>
          The name is exact — no wildcards, and <C>gate-open</C> does not hear <C>gate-opened</C>.
          A chain works (<C>one</C> → <C>two</C> → <C>three</C> runs to the end); a loop is cut
          off after 512 deliveries in a frame rather than hanging the tab. <C>other</C> in the
          listening rule is whoever emitted, so a <C>when</C> can ask about the sender.
        </P>
      </Section>

      <Section id="refusals" title="What the panel refuses">
        <P>
          The panel will not build a document the parser would send back, because that refusal
          would arrive as &quot;nothing happened&quot;. So: the last verb of a rule has no remove
          button — a rule must do something. A <C>spawn</C> can only name a blueprint that exists.{' '}
          <C>pressed</C> is not offered until the level has a key to bind it to. An{' '}
          <C>emitted</C> with no name does not save. And <C>finished</C> warns when the level has
          no way to finish — a rule that can never fire is a bug with no symptom.
        </P>
      </Section>
    </DocsShell>
  )
}
