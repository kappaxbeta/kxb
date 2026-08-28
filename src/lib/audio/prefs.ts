/**
 * What the player has asked to hear.
 *
 * Four fields and no master mute, deliberately. A master switch on top of two
 * category switches gives every state two names - "off because muted" and "off
 * because music is off" - and the UI then has to decide which one a re-enable
 * should undo. Two independent switches have one name per state and the quick
 * button in the lounge flips exactly the one it is labelled with.
 *
 * Kept per device rather than on the profile. Volume is a property of the
 * speakers you happen to be sitting at, not of your account: the same person on
 * a laptop in an office and on headphones at home wants two different answers,
 * and a value that followed them would be wrong in one of those places every
 * time. It is also why this is plain localStorage and not an event stream -
 * nothing here is a fact about the workspace worth recording.
 */
export interface AudioPrefs {
  /** The background loop. What the lounge's quick button toggles. */
  music: boolean
  /** Everything else: hits, arrivals, goals, building. */
  sfx: boolean
  /** 0..1, applied on top of `music`. */
  musicVolume: number
  /** 0..1, applied on top of `sfx`. */
  sfxVolume: number
}

/**
 * Music **off** by default; effects on, and everything mixed quiet.
 *
 * Music sits under everything for a whole session, so it is mixed well below
 * the effects - at parity the loop drowns the one sound that was actually
 * telling you something. 0.25 is roughly where the track stops competing with
 * a punch landing.
 *
 * Off rather than on, which is a reversal: a loop that starts on its own is
 * the thing people reach for the mute on, and somebody who wants a soundtrack
 * will turn one on. Effects stay on because they are feedback rather than
 * atmosphere - a block landing with no sound reads as a block that did not
 * land.
 *
 * `musicVolume` is deliberately left where it was. It is what the track plays
 * at *once somebody asks for it*, and starting them at zero would mean two
 * controls to find instead of one.
 */
export const DEFAULT_PREFS: AudioPrefs = {
  music: false,
  sfx: true,
  musicVolume: 0.25,
  sfxVolume: 0.4,
}

export const AUDIO_STORAGE_KEY = 'unkown.audio'

/** 0..1, and never NaN - a slider that has been dragged off the end is still a slider. */
export function clampVolume(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

/**
 * Parse whatever was in storage, and never throw.
 *
 * Tolerant on purpose: this reads a value the user's own browser holds, which
 * may have been written by an older version of this file, hand-edited, or
 * truncated by a full disk. Any field that does not make sense falls back to
 * its default rather than taking the whole preferences object down with it -
 * losing the volume is a shrug, and losing audio entirely because one key was
 * corrupt is not.
 */
export function parsePrefs(raw: unknown): AudioPrefs {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_PREFS

  const source = raw as Partial<Record<keyof AudioPrefs, unknown>>

  return {
    music: typeof source.music === 'boolean' ? source.music : DEFAULT_PREFS.music,
    sfx: typeof source.sfx === 'boolean' ? source.sfx : DEFAULT_PREFS.sfx,
    musicVolume:
      source.musicVolume === undefined
        ? DEFAULT_PREFS.musicVolume
        : clampVolume(source.musicVolume),
    sfxVolume:
      source.sfxVolume === undefined
        ? DEFAULT_PREFS.sfxVolume
        : clampVolume(source.sfxVolume),
  }
}

/**
 * The number that actually reaches the speakers.
 *
 * A switch and a slider collapse to one gain here rather than being checked
 * separately at each play site, so "off" and "turned all the way down" cannot
 * behave differently by accident.
 */
export function musicGain(prefs: AudioPrefs): number {
  return prefs.music ? clampVolume(prefs.musicVolume) : 0
}

export function sfxGain(prefs: AudioPrefs): number {
  return prefs.sfx ? clampVolume(prefs.sfxVolume) : 0
}

/** Defaults on the server and in any browser that refuses storage. */
export function loadPrefs(): AudioPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS

  try {
    const stored = window.localStorage.getItem(AUDIO_STORAGE_KEY)
    if (!stored) return DEFAULT_PREFS
    return parsePrefs(JSON.parse(stored))
  } catch {
    // Storage can throw rather than return null - Safari's private mode, a
    // quota that is already full, a profile with site data blocked. None of
    // those are worth a broken page over.
    return DEFAULT_PREFS
  }
}

export function savePrefs(prefs: AudioPrefs): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // Same reasons as above. The preference still applies for this session; it
    // just will not survive the reload, which is the honest failure here.
  }
}
