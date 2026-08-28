/**
 * What the outside has already been told, so it is not told again.
 *
 * The most-repeated shape in `./simulation`'s frame callback, written out four
 * times with four different comments all making the same point:
 *
 *     if (next !== last.current) {
 *       last.current = next
 *       tellSomebody(next)
 *     }
 *
 * — the seconds left on a phase, the health and ammunition readout, the
 * whistle, and the list of things with a damage bar over them.
 *
 * ---------------------------------------------------------------------------
 * Why it exists at all
 * ---------------------------------------------------------------------------
 * A frame callback runs sixty times a second and most of what it computes is
 * the same as last time. Every one of these sits between the loop and React:
 * calling `setState` unconditionally would re-render a HUD, or a whole scene of
 * instanced meshes, to draw the two numbers it was already drawing.
 *
 * So the ref is not a cache of the value — nothing reads it back. It is a
 * memory of **what was said**, and the only question asked of it is whether
 * this is news.
 *
 * ---------------------------------------------------------------------------
 * Compared, not deep-compared
 * ---------------------------------------------------------------------------
 * Identity by default, which is why the vitals site builds a *string* out of
 * two numbers rather than comparing an object that is rebuilt every frame and
 * is therefore never equal to itself. Where a real comparison is needed — the
 * list of damage bars — it is passed in, because the cheap answer is right
 * everywhere else and a deep compare running sixty times a second is the thing
 * this exists to avoid.
 *
 * `Object.is` rather than the `!==` the four call sites used, and the one case
 * where they differ is worth naming: `NaN !== NaN` is true, so a countdown that
 * ever went `NaN` would have been reported as news on every frame, forever.
 * Not reachable today — the frame's delta is clamped — but a silent
 * sixty-times-a-second `setState` is a poor way to find out that changed.
 */
/**
 * Whether this is news, and remembers it if so.
 *
 * Returns true exactly when the caller should go and tell somebody. The
 * remembering happens here rather than at the call site because the two must
 * not drift: a site that reports without remembering repeats itself forever,
 * and one that remembers without reporting goes quiet for good.
 */
export function isNews<T>(
  next: T,
  told: React.RefObject<T>,
  same: (a: T, b: T) => boolean = Object.is,
): boolean {
  if (same(next, told.current)) return false

  told.current = next
  return true
}
