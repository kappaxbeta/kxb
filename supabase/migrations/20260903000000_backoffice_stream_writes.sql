-- ============================================================================
-- The platform, acting in a space it is not a member of
-- ----------------------------------------------------------------------------
-- Standing an event up made the operator its *owner*. That was not an
-- oversight - it is written down in `createEvent` and argued for in
-- 20260826000000: `append_events()` is security invoker and
-- `events_insert_tenant` demands membership, so an operator who is not a member
-- cannot invite the customer's staff, flip a switch or rename a hall. Making
-- them the owner was the only path to those, and it works.
--
-- What it also does is put a person from this company in the staff list of
-- every event we have ever run, in a space that belongs to somebody else, with
-- a nameplate they never asked for. That is the wrong default, and no amount of
-- hiding it in the UI makes the membership row untrue.
--
-- So the operator stops being a member and becomes what they actually are: the
-- platform, acting on a space that is not theirs.
--
-- ----------------------------------------------------------------------------
-- What this is *not* a reversal of
-- ----------------------------------------------------------------------------
-- Two earlier decisions look like they forbid this, and neither does:
--
--   20260803080000 (world bans) argues a moderation fact must not live on the
--   moderated space's stream, "the stream belongs to the space being moderated,
--   and RLS lets that space write to it". Exactly right, and untouched: a ban
--   is a fact *about* a space that the space must not be able to rewrite. What
--   this file allows is the opposite kind of fact - inviting a host, flipping
--   the space's own switch - which is the space's own history and belongs on
--   its stream no matter whose hands typed it.
--
--   20260826000000 concluded an event's *ceiling* belongs in an admin-owned
--   side table. Still true, and `event_spaces` stays exactly as it is: what an
--   event bought is our fact, not the space's, and a host must not be able to
--   widen it by writing to their own stream.
--
-- And the service role has been able to append since 20260725150000, for
-- Stripe. `actor_id` is nullable there and means "the system did this". This is
-- deliberately *not* that: the operator is signed in, `actor_id` stays their
-- own id, and the log therefore says which person invited whom. A service-role
-- write would have been less code and a worse record.
--
-- ----------------------------------------------------------------------------
-- The size of the hole, stated plainly
-- ----------------------------------------------------------------------------
-- A backoffice admin may now append to any tenant stream. That is a real
-- widening and it is bounded by exactly one thing: `is_backoffice_admin()`,
-- which is a row in `backoffice_admins` that only the service role can write.
-- The same function already gates reading every space's log, every flag, and
-- every moderation action, so this does not add a new trust boundary - it lets
-- an existing one write as well as read.
--
-- `actor_id = auth.uid()` is kept in the clause. An operator cannot append as
-- somebody else, which is what stops "the platform did it" from ever being
-- indistinguishable from "the host did it" in a customer's own history.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Rebased from 20260826000000. Every existing clause is preserved verbatim -
-- that migration's own header explains what silently breaks when one is
-- dropped, and the `can_act_in_battle` clause has already been lost that way
-- once. The only change is the final OR.
-- ----------------------------------------------------------------------------

drop policy if exists "events_insert_tenant" on public.events;

create policy "events_insert_tenant"
  on public.events for insert
  with check (
    actor_id = (select auth.uid())
    and (
      public.is_tenant_member(tenant_id)
      or public.tenant_is_unclaimed(tenant_id)
      or (stream_type = 'tenant' and public.has_tenant_invitation(tenant_id))
      or (stream_type = 'battle' and public.can_act_in_battle(stream_id, (select auth.uid())))
      -- A guest takes part in matches and does nothing else durable.
      or (stream_type = 'battle' and public.is_tenant_guest(tenant_id))
      -- ...unless this is an event, and the event says otherwise.
      or (
        stream_type = 'lounge_chunk'
        and public.is_tenant_guest(tenant_id)
        and public.event_guest_may_build(
              tenant_id,
              coalesce((data ->> 'worldId')::uuid, tenant_id)
            )
      )
      or (
        stream_type <> 'lounge_chunk'
        and public.is_tenant_guest(tenant_id)
        and public.event_guest_may_write(tenant_id, stream_type)
      )
      -- The platform, operating a space it does not belong to.
      or public.is_backoffice_admin()
    )
  );

-- ----------------------------------------------------------------------------
-- Reading has to be widened with it, and for a mechanical reason rather than a
-- policy one: `append_events()` ends in `INSERT ... RETURNING *`, and Postgres
-- applies SELECT policies to returned rows. An operator who could write an
-- event and not read it back would see "new row violates row-level security" -
-- which is precisely the bug 20260725140000 was written to fix, from the other
-- side. `executeCommand`'s retry path re-reads the stream too.
--
-- Rebased from 20260725140000, again clause for clause.
-- ----------------------------------------------------------------------------

drop policy if exists "events_select_tenant" on public.events;

create policy "events_select_tenant"
  on public.events for select
  using (
    public.tenant_role(tenant_id) is not null
    or public.tenant_is_unclaimed(tenant_id)
    or (stream_type = 'tenant' and public.has_tenant_invitation(tenant_id))
    or (stream_type = 'battle' and public.can_act_in_battle(stream_id, (select auth.uid())))
    or public.is_backoffice_admin()
  );

-- ----------------------------------------------------------------------------
-- Who is standing in for the platform, in words a member can read
-- ----------------------------------------------------------------------------
-- An ownerless space is a new state, and the one question it raises is "who do
-- I ask". This answers it from the log rather than from a membership row: the
-- operator who created the space is the actor on its first event, forever.
--
-- Not used for permission anywhere. It exists so the console can say whose
-- event this is after the operator has stepped out of it.
-- ----------------------------------------------------------------------------

create or replace function public.tenant_created_by(p_tenant_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select e.actor_id
    from public.events e
   where e.tenant_id = p_tenant_id
     and e.stream_type = 'tenant'
   order by e.version
   limit 1;
$$;

revoke execute on function public.tenant_created_by(uuid) from public, anon;
grant execute on function public.tenant_created_by(uuid) to authenticated;
