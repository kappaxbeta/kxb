import type { Metadata } from 'next'

import {
  AnnotatedFigure,
  C,
  DocsShell,
  DocTitle,
  Em,
  K,
  P,
  Pairs,
  Section,
} from '../shell'

/**
 * The animator - the pose editor.
 *
 * Written from pose-manual.md and the panel itself. The section that earns
 * its place is "what a clip must contain": every failure in this tool is
 * silent - a wrong rig, a root-only clip - and ends with a body standing
 * perfectly still, so the two rules that prevent that are the documentation.
 */

export const metadata: Metadata = {
  title: 'XP docs — the animator',
  description:
    'The pose editor: drag a body by hands and feet, key whole poses on a timeline, and save clips into the level for poses, rules and scripts to play.',
}

const SECTIONS = [
  { id: 'what-it-is', label: 'What it is' },
  { id: 'posing', label: 'Posing' },
  { id: 'timeline', label: 'Keys and the timeline' },
  { id: 'clips', label: 'Where a clip goes' },
  { id: 'playing', label: 'Playing one' },
  { id: 'shortcuts', label: 'Shortcuts' },
] as const

export default function AnimatorPage() {
  return (
    <DocsShell current="animator" sections={SECTIONS}>
      <DocTitle kicker="The editor">The animator</DocTitle>
      <P>
        The pose editor. Drag a body&apos;s hands and feet and the rest of the limb follows; what
        you save is a list of <Em>keys</Em>, and a key is a whole pose with an easing to the next
        one. It takes over the viewport&apos;s dock — and can take the whole window — because
        posing is not a side panel&apos;s worth of work.
      </P>

      <Section id="what-it-is" title="What it is">
        <AnnotatedFigure
          src="/img/docs/xp/editor-animator.webp"
          alt="The animator filling the editor dock: the dummy with draggable pose dots, view controls, and the body, clips, clip and bones panels on the right"
          width={2400}
          height={1350}
          caption="The animator with the whole dock, posing the dummy."
          markers={[
            {
              x: 35,
              y: 50,
              label:
                'The stage: every dot is a joint. Drag one and the limb solves after it; knees and elbows only bend the way they should.',
            },
            {
              x: 12,
              y: 19.6,
              label: 'Camera presets — front, back, left, right, top, under — beside a free orbit.',
            },
            {
              x: 88,
              y: 28,
              label:
                'Body: which skeleton you are animating. The dummy and the peep share no bone names, so each keeps its own working file.',
            },
            {
              x: 88,
              y: 41,
              label:
                'Clips: all of them live in one file, and Save to level puts the collection into the document.',
            },
            {
              x: 88,
              y: 58,
              label: 'The clip: name, frames per second, length, and the ease out of the current key.',
            },
            {
              x: 88,
              y: 87,
              label: 'Bones: pick a dot in the viewport, or by name — for exact pitch, turn and roll.',
            },
          ]}
        />
      </Section>

      <Section id="posing" title="Posing">
        <Pairs
          rows={[
            [
              'Drag a dot',
              'Inverse kinematics up the chain, joint-limited so the pose stays anatomical. Shift-drag slides along the floor instead of the camera plane.',
            ],
            [
              'Hips',
              'The one handle that moves the whole body rather than bending a joint.',
            ],
            [
              'Pins',
              'Hands and feet can be pinned to a world point: lower the hips with the feet pinned and you get a crouch, not a body sinking through the floor.',
            ],
            [
              'Exact numbers',
              'A selected bone gets pitch/turn/roll sliders and a straighten button.',
            ],
            [
              'Moves',
              'Canned motions — walk, run, wave, dance, idle, jump — stamped from the playhead and speed-scaled. Each touches only the bones it names, so Walk then Arm swing layers rather than erases.',
            ],
          ]}
        />
      </Section>

      <Section id="timeline" title="Keys and the timeline">
        <P>
          A video-editor strip: click to scrub, drag the playhead, drag a diamond to re-time a key.{' '}
          <Em>Auto-key is on by default</Em> — moving a handle records a key at the playhead. Each
          key carries an ease out of it: linear, smooth, or hold. Copy key / paste key is how a
          loop closes — copy frame zero, scrub to the end, paste.
        </P>
        <P>
          Undo is five steps deep and coalesced — dragging one slider is one undo step, not one per
          pixel — and the working document autosaves locally, separate from the level draft.
        </P>
      </Section>

      <Section id="clips" title="Where a clip goes">
        <P>
          Three forms, three jobs. The <Em>working file</Em> (<C>.animation.json</C>) is the keyed
          form you re-open to keep editing. A <Em>.glb</Em> is for anything outside this product.
          And <Em>Save to level</Em> is the one that matters here: it bakes every clip in the
          collection into the document — one dense sample per frame, easing already applied — where
          a pose, a rule&apos;s <C>animate</C> verb, or a script&apos;s <C>runAnimation</C> can
          name it. Baked rather than keyed, because two machines that disagree about what
          &quot;smooth&quot; means draw the same level differently; a straight line between
          samples is a thing everybody agrees about.
        </P>
        <P>
          Two rules stop the silent failures. <Em>The rig is part of the clip:</Em> the dummy and
          the peep share no bone names, so a dummy clip on a peep is not wrong, it is empty — a
          body standing perfectly still. And <Em>a clip needs at least one bone track</Em>: a clip
          that only moves the root is refused, which you will meet the first time you try
          &quot;slide forward and back&quot; — give it a leg as well.
        </P>
      </Section>

      <Section id="playing" title="Playing one">
        <P>
          A clip in the document is offered by every picker: a blueprint&apos;s rest{' '}
          <Em>pose</Em>, the <C>animate</C> verb on a rule, a script&apos;s{' '}
          <C>self.runAnimation(&apos;clip&apos;, loop, parts)</C> — where <C>parts</C> like{' '}
          <C>[&apos;arms&apos;]</C> lays the clip over whatever else the body is doing, so a
          character waves while it walks.
        </P>
        <P>
          The one exception is the player&apos;s own body: it is animated from how it{' '}
          <Em>moves</Em> — idle, walk, run, air, land and the rest — and does not play arbitrary
          clips. What a level can do is ship its own clip under a name the stance machine already
          asks for, which is how you change what a swing looks like.
        </P>
      </Section>

      <Section id="shortcuts" title="Shortcuts">
        <div className="mt-4 grid max-w-2xl gap-x-8 gap-y-2 text-sm text-ink-muted sm:grid-cols-2">
          {(
            [
              [<K key="space">Space</K>, 'play / pause'],
              [<K key="k">K</K>, 'key now'],
              [<K key="del">⌫</K>, 'remove key'],
              [
                <>
                  <K>←</K> / <K>→</K>
                </>,
                'step one frame',
              ],
              [
                <>
                  <K>↑</K> / <K>↓</K>
                </>,
                'next / previous key',
              ],
              [<K key="home">Home</K>, 'jump to start'],
              [
                <>
                  <K>C</K> / <K>V</K>
                </>,
                'copy / paste key',
              ],
              [
                <>
                  <K>⌘Z</K> / <K>⇧⌘Z</K>
                </>,
                'undo / redo',
              ],
            ] as const
          ).map(([keys, what], index) => (
            <p key={index} className="flex items-baseline gap-3">
              <span className="shrink-0">{keys}</span>
              <span>{what}</span>
            </p>
          ))}
        </div>
      </Section>
    </DocsShell>
  )
}
