/**
 * Where the animator's working file lives between visits.
 *
 * Lifted out of `./animator` when the capture page needed to write one: a
 * recording ends with a document nobody has edited yet, and the useful thing
 * to do with it is to leave it where the editor will pick it up, so "record" and
 * "now fix that elbow" are one step apart.
 *
 * Two writers of one key is exactly the kind of thing that drifts - one of
 * them spells the rig `person`, or forgets that there is a key per body - so
 * the key is computed in one place and both import it. That is the whole file.
 */
import type { RigId } from '@/domain/animator/rig'

/** Same bargain as the builder: a browser-local document, no table behind it. */
const STORE = 'ovaloffice:animator'

/**
 * The draft, per body.
 *
 * One key was enough while there was one rig. It is not now: a document is a
 * list of whole *poses*, keyed by bone name, so a person's draft loaded onto a
 * fox is every bone missing and every key a rest pose. `parseDoc` fills the
 * gaps from the model rather than failing, which makes the failure silent -
 * you open the peep and find an animation of nothing.
 */
export function draftKey(rig: RigId): string {
  return `${STORE}:${rig}`
}
