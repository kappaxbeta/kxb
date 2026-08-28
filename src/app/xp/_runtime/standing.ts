import { MAIN_SCENE, placeOf, type XpDocument } from '@kxb/xp'

/**
 * The document as it is from where you are standing.
 *
 * A document holds more than one place (docs/xp/scenes.md §1.1) and a player is
 * in exactly one of them. Everything downstream of this - the solids, the
 * camera, the spawn, the entity world the engine opens - was written against a
 * document with one world in it, and all of it is still right; what it needs is
 * to be handed the *room*, not the file.
 *
 * ---------------------------------------------------------------------------
 * A projection here, and deliberately not in the parser
 * ---------------------------------------------------------------------------
 * `parseXp` refuses to do this, and task.md §I.0.2 records why: the editor
 * writes a parsed document straight back out, so projecting the entry scene
 * onto `world`/`spawn` there would mean a save that put one room's world where
 * the root's used to be, and the root's would be gone. The same operation is
 * safe here because nothing downstream of the runtime writes a document - the
 * editor holds the real one, and this is a view of it that exists for as long
 * as somebody is standing in that room.
 *
 * ---------------------------------------------------------------------------
 * The actors are the room's, and never the root's
 * ---------------------------------------------------------------------------
 * A scene carries its own `entities` since the format half of S1, and this
 * hands over that list - not the root's, and not the two together. Inheriting
 * would put every pad, turret and pickup in every room at once; merging would
 * be the same thing with extra steps. An arcade cabinet standing in the lobby
 * is not also standing in the back room.
 *
 * Which is why an empty room is still *empty* rather than falling back: a scene
 * with no actors in it is a room somebody has not furnished yet, and the honest
 * picture of that is nothing there. Before the format could say so this line
 * emptied every scene by force, and the difference now is only that the
 * document is the one deciding.
 *
 * The rest of the document is shared and stays: blueprints, scripts, the
 * player's own body, the rules and the camera all belong to the game rather
 * than to the room it is being played in.
 */
export function standingIn(xp: XpDocument, scene: string): XpDocument {
  if (scene === MAIN_SCENE) return xp
  const place = placeOf(xp, scene)
  /**
   * A name that is not a place leaves you where you were.
   *
   * Null covers a scene nobody wrote and a door out of the document, and
   * neither is somewhere to stand. Falling back to the root rather than
   * refusing, because the caller reaching this has already been told - a name
   * that resolves to nothing is `planLoad`'s `closed`, which is said on the
   * ticker - and a level that goes black on top of that is a second failure
   * for one mistake.
   */
  if (!place) return xp
  return { ...xp, world: place.world, spawn: place.spawn, entities: place.entities }
}

/**
 * The room a session opens in, when whoever mounted it has asked for one.
 *
 * `XpScene` decides where a session starts from the *document* - the round's
 * scene if it names one, and `enter` otherwise - and that is right for every
 * way a level is normally reached: the catalogue, a room, a battle. The editor
 * is the exception, and it is the exception for a reason worth writing down.
 *
 * **Try means "try this room".** Somebody building the cellar and pressing it
 * is asking to look at the cellar, and answering with the front room because
 * that is where the *level* opens is answering a question they did not ask -
 * with no way to get there except a door they may not have built yet. So the
 * caller may name a room, and the caller wins, the same way `mode` wins over
 * what the document would have picked.
 *
 * Null for a name this document does not hold, which sends the decision back to
 * the document rather than into an empty room. That covers the editor's own
 * stale case - a room removed while the preview was closed - and it covers a
 * caller who simply guessed. `main` is a room by this test: `placeOf` answers
 * for the root as well as for the scenes table, which is what makes "the level
 * itself" a thing you can ask for by name rather than an absence.
 */
export function askedFor(xp: XpDocument, scene: string | undefined): string | null {
  if (!scene) return null
  return placeOf(xp, scene) ? scene : null
}
