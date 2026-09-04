import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { coinsOf, type NextPrice } from '@/domain/bank/next'

/**
 * The rule this file exists for: **one answer to "what does the next one cost".**
 *
 * A price is drawn on a control and taken out of a purse, in two different
 * files, on two different machines. The failure that matters is not either of
 * them being wrong - it is the two of them disagreeing, which is invisible in
 * review, silent in production, and lands as somebody being charged sixty coins
 * by a button that said nothing.
 *
 * So the assertions below are mostly *wiring*: does the create path ask
 * `nextPrice`, does the surface print from the same helper, and is there
 * anywhere that has started pricing things for itself. `nextPrice` itself takes
 * a database client and is tested by the paths that use it; what it cannot do
 * is notice a second implementation appearing next door.
 */

const ACTIONS = readFileSync('src/domain/thingiverse/actions.ts', 'utf8')

/**
 * One function's body, so a claim can be made about *it* and not the file.
 *
 * Ends at the next top-level `function` or `export`, which is what a file
 * written one declaration to a block gives you. Exact enough for the claims
 * below, all of which are about a call being present or absent.
 */
function bodyOf(source: string, name: string): string {
  const start = source.search(new RegExp(`^(export )?(async )?function ${name}\\(`, 'm'))
  expect(start).toBeGreaterThan(-1)
  const rest = source.slice(start + 1)
  const next = rest.search(/^(export |async function |function |const |interface )/m)
  return next === -1 ? rest : rest.slice(0, next)
}

describe('coinsOf', () => {
  test('a price is the price', () => {
    expect(coinsOf({ kind: 'costs', coins: 60 })).toBe(60)
  })

  test('included is nothing to draw', () => {
    expect(coinsOf({ kind: 'included' })).toBe(0)
  })

  test('so is refused - a tile that cannot be pressed is a sentence, not a price', () => {
    // Zero looks lossy here and is the right answer for the only caller: the
    // control prints nothing, presses through, and gets the refusal's own
    // words. A number on it would be a price nobody can pay.
    const refused: NextPrice = { kind: 'refused', limit: 3 }
    expect(coinsOf(refused)).toBe(0)
  })
})

describe('the create paths ask before they charge', () => {
  for (const name of ['drawBlueprint', 'saveClip'] as const) {
    const body = bodyOf(ACTIONS, name)

    test(`${name} pays through the one helper rather than charging itself`, () => {
      expect(body).toContain('payFor(')
      expect(body).not.toContain('buyExtra(')
    })

    test(`${name} checks the platform ceiling before the plan's allowance`, () => {
      // Two limits, and the order is the point: the ceiling is a real limit on
      // a real box that no amount of coins moves, so being over it must refuse
      // rather than sell somebody a slot they cannot use.
      const ceiling = body.indexOf('_PER_TENANT')
      const plan = body.search(/payFor\(|priceLine\(|nextPrice\(/)
      expect(ceiling).toBeGreaterThan(-1)
      expect(ceiling).toBeLessThan(plan)
    })
  }

  test('a blueprint asks which line it is on, because it might be a vehicle', () => {
    expect(bodyOf(ACTIONS, 'drawBlueprint')).toContain('priceLine(')
  })

  test("a clip is only ever a clip, so it names its line and asks directly", () => {
    const body = bodyOf(ACTIONS, 'saveClip')
    expect(body).toContain('nextPrice(')
    expect(body).toContain("'clips'")
  })

  test('payFor is the only thing that buys, and it refuses out loud', () => {
    // Both halves in one place so the two create paths cannot drift into
    // refusing differently or charging differently. buyExtra rather than
    // charge: a charge without space_extra_add is coins taken for a cap that
    // did not move, so the very next press charges again.
    const body = bodyOf(ACTIONS, 'payFor')
    expect(body).toContain('buyExtra(')
    expect(body).toContain("kind === 'refused'")
  })
})

describe('a vehicle is its own line, not an expensive blueprint', () => {
  const body = bodyOf(ACTIONS, 'priceLine')

  test('the spec decides which allowance is charged', () => {
    // 30 to 60 coins against 10,000 to 50,000. Charging one as the other is
    // the most expensive mistake available in this file.
    expect(body).toContain("'vehicles'")
    expect(body).toContain("'blueprints'")
  })

  test('and the vehicles are taken out of the blueprint count', () => {
    // countBlueprints counts rows, vehicles included, because that is what the
    // platform ceiling wants. The plan wants the two apart.
    expect(body).toContain('countVehicles(')
    expect(body).toContain('counts.blueprints - vehicles')
  })

  test('reshapeBlueprint charges on the transition, not on the state', () => {
    // The bench's checkbox is the other door to the same 10,000 coins, and it
    // is a *save* rather than a create - so the test is "this spec has a
    // vehicle and the stored one does not". Charging on "the spec has one"
    // would charge again on every subsequent save of the same car.
    const body = bodyOf(ACTIONS, 'reshapeBlueprint')
    expect(body).toContain('hasVehicle(parsed.data.spec)')
    expect(body).toContain('!hasVehicle(before.spec)')
    expect(body).toContain('payFor(')
  })

  test('and taking the block away costs nothing and refunds nothing', () => {
    // A slot belongs to the space (economy.md §8.8), so unticking and ticking
    // again is free. The absence of any refund path is the assertion.
    // A call, not the word: the function's own comment explains at length why
    // there is no refund, and a substring test fails on the explanation for
    // the behaviour it is testing. The same trap `oasis-pdf`'s test names.
    expect(bodyOf(ACTIONS, 'reshapeBlueprint')).not.toMatch(/\b(credit|refund)\s*\(/)
  })

  test('drawBlueprint chooses the line from the spec it was handed', () => {
    // Not from which button was pressed: the workbench's New vehicle arrives
    // here with exampleCar already in the spec, and the bench's checkbox
    // arrives at reshapeBlueprint. One test, both doors.
    expect(bodyOf(ACTIONS, 'drawBlueprint')).toContain('hasVehicle(')
  })
})

describe('a set is refused rather than charged ten times', () => {
  const body = bodyOf(ACTIONS, 'drawStarterSet')

  test('it asks the same question', () => {
    expect(body).toContain('nextPrice(')
  })

  test('and never buys', () => {
    // One press, up to ten blueprints. `drawBlueprint` may charge on the press
    // because the price is drawn on the control that makes one thing; ten
    // silent charges behind one button is a different act.
    expect(body).not.toContain('buyExtra(')
  })
})

describe('nothing prices itself', () => {
  // The one invariant that keeps a button and a purse in step. `EXTRA_PRICES`
  // is the table; a *control* reading it works out what somebody will be
  // charged without asking whether they are past their allowance at all, which
  // is how a "60" appears on a button that is about to charge nothing - or
  // worse, the other way round.
  const SURFACES = [
    'src/app/world/lounge/_hud/thingiverse-view.tsx',
    'src/app/world/lounge/lounge-scene.tsx',
    'src/app/t/[slug]/thingiverse/hub.tsx',
    'src/app/t/[slug]/thingiverse/clips/clip-studio.tsx',
    'src/app/ovaloffice/animator/animator.tsx',
    'src/app/t/[slug]/thingiverse/blueprint/[id]/composer.tsx',
  ]

  for (const path of SURFACES) {
    test(`${path} takes its number from a prop, not from the price table`, () => {
      const source = readFileSync(path, 'utf8')
      expect(source).not.toMatch(/import .*(extraPrice|EXTRA_PRICES).*from/)
    })
  }

  test('the pages that feed them all read it through coinsOf', () => {
    // The other half: a page computing `extraPrice` itself would be the same
    // bug one file further out.
    for (const path of [
      'src/app/t/[slug]/lounge/page.tsx',
      'src/app/t/[slug]/rooms/[roomSlug]/page.tsx',
      'src/app/t/[slug]/browse/page.tsx',
      'src/app/t/[slug]/thingiverse/clips/page.tsx',
      'src/app/t/[slug]/thingiverse/blueprint/[id]/page.tsx',
    ]) {
      const source = readFileSync(path, 'utf8')
      expect(source).toContain("from '@/domain/bank/next'")
      expect(source).toContain('coinsOf(')
    }
  })
})

describe('the economy flag still decides whether anything is metered', () => {
  test('nextPrice answers "included" before it asks about a quota at all', () => {
    // The departure from economy.md §2 that the file documents at length. A
    // space that has never heard of coins must not discover a blueprint cap
    // because a deploy went out, and the order of these two lines is the whole
    // of that guarantee.
    const source = readFileSync('src/domain/bank/next.ts', 'utf8')
    const off = source.indexOf('economyOn(')
    const quota = source.indexOf('hasRoomFor(')
    expect(off).toBeGreaterThan(-1)
    expect(off).toBeLessThan(quota)
  })
})
