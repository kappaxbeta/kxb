-- ============================================================================
-- A summons travels its own topic
-- ----------------------------------------------------------------------------
-- `/battle` in the chat calls people who are standing in the room with you: a
-- menu, a match, and an interception on everybody chosen - confirm and you are
-- in the arena. The interception is a Realtime broadcast, and the question this
-- migration answers is which topic it rides.
--
-- Not `chat:<tenant>`: the dock re-subscribes that topic per conversation, so a
-- summons sent while somebody is reading the café's room would sail past them
-- on a topic they are not on. Not `lounge:<tenant>` either - supabase-js keeps
-- one channel object per topic string, and the 20260818010000 migration is the
-- write-up of what happens when a rail component and the scene fight over one.
--
-- So the summons gets what the chat got: a topic of its own, subscribed once
-- for the whole session by the dock that draws the interception, gated on the
-- same membership as everything else in the space. Policies for one command are
-- OR-ed, so `lounge:`, `battle:` and `chat:` topics keep working exactly as
-- they did.
-- ============================================================================

/**
 * The tenant a summon topic refers to, or NULL if the topic is not one.
 *
 * A near-copy of `chat_topic_tenant`, and deliberately not a generalisation
 * that takes a prefix - that migration's note says why, and it is still true:
 * a single parameterised helper would put the prefix in the policy body, where
 * a future edit adding a caller could widen another topic's rule by accident.
 *
 * plpgsql rather than inline SQL because the cast has to be allowed to fail -
 * Postgres does not guarantee AND short-circuits, so a malformed topic would
 * otherwise raise instead of simply being denied.
 */
create or replace function public.summon_topic_tenant(p_topic text)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_topic is null or left(p_topic, 7) <> 'summon:' then
    return null;
  end if;
  return substring(p_topic from 8)::uuid;
exception
  when others then
    return null;
end;
$$;

comment on function public.summon_topic_tenant(text) is
  'Tenant id embedded in a summon:<uuid> Realtime topic, or NULL.';

-- Receiving. Broadcast messages are read through this table, so a select policy
-- is what decides who can be summoned.
drop policy if exists "summon_read" on realtime.messages;
create policy "summon_read"
  on realtime.messages for select
  to authenticated
  using (
    public.tenant_role(public.summon_topic_tenant(realtime.topic())) is not null
  );

-- Sending. Same rule, guests included, exactly as the chat policy admits them -
-- `tenant_role()` calls an admitted guest a guest, not nobody. A forged summons
-- names a battle the receiver still has to be allowed into: the battle page and
-- `joinBattle` re-check membership at the boundary, so the worst a forgery puts
-- on anybody's screen is an invitation to a door that will not open.
drop policy if exists "summon_write" on realtime.messages;
create policy "summon_write"
  on realtime.messages for insert
  to authenticated
  with check (
    public.tenant_role(public.summon_topic_tenant(realtime.topic())) is not null
  );
