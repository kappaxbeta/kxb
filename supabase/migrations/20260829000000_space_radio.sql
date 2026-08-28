-- ============================================================================
-- The radio: one track, playing in the lobby, for everybody at once
-- ----------------------------------------------------------------------------
-- An admin pastes a SoundCloud link and the room hears it together. Two halves,
-- and they answer different questions:
--
--   * *What* is playing is durable, because somebody who walks in ten minutes
--     late has to arrive into the same song forty seconds further along than
--     the person who started it. A broadcast dies with the tab that sent it, so
--     a broadcast alone would mean the radio only existed for whoever happened
--     to be looking when the link was pasted. That is `space_radio` below.
--
--   * *That it changed* is a broadcast, on `radio:<tenant_id>`, because a room
--     that learns about a new track on its next page load is not a room
--     listening to the same thing.
--
-- The comparison worth drawing is with the two neighbours this sits between.
-- Party mode is pure broadcast and writes nothing - it is a colour, it lasts as
-- long as somebody is looking at it, and a dropped packet costs nothing. Chat
-- is durable per message because a sentence has to be reportable. The radio is
-- durable per *station*: there is one row per space, overwritten, because the
-- question it answers is "what is on right now" and last week's answer is not
-- something anybody needs the row for.
--
-- ----------------------------------------------------------------------------
-- Why the audio is not ours
-- ----------------------------------------------------------------------------
-- Nothing here stores or proxies audio. SoundCloud's stream URLs are not
-- CORS-readable and their terms require playback through their own player, so
-- the client embeds the SoundCloud widget and drives it over postMessage. What
-- this table holds is a URL, a start time and an offset - the three numbers you
-- need to point six browsers at the same second of the same song. See
-- src/lib/radio/sync.ts for the arithmetic and why it tolerates drift rather
-- than chasing it.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- The flag
-- ----------------------------------------------------------------------------
-- Off by default, like chat's. A space that has never asked for a radio should
-- not acquire one because we shipped it.
--
-- Unlike chat there is no second, per-space switch beside it. Chat needs one
-- because an open text channel changes what a space *is* whether or not anybody
-- is talking in it; a radio with nothing playing is silence, and the act of
-- starting a track is already the act of turning it on. A switch whose only
-- state is "nothing is playing" is a switch that says what the empty row
-- already says.
-- ----------------------------------------------------------------------------
insert into public.feature_flags (key, enabled, label, description) values
  ('radio', false, 'Space radio',
   'An owner or admin can put a SoundCloud track on, and everybody in the space hears it from the same place.')
on conflict (key) do nothing;

-- ============================================================================
-- Read model: what is on
-- ----------------------------------------------------------------------------
-- One row per space, keyed by the tenant, projected from the `radio` stream.
--
-- The row is *overwritten* rather than appended to, which is the one place this
-- differs in spirit from the read models around it. That is deliberate and it
-- is not lossiness: the log still has every track anybody ever put on, in
-- order, with who put it on - `readAllFrom` can reconstruct the night. This
-- table is only the answer to the question the lobby asks on every page load,
-- and that question has exactly one answer at a time.
-- ============================================================================

create table if not exists public.space_radio (
  tenant_id  uuid        primary key references public.tenants_read_model (id) on delete cascade,

  /**
   * The SoundCloud page URL, as pasted.
   *
   * Stored as given rather than resolved to a track id, because the widget
   * takes the permalink and resolving it here would mean holding a SoundCloud
   * API credential server-side to learn something the widget looks up for free.
   * Validated against a host allowlist before it is ever written - see
   * `trackUrlSchema` in src/domain/radio/commands.ts. That check matters more
   * than it looks: this string ends up in an iframe `src`, so an unvalidated
   * one would be an open embed hole with an admin's finger on it.
   */
  track_url  text,

  /**
   * What to call it, if the widget managed to tell us.
   *
   * Nullable and never trusted for anything but a label. It is read off the
   * *starter's* widget after it loads and sent along, so a track whose page is
   * slow, geo-blocked or embed-disabled for that one person still starts - it
   * just starts unnamed. Making the title a precondition would mean one
   * person's failed lookup silenced the room.
   */
  title      text,

  /**
   * When the track was started, by the database's clock.
   *
   * Copied from the *event's* `created_at` rather than sent by whoever pressed
   * play, and that is the whole synchronisation primitive rather than a detail.
   * Every client works out where in the song it should be from this timestamp,
   * so it has to come from one clock all of them agree on. Take it from the
   * browser instead and a laptop whose clock is ninety seconds fast hears the
   * song ninety seconds ahead of the room, and no amount of drift correction
   * ever finds it - it is not drifting, it is confidently wrong.
   *
   * Which is also why the event carries no timestamp of its own. The log is
   * already stamped by Postgres on append; a second time field in the payload
   * would be a client-supplied number sitting next to the trustworthy one,
   * waiting to be picked by mistake.
   */
  started_at timestamptz,

  /**
   * Where in the track `started_at` refers to, in milliseconds.
   *
   * Almost always 0. It is not always 0 because a pause has to be resumable:
   * stopping records where we got to, and starting again writes that offset
   * with a fresh `started_at`, so the room resumes together rather than
   * restarting together.
   */
  position_ms integer     not null default 0,

  /** False when the radio is off. The URL stays, so "play" can resume it. */
  playing    boolean     not null default false,

  updated_at timestamptz not null,
  version    integer     not null
);

alter table public.space_radio enable row level security;

-- Anybody in the space, guests included. A guest in the lobby hears the room -
-- that is the same line the chat's select policy draws and for the same reason:
-- being let in on a link means being let into what the room is doing.
create policy "space_radio_select_tenant"
  on public.space_radio for select
  to authenticated
  using (public.tenant_role(tenant_id) is not null);

-- On the projector's behalf, not the user's - same as the chat read model.
-- Nobody reaches this table except by replaying events the decider already
-- agreed to, and who may *start* a track is settled twice over: in the action,
-- and by the restrictive policy below.
create policy "space_radio_insert_member"
  on public.space_radio for insert
  to authenticated
  with check (public.is_tenant_member(tenant_id));

create policy "space_radio_update_member"
  on public.space_radio for update
  to authenticated
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

-- ============================================================================
-- Only an owner or an admin may put something on
-- ----------------------------------------------------------------------------
-- This is the boundary, and it needs a shape the codebase has not used before,
-- so it is worth explaining rather than just writing.
--
-- Every other admin-only act in this app is decided by the *tenant* decider,
-- which can check a role because roles are state of the tenant stream it is
-- already folding. The radio deliberately does not live on that stream: track
-- changes are frequent and membership changes are rare, and putting the two
-- together would mean every invitation replayed a night's worth of songs to
-- work out its expected version. So the radio has its own stream - and its own
-- decider consequently cannot see who is an admin.
--
-- The action checks `hasRole`, which is the polite layer. This is the real one.
-- It has to be RESTRICTIVE rather than an ordinary policy because permissive
-- policies for the same command are OR-ed: a second permissive INSERT policy
-- would *widen* what `events_insert_tenant` already allows, which is the exact
-- opposite of the intent. Restrictive policies are AND-ed, so this can only
-- ever subtract.
--
-- Written as "not a radio event, OR an admin" so it is transparent to every
-- other stream type in the app. A restrictive policy applies to all of them,
-- and one that forgot this clause would quietly stop the entire event log.
-- ============================================================================
drop policy if exists "events_radio_admin_only" on public.events;
create policy "events_radio_admin_only"
  on public.events
  as restrictive
  for insert
  with check (
    stream_type <> 'radio'
    or public.tenant_role(tenant_id) in ('owner', 'admin')
  );

-- ============================================================================
-- The Realtime topic
-- ----------------------------------------------------------------------------
-- `radio:<tenant_id>`, and its own topic rather than the chat's or the
-- lounge's, for the reason 20260818010000 had to learn the hard way: a
-- supabase-js client keeps one channel object per topic string, so two
-- components asking for the same topic get the same instance and the second one
-- silently fails to attach its callbacks. The radio dock is mounted for the
-- whole session exactly as the chat dock is, so it needs a string nothing else
-- claims.
--
-- Near-copies of `chat_topic_tenant` and its policies, and deliberately not a
-- generalisation taking a prefix - the same argument that file makes: a shared
-- helper puts the prefix in the policy body, where a later edit adding a fourth
-- caller could widen one of the other three by accident.
-- ============================================================================

create or replace function public.radio_topic_tenant(p_topic text)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_topic is null or left(p_topic, 6) <> 'radio:' then
    return null;
  end if;
  return substring(p_topic from 7)::uuid;
exception
  when others then
    return null;
end;
$$;

comment on function public.radio_topic_tenant(text) is
  'Tenant id embedded in a radio:<uuid> Realtime topic, or NULL.';

-- Hearing about a track change: anybody in the space, guests included, matching
-- the select policy on the table.
drop policy if exists "radio_read" on realtime.messages;
create policy "radio_read"
  on realtime.messages for select
  to authenticated
  using (
    public.tenant_role(public.radio_topic_tenant(realtime.topic())) is not null
  );

-- Announcing one: owners and admins only, which is *narrower* than the chat's
-- equivalent and narrower on purpose. The chat's write policy admits guests
-- because a forged chat broadcast puts text on screens that no row backs and so
-- vanishes on the next refresh. A forged radio broadcast is not like that: it
-- would point every player in the room at an arbitrary URL, immediately, with
-- sound. The durable row is still admin-gated either way, so the forgery would
-- not survive a reload - but "not survive a reload" is not much of an answer
-- when the damage is what everybody just heard.
drop policy if exists "radio_write" on realtime.messages;
create policy "radio_write"
  on realtime.messages for insert
  to authenticated
  with check (
    public.tenant_role(public.radio_topic_tenant(realtime.topic())) in ('owner', 'admin')
  );
