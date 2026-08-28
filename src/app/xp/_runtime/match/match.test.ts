import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describeEnding, isMatch, kickoff, stepMatch, type Match } from '@/app/xp/_runtime/match/match'
import { finishMarks, NO_RUN, stepRun, formatRunTime } from '@/app/xp/_runtime/match/race'
import { parseXp, rulesOf, type XpRules } from '@kxb/xp'
import { fire, spawnEntities, type EntityWorld } from '@kxb/xp/engine'
import { TRIGGER_EVENTS } from '@kxb/xp'

/**
 * The whistle, checked without playing a match.
 *
 * The runtime cannot be watched - the Browser pane is always `document.hidden`,
 * so `requestAnimationFrame` never fires and the canvas stays black. Every
 * argument below is one that would otherwise be had after a match, between two
 * people who saw different things.
 */

/** A frame at 60fps, and the longest one the simulation will admit to. */
const FRAME = 1 / 60

/** Play `seconds` of nothing happening. */
function idle(match: Match, rules: XpRules, seconds: number): Match {
  let current = match
  for (let i = 0; i < Math.round(seconds / FRAME); i++) {
    current = stepMatch(current, rules, { delta: FRAME, scored: 0 })
  }
  return current
}

describe('what counts as a match', () => {
  test('freestyle is a world to be in, not a match with the scoring turned down', () => {
    expect(isMatch({ preset: 'freestyle' })).toBe(false)
    /**
     * Unless somebody set one, which the battle wizard's Clock field does.
     *
     * A preset and a limit are different statements: `freestyle` says the
     * document describes no mode of its own - true of a level that decides its
     * own ending in a `flow` - and it never meant "refuse a clock somebody
     * asked for". This was reported as the timer not starting, and the wizard
     * was innocent: it wrote the field and this threw it away.
     */
    expect(isMatch({ preset: 'freestyle', timeLimit: 300 })).toBe(true)
    expect(isMatch({ preset: 'freestyle', scoreLimit: 3 })).toBe(true)
    expect(isMatch({ preset: 'deathmatch' })).toBe(true)
    expect(isMatch({ preset: 'parkour' })).toBe(true)
  })

  test('every ending has words for it', () => {
    expect(describeEnding('time')).toBe('full time')
    expect(describeEnding('score')).toBe('score limit')
    expect(describeEnding('finish')).toBe('finished')
  })
})

describe('kickoff', () => {
  test('the clock reads its limit before the first frame, not a dash', () => {
    // A HUD that showed `—` for a beat and then `5:00` would be reporting the
    // load rather than the match.
    expect(kickoff({ preset: 'deathmatch', timeLimit: 300 }).remaining).toBe(300)
  })

  test('and reads nothing at all when the mode has no clock', () => {
    expect(kickoff({ preset: 'parkour' }).remaining).toBeNull()
  })
})

describe('ending on the clock', () => {
  const rules: XpRules = { preset: 'deathmatch', timeLimit: 10 }

  test('a match with time left is still being played', () => {
    const match = idle(kickoff(rules), rules, 5)
    expect(match.phase).toBe('playing')
    expect(match.ending).toBeNull()
    expect(match.remaining).toBeCloseTo(5, 6)
  })

  test('and stops when the clock does', () => {
    const match = idle(kickoff(rules), rules, 11)
    expect(match.phase).toBe('over')
    expect(match.ending).toBe('time')
    expect(match.ends).toBe(1)
  })

  test('the final time is the limit, not the limit plus a frame', () => {
    /**
     * The frame that crosses the limit is still a whole frame long, so without a
     * clamp a five-minute match reports 300.03 - three hundredths of nonsense in
     * a result somebody is going to ask about.
     */
    const match = idle(kickoff(rules), rules, 11)
    expect(match.elapsed).toBe(10)
    expect(match.remaining).toBe(0)
  })

  test('nothing accrues after full time', () => {
    /**
     * A target shot after the whistle does not count. This is the whole value of
     * having a phase: a result somebody is looking at must not change under them.
     */
    const over = idle(kickoff(rules), rules, 11)
    const after = stepMatch(over, rules, { delta: FRAME, scored: 50 })

    expect(after.score).toBe(0)
    expect(after.elapsed).toBe(10)
    expect(after.ends).toBe(1)
    // Same object, so the component above can compare by identity and stay quiet
    // rather than re-rendering a finished match sixty times a second.
    expect(after).toBe(over)
  })
})

describe('ending on points', () => {
  const rules: XpRules = { preset: 'deathmatch', scoreLimit: 20 }

  test('points add up across frames', () => {
    let match = stepMatch(kickoff(rules), rules, { delta: FRAME, scored: 5 })
    match = stepMatch(match, rules, { delta: FRAME, scored: 0 })
    match = stepMatch(match, rules, { delta: FRAME, scored: 7 })
    expect(match.score).toBe(12)
    expect(match.phase).toBe('playing')
  })

  test('reaching the limit ends it, and overshooting it still ends it', () => {
    // A verb that scores five when you were on eighteen takes you to
    // twenty-three, and "first to twenty" has to mean at-least rather than
    // exactly or that match never ends.
    let match = stepMatch(kickoff(rules), rules, { delta: FRAME, scored: 18 })
    match = stepMatch(match, rules, { delta: FRAME, scored: 5 })
    expect(match.phase).toBe('over')
    expect(match.ending).toBe('score')
    expect(match.score).toBe(23)
  })

  test('a mode with no limit tallies forever', () => {
    const open: XpRules = { preset: 'deathmatch' }
    let match = kickoff(open)
    for (let i = 0; i < 100; i++) match = stepMatch(match, open, { delta: FRAME, scored: 10 })
    expect(match.score).toBe(1000)
    expect(match.phase).toBe('playing')
  })
})

describe('two endings in one frame', () => {
  test('a point on the whistle is a point', () => {
    /**
     * The frame that crosses the time limit is also the frame the winning point
     * landed in. Ending on `time` would tell somebody the clock beat them by a
     * frame they cannot see, which is the wrong error to make - the other
     * direction merely gives them a goal they scored.
     */
    const rules: XpRules = { preset: 'deathmatch', scoreLimit: 20, timeLimit: 10 }
    const nearly = idle(kickoff(rules), rules, 9.99)
    expect(nearly.phase).toBe('playing')

    const last = stepMatch(nearly, rules, { delta: 0.05, scored: 20 })
    expect(last.phase).toBe('over')
    expect(last.ending).toBe('score')
  })

  test('and the clock still ends a frame nobody scored in', () => {
    // The other half of the pair: without it the test above passes for a system
    // that simply never ends on time.
    const rules: XpRules = { preset: 'deathmatch', scoreLimit: 20, timeLimit: 10 }
    const nearly = idle(kickoff(rules), rules, 9.99)
    const last = stepMatch(nearly, rules, { delta: 0.05, scored: 0 })
    expect(last.ending).toBe('time')
  })
})

describe('a course', () => {
  const rules: XpRules = { preset: 'parkour' }

  test('crossing the finish ends the match', () => {
    const match = stepMatch(kickoff(rules), rules, { delta: FRAME, scored: 0, finished: true })
    expect(match.phase).toBe('over')
    expect(match.ending).toBe('finish')
  })

  test('a finish line in a gunfight is scenery', () => {
    /**
     * A document can carry `competition` marks and play a different mode - the
     * race clock mounts on the marks, and the match ends on the *rules*. Without
     * this a deathmatch in a level with a gate in it ends the moment somebody
     * wanders through it.
     */
    const gunfight: XpRules = { preset: 'deathmatch', scoreLimit: 20 }
    const match = stepMatch(kickoff(gunfight), gunfight, {
      delta: FRAME,
      scored: 0,
      finished: true,
    })
    expect(match.phase).toBe('playing')
    expect(match.ending).toBeNull()
  })

  test('a finish beats the clock running out on the same frame', () => {
    // Arriving is not arguable: somebody is standing past the line.
    const timed: XpRules = { preset: 'parkour', timeLimit: 10 }
    const nearly = idle(kickoff(timed), timed, 9.99)
    const last = stepMatch(nearly, timed, { delta: 0.05, scored: 0, finished: true })
    expect(last.ending).toBe('finish')
  })
})

describe('the two systems, over the course we ship', () => {
  const raw = readFileSync(
    path.join(import.meta.dir, '..', '..', '..', '..', '..', 'public', 'xp', 'xps', 'ladder-run.xp.json'),
    'utf8',
  )
  const parsed = parseXp(JSON.parse(raw))
  if (!parsed.ok) throw new Error('ladder-run does not parse')
  const xp = parsed.document

  test('ladder-run declares the mode that reads its marks', () => {
    expect(rulesOf(xp).preset).toBe('parkour')
    expect(isMatch(rulesOf(xp))).toBe(true)
  })

  test('crossing the gate stops the clock and ends the match, with the run as the result', () => {
    /**
     * The acceptance test for both halves at once, and the reason it exists:
     * `./racing` and `./matching` are separate components and the join between
     * them - a finished run ending a parkour match - lives in a ref and a
     * callback that no test can reach. This checks the part that could actually
     * be *wrong*: that a run finishing is a match ending, and that the number on
     * the banner is the run's time rather than the match's elapsed.
     */
    let run = NO_RUN
    const rules = rulesOf(xp)
    let match = kickoff(rules)

    const step = (from: typeof xp.spawn, to: typeof xp.spawn, delta: number) => {
      const before = run
      run = stepRun(run, xp.world.marks, { from, to, delta })
      match = stepMatch(match, rules, {
        delta,
        scored: 0,
        finished: run.finishes !== before.finishes,
      })
    }

    const spawn = { x: xp.spawn.x, y: xp.spawn.y, z: xp.spawn.z, facing: 0 }

    /**
     * Two seconds of standing on the spawn before setting off.
     *
     * Which is what everybody does - the level loads, you click to take the
     * pointer, you look around. The match has been running for all of it and the
     * run has not started, and that gap is the thing this test is about.
     */
    for (let i = 0; i < 120; i++) step(spawn, spawn, FRAME)
    expect(run.phase).toBe('waiting')
    expect(match.elapsed).toBeCloseTo(2, 6)

    // Off the start line, which is where `ladder-run` puts you.
    step(spawn, { ...spawn, x: spawn.x + 1 }, FRAME)
    expect(run.phase).toBe('running')
    expect(match.phase).toBe('playing')

    // Then the course, abbreviated: the geometry is `xps.test.ts`'s business,
    // and what this is about is the clock.
    for (let i = 0; i < 600; i++) {
      step({ ...spawn, x: spawn.x + 1 }, { ...spawn, x: spawn.x + 1 }, FRAME)
    }
    expect(match.phase).toBe('playing')

    const [finish] = finishMarks(xp.world.marks)
    step(
      { x: finish.x, y: finish.y, z: finish.z + 1, facing: 0 },
      { x: finish.x, y: finish.y, z: finish.z - 1, facing: 0 },
      FRAME,
    )

    expect(run.phase).toBe('finished')
    expect(match.phase).toBe('over')
    expect(match.ending).toBe('finish')

    /**
     * And the result is the *run*, not the match.
     *
     * They are different numbers and the difference is the walk to the start
     * line: the match has been counting since the level loaded, and a course is
     * timed from the moment you crossed. Reporting `match.elapsed` on the banner
     * would give everybody a time a frame or two longer than the one their clock
     * had been showing all the way round.
     */
    expect(match.elapsed - run.time).toBeCloseTo(2, 1)
    expect(formatRunTime(run.time)).not.toBe(formatRunTime(match.elapsed))
  })

  test('the shooter is a match with both limits, and no course to finish', () => {
    const shooter = parseXp(
      JSON.parse(
        readFileSync(
          path.join(import.meta.dir, '..', '..', '..', '..', '..', 'public', 'xp', 'xps', 'shooter.xp.json'),
          'utf8',
        ),
      ),
    )
    expect(shooter.ok).toBe(true)
    if (!shooter.ok) return

    // §8.1 of the plan asked for "deathmatch rules, five minutes, first to
    // twenty", which is what the document carried until the range grew a second
    // floor and five kinds of thing to shoot. The numbers moved with it - there
    // is a great deal more to hit now, and a target that comes back up is
    // scoreable more than once - and what this pins is that both limits and a
    // respawn are still *there*, which is the claim the rest of the file makes.
    expect(rulesOf(shooter.document)).toEqual({
      preset: 'shooter',
      scoreLimit: 60,
      timeLimit: 420,
      respawn: 4,
      players: { min: 1, max: 8 },
    })

    // The limit ends it, and it is the score rather than the clock that did.
    const rules = rulesOf(shooter.document)
    let match = kickoff(rules)
    for (let i = 0; i < 12; i++) {
      match = stepMatch(match, rules, { delta: FRAME, scored: 5 })
    }
    expect(match.phase).toBe('over')
    expect(match.ending).toBe('score')
  })
})

describe('a rematch', () => {
  const shooter = parseXp(
    JSON.parse(
      readFileSync(
        path.join(import.meta.dir, '..', '..', '..', '..', '..', 'public', 'xp', 'xps', 'shooter.xp.json'),
        'utf8',
      ),
    ),
  )
  if (!shooter.ok) throw new Error('shooter does not parse')
  const xp = shooter.document

  /** Everything a round can have changed, as one comparable value. */
  const snapshot = (world: EntityWorld) =>
    JSON.stringify({
      alive: [...world.alive].sort((a, b) => a - b),
      props: [...world.props.entries()].sort((a, b) => a[0] - b[0]),
      position: [...world.position.entries()].sort((a, b) => a[0] - b[0]),
    })

  test('asking the document again restores everything a round changed', () => {
    /**
     * The claim the rematch rests on, and the reason it is four lines rather
     * than a feature: everything a match writes - a crate broken, a target shot,
     * a pickup taken, a platform moved - lives in the entity maps, so throwing
     * them away and rebuilding from the document *is* the reset. There is no
     * list of things to undo and therefore no way for one to be missed.
     *
     * If this ever fails it means some part of a round's state has moved
     * somewhere the rebuild does not reach, and the rematch will have started
     * leaving a trace of the last one behind.
     */
    const first = spawnEntities(xp)
    const clean = snapshot(first)

    // Play a round, roughly: kill some things, hurt others, shove one about.
    let touched = 0
    for (const id of [...first.alive]) {
      touched += 1
      if (touched % 3 === 0) first.alive.delete(id)
      else if (touched % 3 === 1) {
        const props = first.props.get(id)
        if (props) props.hp = -5
      } else {
        const at = first.position.get(id)
        if (at) first.position.set(id, { x: at.x + 12, y: at.y + 3, z: at.z - 7 })
      }
    }
    expect(touched).toBeGreaterThan(3)
    expect(snapshot(first)).not.toBe(clean)

    expect(snapshot(spawnEntities(xp))).toBe(clean)
  })

  test('and the world it rebuilds is not the one it threw away', () => {
    // Not pedantry: a rebuild that handed back the same maps would look like it
    // worked - every assertion above would pass - and the next round would be
    // played on the previous one's state.
    const first = spawnEntities(xp)
    const second = spawnEntities(xp)

    second.alive.clear()
    expect(first.alive.size).toBeGreaterThan(0)
  })
})

describe('the whistle reaches the level, not just the HUD', () => {
  test('`finished` is a trigger a document can declare', () => {
    /**
     * The gap this closes: `stepMatch` decided a match was over, the scoreboard
     * drew it, and the *document* never heard. So a level could not open a gate
     * when the race ended, drop the walls of an arena, or spawn anything to
     * celebrate with - every one of which an author would reasonably expect the
     * moment they set a score limit.
     */
    expect([...TRIGGER_EVENTS]).toContain('finished')
  })

  test('a thing that asks to hear about it, does', () => {
    /**
     * Driven through `fire`, which is the same door `spawned` comes through -
     * so a gate that opens at full time is `on: 'finished'` plus a `deactivate`,
     * and nothing anywhere knows what a gate is.
     */
    const xp = parseXp({
      format: 'xp/1',
      id: 'gate',
      name: 'Gate',
      packs: [{ id: 'dummy' }],
      blueprints: {
        wall: {
          model: 'dummy/Dummy',
          collider: 'auto',
          triggers: [{ on: 'finished', do: [{ op: 'despawn' }] }],
        },
      },
      entities: [{ blueprint: 'wall', name: 'gate', x: 0, y: 0, z: 0 }],
      world: { floorY: 0, placements: [], marks: [] },
    })
    expect(xp.ok).toBe(true)
    if (!xp.ok) return

    const world = spawnEntities(xp.document)
    const gate = [...world.alive][0]
    expect(gate).toBeDefined()

    fire(world, xp.document.blueprints, gate, 'finished')
    // The gate is gone: the level reacted to a fact about the match without a
    // single line of code knowing what a match is.
    expect(world.alive.has(gate)).toBe(false)
  })

  test('and a document that does not ask is untouched by it', () => {
    // Most documents. `finished` is a thing you opt into, like every other
    // trigger - firing it at everything and hoping is how a level acquires
    // behaviour nobody wrote.
    const xp = parseXp({
      format: 'xp/1',
      id: 'quiet',
      name: 'Quiet',
      packs: [{ id: 'dummy' }],
      blueprints: { wall: { model: 'dummy/Dummy', collider: 'auto' } },
      entities: [{ blueprint: 'wall', x: 0, y: 0, z: 0 }],
      world: { floorY: 0, placements: [], marks: [] },
    })
    if (!xp.ok) return

    const world = spawnEntities(xp.document)
    const wall = [...world.alive][0]
    fire(world, xp.document.blueprints, wall, 'finished')
    expect(world.alive.has(wall)).toBe(true)
  })
})

/**
 * Who won, which this module refused to answer until there was a second score
 * to compare against.
 *
 * The refusal named its own condition — nothing put another player's score on
 * the wire — and the arbiter is what made it false. These are the tests that
 * hold the new rule to the same standard: the limit belongs to the *side*.
 */
describe('a match with sides in it', () => {
  const teamRules: XpRules = { preset: 'deathmatch', scoreLimit: 10 }

  test('the limit is the side s, not the player s', () => {
    // Nine-one, and this client personally has ten. Ending here would stop a
    // match that is 9-1 because one player reached the number alone.
    const after = stepMatch(kickoff(teamRules), teamRules, {
      delta: 1,
      scored: 10,
      sides: [
        { side: 'red', kills: 9 },
        { side: 'blue', kills: 1 },
      ],
    })
    expect(after.ending).toBeNull()
    expect(after.phase).toBe('playing')
  })

  test('a side reaching it ends the match and is named', () => {
    const after = stepMatch(kickoff(teamRules), teamRules, {
      delta: 1,
      scored: 0,
      sides: [
        { side: 'red', kills: 10 },
        { side: 'blue', kills: 4 },
      ],
    })
    expect(after.ending).toBe('score')
    expect(after.winner).toBe('red')
  })

  test('with no sides it is still the player s own score', () => {
    const after = stepMatch(kickoff(teamRules), teamRules, { delta: 1, scored: 10 })
    expect(after.ending).toBe('score')
    // Nobody won, because there was nobody to win against.
    expect(after.winner).toBeUndefined()
  })

  /**
   * A draw is a result, and the wrong thing to do with one is to pick the first
   * of the tied sides — that is inventing a winner, and full time in a 2-2 is a
   * fact worth being able to say.
   */
  test('level at full time is nobody s win', () => {
    const timed: XpRules = { preset: 'deathmatch', timeLimit: 60 }
    const after = stepMatch(kickoff(timed), timed, {
      delta: 60,
      scored: 0,
      sides: [
        { side: 'red', kills: 2 },
        { side: 'blue', kills: 2 },
      ],
    })
    expect(after.ending).toBe('time')
    expect(after.winner).toBeUndefined()
  })

  test('a side ahead when the clock stops wins on the clock', () => {
    const timed: XpRules = { preset: 'deathmatch', timeLimit: 60 }
    const after = stepMatch(kickoff(timed), timed, {
      delta: 60,
      scored: 0,
      sides: [
        { side: 'red', kills: 3 },
        { side: 'blue', kills: 2 },
      ],
    })
    expect(after.ending).toBe('time')
    expect(after.winner).toBe('red')
  })

  test('nil-nil at full time has no winner rather than two', () => {
    const timed: XpRules = { preset: 'deathmatch', timeLimit: 60 }
    const after = stepMatch(kickoff(timed), timed, {
      delta: 60,
      scored: 0,
      sides: [
        { side: 'red', kills: 0 },
        { side: 'blue', kills: 0 },
      ],
    })
    expect(after.winner).toBeUndefined()
  })

  test('a leader while it is still being played is not a winner', () => {
    const after = stepMatch(kickoff(teamRules), teamRules, {
      delta: 1,
      scored: 0,
      sides: [
        { side: 'red', kills: 3 },
        { side: 'blue', kills: 1 },
      ],
    })
    expect(after.phase).toBe('playing')
    expect(after.winner).toBeUndefined()
  })
})
