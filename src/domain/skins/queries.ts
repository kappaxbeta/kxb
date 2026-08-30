import 'server-only'
import type { Client } from '@/es/store'
import { resolveFeatures } from '@/domain/flags/queries'
import { readAvatarHere } from '@/domain/profile/avatar-queries'
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
 * The body somebody with no account stands in.
 *
 * The plain dummy, which is what every player is before they are anybody: a
 * qualified catalogue id, so the renderer draws it down the skinned path and
 * the presence channel carries it like any other look.
 */
export const GUEST_LOOK = 'dummy/Dummy'

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
 * What this person stands in *in the lounge*: their skin if they asked for it
 * there, otherwise their animal.
 *
 * The lounge's own reader, separate from `readWornLook` above, because the two
 * answer different questions: a skin is worn in the games by default and in
 * the lounge only on request. Returns whatever the presence channel and the
 * renderer both understand - a bare animal name, or a qualified catalogue id.
 *
 * Falls back to the animal on any failure, and on a row whose flag is off, so
 * the lounge always has a body to draw.
 */
export async function readLoungeLook(
  supabase: Client,
  userId: string | null | undefined,
  tenantId: string | null = null,
): Promise<string> {
  const animal = await readAvatarHere(supabase, userId, tenantId)
  if (!userId) return animal

  const { data, error } = await supabase
    .from('profile_skins')
    .select('model, in_lounge')
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !data?.in_lounge || !data.model) return animal
  return data.model
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
 */
export async function listVouchersAdmin(admin: Client, limit = 100): Promise<VoucherAdminRow[]> {
  const { data } = await admin
    .from('skin_vouchers')
    .select('id, code, source, owner_id, spent_on, created_at')
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
