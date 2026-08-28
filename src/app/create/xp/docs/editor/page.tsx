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
 * The window, panel by panel.
 *
 * The screenshot is the real editor with the shooter open, drawn headless by
 * the same Chrome the e2e tests drive - not a mock-up - and the numbered
 * markers are HTML over the image (see `AnnotatedFigure`), so a re-shoot after
 * a UI change does not orphan a set of baked-in arrows.
 */

export const metadata: Metadata = {
  title: 'XP docs — the window',
  description:
    'The editor window, panel by panel: the dock, the rail, the viewport, and what each panel of an XP document is for.',
}

const SECTIONS = [
  { id: 'the-shape', label: 'The shape of it' },
  { id: 'the-dock', label: 'Panels and the dock' },
  { id: 'each-panel', label: 'Each panel' },
  { id: 'try', label: 'Try, and the log' },
  { id: 'saving', label: 'Saving and drafts' },
] as const

export default function EditorWindowPage() {
  return (
    <DocsShell current="editor" sections={SECTIONS}>
      <DocTitle kicker="The editor">The window</DocTitle>
      <P>
        The editor is a desktop-app-shaped frame around a dock of panels, and every panel is a view
        of one part of the document. Nothing lives anywhere else: if a fact about the level cannot
        be seen in some panel, the level does not have it.
      </P>

      <Section id="the-shape" title="The shape of it">
        <AnnotatedFigure
          src="/img/docs/xp/editor-full.webp"
          alt="The XP editor with the shooter level open: toolbar, icon rail, blueprint list, 3D viewport, properties dock and status bar"
          width={2400}
          height={1350}
          caption="The shooter open in the editor, default layout."
          markers={[
            {
              x: 10,
              y: 2.3,
              label: 'The title bar: the name, the live counts, undo and redo, and Save.',
            },
            {
              x: 8,
              y: 6.5,
              label: 'The toolbar — what a drag in the viewport does. Eight tools, one key each.',
            },
            {
              x: 1.4,
              y: 30,
              label: 'The rail: one toggle per panel. Lit means open somewhere in the dock.',
            },
            {
              x: 11,
              y: 10.1,
              label: 'A dock column — Scene, Models and Blueprints tabbed together here.',
            },
            {
              x: 51,
              y: 40,
              label: 'The viewport: the level itself. Drag to draw, right-drag to pan.',
            },
            {
              x: 91,
              y: 10.1,
              label: 'The other column — Behaviour, Properties and Scripts share it.',
            },
            {
              x: 28,
              y: 71.5,
              label: 'The bottom row: Document and Tools, the two you keep glanceable.',
            },
            {
              x: 1.4,
              y: 89.5,
              label: 'Try — plays a snapshot of the level over the editor. Esc comes back.',
            },
            {
              x: 4.2,
              y: 93.2,
              label: 'The status bar: where you are, the tool in hand, and on-disk/draft state.',
            },
          ]}
        />
      </Section>

      <Section id="the-dock" title="Panels and the dock">
        <P>
          Every panel can be dragged out, split against another, or stacked into a tab group; the
          layout saves itself per level and comes back on reload. A saved layout that no longer
          parses falls back to the default rather than to an empty window, and reopening a closed
          panel rejoins whichever column it last lived in.
        </P>
        <P>
          Everything is optional except the viewport, which is the work. The one panel worth
          keeping open on faith is <Em>Document</Em> — it is the only one that tells you things you
          cannot see by looking.
        </P>
      </Section>

      <Section id="each-panel" title="Each panel">
        <Pairs
          rows={[
            [
              'Scene',
              'Everything by name: entities (indented under what they hang from), architecture folded by model, the five kinds of mark, and the player.',
            ],
            [
              'Models',
              'The catalogue, searchable, with a drawer of packs a level can declare. Dragging a tile in lays architecture; the packs a level uses are a real document field.',
            ],
            [
              'Blueprints',
              <>
                Kinds of thing — the page of their own is{' '}
                <Link href="/create/xp/docs/blueprints" className="text-accent hover:underline">
                  blueprints
                </Link>
                .
              </>,
            ],
            [
              'Properties',
              'The form for whatever is selected: position and a drag pad, turn, scale, tilt and stretch, collider mode, and what it hangs from.',
            ],
            [
              'Behaviour',
              <>
                A blueprint&apos;s rules as rows — the vocabulary is on the{' '}
                <Link href="/create/xp/docs/rules" className="text-accent hover:underline">
                  rules page
                </Link>
                .
              </>,
            ],
            [
              'Scripts',
              <>
                The document&apos;s scripts, an editor with autocomplete and a dry run — see{' '}
                <Link href="/create/xp/docs/scripts" className="text-accent hover:underline">
                  the script API
                </Link>
                .
              </>,
            ],
            [
              'Data',
              'The level’s declared fields — what it keeps beyond a session, each scoped to the player, the space, or shared.',
            ],
            [
              'Flow',
              <>
                Where the level can be played, and the round it plays — see{' '}
                <Link href="/create/xp/docs/flow" className="text-accent hover:underline">
                  the flow editor
                </Link>
                .
              </>,
            ],
            [
              'Words',
              'The level’s own translations: phrases keyed by the English sentence, so a level can say things in the player’s language.',
            ],
            [
              'Tools',
              'The working height, ground on or off, what falling means, snap, and the background colour.',
            ],
            [
              'Document',
              'The counts, the capabilities, the warnings, and — because they are document-level facts — the Mode and Camera controls.',
            ],
            [
              'Animator',
              <>
                The pose and clip editor, which takes the whole dock —{' '}
                <Link href="/create/xp/docs/animator" className="text-accent hover:underline">
                  its own page
                </Link>
                .
              </>,
            ],
          ]}
        />
      </Section>

      <Section id="try" title="Try, and the log">
        <P>
          <Em>Try</Em> (the play button under the rail) takes a snapshot of the document and opens
          the real runtime over the editor — the same component the live route renders. No save, no
          session, no room; edits made while it is open are not reflected until you press it again.
          A desktop/phone toggle remounts it letterboxed with touch input, for how it feels under a
          thumb.
        </P>
        <P>
          The <Em>Log</Em> keeps everything the level said this run — pickups, a script&apos;s{' '}
          <C>log()</C>, a rule that refused — and it collects whether or not the panel is open, so
          opening it shows what already happened rather than starting from the moment you
          wondered. Editor shortcuts are suppressed while trying, except <C>Esc</C>, which is the
          way back.
        </P>
      </Section>

      <Section id="saving" title="Saving and drafts">
        <P>
          Every edit autosaves a draft locally, tagged with the version it was saved against —
          losing an afternoon&apos;s building to a refresh is the one unforgivable bug a builder
          can have. Reopening restores a newer draft over what is saved, and silently drops a
          draft older than the current server version, so it cannot clobber somebody else&apos;s
          newer save. The <Em>draft</Em> link in the title bar discards it and goes back to what is
          on disk.
        </P>
        <P>
          A refused save shows the server&apos;s exact reason inline — including &quot;somebody
          else has this project open&quot;, which is the editor telling you it is single-writer on
          purpose.
        </P>
      </Section>
    </DocsShell>
  )
}
