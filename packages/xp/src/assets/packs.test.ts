import { describe, expect, test } from 'bun:test'
import { isRigged, modelUrl, PACKS, skeletonOf, splitModel } from './packs'
import { DEFAULT_SKELETON } from './catalogue'

/**
 * Which models have bones, which decides how they are drawn.
 *
 * The runtime has two paths and they are not interchangeable: everything is one
 * `InstancedMesh` per model, which shares one geometry between every copy, and
 * a skinned pose is a *different* geometry per body. So a rigged model drawn the
 * instanced way is a bind pose - silently, with nothing thrown and the model
 * plainly there, standing with its arms out.
 *
 * The question used to be `model.startsWith('dummy/')`, written out in three
 * places. One skeleton pack today and a second planned means a string test that
 * is right until the day it quietly is not.
 */
describe('models with bones', () => {
  test('the skeleton pack is rigged and the prop packs are not', () => {
    expect(isRigged(DEFAULT_SKELETON)).toBe(true)
    expect(isRigged('proto/Box_A')).toBe(false)
    expect(isRigged('platformer-neutral/floor_spikes_2x2x1')).toBe(false)
  })

  test('exactly four packs claim it, so a fifth is a decision rather than a drift', () => {
    /**
     * Not a rule that there may only ever be four. It is a rule that adding
     * the next one is a thing somebody did on purpose, with this test in front
     * of them, rather than a field that appeared because a pack was copied -
     * and every rig costs a clip table, a handle table and a part vocabulary,
     * none of which a copied line would bring with it.
     *
     * The adventurers and the monsters were exactly that decision, made
     * cheaply twice: both claim the *dummy's* skeleton rather than a rig of
     * their own, because their joint lists are the dummy's 23 bones name for
     * name. New meshes, no new vocabulary.
     */
    const rigged = Object.entries(PACKS)
      .filter(([, pack]) => pack.skeleton)
      .map(([id]) => id)
    expect(rigged).toEqual(['dummy', 'peepz', 'adventurers', 'kappa'])
    expect(PACKS.adventurers.skeleton).toBe('dummy')
    expect(PACKS.kappa.skeleton).toBe('dummy')
  })

  test('and the default player body is one of them', () => {
    // If this ever fails the player is being drawn instanced, which is a T-pose
    // where a person should be.
    expect(splitModel(DEFAULT_SKELETON)?.pack.skeleton).toBe('dummy')
  })

  test('a model from a pack nobody ships is not rigged, rather than a throw', () => {
    // A remote pack is a document from somewhere else, not a mistake - and
    // drawing an unknown model instanced is what has always happened to it.
    expect(isRigged('somebody-elses-pack/Hero')).toBe(false)
    expect(isRigged('nonsense')).toBe(false)
    expect(isRigged('')).toBe(false)
  })
})

/**
 * *Which* rig, which is the question `isRigged` was a lossy version of.
 *
 * A peep and a dummy are both "rigged" and share almost nothing else: the dummy
 * is skinned with 23 joints and plays clips fetched from a separate pack, a peep
 * is six rigid parts on a node hierarchy playing eight clips out of its own file.
 * Anything that tries to serve both off one boolean serves one of them wrongly.
 */
describe('which skeleton', () => {
  test('each rigged pack names its own', () => {
    expect(skeletonOf(DEFAULT_SKELETON)).toBe('dummy')
    expect(skeletonOf('peepz/fox')).toBe('peepz')
  })

  test('a prop has none, and so does an id from nowhere', () => {
    expect(skeletonOf('proto/Box_A')).toBeNull()
    expect(skeletonOf('somebody-elses-pack/Hero')).toBeNull()
    expect(skeletonOf('')).toBeNull()
  })

  test('the peeps keep their prefix, so an id is not a stutter', () => {
    // `peepz/animal-fox` is what the folder would give you and what nobody
    // should have to type. The builder's copy of this table strips the same
    // prefix, and a document written against either reads the same.
    expect(modelUrl('peepz/fox')).toBe('/xp/packs/peepz/animal-fox.glb')
  })
})
