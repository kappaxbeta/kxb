import type { ClipLibrary } from '@/app/xp/_editor/animator/clip'

/**
 * The road back to what the animator's library was.
 *
 * Pulled out of `animator.tsx` as five pure functions, because every one of
 * these transitions already had to be pure and only the comments said so.
 * **React invokes a state updater twice in development**, and a version of this
 * that pushed onto a separate history from inside the setter recorded every
 * edit twice — so the whole thing lives in one object that each step rebuilds,
 * and none of the steps below reads a clock or a ref.
 *
 * The two clocks that *are* involved — `performance.now()` for coalescing, and
 * whatever React does with the result — stay in the component. `coalesces`
 * takes the times as numbers so the 900 ms window can be tested without one.
 */

/**
 * How many steps back you can take.
 *
 * Five, because that is what was asked for and because a deeper stack on a
 * document this size is a false promise: every entry is a whole copy of every
 * key, and the thing people actually reach for undo for here is the last drag
 * that went wrong, not an archaeology of the afternoon. The autosaved working
 * file and Save cover the rest.
 */
export const MAX_UNDO = 5

/**
 * How long two edits with the same tag are treated as one.
 *
 * Long enough that dragging a bone, pausing to look, and nudging it again is
 * one undo; short enough that coming back to the same handle a minute later is
 * a new one. A drag emits a change per pointer move, and a stack five deep
 * would otherwise be five frames of one gesture.
 */
export const COALESCE_MS = 900

export interface History {
  library: ClipLibrary
  past: ClipLibrary[]
  future: ClipLibrary[]
}

/** A library with nothing behind it. */
export function fresh(library: ClipLibrary): History {
  return { library, past: [], future: [] }
}

/**
 * Whether this edit continues the last one rather than starting a new step.
 *
 * Untagged edits never coalesce — that is what an absent tag means. Two
 * different tags never do either, so releasing one bone and grabbing another is
 * two undos even if it happens inside the window.
 */
export function coalesces(
  last: { tag: string; at: number } | null,
  tag: string | undefined,
  now: number,
): boolean {
  if (tag === undefined || last === null) return false
  return last.tag === tag && now - last.at < COALESCE_MS
}

/**
 * A changed library, and the step back to the one before it.
 *
 * `next === current.library` means the change **declined** — the helpers
 * cooperate by reference, so deleting the only key, removing the last clip or
 * moving a key that is not there all hand back the same object rather than a
 * copy. A refusal must not cost an undo step; it is not an edit.
 *
 * A coalescing edit keeps `past` exactly as it was, so the whole gesture
 * collapses to the one step recorded when it started. It still clears `future`,
 * because it is still an edit and the road forward is gone either way.
 *
 * `coalesce` is ignored when there is nothing in `past` to fold into — the
 * first edit of a session has to record something or there is no way back at
 * all.
 */
export function pushed(current: History, next: ClipLibrary, coalesce: boolean): History {
  if (next === current.library) return current

  if (coalesce && current.past.length > 0) {
    return { library: next, past: current.past, future: [] }
  }

  return {
    library: next,
    past: [...current.past, current.library].slice(-MAX_UNDO),
    future: [],
  }
}

/** One step back, or the same history when there is nowhere to go. */
export function undone(current: History): History {
  const previous = current.past.at(-1)
  if (previous === undefined) return current

  return {
    library: previous,
    past: current.past.slice(0, -1),
    future: [current.library, ...current.future].slice(0, MAX_UNDO),
  }
}

/** One step forward again. */
export function redone(current: History): History {
  const [next, ...rest] = current.future
  if (next === undefined) return current

  return {
    library: next,
    past: [...current.past, current.library].slice(-MAX_UNDO),
    future: rest,
  }
}
