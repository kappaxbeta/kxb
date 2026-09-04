/**
 * The event vocabulary, and the funnels built out of it.
 *
 * Pure and client-importable, like `campaign.ts` and `experiment.ts`, because
 * the thing that fires an event is a button in a Client Component and the thing
 * that reports on it is a server page.
 *
 * ---------------------------------------------------------------------------
 * A fixed vocabulary, and why it is worth the friction
 * ---------------------------------------------------------------------------
 * Free event names are how an events table stops being queryable inside a
 * month: `cta_click`, `ctaClick` and `cta-click` become three rows for one
 * thing, and the funnel that counts two of them is wrong in the one way nobody
 * notices - it still returns a number.
 *
 * So a name has to be in this list. The cost is that a new event is a pull
 * request; the payoff is that every funnel below is guaranteed to refer to
 * something that exists, and the report has no long tail of typos and probes in
 * it. This is the same argument `WORLD_TAGS` makes about a closed tag list, and
 * it holds harder here because the input arrives from a `fetch` anybody can
 * forge.
 *
 * ---------------------------------------------------------------------------
 * What must never be in `props`
 * ---------------------------------------------------------------------------
 * Never anything a person typed, and never anything identifying: no names, no
 * email addresses, no message text, no search terms, no ids of other people. An
 * event says *what kind of thing happened*, and the props say *which control it
 * was*. `sanitiseProps` enforces the shape - short keys, short scalar values,
 * few of them - but it cannot enforce the meaning, so that is a rule for
 * whoever adds the call site.
 */

export interface EventDefinition {
  name: string
  /** What it means, for the report and for whoever is deciding to fire it. */
  hint: string
}

/**
 * Everything that may be recorded.
 *
 * Grouped by the journey they belong to rather than alphabetically, because the
 * order below is the order they happen in and that is the useful reading.
 */
export const EVENTS: EventDefinition[] = [
  // --- the way in ---------------------------------------------------------
  { name: 'cta_click', hint: 'A call to action on a marketing page. `props.id` says which.' },
  { name: 'demo_open', hint: 'The demo world was opened.' },
  { name: 'demo_join_click', hint: 'The demo’s own “make a space” button.' },
  { name: 'signup_start', hint: 'The sign-up form was opened.' },
  { name: 'signup_complete', hint: 'An account now exists.' },
  { name: 'promo_redeem', hint: 'An invite code was accepted.' },

  // --- the first room -----------------------------------------------------
  { name: 'space_create', hint: 'A space was made.' },
  { name: 'guest_link_create', hint: 'A guest link was minted.' },
  { name: 'guest_enter', hint: 'Somebody walked in on a guest link.' },
  { name: 'lounge_enter', hint: 'A lounge canvas finished loading and is being stood in.' },

  // --- doing something once inside ----------------------------------------
  { name: 'block_place', hint: 'A block went down. Sampled, not one per block - see the caller.' },
  { name: 'emote_send', hint: 'A face was pulled.' },
  { name: 'chat_send', hint: 'A message was sent. Never the text.' },
  { name: 'battle_create', hint: 'A match was set up.' },
  { name: 'battle_join', hint: 'Somebody joined a match lobby.' },
  { name: 'battle_start', hint: 'A match kicked off.' },

  // --- reading the book ---------------------------------------------------
  // Two halves of one question: how many people take the book away, and how
  // many of the ones who start a chapter on the site actually finish it. The
  // second is the interesting one and it is the one a page-view count cannot
  // answer - an episode opened and abandoned in the first screen looks exactly
  // like an episode read to the last line.
  { name: 'oasis_download', hint: 'The book PDF was downloaded. `props.lang` says which edition.' },
  { name: 'oasis_chapter_end', hint: 'A chapter was scrolled to its last line. `props.slug` says which. Once per page view.' },

  // --- money --------------------------------------------------------------
  { name: 'pricing_view', hint: 'The pricing section came into view.' },
  { name: 'checkout_start', hint: 'Checkout was opened.' },
  { name: 'checkout_complete', hint: 'A subscription now exists.' },
]

const NAMES = new Set(EVENTS.map((event) => event.name))

export function isEventName(value: unknown): value is string {
  return typeof value === 'string' && NAMES.has(value)
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** How many keys one event may carry, and how long each part may be. */
export const MAX_PROP_KEYS = 6
export const MAX_PROP_KEY_LENGTH = 32
export const MAX_PROP_VALUE_LENGTH = 64

export type PropValue = string | number | boolean

/**
 * Whatever arrived, as props worth storing.
 *
 * Dropped rather than rejected, key by key, for the reason `normaliseTags`
 * gives: this is telemetry, and losing a label is better than losing the event
 * it was attached to. Objects and arrays are refused outright - the moment a
 * nested value is allowed, somebody posts a session into it.
 */
export function sanitiseProps(raw: unknown): Record<string, PropValue> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}

  const out: Record<string, PropValue> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_PROP_KEYS) break
    if (!/^[a-z][a-z0-9_]{0,31}$/.test(key) || key.length > MAX_PROP_KEY_LENGTH) continue

    if (typeof value === 'boolean') out[key] = value
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value
    else if (typeof value === 'string' && value.length <= MAX_PROP_VALUE_LENGTH) out[key] = value
  }
  return out
}

// ---------------------------------------------------------------------------
// Funnels
// ---------------------------------------------------------------------------

export interface Funnel {
  id: string
  label: string
  /**
   * The steps, in order.
   *
   * A step is satisfied by *any* of its names, which is what lets "arrived"
   * mean either of two doors without the funnel growing a branch. Counting is
   * per visitor per day and order-insensitive within the window - see the note
   * in the migration about why the window is a day.
   */
  steps: { label: string; names: string[] }[]
}

export const FUNNELS: Funnel[] = [
  {
    id: 'stranger-to-space',
    label: 'Stranger → space',
    steps: [
      { label: 'Clicked a CTA', names: ['cta_click'] },
      { label: 'Opened the demo', names: ['demo_open'] },
      { label: 'Asked for an account', names: ['demo_join_click', 'signup_start'] },
      { label: 'Signed up', names: ['signup_complete'] },
      { label: 'Made a space', names: ['space_create'] },
    ],
  },
  {
    id: 'space-to-crowd',
    label: 'Space → a crowd in it',
    steps: [
      { label: 'Made a space', names: ['space_create'] },
      { label: 'Minted a link', names: ['guest_link_create'] },
      { label: 'Somebody walked in', names: ['guest_enter'] },
      { label: 'Played something', names: ['battle_create', 'battle_join'] },
    ],
  },
  {
    id: 'to-paid',
    label: 'Interest → paid',
    steps: [
      { label: 'Saw the price', names: ['pricing_view'] },
      { label: 'Opened checkout', names: ['checkout_start'] },
      { label: 'Subscribed', names: ['checkout_complete'] },
    ],
  },
]

export function funnelById(id: string): Funnel | undefined {
  return FUNNELS.find((funnel) => funnel.id === id)
}
