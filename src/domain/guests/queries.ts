import 'server-only'
import { type GuestLanding, guestLandingSpot } from '@/domain/guests/application'
import type { Client } from '@/es/store'

/**
 * Read side of the guest links and the people currently holding one.
 *
 * Every function takes an admin client, exactly as `access/queries.ts` does and
 * for the same reason: `guest_links` has no policy for anybody but a space
 * admin, and the two callers - the space's own settings panel and the
 * backoffice - have each already proved who is asking. That guard is the gate,
 * not this.
 */

export interface GuestLinkView {
  id: string
  token: string
  label: string | null
  /** NULL is the open link. */
  maxUses: number | null
  uses: number
  expiresAt: string | null
  revokedAt: string | null
  createdAt: string
  /** Does somebody inside have to let its holder in? */
  requiresKnock: boolean
  /** How many people this link let in who are still inside. */
  liveGuests: number
  /**
   * Where following it actually puts somebody.
   *
   * `room` carries the room's *name* rather than its slug when the space still
   * has that room, because the name is what the host called it and the slug is
   * an implementation detail they may never have seen. It falls back to the
   * slug rather than to null for a room that has since been closed: "into
   * standup" is still the truest thing that can be said about a link that was
   * made for it, and blanking the row would read as "goes to the lounge".
   */
  landing: GuestLanding
}

export interface GuestView {
  guestId: string
  displayName: string
  linkId: string | null
  joinedAt: string
  expiresAt: string
}

/**
 * Somebody standing at the door, waiting to be let in.
 *
 * Carries the avatar as well as the name, which the guest list does not, and
 * for a reason worth stating: this is the only thing the person deciding has to
 * go on. A row saying "Sam wants to come in" is not a decision anybody can
 * make; the animal they chose at least makes them the specific stranger who is
 * about to be in the room.
 */
export interface KnockView {
  guestId: string
  displayName: string
  avatar: string | null
  /** When they knocked. */
  knockedAt: string
  /** When the knock lapses, so the rail can stop offering a dead button. */
  expiresAt: string
}

/**
 * Every link for one space, newest first.
 *
 * Revoked and expired links are returned rather than filtered out. The list is
 * the answer to "who did I give access to", and a link that vanishes when it
 * dies takes that answer with it - the same argument the invite list makes for
 * revoking rather than deleting.
 */
export async function listGuestLinks(
  admin: Client,
  tenantId: string,
  slug: string,
  limit = 100,
): Promise<GuestLinkView[]> {
  const { data, error } = await admin
    .from('guest_links')
    .select(
      'id, token, label, max_uses, uses, expires_at, revoked_at, created_at, requires_knock, destination',
    )
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`Failed to load guest links: ${error.message}`)

  const links = data ?? []
  if (links.length === 0) return []

  // One query for the occupancy of every link, rather than one per link. The
  // count is per-link and live, which is what makes "revoke this link" show
  // its consequence - three people are about to be shown the door - before it
  // is clicked.
  //
  // Present rather than admitted, through the same function `listGuests` and
  // the cap both read. "Revoking this shows three people the door" has to mean
  // three people who are here; counted by admission it claimed a crowd that had
  // gone home, which made revoking look far more destructive than it was.
  const { data: guests, error: guestError } = await admin.rpc('tenant_guests_present', {
    p_tenant_id: tenantId,
  })

  if (guestError) throw new Error(`Failed to count guests: ${guestError.message}`)

  const live = new Map<string, number>()
  for (const row of guests ?? []) {
    if (!row.link_id) continue
    live.set(row.link_id, (live.get(row.link_id) ?? 0) + 1)
  }

  const landings = links.map((row) => guestLandingSpot(row.destination, slug))

  /**
   * The names of the rooms these links point into, in one query or none.
   *
   * Skipped entirely when no link names a room, which is the common case - most
   * links are made from the lounge - so the list pays for this only when it has
   * something to show for it. Closed rooms are read too: a link into a room that
   * has since been shut still points there, and the row saying so is how the
   * host works out why their visitor is landing somewhere empty.
   */
  const roomSlugs = [
    ...new Set(landings.flatMap((spot) => (spot.kind === 'room' && spot.ref ? [spot.ref] : []))),
  ]

  const names = new Map<string, string>()
  if (roomSlugs.length > 0) {
    const { data: rooms, error: roomError } = await admin
      .from('rooms_read_model')
      .select('slug, name')
      .eq('tenant_id', tenantId)
      .in('slug', roomSlugs)

    if (roomError) throw new Error(`Failed to load rooms: ${roomError.message}`)

    for (const room of rooms ?? []) names.set(room.slug, room.name)
  }

  /**
   * And the names of the matches, the same way and for a stronger reason.
   *
   * A room link at least says which room in the address; a match link said
   * nothing but "A match", so a host who had opened three fights in an evening
   * had three identical rows and no way to tell which link went to which. The
   * name is what they called the fight, which is the only handle anybody has on
   * it - the id is a uuid and the level behind it is not what they were
   * choosing between.
   *
   * Read across statuses on purpose. A match that has ended still has links
   * pointing at it until the sweep takes them back, and "Finals" is a truer
   * row than "A match" for the whole of that window.
   */
  const battleIds = [
    ...new Set(landings.flatMap((spot) => (spot.kind === 'match' && spot.ref ? [spot.ref] : []))),
  ]

  if (battleIds.length > 0) {
    const { data: battles, error: battleError } = await admin
      .from('battles_read_model')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .in('id', battleIds)

    if (battleError) throw new Error(`Failed to load matches: ${battleError.message}`)

    for (const battle of battles ?? []) names.set(battle.id, battle.name)
  }

  return links.map((row, index) => {
    const spot = landings[index]

    return {
      id: row.id,
      token: row.token,
      label: row.label,
      maxUses: row.max_uses,
      uses: row.uses,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      createdAt: row.created_at,
      requiresKnock: row.requires_knock === true,
      liveGuests: live.get(row.id) ?? 0,
      // The name if one was found, and the category word if not - which is
      // what `guestLandingLabel` falls back to. A room that has been closed and
      // a match that has been swept keep their link and lose their name.
      landing: spot.ref ? { ...spot, name: names.get(spot.ref) ?? null } : spot,
    }
  })
}

/**
 * Who is waiting at this space's door right now, longest first.
 *
 * Oldest first rather than newest, which is the opposite of every other list in
 * this file and is the point: this is a queue of people being kept waiting, and
 * the one who has waited longest is the one to answer.
 *
 * Takes an admin client like its neighbours, though unusually it would not have
 * to - `tenant_guests_select_visible` lets a member read their own space's rows.
 * It is kept consistent with the rest of the file so that the guard is always
 * the caller's role check in the action and never the client that happened to
 * be passed in.
 */
export async function listKnocks(
  admin: Client,
  tenantId: string,
): Promise<KnockView[]> {
  const { data, error } = await admin
    .from('tenant_guests')
    .select('guest_id, display_name, avatar, joined_at, expires_at')
    .eq('tenant_id', tenantId)
    .is('admitted_at', null)
    // Lapsed knocks are excluded here rather than left to the reaper, so this
    // agrees with what the door will accept. Offering "let them in" for
    // somebody whose knock has already died is a button that reports success
    // and changes nothing.
    .gt('expires_at', new Date().toISOString())
    .order('joined_at', { ascending: true })

  if (error) throw new Error(`Failed to load knocks: ${error.message}`)

  return (data ?? []).map((row) => ({
    guestId: row.guest_id,
    displayName: row.display_name,
    avatar: row.avatar,
    knockedAt: row.joined_at,
    expiresAt: row.expires_at,
  }))
}

/**
 * Who is in the space right now on a guest pass.
 *
 * `tenant_guests_present` rather than a query over `tenant_guests`, and that is
 * the whole of it: an admission lasts twelve hours and a *seat* is held by
 * being here, so the two questions have different answers by the afternoon.
 * Asked the old way this list drew everybody who had looked in since breakfast,
 * with a Kick button beside each, over a cap that had already stopped counting
 * them - "8/8" on a space the door was standing open on. The only sensible
 * thing to do with that screen was kick eight people who had left.
 *
 * The rule is not restated here on purpose. `tenant_guest_count` is `count(*)`
 * over the same function, so the number at the door and the names in the rail
 * cannot disagree about who is in - see the migration for why that is worth a
 * function rather than a second copy of the clause.
 */
export async function listGuests(
  admin: Client,
  tenantId: string,
): Promise<GuestView[]> {
  const { data, error } = await admin
    .rpc('tenant_guests_present', { p_tenant_id: tenantId })
    .order('joined_at', { ascending: false })

  if (error) throw new Error(`Failed to load guests: ${error.message}`)

  return (data ?? []).map((row) => ({
    guestId: row.guest_id,
    displayName: row.display_name,
    linkId: row.link_id,
    joinedAt: row.joined_at,
    expiresAt: row.expires_at,
  }))
}

/**
 * What to call somebody in a scene, guest or member.
 *
 * `readDisplayName` answers from `user_profiles`, which a guest has no row in -
 * they never signed up, so nothing ever wrote one. Asked directly it falls back
 * to a name derived from their uuid, which is why a guest who carefully typed
 * "Sam" at the door appeared over their own head as a string of hex.
 *
 * So the name is looked for where the guest actually put it. Members are
 * unaffected: they have a profile row, this finds no guest row, and the
 * original answer is returned unchanged.
 *
 * Runs under the caller's own client rather than the service role - the
 * `tenant_guests` select policy lets a guest read their own row, which is
 * exactly and only what this needs.
 */
export async function readSceneIdentity(
  supabase: Client,
  tenantId: string,
  userId: string,
  fallback: { name: string; avatar: string },
): Promise<{ name: string; avatar: string }> {
  const { data } = await supabase
    .from('tenant_guests')
    .select('display_name, avatar')
    .eq('tenant_id', tenantId)
    .eq('guest_id', userId)
    .maybeSingle()

  if (!data) return fallback

  return {
    name: data.display_name,
    // NULL when they skipped the picker, which the door makes hard to do but
    // an older row may predate the column. Falling through to the profile
    // answer keeps that row rendering something rather than nothing.
    avatar: data.avatar ?? fallback.avatar,
  }
}

/**
 * The destination on the link this guest was let in by, or null.
 *
 * The one function here that is *about* the caller rather than about a space
 * somebody administers, and it is deliberately built the way `lastSpacePath`
 * in domain/tenants/last-space builds the same lookup - the two are the same
 * question asked for two reasons, so they should not disagree.
 *
 * Two clients, on purpose. The admission row is read as the caller: the
 * `tenant_guests` select policy lets a guest read their own, which is the proof
 * that they were admitted at all. The link is then read through the service
 * role, because `guest_links` has no policy for anybody holding a session - the
 * rows carry live tokens - and only `destination` is selected, only for the id
 * already sitting on the caller's own admission row. Nothing comes back that
 * the caller did not already prove they were let in by.
 *
 * Null for a member, who has no admission row, and null for a guest whose link
 * said nothing. Callers treat both as "the lounge, and no rooms".
 */
export async function readGuestDestination(
  supabase: Client,
  admin: Client,
  tenantId: string,
  userId: string,
): Promise<string | null> {
  const { data: admission } = await supabase
    .from('tenant_guests')
    .select('link_id')
    .eq('tenant_id', tenantId)
    .eq('guest_id', userId)
    .maybeSingle()

  if (!admission?.link_id) return null

  const { data: link } = await admin
    .from('guest_links')
    .select('destination')
    .eq('id', admission.link_id)
    .maybeSingle()

  return link?.destination ?? null
}

/**
 * A backoffice row for a guest link, with the space it belongs to.
 *
 * `tokenPreview` and *not* `token`: this list spans every space on the
 * installation, and the operator page only ever renders the first characters
 * of a token to tell two rows apart. Shipping the whole 43-character secret to
 * that browser - two hundred working links across every customer's space, in
 * one RSC payload that any screenshot or extension can lift - is a worse
 * outcome than an admin having to open the space to copy a link. So the full
 * token never leaves this function; the preview is computed here, server-side.
 */
export type AdminGuestLinkRow = Omit<GuestLinkView, 'token'> & {
  tenantId: string
  /** The first eight characters of the token. Enough to match a row against a
   *  link pasted in a support thread; not enough to open a door. */
  tokenPreview: string
}

/** Every link across every space, for the backoffice. Newest first. */
export async function listAllGuestLinks(
  admin: Client,
  limit = 200,
): Promise<AdminGuestLinkRow[]> {
  const { data, error } = await admin
    .from('guest_links')
    .select(
      'id, tenant_id, token, label, max_uses, uses, expires_at, revoked_at, created_at, requires_knock, destination',
    )
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`Failed to load guest links: ${error.message}`)

  /**
   * The slugs of the spaces these links belong to, which is what confines a
   * destination - a link is described by where it would actually land somebody,
   * and that question cannot be answered without knowing whose space it is.
   *
   * One query for the distinct set. The page above this makes a similar one for
   * the *names*, and the two are deliberately not merged: a query here that
   * existed to fill in a column of one page is how a shared reader stops being
   * shared.
   */
  const rows = data ?? []
  const tenantIds = [...new Set(rows.map((row) => row.tenant_id))]

  const { data: tenants } = tenantIds.length
    ? await admin.from('tenants_read_model').select('id, slug').in('id', tenantIds)
    : { data: [] }

  const slugs = new Map((tenants ?? []).map((row) => [row.id, row.slug]))

  return rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    tokenPreview: row.token.slice(0, 8),
    label: row.label,
    maxUses: row.max_uses,
    uses: row.uses,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    requiresKnock: row.requires_knock === true,
    // Deliberately not counted across every space - it would be a second query
    // per row on a page that lists two hundred. The per-space panel is where
    // occupancy is actually acted on.
    liveGuests: 0,
    // The room's slug rather than its name, unlike the per-space list. Resolving
    // names would be one query per space on a page that spans all of them, and
    // an operator reading a backoffice table is somebody slugs are written for.
    landing: guestLandingSpot(row.destination, slugs.get(row.tenant_id) ?? ''),
  }))
}
