'use client'

import { useCallback, useRef, useState } from 'react'
import {
  keyedProperties,
  type ActionKind,
  type Cut,
  type XpAction,
  type XpTimeline,
  EASES,
  type Ease,
} from '@kxb/xp/movie'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { xpEditorDict } from '@/app/i18n/xp-editor'

/**
 * The time axis, with a row per thing that moves.
 *
 * ---------------------------------------------------------------------------
 * The playhead is dragged, not typed
 * ---------------------------------------------------------------------------
 * Every gesture here is "put the playhead somewhere and look". Scrubbing is
 * how a shot is read, and it is the one interaction that has to feel like
 * dragging a physical thing - so the whole strip is the target, pointer capture
 * is taken on the way down, and a click anywhere on it is a jump. A handle you
 * have to hit is a scrubber people give up on.
 *
 * ---------------------------------------------------------------------------
 * A row per keyed actor, and none for the rest
 * ---------------------------------------------------------------------------
 * The alternative - a row for everything in the place, most of them empty - was
 * tried in the studio and its own header records why it lost: every animatable
 * property became a row, and a shot with two moving things looked like a shot
 * with thirty. So a row appears when something is keyed on it and goes when the
 * last key does, which is also exactly what `dropEntityKey` does to the file.
 *
 * The two lanes at the top are different in kind and drawn differently: cuts
 * are *the film's* own edit and cues are things bodies do, and neither belongs
 * to an actor's row.
 */

/**
 * How wide the names column is, in pixels.
 *
 * A constant rather than a utility class on each row, because **every** strip
 * here has to start at the same x or the whole panel lies. It did: the ruler and
 * the two lanes ran the full width while the key rows were inset by their
 * property labels, so a key written at four seconds drew about forty pixels to
 * the right of the playhead that wrote it. Which is a timeline whose only job -
 * saying when something happens - it was doing wrongly, in the one way nobody
 * checks because the numbers in the file were right all along.
 */
const GUTTER = 96

export interface TimelineProps {
  timeline: XpTimeline
  /** Where the playhead is, in seconds. */
  at: number
  onScrub: (seconds: number) => void
  /** The stretch play cycles, if any, and marking one. See `MovieClock`. */
  loop: { from: number; to: number } | null
  onLoop: (loop: { from: number; to: number } | null) => void
  /** Who is selected, so their row can say so and clicking a row can select. */
  selected: readonly string[]
  onSelect: (name: string) => void
  onDropKey: (entity: string, property: string, index: number) => void
  /** How a key leaves for the next one. See `setKeyEase`. */
  onKeyEase: (entity: string, property: string, index: number, ease: Ease) => void
  onDropCut: (index: number) => void
  onDropAction: (index: number) => void
  /** An action moved or resized on the strip. */
  onSetAction: (index: number, patch: { t?: number; duration?: number }) => void
}

export function Timeline({
  timeline,
  at,
  onScrub,
  loop,
  onLoop,
  selected,
  onSelect,
  onDropKey,
  onKeyEase,
  onDropCut,
  onDropAction,
  onSetAction,
}: TimelineProps) {
  const t = xpEditorDict(useLocale()).movie
  /**
   * Which key is open, if any.
   *
   * One at a time and by identity rather than a flag on the key: a key has no
   * place carrying "am I being looked at", and two chooser rows open at once is
   * a strip that has grown a second height for no reason.
   */
  const [picked, setPicked] = useState<{
    entity: string
    property: string
    index: number
  } | null>(null)
  const strip = useRef<HTMLDivElement | null>(null)

  const seconds = useCallback(
    (clientX: number): number => {
      const box = strip.current?.getBoundingClientRect()
      const width = (box?.width ?? 0) - GUTTER
      if (!box || width <= 0) return 0
      const fraction = Math.min(1, Math.max(0, (clientX - box.left - GUTTER) / width))
      // Snapped to the movie's own frame rate, because every other number in a
      // shot is: a cue landing between two frames is one that plays on a
      // different frame at a different rate, which is the kind of drift nobody
      // finds until the export.
      const raw = fraction * timeline.duration
      return Math.round(raw * timeline.fps) / timeline.fps
    },
    [timeline.duration, timeline.fps],
  )

  const scrubbing = useCallback(
    (event: React.PointerEvent) => {
      event.currentTarget.setPointerCapture(event.pointerId)
      onScrub(seconds(event.clientX))
    },
    [onScrub, seconds],
  )

  const dragging = useCallback(
    (event: React.PointerEvent) => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
      onScrub(seconds(event.clientX))
    },
    [onScrub, seconds],
  )

  /** Where something at `seconds` sits, as a percentage across the strip. */
  const across = (moment: number) =>
    `${Math.min(100, Math.max(0, (moment / Math.max(timeline.duration, 0.001)) * 100))}%`

  const rows = Object.entries(timeline.tracks).filter(
    ([, tracks]) => keyedProperties(tracks).length > 0,
  )

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-neutral-950">
      {/*
        The ruler and the playhead, in one strip that takes the pointer.

        `touch-none` because a horizontal drag inside a scrolling column is a
        gesture the browser will otherwise claim as a scroll on the first frame,
        which is the difference between a scrubber and a scrubber that works on
        a phone.
      */}
      <div
        ref={strip}
        onPointerDown={scrubbing}
        onPointerMove={dragging}
        className="relative flex h-7 shrink-0 cursor-ew-resize touch-none select-none border-b border-neutral-800 bg-neutral-900/60"
      >
        <span style={{ width: GUTTER }} className="shrink-0" />
        <div className="relative flex-1">
          <Ticks duration={timeline.duration} />
          {/* Drawn under the playhead, so the line you are dragging stays
              readable over the band you are dragging it through. */}
          {loop && loop.to > loop.from ? (
            <span
              aria-hidden
              style={{ left: across(loop.from), width: across(loop.to - loop.from) }}
              className="pointer-events-none absolute inset-y-0 z-10 border-x border-amber-300/70 bg-amber-400/15"
            />
          ) : null}
          <Playhead across={across(at)} at={at} />
        </div>
      </div>

      {/*
        The lane you mark a stretch in.
        
        Its own strip rather than a drag on the ruler above, because the ruler
        already has a gesture: dragging it scrubs, and a second meaning for the
        same drag would be a modifier key nobody finds. Six pixels is enough to
        hit and little enough that the strip does not become a second timeline.

        A drag that ends where it started clears, which is the same press as
        "I did not mean that" and needs no separate control.
      */}
      <div
        onPointerDown={(event) => {
          const element = event.currentTarget
          element.setPointerCapture(event.pointerId)
          const from = seconds(event.clientX)
          onLoop({ from, to: from })

          const move = (moved: PointerEvent) => {
            const to = seconds(moved.clientX)
            onLoop(to >= from ? { from, to } : { from: to, to: from })
          }
          const up = (ended: PointerEvent) => {
            const to = seconds(ended.clientX)
            if (Math.abs(to - from) < 0.05) onLoop(null)
            element.removeEventListener('pointermove', move)
            element.removeEventListener('pointerup', up)
            element.removeEventListener('pointercancel', up)
          }
          element.addEventListener('pointermove', move)
          element.addEventListener('pointerup', up)
          element.addEventListener('pointercancel', up)
        }}
        title={t.markASpan}
        className="relative flex h-1.5 shrink-0 cursor-ew-resize touch-none select-none border-b border-neutral-900 bg-neutral-950"
      >
        <span style={{ width: GUTTER }} className="shrink-0" />
        <div className="relative flex-1">
          {loop && loop.to > loop.from ? (
            <span
              aria-hidden
              style={{ left: across(loop.from), width: across(loop.to - loop.from) }}
              className="absolute inset-y-0 rounded-full bg-amber-400/80"
            />
          ) : null}
        </div>
      </div>

      {/* The film's own edit: which camera, from when. */}
      <Lane label={t.cameras}>
        {timeline.cuts.map((cut: Cut, index) => (
          <button
            key={`${cut.t}-${cut.camera}`}
            type="button"
            onClick={() => onDropCut(index)}
            title={`${cut.camera} — ${cut.t}s`}
            style={{ left: across(cut.t) }}
            className="absolute top-1 -ml-px h-4 whitespace-nowrap rounded-r border-l-2 border-violet-400 bg-violet-500/20 pl-1 pr-1.5 font-mono text-[9px] leading-4 text-violet-200 hover:bg-red-500/30"
          >
            {cut.camera}
          </button>
        ))}
      </Lane>

      {/*
        Everything the cast does, in one lane.

        It was three - clips, lines and, briefly, actions - and drawing them
        apart drew one performance as three rows. A body walks *while* it waves
        *while* it says something, and the whole point of a strip is seeing that
        those overlap.

        Each block is drawn to its own length, because "is she still talking
        when he turns round" is a question the strip should answer by looking.
      */}
      <Lane label={t.does}>
        {timeline.actions.map((action, index) => (
          <Block
            key={`${action.entity}-${action.kind}-${index}`}
            action={action}
            duration={timeline.duration}
            fps={timeline.fps}
            across={across}
            onSet={(patch) => onSetAction(index, patch)}
            onDrop={() => onDropAction(index)}
          />
        ))}
      </Lane>

      {rows.length === 0 ? (
        <p className="px-3 py-3 font-mono text-[10px] text-neutral-600">{t.selectAnActor}</p>
      ) : null}

      {rows.map(([name, tracks]) => (
        <div key={name} className="border-b border-neutral-900">
          <button
            type="button"
            onClick={() => onSelect(name)}
            className={`w-full px-2 py-1 text-left font-mono text-[10px] ${
              selected.includes(name) ? 'text-violet-300' : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            {name}
          </button>
          {keyedProperties(tracks).map((property) => (
            <div key={property}>
            <div className="relative flex h-5 items-center">
              <span
                style={{ width: GUTTER }}
                className="shrink-0 truncate pl-4 font-mono text-[9px] text-neutral-600"
              >
                {property}
              </span>
              <div className="relative h-full flex-1">
                {(tracks[property] ?? []).map((key, index) => {
                  const open =
                    picked?.entity === name &&
                    picked.property === property &&
                    picked.index === index
                  return (
                    <button
                      key={`${key.t}-${index}`}
                      type="button"
                      /*
                        Opens rather than removes.

                        It used to delete the key, which was safe only while
                        there was nothing else to do to one - the same argument
                        the blocks' × already carries. Now that a key has an
                        ease, click-to-destroy would throw away work every time
                        somebody went to change one.
                      */
                      onClick={() =>
                        setPicked(open ? null : { entity: name, property, index })
                      }
                      title={`${key.value} at ${key.t}s · ${key.ease}`}
                      style={{ left: across(key.t) }}
                      /*
                        The shape is the ease, so a run of keys can be read
                        without opening any of them: a square holds, a diamond
                        goes straight there, a circle eases.
                      */
                      className={`absolute top-1/2 -ml-[5px] size-[9px] -translate-y-1/2 border transition-colors ${
                        key.ease === 'hold'
                          ? ''
                          : key.ease === 'smooth'
                            ? 'rounded-full'
                            : 'rotate-45'
                      } ${
                        open
                          ? 'border-violet-300 bg-violet-400/70'
                          : 'border-amber-300/70 bg-amber-400/40 hover:border-amber-200 hover:bg-amber-400/70'
                      }`}
                    />
                  )
                })}
              </div>
            </div>

            {/*
              What this key does on the way to the next, in a row of its own
              rather than a bubble over the strip: the lanes scroll, and a thing
              floating above them is a thing that ends up half off the edge.
            */}
            {picked?.entity === name && picked.property === property ? (
              <div
                className="flex items-center gap-1 border-t border-neutral-900 py-1"
                style={{ paddingLeft: GUTTER }}
              >
                <span className="font-mono text-[9px] text-neutral-600">
                  {fill(t.leavesAt, {
                    t: (tracks[property]?.[picked.index]?.t ?? 0).toFixed(2),
                  })}
                </span>
                {EASES.map((one) => (
                  <button
                    key={one}
                    type="button"
                    onClick={() => onKeyEase(name, property, picked.index, one)}
                    title={t.easeTitles[one]}
                    className={`rounded px-1.5 py-0.5 font-mono text-[9px] transition-colors ${
                      tracks[property]?.[picked.index]?.ease === one
                        ? 'bg-violet-500/20 text-violet-200'
                        : 'text-neutral-600 hover:text-neutral-300'
                    }`}
                  >
                    {t.easeNames[one]}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    onDropKey(name, property, picked.index)
                    setPicked(null)
                  }}
                  title={t.dropKeyTitle}
                  className="ml-auto mr-2 rounded px-1.5 py-0.5 font-mono text-[9px] text-neutral-600 transition-colors hover:text-red-400"
                >
                  ×
                </button>
              </div>
            ) : null}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * One lane of things that are not keys.
 *
 * The label is inside the strip rather than in a gutter beside it, so a lane
 * costs one row of height instead of forcing every row below it into a column
 * layout. There are two lanes and there will not be five.
 */
function Lane({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex h-6 shrink-0 border-b border-neutral-900">
      {/*
        The name sits in the gutter rather than over the lane. It was drawn on
        top of it, and a cut at zero seconds - which is the commonest cut there
        is - landed exactly on the word.
      */}
      <span
        style={{ width: GUTTER }}
        className="shrink-0 truncate pl-2 pt-1 font-mono text-[9px] uppercase tracking-wider text-neutral-700"
      >
        {label}
      </span>
      <div className="relative flex-1">{children}</div>
    </div>
  )
}

/**
 * A tick a second, and a number every few.
 *
 * Every second is drawn and only some are labelled, because the labels collide
 * long before the ticks do - and a ruler whose numbers overlap is one people
 * read the wrong value off rather than one they ignore.
 */
function Ticks({ duration }: { duration: number }) {
  const step = duration <= 10 ? 1 : duration <= 30 ? 5 : 10
  const marks: number[] = []
  for (let second = 0; second <= duration; second += 1) marks.push(second)

  return (
    <>
      {marks.map((second) => (
        <span
          key={second}
          style={{ left: `${(second / Math.max(duration, 0.001)) * 100}%` }}
          className={`pointer-events-none absolute bottom-0 w-px ${
            second % step === 0 ? 'h-3 bg-neutral-700' : 'h-1.5 bg-neutral-800'
          }`}
        >
          {second % step === 0 ? (
            <span className="absolute -top-0.5 left-1 font-mono text-[9px] leading-none text-neutral-600">
              {second}
            </span>
          ) : null}
        </span>
      ))}
    </>
  )
}

function Playhead({ across, at }: { across: string; at: number }) {
  return (
    <span
      style={{ left: across }}
      className="pointer-events-none absolute inset-y-0 z-20 w-px bg-violet-400"
    >
      <span className="absolute -top-px left-0 rounded-br bg-violet-400 px-1 font-mono text-[9px] leading-[14px] text-neutral-950">
        {at.toFixed(2)}
      </span>
    </span>
  )
}

/**
 * A block's colour, by kind.
 *
 * Colour rather than an icon, because at four pixels of height an icon is a
 * smudge and a hue is instant: the eye finds "all the walking" in a strip
 * without reading a word. The pairs are the panel's own palette rather than the
 * studio's, for the reason `./parts` gives about not making one corner of the
 * editor look like a different application.
 */
const TONE: Record<ActionKind, string> = {
  move: 'border-sky-400 bg-sky-500/20 text-sky-200',
  turn: 'border-cyan-400 bg-cyan-500/20 text-cyan-200',
  jump: 'border-emerald-400 bg-emerald-500/20 text-emerald-200',
  play: 'border-violet-400 bg-violet-500/20 text-violet-200',
  say: 'border-amber-400 bg-amber-500/20 text-amber-200',
}

/**
 * What a block says on it.
 *
 * The *arguments*, not the verb, wherever there are any - "Move 2.4, -0.6"
 * rather than "Move". A strip full of blocks all reading "Move" is a strip you
 * have to click through to read, and the numbers are the thing an author is
 * actually scanning for.
 */
function describe(action: XpAction): string {
  switch (action.kind) {
    case 'move':
      return `Move ${round(action.x)}, ${round(action.z)}`
    case 'turn':
      return `Turn ${round(action.rotation)}°`
    case 'jump':
      return `Jump ${round(action.height)}`
    case 'play':
      return action.clip
    case 'say':
      return action.text
  }
}

const round = (value: number) => Math.round(value * 10) / 10

/**
 * One action, movable and resizable on the strip.
 *
 * ---------------------------------------------------------------------------
 * A block you can only place and delete is half a timeline
 * ---------------------------------------------------------------------------
 * Everything was placed at the playhead and could then only be thrown away, so
 * "start the wave half a second later" meant deleting it, scrubbing, and making
 * it again - and losing whatever else the old one carried. Dragging is not
 * polish here; it is the difference between a strip you compose on and a strip
 * you re-enter things into.
 *
 * ---------------------------------------------------------------------------
 * The body moves it, the last few pixels resize it
 * ---------------------------------------------------------------------------
 * One gesture on two targets, which is how every editor with a timeline does it
 * and is worth matching rather than inventing around. The handle is deliberately
 * generous - eight pixels of a block that may be twenty wide - because a
 * four-pixel edge is a coin toss on a trackpad.
 *
 * ---------------------------------------------------------------------------
 * And delete is its own control now
 * ---------------------------------------------------------------------------
 * It used to be a click on the block, which was safe only while there was
 * nothing else to do to one. With dragging, a click is the *start* of the
 * commonest gesture - so throwing the thing away on a mis-drag of two pixels
 * would be the worst possible default. It is a × on hover instead.
 */
function Block({
  action,
  duration,
  fps,
  across,
  onSet,
  onDrop,
}: {
  action: XpAction
  duration: number
  fps: number
  across: (t: number) => string
  onSet: (patch: { t?: number; duration?: number }) => void
  onDrop: () => void
}) {
  /** How wide the resize handle is, in pixels. See the note above. */
  const GRIP = 8

  const drag = (event: React.PointerEvent<HTMLDivElement>) => {
    const element = event.currentTarget
    const box = element.getBoundingClientRect()
    const lane = element.parentElement?.getBoundingClientRect()
    if (!lane || lane.width === 0) return

    // Which of the two gestures this is, decided once on the way down: a drag
    // that changed its mind halfway would be a block that resized itself while
    // being moved.
    const resizing = event.clientX > box.right - GRIP
    element.setPointerCapture(event.pointerId)

    const startX = event.clientX
    const wasT = action.t
    const wasFor = action.duration
    /** Seconds per pixel across this lane. */
    const rate = duration / lane.width
    // Snapped to the movie's own frames, like every other time in a shot: an
    // action landing between two frames is one that plays on a different frame
    // at a different rate.
    const snap = (seconds: number) => Math.round(seconds * fps) / fps

    const move = (moved: PointerEvent) => {
      const by = (moved.clientX - startX) * rate
      if (resizing) onSet({ duration: snap(Math.max(1 / fps, wasFor + by)) })
      else onSet({ t: snap(Math.max(0, wasT + by)) })
    }
    const up = () => {
      element.removeEventListener('pointermove', move)
      element.removeEventListener('pointerup', up)
      element.removeEventListener('pointercancel', up)
    }

    element.addEventListener('pointermove', move)
    element.addEventListener('pointerup', up)
    element.addEventListener('pointercancel', up)
  }

  return (
    <div
      role="presentation"
      onPointerDown={drag}
      title={`${action.entity}: ${describe(action)}`}
      style={{
        left: across(action.t),
        width: `${Math.min(100, (action.duration / Math.max(duration, 0.001)) * 100)}%`,
      }}
      className={`group/block absolute top-1 flex h-4 cursor-grab items-center overflow-hidden rounded-r border-l-2 pl-1 text-left font-mono text-[9px] leading-4 active:cursor-grabbing ${TONE[action.kind]}`}
    >
      <span className="min-w-0 flex-1 truncate">{describe(action)}</span>

      <button
        type="button"
        // The pointer must not reach the drag underneath, or removing something
        // would also start moving it.
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onDrop}
        aria-label="remove"
        /*
          `relative z-10` and a margin, because the resize grip is drawn after
          this and sits on the block's right-hand eight pixels - which is
          exactly where this was. The grip won the hit test, so pressing the ×
          started a resize and the action never went anywhere. It looked like a
          button that did nothing.

          Dim rather than hidden, for the reason the mobile mode exists: a
          control that appears on hover does not appear at all on a touch
          screen, and *remove this* is not a thing to leave undiscoverable.
        */
        className="relative z-10 mr-2.5 shrink-0 px-1 text-neutral-950/60 opacity-70 transition-opacity hover:text-red-200 hover:opacity-100 group-hover/block:opacity-100"
      >
        ×
      </button>

      {/* The grip, drawn only on hover so a strip of blocks is not a strip of
          handles. It is the same eight pixels either way. */}
      <span
        aria-hidden
        style={{ width: GRIP }}
        className="absolute inset-y-0 right-0 hidden cursor-ew-resize bg-white/20 group-hover/block:block"
      />
    </div>
  )
}
