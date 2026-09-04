import { describe, expect, test } from 'bun:test'

import {
  accepts,
  reachFor,
  consumes,
  craftProblems,
  freshBurger,
  freshCraft,
  itemLook,
  itemLooks,
  landsAt,
  matchRecipe,
  MAX_RECIPE_ITEMS,
  sameItem,
  type CraftSpec,
} from '@/domain/thingiverse/craft'

/** A cutting board that knows a burger and the plain thing under it. */
function board(): CraftSpec {
  return {
    slots: [
      { socket: 'board', takes: [] },
      { socket: 'left', takes: [] },
      { socket: 'right', takes: ['salad'] },
    ],
    recipes: [
      { needs: ['bun', 'patty'], makes: 'plain burger' },
      { needs: ['bun', 'patty', 'salad'], makes: 'burger', emit: 'made', seconds: 2 },
    ],
  }
}

describe('naming an item', () => {
  test('spaces and underscores are the same character', () => {
    expect(sameItem('Beef Patty', 'beef_patty')).toBe(true)
    expect(sameItem('  bun ', 'BUN')).toBe(true)
  })

  test('but it is an equality and not a search', () => {
    // A recipe that fired because "bun" loosely matched "bunting" would be a
    // recipe nobody could debug.
    expect(sameItem('bun', 'bunting')).toBe(false)
  })
})

describe('what a place will take', () => {
  test('a slot with no opinion takes anything', () => {
    expect(accepts({ socket: 'board', takes: [] }, 'anvil')).toBe(true)
  })

  test('and a picky one takes only what it named', () => {
    const slot = { socket: 'right', takes: ['salad', 'sauce'] }
    expect(accepts(slot, 'Salad')).toBe(true)
    expect(accepts(slot, 'patty')).toBe(false)
  })
})

describe('putting things together', () => {
  test('the recipe fires when everything it needs is there', () => {
    expect(matchRecipe(board(), ['bun', 'patty'])?.makes).toBe('plain burger')
  })

  test('and the biggest satisfied recipe wins', () => {
    // Both are satisfied. Falling back to authoring order would mean a salad
    // that silently does nothing.
    expect(matchRecipe(board(), ['bun', 'patty', 'salad'])?.makes).toBe('burger')
  })

  test('a stray coffee cup does not break the kitchen', () => {
    expect(matchRecipe(board(), ['bun', 'coffee', 'patty'])?.makes).toBe('plain burger')
  })

  test('and half a burger makes nothing', () => {
    expect(matchRecipe(board(), ['bun'])).toBeUndefined()
    expect(matchRecipe(board(), [])).toBeUndefined()
  })

  test('a recipe wanting two of something needs two of them', () => {
    const twin: CraftSpec = {
      slots: [],
      recipes: [{ needs: ['patty', 'patty'], makes: 'double' }],
    }
    expect(matchRecipe(twin, ['patty'])).toBeUndefined()
    expect(matchRecipe(twin, ['patty', 'patty'])?.makes).toBe('double')
  })
})

describe('what it eats and where the result lands', () => {
  test('it consumes exactly what the recipe counted', () => {
    const recipe = { needs: ['patty'], makes: 'burger' }
    const used = consumes(recipe, [
      { socket: 'left', item: 'patty' },
      { socket: 'right', item: 'patty' },
    ])
    // One patty, not both.
    expect(used).toEqual(['left'])
  })

  test('and the burger lands where the burger was being made', () => {
    const recipe = { needs: ['bun', 'patty'], makes: 'burger' }
    expect(landsAt(recipe, ['board', 'left'])).toBe('board')
    expect(landsAt({ ...recipe, into: 'plate' }, ['board'])).toBe('plate')
  })
})

describe('a thing that already holds something', () => {
  test('a rack says what you take off it', () => {
    const rack: CraftSpec = { slots: [{ socket: 'hook', takes: [], gives: 'pan' }], recipes: [] }
    expect(craftProblems(rack)).toEqual([])
    expect(rack.slots[0].gives).toBe('pan')
  })
})

describe('the ways a table can be wrong', () => {
  test('two places on one socket are two items in one place', () => {
    const problems = craftProblems({
      slots: [
        { socket: 'board', takes: [] },
        { socket: 'board', takes: [] },
      ],
      recipes: [],
    })
    expect(problems).toContain('two places sit on board')
  })

  test('a thing made out of itself is a machine that never stops', () => {
    const problems = craftProblems({
      slots: [],
      recipes: [{ needs: ['burger', 'bun'], makes: 'burger' }],
    })
    expect(problems).toContain('burger cannot be made out of itself')
  })

  test('a recipe that needs nothing would fire forever', () => {
    expect(craftProblems({ slots: [], recipes: [{ needs: [], makes: 'burger' }] })).toContain(
      'a recipe needs at least one thing put into it',
    )
  })

  test('and a recipe is not a crafting system', () => {
    const problems = craftProblems({
      slots: [],
      recipes: [
        {
          needs: Array.from({ length: MAX_RECIPE_ITEMS + 1 }, (_, i) => `item${i}`),
          makes: 'thing',
        },
      ],
    })
    expect(problems).toContain(`a recipe uses at most ${MAX_RECIPE_ITEMS} things`)
  })

  test('the two starters are both sound', () => {
    expect(craftProblems(freshCraft('top'))).toEqual([])
    expect(craftProblems(freshBurger('board'))).toEqual([])
    expect(matchRecipe(freshBurger('board'), ['bun', 'patty', 'salad'])?.makes).toBe('burger')
  })
})

describe('what one press of G does', () => {
  const pan: CraftSpec = {
    slots: [{ socket: 'hob', takes: ['patty'] }],
    recipes: [],
  }

  test('holding what it wants, you put it down', () => {
    expect(reachFor(pan, new Map(), 'patty')).toEqual({
      do: 'put',
      socket: 'hob',
      item: 'patty',
    })
  })

  test('empty-handed at a full pan, you take it', () => {
    expect(reachFor(pan, new Map([['hob', 'patty']]), undefined)).toEqual({
      do: 'take',
      socket: 'hob',
      item: 'patty',
    })
  })

  test('putting wins over taking, because that is what you walked here to do', () => {
    const board: CraftSpec = {
      slots: [
        { socket: 'a', takes: [] },
        { socket: 'b', takes: [] },
      ],
      recipes: [],
    }
    expect(reachFor(board, new Map([['a', 'bun']]), 'patty')).toEqual({
      do: 'put',
      socket: 'b',
      item: 'patty',
    })
  })

  test('holding something it will not take, you take instead', () => {
    expect(reachFor(pan, new Map([['hob', 'patty']]), 'anvil')).toEqual({
      do: 'take',
      socket: 'hob',
      item: 'patty',
    })
  })

  test('and an empty table with empty hands answers nothing', () => {
    expect(reachFor(pan, new Map(), undefined)).toEqual({ do: 'nothing' })
    // A full pan you are holding a second patty for, too: nowhere to put it,
    // but there is something to take.
    expect(reachFor(pan, new Map([['hob', 'patty']]), 'patty').do).toBe('take')
  })
})

describe('what a word looks like', () => {
  const shelf = [
    { name: 'Bun', model: 'restaurant/food_ingredient_bun', scale: 1 },
    { name: 'Grilled patty', model: 'restaurant/food_ingredient_burger_cooked', scale: 1 },
    { name: 'bun', model: 'somebody/else', scale: 3 },
  ]

  test('a word finds the blueprint the space called that', () => {
    const looks = itemLooks(shelf)
    expect(itemLook(looks, 'bun')?.model).toBe('restaurant/food_ingredient_bun')
  })

  test('spelled the way a recipe would spell it', () => {
    const looks = itemLooks(shelf)
    // The shelf's own rule: lowercase, and spaces and underscores are the same
    // character. A recipe saying `grilled_patty` and a blueprint called
    // "Grilled patty" are one item.
    expect(itemLook(looks, 'grilled_patty')?.model).toBe(
      'restaurant/food_ingredient_burger_cooked',
    )
    expect(itemLook(looks, '  GRILLED PATTY ')?.model).toBe(
      'restaurant/food_ingredient_burger_cooked',
    )
  })

  test('two of the same name: the older one wins, every time', () => {
    // The shelf arrives oldest first, so a duplicate drawn later is invisible
    // rather than intermittently visible - which is the failure somebody can
    // actually diagnose. See `itemLooks`.
    const looks = itemLooks(shelf)
    expect(itemLook(looks, 'Bun')?.scale).toBe(1)
  })

  test('and a word nothing is called finds nothing', () => {
    expect(itemLook(itemLooks(shelf), 'pickle')).toBeUndefined()
  })
})
