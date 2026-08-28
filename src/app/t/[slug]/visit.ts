import 'server-only'
import { notFound } from 'next/navigation'
import { agentsProjection } from '@/domain/agents/projection'
import { type AgentView, readAgents } from '@/domain/agents/queries'
import { foundHomestead } from '@/domain/homestead/actions'
import type { PlaceId } from '@/domain/homestead/events'
import { homesteadProjection } from '@/domain/homestead/projection'
import {
  type HomesteadView,
  readHomestead,
  readNeighbour,
} from '@/domain/homestead/queries'
import { readProfileAvatar } from '@/domain/profile/avatar-queries'
import { readDisplayName } from '@/domain/profile/username-queries'
import { runProjection } from '@/es/projection'
import { requireFeature, requireTenant } from '@/lib/tenant'

/**
 * Work out whose homestead is being opened, and load it.
 *
 * The café, the house and the garden pages are the same three steps in a
 * different order each - resolve the tenant, decide whose place this is, catch
 * the projection up, read the room - and the step that is easy to get subtly
 * wrong is the middle one. Doing it in one place means `?of=` cannot be honoured
 * on two pages and quietly ignored on the third.
 */
export interface Visit {
  slug: string
  tenantId: string
  /** The room as the log has it, including whose door policy applies. */
  initial: HomesteadView
  avatar: string
  presence: { tenantId: string; userId: string; name: string }
  owner: { userId: string; name: string }
  /**
   * The creatures that live in this room, and whose it is to say so.
   *
   * The *owner's* animals, not the visitor's - they belong to the house the way
   * the furniture does, so walking into a colleague's kitchen shows you their
   * cat and not yours. `mine` is what the HUD reads to decide whether to offer
   * an adopt button, and it is the same question as "is this my house".
   *
   * Empty when the flag is off, which is why the scenes need no branch of their
   * own: an empty list draws nothing.
   */
  agents: AgentView[]
  mine: boolean
}

export async function openPlace(
  slug: string,
  place: PlaceId,
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>,
): Promise<Visit> {
  // One gate for the café, the house and the garden, because `openPlace` is
  // the single door all three come through - the same argument the `cafe` flag
  // makes just below, applied to guests.
  const context = await requireTenant(slug, { guests: 'event', surface: 'cafe' })
  const { supabase, tenant, user } = context

  /**
   * One flag for all three. The travel bar makes the café, the house and the
   * garden one world you walk around, so they open and close together - a
   * workspace with a house but no café would have doors leading to a 404.
   */
  requireFeature(context, 'cafe')

  const { of } = await searchParams
  /**
   * `?of=` naming yourself is the same as not passing it at all.
   *
   * Normalised here rather than left to each caller, so that the "am I
   * visiting" question has exactly one answer downstream: `owner.userId !==
   * user.id`. An array - which is what `?of=a&of=b` produces - is not an
   * address, so it falls back to your own.
   */
  const ownerId = typeof of === 'string' && of && of !== user.id ? of : user.id
  const visiting = ownerId !== user.id

  /**
   * Only ever found your own.
   *
   * `foundHomestead` derives its stream from the session, so calling it while
   * visiting would silently open *your* homestead as a side effect of looking
   * at somebody else's - which is harmless but means the log records a founding
   * at a moment that had nothing to do with you.
   */
  if (!visiting) await foundHomestead(slug)

  // Catch up before rendering, so a room somebody else furnished is present on
  // first load rather than after the first click. The roster gets the same
  // treatment, and only when the flag is on - a projection run is a query per
  // page load, and there is no point paying it for a feature nobody can see.
  const creatures = context.features.agents
  await Promise.all([
    runProjection(supabase, homesteadProjection, tenant.id),
    creatures ? runProjection(supabase, agentsProjection, tenant.id) : null,
  ])

  // Your own handle, needed either way: it is the name you walk around under,
  // and it is also the name on the door when the door is yours.
  const myName = await readDisplayName(supabase, user.id)

  const owner = visiting
    ? await readNeighbour(supabase, tenant.id, ownerId)
    : { userId: user.id, name: myName }

  // A uuid that is not a member of this workspace. See `readNeighbour`.
  if (!owner) notFound()

  // The list of everybody else's front doors used to be read here too. It
  // belongs to the workspace rail now, which renders on every page rather than
  // only in a scene - so it is read once in the tenant layout instead of three
  // times over in three nearly identical page files.
  const [initial, avatar, agents] = await Promise.all([
    readHomestead(supabase, tenant.id, owner.userId, place),
    // Your own avatar, not theirs - this is the body *you* walk around in.
    readProfileAvatar(supabase, user.id),
    // Theirs, not yours - see `agents` on `Visit`.
    creatures ? readAgents(supabase, tenant.id, owner.userId, place) : [],
  ])

  return {
    slug,
    tenantId: tenant.id,
    initial,
    avatar,
    presence: {
      tenantId: tenant.id,
      userId: user.id,
      // The handle, which is what members see each other by everywhere else.
      // The wire format did not have to change for this - presence carries a
      // name rather than deriving one, which is exactly the seam this needed.
      name: myName,
    },
    owner,
    agents,
    mine: !visiting,
  }
}
