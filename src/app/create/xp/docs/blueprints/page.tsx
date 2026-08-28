import type { Metadata } from 'next'
import Link from 'next/link'

import {
  AnnotatedFigure,
  C,
  DocsShell,
  DocTitle,
  Em,
  P,
  Pairs,
  Section,
} from '../shell'

/**
 * Blueprints: the kind, not the thing.
 *
 * The screenshot shows the shooter's blueprint list with `target` open -
 * fourteen kinds behind fifty-seven things - because the panel's whole
 * argument is that ratio.
 */

export const metadata: Metadata = {
  title: 'XP docs — blueprints',
  description:
    'Blueprints in the XP editor: kinds of thing with a model, properties, rules and a script — and every field on one, from parts to lights to tags.',
}

const SECTIONS = [
  { id: 'the-idea', label: 'The kind, not the thing' },
  { id: 'the-panel', label: 'The panel' },
  { id: 'fields', label: 'Every field on one' },
  { id: 'starters', label: 'Starters' },
  { id: 'from-placement', label: 'From a placed piece' },
] as const

export default function BlueprintsPage() {
  return (
    <DocsShell current="blueprints" sections={SECTIONS}>
      <DocTitle kicker="The editor">Blueprints</DocTitle>
      <P>
        A blueprint is a <Em>kind</Em> of thing rather than a thing: every crate breaks the same
        way, so what breaks is written once and each crate in the level is one of these. Drag a row
        into the viewport and it becomes an entity — named, with properties, and something can
        happen to it.
      </P>

      <Section id="the-idea" title="The kind, not the thing">
        <P>
          The shooter is fifty-seven entities from fourteen blueprints: four poppers share one{' '}
          <C>popper</C>, and the rule that makes a popper get back up is one row, not four. That is
          the whole argument for the panel — behaviour lives on the kind, position lives on the
          thing, and forty crates are one edit.
        </P>
        <AnnotatedFigure
          src="/img/docs/xp/editor-blueprint.webp"
          alt="The Blueprints panel with the shooter's fourteen blueprints listed and the target blueprint open on its model picker"
          width={2400}
          height={1350}
          caption="The shooter's blueprints, with target open."
          markers={[
            {
              x: 11,
              y: 23.5,
              label:
                'Starters and New: one press makes a working save point, a player body, a peep, or an enemy.',
            },
            {
              x: 11,
              y: 38,
              label:
                'The list — each row is a kind, with how many entities of it stand in the level. Drag a row in to place one.',
            },
            {
              x: 11,
              y: 58.5,
              label: 'The open blueprint’s model — swap it from the picker, or hide it entirely.',
            },
            {
              x: 11,
              y: 78,
              label:
                'The picker: search, packs, and every model the document’s declared packs offer.',
            },
          ]}
        />
      </Section>

      <Section id="the-panel" title="The panel">
        <P>
          Clicking a row opens the blueprint under the list; everything below the model — the
          fields in the next section — scrolls in the same column. Deleting a blueprint is blocked
          while any entity or rule still uses it, and the refusal names the blockers, because a
          kind that vanishes under its things is a document that will not open.
        </P>
      </Section>

      <Section id="fields" title="Every field on one">
        <Pairs
          rows={[
            [
              'Model',
              'One model from the picker — or several, as parts: sub-models with their own offset, turn, scale and parent socket, so a turret is a base plus a barrel that can move on its own.',
            ],
            [
              'Seen at play',
              'Off, the blueprint is a place only: invisible, still named, still moveable, still a rule’s teleport destination. Waypoints and markers are this.',
            ],
            [
              'Pose',
              'For rigged models: the clip the body rests in, picked from the clips the level can see — including the ones the animator saved into this document.',
            ],
            [
              'Light',
              <>
                Colour, brightness, reach. A lamp is scriptable at runtime (<C>self.intensity</C>,{' '}
                <C>self.range</C>, <C>self.colour</C>) — and only a blueprint the document called a
                lamp can be lit from a script at all.
              </>,
            ],
            [
              'Collides as',
              'Measured shape (the model, voxelised), walk-through, or a typed box. Opposite question from physics: this is “does it stop others”, physics is “does it get stopped”.',
            ],
            [
              'Physics',
              'Off, it is scenery. On, it is a body: it falls, bounces, and walking into it pushes it — with gravity, bounce, mass, friction, drag and roll to tune.',
            ],
            [
              'Properties',
              <>
                Named starting numbers — <C>hp</C>, <C>ammo</C>, whatever the rules read. A missing
                property reads as zero.
              </>,
            ],
            [
              'Tags',
              'Free-text labels a rule can match on. The engine never reads them itself.',
            ],
            [
              'Rules & script',
              <>
                The blueprint&apos;s triggers (
                <Link href="/create/xp/docs/rules" className="text-accent hover:underline">
                  rules
                </Link>
                ) and at most one{' '}
                <Link href="/create/xp/docs/scripts" className="text-accent hover:underline">
                  script
                </Link>
                , which every entity of the kind runs with its own variables.
              </>,
            ],
          ]}
        />
      </Section>

      <Section id="starters" title="Starters">
        <P>
          The buttons above the list are ready-made blueprints in a single undo step: a{' '}
          <Em>save point</Em> that is a working checkpoint (flag model, walk-through,{' '}
          <C>enter → checkpoint</C>), a <Em>player</Em> body, a <Em>peep</Em> — the same body on an
          animal skeleton — and an <Em>enemy</Em>: somebody to shoot, with health, that scores when
          it goes down. They exist because the empty-panel moment is where most levels die.
        </P>
      </Section>

      <Section id="from-placement" title="From a placed piece">
        <P>
          A placed piece that turns out to need behaviour does not have to be rebuilt: select it
          and press <Em>make it a blueprint</Em>. It becomes an entity of a new blueprint, in its
          place, keeping position, turn and size — and the placement is consumed rather than left
          behind, because two identical-looking things in one cell that behave differently is
          worse than either.
        </P>
      </Section>
    </DocsShell>
  )
}
