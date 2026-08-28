'use client'

import { useState } from 'react'
import { useSceneDebug } from '@/app/xp/_runtime/hud/debug-store'

/**
 * The level's own numbers, wherever the level is open.
 *
 * Two hosts render it now, which is why it lives beside its store rather than
 * in either of them: the rooms rail, where it is one block in a column, and
 * `/xp/<id>?debug=1`, where it is a card in the corner of a page that has no
 * rail to be a block in. Both get the same numbers because both read the same
 * store, and the scene writes to that store knowing about neither.
 *
 * Placements, entities, solid cells and a coordinate are developer furniture.
 * They lived in the corner of the scene at a third of the emphasis, which was
 * already a compromise and still put four lines of geometry in front of
 * somebody trying to read whose turn it is.
 *
 * ---------------------------------------------------------------------------
 * Closed by default, and that is the whole point of moving it
 * ---------------------------------------------------------------------------
 * A panel that opens is the difference between "still there when you go
 * looking" and "in the way when you are not". Moving the numbers somewhere they
 * are always visible would have been the same problem in a new place.
 *
 * The heading stays visible while a level is open, because a debug block that
 * is also invisible is one nobody discovers - and the one moment somebody needs
 * these numbers is the moment they are trying to explain something odd to
 * somebody else.
 *
 * Renders nothing at all when no level is open, so the cost of it sitting in
 * the rooms tab permanently is a null check.
 */
export function SceneDebug({
  /**
   * Whether it starts open, which is a different answer per host.
   *
   * **Closed in the rail**, where it sits in a column beside things somebody is
   * using and the whole reason it moved there was to stop being in the way.
   * **Open on `/xp/<id>?debug=1`**, where somebody typed the flag: they asked
   * for the numbers, so making them ask twice is a click for its own sake.
   *
   * It matters more than a preference, too. On that page the level fills the
   * frame, and once the pointer is locked the canvas takes every click - so a
   * card that opens on a click is a card you cannot open while you are playing,
   * which is exactly when the numbers are worth having.
   */
  open: initial = false,
}: { open?: boolean } = {}) {
  const debug = useSceneDebug()
  const [open, setOpen] = useState(initial)

  if (!debug) return null

  const { name, placements, entities, cells, scripts, at, facing } = debug

  return (
    <div className="border-t border-line/60 pt-3">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted transition hover:text-ink"
      >
        <span className="truncate">Debug · {name}</span>
        <span aria-hidden className="shrink-0 opacity-60">
          {open ? '−' : '+'}
        </span>
      </button>

      {/*
        Not translated, and deliberately.

        These are the format's own field names - `placements`, `entities`,
        `scripts` - printed beside their counts, and the reason is the one that
        keeps `does` in English on the controls panel: they are what somebody
        would type into a search of the document or say to whoever wrote it.
        A German name for `placements` would be a name nothing else in the
        project answers to.
      */}
      {open && (
        <dl className="mt-2 space-y-0.5 font-mono text-[10px] leading-relaxed text-ink-muted">
          <Row label="placements" value={placements} />
          <Row label="entities" value={entities} />
          <Row label="solid cells" value={cells} />
          {/* Already a sentence rather than a number - "no scripts", "3 scripts
              running", "2/3 scripts running". The scene decides the phrasing
              and this prints it, so the two cannot drift. */}
          <div className="flex justify-between gap-3">
            <dt className="opacity-70">scripts</dt>
            <dd className="truncate">{scripts}</dd>
          </div>
          {/*
            Where you are standing, rounded here rather than in the store.

            One decimal is what a person can act on - it is enough to say which
            tile you are on and to read back over a call. The store compares at
            the same precision, so walking does not wake the rail at frame rate
            for digits nobody is reading.
          */}
          {at && (
            <div className="flex justify-between gap-3">
              <dt className="opacity-70">at</dt>
              <dd className="tabular-nums">
                {at.x.toFixed(1)} {at.y.toFixed(1)} {at.z.toFixed(1)}
              </dd>
            </div>
          )}
          {/*
            And which way you are pointing, which the coordinate cannot say.

            Whole degrees, in the document's own convention - zero along +z, the
            way a mark faces - so a bearing read off here and a `facing` typed
            into a spawn mean the same thing. It is the number you want the
            moment anything in a level is aimed: a shot is a ray out of the eye,
            and where somebody is standing tells you nothing about it.
          */}
          {facing !== null && (
            <div className="flex justify-between gap-3">
              <dt className="opacity-70">facing</dt>
              <dd className="tabular-nums">{Math.round(facing)}°</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="opacity-70">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  )
}
