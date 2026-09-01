import type { BlueprintSpec, ThingDeed } from '@/domain/thingiverse/blueprint'

/**
 * What a thing is doing, in a shot, at all.
 *
 * A blueprint says *when* it acts - `always`, or on `touch`, `near` and `use` -
 * and a shot has nobody standing in it. Three of those four can therefore never
 * happen on their own, and a studio that honoured them strictly would draw
 * every prop standing still, which is the feature not working.
 *
 * So `always` runs and the rest run when the author says the prop is being
 * triggered. That is not a claim somebody touched it; it is the author saying
 * "shoot it as though somebody had", and it is off by default because the
 * commonest thing to do on touch is `vanish` - a prop that disappeared the
 * moment it was placed is one nobody would place twice.
 *
 * A set rather than the actions, because every caller asks "is it spinning",
 * never "which rule made it spin", and two actions can name the same deed.
 *
 * Pure and here rather than in the renderer, so the rule can be read once and
 * tested without a GPU - the same bargain the rest of `@/domain/studio` makes.
 */
export function deedsInShot(
  spec: Pick<BlueprintSpec, 'actions'>,
  triggered: boolean,
): ReadonlySet<ThingDeed> {
  const out = new Set<ThingDeed>()
  for (const action of spec.actions ?? []) {
    if (action.when === 'always' || triggered) out.add(action.deed)
  }
  return out
}

/**
 * The clip a thing plays while it stands there, at a moment.
 *
 * The standing clip unless a `play` deed is running, which names its own. Null
 * is a still model, and a name that finds nothing draws the model standing
 * still rather than failing - the promise `BlueprintSpec.clip` already makes.
 */
export function clipInShot(
  spec: Pick<BlueprintSpec, 'actions' | 'clip'>,
  triggered: boolean,
): string | null {
  if (!deedsInShot(spec, triggered).has('play')) return spec.clip
  const played = (spec.actions ?? []).find(
    (action) => action.deed === 'play' && (action.when === 'always' || triggered),
  )
  return played?.value ?? spec.clip
}
