import { describe, expect, it } from 'bun:test'
import {
  DEFAULT_PREFS,
  clampVolume,
  musicGain,
  parsePrefs,
  sfxGain,
} from '@/lib/audio/prefs'

describe('clampVolume', () => {
  it('keeps a legal volume', () => {
    expect(clampVolume(0)).toBe(0)
    expect(clampVolume(0.35)).toBe(0.35)
    expect(clampVolume(1)).toBe(1)
  })

  it('pulls anything off the ends back onto them', () => {
    expect(clampVolume(-2)).toBe(0)
    expect(clampVolume(11)).toBe(1)
  })

  it('treats rubbish as silence rather than as NaN', () => {
    // A NaN assigned to GainNode.gain throws, and a NaN on an <audio> element's
    // volume is a DOM exception - so this is the one case that must not escape.
    expect(clampVolume(Number.NaN)).toBe(0)
    expect(clampVolume('loud')).toBe(0)
    expect(clampVolume(null)).toBe(0)
    expect(clampVolume(undefined)).toBe(0)
  })

  it('takes the infinities as rubbish too, not as the top of the range', () => {
    // Arguably +Infinity is "off the top end" and could clamp to 1. It does
    // not, and deliberately: the only way either infinity reaches this function
    // is corrupt storage, and the safe reading of a corrupt volume is silence.
    // Guessing wrong towards 0 is a moment of confusion; guessing wrong towards
    // 1 is somebody's headphones at full volume.
    expect(clampVolume(Number.POSITIVE_INFINITY)).toBe(0)
    expect(clampVolume(Number.NEGATIVE_INFINITY)).toBe(0)
  })
})

describe('parsePrefs', () => {
  it('round-trips what the app itself writes', () => {
    const stored = { music: false, sfx: true, musicVolume: 0.2, sfxVolume: 0.9 }
    expect(parsePrefs(stored)).toEqual(stored)
  })

  it('falls back per field rather than wholesale', () => {
    // The point of the tolerance: one bad key costs you that key, not audio.
    expect(parsePrefs({ music: 'no', sfxVolume: 0.5 })).toEqual({
      music: DEFAULT_PREFS.music,
      sfx: DEFAULT_PREFS.sfx,
      musicVolume: DEFAULT_PREFS.musicVolume,
      sfxVolume: 0.5,
    })
  })

  it('clamps volumes that were stored out of range', () => {
    expect(parsePrefs({ musicVolume: 40, sfxVolume: -1 })).toMatchObject({
      musicVolume: 1,
      sfxVolume: 0,
    })
  })

  it('takes anything that is not an object as no preferences at all', () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS)
    expect(parsePrefs(undefined)).toEqual(DEFAULT_PREFS)
    expect(parsePrefs('{}')).toEqual(DEFAULT_PREFS)
    expect(parsePrefs(7)).toEqual(DEFAULT_PREFS)
  })

  it('does not mistake a stored false for a missing value', () => {
    // The bug this guards: `source.music || DEFAULT` would silently turn the
    // music back on for everybody who had turned it off.
    expect(parsePrefs({ music: false, sfx: false }).music).toBe(false)
    expect(parsePrefs({ music: false, sfx: false }).sfx).toBe(false)
  })

  it('does not mistake a stored zero for a missing volume', () => {
    // Same shape of bug one level down: a slider dragged to silence must stay
    // at silence rather than springing back to the default.
    expect(parsePrefs({ musicVolume: 0, sfxVolume: 0 })).toMatchObject({
      musicVolume: 0,
      sfxVolume: 0,
    })
  })
})

describe('gains', () => {
  it('is the volume when the category is on', () => {
    const prefs = { music: true, sfx: true, musicVolume: 0.3, sfxVolume: 0.8 }
    expect(musicGain(prefs)).toBe(0.3)
    expect(sfxGain(prefs)).toBe(0.8)
  })

  it('is zero when the category is off, whatever the slider says', () => {
    // Muting must not disturb the volume, so that turning it back on returns
    // you to the level you chose rather than to the default.
    const prefs = { music: false, sfx: false, musicVolume: 0.9, sfxVolume: 0.9 }
    expect(musicGain(prefs)).toBe(0)
    expect(sfxGain(prefs)).toBe(0)
  })

  it('is independent per category', () => {
    const prefs = { music: false, sfx: true, musicVolume: 0.5, sfxVolume: 0.5 }
    expect(musicGain(prefs)).toBe(0)
    expect(sfxGain(prefs)).toBe(0.5)
  })
})
