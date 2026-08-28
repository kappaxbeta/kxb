-- ============================================================================
-- The chat gets its own Realtime topic
-- ----------------------------------------------------------------------------
-- `<ChatDock>` used to broadcast on `lounge:<tenant_id>`, reusing a topic that
-- was already open and already policy-checked. That was a real saving right up
-- until the dock moved into the sidebar, where it is mounted for the whole
-- session - and it then collided with the lounge itself.
--
-- The collision is a supabase-js one rather than a policy one, and it is worth
-- writing down because nothing about it is visible in either file. A client
-- keeps one channel object per topic string: `supabase.channel('lounge:x')`
-- called a second time hands back the *same* instance, already subscribed. So
-- the dock subscribed first from the rail, `<Multiplayer>` then asked for what
-- it thought was a fresh channel, and got:
--
--   cannot add `presence` callbacks for realtime:lounge:<id> after subscribe()
--
-- Two subscribers, one topic, and the second one silently loses. Both surfaces
-- want the same tenant boundary but they are not the same conversation: one is
-- bodies in a room and ends when you walk out, the other is text that must
-- outlive every scene. Different lifetimes, different topics.
--
-- The rule is unchanged - a member of the tenant, and nobody else. These are
-- added beside the lounge's policies rather than replacing them, for the reason
-- the battles migration gives: policies for one command are OR-ed, so `lounge:`
-- and `battle:` topics keep working exactly as they did.
-- ============================================================================

/**
 * The tenant a chat topic refers to, or NULL if the topic is not one.
 *
 * A near-copy of `lounge_topic_tenant`, and deliberately not a generalisation
 * of it that takes a prefix. These two functions are what the policies below
 * are *about*: a single parameterised helper would put the prefix in the policy
 * body, where a future edit adding a third caller could widen the lounge's rule
 * by accident. Five duplicated lines are cheaper than that.
 *
 * plpgsql rather than inline SQL because the cast has to be allowed to fail -
 * Postgres does not guarantee AND short-circuits, so a malformed topic would
 * otherwise raise instead of simply being denied.
 */
create or replace function public.chat_topic_tenant(p_topic text)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_topic is null or left(p_topic, 5) <> 'chat:' then
    return null;
  end if;
  return substring(p_topic from 6)::uuid;
exception
  when others then
    return null;
end;
$$;

comment on function public.chat_topic_tenant(text) is
  'Tenant id embedded in a chat:<uuid> Realtime topic, or NULL.';

-- Receiving. Broadcast messages are read through this table, so a select policy
-- is what decides who can hear the conversation.
drop policy if exists "chat_read" on realtime.messages;
create policy "chat_read"
  on realtime.messages for select
  to authenticated
  using (
    public.tenant_role(public.chat_topic_tenant(realtime.topic())) is not null
  );

-- Sending. Same rule. Note this admits guests, exactly as the lounge policy
-- does - `tenant_role()` calls an admitted guest a guest, not nobody. Whether a
-- guest may *post* is a product question rather than a security one, and it is
-- answered in one place by `writeBlockedReason`, which the action re-checks at
-- the boundary. A guest who forged a broadcast past it would be putting text on
-- other people's screens that no `chat_messages` row backs, and so nothing that
-- survives a refresh or can be reported.
drop policy if exists "chat_write" on realtime.messages;
create policy "chat_write"
  on realtime.messages for insert
  to authenticated
  with check (
    public.tenant_role(public.chat_topic_tenant(realtime.topic())) is not null
  );
