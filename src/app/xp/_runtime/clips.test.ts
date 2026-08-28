import { describe, expect, test } from 'bun:test'
import { CLIPS } from '@/app/xp/_runtime/clips.generated'
import { poseFor } from '@/app/xp/_runtime/body/motion'
import { readClips, runtimeSources } from '../../../../scripts/xp-clips'

/**
 * The checked-in clip list, against the files on disk.
 *
 * The same guard the model catalogue has, and it matters more here: the list is
 * what the editor offers, and a name it offers that the runtime does not load
 * produces a body silently keeping its last pose. That failure has no error and
 * no log — it is a guard standing there doing nothing — so the only place it
 * can be caught is a test that reads the glTFs.
 */

describe('the clips a body can play', () => {
  test('the generated list is what the loaded files hold', () => {
    expect([...CLIPS] as string[]).toEqual(readClips())
  })

  test('there are four files loaded, and the list is only from those', () => {
    // If this number moves, `skinned.tsx` changed what it downloads in front of
    // a player — which is the trade this list exists to keep honest. The fourth
    // is `CombatMelee`, added so a body binding `attack` can swing at something
    // instead of standing still while the level responds around it.
    expect(runtimeSources()).toHaveLength(4)
  })

  test('every clip the motion machine names is one of them', () => {
    // `poseFor` picks by hand, and a typo there is the same silent failure.
    // `hit` was missing from this list for as long as it has existed, which is
    // the failure mode the list *is*. ./motion.test sweeps `Record<Motion, true>`
    // instead, so it cannot be forgotten there; this stays as the cheaper check
    // and is now complete.
    const motions = ['idle', 'walk', 'run', 'air', 'land', 'dead', 'shoot', 'hit', 'attack'] as const
    for (const motion of motions) {
      for (const armed of [false, true]) {
        expect([...CLIPS] as string[]).toContain(poseFor(motion, armed).clip)
      }
    }
  })

  test('the names are the shape the format accepts', () => {
    // The pair that matters: every clip the editor can offer has to be a clip a
    // document can *hold*. This caught the hyphen in `T-Pose`, which the first
    // version of the format's alphabet would have refused — an offer nothing
    // could save.
    for (const clip of CLIPS) expect(clip).toMatch(/^[A-Za-z][A-Za-z0-9_-]*$/)
  })
})
