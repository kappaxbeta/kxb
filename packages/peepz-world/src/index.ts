/**
 * Peepz World: a house, a garden, and the ground both of them stand on.
 *
 * ---------------------------------------------------------------------------
 * Rules, and no renderer
 * ---------------------------------------------------------------------------
 * The same split `src/domain/home` always described from inside the app - *"the
 * domain owns every rule and the scene owns none of them"* - now expressed as a
 * package boundary rather than as a folder convention. Everything in here is a
 * plain transformation of one state into the next: what a square can hold, what
 * it costs, how comfortable the result is, which edges are walls. None of it
 * imports React, three.js, Supabase or this app.
 *
 * That is what makes the whole of the house testable without a canvas, and it
 * is the property the package boundary is here to keep: `src/app` can reach
 * this, and this cannot reach back.
 *
 * ---------------------------------------------------------------------------
 * Why the grid lives here and the café borrows it
 * ---------------------------------------------------------------------------
 * `./world/grid` is not the house's - it is the ground every place in this
 * world is drawn on, at two units a square because that is how both model packs
 * are authored. The café stands on the same ground and buys its floor by the
 * same rule, so `@kxb/dream-restaurant` depends on this package for it rather
 * than keeping a second copy of `TILE` that could drift.
 *
 * `./world/places` is the same argument for the *vocabulary*: which places
 * exist, which of them somebody owns, and which can be decorated. Two packages
 * disagreeing about whether "outdoor" is a place is not a bug either of them
 * could catch.
 *
 * ---------------------------------------------------------------------------
 * What is deliberately not here
 * ---------------------------------------------------------------------------
 * The purse. `./world/save` holds the *starting* balance and the comfort keys,
 * and nothing that reads or writes a real one: the money is an aggregate in the
 * app's event log, shared with the café, and a package that owned it would be a
 * package that has to know what a tenant is. See `src/domain/homestead`.
 */

export { TILE, tileKey, parseTile, tileToWorld, DIRECTIONS } from './world/grid'
export type { Tile, TileKey, Direction } from './world/grid'

export { PLACES, PLACE_IDS, place, isOwnedPlace, hrefFor } from './world/places'
export type { Place, PlaceId, OwnedPlace, DecoratablePlace } from './world/places'

export { STARTING_COINS, comfortKey } from './world/save'

export * from './rules/catalog'
export * from './rules/plan'
export * from './rules/game'
