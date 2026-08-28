import { describe, expect, test } from 'bun:test'
import { STARTERS } from '@/app/xp/_editor/panels/blueprints'
import { skeletonOf } from '@kxb/xp/packs'
import { findModel } from '@kxb/xp/catalogue'
import { BUILT_IN_BODY_SCALE } from '@kxb/xp/engine'
import { clipsFor } from '@/app/xp/_runtime/body/motion'
import {
  addBlueprint,
  addBody,
  addEntity,
  addScript,
  editing,
  setBlueprint,
  setBlueprintScript,
  undo,
} from '@kxb/xp/edit'
import { parseXp, templateById } from '@kxb/xp'
import { damage, entityByName, spawnEntities, spawnPlayer } from '@kxb/xp/engine'
import { fire } from '@kxb/xp/engine'

/**
 * A starter is a press that writes a rule, so the thing worth testing is not
 * that the press happens - it is that what it writes *works in play*.
 *
 * The failure this guards is the one the save point already had once: every
 * piece present, nothing joining them up, and the only way to find out being to
 * build a course and walk it. A starter that produced a flag which did nothing
 * would be worse than no button, because it looks like the feature.
 */
describe('the save point starter', () => {
  const starter = STARTERS.find((entry) => entry.id === 'checkpoint')!

  const level = () => {
    const start = editing(templateById('race')!.build('course', 'Course'))
    const withPad = addBlueprint(start, starter.name, starter.blueprint)!
    return addEntity(withPad, { blueprint: starter.name, name: 'pad', x: 0, y: 1, z: 0 })!
  }

  test('what it writes is a document that still parses', () => {
    const state = level()
    expect(parseXp(JSON.parse(JSON.stringify(state.document))).ok).toBe(true)
  })

  test('and the pad is numbered without anybody typing one', () => {
    // The other half of "arrives already counted": a first pad is 1, so the
    // engine's "strictly higher than nothing" rule can ever be met.
    expect(level().document.entities[0].props.order).toBe(1)
  })

  test('walking into it records the save point on the walker', () => {
    const document = level().document
    const world = spawnEntities(document)
    const runner = spawnPlayer(world, document, document.spawn)
    const pad = entityByName(world, 'pad')!

    fire(world, document.blueprints, pad, 'enter', runner)

    // On the runner, not on the pad. `checkpoint self` would be the pad
    // remembering itself, which is the mistake a pre-written rule exists to
    // prevent.
    expect(world.props.get(runner)?.checkpoint).toBe(1)
    expect(world.props.get(pad)?.checkpoint).toBeUndefined()
  })

  test('a second pad counts on from the first, and beats it', () => {
    const two = addEntity(level(), {
      blueprint: starter.name,
      name: 'pad-2',
      x: 4,
      y: 1,
      z: 0,
    })!
    const document = two.document
    expect(document.entities[1].props.order).toBe(2)

    const world = spawnEntities(document)
    const runner = spawnPlayer(world, document, document.spawn)
    fire(world, document.blueprints, entityByName(world, 'pad')!, 'enter', runner)
    fire(world, document.blueprints, entityByName(world, 'pad-2')!, 'enter', runner)
    expect(world.props.get(runner)?.checkpoint).toBe(2)

    // And crossing the first one again on a loop does not send you backwards,
    // which is the rule the numbering exists for.
    fire(world, document.blueprints, entityByName(world, 'pad')!, 'enter', runner)
    expect(world.props.get(runner)?.checkpoint).toBe(2)
  })
})

/**
 * The two bodies, and the thing that made them worth a button.
 *
 * Reported as not being able to put a script on the player or wire up the enemy,
 * and both halves of that were true for the same reason: a script goes on a
 * blueprint, and neither of those things *was* one. The player was a built-in
 * body no document owned, and an enemy was a model somebody had to know to give
 * health, a collider and a rule about running out of it.
 */
describe('the body starters', () => {
  const starterFor = (id: string) => STARTERS.find((entry) => entry.id === id)!

  test('the player starter makes a body the document actually arrives as', () => {
    /**
     * The half a plain `addBlueprint` cannot do. A blueprint called `player`
     * that `player.blueprint` does not name is not the player - it is an unused
     * kind of thing with a misleading name, and a script attached to it would
     * never run.
     */
    const starter = starterFor('player')
    const state = addBody(editing(templateById('room')!.build('level', 'Level')), starter.name, {
      ...starter.blueprint,
    })!

    expect(state.document.player.blueprint).toBe('player')
    expect(parseXp(JSON.parse(JSON.stringify(state.document))).ok).toBe(true)
  })

  test('and one press is one undo', () => {
    // Two writes under one commit. Somebody who pressed a button once presses
    // undo once, and lands back on a document with neither half of it.
    const start = editing(templateById('room')!.build('level', 'Level'))
    const starter = starterFor('player')
    const made = addBody(start, starter.name, { ...starter.blueprint })!

    const back = undo(made)!
    expect(back.document.player.blueprint).toBeUndefined()
    expect(back.document.blueprints.player).toBeUndefined()
  })

  test('the body a script can be put on is the body that spawns', () => {
    /**
     * The end-to-end version of the report. The point of making the player a
     * blueprint is that `setBlueprintScript` will take it - and that the entity
     * the runtime creates is the one running it.
     */
    const starter = starterFor('player')
    const made = addBody(editing(templateById('room')!.build('level', 'Level')), starter.name, {
      ...starter.blueprint,
    })!
    const scripted = setBlueprintScript(addScript(made, 'chase')!, 'player', 'chase')!

    const document = scripted.document
    expect(document.blueprints.player.script).toBe('chase')

    const world = spawnEntities(document)
    const body = spawnPlayer(world, document, document.spawn)
    expect(world.blueprint.get(body)).toBe('player')
    expect(world.props.get(body)?.hp).toBe(100)
  })

  test('an enemy that runs out of health scores, and then goes', () => {
    /**
     * The order inside `do` is the test. A despawn first would credit nobody,
     * because a despawned entity is not there to have been shot - which is the
     * kind of thing a pre-written rule exists to get right once.
     */
    const starter = starterFor('enemy')
    const built = addEntity(
      addBlueprint(editing(templateById('room')!.build('level', 'Level')), starter.name, {
        ...starter.blueprint,
      })!,
      { blueprint: starter.name, name: 'guard', x: 0, y: 1, z: 0 },
    )!

    const document = built.document
    expect(parseXp(JSON.parse(JSON.stringify(document))).ok).toBe(true)

    const world = spawnEntities(document)
    const shooter = spawnPlayer(world, document, document.spawn)
    const guard = entityByName(world, 'guard')!

    // Still standing on a hit it survives, which is the condition doing its job.
    // `damage` is the door that wakes the rules - the verb of the same name does
    // not, which is a trap this test would otherwise walk into as well.
    const survived = damage(world, document.blueprints, guard, 10, shooter)
    expect(survived.some((effect) => effect.kind === 'score')).toBe(false)
    expect(world.alive.has(guard)).toBe(true)

    const died = damage(world, document.blueprints, guard, 30, shooter)
    expect(died.some((effect) => effect.kind === 'score')).toBe(true)
    expect(world.alive.has(guard)).toBe(false)
  })
})

/**
 * Arriving as an animal, which is a starter rather than a field.
 *
 * The obvious shape for this is a picker on the player starter - same button,
 * pick a model. It is wrong for the reason `AnimationGraph.rig` exists: the two
 * skeletons share not one clip name and not one part name, so a player blueprint
 * whose model somebody swapped to a fox is a body whose `pose`, whose animator
 * and whose every `runAnimation` are all now naming things that do not exist -
 * silently, because a clip that does not resolve plays nothing and reports
 * nothing.
 *
 * A button hands over a coherent set. A picker hands over half of one.
 */
describe('the peep starter', () => {
  const peep = () => STARTERS.find((entry) => entry.id === 'peep')!

  test('makes a body the document arrives as, like the player starter', () => {
    const starter = peep()
    const state = addBody(editing(templateById('room')!.build('level', 'Level')), starter.name, {
      ...starter.blueprint,
    })!

    expect(state.document.player.blueprint).toBe('peep')
    expect(state.document.blueprints.peep.model).toBe('peepz/fox')
    expect(parseXp(JSON.parse(JSON.stringify(state.document))).ok).toBe(true)
  })

  test('and it is a rig, which is the whole reason it is its own button', () => {
    // If this ever came back `dummy` the starter would be handing somebody the
    // player starter with a different model on it, and every argument above for
    // it being separate would be false.
    expect(skeletonOf(peep().blueprint.model!)).toBe('peepz')
    expect(skeletonOf(STARTERS.find((entry) => entry.id === 'player')!.blueprint.model!)).toBe(
      'dummy',
    )
  })

  test('the clips it can be posed in are its own, not the dummy s', () => {
    /**
     * What the editor's Pose picker offers, asserted where it can be. The two
     * lists do not share a name, so offering the wrong one is a menu on which
     * every option leaves the body in its bind pose.
     */
    const theirs = clipsFor(skeletonOf(peep().blueprint.model!)!)
    expect(theirs).toContain('idle')
    expect(theirs).not.toContain('Idle_A')
    expect(clipsFor('dummy')).toContain('Idle_A')
  })

  test('and it stands about the height the built-in body is scaled to', () => {
    /**
     * Why there is no size correction on this starter, as a number.
     *
     * A document-owned player blueprint is drawn at scale 1 and its pack's scale
     * carries it, so the only question is whether the model is already the right
     * size. `BUILT_IN_BODY_SCALE` shrinks the 2.396-cell dummy to 1.80; a fox
     * measures 1.686 at scale 1, which is the same person. That is not a
     * coincidence - `PLAYER_SCALE`'s own note says the dummy is being sized onto
     * the lounge's peeps, and this is that peep.
     */
    const fox = findModel(peep().blueprint.model!)!
    expect(Math.abs(fox.size.h - 2.396 * BUILT_IN_BODY_SCALE)).toBeLessThan(0.15)
  })
})

/**
 * Changing which skeleton a body is, which the editor could not do at all.
 *
 * Reported as *"you didn't add an option to choose between peepz and
 * xp-avatar"* - and the model picker genuinely does not answer it: four
 * thousand models across thirty-eight packs, and finding the one rigged fox
 * means knowing the pack is called `peepz`.
 *
 * The panel is two buttons. What is checked here is the part underneath them,
 * because it is the part that is a *correctness* problem rather than a
 * convenience one: the two rigs share no clip name and no part name, so a body
 * that changes skeleton and keeps its `pose` plays nothing, and one that keeps
 * its `animator` is a document the parser refuses - which would leave the
 * editor holding a level it cannot save.
 */
describe('switching a body between skeletons', () => {
  const withPlayer = () => {
    const starter = STARTERS.find((entry) => entry.id === 'player')!
    return addBody(editing(templateById('room')!.build('level', 'Level')), starter.name, {
      ...starter.blueprint,
    })!
  }

  test('the model changes and the document still parses', () => {
    const state = setBlueprint(withPlayer(), 'player', { model: 'peepz/fox' })!
    expect(state.document.blueprints.player.model).toBe('peepz/fox')
    expect(parseXp(JSON.parse(JSON.stringify(state.document))).ok).toBe(true)
  })

  test('a pose from the other rig is cleared rather than left to play nothing', () => {
    // `Idle_A` is a name in the dummy's clip pack and means nothing to a fox.
    const posed = setBlueprint(withPlayer(), 'player', { pose: 'Idle_A' })!
    expect(posed.document.blueprints.player.pose).toBe('Idle_A')

    // The empty string is how the panel says "no such field" - the same
    // spelling the Pose picker's "however it stands" already hands in.
    const peep = setBlueprint(posed, 'player', { model: 'peepz/fox', pose: '' })!
    expect(peep.document.blueprints.player.pose).toBeUndefined()
    expect(parseXp(JSON.parse(JSON.stringify(peep.document))).ok).toBe(true)
  })

  test('and so is a graph written for it, which the parser would otherwise refuse', () => {
    /**
     * The one that is not merely untidy. A graph declares its rig, and the
     * parser compares it against the body's - so an `animator` left behind
     * after a switch is a document that cannot be saved, in an editor whose one
     * hard property is that what it holds is what parses.
     */
    const graphed = editing({
      ...withPlayer().document,
      animations: {
        human: {
          entry: 'idle',
          rig: 'dummy' as const,
          states: { idle: { clip: 'Idle_A', loop: true } },
          transitions: [],
        },
      },
    })
    const pointed = setBlueprint(graphed, 'player', { animator: 'human' })!
    expect(parseXp(JSON.parse(JSON.stringify(pointed.document))).ok).toBe(true)

    // Kept, and the level stops parsing - which is what the panel must avoid.
    const kept = setBlueprint(pointed, 'player', { model: 'peepz/fox' })!
    expect(parseXp(JSON.parse(JSON.stringify(kept.document))).ok).toBe(false)

    // Cleared, and it opens.
    const cleared = setBlueprint(pointed, 'player', { model: 'peepz/fox', animator: '' })!
    expect(cleared.document.blueprints.player.animator).toBeUndefined()
    expect(parseXp(JSON.parse(JSON.stringify(cleared.document))).ok).toBe(true)
  })

  test('swapping one animal for another keeps the pose, because they share their clips', () => {
    // All twenty-four ship the same eight, so a fox's `walk` is a bear's `walk`.
    // The panel only clears when the *rig* changes, and this is why.
    const fox = setBlueprint(withPlayer(), 'player', { model: 'peepz/fox', pose: '' })!
    const posed = setBlueprint(fox, 'player', { pose: 'walk' })!
    const cow = setBlueprint(posed, 'player', { model: 'peepz/cow' })!
    expect(cow.document.blueprints.player.pose).toBe('walk')
    expect(parseXp(JSON.parse(JSON.stringify(cow.document))).ok).toBe(true)
  })
})
