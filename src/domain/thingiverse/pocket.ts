/**
 * What you are carrying, in your pockets, while you are in this room.
 *
 * ---------------------------------------------------------------------------
 * Why a room needs one at all
 * ---------------------------------------------------------------------------
 * Because `craft` made taking a thing off a table possible and left it nowhere
 * to go. A slot hands over a patty and the patty has to be *somewhere* between
 * the rack and the pan - and the three places it could be are all worse than a
 * pocket:
 *
 *   - **Summoned as a thing on the floor.** That is a row per pickup in a world
 *     capped at sixty-four objects, and a kitchen would fill it in a minute.
 *   - **Held in the hands, one at a time.** This is what the *carry* verb does
 *     for furniture (see `LoungeThings.carrying`), and it is right for a bench:
 *     a bench is a thing in the world you are moving. An ingredient is not - you
 *     do not carry a slice of onion across a room in both arms - and one-at-a-
 *     time makes a three-ingredient recipe three trips.
 *   - **Nowhere: taking puts it straight into the next slot.** That is a rule
 *     with no verb, and it means you can never take something out to look at it.
 *
 * ---------------------------------------------------------------------------
 * Words, not things
 * ---------------------------------------------------------------------------
 * A pocket holds the same thing a slot holds: a *word*, resolved against the
 * shelf like `/thingiverse patty` is. Not a thing id, because the item that
 * went into the pocket stopped existing when the slot handed it over - there is
 * no row to point at - and not a blueprint id, for the reason `./craft` gives
 * at length about ids going stale the moment somebody rebuilds an item.
 *
 * ---------------------------------------------------------------------------
 * It does not survive the room
 * ---------------------------------------------------------------------------
 * The same promise `vanish` makes and `./live` makes: what you are carrying
 * lasts as long as you are standing here. Persisting it is a real feature and a
 * different one - it needs a row per player, a decision about whether a pocket
 * follows you between spaces, and an answer for what happens to an item whose
 * blueprint was retired while it was in your coat. None of those are questions
 * a room should answer by accident, and all of them arrive the moment the first
 * pocket is written down.
 */

/**
 * How much fits.
 *
 * Eight, which is two recipes' worth with room to pick up something you did not
 * mean to. It is also about as many chips as fit across a HUD row on a phone
 * without becoming two rows - and a pocket you have to scroll is a pocket you
 * stop looking in.
 */
export const POCKET_SIZE = 8

/** The key that opens it. */
export const POCKET_KEY = 'l'

/**
 * What is in your pockets, and which one is in your hand.
 *
 * `holding` is an index rather than a word, because two of the same item is an
 * ordinary thing to be carrying - two buns - and a word would make "put down
 * the one I picked" ambiguous between them. Null is empty-handed, which is a
 * state you are in most of the time and which the put/take rule below reads.
 */
export interface Pocket {
  items: readonly string[]
  holding: number | null
}

/** Empty, which is what you arrive with. */
export function emptyPocket(): Pocket {
  return { items: [], holding: null }
}

/** What is in your hand, or nothing. */
export function inHand(pocket: Pocket): string | undefined {
  if (pocket.holding === null) return undefined
  return pocket.items[pocket.holding]
}

/** Whether there is room for another. */
export function roomFor(pocket: Pocket): boolean {
  return pocket.items.length < POCKET_SIZE
}

/**
 * Put something in.
 *
 * The new item becomes the one in your hand, which is the behaviour that makes
 * a kitchen work without a click between every step: take the patty, walk to
 * the pan, press G. Having to select what you just picked up would be a second
 * verb for something the first one already told us.
 *
 * A full pocket refuses and says so by returning the pocket unchanged - the
 * caller compares, and the slot keeps its item. That is the honest failure: the
 * thing you tried to take is still sitting there, which is a thing you can see.
 */
export function pocketed(pocket: Pocket, item: string): Pocket {
  if (!roomFor(pocket)) return pocket
  const items = [...pocket.items, item]
  return { items, holding: items.length - 1 }
}

/**
 * Take something out.
 *
 * What is in your hand afterwards is the item that slid into the gap, or the
 * one before it at the end of the list, or nothing. Not "always nothing", which
 * is the obvious rule and is wrong for the case that matters: putting down the
 * second of two buns should leave you holding the first, so the next G puts it
 * down too. Emptying your hand after every placement makes a four-ingredient
 * recipe four trips to the pocket.
 */
export function dropped(pocket: Pocket, at: number): Pocket {
  if (at < 0 || at >= pocket.items.length) return pocket
  const items = pocket.items.filter((_, index) => index !== at)
  if (items.length === 0) return { items, holding: null }
  return { items, holding: Math.min(at, items.length - 1) }
}

/** Pick which one is in your hand. Out of range empties it. */
export function holding(pocket: Pocket, at: number | null): Pocket {
  if (at === null || at < 0 || at >= pocket.items.length) {
    return { ...pocket, holding: null }
  }
  return { ...pocket, holding: at }
}

/**
 * Step to the next thing in your pocket, wrapping.
 *
 * Because the panel is not the only way to change hands, and should not be: a
 * kitchen is a place you are moving through, and opening a menu between every
 * ingredient is the difference between cooking and doing data entry. An empty
 * pocket stays empty-handed rather than wrapping to nothing-th item.
 */
export function nextInHand(pocket: Pocket): Pocket {
  if (pocket.items.length === 0) return { ...pocket, holding: null }
  if (pocket.holding === null) return { ...pocket, holding: 0 }
  return { ...pocket, holding: (pocket.holding + 1) % pocket.items.length }
}
