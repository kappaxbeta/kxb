-- ============================================================================
-- Realtime authorization for lounge presence
-- ----------------------------------------------------------------------------
-- Presence and movement never touch the event log. They are ephemeral by
-- design: where somebody is standing right now is worth a WebSocket frame and
-- nothing more, and recording it would mean storing, forever, that Dave walked
-- left in March. Twenty people at a dozen updates a second is ~240 events a
-- second into an append-only table that then has to be projected - which is not
-- a cost you pay for data nobody will ever read again.
--
-- So the durable/ephemeral line is drawn here: blocks, images and avatar choices
-- go through `events`; position, heading and "is dancing" go over a channel and
-- are gone when you close the tab.
--
-- What still has to hold is *who may listen*. A Realtime topic is otherwise open
-- to anyone with the anon key who can guess it, and a private team's lounge is
-- exactly the thing that must not be guessable. These policies make the topic
-- name itself the authorization question: `lounge:<tenant_id>` is readable and
-- writable only by a member of that tenant.
-- ============================================================================

/**
 * The tenant a lounge topic refers to, or NULL if the topic is not one.
 *
 * A function rather than inline SQL in the policy because the cast has to be
 * allowed to fail. Postgres does not guarantee that AND short-circuits, so a
 * guard like `topic like 'lounge:%' and substring(...)::uuid` can still evaluate
 * the cast on a topic that is not a lounge at all - and a malformed topic would
 * then raise instead of simply being denied.
 */
create or replace function public.lounge_topic_tenant(p_topic text)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_topic is null or left(p_topic, 7) <> 'lounge:' then
    return null;
  end if;
  return substring(p_topic from 8)::uuid;
exception
  when others then
    return null;
end;
$$;

comment on function public.lounge_topic_tenant(text) is
  'Tenant id embedded in a lounge:<uuid> Realtime topic, or NULL.';

-- Receiving. Broadcast and presence messages are read through this table, so a
-- select policy is what decides who can be in the room.
drop policy if exists "lounge_presence_read" on realtime.messages;
create policy "lounge_presence_read"
  on realtime.messages for select
  to authenticated
  using (
    public.tenant_role(public.lounge_topic_tenant(realtime.topic())) is not null
  );

-- Sending. Same rule: you may broadcast your position into a lounge only if you
-- are a member of the workspace whose lounge it is.
drop policy if exists "lounge_presence_write" on realtime.messages;
create policy "lounge_presence_write"
  on realtime.messages for insert
  to authenticated
  with check (
    public.tenant_role(public.lounge_topic_tenant(realtime.topic())) is not null
  );
