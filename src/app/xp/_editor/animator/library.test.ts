import { describe, expect, test } from 'bun:test'
import {
  addClip,
  copyClip,
  currentClip,
  emptyLibrary,
  freeName,
  parseLibrary,
  removeClip,
  renameClip,
  showClip,
  withClip,
} from '@/app/xp/_editor/animator/clip'
import type { Pose } from '@/app/xp/_editor/animator/clip'

/**
 * Several clips in one file.
 *
 * Nobody animates a walk; they animate a character - a walk, an idle, a wave, a
 * death, authored in one sitting against one rig and only useful together. One
 * file each meant four working files and an editor that could hold one at a
 * time.
 */
const REST: Pose = { root: [0, 0, 0], bones: { spine: [0, 0, 0, 1] } }

describe('a library of clips', () => {
  test('a new one holds exactly one clip, because none is a screen with nothing on it', () => {
    const library = emptyLibrary(REST)
    expect(library.clips).toHaveLength(1)
    expect(library.at).toBe(0)
    expect(currentClip(library).name).toBe('idle')
  })

  test('a new clip lands next to the one showing, and is shown', () => {
    // Next to rather than at the end: somebody adding a clip while looking at
    // the third one is working near the third one.
    const two = addClip(addClip(emptyLibrary(REST), REST, 'walk'), REST, 'run')
    expect(two.clips.map((one) => one.name)).toEqual(['idle', 'walk', 'run'])
    expect(currentClip(two).name).toBe('run')
  })

  test('a copy is the shown clip again under a free name', () => {
    // The move people actually make: a run is a walk with longer strides.
    const copied = copyClip(addClip(emptyLibrary(REST), REST, 'walk'))
    expect(copied.clips.map((one) => one.name)).toEqual(['idle', 'walk', 'walk-2'])
    expect(currentClip(copied).name).toBe('walk-2')
  })

  test('and its keys are its own, not the original s', () => {
    /**
     * A shallow copy would give two clips one array of keys, so posing the copy
     * would edit the thing it was copied from - and the person doing it would
     * see it only when they scrubbed back to the original.
     */
    const copied = copyClip(emptyLibrary(REST))
    const [first, second] = copied.clips
    expect(second!.keys[0]).not.toBe(first!.keys[0])
    expect(second!.keys[0]!.pose.bones).not.toBe(first!.keys[0]!.pose.bones)
  })

  test('two clips cannot share a name, because a name is how one is played', () => {
    // They are played by name and written into a document keyed by name, so two
    // called `walk` is two things one lookup cannot tell apart.
    const library = addClip(emptyLibrary(REST), REST, 'idle')
    expect(library.clips.map((one) => one.name)).toEqual(['idle', 'idle-2'])
    expect(freeName(library, 'idle')).toBe('idle-3')
  })

  test('renaming keeps that true, and renaming to what it already is is free', () => {
    const two = addClip(emptyLibrary(REST), REST, 'walk')
    expect(currentClip(renameClip(two, 'idle')).name).toBe('idle-2')
    // Its own name is not a collision with itself.
    expect(renameClip(two, 'walk')).toBe(two)
  })

  test('the last clip cannot be removed', () => {
    // A library is its clips - the same rule a motion's steps have. Clearing the
    // last one is what deleting its keys is for.
    const one = emptyLibrary(REST)
    expect(removeClip(one, 0)).toBe(one)
  })

  test('and removing one above you leaves you looking at what was under it', () => {
    const three = addClip(addClip(emptyLibrary(REST), REST, 'walk'), REST, 'run')
    // Showing `run` at index 2; drop `walk` at index 1.
    const left = removeClip(three, 1)
    expect(left.clips.map((one) => one.name)).toEqual(['idle', 'run'])
    expect(currentClip(left).name).toBe('run')
  })

  test('showing one that is not there changes nothing', () => {
    const library = emptyLibrary(REST)
    expect(showClip(library, 4)).toBe(library)
    expect(showClip(library, -1)).toBe(library)
    expect(showClip(library, 0)).toBe(library)
  })

  test('replacing the shown clip with itself changes nothing', () => {
    // Reference equality is what the undo stack reads to decide there was an
    // edit at all - see `shape` in the animator.
    const library = emptyLibrary(REST)
    expect(withClip(library, currentClip(library))).toBe(library)
  })
})

describe('reading one off disk', () => {
  test('a single clip is a library of one, which is every file written so far', () => {
    /**
     * The whole upgrade path, and why `CLIP_VERSION` does not move: read as a
     * library of one, an old file means exactly what it meant.
     */
    const old = { version: 1, name: 'wave', rig: 'dummy', fps: 24, duration: 1, loop: true, keys: [] }
    const library = parseLibrary(old, REST)
    expect(library.clips).toHaveLength(1)
    expect(library.clips[0]!.name).toBe('wave')
    expect(library.rig).toBe('dummy')
  })

  test('and a peep file opens as a peep library, not a dummy one', () => {
    // The single clip's own rig becomes the library's, which is the only reading
    // that keeps a fox's walk opening on a fox.
    const library = parseLibrary({ name: 'trot', rig: 'peepz', keys: [] }, REST)
    expect(library.rig).toBe('peepz')
  })

  test('every clip in a library wears the library s rig, whatever it claimed', () => {
    /**
     * A library is one rig by construction - the two skeletons share no bone
     * name, so a collection spanning both is a collection of nothing editable.
     * A clip inside one claiming the other is a hand-edit or a bad merge, and
     * taking the library's word leaves something poseable.
     */
    const library = parseLibrary(
      { rig: 'peepz', clips: [{ name: 'a', rig: 'dummy', keys: [] }, { name: 'b', keys: [] }] },
      REST,
    )
    expect(library.clips.map((one) => one.rig)).toEqual(['peepz', 'peepz'])
  })

  test('duplicate names off disk are made distinct', () => {
    const library = parseLibrary({ clips: [{ name: 'walk' }, { name: 'walk' }] }, REST)
    expect(new Set(library.clips.map((one) => one.name)).size).toBe(2)
  })

  test('an empty collection opens as a new one rather than as a blank screen', () => {
    expect(parseLibrary({ clips: [] }, REST).clips).toHaveLength(1)
  })

  test('and a nonsense playhead is brought back into range', () => {
    // The file is untrusted input like anything else from outside; an index past
    // the end would be a timeline showing nothing.
    expect(parseLibrary({ clips: [{ name: 'a' }], at: 9 }, REST).at).toBe(0)
    expect(parseLibrary({ clips: [{ name: 'a' }], at: -3 }, REST).at).toBe(0)
  })
})
