import { MAGAZINE_STREAM_TYPE, type MagazineEvent } from '@/domain/magazine/events'
import type { Projection } from '@/es/projection'
import type { Client } from '@/es/store'
import type { StoredEvent } from '@/es/types'

/**
 * The shelf as a table, so a list is one query.
 *
 * Keyed on `(tenant_id, xp_ref)` rather than on the stream id, because the
 * stream is the whole magazine and the rows are its entries - the one place in
 * this codebase where a projection fans one stream out into many rows. That is
 * what makes "what is on this shelf" a select rather than a fold, and it is why
 * the decider's only rule is "not twice": the primary key would refuse a
 * duplicate anyway, and a projection that threw on an event the decider allowed
 * would wedge the checkpoint.
 */
export const magazineProjection: Projection<MagazineEvent> = {
  name: 'magazine_read_model',
  streamTypes: [MAGAZINE_STREAM_TYPE],

  async handle(supabase: Client, event: StoredEvent<MagazineEvent>): Promise<void> {
    switch (event.type) {
      case 'XpTakenIn': {
        const { error } = await supabase.from('magazine_read_model').upsert(
          {
            tenant_id: event.tenantId,
            xp_ref: event.data.xpRef,
            name: event.data.name,
            added_by: event.actorId,
            added_at: event.createdAt,
          },
          { onConflict: 'tenant_id,xp_ref' },
        )

        if (error) throw new Error(`magazine projection failed: ${error.message}`)
        return
      }

      case 'ShelfFollowSet': {
        // Upsert rather than update: the row does not exist until a space has
        // an opinion, and switching this on is very often the first opinion it
        // has - before anything has been taken in at all.
        const { error } = await supabase.from('magazine_settings').upsert(
          {
            tenant_id: event.tenantId,
            auto_update: event.data.on,
            updated_at: event.createdAt,
          },
          { onConflict: 'tenant_id' },
        )

        if (error) throw new Error(`magazine projection failed: ${error.message}`)
        return
      }

      case 'XpPutBack': {
        const { error } = await supabase
          .from('magazine_read_model')
          .delete()
          .eq('tenant_id', event.tenantId)
          .eq('xp_ref', event.data.xpRef)

        if (error) throw new Error(`magazine projection failed: ${error.message}`)
        return
      }
    }
  },
}
