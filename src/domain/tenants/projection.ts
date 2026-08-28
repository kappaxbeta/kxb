import { TENANT_STREAM_TYPE, type TenantEvent } from '@/domain/tenants/events'
import type { Projection } from '@/es/projection'
import type { Client } from '@/es/store'
import type { StoredEvent } from '@/es/types'

/**
 * The read side of the tenant aggregate - and notably, only half of it.
 *
 * Membership and invitations are *not* projected here. They are maintained by a
 * SECURITY DEFINER trigger in the tenants migration, because RLS policies
 * consult them and a table the user can write cannot be the thing that decides
 * what the user may write. This projection handles the part nothing depends on
 * for security: the workspace's name, its slug, and whether it is archived.
 *
 * That split is the interesting bit. It is not "triggers are better"; it is
 * that a projection feeding the UI and a projection feeding the authorization
 * system have genuinely different requirements, and pretending otherwise is how
 * privilege escalation gets built.
 */
export const tenantsProjection: Projection<TenantEvent> = {
  name: 'tenants_read_model',
  streamTypes: [TENANT_STREAM_TYPE],

  async handle(supabase: Client, event: StoredEvent<TenantEvent>): Promise<void> {
    switch (event.type) {
      case 'TenantCreated':
        await upsert(supabase, {
          // The tenant's stream id is the tenant id.
          id: event.streamId,
          slug: event.data.slug,
          name: event.data.name,
          archived: false,
          created_at: event.createdAt,
          updated_at: event.createdAt,
          version: event.version,
        })
        return

      case 'TenantRenamed':
        await patch(supabase, event, { name: event.data.name })
        return

      case 'TenantArchived':
        await patch(supabase, event, { archived: true })
        return

      case 'LoungePublicitySet':
        await patch(supabase, event, { is_public_lounge: event.data.isPublic })
        return

      case 'LoungeModeSet':
        await patch(supabase, event, { lounge_mode: event.data.mode })
        return

      case 'ChatEnabledSet':
        await patch(supabase, event, { chat_enabled: event.data.enabled })
        return

      /**
       * Read-modify-write, which every other case here avoids and this one
       * cannot: the column is one JSONB object holding every capability, so
       * writing a key means knowing the others.
       *
       * Safe here for a reason specific to this projection rather than a
       * general one - a tenant's events are applied in order by a single
       * `runProjection` pass per tenant, so there is no second writer to race
       * with. If this column ever gains a writer outside the projection, this
       * has to become a `jsonb_set` through an RPC instead.
       */
      case 'SpaceCapabilitySet': {
        const { data: row } = await supabase
          .from('tenants_read_model')
          .select('capabilities')
          .eq('id', event.streamId)
          .maybeSingle()

        const capabilities = {
          ...((row?.capabilities as Record<string, boolean> | null) ?? {}),
          [event.data.capability]: event.data.enabled,
        }

        await patch(supabase, event, { capabilities })
        return
      }

      default:
        // Membership events land here and are deliberately ignored - see the
        // note above. Everything else is an event type this version does not
        // know about.
        return
    }
  },
}

type TenantRow = {
  id: string
  slug: string
  name: string
  archived: boolean
  is_public_lounge?: boolean
  lounge_mode?: string
  chat_enabled?: boolean
  capabilities?: Record<string, boolean>
  created_at: string
  updated_at: string
  version: number
}

async function upsert(supabase: Client, row: TenantRow): Promise<void> {
  const { error } = await supabase.from('tenants_read_model').upsert(row, { onConflict: 'id' })
  if (error) {
    throw new Error(`tenants projection failed to upsert ${row.id}: ${error.message}`)
  }
}

async function patch(
  supabase: Client,
  event: StoredEvent<TenantEvent>,
  changes: Partial<TenantRow>,
): Promise<void> {
  const { error } = await supabase
    .from('tenants_read_model')
    .update({
      ...changes,
      updated_at: event.createdAt,
      version: event.version,
    })
    .eq('id', event.streamId)

  if (error) {
    throw new Error(`tenants projection failed to update ${event.streamId}: ${error.message}`)
  }
}
