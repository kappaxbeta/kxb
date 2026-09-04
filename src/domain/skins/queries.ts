import 'server-only'
import type { Client } from '@/es/store'
import { resolveFeatures } from '@/domain/flags/queries'
import { DUMMY_LOOK } from '@/domain/lounge/avatars'
import { readAvatarHere, readShowXp } from '@/domain/profile/avatar-queries'
import type { ShopView, SkinView, VoucherView } from '@/domain/skins/application'

/**
 * Read side of the skins.
 *
 * `shopFor` is the one the shop page runs; the rest is backoffice reporting,
 * reading tables the policies only open to an admin. Nothing here mutates -
 * buying, redeeming and equipping are actions.
 */

type SkinRow = {
  id: string
  name: string
  tier: string
  price_cents: number
  voucher_cost: number
  backstory: string
  active: boolean
}

const toView = (row: SkinRow): SkinView => ({
  id: row.id,
  name: row.name,
  tier: row.tier === 'super' ? 'super' : 'skin',
  priceCents: row.price_cents,
  voucherCost: row.voucher_cost,
  backstory: row.backstory,
  active: row.active,
})

/**
 * The shelf, sorted the way the shop shows it: the money skins first, the
 * voucher ones after, alphabetical inside each - a stable order that does not
 * reshuffle under a browsing customer when a price changes.
 */
const shelfOrder = (a: SkinView, b: SkinView) =>
  a.tier === b.tier ? a.name.localeCompare(b.name) : a.tier === 'skin' ? -1 : 1

/**
 * Everything the shop needs for one person, signed-in or not.
 *
 * A signed-out browser gets the shelf and nothing personal - browsing before
 * you have an account is the whole point of a shop window. Retired skins stay
 * visible to somebody who owns them (their entitlement outlives the sale) and
 * disappear for everybody else.
 */
export async function shopFor(supabase: Client, userId: string | null): Promise<ShopView> {
  const [features, { data: skinRows }, owned, vouchers, chosen] = await Promise.all([
    resolveFeatures(supabase, null),
    supabase.from('skins').select('*'),
    userId
      ? supabase.from('skin_ownership').select('skin_id, via').eq('user_id', userId)
      : Promise.resolve({ data: [] }),
    userId
      ? supabase
          .from('skin_vouchers')
          .select('id, code, source, created_at')
          .eq('owner_id', userId)
          .is('spent_at', null)
          .order('created_at')
      : Promise.resolve({ data: [] }),
    userId
      ? supabase.from('profile_skins').select('model').eq('user_id', userId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const ownedMap: Record<string, string> = {}
  for (const row of owned.data ?? []) ownedMap[row.skin_id] = row.via

  const skins = ((skinRows ?? []) as SkinRow[])
    .map(toView)
    .filter((skin) => skin.active || ownedMap[skin.id])
    .sort(shelfOrder)

  return {
    open: features.skin_shop,
    skins,
    owned: ownedMap,
    vouchers: (vouchers.data ?? []).map(
      (v): VoucherView => ({
        id: v.id,
        code: v.code,
        source: v.source as VoucherView['source'],
        createdAt: v.created_at,
      }),
    ),
    chosen: chosen.data?.model ?? null,
    signedIn: userId !== null,
  }
}

/**
 * The skin this person has equipped, or null for the dummy.
 *
 * The one function an XP mount should call - the sibling of
 * `readAvatarHere`, and deliberately as forgiving: any failure is "no skin",
 * because a body must always resolve and the dummy is what a body is before
 * it is dressed. Ownership is not re-checked here; the write policy on
 * profile_skins is what guarantees a row was owned when it was written.
 */
export async function readProfileSkin(supabase: Client, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('profile_skins')
    .select('model')
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !data) return null
  return data.model
}

/**
 * The XP body this account owns, and whether this world is asked to draw it.
 *
 * Two answers rather than one, because they are two different things and
 * conflating them is what put a Knight in the lounge: `model` is *which* XP
 * body you have on - it is kept forever, changing it never touches the peep -
 * and `inLounge` is a per-world mode switch that says which of your two bodies
 * this player shows. Off by default, which is why a space draws a peep until
 * somebody asks it not to.
 *
 * Forgiving like `readProfileSkin`: no row is "no XP body, peep mode", which is
 * exactly what somebody who has never bought anything should get.
 */
export async function readXpBody(
  supabase: Client,
  userId: string,
): Promise<{ model: string | null; inLounge: boolean }> {
  /**
   * Two rows now, because the two halves live in two places and always should
   * have: the body is a skin you own, the mode is a fact about you. What forced
   * them apart is that `wearSkin(null)` *deletes* the skin row - so a mode kept
   * beside the model could not survive taking the model off, and taking it off
   * is how you ask to be the dummy.
   */
  const [skin, showXp] = await Promise.all([
    supabase.from('profile_skins').select('model').eq('user_id', userId).maybeSingle(),
    readShowXp(supabase, userId),
  ])

  return { model: skin.error ? null : (skin.data?.model ?? null), inLounge: showXp }
}

/**
 * The body somebody with no account stands in.
 *
 * The plain dummy, which is what every player is before they are anybody: a
 * qualified catalogue id, so the renderer draws it down the skinned path and
 * the presence channel carries it like any other look.
 *
 * The same constant the wardrobe offers as a body - see `DUMMY_LOOK`, which
 * this is the server's name for. One string, so a guest's dummy and a chosen
 * dummy cannot become two subtly different things.
 */
export const GUEST_LOOK = DUMMY_LOOK

/**
 * What this *person* stands in, account or not.
 *
 * Two rules, and the distinction is the account rather than the doorway:
 *
 *   * Nobody at all - an anonymous session through a guest link - is the
 *     dummy. A peep and a skin are both things an account holds, and a crowd
 *     of strangers in a room are not each other's wardrobes.
 *   * Somebody with an account gets what *they* chose, even when they are only
 *     a guest in this particular space. Being a visitor here says nothing
 *     about who you are; the look followed the account everywhere else and it
 *     should not stop at somebody else's door.
 */
export async function readLookFor(
  supabase: Client,
  user: { id: string; is_anonymous?: boolean } | null,
  tenantId: string | null = null,
): Promise<string> {
  if (!user || user.is_anonymous) return GUEST_LOOK
  return readLoungeLook(supabase, user.id, tenantId)
}

/**
 * What this person stands in *in the lounge*: their XP body if they asked to be
 * drawn as it, otherwise their peep.
 *
 * The lounge's own reader, separate from `readWornLook` above, because the two
 * answer different questions: an XP body is worn in the games by default and in
 * a room only on request. Returns whatever the presence channel and the
 * renderer both understand - a bare animal name, or a qualified catalogue id.
 *
 * **Two bodies and one switch**, and the switch is the only thing that decides.
 * There used to be a third answer wedged in the middle - `as_dummy`, a mannequin
 * you could put on your *peep* - and it was the same question asked twice: it
 * existed only because the mode was kept on the skin row, which vanishes when
 * the skin does, so somebody who owned nothing had no way to say "draw my XP
 * body". They do now. `?? GUEST_LOOK` is that sentence: an XP body with nothing
 * on it is the dummy, which is exactly what a player is in the games before
 * they are anybody, and what a visitor with no account is standing in already.
 *
 * Falls back to the peep whenever the mode is off, so a room always has a body
 * to draw and nothing changes for anybody who never asked.
 */
export async function readLoungeLook(
  supabase: Client,
  userId: string | null | undefined,
  tenantId: string | null = null,
): Promise<string> {
  const animal = await readAvatarHere(supabase, userId, tenantId)
  if (!userId) return animal

  if (!(await readShowXp(supabase, userId))) return animal

  return (await readProfileSkin(supabase, userId)) ?? GUEST_LOOK
}

/**
 * What this person's XP body wears: the equipped skin, else their animal.
 *
 * The one function an XP mount should call, so the precedence - a bought skin
 * outranks the animal, the animal outranks the dummy - is written down once
 * rather than at three call sites. Returns either a qualified catalogue id
 * (`adventurers/Knight`) or a bare animal name; `bodiesFor` tells them apart
 * by the slash.
 *
 * `tenantId` forwards to `readAvatarHere`, so a space's animal override still
 * applies to somebody with no skin equipped.
 */
export async function readWornLook(
  supabase: Client,
  userId: string,
  tenantId: string | null = null,
): Promise<string> {
  const skin = await readProfileSkin(supabase, userId)
  if (skin) return skin
  return readAvatarHere(supabase, userId, tenantId)
}

/**
 * The body to send into *this level*, which the level has a say in.
 *
 * `readWornLook` above answers "what is this person wearing"; this answers
 * "what should this person be in here", and the difference is that a document
 * can insist. A level about a room full of animals stays one when somebody buys
 * a Knight, and a level that casts everybody as knights is not asking.
 *
 * Resolved on the server rather than left to `bodiesFor`, because the two
 * bodies live in two rows and only one string reaches the client - the presence
 * channel carries what this returns, so every peer draws the same person the
 * same way. `bodiesFor` still applies the same rule to whatever it is handed;
 * this is what makes sure it is handed the right half in the first place.
 *
 * `wears` is `XpPlayer.wears` from the parsed document, or undefined for a
 * level that never said. Anything this function does not recognise - the older
 * names, and a model id the level casts everybody in - falls through to the
 * worn look, which is what those values have always been given and what
 * `bodiesFor` overrules on its own.
 */
export async function readLookForLevel(
  supabase: Client,
  userId: string,
  wears: string | undefined,
  tenantId: string | null = null,
): Promise<string> {
  // Animals only. The XP body is left alone on the row - it is not spent by a
  // level declining to draw it.
  if (wears === 'peep') return readAvatarHere(supabase, userId, tenantId)

  // XP bodies only, and the dummy for anybody without one. Deliberately not
  // falling back to their animal: a level that asked for XP bodies gets the
  // body a player already is before they are anybody.
  if (wears === 'xp') return (await readProfileSkin(supabase, userId)) ?? GUEST_LOOK

  return readWornLook(supabase, userId, tenantId)
}

// ---------------------------------------------------------------------------
// Backoffice reporting
// ---------------------------------------------------------------------------

export interface SkinAdminRow extends SkinView {
  /** How many people own it - the number a price change is weighed against. */
  owners: number
}

/** The whole shelf, active or not, with ownership counts. */
export async function listSkinsAdmin(admin: Client): Promise<SkinAdminRow[]> {
  const [{ data: skinRows }, { data: ownership }] = await Promise.all([
    admin.from('skins').select('*'),
    admin.from('skin_ownership').select('skin_id'),
  ])

  const owners = new Map<string, number>()
  for (const row of ownership ?? []) {
    owners.set(row.skin_id, (owners.get(row.skin_id) ?? 0) + 1)
  }

  return ((skinRows ?? []) as SkinRow[])
    .map((row) => ({ ...toView(row), owners: owners.get(row.id) ?? 0 }))
    .sort(shelfOrder)
}

export interface VoucherAdminRow {
  id: string
  code: string
  source: string
  claimed: boolean
  spentOn: string | null
  createdAt: string
}

/**
 * The most recent vouchers, newest first.
 *
 * The full list, not just the unredeemed - "was this code ever real, and what
 * happened to it" is the question support actually gets asked.
 *
 * ---------------------------------------------------------------------------
 * Except the bucks a promo code dropped in a pocket
 * ---------------------------------------------------------------------------
 * Those carry a code because the column requires one, and nobody is ever shown
 * it: they arrive owned and redeemed, straight into the pocket of whoever
 * spent the promo. They are not codes in the sense this log means, and a
 * campaign that goes well would put five of them here per sign-up - burying
 * every code an operator ever minted by hand under a list nobody can read.
 *
 * The bearer codes a promo hands over *do* appear, because those are exactly
 * what this log is for: unclaimed strings out in the world, and "is this real"
 * is about to be asked about one of them.
 */
export async function listVouchersAdmin(admin: Client, limit = 100): Promise<VoucherAdminRow[]> {
  const { data } = await admin
    .from('skin_vouchers')
    .select('id, code, source, owner_id, spent_on, created_at')
    // Not `source <> 'promo'`: the half of a promo grant that is a code belongs
    // here. What is filtered is "minted already owned", which is the property
    // that makes a row uninteresting to a log of codes.
    .or('promo_redemption_id.is.null,owner_id.is.null')
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data ?? []).map((v) => ({
    id: v.id,
    code: v.code,
    source: v.source,
    claimed: v.owner_id !== null,
    spentOn: v.spent_on,
    createdAt: v.created_at,
  }))
}
