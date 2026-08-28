/**
 * The three places, and the fact that they are the same world.
 *
 * A list rather than three hardcoded links, because every place needs to offer
 * the other two and none of them should have to know what those are. The café
 * does not import the house to link to it; it imports this.
 */

export type PlaceId = 'cafe' | 'home' | 'outdoor' | 'lounge'

/**
 * The same four, as values.
 *
 * A union is a compile-time thing and cannot be checked against at a boundary,
 * so anything validating a place id sent by a browser needs this - see
 * `placeSchema` in the radio commands. Written as a `const` tuple and tied back
 * to `PlaceId` with `satisfies`, so the two cannot drift: adding a place to the
 * union without adding it here is a type error rather than a validator that
 * quietly rejects the new place.
 *
 * Deliberately not derived from `PLACES` below. That array is ordered for the
 * travel bar and carries copy; this is an identity list, and a validator that
 * moved when somebody reordered a menu would be a surprising thing to own.
 */
export const PLACE_IDS = ['cafe', 'home', 'outdoor', 'lounge'] as const satisfies readonly PlaceId[]

/**
 * The places that are a floor plan you decorate.
 *
 * The café is a place you *travel* to but not one the house's code can render -
 * it has customers and a till and a different pack of models. Narrowing the type
 * here is what stops `planFor('cafe')` being a runtime throw that a caller has
 * to remember not to trigger.
 */
export type DecoratablePlace = Exclude<PlaceId, 'cafe' | 'lounge'>

/**
 * The places somebody owns, which is every place except the commons.
 *
 * This is the type the door takes. A knock is addressed to a person's café, and
 * there is no person whose lounge it is - so narrowing here is what stops
 * `knock({ place: 'lounge' })` being a request nobody can answer.
 */
export type OwnedPlace = Exclude<PlaceId, 'lounge'>

export interface Place {
  id: PlaceId
  name: string
  /** Shown under the name on the travel bar. One line, lower case. */
  blurb: string
  /**
   * Whose it is.
   *
   * The lounge is the commons: one per workspace, and every member is already
   * welcome in it. The other three are *somebody's* - one café, house and
   * garden per member since 20260730000000 - which is what gives them a door to
   * knock on and the lounge none.
   */
  owned: 'space' | 'member'
}

export const PLACES: Place[] = [
  {
    id: 'cafe',
    name: 'Café',
    blurb: 'cook, serve, earn',
    owned: 'member',
  },
  {
    id: 'home',
    name: 'Home',
    blurb: 'spend it on the house',
    owned: 'member',
  },
  {
    id: 'outdoor',
    name: 'Outdoors',
    blurb: 'the garden between them',
    owned: 'member',
  },
  {
    id: 'lounge',
    name: 'Lounge',
    blurb: 'the shared voxel world',
    owned: 'space',
  },
]

/** The places that belong to a member, and so have a door. */
export function isOwnedPlace(id: PlaceId): id is OwnedPlace {
  return place(id).owned === 'member'
}

/**
 * Where a place lives, and whose copy of it you mean.
 *
 * Every place is inside a workspace now - the public `/cafe`, `/home` and
 * `/outdoor` prototypes were retired once homesteads became personal, because a
 * signed-out house has no owner and so no door, which is the whole feature.
 *
 * `of` is the member whose place it is. Omitted means your own, which is why
 * visiting is always the longer URL: the short one can never accidentally point
 * at somebody else's house, so a stale link cannot walk you into a stranger's
 * café. The lounge ignores it entirely - nobody owns the commons.
 *
 * The path segment is the place id, which is not a coincidence worth relying on
 * silently: it is why this is one template rather than a lookup table that could
 * drift out of step with the folder names.
 */
export function hrefFor(id: PlaceId, slug: string, of?: string): string {
  const base = `/t/${slug}/${id}`
  return of && id !== 'lounge' ? `${base}?of=${of}` : base
}

export function place(id: PlaceId): Place {
  const found = PLACES.find((entry) => entry.id === id)
  if (!found) throw new Error(`unknown place ${id}`)
  return found
}
