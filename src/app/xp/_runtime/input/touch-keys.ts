import { MAX_PLAYER_KEYS } from '@kxb/xp'

/**
 * The level's own actions, as buttons a thumb can reach.
 *
 * ---------------------------------------------------------------------------
 * The promise this keeps
 * ---------------------------------------------------------------------------
 * `MAX_PLAYER_KEYS` is five *because* those become on-screen buttons on a phone
 * - that is the reason the number is five and not fifteen, and it is written
 * down in docs/xp/backlog.md §6. Until now nothing drew them: the touch layout
 * was a stick and a jump, so a level whose whole point was pressing E to open
 * the door was unplayable on the device the cap was chosen for.
 *
 * ---------------------------------------------------------------------------
 * Why a module rather than a `.map` in the component
 * ---------------------------------------------------------------------------
 * The same argument `bindingsFor` makes for the headset, one file over: the
 * button that *acts* has to be the button the controls card *printed*, and the
 * way those drift apart is each being derived separately. Here the derivation
 * is trivial - document order, capped - and it is still worth a named function,
 * because "trivial" is what the VR mapping looked like before it had four cases
 * in it.
 *
 * It is also the half that is testable. What a `does` of `open the hatch` looks
 * like on a 56px circle is a question with a right answer, and answering it in
 * JSX means answering it in a browser on a phone.
 */

/** A binding, as `player.keys` carries it. The same shape ./actions takes. */
export interface Binding {
  key: string
  does: string
}

/** One button, ready to draw. */
export interface ThumbKey {
  /** What the rules listen for. Handed back to `onPress` untouched. */
  does: string
  /** What is drawn on the button - short, uppercase, possibly clipped. */
  label: string
  /** The whole name, for the screen reader and the long-press tooltip. */
  title: string
}

/**
 * How many characters fit on the face of a button.
 *
 * Six, measured against the circle these are drawn on rather than guessed: a
 * seventh character at this size either shrinks the text below what a thumb can
 * read at arm's length or spills outside the ring. A clipped word is legible
 * where a squeezed one is not - "GRAPPL" still says which button it is, and the
 * full name is on the element for anything that reads names.
 */
export const LABEL_MAX = 6

/**
 * The face of a button, from the name the document gave the action.
 *
 * **The first word wins.** A `does` of `open the hatch` becomes OPEN, not
 * OPENTH - an author writing a phrase has already put the important word first,
 * and running the words together produces something that reads as a different
 * word entirely. Only when the first word alone is too long is it clipped.
 */
export function faceOf(does: string): string {
  const first = does.trim().split(/\s+/)[0] ?? ''
  return first.slice(0, LABEL_MAX).toUpperCase()
}

/**
 * Which bindings get a button, in the order they are drawn.
 *
 * Document order, which is the order the controls panel lists them in - so the
 * card and the thumb agree without either consulting the other.
 *
 * **Capped again here even though the format caps it.** `parseXp` refuses a
 * sixth binding, so this can only ever matter for a document that reached the
 * runtime another way; what it costs is one `slice`, and what it buys is that a
 * bad document is a level missing a button rather than a column of buttons over
 * the whole screen with the jump underneath it.
 *
 * **An unnamed action gets no button**, because there would be nothing to draw
 * on it and nothing for the rules to hear - `does` is what `on: 'pressed'`
 * carries.
 */
export function thumbKeys(keys: readonly Binding[] | undefined): ThumbKey[] {
  if (!keys) return []

  const seen = new Set<string>()
  const out: ThumbKey[] = []

  for (const binding of keys) {
    const does = binding.does?.trim()
    if (!does) continue

    /*
     * One button per action, not per key.
     *
     * Two keys bound to the same `does` is a document offering an alternative
     * on the keyboard - and drawing two identical circles on a phone would be
     * offering a choice that does not exist.
     */
    if (seen.has(does)) continue
    seen.add(does)

    out.push({ does, label: faceOf(does), title: does })
    if (out.length === MAX_PLAYER_KEYS) break
  }

  return out
}

/**
 * One more of something, on a fresh map.
 *
 * Fresh rather than mutated, and both halves of that matter. The map is handed
 * to the frame loop as readonly, so writing into it in place would make the
 * reader hold something that changed under it; and the loop tells "a thumb did
 * something" from the object no longer being the one it saw last frame, which
 * an in-place write does not say.
 *
 * A function rather than a spread at each call site because there are two maps
 * now - what was pressed and what was let go of - and the two counting the same
 * way is the whole reason `tapsSince` can read either.
 */
export function countUp(
  counts: Readonly<Record<string, number>>,
  does: string,
): Readonly<Record<string, number>> {
  return { ...counts, [does]: (counts[does] ?? 0) + 1 }
}

/**
 * Which actions were tapped between two readings of the totals.
 *
 * The touch half of `pressesFrom`, and it exists for the same reason: a thumb
 * button has no `keydown` the frame loop can hear, so the edge is found by
 * comparing what the counter says now against what it said last frame.
 *
 * Counting the *difference* rather than answering yes/no is what makes a double
 * tap between two frames two presses. At 60fps that is a 16ms window and easy
 * to dismiss - and it is exactly the window a rhythm level lives in.
 *
 * A counter that went backwards is treated as no presses rather than as a
 * negative number of them. That means a fresh buffer - a level reloaded under a
 * controller that kept its memory - loses at most the taps of one frame instead
 * of firing a burst of them.
 */
export function tapsSince(
  before: Readonly<Record<string, number>>,
  now: Readonly<Record<string, number>>,
  /** Draw order, so two actions tapped in one frame fire the way they are shown. */
  order: readonly ThumbKey[],
): string[] {
  const fired: string[] = []

  for (const action of order) {
    const times = (now[action.does] ?? 0) - (before[action.does] ?? 0)
    for (let index = 0; index < times; index += 1) fired.push(action.does)
  }

  return fired
}
