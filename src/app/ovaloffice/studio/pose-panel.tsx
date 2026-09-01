'use client'

import { Bone, PersonStanding, RotateCcw } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { AXIS, BoneList, PosePad } from '@/app/ovaloffice/animator/bone-panel'
import { boneEuler, setBoneEuler } from '@/app/ovaloffice/animator/stage'
import type { RigHandle } from '@/app/ovaloffice/animator/posing'
import { Section, Slide } from '@/app/ovaloffice/studio/parts'
import type { Pose } from '@/domain/animator/clip'
import { RIGS, type RigId } from '@/domain/animator/rig'

/**
 * The bone you have hold of, in the video studio's panel.
 *
 * The animator's own bone panel, minus the parts that only make sense beside a
 * clip document: no pins, and no per-axis undo tag. It draws the same pad, the
 * same three coloured sliders and the same grouped bone list, because a person
 * who has posed a body in one editor should not have to learn the other.
 *
 * What is different is where the pose *goes*. In the animator it becomes a key
 * in the file being edited; here it becomes a key on the actor's clip at the
 * playhead, which the shot then plays. Both are `onPose(pose)`, and neither
 * this component nor the pad below it knows which.
 */
export function PosePanel({
  rig,
  look,
  bone,
  pose,
  onBone,
  onPose,
  onDone,
}: {
  /** The live rig of the body standing in the shot, or null before it loads. */
  rig: RigHandle | null
  /** Which look the actor wears, so the right bone list is drawn. */
  look: string
  bone: string | null
  /** The pose as the document currently has it, for reading the angles back. */
  pose: Pose | null
  onBone: (bone: string) => void
  onPose: (pose: Pose) => void
  /**
   * Letting go of the body, where there is anything to let go of.
   *
   * The still editor's: a click on a peep is what picks one up, so there has
   * to be a way to put it down that is not "click precisely nowhere". The
   * video studio has its own Pose/Done toggle above the viewport and passes
   * nothing here.
   */
  onDone?: () => void
}) {
  const rigId: RigId = look.includes('/') ? 'dummy' : 'peep'
  const body = RIGS[rigId]
  const spec = bone ? body.bones.find((one) => one.name === bone) ?? null : null

  /**
   * The angles, read off the live rig rather than off the document.
   *
   * The two agree everywhere except during the moment right after a drag, and
   * where they differ the rig is the one that is on screen. `boneEuler` wants
   * a pose, so the rig's own capture stands in when the document has nothing
   * to say yet - which is every bone before its first key.
   */
  const angles =
    rig && bone ? boneEuler(rig, pose ?? rig.capture(), bone) : { x: 0, y: 0, z: 0 }

  const turn = (next: { x: number; y: number; z: number }) => {
    if (!rig || !bone) return
    const turned = setBoneEuler(rig, bone, next)
    if (turned) onPose(turned)
  }

  /**
   * The bone's controls, brought to where you are looking.
   *
   * Clicking a dot on the body is how a joint gets picked, and until now that
   * was the whole of it: the pad and the three sliders for what you had just
   * picked were somewhere down a long panel - on a desktop that panel is its
   * own scroller, on a phone it is below the viewport entirely. Reported as
   * being unable to select a joint from the scene "and get there": the
   * selecting worked, the getting there did not.
   *
   * Checked-then-`start` rather than `nearest`. `nearest` scrolls the least it
   * can get away with, and this section - a pad, three sliders and a list of
   * twenty bones - is taller than the panel that holds it, so the least it can
   * get away with left the pad still below the fold. Measuring first is what
   * keeps that from being jumpy: a bone picked from the list below is already
   * on screen and nothing moves.
   */
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!bone) return

    /*
      A frame later, because picking a bone is what *grows* this panel.
      Selecting a joint swaps a line of prose for a pad, three sliders and a
      straighten button, so at the moment the effect runs the browser still has
      the old layout: measuring then decides where to scroll from a box that is
      about to move, and the scroll lands short of the controls it was aiming
      at. One frame is enough for the new box to exist.
    */
    const frame = requestAnimationFrame(() => {
      const node = panel.current
      if (!node) return

      // The box it has to be inside: the panel's own scroller where there is
      // one - the desktop layout - and the window on a phone, where the whole
      // page scrolls instead.
      let scroller: HTMLElement | null = node.parentElement
      while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) {
        scroller = scroller.parentElement
      }
      const within = scroller
        ? scroller.getBoundingClientRect()
        : new DOMRect(0, 0, window.innerWidth, window.innerHeight)

      const here = node.getBoundingClientRect()
      if (here.top >= within.top && here.top < within.bottom - 40) return
      node.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    return () => cancelAnimationFrame(frame)
  }, [bone])

  return (
    <div ref={panel} className="scroll-mt-2">
    <Section
      title={spec ? spec.label : 'Skeleton'}
      summary={spec ? undefined : `${body.bones.length} bones`}
      icon={spec ? Bone : PersonStanding}
      open
    >
      {!rig && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Waiting for the body to arrive. The handles appear on it in the
          viewport as soon as it does.
        </p>
      )}

      {rig && spec && (
        <>
          {/* The pad and the numbers side by side rather than one under the
              other: they are two ways of saying the same thing, and a column
              would read as two steps. */}
          <div className="flex items-start gap-3">
            <PosePad
              pitch={angles.x}
              turn={angles.y}
              roll={angles.z}
              onChange={(next) => turn({ x: next.pitch, y: next.turn, z: next.roll })}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              {(['x', 'y', 'z'] as const).map((axis) => (
                <Slide
                  key={axis}
                  label={axis === 'x' ? 'Pitch' : axis === 'y' ? 'Turn' : 'Roll'}
                  value={angles[axis]}
                  min={-180}
                  max={180}
                  step={1}
                  unit="°"
                  tint={axis === 'x' ? AXIS.pitch : axis === 'y' ? AXIS.turn : AXIS.roll}
                  onChange={(value) => turn({ ...angles, [axis]: value })}
                />
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!rig || !bone) return
              const rest = rig.restQuats.get(bone)
              const node = rig.bones.get(bone)
              if (!rest || !node) return
              node.quaternion.copy(rest)
              node.updateMatrixWorld(true)
              onPose(rig.capture())
            }}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary/40 px-2 py-1.5 text-xs text-muted-foreground transition hover:border-accent/60 hover:text-foreground"
          >
            <RotateCcw className="size-3.5" aria-hidden /> Straighten {spec.label}
          </button>
        </>
      )}

      {rig && !spec && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Drag a dot on the body in the viewport, or pick a bone below. Every
          drag writes a key at the playhead.
        </p>
      )}

      {onDone && (
        <button
          type="button"
          onClick={onDone}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-xs text-muted-foreground transition hover:border-accent/60 hover:text-foreground"
        >
          Done posing
        </button>
      )}

      <BoneList
        bones={body.bones}
        selected={bone}
        // Pins are the animator's: they hold a foot down over a long keyed
        // performance, which is a thing you do in the editor built around one
        // clip rather than while posing an actor inside a shot.
        pins={NO_PINS}
        onSelect={onBone}
        onPin={() => {}}
      />

      {rig && (
        <button
          type="button"
          onClick={() => {
            rig.apply(rig.rest)
            for (const [name, node] of rig.bones) {
              const rest = rig.restQuats.get(name)
              if (rest) node.quaternion.copy(rest)
            }
            rig.root.updateMatrixWorld(true)
            onPose(rig.capture())
          }}
          className="flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        >
          <RotateCcw className="size-3.5" aria-hidden /> Back to the rest pose
        </button>
      )}
    </Section>
    </div>
  )
}

const NO_PINS: ReadonlySet<string> = new Set()
