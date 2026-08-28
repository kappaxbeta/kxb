/**
 * Which way round the on-screen controls go.
 *
 * The value names the *dominant* hand, not the corner the stick sits in, and
 * that is the distinction the whole feature turns on. "Right" is the layout
 * every console has shipped for thirty years - steer with the left thumb, act
 * with the right - so a right-handed player's dominant thumb is the one doing
 * the interesting work. "Left" mirrors it. Naming the constant after the corner
 * instead would have meant every caller doing that translation itself, and
 * getting it wrong in one of them.
 *
 * Kept per device rather than on the profile, for the same reason the audio
 * preferences are (see `@/lib/audio/prefs`): this is a fact about the glass in
 * somebody's hands, and the same person on a phone and on a tablet propped on a
 * desk may well want two different answers. It is also why nothing here is an
 * event - a workspace has no interest in which thumb you steer with.
 *
 * ---------------------------------------------------------------------------
 * Why "not chosen" is a value and not just the default
 * ---------------------------------------------------------------------------
 * `loadHand` returns `null` for somebody who has never been asked, which is a
 * different thing from somebody who has been asked and said "right". The scenes
 * need to tell those apart: the first one gets the question, and the second one
 * must never see it again. Collapsing them into a plain default would mean
 * either asking everybody on every visit or asking nobody at all.
 */
export type Hand = 'left' | 'right'

export const HAND_STORAGE_KEY = 'unkown.hand'

/**
 * What an unanswered layout looks like.
 *
 * Right, because it is both the commoner hand and the layout anyone who has
 * held a controller already has in their thumbs. A player who never answers the
 * question still gets the arrangement they expect.
 */
export const DEFAULT_HAND: Hand = 'right'

/**
 * Read whatever is in storage, and never throw.
 *
 * Anything that is not one of the two words is `null` - which is to say, treated
 * as never answered rather than as an error. The value lives in the visitor's
 * own browser, where it may have been hand-edited, written by an older build, or
 * truncated; the worst this costs is one extra question.
 */
export function parseHand(raw: unknown): Hand | null {
  return raw === 'left' || raw === 'right' ? raw : null
}

/**
 * Stored as the bare word rather than as JSON.
 *
 * There is one field and it has two values. Wrapping it in an object buys the
 * room to grow that a boolean-shaped preference does not need, at the price of a
 * parse step that can fail - and `parseHand` above is then doing two jobs, only
 * one of which is about hands.
 */
export function loadHand(): Hand | null {
  if (typeof window === 'undefined') return null

  try {
    return parseHand(window.localStorage.getItem(HAND_STORAGE_KEY))
  } catch {
    // Storage can throw rather than return null - Safari's private mode, a full
    // quota, a profile with site data blocked. None of those are worth a broken
    // scene over; the player gets the default layout and can flip it in the
    // controls panel for as long as the tab is open.
    return null
  }
}

export function saveHand(hand: Hand): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(HAND_STORAGE_KEY, hand)
  } catch {
    // Same reasons as above. The choice still applies for this session; it just
    // will not survive the reload, which is the honest failure here.
  }
}
