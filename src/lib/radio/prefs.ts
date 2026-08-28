/**
 * Whether this person, on this device, has agreed to hear the radio.
 *
 * The rule the feature is built around: an admin decides what is on, and every
 * listener decides whether they hear it. Nobody is played at. An admin pasting
 * a link must never be able to put sound through a stranger's speakers, and the
 * people most exposed to that are exactly the ones least able to act quickly -
 * somebody in an open-plan office, somebody on a call, somebody who opened the
 * tab an hour ago and forgot it.
 *
 * That is also why this is not merely the browser's autoplay gate. The gate
 * asks "has this person clicked anything on the page", and a click on the chat
 * box is an answer to a different question than "may I play you music".
 *
 * Per device rather than per account, for the reason the audio preferences give:
 * yes on headphones at home is not yes on the laptop in the meeting room, and a
 * value that followed somebody between the two would be wrong in one of them
 * every time.
 */
export type RadioConsent =
  /** Never been asked, or asked and deferred. The default, and what silence means. */
  | 'ask'
  /** Yes, and stop asking - subsequent tracks start on their own. */
  | 'on'
  /** No, and stop asking. Nothing plays and no prompt appears. */
  | 'off'

export interface RadioPrefs {
  consent: RadioConsent
  /**
   * The track a `no` referred to.
   *
   * "Not now" is deliberately about *this song* rather than about the radio, so
   * declining one track does not opt somebody out of the evening. Storing which
   * track was declined is what lets the next one ask again without the previous
   * refusal immediately re-prompting for the same thing - the difference
   * between a considerate feature and a dialog that will not go away.
   *
   * Turning it down for good is a different act with a different control: the
   * mute button, which sets `off` and is never asked again.
   */
  declined: string | null
}

export const DEFAULT_RADIO_PREFS: RadioPrefs = { consent: 'ask', declined: null }

export const RADIO_STORAGE_KEY = 'unkown.radio'

/**
 * Parse whatever was in storage, and never throw.
 *
 * Tolerant for the reason `parsePrefs` next door is, plus one specific to this
 * value: the failure mode of a malformed record must be silence. Anything
 * unrecognisable falls back to `ask`, so a corrupt key cannot be the thing that
 * decides somebody consented.
 */
export function parseRadioPrefs(raw: unknown): RadioPrefs {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_RADIO_PREFS

  const source = raw as Partial<Record<keyof RadioPrefs, unknown>>
  const consent =
    source.consent === 'on' || source.consent === 'off' ? source.consent : 'ask'

  return {
    consent,
    declined: typeof source.declined === 'string' ? source.declined : null,
  }
}

/**
 * Should this browser be playing the radio right now?
 *
 * The whole consent rule in one expression, so the dock and the prompt cannot
 * disagree about it - they ask this and its sibling below rather than reasoning
 * about the fields themselves.
 */
export function mayPlay(prefs: RadioPrefs): boolean {
  return prefs.consent === 'on'
}

/**
 * Should this browser be *offering* to play it?
 *
 * Only when there is something on, only when they have not settled the question
 * either way, and only when the thing on offer is not the one they just turned
 * down. A prompt for a track somebody has already declined is the same prompt
 * again, and re-asking is how a considerate feature becomes a nagging one.
 */
export function shouldAsk(prefs: RadioPrefs, trackUrl: string | null): boolean {
  if (trackUrl === null) return false
  return prefs.consent === 'ask' && prefs.declined !== trackUrl
}

export function loadRadioPrefs(): RadioPrefs {
  if (typeof window === 'undefined') return DEFAULT_RADIO_PREFS

  try {
    const stored = window.localStorage.getItem(RADIO_STORAGE_KEY)
    if (!stored) return DEFAULT_RADIO_PREFS
    return parseRadioPrefs(JSON.parse(stored))
  } catch {
    // Storage can throw rather than return null - Safari's private mode, a full
    // quota, site data blocked. None of those are worth a broken page, and all
    // of them land on `ask`, which is the safe direction.
    return DEFAULT_RADIO_PREFS
  }
}

export function saveRadioPrefs(prefs: RadioPrefs): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(RADIO_STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // The choice still holds for this session; it just will not survive the
    // reload, and the reload asks again. That is the honest failure here -
    // erring towards asking rather than towards playing.
  }
}
