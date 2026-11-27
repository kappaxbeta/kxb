import { describe, expect, test } from 'bun:test'
import { copyActor, copyPeep, COPY_NUDGE } from '@/domain/studio/duplicate'
import { DEFAULT_PEEP } from '@/domain/studio/scene'
import { type Actor, DEFAULT_ACTOR, DEFAULT_SHOT } from '@/domain/studio/shot'

/**
 * The one thing a duplicate has to get right is that it is a *separate* body.
 * Everything else about it is visible in the editor the moment you press the
 * button; a shared array is not, and only shows up as the original moving when
 * you drag the copy.
 */

describe('copying a peep', () => {
  test('keeps every property', () => {
    const peep = {
      ...DEFAULT_PEEP,
      scale: 1.4,
      tilt: -12,
      emote: 3,
      say: 'Oi.',
      glow: { colour: '#ff3ec8', sparkle: true, strength: 2 },
    }
    const copy = copyPeep(peep)
    expect({ ...copy, x: peep.x }).toEqual(peep)
  })

  test('stands the copy beside the original', () => {
    expect(copyPeep({ ...DEFAULT_PEEP, x: 2 }).x).toBe(2 + COPY_NUDGE)
  })

  test('does not share the glow with the original', () => {
    const peep = { ...DEFAULT_PEEP, glow: { colour: '#ffffff', sparkle: true, strength: 1 } }
    const copy = copyPeep(peep)
    copy.glow!.strength = 3
    expect(peep.glow!.strength).toBe(1)
  })
})

describe('copying an actor', () => {
  test('does not share the action list with the original', () => {
    const actor = DEFAULT_SHOT.cast[0]!
    const copy = copyActor(actor)

    expect(copy.actions).toEqual(actor.actions)
    copy.actions.push({ kind: 'jump', t: 0, duration: 1, air: false })
    expect(copy.actions.length).toBe(actor.actions.length + 1)
  })

  test('does not share the key tracks with the original', () => {
    const actor: Actor = {
      ...DEFAULT_ACTOR,
      tracks: { x: [{ t: 0, value: 0, ease: 'linear' }] },
    }
    const copy = copyActor(actor)
    copy.tracks.x![0]!.value = 9
    expect(actor.tracks.x![0]!.value).toBe(0)
  })

  test('names the copy after the original', () => {
    expect(copyActor({ ...DEFAULT_ACTOR, name: 'Penguin' }).name).toBe('Penguin copy')
  })

  test('falls back to the animal when the original was never named', () => {
    expect(copyActor({ ...DEFAULT_ACTOR, name: '', avatar: 'penguin' }).name).toMatch(/copy$/)
  })

  test('counts up rather than repeating a name in the cast', () => {
    const actor = { ...DEFAULT_ACTOR, name: 'Penguin' }
    const taken = ['Penguin', 'Penguin copy', 'Penguin copy 2']
    expect(copyActor(actor, taken).name).toBe('Penguin copy 3')
  })
})
