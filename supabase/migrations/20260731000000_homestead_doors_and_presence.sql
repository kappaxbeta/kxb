-- ============================================================================
-- Front doors, and presence in the rooms behind them
-- ----------------------------------------------------------------------------
-- Two changes that only make sense together.
--
-- 20260730000000 gave every member their own café, house and garden. The moment
-- those are personal, "can a colleague come in" becomes a question somebody has
-- to answer - so this adds the door setting, and the Realtime authorization for
-- the rooms it guards.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- The door
-- ----------------------------------------------------------------------------
-- One setting for the whole homestead, not one per place. The three rooms are
-- connected by doors you walk through; a house you can be ejected from by
-- stepping into the garden is not a coherent thing to have built.
--
-- Defaults to 'knock'. The first time somebody walks into your kitchen
-- unannounced is the moment you discover the default was wrong, and by then
-- they are already standing in it - so the recoverable mistake (a visitor
-- waits) is the one this picks.
alter table public.homestead_read_model
  add column if not exists access_mode text not null default 'knock';

-- The projection writes this column from `HomesteadAccessSet`, whose payload is
-- already narrowed by Zod. The constraint is the second layer: an enum the
-- database itself understands, so a bad value cannot be introduced by a manual
-- fix-up or a future projection that forgets what the legal set is.
alter table public.homestead_read_model
  drop constraint if exists homestead_access_mode_check;

alter table public.homestead_read_model
  add constraint homestead_access_mode_check
  check (access_mode in ('open', 'knock', 'closed'));

comment on column public.homestead_read_model.access_mode is
  'Who may enter this member''s homestead: open | knock | closed. Folded from HomesteadAccessSet.';

-- ----------------------------------------------------------------------------
-- Realtime authorization for the per-room topics
-- ----------------------------------------------------------------------------
-- The lounge's presence policies (20260727010000) still stand and are untouched:
-- `lounge:<tenant_id>` remains the commons, open to every member of the
-- workspace. This adds the shape the owned rooms use:
--
--     room:<tenant_id>:<place>:<owner_id>
--
-- The authorization question stops at the *workspace*, exactly as the lounge's
-- does. Membership is what this layer can check cheaply and correctly, and it is
-- what stops a stranger with the anon key guessing a topic.
--
-- The door itself is deliberately NOT enforced here, and that is worth being
-- explicit about rather than discovering later. A Postgres policy on
-- realtime.messages cannot express "unless the owner has let you in during this
-- session", because the invitation is ephemeral - it lives in two browser tabs
-- and dies with them, which is the whole design (see the knock/invite flow in
-- src/app/world/presence.tsx).
--
-- So the honest summary of what a closed door is worth: it stops a colleague
-- from *appearing in your room* through the app, and it does not stop a
-- determined member of the same workspace from subscribing to the topic by hand
-- and reading positions off the wire. That is the same guarantee the lounge
-- gives, against people who are already inside your workspace, about data that
-- is three seconds of "somebody is standing near the sofa".
--
-- If the door ever needs to be a real boundary, this is the wrong layer to
-- patch: it would want a durable guest list (a table these policies could
-- join against), which is the option deliberately not taken.
create or replace function public.room_topic_tenant(p_topic text)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
declare
  parts text[];
begin
  if p_topic is null or left(p_topic, 5) <> 'room:' then
    return null;
  end if;

  -- room : tenant : place : owner  ->  four parts, and no more. A topic with a
  -- fifth segment is not one of ours and must not be authorized by accident.
  parts := string_to_array(p_topic, ':');
  if array_length(parts, 1) <> 4 then
    return null;
  end if;

  if parts[3] not in ('cafe', 'home', 'outdoor') then
    return null;
  end if;

  -- Both uuids must parse. The owner's is not returned - membership is checked
  -- against the tenant - but a topic naming a malformed owner is malformed.
  perform parts[4]::uuid;
  return parts[2]::uuid;
exception
  -- The cast has to be allowed to fail. Postgres does not guarantee that AND
  -- short-circuits, so a guard in the policy itself could still evaluate the
  -- cast on a topic that is not a room at all, and a malformed topic would
  -- raise instead of simply being denied. Same reasoning as
  -- `lounge_topic_tenant`, which this deliberately mirrors.
  when others then
    return null;
end;
$$;

comment on function public.room_topic_tenant(text) is
  'Tenant id embedded in a room:<tenant>:<place>:<owner> Realtime topic, or NULL.';

-- Receiving. Broadcast and presence messages are read through this table, so a
-- select policy is what decides who can be in the room.
drop policy if exists "room_presence_read" on realtime.messages;
create policy "room_presence_read"
  on realtime.messages for select
  to authenticated
  using (
    public.tenant_role(public.room_topic_tenant(realtime.topic())) is not null
  );

-- Sending. Same rule: you may broadcast into a room only if you are a member of
-- the workspace it belongs to.
drop policy if exists "room_presence_write" on realtime.messages;
create policy "room_presence_write"
  on realtime.messages for insert
  to authenticated
  with check (
    public.tenant_role(public.room_topic_tenant(realtime.topic())) is not null
  );
