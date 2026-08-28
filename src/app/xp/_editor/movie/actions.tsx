'use client'

import { MAX_ACTION_SECONDS, type XpAction, type XpTimeline } from '@kxb/xp/movie'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { xpEditorDict } from '@/app/i18n/xp-editor'
import { Add, Remove, Slide } from '@/app/xp/_editor/movie/parts'
import { Hint } from '@/app/xp/_editor/chrome'
import type { MovieEdits } from '@/app/xp/_editor/movie/mode'

/**
 * When a new action on this body should start: the playhead, unless it is taken.
 *
 * ---------------------------------------------------------------------------
 * The rule this exists to live with
 * ---------------------------------------------------------------------------
 * `putAction` keeps **one action per body per instant** - two things starting
 * on one body a hundredth of a second apart is never what anybody meant, and is
 * invisible on the strip afterwards. That rule is right about the *format* and
 * it makes a row of buttons behave terribly: press *move*, then *jump*, and the
 * jump replaces the move, silently, at the same playhead.
 *
 * So a clash starts after the last thing this body is doing. Press three times
 * and you get three blocks in a row, which is how a performance is actually
 * built - walk, then jump, then say something. A free playhead is still
 * honoured, because putting it *there* is why you moved it.
 *
 * Exported because the older *plays* and *says* rows add actions too, and they
 * had the same problem: pressing *says* after making a move deleted the move.
 * One rule, in one place, or the panel disagrees with itself about what a
 * button does depending on which button it is.
 */
export function nextBeat(timeline: XpTimeline, entity: string, at: number): number {
  const mine = timeline.actions.filter((one) => one.entity === entity)
  const taken = mine.some((one) => Math.abs(one.t - at) <= 0.02)
  if (!taken) return at
  return mine.reduce((end, one) => Math.max(end, one.t + one.duration), 0)
}

/**
 * What a body *does*, as blocks you can make and edit.
 *
 * ---------------------------------------------------------------------------
 * The half that was missing
 * ---------------------------------------------------------------------------
 * Actions could already be stored, parsed, folded into a performance, drawn on
 * the strip, dragged, resized and removed. There was no way to **make** one:
 * `onAction` was wired in the editor and nothing called it, so the only block
 * that ever appeared was the `play` a pose cue writes. Every other kind was
 * reachable only by hand-editing the file.
 *
 * ---------------------------------------------------------------------------
 * Why this is not the timeline's job
 * ---------------------------------------------------------------------------
 * The strip answers *when*, and it answers it by looking - that is what a strip
 * is for. It is the wrong place for "walk to x = 3", which is a number you type
 * or push and not a thing you find by dragging. So the strip keeps `t` and
 * `duration`, this keeps the payload, and a block on the strip is the same
 * action seen from the other side.
 *
 * ---------------------------------------------------------------------------
 * Seeded where the body already is
 * ---------------------------------------------------------------------------
 * A `move` starts at the body's own position and a `turn` at its own facing -
 * so a fresh action changes nothing until you edit it. The alternative is a
 * body that teleports to the origin the moment you press a button, and an undo
 * as the first thing anybody learns.
 */
export function Does({
  actor,
  timeline,
  at,
  edits,
}: {
  actor: { name: string; x: number; z: number; rotation: number }
  timeline: XpTimeline
  at: number
  edits: MovieEdits
}) {
  const t = xpEditorDict(useLocale()).movie

  /** This body's own, with the index the writers address them by. */
  const mine = timeline.actions
    .map((action, index) => ({ action, index }))
    .filter((one) => one.action.entity === actor.name)

  // `t: nextBeat(...)`, spelled out: `t` in this file is the dictionary, and the
  // shorthand quietly put the whole dictionary in the beat's time field.
  const beat = { entity: actor.name, t: nextBeat(timeline, actor.name, at), duration: 1 }

  return (
    <div className="mt-1 flex flex-col gap-1.5 border-t border-neutral-900 pt-1.5">
      <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-600">
        {t.does}
      </span>

      {/*
        Three, not five.

        `play` and `say` already have their own rows above - a clip picker with
        a loop toggle, and a line with a length - and both are richer than a
        button could be. Adding a fourth and fifth here would be two ways to
        make one thing, seeded differently, which is how a panel starts
        disagreeing with itself. What was missing was the three kinds nothing
        offered at all.
      */}
      <div className="flex flex-wrap items-center gap-1">
        <Add
          title={t.addMoveTitle}
          onClick={() => edits.onAction({ ...beat, kind: 'move', x: actor.x, z: actor.z })}
        >
          + {t.aMove}
        </Add>
        <Add
          title={t.addTurnTitle}
          onClick={() => edits.onAction({ ...beat, kind: 'turn', rotation: actor.rotation })}
        >
          + {t.aTurn}
        </Add>
        <Add
          title={t.addJumpTitle}
          onClick={() => edits.onAction({ ...beat, kind: 'jump', height: 1 })}
        >
          + {t.aJump}
        </Add>
      </div>

      {mine.length === 0 ? <Hint>{t.nothingYet}</Hint> : null}

      {mine.map(({ action, index }) => (
        <Beat
          key={`${action.kind}-${index}`}
          action={action}
          onSet={(patch) => edits.onSetAction(index, patch)}
          onDrop={() => edits.onDropAction(index)}
        />
      ))}
    </div>
  )
}

/** One action, opened up. The strip holds the same thing by its two ends. */
function Beat({
  action,
  onSet,
  onDrop,
}: {
  action: XpAction
  onSet: (patch: Partial<XpAction>) => void
  onDrop: () => void
}) {
  const t = xpEditorDict(useLocale()).movie

  return (
    <div className="rounded border border-neutral-900 bg-neutral-950/40 px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-neutral-300">
          {t.actionKinds[action.kind]}
        </span>
        <span className="shrink-0 font-mono text-[9px] text-neutral-600">
          {fill(t.atForSeconds, {
            t: action.t.toFixed(1),
            n: action.duration.toFixed(1),
          })}
        </span>
        <Remove onClick={onDrop} title={t.dropActionTitle}>
          ×
        </Remove>
      </div>

      <div className="mt-1 flex flex-col gap-1">
        <Slide
          label={t.starts}
          value={action.t}
          min={0}
          max={MAX_ACTION_SECONDS}
          step={0.1}
          unit="s"
          onChange={(value) => onSet({ t: value })}
        />
        <Slide
          label={t.lasts}
          value={action.duration}
          min={0.05}
          max={MAX_ACTION_SECONDS}
          step={0.1}
          unit="s"
          onChange={(value) => onSet({ duration: value })}
        />

        {action.kind === 'move' ? (
          <>
            <Slide
              label="X"
              value={action.x}
              min={-64}
              max={64}
              step={0.1}
              onChange={(value) => onSet({ x: value } as Partial<XpAction>)}
            />
            <Slide
              label="Z"
              value={action.z}
              min={-64}
              max={64}
              step={0.1}
              onChange={(value) => onSet({ z: value } as Partial<XpAction>)}
            />
          </>
        ) : null}

        {action.kind === 'turn' ? (
          <Slide
            label={t.facing}
            value={action.rotation}
            min={0}
            max={359}
            step={1}
            unit="°"
            onChange={(value) => onSet({ rotation: value } as Partial<XpAction>)}
          />
        ) : null}

        {action.kind === 'jump' ? (
          <Slide
            label={t.howHigh}
            value={action.height}
            min={0.1}
            max={16}
            step={0.1}
            onChange={(value) => onSet({ height: value } as Partial<XpAction>)}
          />
        ) : null}

        {action.kind === 'say' ? (
          <input
            type="text"
            value={action.text}
            /*
              Written straight through rather than held as draft text: the
              parser refuses an empty line, so a field that let you clear it
              before typing the new one would refuse the keystroke that cleared
              it and the box would appear stuck. A `say` you want gone is one
              you remove.
            */
            onChange={(event) =>
              onSet({ text: event.target.value || ' ' } as Partial<XpAction>)
            }
            className="w-full rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 font-mono text-[10px] text-neutral-300 focus:border-neutral-600 focus:outline-none"
          />
        ) : null}

        {action.kind === 'play' ? (
          // The clip itself comes from the pose panel or the animator; what is
          // useful here is whether it holds.
          <label className="flex items-center gap-1.5 font-mono text-[10px] text-neutral-500">
            <input
              type="checkbox"
              checked={action.loop}
              onChange={(event) => onSet({ loop: event.target.checked } as Partial<XpAction>)}
              className="size-3 accent-violet-500"
            />
            {t.loops}
          </label>
        ) : null}
      </div>
    </div>
  )
}
