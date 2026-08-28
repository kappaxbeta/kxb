import type { Metadata } from 'next'
import Link from 'next/link'

import { C, DocsShell, DocTitle, Em, K, P, Pairs, Section } from '../shell'

/**
 * The tools, the keys, and how a piece actually lands.
 *
 * The walkthrough on the index covers the first hour of this; this page is
 * the inventory - every tool, every key, and the placement mechanics that
 * only bite after the first hour (the working plane, snap, the gizmo, what a
 * tilt costs).
 */

export const metadata: Metadata = {
  title: 'XP docs — tools & building',
  description:
    'Every placement tool and key in the XP editor, the working plane, the gizmo, snap, and what tilting a piece costs.',
}

const SECTIONS = [
  { id: 'tools', label: 'The eight tools' },
  { id: 'keys', label: 'The keys' },
  { id: 'plane', label: 'The working plane' },
  { id: 'gizmo', label: 'The gizmo' },
  { id: 'collision', label: 'What placing really does' },
  { id: 'tools-panel', label: 'The Tools panel' },
] as const

export default function ToolsPage() {
  return (
    <DocsShell current="tools" sections={SECTIONS}>
      <DocTitle kicker="The editor">Tools &amp; building</DocTitle>
      <P>
        What a drag in the viewport does is decided by the tool in hand, and by nothing else. Eight
        tools, one key each, and a working plane that answers the only hard question — <Em>at what
        height?</Em>
      </P>

      <Section id="tools" title="The eight tools">
        <Pairs
          rows={[
            [
              'Select',
              <>
                The default. Click a thing to find out what it is. <Em>Never builds</Em> — stray
                clicks laying walls was a bug, and it stayed fixed.
              </>,
            ],
            ['Hand', 'Pans the camera with a left-drag. Does not select and does not build.'],
            [
              'Place',
              'Lays exactly one piece where you let go, then hands you back to Select holding it — the next act after placing is nudging, turning or inspecting, none of which Place can do.',
            ],
            [
              'Draw',
              'A brush: fills every cell the pointer crosses while the button is down. Deliberately does not hand back to Select — a one-stroke brush would be useless.',
            ],
            ['Erase', 'Removes what a drag crosses.'],
            ['Line', 'Two corners, a straight run — the wall tool.'],
            ['Fill', 'Two corners, a filled rectangle — the floor tool.'],
            [
              'Room',
              'Two corners, four walls and no ceiling — and it leaves a gap for a doorway, because a modelled doorway rasterises shut.',
            ],
          ]}
        />
      </Section>

      <Section id="keys" title="The keys">
        <div className="mt-4 grid max-w-2xl gap-x-8 gap-y-2 text-sm text-ink-muted sm:grid-cols-2">
          {(
            [
              [
                <>
                  <K>Q</K> / <K>W</K>
                </>,
                'working height down / up',
              ],
              [<K key="r">R</K>, 'turn the next piece 90°'],
              [<K key="b">B</K>, 'Draw ⇄ Place'],
              [<K key="e">E</K>, 'Erase ⇄ Place'],
              [
                <>
                  <K>G</K> / <K>T</K> / <K>Y</K>
                </>,
                'gizmo: move / turn / size',
              ],
              [<K key="esc">Esc</K>, 'deselect (or leave Try)'],
              [
                <>
                  <K>⌘Z</K> / <K>⇧⌘Z</K>
                </>,
                'undo / redo',
              ],
              [
                <>
                  <K>⌘C</K> / <K>⌘X</K> / <K>⌘V</K>
                </>,
                'copy / cut / paste',
              ],
              [<K key="del">⌫</K>, 'delete the selection — it does not copy; that is ⌘X'],
            ] as const
          ).map(([keys, what], index) => (
            <p key={index} className="flex items-baseline gap-3">
              <span className="shrink-0">{keys}</span>
              <span>{what}</span>
            </p>
          ))}
        </div>
        <P>
          Paste lands one cell along diagonally, so repeated pastes walk across the floor instead
          of stacking invisibly. A pasted entity drops its old name — names stay unique. The player
          cannot be copied, cut or deleted; there is exactly one.
        </P>
      </Section>

      <Section id="plane" title="The working plane">
        <P>
          Editing happens against an invisible plane at the working height, so empty space is
          always buildable — <K>Q</K> and <K>W</K> move it. The exception is the one that makes
          building fast: when the pointer is over existing geometry, the piece goes{' '}
          <Em>on top of what you are pointing at</Em>. The slider answers for the empty parts of
          the world; the geometry answers everywhere else.
        </P>
        <P>
          While you drag, the piece shows as a translucent ghost at the exact footprint and turn it
          will occupy — and erase previews are flat red, because rose reads as &quot;about to be
          gone&quot; everywhere in this editor.
        </P>
      </Section>

      <Section id="gizmo" title="The gizmo">
        <P>
          Three icons appear top-left of the viewport while something is selected: move (<K>G</K>),
          turn (<K>T</K>), size (<K>Y</K>). Turn shows <Em>one ring</Em> — yaw, the turn that keeps
          a collision box axis-aligned. Size is one uniform number.
        </P>
        <P>
          Pitch, roll and three per-axis stretches exist as typed fields in Properties, beside a
          pivot choice (turn around the centre, or around the model&apos;s own origin — a door on
          its hinge). They are typed rather than dragged: a three-ring trackball is a control most
          people fight, and five fields that work beat a gizmo that is coming. <Em>Snap</Em> (in
          Tools) sets how far a handle moves per stop — free, a tenth, a half, or a whole cell;
          marks always snap to whole cells regardless.
        </P>
      </Section>

      <Section id="collision" title="What placing really does">
        <P>
          Placements are not on a grid — a crate can sit at 2.3 and a wall can stand at an angle.
          What stays cell-shaped is <Em>collision</Em>: architecture rasterises into one-metre
          cells once, when the level opens, so a wall at 2.5 is solid where it looks solid to
          within half a metre, and a room of four thousand pieces costs the same to walk around as
          a room of four.
        </P>
        <P>
          A tilted piece collides as the box around the tilt — bigger than what is drawn, never
          smaller. And a piece with an opening narrower than a metre rasterises shut, which is why
          a door is a gap in a wall run and an arch needs its doorway put back by hand. The{' '}
          <Em>collides as</Em> control on a selected piece is the way out: measured shape (the
          default, right for the whole kit), or walk-through for anything hung across a way
          through.
        </P>
        <P>
          For things that should <Em>move</Em> — fall, roll, get pushed — that is the physics
          switch on a blueprint, covered in the{' '}
          <Link href="/create/xp/docs/#physics" className="text-accent hover:underline">
            walkthrough
          </Link>
          .
        </P>
      </Section>

      <Section id="tools-panel" title="The Tools panel">
        <Pairs
          rows={[
            ['Level', <>The working height, with the same meaning as <K>Q</K>/<K>W</K>.</>],
            [
              'Ground',
              'Solid ground everywhere at a chosen height — somewhere to stand while a level is half built. Off (the default), the bottom of the world is a catch plane forty cells down; an invisible floor under everything would hide the hole you left in the real one.',
            ],
            [
              'Falling',
              'Only asked when ground is off: falling starts you over, or falling kills you. Mutually exclusive.',
            ],
            ['Background', 'The sky, as any CSS colour — or empty for transparent.'],
            ['Snap', 'How far a gizmo handle moves per stop.'],
          ]}
        />
      </Section>
    </DocsShell>
  )
}
