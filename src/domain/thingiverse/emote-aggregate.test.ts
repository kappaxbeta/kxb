import { describe, expect, test } from 'bun:test'
import type { Asker } from '@/domain/thingiverse/commands'
import {
  emoteTreeDecider,
  initialEmoteTreeState,
} from '@/domain/thingiverse/emote-aggregate'
import type { EmoteTreeEvent } from '@/domain/thingiverse/emote-events'
import { freshNode, type EmoteTree } from '@/domain/thingiverse/emote-tree'
import { DomainError } from '@/es/errors'
import { fold } from '@/es/types'

const ada = 'a0000000-0000-4000-8000-000000000001'
const sam = 'a0000000-0000-4000-8000-000000000002'

const owner: Asker = { actorId: ada, admin: false }
const member: Asker = { actorId: sam, admin: false }

const menu: EmoteTree = {
  roots: [
    {
      ...freshNode('a'),
      label: 'Dances',
      key: 'D',
      children: [{ ...freshNode('a1'), label: 'Robot', key: 'R', clip: 'robot' }],
    },
  ],
}

const given = (...events: EmoteTreeEvent[]) => fold(emoteTreeDecider, events)
const decide = emoteTreeDecider.decide

describe('arranging the menu', () => {
  test('records the whole tree and who arranged it', () => {
    expect(decide(initialEmoteTreeState, { type: 'SetEmoteTree', by: owner, tree: menu })).toEqual([
      { type: 'EmoteTreeSet', data: { tree: menu, byId: ada } },
    ])
  })

  test('saving the same menu again records nothing', () => {
    // The editor's Save is one button for the whole menu, so pressing it twice
    // is normal - and a second identical event would say somebody rearranged
    // the menu when nobody did.
    const state = given({ type: 'EmoteTreeSet', data: { tree: menu, byId: ada } })

    expect(decide(state, { type: 'SetEmoteTree', by: owner, tree: menu })).toEqual([])
  })

  test('an absent key and an undefined one are the same menu', () => {
    // Both drop out of JSON, and the comparison is JSON because the document is
    // stored as JSON - two trees that serialise identically are one tree to
    // every reader of this log.
    const state = given({ type: 'EmoteTreeSet', data: { tree: menu, byId: ada } })
    const same: EmoteTree = {
      roots: [{ ...menu.roots[0], children: [{ ...menu.roots[0].children[0], key: 'R' }] }],
    }

    expect(decide(state, { type: 'SetEmoteTree', by: owner, tree: same })).toEqual([])
  })

  test('a real change records', () => {
    const state = given({ type: 'EmoteTreeSet', data: { tree: menu, byId: ada } })
    const moved: EmoteTree = {
      roots: [{ ...menu.roots[0], label: 'Moves' }],
    }

    expect(decide(state, { type: 'SetEmoteTree', by: owner, tree: moved })).toHaveLength(1)
  })

  test('anybody in the space may arrange it, not only whoever made it first', () => {
    // Deliberately wider than a blueprint's rule: a blueprint is somebody's, and
    // the menu is the space's. Owning it would mean the first person to arrange
    // it owns the only menu the space has.
    const state = given({ type: 'EmoteTreeSet', data: { tree: menu, byId: ada } })
    const theirs: EmoteTree = { roots: [{ ...freshNode('b'), label: 'Greetings' }] }

    expect(decide(state, { type: 'SetEmoteTree', by: member, tree: theirs })).toEqual([
      { type: 'EmoteTreeSet', data: { tree: theirs, byId: sam } },
    ])
  })

  test('emptying it is a normal save, not a second event type', () => {
    const state = given({ type: 'EmoteTreeSet', data: { tree: menu, byId: ada } })

    expect(decide(state, { type: 'SetEmoteTree', by: owner, tree: { roots: [] } })).toEqual([
      { type: 'EmoteTreeSet', data: { tree: { roots: [] }, byId: ada } },
    ])
  })
})

describe('what the decider refuses', () => {
  test('a menu with an unnamed row', () => {
    const bad: EmoteTree = { roots: [freshNode('a')] }

    expect(() =>
      decide(initialEmoteTreeState, { type: 'SetEmoteTree', by: owner, tree: bad }),
    ).toThrow(DomainError)
  })

  test('and says every reason, not the first', () => {
    // The editor marks bad rows as you type, so a refusal that reached here got
    // past that - and is the only copy of the reason somebody will see.
    const bad: EmoteTree = {
      roots: [
        { ...freshNode('a'), label: '', key: 'D' },
        { ...freshNode('b'), label: '', key: 'd' },
      ],
    }

    try {
      decide(initialEmoteTreeState, { type: 'SetEmoteTree', by: owner, tree: bad })
      throw new Error('should have refused')
    } catch (error) {
      expect((error as DomainError).message).toContain('every row needs a name')
      expect((error as DomainError).message).toContain('D is bound twice')
    }
  })
})

describe('folding the log', () => {
  test('a space nobody has arranged has an empty menu', () => {
    expect(given()).toEqual({ tree: { roots: [] }, rows: 0 })
  })

  test('the last arrangement wins, and the row count comes with it', () => {
    const state = given(
      { type: 'EmoteTreeSet', data: { tree: { roots: [] }, byId: ada } },
      { type: 'EmoteTreeSet', data: { tree: menu, byId: sam } },
    )

    expect(state.tree).toEqual(menu)
    expect(state.rows).toBe(2)
  })
})
