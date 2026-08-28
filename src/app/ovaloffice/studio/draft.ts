'use client'

/**
 * The document an editor is holding, parked where a reload can find it.
 *
 * ---------------------------------------------------------------------------
 * What this is for
 * ---------------------------------------------------------------------------
 * Both studios keep their document in the address bar, and both write it there
 * on a 300ms debounce because a slider drag is a few hundred state updates.
 * That leaves a window - the last edit, and everything since the last tick - in
 * React state and nowhere else. Anything that rebuilds the page inside that
 * window takes those edits with it, and the editor comes back holding whatever
 * the URL said, which reads as the app undoing what you just did. "I set the
 * length to sixteen and it went back to eight" was exactly this window.
 *
 * The page being rebuilt under an editor is not hypothetical and not always a
 * bug: a deploy makes every open tab reload on its next navigation, by design
 * (see NEXT_DEPLOYMENT_ID in the Dockerfile). So the editor has to be able to
 * lose its React state without losing anybody's work.
 *
 * ---------------------------------------------------------------------------
 * Why it is keyed by the URL it continues from
 * ---------------------------------------------------------------------------
 * A parked draft is only ever restored over the *same* document it was parked
 * against: `url` is the encoded doc the address bar carried when the draft was
 * written, and a draft is offered back only when the page opens on that exact
 * address. So a rebuild - which re-renders the same URL - gets the newer draft,
 * and opening a different link gets the link, because you asked for it.
 *
 * `sessionStorage`, not `localStorage`. This is a scratch copy of one tab's
 * unsaved minute, not a document: two tabs on two shots must not share it, and
 * nothing here should outlive the tab that wrote it. Saving is what makes work
 * permanent, and this must not start looking like a second, worse way to save.
 */

/** One parked document, and the address it is a continuation of. */
interface Parked {
  url: string
  doc: unknown
}

/**
 * Park the current document against the address the editor last wrote.
 *
 * Every call, undebounced, which is the point - the debounce is what leaves the
 * hole this fills. It is one `JSON.stringify` of a few kilobytes on a state
 * change that already re-renders a 3D scene.
 *
 * Silent on failure. Storage is denied outright in some embedded browsers and
 * full in others, and neither is a reason to take an editor down.
 */
export function park(key: string, url: string, doc: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify({ url, doc } satisfies Parked))
  } catch {
    // No draft, then. Everything still works; a rebuild just costs the last
    // few hundred milliseconds, which is where this started.
  }
}

/**
 * The parked document, if it continues the address this page opened on.
 *
 * Returns raw JSON rather than a typed document: the caller has a parser for
 * its own shape (`parseShot`, `parseScene`) and those are the same clamps a
 * pasted link goes through. A draft is no more trustworthy than a URL.
 */
export function parked(key: string, url: string): unknown | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null

    const found = JSON.parse(raw) as Parked
    return found?.url === url ? (found.doc ?? null) : null
  } catch {
    return null
  }
}
