'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  MAX_SPEED,
  MIN_SPEED,
  restingAt,
  sequenceLength,
  takeLength,
  takeStarts,
  type Take,
  type XpSequence,
} from '@kxb/xp/movie'
import { MAIN_SCENE, type XpDocument } from '@kxb/xp'
import { placeIn } from '@kxb/xp/edit'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { xpEditorDict } from '@/app/i18n/xp-editor'
import { FIELD, Hint, PanelLabel } from '@/app/xp/_editor/chrome'
import { useNarrow } from '@/app/xp/_editor/shell/mobile'
import { movieClock, type MovieClock } from '@/app/xp/_editor/movie/clock'
import { MovieStage } from '@/app/xp/_editor/movie/stage'
import { canRecord, capturePng, record, save, type CaptureParts } from '@/app/xp/_editor/movie/export'
import { useClientCapability } from '@/lib/use-client-capability'

/**
 * The composer: shots, in order, trimmed and retimed.
 *
 * ---------------------------------------------------------------------------
 * It plays through one stage, not one per shot
 * ---------------------------------------------------------------------------
 * A cut crosses places. The obvious build is a viewport per shot, shown and
 * hidden - and it is a `<Canvas>` per shot, which is a WebGL context per shot,
 * which browsers give you about sixteen of before they start silently dropping
 * the oldest.
 *
 * What makes one stage enough is that `MovieStage` already rebuilds its world
 * from whatever place it is handed: the entity list is a memo dependency, so
 * changing the props swaps the scene graph without touching the context. So the
 * composer hands it the place the playhead is standing in, and a cut is a
 * prop change.
 *
 * **What that costs is honest and worth stating**: the first frame after a cut
 * to a place whose models are not loaded yet is a frame with nothing in it,
 * because the stage suspends. In the editor that is a flicker. In a recording
 * it is a black frame in the file - so a cut between two different places
 * should be shot after both have been visited once, and the export note says so
 * rather than leaving it to be discovered.
 *
 * ---------------------------------------------------------------------------
 * The clock is an interface, and that is what makes this cheap
 * ---------------------------------------------------------------------------
 * The stage asks its clock what time it is and gets a number. It does not care
 * that here the number has been through `cuedAt` - a cut's own playhead mapped
 * onto whichever shot is live and where inside it. One adapter, and the whole
 * of playback, scrubbing and recording works over a sequence exactly as it does
 * over a shot.
 */

export interface ComposerProps {
  document: XpDocument
  id: string
  sequence: XpSequence
  onClose: () => void
  edits: ComposerEdits
}

export interface ComposerEdits {
  /**
   * A shot put into the cut, at a position.
   *
   * The index is not decoration. A composer that can only append is one where
   * the way to put a shot in the middle is to append it and press `← earlier`
   * until it arrives - which is what this was, and what a strip whose whole
   * subject is *order* should never make anybody do.
   */
  onAddTake: (scene: string, atIndex?: number) => void
  onSetTake: (index: number, patch: { from?: number; to?: number; speed?: number }) => void
  onDropTake: (index: number) => void
  onMoveTake: (from: number, to: number) => void
  /** The selected take again, immediately after it, trims and speed and all. */
  onCopyTake: (index: number) => void
}

/** Every place in the document that is a shot, in the order the panel lists them. */
function shotsOf(document: XpDocument): string[] {
  const shots: string[] = []
  if (document.timeline) shots.push(MAIN_SCENE)
  for (const [name, scene] of Object.entries(document.scenes ?? {})) {
    if (typeof scene !== 'string' && scene.timeline) shots.push(name)
  }
  return shots
}

export function Composer({ document: xp, id, sequence, onClose, edits }: ComposerProps) {
  const t = xpEditorDict(useLocale()).movie
  const narrow = useNarrow()

  const clock = useMemo(() => movieClock(), [])
  const [at, setAt] = useState(0)
  const [running, setRunning] = useState(false)
  const [selected, setSelected] = useState(0)

  const total = sequenceLength(sequence)

  /**
   * The place the playhead is standing in, and its shot.
   *
   * `restingAt` rather than `cuedAt`, and the difference is the whole of what a
   * finished cut used to look like. `cuedAt` is null past the end - correctly,
   * that null is what stops the film in the runtime - so the composer fell back
   * to the last take at `local: 0`, and every cut that played to the end
   * finished by showing the **first** frame of its final shot. Which reads as a
   * loop, not as an ending.
   */
  const live = restingAt(sequence, at)
  const place = live
    ? placeIn(xp, live.take.scene === MAIN_SCENE ? undefined : live.take.scene)
    : null
  /** A frame, on the clock of whichever shot the playhead is standing in. */
  const frames = place?.timeline?.fps ?? 30

  /**
   * The stage's clock, in the cut's terms.
   *
   * `at()` hands back the moment *inside the live shot*, which is what the
   * stage poses from. Everything else goes straight through to the cut's own
   * playhead. Rebuilt when the cut changes, because `restingAt` closes over it.
   */
  const view: MovieClock = useMemo(
    () => ({
      at: () => restingAt(sequence, clock.at())?.local ?? 0,
      seek: (seconds) => clock.seek(seconds),
      running: () => clock.running(),
      play: () => clock.play(),
      pause: () => clock.pause(),
      // The stage passes its shot's duration; the cut's own length is what
      // decides when this is over, so the argument is deliberately ignored.
      advance: (delta) => clock.advance(delta, total),
    }),
    [clock, sequence, total],
  )

  /**
   * The same edits, with the selection kept pointing at the same *take*.
   *
   * ---------------------------------------------------------------------------
   * Why this wrapper exists at all
   * ---------------------------------------------------------------------------
   * `selected` is an index into a list the buttons underneath it reorder and
   * delete from, and an index is only a name for a thing while nothing moves.
   * Left alone it went wrong in three separate ways, all of them reachable in
   * about four clicks:
   *
   *   - **Add.** A new take appended and the panel went on showing the old one,
   *     so the shot you had just put in was the one thing you could not trim.
   *   - **Reorder.** `← earlier` moved the take and left the selection behind,
   *     so the second press moved a *different* take - and the highlight in the
   *     strip stayed put while the block slid out from under it.
   *   - **Remove.** Dropping the last take left `selected` past the end, and the
   *     panel vanished entirely while the cut still had shots in it. That one is
   *     the reason this was found: the whole right-hand column disappears and
   *     nothing on screen says why.
   *
   * None of it is visible in a type and none of it is reachable from a test of
   * `addTake` or `moveTake`, which are all correct. It is the join.
   *
   * The rule is one line: **selection follows the take, not the slot.**
   */
  const act = {
    onAddTake: (scene: string, atIndex?: number) => {
      edits.onAddTake(scene, atIndex)
      setSelected(atIndex ?? sequence.takes.length)
    },
    onSetTake: edits.onSetTake,
    onCopyTake: (index: number) => {
      edits.onCopyTake(index)
      setSelected(index + 1)
    },
    onDropTake: (index: number) => {
      edits.onDropTake(index)
      // One shorter, so the last slot no longer exists. Clamping to the new
      // end keeps a panel on screen; jumping to zero would silently move the
      // author to the top of a cut they were working at the bottom of.
      setSelected((was) =>
        Math.max(0, Math.min(was > index ? was - 1 : was, sequence.takes.length - 2)),
      )
    },
    onMoveTake: (from: number, to: number) => {
      edits.onMoveTake(from, to)
      setSelected((was) => (was === from ? to : was === to ? from : was))
    },
  }

  const [parts, setParts] = useState<CaptureParts | null>(null)

  const scrub = (seconds: number) => {
    const to = Math.min(total, Math.max(0, seconds))
    clock.seek(to)
    setRunning(false)
    setAt(to)
  }

  const toggle = () => {
    if (clock.running()) {
      clock.pause()
      setRunning(false)
      return
    }
    // From the top when the playhead is parked at the end, because the only
    // thing anybody means by pressing play on a finished cut is "again".
    if (clock.at() >= total - 0.001) clock.seek(0)
    clock.play()
    setRunning(true)
  }

  /**
   * The transport, on the keys every other player in the world uses.
   *
   * Escape was the only binding here, which made the composer the one full-screen
   * surface in the editor where watching the thing you are making needs the
   * mouse. Space plays, the arrows step, Home and End go to the ends.
   *
   * **A frame, not a fixed step.** `1/30` would be right for a thirty frame shot
   * and wrong for the one next to it; the live take's own `fps` is what a step
   * means at this moment on the strip. `Shift` makes it a second, which is the
   * step for finding a moment rather than for landing on one.
   *
   * Ignored while a field has focus, without exception: every trim in this panel
   * is a number input, and a space typed into one that scrubbed the film instead
   * would be the worst kind of bug - it does something, and it is not what the
   * key says.
   */
  const latest = useRef<((event: KeyboardEvent) => void) | null>(null)

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      const on = event.target
      if (
        on instanceof HTMLElement &&
        (on.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(on.tagName))
      ) {
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return

      const step = event.shiftKey ? 1 : 1 / (frames || 30)
      if (event.key === ' ') {
        event.preventDefault()
        toggle()
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        scrub(clock.at() - step)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        scrub(clock.at() + step)
      } else if (event.key === 'Home') {
        event.preventDefault()
        scrub(0)
      } else if (event.key === 'End') {
        event.preventDefault()
        scrub(total)
      }
    }
    latest.current = key
  })

  /**
   * Bound once, and dispatched through the ref above.
   *
   * The handler closes over the playhead and the length, both of which change -
   * `at` alone re-renders this component up to a hundred times a second while a
   * cut plays. An effect with those in its dependencies would be adding and
   * removing a window listener on every one of those renders. A ref written each
   * render and read on the event is the same behaviour with none of the churn.
   */
  useEffect(() => {
    const on = (event: KeyboardEvent) => latest.current?.(event)
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [])

  const shots = shotsOf(xp)
  const starts = takeStarts(sequence)

  const panels = (
    <>
      <section>
        <PanelLabel className="mb-1.5">{t.shots}</PanelLabel>
        <div className="flex flex-wrap gap-1">
          {shots.map((scene) => (
            <button
              key={scene}
              type="button"
              /*
               * After the selected take rather than at the end of the cut.
               *
               * Where somebody is working *is* where they want the next shot, and
               * appending is the one placement that is never what they meant
               * unless they are already at the end - in which case this is the
               * end. An empty cut has no selection and lands at zero either way.
               */
              onClick={() => act.onAddTake(scene, sequence.takes.length === 0 ? 0 : selected + 1)}
              className="rounded border border-neutral-800 px-2 py-0.5 font-mono text-[10px] text-neutral-400 transition-colors hover:border-violet-600 hover:text-violet-300"
            >
              + {scene}
            </button>
          ))}
        </div>
        {shots.length === 0 ? <Hint className="mt-1.5">{t.noShots}</Hint> : null}
      </section>

      {sequence.takes[selected] ? (
        <TakePanel
          take={sequence.takes[selected]!}
          index={selected}
          count={sequence.takes.length}
          starts={starts}
          whole={
            placeIn(
              xp,
              sequence.takes[selected]!.scene === MAIN_SCENE
                ? undefined
                : sequence.takes[selected]!.scene,
            )?.timeline?.duration ?? 0
          }
          edits={act}
          onScrub={scrub}
        />
      ) : null}

      <Export
        total={total}
        /*
         * Whether this cut crosses places, which is what decides whether the
         * warm-up note is worth showing. A cut made of one place never has the
         * problem, and a note printed on every export is one nobody reads by
         * the second day.
         */
        crosses={new Set(sequence.takes.map((take) => take.scene)).size > 1}
        at={at}
        parts={parts}
        running={running}
        onPlay={() => {
          if (clock.at() >= total - 0.001) clock.seek(0)
          clock.play()
          setRunning(true)
        }}
        onPause={() => {
          clock.pause()
          setRunning(false)
        }}
      />
    </>
  )

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-neutral-950">
      <header className="flex shrink-0 items-center gap-3 border-b border-neutral-800 px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-violet-300">
          {t.composing}
        </span>
        <span className="truncate font-mono text-[10px] text-neutral-500">
          {sequence.name ?? id}
        </span>
        <span className="font-mono text-[10px] text-neutral-600">
          {fill(t.totalLength, { seconds: String(Math.round(total * 10) / 10) })}
        </span>

        <button
          type="button"
          onClick={() => scrub(0)}
          className="rounded px-2 py-0.5 font-mono text-[10px] text-neutral-500 transition-colors hover:text-neutral-200"
        >
          ⏮
        </button>
        <button
          type="button"
          onClick={toggle}
          className="rounded bg-violet-500/15 px-2.5 py-0.5 font-mono text-[10px] text-violet-300 transition-colors hover:bg-violet-500/25"
        >
          {running ? t.pause : t.play}
        </button>

        {/*
          Where the playhead is, in numbers.

          A strip shows *proportion* - which is what it is for - and cannot show
          a moment. Trimming a take means typing seconds into two boxes, and
          without a readout the only way to know which second you are looking at
          was to guess from a violet line's position across the width of a
          screen. Tabular figures so the digits do not shuffle while it runs.
        */}
        <span className="font-mono text-[10px] tabular-nums text-neutral-500">{at.toFixed(2)}</span>

        <span className="ml-auto font-mono text-[10px] text-neutral-600">
          {live ? live.take.scene : t.nothingAtThisMoment}
        </span>

        <button
          type="button"
          onClick={onClose}
          title={t.closeTitle}
          className="shrink-0 rounded px-2 py-0.5 font-mono text-[10px] text-neutral-500 transition-colors hover:text-neutral-200"
        >
          {t.close}
        </button>
      </header>

      <div className={`flex min-h-0 flex-1 ${narrow ? 'flex-col' : 'flex-row'}`}>
        <div className={`relative min-h-0 ${narrow ? 'h-[45%]' : 'flex-1'}`}>
          {place?.timeline ? (
            <MovieStage
              document={xp}
              world={place.world}
              entities={place.entities}
              timeline={place.timeline}
              clock={view}
              // Always the cut's own camera decision - a composer that let you
              // fly around would be one where the picture you are cutting is
              // not the picture you are looking at.
              through="@live"
              onTime={() => setAt(clock.at())}
              onEnded={() => setRunning(false)}
              onReady={setParts}
            />
          ) : (
            <p className="grid h-full place-items-center font-mono text-[10px] text-neutral-600">
              {t.noShots}
            </p>
          )}
        </div>

        {narrow ? null : (
          <aside className="w-80 shrink-0 space-y-4 overflow-y-auto border-l border-neutral-800 px-3 py-2">
            {panels}
          </aside>
        )}
      </div>

      <Strip
        sequence={sequence}
        starts={starts}
        total={total}
        at={at}
        selected={selected}
        onSelect={setSelected}
        onScrub={scrub}
      />

      {narrow ? (
        <div className="max-h-[40%] shrink-0 space-y-4 overflow-y-auto border-t border-neutral-800 px-3 py-2">
          {panels}
        </div>
      ) : null}
    </div>
  )
}

/**
 * The cut itself: a block per take, drawn to the length it occupies.
 *
 * To length rather than to a fixed width, which is the whole reason this is a
 * strip and not a list: what an author is deciding is *pacing*, and pacing is
 * how long a thing is next to how long the thing after it is. A list of equal
 * rows says nothing about that and a row of proportional blocks says all of it.
 */
function Strip({
  sequence,
  starts,
  total,
  at,
  selected,
  onSelect,
  onScrub,
}: {
  sequence: XpSequence
  starts: number[]
  total: number
  at: number
  selected: number
  onSelect: (index: number) => void
  onScrub: (seconds: number) => void
}) {
  const t = xpEditorDict(useLocale()).movie

  const across = (seconds: number) =>
    `${Math.min(100, Math.max(0, (seconds / Math.max(total, 0.001)) * 100))}%`

  /**
   * A pointer's x, as a moment on the cut.
   *
   * Clamped at **both** ends. Only the low end was, so a drag that carried past
   * the right edge - which a pointer capture makes easy, that is what a capture
   * is for - scrubbed to a time longer than the film. Which parked the playhead
   * off the end of its own strip and left the picture on the last frame with no
   * way to see why the numbers had stopped agreeing with the line.
   */
  const momentAt = (clientX: number, box: DOMRect) =>
    Math.min(total, Math.max(0, ((clientX - box.left) / box.width) * total))

  return (
    <div className="h-24 shrink-0 border-t border-neutral-800 bg-neutral-950 px-2 py-2">
      {sequence.takes.length === 0 ? (
        <p className="font-mono text-[10px] text-neutral-600">{t.noShots}</p>
      ) : (
        <div
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            onScrub(momentAt(event.clientX, event.currentTarget.getBoundingClientRect()))
          }}
          onPointerMove={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
            onScrub(momentAt(event.clientX, event.currentTarget.getBoundingClientRect()))
          }}
          className="relative flex h-14 cursor-ew-resize touch-none select-none gap-px"
        >
          {sequence.takes.map((take, index) => (
            <button
              key={`${take.scene}-${starts[index]}`}
              type="button"
              onPointerDown={(event) => {
                // The block selects; the strip under it still scrubs, because a
                // click on a block is also a click at a moment.
                event.stopPropagation()
                onSelect(index)
                onScrub(
                  momentAt(
                    event.clientX,
                    event.currentTarget.parentElement!.getBoundingClientRect(),
                  ),
                )
              }}
              style={{ width: `${(takeLength(take) / Math.max(total, 0.001)) * 100}%` }}
              /*
               * An unselected block has to be *visible*, which sounds obvious
               * and was not: at `bg-neutral-900/60` on a `bg-neutral-950` strip
               * a take read as empty space, and the only edge anybody could see
               * was the playhead. A strip whose whole job is showing how long
               * one shot is next to the next one cannot have invisible blocks.
               */
              className={`min-w-0 overflow-hidden rounded border px-1.5 py-1 text-left transition-colors ${
                selected === index
                  ? 'border-violet-500 bg-violet-500/20'
                  : 'border-neutral-700 bg-neutral-800/70 hover:border-neutral-500 hover:bg-neutral-800'
              }`}
            >
              {/*
                The number first, and it is not decoration.

                Every block in a cut made out of one shot says `main`, so with
                only the scene on it the strip is a row of identically labelled
                rectangles and nothing on screen tells you which one the panel is
                editing. The position in the order is the only thing that does.
              */}
              <span className="block truncate font-mono text-[10px] text-neutral-300">
                <span className="text-neutral-500">{index + 1}</span> {take.scene}
              </span>
              <span className="block truncate font-mono text-[9px] text-neutral-600">
                {Math.round(takeLength(take) * 10) / 10}s
                {take.speed === 1 ? '' : ` ×${Math.round(take.speed * 100) / 100}`}
              </span>
            </button>
          ))}

          <span
            style={{ left: across(at) }}
            className="pointer-events-none absolute inset-y-0 z-10 w-px bg-violet-400"
          />
        </div>
      )}
    </div>
  )
}

/** The selected take: where it starts and ends in its own shot, and how fast. */
function TakePanel({
  take,
  index,
  count,
  starts,
  whole,
  edits,
  onScrub,
}: {
  take: Take
  index: number
  count: number
  /** Where every take begins on the cut, so this one can be jumped to. */
  starts: number[]
  whole: number
  edits: ComposerEdits
  onScrub: (seconds: number) => void
}) {
  const t = xpEditorDict(useLocale()).movie

  return (
    <section className="border-t border-neutral-900 pt-3">
      {/*
        Which take this is, and not only which shot.

        The heading was the scene name alone, which in a cut assembled from one
        shot - the ordinary case, and the one the format was designed for - reads
        the same for every take in the film. So the panel said `MAIN` whichever
        block you clicked, and the only way to tell whether the trim you were
        about to change belonged to the take you meant was to remember.

        Clicking it puts the playhead on this take's first frame, because the
        question "which one is this" is answered properly by the picture.
      */}
      <button
        type="button"
        onClick={() => onScrub(starts[index] ?? 0)}
        title={t.goToTakeTitle}
        className="mb-1.5 flex w-full items-baseline gap-2 text-left"
      >
        <PanelLabel>{take.scene}</PanelLabel>
        <span className="font-mono text-[10px] text-neutral-600">
          {fill(t.takeOf, { n: String(index + 1), of: String(count) })}
        </span>
      </button>

      <div className="flex items-center gap-2">
        <span className="w-16 shrink-0 font-mono text-[10px] text-neutral-500">{t.trim}</span>
        <input
          type="number"
          min={0}
          max={whole}
          step={0.1}
          value={take.from}
          onChange={(event) => {
            // `Number('')` is 0, so an empty box would send the handle to the
            // start of the shot the moment somebody selected all to retype.
            const next = Number(event.target.value)
            if (event.target.value.trim() !== '' && Number.isFinite(next)) {
              edits.onSetTake(index, { from: next })
            }
          }}
          className={`${FIELD} w-16`}
        />
        <span className="font-mono text-[10px] text-neutral-700">→</span>
        <input
          type="number"
          min={0}
          max={whole}
          step={0.1}
          value={take.to}
          onChange={(event) => {
            // `Number('')` is 0, so an empty box would send the handle to the
            // start of the shot the moment somebody selected all to retype.
            const next = Number(event.target.value)
            if (event.target.value.trim() !== '' && Number.isFinite(next)) {
              edits.onSetTake(index, { to: next })
            }
          }}
          className={`${FIELD} w-16`}
        />
        <span className="font-mono text-[9px] text-neutral-700">/ {whole}s</span>
      </div>

      <div className="mt-1.5 flex items-center gap-2">
        <span className="w-16 shrink-0 font-mono text-[10px] text-neutral-500">{t.speed}</span>
        <input
          type="range"
          min={MIN_SPEED}
          max={MAX_SPEED}
          step={0.05}
          value={take.speed}
          onChange={(event) => edits.onSetTake(index, { speed: Number(event.target.value) })}
          className="min-w-0 flex-1 accent-violet-500"
        />
        <span className="w-10 shrink-0 text-right font-mono text-[10px] tabular-nums text-neutral-400">
          {/*
            Rounded, because a range input hands back `min + step × n` in binary
            floating point: dragging this to what is plainly 1.1 produced
            `×1.1500000000000001` on the panel and on every block in the strip.
          */}
          ×{Math.round(take.speed * 100) / 100}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => edits.onMoveTake(index, index - 1)}
          className="rounded border border-neutral-800 px-1.5 py-0.5 font-mono text-[9px] text-neutral-400 transition-colors hover:border-neutral-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ← {t.earlier}
        </button>
        <button
          type="button"
          disabled={index >= count - 1}
          onClick={() => edits.onMoveTake(index, index + 1)}
          className="rounded border border-neutral-800 px-1.5 py-0.5 font-mono text-[9px] text-neutral-400 transition-colors hover:border-neutral-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t.later} →
        </button>
        {/*
          The same shot again, right after this one.

          The one gesture the format was explicitly built for and the panel had
          no button for: `Take`'s own note says *"a shot used twice at different
          lengths is what an edit is"*. Doing it by hand meant adding the shot
          whole and retyping both trims, which is exactly the work a copy is.
        */}
        <button
          type="button"
          onClick={() => edits.onCopyTake(index)}
          title={t.copyTakeTitle}
          className="rounded border border-neutral-800 px-1.5 py-0.5 font-mono text-[9px] text-neutral-400 transition-colors hover:border-neutral-600"
        >
          {t.copyTake}
        </button>
        <button
          type="button"
          onClick={() => edits.onDropTake(index)}
          className="ml-auto rounded px-1.5 py-0.5 font-mono text-[9px] text-neutral-600 transition-colors hover:text-red-400"
        >
          {t.removeTake}
        </button>
      </div>
    </section>
  )
}

/** A frame, and the whole cut as a file. */
function Export({
  total,
  crosses,
  at,
  parts,
  running,
  onPlay,
  onPause,
}: {
  total: number
  crosses: boolean
  at: number
  parts: CaptureParts | null
  running: boolean
  onPlay: () => void
  onPause: () => void
}) {
  const t = xpEditorDict(useLocale()).movie
  const [recording, setRecording] = useState<{ stop: () => void } | null>(null)
  /**
   * `useMemo(() => canRecord(), [])` used to sit here, and it is the same bug
   * as the studio's: `useMemo` still runs during the hydration render, so the
   * server's "no `MediaRecorder`" answer was the only one this ever produced.
   * See `useClientCapability` for the mount-time fix.
   */
  const able = useClientCapability(canRecord)
  const size = { width: 1280, height: 720 }

  useEffect(() => {
    if (recording && !running) recording.stop()
  }, [recording, running])

  return (
    <section className="border-t border-neutral-900 pt-3">
      <PanelLabel className="mb-1.5">{t.exportHeading}</PanelLabel>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={!parts}
          onClick={() =>
            parts && save(capturePng(parts, size.width, size.height), `frame-${at.toFixed(2)}.png`)
          }
          className="rounded border border-neutral-800 px-2 py-1 font-mono text-[10px] text-neutral-400 transition-colors hover:border-neutral-600 hover:text-neutral-200 disabled:opacity-40"
        >
          {t.saveFrame}
        </button>
        <button
          type="button"
          disabled={!able || !parts}
          onClick={() => {
            if (recording) {
              recording.stop()
              return
            }
            const canvas = parts?.gl.domElement
            if (!canvas) return
            const take = record(canvas, { ...size, fps: 30, duration: total })
            setRecording({ stop: take.stop })
            onPlay()
            void take.done.then((capture) => {
              setRecording(null)
              onPause()
              save(capture.blob, 'cut.webm')
            })
          }}
          className="rounded border border-neutral-800 px-2 py-1 font-mono text-[10px] text-neutral-400 transition-colors hover:border-red-600 hover:text-red-300 disabled:opacity-40"
        >
          {recording ? t.stopRecording : t.record}
        </button>
      </div>
      {able ? null : <Hint className="mt-1.5">{t.cannotRecord}</Hint>}
      {/*
        The one cost of drawing a whole cut through a single stage, said rather
        than left to be found in a file: the stage suspends while the next
        place's models load, and a suspended frame is an empty one.
      */}
      {crosses ? <Hint className="mt-1.5">{t.warmUpFirst}</Hint> : null}
    </section>
  )
}
