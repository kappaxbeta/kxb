-- ============================================================================
-- The list and the door must count the same people
-- ============================================================================
-- 20261215000000 made a seat something you hold by being here: the cap stopped
-- counting twelve hours of admissions and started asking `world_occupancy` who
-- is actually in a world. It fixed the door and it did not touch the list.
--
-- So the rail still draws every guest whose admission has not expired, with a
-- Kick button beside each, and a count of them over the space's cap. On a space
-- people have been dropping in and out of all day that reads "8/8" while
-- `tenant_guest_count` says 0 and the door is standing open. The honest thing
-- an admin does with that screen is kick eight people who left hours ago before
-- letting the next one in - which is work the product invented for them.
--
-- ----------------------------------------------------------------------------
-- One definition, and the count is derived from it
-- ----------------------------------------------------------------------------
-- The obvious fix is to copy the presence clause into the query behind the
-- list. That is two copies of a rule that has already been wrong once, in a
-- codebase where the cost of them disagreeing is exactly the screen above.
--
-- So the rule moves into `tenant_guests_present`, which answers *who*, and
-- `tenant_guest_count` becomes `count(*)` over it. The list and the door cannot
-- drift, because there is no longer a second thing to keep true - the same
-- argument 20261215000000 made for asking `world_occupancy` rather than adding
-- a second presence mechanism beside it.
--
-- The clause itself is unchanged, down to the two minutes and the reason for
-- them. It is only in one place now.
--
-- ----------------------------------------------------------------------------
-- What an admin loses, and why it is nothing
-- ----------------------------------------------------------------------------
-- Somebody who left an hour ago drops off the list, so they can no longer be
-- kicked. There is nothing there to kick: they hold no seat, they are in no
-- room, and `removeGuest` on them would end a standing they are not using. If
-- they come back through a link that is still live they are counted again, and
-- if they should not be able to, the control for that is the link.
--
-- `service_role` only. The rows carry every guest's display name, and the one
-- caller is a query the space's own admin surface makes with the service role
-- after it has already proved who is asking - the same guard the rest of
-- `domain/guests/queries.ts` runs behind. `tenant_guest_count` keeps its grant
-- to `authenticated` and reaches this as its definer, which is the whole of the
-- exposure this needs.
-- ============================================================================

create or replace function public.tenant_guests_present(p_tenant_id uuid)
returns setof public.tenant_guests
language sql
stable
security definer
set search_path = public
as $$
  select g.*
    from public.tenant_guests g
   where g.tenant_id = p_tenant_id
     and g.expires_at > now()
     and g.admitted_at is not null
     and (
       /*
        * Admitted a moment ago and not in a world yet.
        *
        * Without this the answer has a hole exactly where it matters most: a
        * visitor who has just come through the door holds a row but has not
        * loaded a world, so a crowd arriving together would every one of them
        * be absent and every one of them let in. Two minutes is comfortably
        * longer than a world takes to load on a bad connection.
        */
       g.admitted_at > now() - interval '2 minutes'
       or exists (
         select 1
           from public.world_occupancy o
          where o.tenant_id = g.tenant_id
            and o.user_id = g.guest_id
            /*
             * Two minutes here as well, and it is a different two minutes.
             * `occupancy_ttl()` is twenty seconds, which is right for "is this
             * room full" - asked at a door somebody is standing at, and it
             * should recover fast. It is wrong for a *seat*: a guest is still
             * using the space while reading the magazine, changing their
             * avatar, or walking between two rooms, none of which is standing
             * in a world. Slow to free a seat costs the next visitor a short
             * wait; quick to free one hands somebody's place to a stranger
             * while they are still looking at it.
             */
            and o.seen_at > now() - interval '2 minutes'
       )
     );
$$;

comment on function public.tenant_guests_present(uuid) is
  'The guests who are in this space right now, by presence rather than by '
  'admission. The one definition of "holding a seat" - tenant_guest_count is '
  'count(*) over this, so the cap and the list an admin kicks from cannot '
  'disagree about who is here.';

revoke execute on function public.tenant_guests_present(uuid) from public;
grant execute on function public.tenant_guests_present(uuid) to service_role;

-- Now the count, over the list. The body it used to carry is above, once.
create or replace function public.tenant_guest_count(p_tenant_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from public.tenant_guests_present(p_tenant_id);
$$;

comment on function public.tenant_guest_count(uuid) is
  'How many guests are in this space right now. count(*) over '
  'tenant_guests_present, which is where the rule lives: somebody who left an '
  'hour ago still holds a valid admission and no longer holds a seat.';
