import { MAIN_SCENE, resolveScene } from '@kxb/xp'

/**
 * What to do about a `load`, before anything is fetched.
 *
 * The trust half is not decided here - `resolveScene` in the engine already
 * answers it, and its own note says why: "internal is instant, external asks
 * permission" is a rule about where a document came from, which is a fact the
 * engine has and a `fetch` call site does not. A host that worked it out again
 * would be a second place that could get it wrong, and getting it wrong means
 * either a prompt on every door or no prompt on a stranger's.
 *
 * What *is* decided here is everything else a host has to know before it can
 * open one, and each of the four answers below is a case that would otherwise
 * be a bug:
 *
 * - **`closed`** - the name resolves to nothing. An author may name a scene
 *   before writing it, so this is a door that does not open rather than an
 *   error, exactly as `resolveScene` asks.
 * - **`here`** - it points at the document already running. A plate you are
 *   standing on can fire its rule on many frames, and reloading the level you
 *   are in would restart it under somebody every time they walked over it.
 * - **`busy`** - a load is already in flight. The same plate, one frame later:
 *   without this every frame starts another fetch of the same file, and which
 *   of them lands last decides where you end up.
 * - **`go` / `ask`** - a real destination, and whether to stop and ask first.
 * - **`scene`** - a room in the document already open. Nothing is fetched and
 *   nothing is asked: the world, the spawn and the marks are already on this
 *   machine, and what changes is which of them is on screen.
 */
export type LoadPlan =
  | { kind: 'closed'; name: string }
  | { kind: 'here' }
  | { kind: 'busy' }
  | { kind: 'go'; target: string; url: string }
  | { kind: 'ask'; target: string; url: string }
  /**
   * Somewhere in this document - docs/xp/scenes.md §1.1.
   *
   * The name rather than the place, deliberately. Every client resolves it
   * against its own copy of the document, exactly as it does for a door out,
   * which is what lets one broadcast carry a room through a door without any
   * machine handing another one a world to render.
   */
  | { kind: 'scene'; name: string }

/**
 * Where a resolved target actually lives.
 *
 * An internal id is a file this app serves out of `public/`, which is what
 * makes a client-side fetch of it work at all. An external target has already
 * been validated as an https URL at parse time, so it is its own address.
 *
 * The two are deliberately one function: a target that took the wrong branch
 * would either 404 on a real level or fetch a stranger's URL through a path
 * meant for local files.
 */
export function xpUrl(target: string, external: boolean): string {
  return external ? target : `/xp/xps/${target}.xp.json`
}

export function planLoad({
  name,
  names,
  scenes,
  currentId,
  standing,
  busy,
}: {
  /** The name as the document wrote it, before the `scenes` table is consulted. */
  name: string
  /**
   * Which of the two kinds of destination the verb said it was.
   *
   * `'either'` is the older `load xp:` - a name that is a room here if the
   * table says so and a document to fetch otherwise, which is the precedence
   * `resolveScene` describes and every document written before this relies on.
   *
   * `'scene'` is `load scene:`, and its whole value is that the fallback is
   * *gone*: a name the table does not answer for is a door that does not open,
   * never a request for `public/xp/xps/<name>.xp.json`. Without the
   * distinction, deleting a scene from the table would silently turn a door
   * between two rooms into a fetch for a stranger's file - a different failure,
   * at play, from the one the author made in the editor.
   */
  names: 'either' | 'scene'
  /**
   * As wide as the document's own table, which holds two kinds of value.
   *
   * A value may be a door (a string) or a place in this document (a scene), and
   * both are answered here now - which is the change S1 made. `resolveScene`
   * still answers only the first and returns null for a scene, so the order
   * below matters: a place is looked for before a document is.
   */
  scenes: Readonly<Record<string, unknown>> | undefined
  /** The id of the document running right now. */
  currentId: string
  /** Which room of it the player is standing in. `enterOf` at the start. */
  standing: string
  /** Whether a load is already in flight. */
  busy: boolean
}): LoadPlan {
  /**
   * A place in this document, before anything is treated as a document.
   *
   * The order is the whole of it, and `main` is why. The root's world is the
   * scene called `main` and is not in the table, so falling through would hand
   * `resolveScene` a bare id - and a bare id that looks like one of ours is a
   * *fetch*, so `load main` would go looking for `public/xp/xps/main.xp.json`
   * instead of walking back into the level's own front room.
   *
   * The same argument holds for a named scene: `scenes.cellar` as an object is
   * a room here, and the document `cellar` is somebody else's file that may not
   * exist. `resolveScene` already refuses to guess between them - it returns
   * null for an object - which leaves the question here, where the answer is
   * known.
   */
  if (name === MAIN_SCENE || isPlace(scenes?.[name])) {
    /**
     * A door into the room you are standing in does nothing, for the reason a
     * door into the document you are running does: a plate fires on many frames
     * while somebody stands on it, and re-entering a scene would put them back
     * on the spawn once per frame.
     */
    return name === standing ? { kind: 'here' } : { kind: 'scene', name }
  }

  /**
   * A door that said it was a room, and is not one, stops here.
   *
   * The `closed` branch below reached by a different route, and it has to be
   * this one rather than a fall-through: the author wrote `scene`, so treating
   * the name as a document would be the runtime overruling them in the one
   * direction that costs something - a request to the network for a file they
   * never mentioned.
   */
  if (names === 'scene') return { kind: 'closed', name }

  const resolved = resolveScene(name, scenes)
  if (!resolved) return { kind: 'closed', name }

  /**
   * Checked before `busy`, so a door back into the room you are in is a
   * no-op rather than something that queues behind an unrelated fetch.
   *
   * Only for internal targets: an external URL is not comparable to a local
   * id, and two different sites may both call a level `arena`.
   */
  if (!resolved.external && resolved.target === currentId) return { kind: 'here' }
  if (busy) return { kind: 'busy' }

  const url = xpUrl(resolved.target, resolved.external)
  return resolved.external
    ? { kind: 'ask', target: resolved.target, url }
    : { kind: 'go', target: resolved.target, url }
}

/**
 * Whether a door is worth telling the room about.
 *
 * Only the two that actually go somewhere. The other three are local facts: a
 * name this document does not resolve, a door back into the level we are in,
 * and one that arrived while a fetch was already running. Announcing any of
 * them would move everybody else through a door that did nothing here - and
 * `here` is the sharp one, because a plate somebody is standing on fires on
 * many frames, so the room would be told to reload the level it is already in,
 * over and over.
 *
 * `ask` counts even though nothing has been fetched yet: the door was opened,
 * and whether each client follows it is that client's own decision to make.
 *
 * `scene` counts most of all. It is the case where the room *must* move
 * together: the scene is in the topic, so a client that switched without
 * saying so has left the topic everybody else is on, and the room is two rooms
 * with nothing on either screen to say why.
 */
export function worthAnnouncing(plan: LoadPlan): boolean {
  return plan.kind === 'go' || plan.kind === 'ask' || plan.kind === 'scene'
}

/**
 * Whether a `scenes` entry is a place rather than a door.
 *
 * A string is somewhere else - one of ours, or an https URL - and an object is
 * a room here. One table, two kinds of value, settled at S0. `resolveScene`
 * makes the same test from the other side and answers null for a place, so
 * this is deliberately the *same* rule and not a second one: the two are two
 * halves of one question, and a document a door does not open and a scene
 * cannot enter is what a disagreement between them would look like.
 */
function isPlace(value: unknown): boolean {
  return value !== undefined && typeof value !== 'string'
}
