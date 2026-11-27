/**
 * The way a document gets from the studio back to the page that opened it.
 *
 * ---------------------------------------------------------------------------
 * A slot in local storage, and the browser's own event
 * ---------------------------------------------------------------------------
 * A scene block sits inside an episode that saves as you type. Sending
 * somebody to a full-page studio and expecting them to come *back* through the
 * same tab means unloading a document mid-edit and hoping the debounced save
 * won the race - so the studio opens in a tab of its own, and the episode is
 * still sitting there, unsaved minute intact, when the shot comes home.
 *
 * Which leaves the question of how a second tab hands something to the first.
 * `localStorage` answers it exactly: a write in one tab fires `storage` in
 * every other tab on the origin, with the key and the new value on it. No
 * server, no polling, no `window.opener` - which is null the moment anything
 * in the chain opens with `noopener`, and is the thing a popup blocker takes
 * away first.
 *
 * `sessionStorage` is not an option even though it looks like the tidier one:
 * a new tab inherits a *copy* of it, and writes after that go nowhere.
 *
 * ---------------------------------------------------------------------------
 * The slot is named by the page, not by the studio
 * ---------------------------------------------------------------------------
 * The scene block invents the id, puts it in the studio's address as `back`,
 * and listens on it. So the studio never has to know what a scene is - it
 * knows that somebody is waiting on a slot - and the same handoff works for
 * the next thing that wants to send a shot somewhere.
 *
 * The document travels encoded, the same base64url a shot travels in a URL as,
 * because whatever comes out of storage is no more trustworthy than a pasted
 * link and `decodeShot` is the clamp both go through.
 */

/** The query parameter that says somebody is waiting. */
export const BACK_PARAM = 'back'

/** How long a slot is worth reading. See `collect`. */
const FRESH_MS = 12 * 60 * 60 * 1000

function key(id: string): string {
  return `kxb.studio.handoff:${id}`
}

/**
 * Whether a `back` value is one we are willing to make a storage key out of.
 *
 * It arrives from a URL, and a URL is somebody else's text. Ids are made with
 * `crypto.randomUUID`, so this is the shape of one of those and nothing else -
 * a link cannot then name a storage key that belongs to another feature.
 */
export function backSlot(value: string | null | undefined): string | null {
  if (!value) return null
  return /^[a-zA-Z0-9-]{8,64}$/.test(value) ? value : null
}

/** What the studio writes when somebody presses "send back". */
export function sendBack(id: string, document: string): boolean {
  try {
    localStorage.setItem(key(id), JSON.stringify({ document, at: Date.now() }))
    return true
  } catch {
    // Storage denied - a private window, a browser with site data off. The
    // studio says so rather than pretending the shot went home; see
    // `SendBack`, which offers the link as the way out instead.
    return false
  }
}

/**
 * The document waiting in a slot, taken out of it.
 *
 * Reading clears, because a slot is a delivery and not a copy: leaving it
 * behind would mean the same shot arriving again on the next reload of a page
 * that has already applied it.
 *
 * Stale slots are dropped rather than delivered. Twelve hours is long enough
 * for somebody to go to lunch in the middle of staging a scene and short
 * enough that a tab left open overnight does not greet them with a version
 * they had forgotten they sent.
 */
export function collect(id: string): string | null {
  try {
    const raw = localStorage.getItem(key(id))
    if (!raw) return null
    localStorage.removeItem(key(id))

    const found = JSON.parse(raw) as { document?: unknown; at?: unknown }
    if (typeof found?.document !== 'string') return null
    if (typeof found.at === 'number' && Date.now() - found.at > FRESH_MS) return null
    return found.document
  } catch {
    return null
  }
}

/** Whether a `storage` event is this slot's. A null key is storage being cleared. */
export function isSlot(eventKey: string | null, id: string): boolean {
  return eventKey === key(id)
}
