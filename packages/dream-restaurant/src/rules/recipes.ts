/**
 * What the café can make, and how food gets from a crate to a plate.
 *
 * Every id here is also a filename in `public/xo/restaunt/`, which is the whole
 * reason the data reads the way it does: the pack ships `burger_uncooked`,
 * `burger_cooked` and `burger_trash` as three separate models, so "cooking" is
 * naturally a *state machine over item ids* rather than a flag on an item. Doing
 * it the other way - one `patty` item with a `doneness` number - would leave the
 * renderer with nothing to look up.
 *
 * The chain is deliberately shallow. Two transforms deep is enough to make a
 * kitchen feel like a kitchen; three is where a prototype turns into a job.
 */

/** An id you can be holding. Ingredients, part-prepped things, and finished dishes. */
export type ItemId = string

export interface ItemDef {
  id: ItemId
  name: string
  /** Model, `pack/name` or a bare name for the restaurant pack. See `propUrl`. */
  model: string
  /**
   * Roughly how wide the model is, used to scale it down when it rides in the
   * chef's hands or sits on a counter. Measured from the glTF, not guessed.
   */
  bulk?: number
  /**
   * Models stacked on the base one, in the base model's units.
   *
   * Only the half-made things use this, and only because neither pack draws
   * them: nobody ships "pizza base with cheese on it, unbaked". Composing it
   * from the base and the topping is both cheaper than the alternative and more
   * informative than the alternative usually is - you can see at a glance which
   * pizza is about to go in the oven.
   */
  extras?: { model: string; x?: number; y?: number; z?: number; scale?: number }[]
}

/**
 * Everything that can exist as a loose object in the world.
 *
 * Finished dishes are in here too. A dish is not a special kind of thing - it is
 * an item that a customer happens to want, which is what lets `serve` be a plain
 * id comparison instead of a second type hierarchy.
 */
export const ITEMS: Record<ItemId, ItemDef> = {
  // --- raw, straight out of a crate -----------------------------------------
  bun: { id: 'bun', name: 'Bun', model: 'food_ingredient_bun' },
  patty_raw: {
    id: 'patty_raw',
    name: 'Raw patty',
    model: 'food_ingredient_burger_uncooked',
  },
  tomato: { id: 'tomato', name: 'Tomato', model: 'food_ingredient_tomato' },
  cheese: { id: 'cheese', name: 'Cheese', model: 'food_ingredient_cheese' },
  dough: { id: 'dough', name: 'Dough', model: 'food_ingredient_dough' },
  pepperoni: {
    id: 'pepperoni',
    name: 'Pepperoni',
    model: 'food_ingredient_pepperoni',
  },
  flour: { id: 'flour', name: 'Flour', model: 'cafe/flour_sack_closed' },
  egg: { id: 'egg', name: 'Egg', model: 'cafe/egg_A' },

  // --- prepped --------------------------------------------------------------
  patty_cooked: {
    id: 'patty_cooked',
    name: 'Cooked patty',
    model: 'food_ingredient_burger_cooked',
  },
  patty_burnt: {
    id: 'patty_burnt',
    name: 'Burnt patty',
    model: 'food_ingredient_burger_trash',
  },
  tomato_slices: {
    id: 'tomato_slices',
    name: 'Sliced tomato',
    model: 'food_ingredient_tomato_slices',
  },
  cheese_grated: {
    id: 'cheese_grated',
    name: 'Grated cheese',
    model: 'food_ingredient_cheese_grated',
  },
  dough_base: {
    id: 'dough_base',
    name: 'Pizza base',
    model: 'food_ingredient_dough_base',
  },
  pepperoni_slices: {
    id: 'pepperoni_slices',
    name: 'Sliced pepperoni',
    model: 'food_ingredient_pepperoni_slices',
  },

  // --- assembled, not yet baked ---------------------------------------------
  /**
   * What comes off the counter and goes into the oven.
   *
   * The step the kitchen was missing. Before this the oven took three loose
   * ingredients and did the assembling itself, which left the counter with
   * nothing to do on a pizza order and made "put the pizza in the oven" a thing
   * you could not actually do. Now the counter builds it and the oven bakes it,
   * which is both the real order of operations and one more station earning its
   * floor space.
   */
  pizza_cheese_raw: {
    id: 'pizza_cheese_raw',
    name: 'Unbaked cheese pizza',
    model: 'food_ingredient_dough_base',
    extras: [{ model: 'food_ingredient_cheese_grated', y: 0.08 }],
  },
  pizza_pepperoni_raw: {
    id: 'pizza_pepperoni_raw',
    name: 'Unbaked pepperoni pizza',
    model: 'food_ingredient_dough_base',
    extras: [{ model: 'food_ingredient_pepperoni_slices', y: 0.08 }],
  },
  cake_raw: {
    id: 'cake_raw',
    name: 'Cake batter',
    model: 'cafe/mixing_bowl',
    extras: [{ model: 'cafe/dough_ball', y: 0.1 }],
  },

  // --- finished dishes ------------------------------------------------------
  burger: { id: 'burger', name: 'Burger', model: 'food_burger' },
  pizza_cheese: {
    id: 'pizza_cheese',
    name: 'Cheese pizza',
    model: 'food_pizza_cheese_plated',
  },
  pizza_pepperoni: {
    id: 'pizza_pepperoni',
    name: 'Pepperoni pizza',
    model: 'food_pizza_pepperoni_plated',
  },
  icecream: {
    id: 'icecream',
    name: 'Ice cream',
    model: 'food_icecream_cone_vanilla',
  },
  coffee: { id: 'coffee', name: 'Coffee', model: 'cafe/mug_A_blue' },
  /** A whole cake is not a dish. It is stock for the display case. */
  cake: { id: 'cake', name: 'Cake', model: 'bakery/cake_chocolate' },
  cake_slice: {
    id: 'cake_slice',
    name: 'Slice of cake',
    model: 'bakery/cake_chocolate_slice',
  },

  // --- washing up -----------------------------------------------------------
  /**
   * Left behind when a customer finishes. Not an ingredient, but it obeys every
   * rule an item does - you carry it, and a station consumes it - so it is one.
   */
  plate_dirty: { id: 'plate_dirty', name: 'Dirty plate', model: 'plate_dirty' },
}

/**
 * Which station turns one item into another, and how long it takes.
 *
 * Stations process on their own once you put something in. Overcooked makes you
 * stand there and hold the button, which is the correct choice for a game about
 * panic - but this one is also about walking around a room you decorated, and a
 * chef rooted to a chopping board cannot do that. Auto-processing turns the
 * kitchen into a set of timers you are juggling, which is the fun part anyway.
 */
export interface Transform {
  /** Station kind that performs it. */
  at: 'prep' | 'stove'
  to: ItemId
  seconds: number
}

export const TRANSFORMS: Record<ItemId, Transform | undefined> = {
  dough: { at: 'prep', to: 'dough_base', seconds: 3 },
  cheese: { at: 'prep', to: 'cheese_grated', seconds: 3 },
  tomato: { at: 'prep', to: 'tomato_slices', seconds: 2.5 },
  pepperoni: { at: 'prep', to: 'pepperoni_slices', seconds: 2.5 },

  patty_raw: { at: 'stove', to: 'patty_cooked', seconds: 6 },
  /**
   * The reason a stove is not a fire-and-forget timer.
   *
   * A cooked patty left on the heat keeps going, so the stove is the one station
   * that punishes you for walking away - which is what makes the other stations'
   * generosity affordable.
   */
  patty_cooked: { at: 'stove', to: 'patty_burnt', seconds: 10 },
}

/** Ruined food. Only the bin takes it, and only the bin should. */
export function isWaste(item: ItemId): boolean {
  return item === 'patty_burnt'
}

/**
 * A thing a customer can order.
 *
 * `needs` is a multiset compared without order, so it does not matter which
 * topping goes in the oven first. `station` is what performs the combine, and
 * doubles as the unlock: you can only sell what you have the equipment for, so
 * buying a pizza oven *is* putting pizza on the menu. No separate unlock table
 * to keep in sync with the shop.
 */
export interface Recipe {
  id: ItemId
  name: string
  station: 'counter' | 'oven' | 'icecream' | 'coffee' | 'display'
  needs: ItemId[]
  /** Combine time. A cold counter is instant; an oven is not. */
  seconds: number
  /** What a customer pays, before the ambience multiplier. */
  price: number
  /**
   * A step on the way to something, not a thing anyone orders.
   *
   * Without this the counter's half-built pizza would appear on the menu and a
   * customer could sit down and ask for raw dough with cheese on it. The menu
   * filters these out; every other part of the pipeline treats them exactly like
   * a recipe, which is the point - the counter does not need to know that what
   * it just made is going in an oven next.
   */
  intermediate?: boolean
}

export const RECIPES: Recipe[] = [
  {
    id: 'icecream',
    name: 'Ice cream',
    station: 'icecream',
    needs: [],
    seconds: 2,
    price: 6,
  },
  {
    id: 'coffee',
    name: 'Coffee',
    station: 'coffee',
    needs: [],
    seconds: 4,
    price: 8,
  },
  {
    id: 'burger',
    name: 'Burger',
    station: 'counter',
    needs: ['bun', 'patty_cooked'],
    seconds: 0,
    price: 14,
  },

  // --- assembled on a counter, baked in the oven ----------------------------
  {
    id: 'pizza_cheese_raw',
    name: 'Unbaked cheese pizza',
    station: 'counter',
    needs: ['dough_base', 'tomato_slices', 'cheese_grated'],
    seconds: 0,
    price: 0,
    intermediate: true,
  },
  {
    id: 'pizza_pepperoni_raw',
    name: 'Unbaked pepperoni pizza',
    station: 'counter',
    needs: ['dough_base', 'tomato_slices', 'pepperoni_slices'],
    seconds: 0,
    price: 0,
    intermediate: true,
  },
  {
    id: 'cake_raw',
    name: 'Cake batter',
    station: 'counter',
    needs: ['flour', 'egg'],
    seconds: 0,
    price: 0,
    intermediate: true,
  },
  /**
   * The oven's recipes take one thing each.
   *
   * That is what makes "carry it from the counter to the oven" a real move
   * rather than a re-run of the assembly: there is nothing to combine here, only
   * something to wait for.
   */
  {
    id: 'pizza_cheese',
    name: 'Cheese pizza',
    station: 'oven',
    needs: ['pizza_cheese_raw'],
    seconds: 7,
    price: 20,
  },
  {
    id: 'pizza_pepperoni',
    name: 'Pepperoni pizza',
    station: 'oven',
    needs: ['pizza_pepperoni_raw'],
    seconds: 7,
    price: 26,
  },
  {
    id: 'cake',
    name: 'Cake',
    station: 'oven',
    needs: ['cake_raw'],
    seconds: 12,
    price: 0,
    intermediate: true,
  },
  /**
   * A cake is sold by the slice, from the case.
   *
   * The display case is the only station that gives back more than it was
   * given - one cake in, `CAKE_SLICES` out - which is what makes baking a cake
   * worth twelve seconds of oven time and makes the case worth its floor space
   * rather than being a prettier counter.
   */
  {
    id: 'cake_slice',
    name: 'Slice of cake',
    station: 'display',
    needs: ['cake'],
    seconds: 0,
    price: 11,
  },
]

/** How many servings one whole cake becomes when it goes in the case. */
export const CAKE_SLICES = 4

const RECIPE_BY_ID = new Map(RECIPES.map((recipe) => [recipe.id, recipe]))

export function recipe(id: ItemId): Recipe | undefined {
  return RECIPE_BY_ID.get(id)
}

/**
 * What a station with no inputs makes, if anything.
 *
 * The ice cream machine and the coffee machine are the same station wearing
 * different models: one press, one timer, one item. Looking the recipe up by
 * station rather than hard-coding the id is what let the coffee machine be a
 * catalog entry and two table rows instead of a branch in five functions.
 */
export function selfServeRecipe(station: string): Recipe | undefined {
  // Widened to `string` so a caller holding a `StationKind` can ask without
  // first proving the station is one that appears in this table. The answer for
  // a chopping board is "nothing", which is the useful reply anyway.
  return RECIPES.find(
    (entry) => entry.station === station && entry.needs.length === 0,
  )
}

/** Everything a dish needs before its final combine, walked back to the crates. */
export function rawInputs(id: ItemId): ItemId[] {
  const found = recipe(id)
  if (!found) return []
  return found.needs.map(sourceOf)
}

/** Walk a prepped item back to the raw thing a crate would give you. */
export function sourceOf(item: ItemId): ItemId {
  for (const [from, transform] of Object.entries(TRANSFORMS)) {
    if (transform && transform.to === item) return sourceOf(from)
  }
  return item
}

/**
 * Does this pile of items make this dish, exactly?
 *
 * Exactly, not "contains" - otherwise a counter holding a bun, a patty and a
 * stray tomato would silently produce a burger and eat the tomato, and the
 * player would never find out where their tomato went.
 */
export function matches(needs: ItemId[], items: ItemId[]): boolean {
  if (needs.length !== items.length) return false
  const remaining = [...items]
  for (const need of needs) {
    const at = remaining.indexOf(need)
    if (at === -1) return false
    remaining.splice(at, 1)
  }
  return true
}

/**
 * The recipe a station is part-way towards, if any.
 *
 * Used to decide whether a station will accept one more item. Without it you can
 * drop a bun into an oven that is halfway through a pizza, and the pile becomes
 * unmakeable with no way to see why.
 */
export function candidateRecipes(
  station: string,
  items: ItemId[],
): Recipe[] {
  return RECIPES.filter((entry) => {
    if (entry.station !== station) return false
    const remaining = [...entry.needs]
    for (const item of items) {
      const at = remaining.indexOf(item)
      if (at === -1) return false
      remaining.splice(at, 1)
    }
    return true
  })
}

/** Would adding `item` keep this station on track for something? */
export function accepts(
  station: string,
  items: ItemId[],
  item: ItemId,
): boolean {
  return candidateRecipes(station, [...items, item]).length > 0
}

/** The finished dish for a pile, or undefined if it is not there yet. */
export function completed(
  station: string,
  items: ItemId[],
): Recipe | undefined {
  return RECIPES.find(
    (entry) => entry.station === station && matches(entry.needs, items),
  )
}
