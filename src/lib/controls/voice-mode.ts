/**
 * When somebody's microphone is actually live.
 *
 * Two modes, and the words name what *opens* the mic rather than whether one
 * exists, because that is the choice being made:
 *
 * - `'push'` is the mic that opens while a key is held. Nothing leaves the
 *   device the rest of the time. It is the mode for a room somebody else is
 *   also sitting in, for a mechanical keyboard, for a person who does not want
 *   to think about whether they are audible.
 * - `'open'` is the mic that is simply on once switched on, and voice falls off
 *   with distance the way it does in a room. It is what makes a lounge feel
 *   like a place rather than a radio net - you drift toward somebody and you
 *   are talking to them.
 *
 * Kept per device, exactly like `./camera-mode` and `./hand`, and here the
 * argument is sharper than either: this is a fact about the room the hardware
 * is in. Open mic on headphones at home is not open mic on the laptop in a
 * shared office, and a value that followed somebody between the two would be
 * wrong in one of them every time - in the direction that broadcasts a private
 * conversation.
 *
 * Neither mode is a mute. Whether there is a microphone at all is a separate
 * switch in the HUD, off until pressed, and this only decides what pressing it
 * means.
 */
export type VoiceMode = 'push' | 'open'

export const VOICE_MODE_STORAGE_KEY = 'unkown.voice'

/**
 * Push to talk, and the default is not a toss-up.
 *
 * The two failures are not symmetric. Somebody who wanted open mic and got
 * push-to-talk holds a key down and is briefly annoyed. Somebody who wanted
 * push-to-talk and got open mic has broadcast whatever was happening in their
 * room to everybody standing near them, and finds out afterwards. Defaults
 * belong to the recoverable side of that.
 */
export const DEFAULT_VOICE_MODE: VoiceMode = 'push'

/**
 * The key that opens the mic in `'push'`.
 *
 * `T` for talk. Free in the lounge, which already spends W/A/S/D, Space,
 * Shift, E, R, G, H, V, O, L, F and Q - and specifically not `V`, which is
 * three keys from the movement hand and already means "view".
 */
export const PUSH_TO_TALK_KEY = 'KeyT'

/** Read anything at all and never throw. Not one of the two words means unset. */
export function parseVoiceMode(raw: unknown): VoiceMode | null {
  return raw === 'push' || raw === 'open' ? raw : null
}

export function loadVoiceMode(): VoiceMode | null {
  if (typeof window === 'undefined') return null

  try {
    return parseVoiceMode(window.localStorage.getItem(VOICE_MODE_STORAGE_KEY))
  } catch {
    // Safari's private mode, a full quota, a profile with site data blocked.
    // The player gets the default - which is the cautious one - and can flip it
    // again from the panel.
    return null
  }
}

export function saveVoiceMode(mode: VoiceMode): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(VOICE_MODE_STORAGE_KEY, mode)
  } catch {
    // The choice still applies for this session; it just will not survive the
    // reload, which is the honest failure here.
  }
}

/**
 * Whether the microphone should be sending, right now.
 *
 * The one rule the whole feature turns on, kept here as arithmetic so it can be
 * tested without a browser, a peer or a key event.
 *
 * Note what it is *not* allowed to depend on: whether anybody is listening.
 * A mic that opens when somebody walks near you is a mic that opened without
 * being asked.
 */
export function micIsLive({
  mode,
  enabled,
  pushing,
}: {
  mode: VoiceMode
  /** The switch in the HUD. Off means off, in both modes. */
  enabled: boolean
  /** The push-to-talk key is down. Meaningless in `'open'`. */
  pushing: boolean
}): boolean {
  if (!enabled) return false
  return mode === 'open' ? true : pushing
}
