'use client'

import { Pin } from 'lucide-react'
import { useMemo, useRef } from 'react'
import { type BoneSpec, GROUP_LABELS } from '@/domain/animator/rig'

/**
 * The two controls for turning a bone by hand: the pad you find an angle on,
 * and the list you pick a bone from.
 *
 * Lifted out of `./animator` when the video studio grew its own bone panel.
 * Neither knows anything about a document - the pad reports three angles and
 * the list reports a name - which is why one copy can serve an editor whose
 * clip is a file and an editor whose clip lives on an actor in a shot.
 */

/**
 * A colour per axis, and the same three everywhere.
 *
 * Red, green, blue for pitch, turn and roll - which is not a taste, it is the
 * convention every three-dimensional tool has used for thirty years, and the
 * one anybody who has touched a gizmo already knows. The point of spending
 * colour here is that the pad, the sliders and the dot are three views of the
 * same rotation: drag the pad sideways and the green slider moves, so the pad
 * needs no legend and the sliders need no diagram.
 */
export const AXIS = { pitch: '#ff6b6b', turn: '#6bd88a', roll: '#6aa9ff' } as const

/**
 * The pad for the bone you have picked.
 *
 * A trackpad rather than a joystick: it moves the rotation *by* how far you
 * drag rather than *to* where you press, which is the difference between
 * nudging a shoulder five degrees and having it snap to wherever your thumb
 * landed. The sliders under it stay the way to say an exact number - this is
 * the way to find one.
 *
 * Sideways is turn and up is pitch, and both are drawn in their own colour, so
 * which slider is about to move is answered by the ruling you are dragging
 * along rather than by a label.
 *
 * Roll is deliberately not here. Two axes are what a flat surface has, and a
 * pad that put the third on a modifier key would be a pad that does nothing on
 * a phone - which is the one place it is most worth having.
 */
export function PosePad({
  pitch,
  turn,
  roll,
  onChange,
}: {
  pitch: number
  turn: number
  roll: number
  onChange: (next: { pitch: number; turn: number; roll: number }) => void
}) {
  /** Where the drag started, and what the angles were then. */
  const from = useRef<{ x: number; y: number; pitch: number; turn: number } | null>(null)

  /**
   * Degrees per pixel.
   *
   * The pad is about 180 across and each axis spans 360, so two degrees a pixel
   * would cross the whole range corner to corner. Deliberately slower than
   * that: most posing is a few degrees, and a pad you have to be careful with
   * is worse than one you have to drag twice.
   */
  const RATE = 0.9

  const dot = (angle: number) => 50 + (Math.max(-180, Math.min(180, angle)) / 180) * 42

  /** Against an end of the range, where dragging further does nothing. */
  const atPitchLimit = Math.abs(pitch) >= 180
  const atTurnLimit = Math.abs(turn) >= 180

  /** Where a roll drag started, and what the roll was then. */
  const rolling = useRef<{ y: number; roll: number } | null>(null)

  return (
    <div className="flex shrink-0 items-stretch gap-1.5">
    <div
      className="relative size-[9.5rem] shrink-0 touch-none overflow-hidden rounded-xl border border-border bg-secondary/40"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        from.current = { x: event.clientX, y: event.clientY, pitch, turn }
      }}
      onPointerMove={(event) => {
        const start = from.current
        if (!start) return
        const clamp = (value: number) => Math.max(-180, Math.min(180, Math.round(value)))
        onChange({
          // Up is *less* pitch, because dragging up on a pad lifts the end of
          // the bone, and a pad that did the opposite would fight every mouse
          // in the building.
          pitch: clamp(start.pitch - (event.clientY - start.y) * RATE),
          turn: clamp(start.turn + (event.clientX - start.x) * RATE),
          roll,
        })
      }}
      onPointerUp={() => {
        from.current = null
      }}
      onPointerCancel={() => {
        from.current = null
      }}
    >
      {/* The rulings, in the colour of the axis they run along. */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-1/2 h-px opacity-70"
        style={{ background: AXIS.turn }}
      />
      <span
        aria-hidden
        className="absolute inset-y-0 left-1/2 w-px opacity-70"
        style={{ background: AXIS.pitch }}
      />
      {[20, 35, 65, 80].map((at) => (
        <span
          key={at}
          aria-hidden
          className="absolute inset-x-0 h-px bg-border/60"
          style={{ top: `${at}%` }}
        />
      ))}
      {[20, 35, 65, 80].map((at) => (
        <span
          key={at}
          aria-hidden
          className="absolute inset-y-0 w-px bg-border/60"
          style={{ left: `${at}%` }}
        />
      ))}

      {/*
        Which way is which, said on the pad rather than only in the sliders.

        Four letters at the four edges, each in its own axis colour: the pad is
        a surface you drag on and until now nothing on it said what dragging
        *does* - you found out by moving and watching a number. They are placed
        where the drag goes, so the label is the direction.
      */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0.5 text-center font-mono text-[10px] leading-none opacity-70"
        style={{ color: AXIS.pitch }}
      >
        up
      </span>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0.5 text-center font-mono text-[10px] leading-none opacity-70"
        style={{ color: AXIS.pitch }}
      >
        down
      </span>
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1 -translate-y-1/2 font-mono text-[10px] leading-none opacity-70"
        style={{ color: AXIS.turn }}
      >
        ←
      </span>
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-1 -translate-y-1/2 font-mono text-[10px] leading-none opacity-70"
        style={{ color: AXIS.turn }}
      >
        →
      </span>

      {/*
        The ends of the range, drawn only once you are against one.

        A pad clamps at ±180 and said nothing about it, so a drag that had
        stopped moving the bone looked identical to one that was still turning
        it. The edge the value is pinned against lights up in that axis's
        colour, which answers "why has this stopped" without a number.
      */}
      {atPitchLimit && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 h-0.5"
          style={{ background: AXIS.pitch, [pitch > 0 ? 'top' : 'bottom']: 0 }}
        />
      )}
      {atTurnLimit && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-0.5"
          style={{ background: AXIS.turn, [turn > 0 ? 'right' : 'left']: 0 }}
        />
      )}

      {/* Where the bone is now, between the two colours it is made of. */}
      <span
        aria-hidden
        className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background"
        style={{
          left: `${dot(turn)}%`,
          top: `${dot(-pitch)}%`,
          background: `linear-gradient(135deg, ${AXIS.turn}, ${AXIS.pitch})`,
        }}
      />
    </div>

    {/*
      Roll, up and down its own strip.

      The pad has two surfaces and a bone has three angles, so the third one had
      no way to be *found* - only typed, on a slider, which is the control for
      saying a number you already know rather than the one for discovering it.
      Asked for as "a z to make it up or down".

      A tall strip rather than a third axis on the pad, because a pad cannot
      carry one: two dimensions of drag are already spent, and a modifier key
      for the third is a control with no surface on a touchscreen and no sign of
      itself on a mouse.

      Vertical because rolling reads as tipping. It is drawn in the roll colour
      the sliders already use, which is what makes the strip and the blue slider
      beside it obviously the same number.
    */}
    <div
      role="slider"
      tabIndex={0}
      aria-label="Roll"
      aria-valuenow={Math.round(roll)}
      aria-valuemin={-180}
      aria-valuemax={180}
      className="relative w-6 shrink-0 touch-none overflow-hidden rounded-xl border border-border bg-secondary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        rolling.current = { y: event.clientY, roll }
      }}
      onPointerMove={(event) => {
        const start = rolling.current
        if (!start) return
        const clamp = (value: number) => Math.max(-180, Math.min(180, Math.round(value)))
        // Up is *more* roll, matching the pad's rule that dragging up raises
        // the end of the bone: both read as lifting the far side.
        onChange({ pitch, turn, roll: clamp(start.roll - (event.clientY - start.y) * RATE) })
      }}
      onKeyDown={(event) => {
        // The keyboard's whole share of this control, because a div with a
        // role is a promise: arrows nudge, shift takes ten.
        const step = event.shiftKey ? 10 : 1
        const way = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0
        if (way === 0) return
        event.preventDefault()
        onChange({
          pitch,
          turn,
          roll: Math.max(-180, Math.min(180, Math.round(roll + way * step))),
        })
      }}
      onPointerUp={() => {
        rolling.current = null
      }}
      onPointerCancel={() => {
        rolling.current = null
      }}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-1/2 h-px opacity-70"
        style={{ background: AXIS.roll }}
      />
      <span
        aria-hidden
        className="absolute left-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background"
        style={{ top: `${dot(-roll)}%`, background: AXIS.roll }}
      />
    </div>
    </div>
  )
}

export function BoneList({
  bones: all,
  selected,
  pins,
  onSelect,
  onPin,
}: {
  /** The posed body's handles. A fox has no shoulders to list. */
  bones: BoneSpec[]
  selected: string | null
  pins: ReadonlySet<string>
  onSelect: (bone: string) => void
  onPin: (bone: string) => void
}) {
  const groups = useMemo(() => {
    const out = new Map<BoneSpec['group'], BoneSpec[]>()
    for (const bone of all) {
      const list = out.get(bone.group) ?? []
      list.push(bone)
      out.set(bone.group, list)
    }
    return [...out]
  }, [all])

  return (
    <div className="flex flex-col gap-2">
      {groups.map(([group, bones]) => (
        <div key={group}>
          <p className="mb-1 font-mono text-[10px] text-muted-foreground uppercase">
            {GROUP_LABELS[group]}
          </p>
          <div className="flex flex-wrap gap-1">
            {bones.map((bone) => (
              <span key={bone.name} className="inline-flex">
                <button
                  type="button"
                  onClick={() => onSelect(bone.name)}
                  className={`rounded-l-md border px-2 py-0.5 text-[11px] transition ${
                    selected === bone.name
                      ? 'border-accent bg-accent/20 text-foreground'
                      : 'border-border bg-secondary/40 text-muted-foreground hover:text-foreground'
                  } ${bone.pinnable ? '' : 'rounded-r-md'}`}
                >
                  {bone.label}
                </button>
                {bone.pinnable && (
                  <button
                    type="button"
                    onClick={() => onPin(bone.name)}
                    aria-label={`${pins.has(bone.name) ? 'Unpin' : 'Pin'} ${bone.label}`}
                    className={`rounded-r-md border border-l-0 px-1 py-0.5 transition ${
                      pins.has(bone.name)
                        ? 'border-accent bg-accent/30 text-foreground'
                        : 'border-border bg-secondary/40 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Pin className="size-3" aria-hidden />
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
