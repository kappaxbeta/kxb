'use client'

import { useMemo, useRef, useState } from 'react'
import { posedAt, type XpTimeline } from '@kxb/xp/movie'
import { ENTITY_STEP, placeIn, settleAngle, snap } from '@kxb/xp/edit'
import type { EntitySpec } from '@kxb/xp'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { xpEditorDict } from '@/app/i18n/xp-editor'
import { Bar, Pads, TURN_RATE, Turns } from '@/app/xp/_editor/movie/parts'
import { useBoneTurn } from '@/app/xp/_editor/movie/pose'
import type { XpClip } from '@kxb/xp/clips'
import type { SkeletonId } from '@kxb/xp/packs'
import { Hint } from '@/app/xp/_editor/chrome'
import { Chip } from '@/app/xp/_editor/movie/mode'
import type { MovieEdits } from '@/app/xp/_editor/movie/mode'

/** Which of the three the pads drive. */
export type Tool = 'move' | 'turn' | 'size'

/**
 * Move, turn and size, as one set of pads.
 *
 * ---------------------------------------------------------------------------
 * Why this is a component and not a block inside the actor row
 * ---------------------------------------------------------------------------
 * It is in two places: the inspector row, where it always was, and a corner of
 * the stage, so that whatever you last clicked can be moved without going to
 * find its row. Those have to behave *identically* - the same snapping carry,
 * the same locks, the same one-edit writes - and the way two copies of that
 * stop behaving identically is that somebody fixes one of them.
 *
 * ---------------------------------------------------------------------------
 * One mode, not one per copy
 * ---------------------------------------------------------------------------
 * The tool and the locks are held **above** this, so the row and the corner
 * are one control seen twice rather than two controls that happen to look the
 * same. They were separate at first, on the reasoning that a person using the
 * corner is not looking at the row - which is wrong in the ordinary way: you
 * set the mode wherever your hand is, reach for the other copy, and find it
 * still on `move`. Two identical panels disagreeing about what they are for is
 * the report *"it not syncs"*, and there is no version of that a person would
 * describe as correct.
 */
export function Transformer({
  actor,
  timeline,
  at,
  autoKey,
  edits,
  tool,
  onTool,
  locked,
  onLocked,
  compact = false,
}: {
  actor: EntitySpec & { name: string }
  timeline: XpTimeline
  at: number
  autoKey: boolean
  edits: MovieEdits
  /** Which of the three is driving. Shared - see the note above. */
  tool: Tool
  onTool: (tool: Tool) => void
  locked: ReadonlySet<'x' | 'y' | 'z'>
  onLocked: (locked: ReadonlySet<'x' | 'y' | 'z'>) => void
  /** In a corner of the stage rather than a panel: tighter, and no prose. */
  compact?: boolean
}) {
  const t = xpEditorDict(useLocale()).movie

  const posed = useMemo(
    () => posedAt(actor, timeline, at).entity,
    [actor, timeline, at],
  )

  const own = (property: string): number => {
    switch (property) {
      case 'x':
        return posed.x
      case 'y':
        return posed.y
      case 'z':
        return posed.z
      case 'rotation':
        return posed.rotation
      case 'pitch':
        return posed.pitch ?? 0
      case 'roll':
        return posed.roll ?? 0
      case 'scale':
        return posed.scale
      case 'visible':
        return 1
      default:
        return 0
    }
  }

  /**
   * Several animatable numbers, in one edit.
   *
   * The counterpart of `place` for everything that is not a position. A pad
   * reports two axes from one push, and two `set` calls would keep whichever
   * was written last - see `putEntityKeys`, which exists for this.
   */
  const turn = (patch: Readonly<Record<string, number>>) => {
    if (Object.keys(patch).length === 0) return
    if (autoKey) edits.onKeys(actor.name, patch, at)
    else edits.onSetActor(actor.name, patch as Partial<EntitySpec>)
  }

  /**
   * Where the pad is trying to put this body, before the grid rounds it off.
   *
   * ---------------------------------------------------------------------------
   * The bug this exists for
   * ---------------------------------------------------------------------------
   * Positions are snapped to a tenth of a cell on the way into the document, and
   * one tick of a pad at part push is worth less than that. Read where the body
   * is, add 0.042, snap: you get back exactly where you started, and the next
   * tick does the same from the same place. The pad writes forty times a second
   * and the body never moves.
   *
   * It showed up as a stick that worked when pushed straight and did nothing on
   * the diagonal, because a straight push is 0.06 - over the half-step - and a
   * diagonal splits it into 0.042 on each axis, under it. A control that works
   * in four directions out of eight is worse than one that plainly does not
   * work, because you assume you are doing it wrong.
   *
   * So the *intent* is kept unsnapped and accumulated, and only the write is
   * rounded. `expected` is how this notices it is no longer the one in charge:
   * if the body is not where the last write should have put it, something else
   * moved it - a gizmo drag, a slider, another actor selected - and the intent
   * is stale and dropped.
   */
  const aiming = useRef<{
    want: { x: number; y: number; z: number }
    expected: { x: number; y: number; z: number }
  } | null>(null)

  /**
   * The unsnapped intent for the numbers that are not a position.
   *
   * ---------------------------------------------------------------------------
   * The same trap, one path over
   * ---------------------------------------------------------------------------
   * `aiming` above exists because positions snap. Angles and sizes do too, but
   * only on the way through `setEntity` - which is the **auto-key off** path.
   * With auto-key on the value is stored as written and none of this matters,
   * which is why it went unnoticed: the pads were only ever tested with keys.
   *
   * With keys off, `settleAngle` rounds a turn to a whole degree and `snap`
   * rounds a scale to a tenth, and a pad tick is smaller than either. The turn
   * pad moved at full push and stuck below about a third of one; the size bar,
   * at 0.03 a tick against a 0.1 step, could not move at *all*.
   *
   * So the same answer: keep the intent, settle only the write, and notice
   * when something else has moved the value by remembering where the last
   * write should have landed.
   */
  const intent = useRef(new Map<string, { want: number; expected: number }>())

  /**
   * One number, nudged - returning what to write.
   *
   * `settle` is the document's own rounding, or identity when auto-key is on
   * and there is none. Passing it in rather than deciding here keeps the two
   * halves of "what will this become" in one expression.
   */
  const bump = (property: string, by: number, settle: (value: number) => number) => {
    const here = own(property)
    const held = intent.current.get(property)
    const base = held && held.expected === here ? held.want : here
    const want = base + by
    intent.current.set(property, { want, expected: settle(want) })
    return want
  }

  /** What the document will do to a turn, and to a size, on the way in. */
  const asWritten = (value: number) => value
  const settleTurn = autoKey ? asWritten : settleAngle
  const settleSize = autoKey ? asWritten : (value: number) => Math.max(ENTITY_STEP, snap(value))

  const nudge = (by: { x: number; y: number; z: number }) => {
    const here = { x: own('x'), y: own('y'), z: own('z') }
    const carried =
      aiming.current &&
      aiming.current.expected.x === here.x &&
      aiming.current.expected.y === here.y &&
      aiming.current.expected.z === here.z
        ? aiming.current.want
        : here

    const want = {
      x: carried.x + (locked.has('x') ? 0 : by.x),
      y: carried.y + (locked.has('y') ? 0 : by.y),
      z: carried.z + (locked.has('z') ? 0 : by.z),
    }
    aiming.current = {
      want,
      expected: { x: snap(want.x), y: snap(want.y), z: snap(want.z) },
    }
    place(want)
  }

    /**
   * A whole position, in one edit.
   *
   * The pads used to call `set` twice - once for x, once for z - and the second
   * call threw the first away. Both writers start from the same render's
   * `state`, so the later one is built on a document that does not contain the
   * earlier one's change; what came out was a pad that moved on one axis only,
   * and which axis depended on the order the calls happened to be in.
   *
   * `moveActorAt` exists for this and the gizmo already uses it: three axes,
   * one edit, one undo step. When auto-key is off the same thing is true of the
   * base position, so that branch is one `onSetActor` rather than three.
   */
  const place = (to: { x: number; y: number; z: number }) => {
    if (autoKey) edits.onMoveActor(actor.name, at, to)
    else edits.onSetActor(actor.name, to)
  }

  /** How many keys this body carries, for the row's chip. */

  return (
    <div className={`flex flex-col ${compact ? 'gap-1' : 'gap-1.5'}`}>
      {/*
        One pad pair, three meanings.

        Move, turn and size are the same gesture applied to different numbers,
        and giving each its own pads would be three sticks on a 320px column
        where only one of them is ever the one you want. A chooser is smaller
        than the controls it replaces and it is also the honest shape: an
        author is *in* a mode - nudging things into place, or turning them - and
        switching is the thing they do rarely.
      */}
      <div className="flex flex-wrap items-center gap-1">
        {(['move', 'turn', 'size'] as const).map((one) => (
          <Chip key={one} on={tool === one} onClick={() => onTool(one)}>
            {one === 'move' ? t.toolMove : one === 'turn' ? t.toolTurn : t.toolSize}
          </Chip>
        ))}
        <span className="ml-auto flex items-center gap-0.5">
          <span className="font-mono text-[8px] uppercase tracking-wider text-neutral-700">
            {t.lock}
          </span>
          {(['x', 'y', 'z'] as const).map((axis) => (
            <button
              key={axis}
              type="button"
              title={t.lockTitle}
              onClick={() => {
                const next = new Set(locked)
                if (next.has(axis)) next.delete(axis)
                else next.add(axis)
                onLocked(next)
              }}
              className={`rounded px-1 py-0.5 font-mono text-[9px] transition-colors ${
                locked.has(axis)
                  ? 'bg-amber-400/15 text-amber-300'
                  : 'text-neutral-600 hover:text-neutral-300'
              }`}
            >
              {axis}
            </button>
          ))}
        </span>
      </div>

      {tool === 'move' ? (
        <Pads
          onNudge={(by) => nudge({ x: by.x, y: 0, z: by.z })}
          onLift={(by) => nudge({ x: 0, y: by, z: 0 })}
        />
      ) : null}

      {tool === 'turn' ? (
        /*
          Pitch on the pad's up-down and facing on its left-right, roll on the
          bar. The same split the bones use, and for the same reason: aiming a
          thing and rolling it about the way it already points are different
          acts, and one pad shared between them makes each a small accident of
          the other.
        */
        <Turns
          onSwing={(by) =>
            turn({
              ...(locked.has('x') ? {} : { pitch: bump('pitch', by.x, settleTurn) }),
              ...(locked.has('y') ? {} : { rotation: bump('rotation', by.y, settleTurn) }),
            })
          }
          onTwist={(by) => turn(locked.has('z') ? {} : { roll: bump('roll', by, settleTurn) })}
        />
      ) : null}

      {tool === 'size' ? (
        /*
          One bar, because a scale is one number here. The pad is left out
          rather than wired to something invented: an entity has a uniform
          scale and a `stretch` that is a property of the *blueprint*, so a
          two-axis size pad would be editing a thing the row is not about.
        */
        <div className="flex items-center gap-2">
          <Bar
            onPush={(by) => turn({ scale: bump('scale', by, settleSize) })}
            label="Scale"
            mark="s"
            rate={0.03}
          />
          <Hint>{t.sizeIsOne}</Hint>
        </div>
      ) : null}
    </div>
  )
}


/**
 * The chosen bone's pads, for the corner of the stage.
 *
 * Separate from `Transformer` because a bone is not a thing you move or scale
 * - it turns, and that is all it does. Offering greyed-out move and size chips
 * on a joint would be three controls where one is real.
 *
 * Which bone is already decided elsewhere: the dot you clicked in the picture,
 * or the panel's select. This only turns it.
 */
export function BoneTransformer({
  entity,
  rig,
  clips,
  bone,
  onClips,
  onPose,
  at,
  start,
  poseNow,
}: {
  entity: string
  rig: SkeletonId
  clips: Readonly<Record<string, XpClip>> | undefined
  bone: string
  onClips: (clips: Readonly<Record<string, XpClip>>) => void
  onPose: (clips: Readonly<Record<string, XpClip>>, clip: string, start: number) => void
  /** The playhead, and where this body's pose clip is cued. See `useBoneTurn`. */
  at: number
  start: number | null
  /** Read the body's pose as drawn. See `poseNow` in `useBoneTurn`. */
  poseNow?: () => Record<string, number[]> | null
}) {
  const t = xpEditorDict(useLocale()).movie
  const [locked, setLocked] = useState<ReadonlySet<'x' | 'y' | 'z'>>(new Set())
  const { angles, axes, limits, turnBy } = useBoneTurn({
    entity,
    rig,
    clips,
    bone,
    onClips,
    onPose,
    at,
    start,
    ...(poseNow ? { poseNow } : {}),
  })

  /** The one axis a hinge has, if this is one. See `axes`. */
  const hinge = axes.length === 1 ? axes[0] : undefined
  const angle = hinge ? (angles[bone]?.[hinge] ?? 0) : 0

  return (
    <div className="flex items-center gap-2">
      {/*
        A hinge gets one bar; everything else gets the pad and the twist.

        It used to get a *sentence* - "a hinge turns one way, use the slider" -
        which is a dead end in the one place you are looking. An elbow is one
        of the most-posed joints on the rig and the corner is where you are
        when you click it, so sending you back to a panel to bend it made the
        corner useless for exactly the bone you had picked.
      */}
      {hinge ? (
        <>
          <Bar
            onPush={(by) => turnBy({ [hinge]: by }, locked)}
            label="Bend"
            mark={hinge}
            rate={TURN_RATE}
          />
          {/*
            The angle and its stops, because a hinge has them and a bar that
            has quietly reached the end of its travel is indistinguishable from
            one that is not working.
          */}
          <span className="font-mono text-[9px] leading-tight text-neutral-500">
            {Math.round(angle)}°
            <span className="block text-neutral-700">
              {limits.min}…{limits.max}
            </span>
          </span>
        </>
      ) : (
        <Turns
          onSwing={(by) => turnBy({ x: by.x, y: by.y }, locked)}
          onTwist={(by) => turnBy({ z: by }, locked)}
        />
      )}

      {hinge ? null : (
        <div className="flex flex-col gap-0.5">
          {(['x', 'y', 'z'] as const).map((axis) => (
            <button
              key={axis}
              type="button"
              title={t.lockTitle}
              onClick={() =>
                setLocked((was) => {
                  const next = new Set(was)
                  if (next.has(axis)) next.delete(axis)
                  else next.add(axis)
                  return next
                })
              }
              className={`rounded px-1.5 py-0.5 text-left font-mono text-[9px] transition-colors ${
                locked.has(axis)
                  ? 'bg-amber-400/15 text-amber-300'
                  : 'text-neutral-600 hover:text-neutral-300'
              }`}
            >
              {axis}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
