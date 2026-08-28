import { BATTLE_STREAM_TYPE, type BattleEvent } from '@/domain/battle/events'
import type { Projection } from '@/es/projection'
import type { Json } from '@/lib/supabase/database.types'
import type { Client } from '@/es/store'
import type { StoredEvent } from '@/es/types'

/**
 * Two tables from one stream.
 *
 * `battles_read_model` is the match; `battle_participants` is its roster. The
 * roster is split out because a Realtime policy has to be able to ask "is this
 * person fighting here" in SQL, and folding an event stream is not something a
 * policy can do - see the note in 20260803050000_battles.sql.
 *
 * Every write here is an upsert or a delete keyed by primary key, so running
 * the projection twice over the same events lands on the same rows. That is not
 * a nicety: `runProjection` is called from several actions and two of them can
 * overlap.
 */
export const battlesProjection: Projection<BattleEvent> = {
  name: 'battles_read_model',
  streamTypes: [BATTLE_STREAM_TYPE],

  async handle(supabase: Client, event: StoredEvent<BattleEvent>): Promise<void> {
    switch (event.type) {
      case 'BattleCreated': {
        const { error } = await supabase.from('battles_read_model').upsert(
          {
            id: event.streamId,
            tenant_id: event.data.hostTenantId,
            name: event.data.name,
            mode: event.data.mode,
            world_id: event.data.worldId,
            // Null for a match in a world, which is every match before XPs
            // existed and most of them after.
            xp_id: event.data.xpId ?? null,
            /**
             * The whole block, as JSON, because it is read as a whole.
             *
             * Four columns would have been the house style, and this is the one
             * place it is wrong: nothing queries or orders by a match's score
             * limit, the block is handed straight back to `applyMatchRules`,
             * and splitting it would mean four nullable columns whose absent
             * halves each need a comment saying which "absent" they mean.
             */
            // Cast because the generated `Json` is an index-signature type and
            // an interface is not one, which is a TypeScript fact about
            // structural assignability rather than anything about the value.
            xp_rules: (event.data.xpRules ?? null) as unknown as Json,
            status: 'open',
            created_by: event.actorId,
            created_at: event.createdAt,
            updated_at: event.createdAt,
            version: event.version,
            /**
             * Null for the three modes that have no settings at all.
             *
             * Football and race share these columns rather than growing a second
             * set, because they are the same two questions - how long, and does a
             * charge hurt - asked of both. The two football-only ones stay null
             * for a race: there is no score to reach, and coming back at the start
             * line is the mode rather than a switch.
             */
            duration_minutes:
              event.data.football?.durationMinutes ??
              event.data.race?.durationMinutes ??
              null,
            score_limit: event.data.football?.scoreLimit ?? null,
            damage_on: event.data.football?.damage ?? event.data.race?.damage ?? null,
            respawn_on: event.data.football?.respawn ?? null,
          },
          { onConflict: 'id' },
        )
        if (error) {
          throw new Error(`battles projection failed to create: ${error.message}`)
        }
        return
      }

      case 'PlayerJoined': {
        const { error } = await supabase.from('battle_participants').upsert(
          {
            battle_id: event.streamId,
            user_id: event.data.userId,
            tenant_id: event.data.tenantId,
            side: event.data.side ?? null,
            // A re-join after switching sides must not resurrect somebody who
            // was already defeated - but a switch can only happen before the
            // start, when nobody is. False is correct in both cases.
            defeated: false,
            joined_at: event.createdAt,
          },
          { onConflict: 'battle_id,user_id' },
        )
        if (error) {
          throw new Error(`battles projection failed to add player: ${error.message}`)
        }
        await touch(supabase, event)
        return
      }

      case 'PlayerLeft': {
        const { error } = await supabase
          .from('battle_participants')
          .delete()
          .eq('battle_id', event.streamId)
          .eq('user_id', event.data.userId)

        if (error) {
          throw new Error(`battles projection failed to remove player: ${error.message}`)
        }
        await touch(supabase, event)
        return
      }

      /**
       * The ready sign, onto the fighter's own roster row.
       *
       * An assignment rather than a flip, so a rebuild lands on the same lobby:
       * the event carries what was said, not that something changed.
       */
      case 'PlayerReady': {
        const { error } = await supabase
          .from('battle_participants')
          .update({ ready: event.data.ready })
          .eq('battle_id', event.streamId)
          .eq('user_id', event.data.userId)

        if (error) {
          throw new Error(`battles projection failed to record ready: ${error.message}`)
        }
        await touch(supabase, event)
        return
      }

      case 'BattleStarted':
        await patch(supabase, event, {
          status: 'live',
          // The kickoff comes from the event's own payload, not `createdAt`: the
          // clock is a rule, and the rule reads the fact the decider recorded. See
          // the note on BattleStarted in ./events.ts. Absent for the modes with no
          // clock, which is every mode but football.
          started_at: event.data.at ?? null,
        })
        return

      /**
       * A goal: one row, then the score recomputed from the rows.
       *
       * Never `score_red + 1`. A rebuild re-delivers every event, and an
       * incrementing projection would double the score every time the read model
       * was rebuilt - the same trap the friendly counts avoid below by deriving
       * rather than adding. The insert is keyed on the reporter's goal id, so it is
       * idempotent, and a count over idempotent rows is idempotent too.
       */
      case 'GoalScored': {
        const { error } = await supabase.from('battle_goals').upsert(
          {
            battle_id: event.streamId,
            goal_id: event.data.id,
            side: event.data.side,
            scored_by: event.data.by ?? null,
            own_goal: event.data.ownGoal ?? false,
            scored_at: event.createdAt,
          },
          {
            onConflict: 'battle_id,goal_id',
            /**
             * DO NOTHING, not DO UPDATE.
             *
             * Without this the upsert compiles to `ON CONFLICT DO UPDATE`, and
             * an UPDATE is checked against an UPDATE policy - which
             * `battle_goals` deliberately does not have, because a goal that
             * went in stays in (see 20260804010000_battle_goals.sql). So the
             * *second* delivery of any GoalScored failed with "new row violates
             * row-level security policy (USING expression)", which is a
             * confusing way for Postgres to say "there is no update policy
             * here": a replay, a rebuild, or two clients reporting the same
             * goal all broke the projection and left the score stuck.
             *
             * Ignoring the duplicate is also the correct semantics rather than
             * a workaround. The row is keyed on the id its reporter minted, so
             * a conflict means "this exact goal is already recorded" - there is
             * nothing to update, and the recount below reads the rows either
             * way.
             */
            ignoreDuplicates: true,
          },
        )
        if (error) {
          throw new Error(`battles projection failed to record goal: ${error.message}`)
        }

        await recountGoals(supabase, event)
        return
      }

      /**
       * A finish: the place and the time, onto the racer's own roster row.
       *
       * An assignment rather than an accumulation, so a rebuild lands on the same
       * sheet - the property every handler here keeps. Both values come off the
       * event, which the decider stamped from the log's own ordering and the
       * server's clock, so replaying cannot renumber the podium.
       */
      case 'RacerFinished': {
        const { error } = await supabase
          .from('battle_participants')
          .update({
            finish_place: event.data.place,
            finish_seconds: event.data.seconds,
          })
          .eq('battle_id', event.streamId)
          .eq('user_id', event.data.userId)

        if (error) {
          throw new Error(`battles projection failed to record finish: ${error.message}`)
        }
        await touch(supabase, event)
        return
      }

      case 'PlayerDefeated': {
        const { error } = await supabase
          .from('battle_participants')
          .update({ defeated: true })
          .eq('battle_id', event.streamId)
          .eq('user_id', event.data.userId)

        if (error) {
          throw new Error(`battles projection failed to record defeat: ${error.message}`)
        }
        await touch(supabase, event)
        return
      }

      case 'BattleEnded': {
        await patch(supabase, event, {
          status: 'ended',
          // Null for a draw. `status` is what tells a draw apart from a match
          // still running, so the two can share a null winner safely.
          winner_type: event.data.winner?.type ?? null,
          winner_id: event.data.winner?.id ?? null,
          ended_at: event.createdAt,
          // Written on every BattleEnded rather than only the abandoned ones,
          // so a rebuild of a rematch stream cannot leave a true from the match
          // before it standing on a row that finished properly.
          abandoned: event.data.abandoned ?? false,
        })

        /**
         * Friendly counts, recomputed rather than incremented.
         *
         * A replay re-delivers every BattleEnded, so `played = played + 1`
         * would inflate the numbers each time the read model was rebuilt.
         * `recount_battle_scores` derives them from the roster instead, which
         * makes running it twice land on the same answer - the same property
         * upserting gives the block projection.
         *
         * Scoped to the *host* space here. A visiting fighter's counts live in
         * their own space and are recomputed when their side next runs this,
         * which is the price of a roster that spans tenants.
         */
        const { error } = await supabase.rpc('recount_battle_scores', {
          p_tenant_id: event.tenantId,
        })
        if (error) {
          throw new Error(`battles projection failed to score: ${error.message}`)
        }
        return
      }

      case 'BattleCancelled':
        await patch(supabase, event, { status: 'cancelled', ended_at: event.createdAt })
        return

      case 'RematchWanted': {
        const { error } = await supabase
          .from('battle_participants')
          .update({ wants_rematch: true })
          .eq('battle_id', event.streamId)
          .eq('user_id', event.data.userId)

        if (error) {
          throw new Error(`battles projection failed to record rematch: ${error.message}`)
        }
        await touch(supabase, event)
        return
      }

      case 'RematchStarted':
        await patch(supabase, event, { rematch_battle_id: event.data.battleId })
        return

      default:
        return
    }
  },
}

type BattlePatch = {
  status?: string
  winner_type?: string | null
  winner_id?: string | null
  ended_at?: string
  rematch_battle_id?: string
  started_at?: string | null
  score_red?: number
  score_blue?: number
  abandoned?: boolean
}

/**
 * Recount the scoreline from the goal rows.
 *
 * Two reads and a write where an increment would have been one statement, and
 * worth it: this is what makes the cached score survive a rebuild. Cheap in
 * absolute terms - a football match holds a handful of goals, and this runs once
 * per goal rather than once per frame.
 */
async function recountGoals(
  supabase: Client,
  event: StoredEvent<BattleEvent>,
): Promise<void> {
  const { data, error } = await supabase
    .from('battle_goals')
    .select('side')
    .eq('battle_id', event.streamId)

  if (error) {
    throw new Error(`battles projection failed to count goals: ${error.message}`)
  }

  const rows = data ?? []
  await patch(supabase, event, {
    score_red: rows.filter((row) => row.side === 'red').length,
    score_blue: rows.filter((row) => row.side === 'blue').length,
  })
}

async function patch(
  supabase: Client,
  event: StoredEvent<BattleEvent>,
  changes: BattlePatch,
): Promise<void> {
  const { error } = await supabase
    .from('battles_read_model')
    .update({ ...changes, updated_at: event.createdAt, version: event.version })
    .eq('id', event.streamId)

  if (error) {
    throw new Error(
      `battles projection failed to update ${event.streamId}: ${error.message}`,
    )
  }
}

/** Bump the match's version and timestamp for an event that only moved a player. */
async function touch(
  supabase: Client,
  event: StoredEvent<BattleEvent>,
): Promise<void> {
  await patch(supabase, event, {})
}
