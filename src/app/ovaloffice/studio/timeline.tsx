'use client'

import { X } from 'lucide-react'
import { useCallback, useRef } from 'react'
import { ACTION_META, type Action, actionLabel } from '@/domain/studio/action'
import { animatable, at, keyedProperties, type NodeKind, type Tracks } from '@/domain/studio/keys'
import type { Actor, ShotSpec } from '@/domain/studio/shot'

/**
 * The shot, as a picture of time.
 *
 * Everything in the panel beside it is a list of numbers, and a list of numbers
 * is the wrong shape for the only questions that matter while cutting: what is
 * happening at once, what is happening next, and how long anything lasts. Those
 * are spatial questions, and this is the answer to all three at a glance.
 *
 * ---------------------------------------------------------------------------
 * What is directly manipulable, and what is not
 * ---------------------------------------------------------------------------
 * Times are, and nothing else is. A clip can be dragged along its row and
 * stretched by its right edge; a key can be slid; the playhead follows a click
 * anywhere. Everything about an action *other* than when it happens - where a
 * move goes, what a line says, which face an emote pulls - is edited in the
 * inspector under it.
 *
 * That split is deliberate. Timing is the thing you judge by looking, so it
 * belongs to the mouse; a destination in blocks is a number you want to type
 * exactly, and a timeline that let you drag one would be a timeline where every
 * accidental nudge moved somebody two feet left.
 *
 * ---------------------------------------------------------------------------
 * Why it fits the width instead of scrolling
 * ---------------------------------------------------------------------------
 * A shot is capped at two minutes and is usually eight seconds. Fitting the
 * whole thing edge to edge means the picture is always complete - no scroll
 * position to lose, no half a shot off-screen while you are trying to see
 * whether two things overlap - and at eight seconds over a wide viewport, a
 * hundredth of a second is still about a pixel.
 */

/** Which node in the shot something belongs to. */
export interface NodeRef {
  kind: NodeKind | 'camera'
  index: number
}

/** What the inspector below is looking at. */
export interface Selected {
  node: NodeRef
  /** Which of the node's actions, when it is an actor and one is selected. */
  action: number | null
}

export const sameNode = (a: NodeRef, b: NodeRef) => a.kind === b.kind && a.index === b.index

/** Finest a drag will land. Two decimals, as everywhere else in the studio. */
const snap = (seconds: number) => at(seconds)

export function Timeline({
  shot,
  time,
  selected,
  onSelect,
  onSeek,
  onChange,
}: {
  shot: ShotSpec
  time: number
  selected: Selected | null
  onSelect: (selection: Selected) => void
  onSeek: (t: number) => void
  onChange: (next: ShotSpec) => void
}) {
  const lane = useRef<HTMLDivElement>(null)

  /** Seconds at a page x, from wherever the lanes actually start. */
  const secondsAt = useCallback(
    (clientX: number) => {
      const box = lane.current?.getBoundingClientRect()
      if (!box || box.width === 0) return 0
      const fraction = (clientX - box.left) / box.width
      return Math.min(shot.duration, Math.max(0, fraction * shot.duration))
    },
    [shot.duration],
  )

  /** Seconds per pixel, for turning a drag distance into a time distance. */
  const perPixel = useCallback(() => {
    const box = lane.current?.getBoundingClientRect()
    return box && box.width > 0 ? shot.duration / box.width : 0
  }, [shot.duration])

  const setActor = (index: number, fields: Partial<Actor>) =>
    onChange({
      ...shot,
      cast: shot.cast.map((actor, i) => (i === index ? { ...actor, ...fields } : actor)),
    })

  return (
    // `overflow-hidden`, because everything inside is positioned as a
    // percentage of the lane and the last tick sits at exactly 100% - so on a
    // narrow screen the ruler's final label was hanging off the right edge of
    // the phone rather than off the edge of the box.
    <div className="overflow-hidden rounded-2xl border border-border bg-secondary/30">
      <div className="flex">
        {/* The names, outside the lanes, so a clip at t=0 is not under them. */}
        {/* Half the width on a phone. A third of a 390px screen spent on the
            word "Camera" is a third not spent on the thing being timed. */}
        <div className="w-20 shrink-0 border-r border-border/70 sm:w-32">
          <div className="h-6 border-b border-border/70" />
          {shot.cast.map((actor, index) => (
            <NodeName
              key={`peep${index}`}
              label={actor.name || actor.avatar}
              detail={`${actor.actions.length} action${actor.actions.length === 1 ? '' : 's'}`}
              rows={keyedProperties(actor.tracks).length}
              active={selected ? sameNode(selected.node, { kind: 'peep', index }) : false}
              onClick={() => onSelect({ node: { kind: 'peep', index }, action: null })}
            />
          ))}
          <NodeName
            label="Camera"
            detail={`${shot.camera.length} key${shot.camera.length === 1 ? '' : 's'}`}
            rows={0}
            active={selected ? sameNode(selected.node, { kind: 'camera', index: 0 }) : false}
            onClick={() => onSelect({ node: { kind: 'camera', index: 0 }, action: null })}
          />
          {shot.blocks.map((block, index) => (
            <NodeName
              key={`block${index}`}
              label={block.model}
              detail="block"
              rows={keyedProperties(block.tracks).length}
              active={selected ? sameNode(selected.node, { kind: 'block', index }) : false}
              onClick={() => onSelect({ node: { kind: 'block', index }, action: null })}
            />
          ))}
          {shot.balls.map((_, index) => (
            <NodeName
              key={`ball${index}`}
              label="Ball"
              detail="ball"
              rows={keyedProperties(shot.balls[index].tracks).length}
              active={selected ? sameNode(selected.node, { kind: 'ball', index }) : false}
              onClick={() => onSelect({ node: { kind: 'ball', index }, action: null })}
            />
          ))}
          {shot.goals.map((_, index) => (
            <NodeName
              key={`goal${index}`}
              label="Goal"
              detail="goal"
              rows={keyedProperties(shot.goals[index].tracks).length}
              active={selected ? sameNode(selected.node, { kind: 'goal', index }) : false}
              onClick={() => onSelect({ node: { kind: 'goal', index }, action: null })}
            />
          ))}
          <NodeName
            label="Light"
            detail="rig"
            rows={keyedProperties(shot.light.tracks).length}
            active={selected ? sameNode(selected.node, { kind: 'light', index: 0 }) : false}
            onClick={() => onSelect({ node: { kind: 'light', index: 0 }, action: null })}
          />
        </div>

        {/* The lanes. One coordinate space, shared by every row and the head. */}
        <div ref={lane} className="relative min-w-0 flex-1">
          <Ruler duration={shot.duration} onSeek={(t) => onSeek(t)} secondsAt={secondsAt} />

          {shot.cast.map((actor, index) => (
            <ActorRow
              key={`peep${index}`}
              actor={actor}
              index={index}
              shot={shot}
              selected={selected}
              onSelect={onSelect}
              onSeek={onSeek}
              secondsAt={secondsAt}
              perPixel={perPixel}
              onChange={(fields) => setActor(index, fields)}
            />
          ))}

          <CameraRow
            shot={shot}
            selected={selected}
            onSelect={onSelect}
            onSeek={onSeek}
            secondsAt={secondsAt}
            perPixel={perPixel}
            onChange={onChange}
          />

          {shot.blocks.map((block, index) => (
            <KeyRows
              key={`block${index}`}
              tracks={block.tracks}
              node={{ kind: 'block', index }}
              shot={shot}
              onSelect={onSelect}
              onSeek={onSeek}
              secondsAt={secondsAt}
              perPixel={perPixel}
              onChange={onChange}
            />
          ))}
          {shot.balls.map((ball, index) => (
            <KeyRows
              key={`ball${index}`}
              tracks={ball.tracks}
              node={{ kind: 'ball', index }}
              shot={shot}
              onSelect={onSelect}
              onSeek={onSeek}
              secondsAt={secondsAt}
              perPixel={perPixel}
              onChange={onChange}
            />
          ))}
          {shot.goals.map((goal, index) => (
            <KeyRows
              key={`goal${index}`}
              tracks={goal.tracks}
              node={{ kind: 'goal', index }}
              shot={shot}
              onSelect={onSelect}
              onSeek={onSeek}
              secondsAt={secondsAt}
              perPixel={perPixel}
              onChange={onChange}
            />
          ))}
          <KeyRows
            tracks={shot.light.tracks}
            node={{ kind: 'light', index: 0 }}
            shot={shot}
            onSelect={onSelect}
            onSeek={onSeek}
            secondsAt={secondsAt}
            perPixel={perPixel}
            onChange={onChange}
          />

          {/* Drawn over everything, and deliberately not interactive - a
              playhead you can grab is a playhead that eats clicks meant for the
              clip underneath it. The ruler is the handle. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 z-20 w-px bg-accent"
            style={{ left: `${(Math.min(time, shot.duration) / shot.duration) * 100}%` }}
          >
            <div className="-ml-1 h-2 w-2 rounded-full bg-accent" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

/** How tall a row of clips is. The key rows under it are half that. */
const ROW = 'h-8'
const KEY_ROW = 'h-4'

function NodeName({
  label,
  detail,
  rows,
  active,
  onClick,
}: {
  label: string
  detail: string
  /** Key rows underneath, so the gutter stays level with the lanes. */
  rows: number
  active: boolean
  onClick: () => void
}) {
  return (
    <div className="border-b border-border/70">
      <button
        type="button"
        onClick={onClick}
        className={`flex ${ROW} w-full items-center gap-1.5 px-2 text-left text-xs transition hover:bg-secondary ${
          active ? 'bg-secondary text-foreground' : 'text-muted-foreground'
        }`}
      >
        <span className="truncate capitalize">{label}</span>
        {/* The count is the first thing to go: it is reassurance, and the row
            beside it already shows the clips it is counting. */}
        <span className="ml-auto hidden shrink-0 font-mono text-[10px] opacity-60 sm:inline">
          {detail}
        </span>
      </button>
      {/* One spacer per keyed property, so the diamonds line up with the name. */}
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={KEY_ROW} />
      ))}
    </div>
  )
}

function Ruler({
  duration,
  onSeek,
  secondsAt,
}: {
  duration: number
  onSeek: (t: number) => void
  secondsAt: (clientX: number) => number
}) {
  // One tick a second up to twenty, then every five, then every ten. Past that
  // the labels collide and the ruler becomes a grey bar.
  const step = duration <= 20 ? 1 : duration <= 60 ? 5 : 10
  const ticks: number[] = []
  for (let t = 0; t <= duration; t += step) ticks.push(t)

  return (
    <div
      role="presentation"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        onSeek(secondsAt(event.clientX))
      }}
      onPointerMove={(event) => {
        if (event.buttons === 1) onSeek(secondsAt(event.clientX))
      }}
      className="relative h-6 cursor-ew-resize border-b border-border/70 select-none"
    >
      {ticks.map((tick) => {
        // The last tick sits at 100%, where a label drawn to its right is a
        // label outside the box. Flipped to the left of its own line instead,
        // which is where a ruler's final number belongs anyway.
        const end = tick / duration > 0.92
        return (
          <div
            key={tick}
            className={`absolute top-0 h-full border-l border-border/60 font-mono text-[10px] leading-6 text-muted-foreground ${
              end ? '-translate-x-full pr-1' : 'pl-1'
            }`}
            style={{ left: `${(tick / duration) * 100}%` }}
          >
            {tick}s
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------

interface Lanes {
  secondsAt: (clientX: number) => number
  perPixel: () => number
}

/**
 * A drag that reports how far it has come, in seconds.
 *
 * Pointer capture rather than window listeners: the gesture belongs to the
 * element it started on, so a pointer that leaves the row - which it will,
 * because rows are eight pixels tall - keeps driving the same clip.
 */
function drag(
  event: React.PointerEvent,
  perPixel: () => number,
  onMove: (deltaSeconds: number) => void,
) {
  const element = event.currentTarget as HTMLElement
  const startX = event.clientX
  const scale = perPixel()

  element.setPointerCapture(event.pointerId)

  const move = (moved: PointerEvent) => onMove((moved.clientX - startX) * scale)
  const up = () => {
    element.removeEventListener('pointermove', move)
    element.removeEventListener('pointerup', up)
  }

  element.addEventListener('pointermove', move)
  element.addEventListener('pointerup', up)
}

function ActorRow({
  actor,
  index,
  shot,
  selected,
  onSelect,
  onSeek,
  secondsAt,
  perPixel,
  onChange,
}: Lanes & {
  actor: Actor
  index: number
  shot: ShotSpec
  selected: Selected | null
  onSelect: (selection: Selected) => void
  onSeek: (t: number) => void
  onChange: (fields: Partial<Actor>) => void
}) {
  const node: NodeRef = { kind: 'peep', index }

  const setAction = (i: number, fields: Partial<Action>) =>
    onChange({
      actions: actor.actions.map((action, j) =>
        i === j ? ({ ...action, ...fields } as Action) : action,
      ),
    })

  return (
    <div className="border-b border-border/70">
      <div
        role="presentation"
        onPointerDown={(event) => {
          // Only when the click missed every clip - otherwise selecting one
          // would also move the playhead out from under it.
          if (event.target === event.currentTarget) onSeek(secondsAt(event.clientX))
        }}
        className={`relative ${ROW} w-full`}
      >
        {actor.actions.map((action, i) => {
          const meta = ACTION_META[action.kind]
          const chosen =
            selected !== null && sameNode(selected.node, node) && selected.action === i

          return (
            <div
              key={i}
              className={`group/clip absolute inset-y-1 flex cursor-grab touch-none items-center overflow-hidden rounded border px-1.5 text-[10px] text-white ${meta.tone} ${
                chosen ? 'ring-2 ring-accent' : ''
              }`}
              style={{
                left: `${(action.t / shot.duration) * 100}%`,
                width: `${Math.max(0.6, (action.duration / shot.duration) * 100)}%`,
              }}
              onPointerDown={(event) => {
                event.stopPropagation()
                onSelect({ node, action: i })
                const from = action.t
                drag(event, perPixel, (delta) => {
                  setAction(i, { t: Math.max(0, snap(from + delta)) })
                })
              }}
            >
              <span className="truncate">{actionLabel(action)}</span>

              {/*
                Delete, where the thing being deleted is.
                Removing a clip used to mean selecting it and finding Remove in
                the inspector - two presses in two places, for the commonest
                edit there is. This is the same edit in one press, on the thing
                itself.

                Shown on hover and whenever the clip is selected, so it exists
                on a touch screen too - where there is no hover and tapping a
                clip is what selects it.

                On the *left*, because the right edge is the resize handle. One
                gesture that means two things depending on which four pixels you
                grabbed is how a timeline earns its reputation, and two controls
                sharing an edge is the same mistake wearing a hat.
              */}
              <button
                type="button"
                aria-label={`Remove ${meta.label.toLowerCase()}`}
                onPointerDown={(event) => {
                  // Before the clip's own handler, or this starts a drag and
                  // the click never lands.
                  event.stopPropagation()
                }}
                onClick={(event) => {
                  event.stopPropagation()
                  onChange({ actions: actor.actions.filter((_, j) => j !== i) })
                  // The selection was an index into a list that just got
                  // shorter, so it now points at the next clip along - or past
                  // the end. Cleared rather than adjusted: the inspector
                  // showing a different action than the one you deleted is
                  // worse than it showing none.
                  if (chosen) onSelect({ node, action: null })
                }}
                className={`absolute top-0 left-0 flex h-full w-4 items-center justify-center bg-black/30 text-white transition hover:bg-red-500/80 ${
                  chosen ? 'opacity-100' : 'opacity-0 group-hover/clip:opacity-100'
                }`}
              >
                <X className="size-2.5" aria-hidden />
              </button>

              {meta.resizable && (
                /* The stretch handle. Its own element so the body can be a
                   plain drag - one gesture that means two things depending on
                   which four pixels you grabbed is how a timeline earns its
                   reputation. */
                <span
                  role="presentation"
                  onPointerDown={(event) => {
                    event.stopPropagation()
                    onSelect({ node, action: i })
                    const from = action.duration
                    drag(event, perPixel, (delta) => {
                      setAction(i, { duration: Math.max(0.05, snap(from + delta)) })
                    })
                  }}
                  // Wider than it looks: the painted part is the right-hand
                  // sliver, and the rest is hit area for a fingertip, which is
                  // about ten times the size of a mouse cursor.
                  className="absolute inset-y-0 right-0 w-3 cursor-ew-resize touch-none border-r-2 border-white/60 bg-transparent"
                />
              )}
            </div>
          )
        })}
      </div>

      <Diamonds
        tracks={actor.tracks}
        node={node}
        shot={shot}
        onSelect={onSelect}
        onSeek={onSeek}
        perPixel={perPixel}
        secondsAt={secondsAt}
        onTracks={(tracks) => onChange({ tracks })}
      />
    </div>
  )
}

function CameraRow({
  shot,
  selected,
  onSelect,
  onSeek,
  secondsAt,
  perPixel,
  onChange,
}: Lanes & {
  shot: ShotSpec
  selected: Selected | null
  onSelect: (selection: Selected) => void
  onSeek: (t: number) => void
  onChange: (next: ShotSpec) => void
}) {
  const node: NodeRef = { kind: 'camera', index: 0 }

  return (
    <div className="border-b border-border/70">
      <div
        role="presentation"
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) onSeek(secondsAt(event.clientX))
        }}
        className={`relative ${ROW} w-full`}
      >
        {shot.camera.map((key, i) => (
          <button
            key={i}
            type="button"
            title={`Framing at ${key.t.toFixed(2)}s`}
            onPointerDown={(event) => {
              event.stopPropagation()
              onSelect({ node, action: i })
              onSeek(key.t)
              const from = key.t
              drag(event, perPixel, (delta) => {
                const t = Math.max(0, snap(from + delta))
                onChange({
                  ...shot,
                  camera: shot.camera
                    .map((existing, j) => (i === j ? { ...existing, t } : existing))
                    .sort((a, b) => a.t - b.t),
                })
              })
            }}
            style={{ left: `${(key.t / shot.duration) * 100}%` }}
            className={`absolute top-1/2 -ml-3 h-6 w-6 -translate-y-1/2 cursor-ew-resize touch-none rounded-full border-0 bg-transparent p-1.5 [&>span]:block [&>span]:h-full [&>span]:w-full [&>span]:rotate-45 [&>span]:border [&>span]:bg-sky-400 ${
              selected !== null && sameNode(selected.node, node) && selected.action === i
                ? '[&>span]:border-accent [&>span]:ring-2 [&>span]:ring-accent'
                : '[&>span]:border-sky-200/70'
            }`}
          >
            <span aria-hidden />
          </button>
        ))}
      </div>
    </div>
  )
}

/** A node with nothing but keys on it - blocks, balls, goals, the rig. */
function KeyRows({
  tracks,
  node,
  shot,
  onSelect,
  onSeek,
  secondsAt,
  perPixel,
  onChange,
}: Lanes & {
  tracks: Tracks
  node: NodeRef
  shot: ShotSpec
  onSelect: (selection: Selected) => void
  onSeek: (t: number) => void
  onChange: (next: ShotSpec) => void
}) {
  return (
    <div className="border-b border-border/70">
      <div
        role="presentation"
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) {
            onSelect({ node, action: null })
            onSeek(secondsAt(event.clientX))
          }
        }}
        className={`relative ${ROW} w-full`}
      />
      <Diamonds
        tracks={tracks}
        node={node}
        shot={shot}
        onSelect={onSelect}
        onSeek={onSeek}
        secondsAt={secondsAt}
        perPixel={perPixel}
        onTracks={(next) => onChange(writeTracks(shot, node, next))}
      />
    </div>
  )
}

/**
 * A thin row per keyed property, with a diamond per key.
 *
 * Only properties that have keys get a row. A row per *animatable* property
 * would be honest and unusable - the light alone has six, and a shot with three
 * blocks would open on thirty empty lanes.
 */
function Diamonds({
  tracks,
  node,
  shot,
  onSelect,
  onSeek,
  perPixel,
  onTracks,
}: Omit<Lanes, 'secondsAt'> & {
  secondsAt: (clientX: number) => number
  tracks: Tracks
  node: NodeRef
  shot: ShotSpec
  onSelect: (selection: Selected) => void
  onSeek: (t: number) => void
  onTracks: (tracks: Tracks) => void
}) {
  const properties = keyedProperties(tracks)
  const kind: NodeKind = node.kind === 'camera' ? 'peep' : node.kind

  return (
    <>
      {properties.map((property) => (
        <div key={property} className={`relative ${KEY_ROW} w-full`}>
          <span className="pointer-events-none absolute left-1 top-0 font-mono text-[10px] leading-4 text-muted-foreground/70">
            {animatable(kind, property)?.label ?? property}
          </span>
          {tracks[property].map((key, i) => (
            <button
              key={i}
              type="button"
              title={`${property} at ${key.t.toFixed(2)}s = ${key.value}`}
              onPointerDown={(event) => {
                event.stopPropagation()
                onSelect({ node, action: null })
                onSeek(key.t)
                const from = key.t
                drag(event, perPixel, (delta) => {
                  const t = Math.max(0, snap(from + delta))
                  onTracks({
                    ...tracks,
                    [property]: tracks[property]
                      .map((existing, j) => (i === j ? { ...existing, t } : existing))
                      .sort((a, b) => a.t - b.t),
                  })
                })
              }}
              style={{ left: `${(key.t / shot.duration) * 100}%` }}
              // Same trick as the camera keys: a six-pixel diamond inside a
              // twenty-pixel button, because a diamond you cannot hit is a
              // keyframe you cannot re-time on a phone.
              className="absolute top-1/2 -ml-2.5 h-5 w-5 -translate-y-1/2 touch-none cursor-ew-resize border-0 bg-transparent p-1.5"
            >
              <span
                aria-hidden
                className="block h-full w-full rotate-45 border border-amber-200/70 bg-amber-400"
              />
            </button>
          ))}
        </div>
      ))}
    </>
  )
}

/**
 * A node's keys, written back into the shot.
 *
 * The one place that knows how a `NodeRef` maps onto the document, so the rows
 * above can be generic over which kind of node they are drawing.
 */
export function writeTracks(
  shot: ShotSpec,
  node: NodeRef,
  // Loosely typed on purpose: the row components deal in "a bag of keys" and
  // have no reason to import the `Tracks` shape to hand it straight back.
  tracks: Tracks,
): ShotSpec {
  const cast = tracks as ShotSpec['light']['tracks']

  switch (node.kind) {
    case 'peep':
      return {
        ...shot,
        cast: shot.cast.map((actor, i) => (i === node.index ? { ...actor, tracks: cast } : actor)),
      }
    case 'block':
      return {
        ...shot,
        blocks: shot.blocks.map((block, i) =>
          i === node.index ? { ...block, tracks: cast } : block,
        ),
      }
    case 'ball':
      return {
        ...shot,
        balls: shot.balls.map((ball, i) => (i === node.index ? { ...ball, tracks: cast } : ball)),
      }
    case 'goal':
      return {
        ...shot,
        goals: shot.goals.map((goal, i) => (i === node.index ? { ...goal, tracks: cast } : goal)),
      }
    case 'light':
      return { ...shot, light: { ...shot.light, tracks: cast } }
    case 'camera':
      // The camera's framings are their own list - see the note in `ShotSpec`.
      return shot
  }
}
