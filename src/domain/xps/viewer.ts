import 'server-only'
import { listMyTenants } from '@/domain/tenants/queries'
import type { Client } from '@/es/store'

/**
 * Which doors on the store are open to whoever is looking at it.
 *
 * ---------------------------------------------------------------------------
 * Why the store asks this at all
 * ---------------------------------------------------------------------------
 * The catalogue is public and stays public - that is the whole argument
 * `src/app/worlds/page.tsx` makes about signed-out visitors, and an XP store
 * inherits it. What is *not* public is making one: `src/domain/billing/tiers.ts`
 * says the XP suite is what the higher tier is for, so a create door offered to
 * everybody is a door that leads to a locked room.
 *
 * So the page renders the same for everybody except in one place - where the
 * control that says "make one" points. Three answers, and each is a different
 * next step rather than a different amount of page:
 *
 *   - somewhere to build it   → the editor, in a space that already holds xp
 *   - a space, but on xo      → the billing page for that space
 *   - no space at all         → the pricing table
 *
 * ---------------------------------------------------------------------------
 * The tier, and not the flag
 * ---------------------------------------------------------------------------
 * `xpOpen()` in `src/lib/tenant.ts` is the real gate and it asks two questions:
 * the `xp` feature flag *and* the tier. This asks only the tier, deliberately.
 *
 * The flag exists to keep a half-finished multiplayer feature switched off per
 * space, and the thing it protects is a Realtime budget - a room several people
 * are in at once. The store is a list of pictures. Reading the flag registry
 * for every space somebody belongs to, to decide the destination of one link,
 * spends several queries to arrive at a page that looks identical.
 *
 * The consequence is honest and small: somebody on xp with the flag off follows
 * the create door and lands on a surface that tells them so. That is the
 * correct place to find out, because it is the surface that can do something
 * about it. The gate is still the gate; this is a signpost.
 */

export interface XpViewer {
  /**
   * Can this person open the creator *right now*.
   *
   * Backoffice only, which is `src/app/xp/gate.ts`'s answer and not this file's
   * to change. It is here because the store has a create door and there is
   * exactly one editor behind it today: until `docs/xp/backend.md` B3 builds the
   * tenant one, "make an XP" is a thing three people can do. A door that leads
   * somewhere for an operator and to a pitch for everybody else is honest; a
   * door that 404s for the people we are selling to is not.
   */
  operator: boolean
  /** A space of theirs that holds the tier the editor will want, or null. */
  buildIn: { slug: string; name: string } | null
  /** A space of theirs that could, if it moved tier. Null when `buildIn` is set. */
  upgradable: { slug: string; name: string } | null
}

export const NOBODY: XpViewer = { operator: false, buildIn: null, upgradable: null }

/**
 * Read the viewer's standing in one round trip past the membership list.
 *
 * Signed out is the common case on this page and it costs nothing: no user, no
 * queries, and the caller gets the same shape it would have got anyway.
 */
export async function readXpViewer(
  supabase: Client,
  userId: string | null,
): Promise<XpViewer> {
  if (!userId) return NOBODY

  // Both at once: neither answer depends on the other, and this page is already
  // reading a directory and a table before it can draw anything.
  const [tenants, admin] = await Promise.all([
    listMyTenants(supabase, userId).then((all) => all.filter((tenant) => !tenant.archived)),
    supabase.rpc('is_backoffice_admin').then(({ data }) => data === true),
  ])

  if (tenants.length === 0) return { ...NOBODY, operator: admin }

  const { data, error } = await supabase
    .from('subscriptions_read_model')
    .select('tenant_id, tier')
    .in(
      'tenant_id',
      tenants.map((tenant) => tenant.id),
    )

  // A store that cannot read a subscription still lists XPs. Falling back to
  // "no space" points the create door at pricing, which is wrong for a paying
  // customer and recoverable in one click - the direction `DEFAULT_TIER` argues
  // for, applied to a link instead of an entitlement.
  if (error) return { ...NOBODY, operator: admin }

  const paidXp = new Set(
    (data ?? []).filter((row) => row.tier === 'xp').map((row) => row.tenant_id),
  )

  const buildIn = tenants.find((tenant) => paidXp.has(tenant.id))
  if (buildIn) {
    return { operator: admin, buildIn: { slug: buildIn.slug, name: buildIn.name }, upgradable: null }
  }

  // Whichever space they can actually change the plan on. A member who is not
  // an owner cannot, so pointing them at billing would be a dead end - and the
  // pricing page, which is where `NOBODY` sends them, at least explains it.
  const owned = tenants.find((tenant) => tenant.role === 'owner')
  return {
    operator: admin,
    buildIn: null,
    upgradable: owned ? { slug: owned.slug, name: owned.name } : null,
  }
}
