import { describe, expect, it } from 'bun:test'
import { existsSync } from 'node:fs'

import { blueprintProblems, socketsOf, MAX_BLUEPRINT_NAME } from '@/domain/thingiverse/blueprint'
import { sameItem } from '@/domain/thingiverse/craft'
import { knownModel, modelUrlFor } from '@/domain/thingiverse/models'
import { allStarters, KXB_TAG, STARTER_SETS, starterSet } from '@/domain/thingiverse/starters'

/**
 * What a starter has to survive.
 *
 * The interesting half of this file is not "does it parse" - it is the four
 * ways a hand-written spec is quietly dead on arrival, every one of which looks
 * like nothing happening in a room and none of which `blueprintProblems` can
 * catch, because each is a reference into something the domain deliberately
 * does not resolve:
 *
 *   - a slot on a socket the thing does not have (the item lands in the floor),
 *   - a recipe naming an item nothing on the shelf is called,
 *   - a shot leaving a muzzle nobody drew,
 *   - a state pointing at a model we do not ship.
 *
 * They are checkable *here* because a set is a closed world: the words a
 * kitchen uses are the names of the things in the kitchen.
 */
describe('starters', () => {
  it('are all legal blueprints', () => {
    for (const starter of allStarters()) {
      expect([starter.id, blueprintProblems(starter.spec)]).toEqual([starter.id, []])
    }
  })

  it('are marked ours, and say which set they came from', () => {
    for (const set of STARTER_SETS) {
      for (const starter of set.things) {
        expect(starter.spec.tags).toContain(KXB_TAG)
        expect(starter.spec.tags).toContain(set.id)
      }
    }
  })

  it('have names a shelf can hold and ids nobody repeats', () => {
    const ids = new Set<string>()
    for (const starter of allStarters()) {
      expect(ids.has(starter.id)).toBe(false)
      ids.add(starter.id)
      expect(starter.name.length).toBeGreaterThan(0)
      expect(starter.name.length).toBeLessThanOrEqual(MAX_BLUEPRINT_NAME)
      expect(starter.hint.length).toBeGreaterThan(0)
    }
  })

  it('name only models we ship, in every state and every piece', () => {
    for (const starter of allStarters()) {
      const models = [
        starter.spec.model,
        ...(starter.spec.parts ?? []).map((part) => part.model),
        ...(starter.spec.states?.states ?? []).flatMap((state) =>
          state.model === undefined ? [] : [state.model],
        ),
        ...(starter.spec.fight?.weapon?.shot ? [starter.spec.fight.weapon.shot.model] : []),
      ]
      for (const model of models) {
        expect([starter.id, model, knownModel(model)]).toEqual([starter.id, model, true])
      }
    }
  })

  /**
   * And that the files are actually there.
   *
   * `knownModel` asks whether the *pack* is one we ship and builds a path from
   * the name, so any `proto/<anything>` passes it - which is how the new-blueprint
   * button once opened onto a `proto/block` that 404s and took the whole editor
   * down with it. Nothing in the domain reads the disk, deliberately; a starter
   * is written by hand and shipped, so this is the one place the two can be
   * compared.
   */
  it('name models whose files are actually on disk', () => {
    for (const starter of allStarters()) {
      const models = [
        starter.spec.model,
        ...(starter.spec.parts ?? []).map((part) => part.model),
        ...(starter.spec.states?.states ?? []).flatMap((state) =>
          state.model === undefined ? [] : [state.model],
        ),
        ...(starter.spec.fight?.weapon?.shot ? [starter.spec.fight.weapon.shot.model] : []),
      ]
      for (const model of models) {
        const path = `public${modelUrlFor(model)}`
        expect([starter.id, model, existsSync(path)]).toEqual([starter.id, model, true])
      }
    }
  })

  it('put every slot, seat and muzzle on a socket that exists', () => {
    for (const starter of allStarters()) {
      const sockets = socketsOf(starter.spec).map((socket) => socket.name)

      for (const slot of starter.spec.craft?.slots ?? []) {
        expect([starter.id, slot.socket, sockets.includes(slot.socket)]).toEqual([
          starter.id,
          slot.socket,
          true,
        ])
      }
      for (const seat of starter.spec.use?.seats ?? []) {
        if (seat.socket) expect(sockets).toContain(seat.socket)
      }
      const from = starter.spec.fight?.weapon?.shot?.from
      if (from) expect(sockets).toContain(from)

      for (const recipe of starter.spec.craft?.recipes ?? []) {
        if (recipe.into) expect(sockets).toContain(recipe.into)
      }
    }
  })

  it('only cook with words something in the same set is called', () => {
    for (const set of STARTER_SETS) {
      const names = set.things.map((one) => one.name)
      const known = (word: string) => names.some((name) => sameItem(name, word))

      for (const starter of set.things) {
        for (const slot of starter.spec.craft?.slots ?? []) {
          for (const word of [...slot.takes, ...(slot.gives ? [slot.gives] : [])]) {
            expect([starter.id, word, known(word)]).toEqual([starter.id, word, true])
          }
        }
        for (const recipe of starter.spec.craft?.recipes ?? []) {
          for (const word of [...recipe.needs, recipe.makes]) {
            expect([starter.id, word, known(word)]).toEqual([starter.id, word, true])
          }
        }
      }
    }
  })

  /**
   * Signals are checked across every set rather than within one, and items are
   * not.
   *
   * The asymmetry is the product rather than a looser test. An item is *eaten*:
   * a board whose recipe names a word nothing on the shelf is called is a board
   * that can never finish, so a kitchen has to arrive whole. A signal is
   * *heard*, and a thing that waits for a word nobody has shouted yet is a
   * lamp waiting for the light switch you have not added - which is the shape
   * of every set past the first, and is exactly how the lounge's lamp and the
   * controls set's lever are meant to meet.
   *
   * What is still worth catching is the typo: a state waiting for `lights on`
   * where everything else says `lights-on`.
   */
  it('only wait for signals something we ship shouts', () => {
    const shouted = new Set<string>()
    for (const starter of allStarters()) {
      for (const state of starter.spec.states?.states ?? []) {
        if (state.emit) shouted.add(state.emit)
      }
      for (const action of starter.spec.actions) {
        if (action.deed === 'emit' && action.value) shouted.add(action.value)
      }
      for (const recipe of starter.spec.craft?.recipes ?? []) {
        if (recipe.emit) shouted.add(recipe.emit)
      }
      for (const slot of starter.spec.craft?.slots ?? []) {
        if (slot.emit) shouted.add(slot.emit)
      }
    }

    for (const starter of allStarters()) {
      for (const state of starter.spec.states?.states ?? []) {
        for (const change of state.changes) {
          if (change.when !== 'signal') continue
          const word = change.value ?? ''
          expect([starter.id, word, shouted.has(word)]).toEqual([starter.id, word, true])
        }
      }
    }
  })

  it('put the pieces of a set on the same shelf under one id', () => {
    const ids = STARTER_SETS.map((set) => set.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(starterSet(id)?.id).toBe(id)
    expect(starterSet('nothing')).toBeUndefined()
  })
})
