/**
 * Copied from `src/app/ovaloffice/animator/download.ts`.
 *
 * `src/app/xp/` owns what it draws, and the copy is the rule rather than an
 * accident: docs/xp-creator.md §1.2, enforced by `no-restricted-imports` in
 * eslint.config.mjs. The backoffice's animator is a live surface and this
 * editor is a prototype; sharing one would mean the prototype either drags
 * the product about or waits behind it, and the two are allowed to differ.
 *
 * Verbatim as of this commit, so a diff against the original is the honest
 * way to see how far the two have drifted. Fix things here when they are
 * this editor's problem; the other copy does not hear about it.
 */

import { currentClip, type ClipLibrary } from '@/app/xp/_editor/animator/clip'

/**
 * Getting the animation out of the browser, as one file.
 *
 * ---------------------------------------------------------------------------
 * The GLB export is deliberately not here
 * ---------------------------------------------------------------------------
 * It was, and the copy this file came from still has it: `toClip`, `exportGlb`,
 * and a `GLTFExporter` that writes the dummy with the clip baked inside it -
 * which is what every model in `public/xo` already is, and what `useAnimations`
 * plays by name with nothing else written down.
 *
 * That is the right output for the backoffice's animator, which exists to ship
 * models. It is the wrong one for this editor. A clip authored here belongs to
 * an XP *document* and is played by name off a rig the level has already
 * loaded; a second binary of the same body with one extra walk welded into it
 * is a file with nowhere to go, and a level that fetched it would be fetching
 * the fox twice to play one animation.
 *
 * So what is left is the *working file*: keys, easing, frame rate, and which
 * rig it is for. It is the only thing this tool writes and the only thing it
 * can reopen - a GLB never could be, without guessing the keys back out of
 * baked samples. Same bargain the world builder makes, and for the same reason:
 * see the note there about a document with no table behind it.
 */

/** A safe-ish file stem from whatever the clip is called. */
export function fileStem(name: string): string {
  const stem = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return stem || 'clip'
}

function save(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  // The object URL holds the blob alive until it is let go. The delay is for
  // Safari, which has been known to cancel a download whose URL is revoked in
  // the same tick.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/**
 * The whole collection, named after the clip you were looking at.
 *
 * One file for the library rather than one per clip, which is the point of a
 * library: a walk, an idle and a wave are authored together, share a rig, and
 * are only useful together. Four files would be four things to keep in step.
 *
 * The filename comes from the shown clip because that is the one somebody has
 * in mind when they press the button - `walk.animation.json` holding a walk and
 * three of its neighbours is a better name than anything derived from the set.
 */
export function saveDoc(library: ClipLibrary): void {
  const named = fileStem(currentClip(library).name)
  save(new Blob([JSON.stringify(library, null, 2)], { type: 'application/json' }), `${named}.animation.json`)
}
