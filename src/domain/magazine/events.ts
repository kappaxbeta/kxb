import { uuidv5 } from '@/lib/uuid'
import type { DomainEvent } from '@/es/types'

/**
 * A space's own shelf of XPs.
 *
 * `docs/product/pricing.md` §3. The path from "an XP exists" to "we are playing
 * it" used to run straight from the public catalogue through a wizard into a
 * room; this is the shelf in the middle that belongs to the space. Taking one in
 * is free and unlimited on every tier, including free - which is the whole shape
 * of the funnel, because free holds no xp places and no projects, so somebody
 * can collect everything there is and play none of it. The wall lands on
 * *loading* one, when they already want it.
 *
 * ---------------------------------------------------------------------------
 * The verbs are deliberately plain
 * ---------------------------------------------------------------------------
 * `XpTakenIn` and `XpPutBack`, not `XpOrdered` and `XpReturned`. Which metaphor
 * the interface speaks - a games magazine you order from, or a rack you shelve
 * into - is an A/B test that cannot run until this exists, and an event name is
 * the one thing in the system that cannot be changed afterwards. So the log
 * stays in words that are true under either reading, and the surface picks.
 */

export type XpTakenIn = DomainEvent<
  'XpTakenIn',
  {
    /** The reference, in the shared `parseXpRef` format - builtin or project. */
    xpRef: string
    /** What it was called when it was taken in, so a list needs no join. */
    name: string
  }
>

export type XpPutBack = DomainEvent<'XpPutBack', { xpRef: string }>

/**
 * The shelf was told to take new versions without asking, or to stop.
 *
 * On the magazine's own stream rather than in a settings table of its own,
 * because it changes what every `XpTakenIn` after it *means*. "Who turned this
 * on, and when did these six levels start moving on their own" is one question,
 * and the log is where it already has an answer.
 */
export type ShelfFollowSet = DomainEvent<'ShelfFollowSet', { on: boolean }>

export type MagazineEvent = XpTakenIn | XpPutBack | ShelfFollowSet

export const MAGAZINE_STREAM_TYPE = 'magazine'

export const MAGAZINE_EVENT_LABELS: Record<MagazineEvent['type'], string> = {
  XpTakenIn: 'took in',
  XpPutBack: 'put back',
  ShelfFollowSet: 'changed how the shelf follows',
}

/**
 * One stream per space, derived rather than stored.
 *
 * The same trick and the same reason as `subscriptionStreamId`: it cannot
 * simply *be* the tenant id, because `append_events()` checks versions with
 * `max(version) where stream_id = ?`, so two stream types sharing an id would
 * share one version sequence and collide on every write.
 *
 * One stream for the whole shelf rather than one per entry, unlike rooms or
 * pages. A magazine is a collection and its rules are about the collection -
 * "is this already in" is the only invariant there is, and it cannot be decided
 * by folding a single entry's stream.
 */
const MAGAZINE_NAMESPACE = 'c7a1e40b-5d92-4f3c-8b16-9e2f4a7d1c53'

export function magazineStreamId(tenantId: string): string {
  return uuidv5(tenantId, MAGAZINE_NAMESPACE)
}
