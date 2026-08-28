import { XP_STREAM_TYPE, type XpEvent } from '@/domain/xps/events'
import type { Projection } from '@/es/projection'
import type { Client } from '@/es/store'
import type { StoredEvent } from '@/es/types'

/**
 * The list both browse pages query.
 *
 * No file counts and no byte totals derived by walking anything: a save event
 * carries its own `bytes` and `files`, computed once by the intake pipeline
 * that already had the buffers in hand. Recomputing them here would mean this
 * projection reading `xp_versions` on every save, which is the coupling
 * `battlefieldsProjection` refuses for block counts and for the same reason.
 *
 * `owner_id` is written from the event and never from the session. A replay may
 * be rebuilding a project made months ago by somebody who has since left, and a
 * projection that reached for `auth.uid()` would quietly reassign it to whoever
 * happened to trigger the rebuild.
 */
export const xpsProjection: Projection<XpEvent> = {
  name: 'xps_read_model',
  streamTypes: [XP_STREAM_TYPE],

  async handle(supabase: Client, event: StoredEvent<XpEvent>): Promise<void> {
    switch (event.type) {
      case 'XpCreated': {
        const { error } = await supabase.from('xps_read_model').upsert(
          {
            id: event.streamId,
            tenant_id: event.tenantId,
            owner_id: event.data.owner,
            name: event.data.name,
            state: 'draft',
            space_policy: 'none',
            current_version: 0,
            published_version: null,
            /**
             * Where it came from, when it came from somewhere.
             *
             * Carried by the event since `copyXp` was written and thrown away
             * here until docs/xp/backlog.md §1c needed it: *which of this
             * space's projects came from the level this room plays* is how a
             * member's copy becomes an offer an admin can find, rather than a
             * draft buried among every project in the space.
             *
             * Omitted rather than written as null when absent, so a project
             * made from nothing does not claim a source it never had - and so
             * a replay of an older `XpCreated` is a no-op on this column
             * instead of a clear.
             */
            ...(event.data.copiedFrom === undefined
              ? {}
              : { copied_from: event.data.copiedFrom }),
            created_at: event.createdAt,
            updated_at: event.createdAt,
            version: event.version,
          },
          { onConflict: 'id' },
        )
        if (error) throw new Error(`xps projection failed to create: ${error.message}`)
        return
      }

      case 'XpRenamed':
        await patch(supabase, event, {
          name: event.data.name,
          ...(event.data.blurb === undefined ? {} : { blurb: event.data.blurb }),
        })
        return

      case 'XpVersionSaved':
        await patch(supabase, event, {
          current_version: event.data.version,
          bytes: event.data.bytes,
          ...(event.data.cover === undefined ? {} : { cover_path: event.data.cover }),
        })
        return

      case 'XpAccessSet':
        await patch(supabase, event, { space_policy: event.data.spacePolicy })
        return

      case 'XpShared': {
        const { error } = await supabase.from('xp_grants').upsert(
          {
            xp_id: event.streamId,
            account_id: event.data.account,
            right: event.data.right,
            granted_by: event.actorId,
            created_at: event.createdAt,
          },
          { onConflict: 'xp_id,account_id' },
        )
        if (error) throw new Error(`xps projection failed to share: ${error.message}`)
        await touch(supabase, event)
        return
      }

      case 'XpUnshared': {
        /**
         * The one delete in this projection, and it is not a deviation from
         * "the log is the truth" - it is what the log says. A grant is a fact
         * with an end, `XpUnshared` is that end, and a read model that kept the
         * row would be a read model that disagreed with a replay.
         */
        const { error } = await supabase
          .from('xp_grants')
          .delete()
          .eq('xp_id', event.streamId)
          .eq('account_id', event.data.account)
        if (error) throw new Error(`xps projection failed to unshare: ${error.message}`)
        await touch(supabase, event)
        return
      }

      case 'XpTransferred':
        await patch(supabase, event, { owner_id: event.data.to })
        return

      case 'XpSubmitted':
        await patch(supabase, event, { state: 'submitted' })
        return

      case 'XpWithdrawn':
      case 'XpRejected':
        await patch(supabase, event, { state: 'draft' })
        return

      case 'XpPublished': {
        /**
         * The release row, and the pointer, in that order.
         *
         * `upsert` rather than insert because a version can go live, be
         * superseded, and go live again - which is one release with two
         * moments, not two releases. Going live again also clears the
         * withdrawal, because the row's job is "can we go back to this" and the
         * answer just became yes.
         */
        const { error } = await supabase.from('xp_releases').upsert(
          {
            xp_id: event.streamId,
            version: event.data.version,
            released_at: event.createdAt,
            released_by: event.actorId,
            withdrawn_at: null,
            withdrawn_reason: null,
          },
          { onConflict: 'xp_id,version' },
        )
        if (error) throw new Error(`xps projection failed to release: ${error.message}`)

        await patch(supabase, event, {
          state: 'published',
          published_version: event.data.version,
        })
        return
      }

      case 'XpRolledBack':
        // No release row is written. Everything a rollback can reach already
        // has one - that invariant is the decider's, and it is the whole reason
        // this is the owner's to do rather than a second review.
        await patch(supabase, event, {
          state: 'published',
          published_version: event.data.to,
        })
        return

      case 'XpUnpublished': {
        // The release is marked withdrawn rather than deleted: removing it
        // would erase the evidence that we once approved something we later
        // pulled, which is exactly the row a moderation question wants.
        const { error } = await supabase
          .from('xp_releases')
          .update({ withdrawn_at: event.createdAt, withdrawn_reason: event.data.reason })
          .eq('xp_id', event.streamId)
          .eq('version', event.data.version)
        if (error) throw new Error(`xps projection failed to withdraw: ${error.message}`)

        // `published_version` is left alone. The page that says "this was taken
        // down" still names what it was, and clearing it would turn an unlisted
        // project into one nothing can describe.
        await patch(supabase, event, { state: 'unlisted' })
        return
      }

      case 'XpRemoved':
        await patch(supabase, event, { state: 'removed' })
        return

      case 'XpMovedOut':
      case 'XpArchived':
        await patch(supabase, event, { state: 'archived' })
        return

      default:
        return
    }
  },
}

type XpPatch = {
  name?: string
  blurb?: string
  state?: string
  space_policy?: string
  owner_id?: string
  current_version?: number
  published_version?: number | null
  cover_path?: string
  bytes?: number
}

async function patch(
  supabase: Client,
  event: StoredEvent<XpEvent>,
  changes: XpPatch,
): Promise<void> {
  const { error } = await supabase
    .from('xps_read_model')
    .update({ ...changes, updated_at: event.createdAt, version: event.version })
    .eq('id', event.streamId)

  if (error) {
    throw new Error(`xps projection failed to update ${event.streamId}: ${error.message}`)
  }
}

/** Move `updated_at` when the change was to a different table. */
const touch = (supabase: Client, event: StoredEvent<XpEvent>) => patch(supabase, event, {})
