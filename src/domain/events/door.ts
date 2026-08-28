import 'server-only'
import { linkProblem } from '@/domain/guests/application'
import { eventPhase, type EventLink, type EventView } from '@/domain/events/queries'
import { parseHero } from '@/domain/studio/hero'
import type { Client } from '@/es/store'

/**
 * What an event shows to somebody who is not signed in.
 *
 * This module is the whole public disclosure, deliberately in one file. Every
 * other read of `event_spaces` goes through the caller's own client and lets
 * the select policy answer - which admits people with a role in the space and
 * nobody else, guests included, and is exactly right for the banner rendered
 * above a room somebody is standing in.
 *
 * A visitor at the front door has no role and never will until they click, so
 * that policy answers "nothing" for them. The alternative was an `anon` policy
 * on the table, which would make the whole row public in order to publish four
 * fields of it, and would have to stay correct as columns are added - the next
 * one being some cap the host would rather nobody knew.
 *
 * So the public pages read through the service role, in these two functions,
 * and what a stranger can see is the shape of `EventDoorView` below. That is a
 * decision a reviewer can check by reading one type.
 *
 * ---------------------------------------------------------------------------
 * What is knowingly given away
 * ---------------------------------------------------------------------------
 *   * That a space with this slug is running an event, and its name. This is
 *     the point: the door exists to be sent to people.
 *   * When it opens and closes, and whatever the host wrote in the header -
 *     which they wrote to be read by everybody who walks in.
 *   * A live guest token, when the host has attached one. The token is the
 *     invitation, and putting it on a page that search engines can reach is a
 *     real decision - see `noindex` on the door page, and note that the host
 *     chooses *which* link, so it can be one with a use count and an expiry.
 *
 * What is not: the guest-write matrix, the room caps, the operator's note, the
 * banner's document, who composed it, or whether the space has other links.
 */

export interface EventDoorCta {
  /** The button's copy, from the banner the host composed. */
  label: string
  /** `/g/<token>`, ready to be an href. */
  href: string
  /**
   * Whether the link still admits anybody.
   *
   * Checked here rather than left to `/g/[token]`, because a door offering a
   * button that answers "that link is not valid any more" is worse than a door
   * that says the event is not taking visitors: the first reads as broken and
   * the second reads as closed.
   */
  live: boolean
  /** Does somebody inside have to let them in? Worth saying before they click. */
  knock: boolean
}

export interface EventDoorBanner {
  /**
   * The banner's id, which is also its picture: `/api/event-banners/<id>`.
   *
   * The id rather than the `uploads` slug, because the public route's whole
   * authorization is "this banner is attached to an event" and that is a
   * question about the banner, not about the file.
   */
  id: string
  /**
   * The frame's pixel size, off the document.
   *
   * Carried so the page can reserve the space before the picture arrives. A
   * banner is the first and largest thing on the door, and a door that reflows
   * when it loads is one where somebody's thumb lands on the wrong thing.
   */
  width: number
  height: number
}

export interface EventDoorView {
  slug: string
  name: string
  phase: EventView['phase']
  opensAt: string
  closesAt: string
  headline: string | null
  blurb: string | null
  links: EventLink[]
  banner: EventDoorBanner | null
  cta: EventDoorCta | null
}

/**
 * The rows behind a door, as PostgREST hands them back.
 *
 * Written out rather than inferred because the nested selects are the part of
 * this query worth reading: one round trip fetches the event, the space's name,
 * the banner's document and the guest link's state, and the alternative is four.
 */
type DoorRow = {
  tenant_id: string
  opens_at: string
  closes_at: string
  headline: string | null
  blurb: string | null
  links: unknown
  featured: boolean
  tenants_read_model: { name: string; slug: string; archived: boolean } | null
  event_banners: { id: string; document: unknown } | null
  guest_links: {
    token: string
    max_uses: number | null
    uses: number
    expires_at: string | null
    revoked_at: string | null
    requires_knock: boolean
  } | null
}

const SELECT =
  'tenant_id, opens_at, closes_at, headline, blurb, links, featured, ' +
  'tenants_read_model!inner(name, slug, archived), ' +
  'event_banners(id, document), ' +
  'guest_links(token, max_uses, uses, expires_at, revoked_at, requires_knock)'

/**
 * The links column, defended against being anything else.
 *
 * The same job `toLinks` does in `./queries`, and not imported from there
 * because that module is the members' read path and this one is the strangers'.
 * Twelve lines duplicated is a smaller thing than a shared helper that makes
 * the two paths look like one - the whole argument of this file is that they
 * are not.
 */
function toLinks(value: unknown): EventLink[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const { name, url } = entry as { name?: unknown; url?: unknown }
    if (typeof name !== 'string' || typeof url !== 'string') return []
    if (!name.trim() || !/^https?:\/\//i.test(url)) return []
    return [{ name, url }]
  })
}

function toDoor(row: DoorRow, now: Date): EventDoorView | null {
  const tenant = row.tenants_read_model
  // An archived space is one whose doors were deliberately shut. Whatever its
  // event row still says, there is nothing behind this door to walk into.
  if (!tenant || tenant.archived) return null

  // Parsed once: the button's copy and the frame's size both come out of it.
  const hero = row.event_banners ? parseHero(row.event_banners.document) : null

  const link = row.guest_links
  const cta: EventDoorCta | null = link
    ? {
        // The composer's own copy, falling back to the plainest true sentence.
        // A banner saved without a button still gets one here: the door's whole
        // job is to be walked through, and a door with no handle is a poster.
        label: hero?.cta?.label ?? 'Join as a guest',
        href: `/g/${link.token}`,
        live:
          linkProblem(
            {
              maxUses: link.max_uses,
              uses: link.uses,
              expiresAt: link.expires_at,
              revokedAt: link.revoked_at,
            },
            now,
          ) === null,
        knock: link.requires_knock,
      }
    : null

  return {
    slug: tenant.slug,
    name: tenant.name,
    phase: eventPhase(row.opens_at, row.closes_at, now),
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    headline: row.headline,
    blurb: row.blurb,
    links: toLinks(row.links),
    banner:
      row.event_banners && hero
        ? { id: row.event_banners.id, width: hero.width, height: hero.height }
        : null,
    cta,
  }
}

/**
 * The door for one space, or null when there is not one.
 *
 * Null covers three different things on purpose - no such space, a space that
 * is not an event, and an archived one - because the page above turns all three
 * into the same login form. Which of them it was is information about spaces
 * the visitor cannot see, and it is the same information `requireTenant` is
 * careful not to leak to a non-member.
 *
 * Takes the service-role client. The caller is a public page, so there is
 * nobody to prove anything about; the guard is that this returns a fixed shape
 * rather than a row.
 */
export async function getEventDoor(
  admin: Client,
  slug: string,
  now: Date = new Date(),
): Promise<EventDoorView | null> {
  const { data, error } = await admin
    .from('event_spaces')
    .select(SELECT)
    .eq('tenants_read_model.slug', slug)
    .maybeSingle()

  if (error || !data) return null

  return toDoor(data as unknown as DoorRow, now)
}

/**
 * The events the backoffice has put on the front page.
 *
 * Only the ones with something to show. A featured event with no banner would
 * render as a name and a date in a band designed around a picture, which is the
 * kind of half-empty that makes a front page look unfinished - and the operator
 * who ticked the box has no way to see that from the backoffice. Requiring the
 * banner makes the tick a no-op until the host has composed one, which is the
 * failure mode that fixes itself.
 *
 * Ended events are dropped for the obvious reason. Upcoming ones are kept: an
 * event with a week to go is the best thing the front page can be advertising,
 * and the door it links to says "opens Friday" rather than pretending.
 */
export async function listFeaturedDoors(
  admin: Client,
  now: Date = new Date(),
): Promise<EventDoorView[]> {
  const { data, error } = await admin
    .from('event_spaces')
    .select(SELECT)
    .eq('featured', true)
    .not('banner_id', 'is', null)
    .gt('closes_at', now.toISOString())
    .order('closes_at', { ascending: true })

  // A failed read is a front page without a band, not a front page with a
  // stack trace on it. This is the least important thing on the page.
  if (error || !data) return []

  return (data as unknown as DoorRow[])
    .map((row) => toDoor(row, now))
    .filter((door): door is EventDoorView => door !== null && door.banner !== null)
}
