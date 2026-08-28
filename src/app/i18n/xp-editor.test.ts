/**
 * The two tables the editor's dictionary does not own.
 *
 * `rig.ts` and `presets.ts` keep their English labels, because those files are
 * a description of a skeleton and of seven canned moves and the label is part
 * of what they describe. The German lives here — which means the two can drift,
 * and this is what stops them: a bone added to a rig, or a preset added to a
 * list, fails here rather than showing a German author an English word.
 *
 * A missing entry is not a crash. `boneLabel` falls back to what the rig calls
 * it, the same promise `t()` makes to a level. This is about noticing.
 */
import { describe, expect, test } from 'bun:test'
import { DUMMY_BONES, PEEPZ_BONES, RIGS } from '@/app/xp/_editor/animator/rig'
import { PEEPZ_PRESETS, PRESETS } from '@/app/xp/_editor/animator/presets'
import { XP_EDITOR_DE, XP_EDITOR_EN } from '@/app/i18n/xp-editor'

describe('every bone has a German name', () => {
  for (const bone of [...DUMMY_BONES, ...PEEPZ_BONES]) {
    test(bone.name, () => {
      expect(XP_EDITOR_DE.animator.bones[bone.name]).toBeString()
    })
  }

  /**
   * And the English side is the rig's own, so the dictionary cannot quietly
   * disagree with the file it is translating.
   */
  for (const bone of [...DUMMY_BONES, ...PEEPZ_BONES]) {
    test(`${bone.name} matches the rig`, () => {
      expect(XP_EDITOR_EN.animator.bones[bone.name]).toBe(bone.label)
    })
  }
})

describe('no German for a bone that no longer exists', () => {
  const live = new Set([...DUMMY_BONES, ...PEEPZ_BONES].map((bone) => bone.name))
  for (const name of Object.keys(XP_EDITOR_DE.animator.bones)) {
    test(name, () => {
      expect(live.has(name)).toBe(true)
    })
  }
})

describe('every preset has a German label and hint', () => {
  const rigs = [
    ['dummy', PRESETS],
    ['peepz', PEEPZ_PRESETS],
  ] as const

  for (const [rig, presets] of rigs) {
    for (const preset of presets) {
      test(`${rig}/${preset.id}`, () => {
        const words = XP_EDITOR_DE.animator.presets[rig][preset.id]
        expect(words?.label).toBeString()
        expect(words?.hint).toBeString()
      })

      test(`${rig}/${preset.id} matches the preset`, () => {
        const words = XP_EDITOR_EN.animator.presets[rig][preset.id]
        expect(words?.label).toBe(preset.label)
        expect(words?.hint).toBe(preset.hint)
      })
    }
  }
})

/** Both rigs, named. */
test('every rig has a German name', () => {
  for (const rig of Object.values(RIGS)) {
    expect(XP_EDITOR_DE.animator.rigs[rig.id]).toBeString()
    expect(XP_EDITOR_EN.animator.rigs[rig.id]).toBe(rig.label)
  }
})
