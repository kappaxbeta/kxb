'use server'

import { agentsProjection } from '@/domain/agents/projection'
import { type AgentView, readAgents } from '@/domain/agents/queries'
import { foundHomestead } from '@/domain/homestead/actions'
import { type PlaceId } from '@/domain/homestead/events'
import { homesteadProjection } from '@/domain/homestead/projection'
import { type HomesteadView, readHomestead } from '@/domain/homestead/queries'
import { readProfileAvatar } from '@/domain/profile/avatar-queries'
import { readDisplayName } from '@/domain/profile/username-queries'
import { runProjection } from '@/es/projection'
import { requireTenant } from '@/lib/tenant'

/**
 * Open your own café, house or garden from inside a cartridge.
 *
 * ---------------------------------------------------------------------------
 * The same three steps as the page, answering instead of disappearing
 * ---------------------------------------------------------------------------
 * `src/app/t/[slug]/visit.ts` does this for the world routes and is the older
 * door: it takes `?of=`, it can open somebody *else's* place, and it answers a
 * request it cannot satisfy with `notFound()`. All three are right for a page
 * and wrong here.
 *
 * A cartridge is mounted inside a canvas that is already on screen - in a room
 * somebody walked into, or in a match. `notFound()` out of that blanks the page
 * they are standing in, which is the same failure `findPlayableXps` calls out
 * for the Play rail. So every refusal below comes back as a sentence the frame
 * can draw, and the game says why it will not open rather than taking the room
 * with it.
 *
 * ---------------------------------------------------------------------------
 * Always your own
 * ---------------------------------------------------------------------------
 * No `?of=`, and that is a decision rather than an omission. Visiting is a thing
 * you do by *walking to an address* - the rail carries `?of=` from link to link
 * for exactly that - and a cartridge has no address bar. A room pinned to the
 * café is a door everybody in the space can open, and what each of them finds
 * behind it is their own café, on their own purse, with their own roster. That
 * is the same answer the world route gives somebody who opens `/t/<slug>/cafe`,
 * which is what makes the two doors lead to one place instead of to two
 * different games with the same furniture.
 */
export interface HomesteadFrame {
  slug: string
  tenantId: string
  place: PlaceId
  /** The room as the log has it, purse included. */
  initial: HomesteadView
  avatar: string
  presence: { tenantId: string; userId: string; name: string }
  /** Yours, so the door apparatus collapses - see `Visit.owner`. */
  owner: { userId: string; name: string }
  agents: AgentView[]
}

export type HomesteadFrameResult =
  | { ok: true; frame: HomesteadFrame }
  | { ok: false; error: string }

export async function openHomesteadFrame(
  slug: string,
  place: PlaceId,
): Promise<HomesteadFrameResult> {
  /**
   * The same gate the pages come through, guests included.
   *
   * `surface: 'cafe'` is what lets a guest on an event link stand in one, and
   * leaving it off here would make the cartridge stricter than the door beside
   * it for no reason anybody could see.
   */
  const context = await requireTenant(slug, { guests: 'event', surface: 'cafe' })
  const { supabase, tenant, user } = context

  /**
   * One flag for all three places, checked rather than enforced.
   *
   * `requireFeature` is the page's version of this line and it calls
   * `notFound()`. A space that has XP switched on and the café switched off can
   * still have this cartridge in its shelf - it is a file we ship, and the
   * shelf does not know what is behind a frame - so this is a refusal somebody
   * will actually read.
   */
  if (!context.features.cafe) {
    return { ok: false, error: 'The café, the house and the garden are switched off for this space.' }
  }

  /**
   * Founded on open, exactly as the page does it.
   *
   * The decider returns no events for a homestead that already exists, so the
   * second call and the thousandth are both free - and this is the only moment
   * a member who has never opened the world gets one. A cartridge is a
   * perfectly good place to be handed your first kitchen.
   */
  const founded = await foundHomestead(slug)
  if (!founded.ok) return { ok: false, error: founded.error }

  const creatures = context.features.agents
  await Promise.all([
    runProjection(supabase, homesteadProjection, tenant.id),
    creatures ? runProjection(supabase, agentsProjection, tenant.id) : null,
  ])

  const name = await readDisplayName(supabase, user.id)

  const [initial, avatar, agents] = await Promise.all([
    readHomestead(supabase, tenant.id, user.id, place),
    readProfileAvatar(supabase, user.id),
    creatures ? readAgents(supabase, tenant.id, user.id, place) : [],
  ])

  return {
    ok: true,
    frame: {
      slug,
      tenantId: tenant.id,
      place,
      initial,
      avatar,
      presence: { tenantId: tenant.id, userId: user.id, name },
      owner: { userId: user.id, name },
      agents,
    },
  }
}
