/**
 * Things that hold other things, and things made out of them.
 *
 * ---------------------------------------------------------------------------
 * A socket is a place; a slot is a place that is empty or full
 * ---------------------------------------------------------------------------
 * `Socket` already says *where* something attaches - the handle of a mug, the
 * seat of a kart, the hob of a cooker. What it does not say is that anything is
 * meant to go there, or what, or what happens when it does. A socket is a
 * coordinate with a name; a slot is a socket somebody can put a burger on.
 *
 * They are kept apart rather than merged because most sockets are not slots and
 * never will be: a seat sits on one, a muzzle fires from one, and a wheel turns
 * on one. Folding "what may be placed here" into `Socket` would put four empty
 * fields on every seat in the catalogue.
 *
 * ---------------------------------------------------------------------------
 * Items are named by word, not by id
 * ---------------------------------------------------------------------------
 * A slot that takes a `patty` says so with the word "patty", which is resolved
 * against the shelf exactly as `/thingiverse patty` is (see `./summon`). Not an
 * id, and the reason is the composer: there is no picker that could offer one,
 * blueprint ids are uuids nobody types, and an id would go stale the moment
 * somebody rebuilt the item as a new blueprint - which is what people do.
 *
 * The cost is real and worth naming: two blueprints called "patty" are a coin
 * toss, and a recipe pointing at a word nobody has drawn yet is a recipe that
 * silently never fires. The first is the same risk `/thingiverse` already runs
 * and resolves the same way (yours outranks the space's). The second is why
 * `craftProblems` insists the words are at least *words* - it cannot check that
 * a "patty" exists, because a blueprint is authored in one place and the shelf
 * lives in another, and a validator that needed the shelf could not run in the
 * composer while somebody is typing.
 *
 * ---------------------------------------------------------------------------
 * Why the recipe lives on the table and not in a book
 * ---------------------------------------------------------------------------
 * The obvious alternative is a space-wide recipe list - one page, every recipe,
 * any table can make anything. It is rejected because the interesting object is
 * the *table*: a cutting board makes a salad, a pan makes a patty, and a grill
 * makes neither. Putting the recipes on the thing is what makes the thing worth
 * walking to, and it is also what makes a recipe reviewable - it is right there
 * in the panel of the object it belongs to, rather than in a list of forty that
 * nobody can tell apart.
 */

/** How many slots one thing may have, and how many recipes it may know. */
export const MAX_SLOTS = 6
export const MAX_RECIPES = 6

/**
 * How many items one recipe may call for.
 *
 * Four, which is a burger (bun, patty, salad, sauce) and is also `MAX_SLOTS`
 * minus the two a table wants free. Past four the thing somebody is building is
 * a crafting *system*, which wants a book, a grid and a tree of intermediates -
 * and all three of those are a game, and a game is an XP.
 */
export const MAX_RECIPE_ITEMS = 4

/** How long an item's word may be. A shelf label, not a description. */
export const MAX_ITEM_NAME = 48

/**
 * The most a thing may cost, in coins.
 *
 * The play money the homestead already runs on - café takings and what the
 * house is worth, out of `@kxb/dream-restaurant` and `@kxb/peepz-world`. Not a
 * second currency, and not real money: a room that could charge actual money
 * for a sandwich is a payments feature with a refund policy attached, and this
 * is a game about a café.
 *
 * A thousand, which is a few shifts' takings - expensive enough that a price
 * can mean something and low enough that a typo is a bad afternoon rather than
 * a purse nobody can ever fill. Zero is free and is what absence means.
 */
export const MAX_PRICE = 1000

/**
 * How long a recipe may take, in seconds.
 *
 * Zero is allowed and is the common case: a cutting board assembles a salad the
 * instant the last leaf lands, and making somebody wait for it would be a
 * timer about nothing. The ceiling is a state machine's, because a recipe that
 * takes longer than that should be a state with a `fill` bar - which is the
 * thing that draws a wait somebody can see. See `./states`.
 */
export const MAX_RECIPE_SECONDS = 300

/**
 * One place something can be put.
 *
 * `gives` is the other half of the idea and the reason this is not called
 * `Slot`: the same field says both "this is where the pan goes" and "this
 * blueprint arrives with a pan already on it". A rack of tools, a bowl of
 * fruit, a weapon on a wall - every one of them is a thing that *contains*
 * something you can take, and none of them needed a second concept.
 */
export interface SlotSpec {
  /**
   * The socket it sits on. See `Socket`.
   *
   * A name that finds nothing puts the item at the thing's own origin, which is
   * the fallback `seatAt` makes and for the same reason: an item sitting in the
   * middle of the table is visible and fixable, and a slot that silently could
   * not be filled is neither.
   */
  socket: string
  /**
   * The words it accepts. Empty is "anything".
   *
   * Anything, rather than nothing, because the overwhelmingly common slot is a
   * table you put things on and the alternative would make every one of them
   * list its own inventory. A slot that must be picky says so.
   */
  takes: readonly string[]
  /** A word naming what it already holds when summoned. See the note above. */
  gives?: string
  /** Shouted when something lands in it. See `ThingState.emit`. */
  emit?: string
  /**
   * What taking from here costs, in coins. Absent is free.
   *
   * ---------------------------------------------------------------------------
   * Why a price is on the slot and not on the item
   * ---------------------------------------------------------------------------
   * Because an item is a *word*, and a word has no owner. "patty" costing four
   * coins would be a fact about every patty in the space, set by whoever typed
   * it first, and there would be nowhere to put the number that did not collide
   * with somebody else's kitchen.
   *
   * A slot is a place on a thing that somebody built and owns. Charging there
   * says what it means: *this counter* sells pattys. The same word is free off
   * the rack in the back, which is how a shop and a store room differ.
   */
  price?: number
}

/**
 * Some things, put together, making another thing.
 *
 * The output replaces the inputs: the bun, the patty and the salad are gone and
 * a burger is standing where the recipe said. That is the only version of this
 * that is honest about a room with sixty objects in it - a recipe that left its
 * ingredients behind would double the count every time somebody used it.
 */
export interface RecipeSpec {
  /** The words that must be on the thing. Order does not matter. */
  needs: readonly string[]
  /** The word naming what appears. */
  makes: string
  /**
   * How long it takes once the last ingredient lands. Absent is at once.
   *
   * A number here rather than a state, even though `./states` can express a
   * wait with a bar over it and this cannot. The two are for different things
   * and both are worth having: a state machine is what the *table* is doing,
   * and is where a grill that glows while it works belongs; this is how long
   * the assembly takes, and most assemblies take no time at all. A cutting
   * board that had to grow a three-state machine to chop a salad instantly
   * would be ceremony for the common case.
   */
  seconds?: number
  /**
   * Which slot the result lands in. Absent is the first one it needed.
   *
   * The first rather than the thing's origin, because the burger should be
   * where the burger was being made - on the board, not inside the table leg.
   */
  into?: string
  /** Shouted when it is done. */
  emit?: string
}

/** What a thing can hold, and what it can make. */
export interface CraftSpec {
  slots: readonly SlotSpec[]
  recipes: readonly RecipeSpec[]
}

/** A table with one place on it and nothing it knows how to make. */
export function freshCraft(socket: string): CraftSpec {
  return { slots: [{ socket, takes: [] }], recipes: [] }
}

/** A cutting board that turns the three obvious words into the fourth. */
export function freshBurger(socket: string): CraftSpec {
  return {
    slots: [{ socket, takes: [] }],
    recipes: [{ needs: ['bun', 'patty', 'salad'], makes: 'burger', emit: 'made' }],
  }
}

/**
 * Two words naming the same item.
 *
 * The catalogue's own matching rule, narrowed to an equality: lowercase, and
 * spaces and underscores are the same character. "Beef Patty", "beef patty" and
 * "beef_patty" are one item, which is what somebody typing into two different
 * panels a week apart expects. Not the fuzzy multi-term match `resolveSummon`
 * uses, and that is deliberate - a *search* should be generous, and a recipe
 * that fired because "bun" loosely matched "bunting" would be a recipe nobody
 * could debug.
 */
export function sameItem(a: string, b: string): boolean {
  return normal(a) === normal(b)
}

function normal(word: string): string {
  return word.trim().toLowerCase().replace(/[\s_]+/g, ' ')
}

/** Whether a slot will accept this item. */
export function accepts(slot: SlotSpec, item: string): boolean {
  if (slot.takes.length === 0) return true
  return slot.takes.some((takes) => sameItem(takes, item))
}

/**
 * Which recipe the things on the table satisfy, if any.
 *
 * ---------------------------------------------------------------------------
 * A sub-multiset, and the biggest one wins
 * ---------------------------------------------------------------------------
 * A recipe fires when everything it needs is present; anything else on the
 * table is ignored rather than blocking it. That is the forgiving reading and
 * it is the right one for a shared room, where the alternative - an exact match
 * - means somebody's stray coffee cup quietly breaks the kitchen.
 *
 * "Biggest" is how the ambiguity between two satisfied recipes is settled, and
 * it is the only ranking that does not surprise: a table that knows both
 * `bun+patty -> plain burger` and `bun+patty+salad -> burger` should make the
 * burger when all three are there. Falling back to authoring order would mean a
 * salad that silently does nothing depending on which recipe was typed first.
 *
 * Multiset rather than set, so `needs: ['patty','patty']` is a double and needs
 * two of them. That falls out of counting rather than being a feature, and it
 * would be a bug if it did not.
 */
export function matchRecipe(
  craft: CraftSpec,
  /** The words currently on the thing, one per filled slot. */
  held: readonly string[],
): RecipeSpec | undefined {
  let best: RecipeSpec | undefined
  for (const recipe of craft.recipes) {
    if (!satisfied(recipe, held)) continue
    if (!best || recipe.needs.length > best.needs.length) best = recipe
  }
  return best
}

/** Whether everything a recipe needs is on the table, counting duplicates. */
function satisfied(recipe: RecipeSpec, held: readonly string[]): boolean {
  if (recipe.needs.length === 0) return false
  const left = [...held]
  for (const need of recipe.needs) {
    const at = left.findIndex((item) => sameItem(item, need))
    if (at === -1) return false
    left.splice(at, 1)
  }
  return true
}

/**
 * Which slots a recipe consumes, by socket name.
 *
 * Returned rather than left to the caller because "which patty did it use" has
 * a wrong answer that is easy to reach: taking the *first* slot that matches
 * each need, in need order, is the only rule that consumes exactly what
 * `matchRecipe` counted. A caller that filtered slots by name instead would eat
 * both pattys when the recipe wanted one.
 */
export function consumes(
  recipe: RecipeSpec,
  /** Filled slots, in the thing's own order: which socket holds which word. */
  filled: readonly { socket: string; item: string }[],
): string[] {
  const left = [...filled]
  const used: string[] = []
  for (const need of recipe.needs) {
    const at = left.findIndex((one) => sameItem(one.item, need))
    if (at === -1) continue
    used.push(left[at].socket)
    left.splice(at, 1)
  }
  return used
}

/** Where a recipe's result lands. See `RecipeSpec.into`. */
export function landsAt(
  recipe: RecipeSpec,
  used: readonly string[],
): string | undefined {
  return recipe.into ?? used[0]
}

/**
 * Whatever is wrong with a craft block, said in words.
 *
 * The socket names are *not* checked against the blueprint's sockets, which is
 * the call every name in this neighbourhood makes (see `UseSpec.seats`): a slot
 * on a socket nobody has drawn yet holds its item at the thing's origin, which
 * is a thing sitting in the middle of the table - visible, and fixable by
 * whoever is looking at it. Refusing to save is how somebody loses the other
 * five edits in the panel because the sixth got ahead of itself.
 */
export function craftProblems(craft: CraftSpec): string[] {
  const problems: string[] = []

  if (craft.slots.length > MAX_SLOTS) {
    problems.push(`a thing has at most ${MAX_SLOTS} places to put something`)
  }
  if (craft.recipes.length > MAX_RECIPES) {
    problems.push(`a thing knows at most ${MAX_RECIPES} recipes`)
  }

  const sockets = new Set<string>()
  for (const slot of craft.slots) {
    const socket = slot.socket.trim()
    if (socket === '') {
      problems.push('a place to put something sits on a named socket')
      continue
    }
    if (sockets.has(socket)) {
      // Two slots on one socket is two items in one place, which is a coin toss
      // inside a lookup nobody can see - the same argument two sockets may not
      // share a name.
      problems.push(`two places sit on ${socket}`)
    }
    sockets.add(socket)

    for (const item of [...slot.takes, ...(slot.gives === undefined ? [] : [slot.gives])]) {
      if (!item.trim() || item.length > MAX_ITEM_NAME) {
        problems.push(`an item's name is 1-${MAX_ITEM_NAME} characters`)
      }
    }

    if (slot.price !== undefined) {
      if (!Number.isInteger(slot.price) || slot.price < 0 || slot.price > MAX_PRICE) {
        // Whole coins. There is no half a coin anywhere in the homestead, and a
        // price of 0.5 would be a purse that drifts off the integers the
        // aggregate keeps it on.
        problems.push(`a price is 0-${MAX_PRICE} whole coins`)
      }
    }
  }

  for (const recipe of craft.recipes) {
    if (recipe.needs.length === 0) {
      problems.push('a recipe needs at least one thing put into it')
    }
    if (recipe.needs.length > MAX_RECIPE_ITEMS) {
      problems.push(`a recipe uses at most ${MAX_RECIPE_ITEMS} things`)
    }
    for (const item of [...recipe.needs, recipe.makes]) {
      if (!item.trim() || item.length > MAX_ITEM_NAME) {
        problems.push(`an item's name is 1-${MAX_ITEM_NAME} characters`)
      }
    }
    if (recipe.seconds !== undefined) {
      if (
        !Number.isFinite(recipe.seconds) ||
        recipe.seconds < 0 ||
        recipe.seconds > MAX_RECIPE_SECONDS
      ) {
        problems.push(`a recipe takes 0-${MAX_RECIPE_SECONDS} seconds`)
      }
    }
    // A recipe that makes one of its own ingredients is a table that fills
    // itself forever: the burger lands, the burger satisfies the recipe, and the
    // room has a machine in it. Caught here because it is not visible in play -
    // what it looks like is a room that has quietly stopped responding.
    if (recipe.needs.some((need) => sameItem(need, recipe.makes))) {
      problems.push(`${recipe.makes} cannot be made out of itself`)
    }
  }

  return problems
}

/**
 * What one press of G at a table does.
 *
 * ---------------------------------------------------------------------------
 * One key, because there is only one thing you could mean
 * ---------------------------------------------------------------------------
 * Put and take look like two verbs and are not, because the state of the table
 * and the state of your hand decide between them with nothing left over: if you
 * are holding a patty and the pan has room for one, you are putting it down. If
 * your hands are empty and there is a pan on the rack, you are taking it. Two
 * keys would make somebody learn which is which in order to do the only thing
 * that made sense.
 *
 * Putting wins over taking when both are possible, and that is the one place a
 * rule had to be picked. It is the right way round: you walked here holding
 * something, which is a sentence about what you came to do - whereas everything
 * on the table was already there.
 *
 * A table with nothing to give and nothing it will take answers nothing, and
 * the caller leaves G alone so the prompt over the thing stays honest.
 */
export type Reach =
  | { do: 'put'; socket: string; item: string }
  | { do: 'take'; socket: string; item: string }
  | { do: 'nothing' }

export function reachFor(
  craft: CraftSpec,
  /** What is on it now: socket name, then the item's word. */
  filled: ReadonlyMap<string, string>,
  /** What you are holding, or nothing. See `./pocket`. */
  hand: string | undefined,
): Reach {
  if (hand !== undefined) {
    for (const slot of craft.slots) {
      if (filled.has(slot.socket)) continue
      if (!accepts(slot, hand)) continue
      return { do: 'put', socket: slot.socket, item: hand }
    }
  }

  // In the thing's own order rather than nearest-first, because "nearest" is a
  // fact about where you are standing and would make the same press at the same
  // table do different things depending on which side you walked up to.
  for (const slot of craft.slots) {
    const item = filled.get(slot.socket)
    if (item !== undefined) return { do: 'take', socket: slot.socket, item }
  }

  return { do: 'nothing' }
}
