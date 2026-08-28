-- ============================================================================
-- Lounge chat: what people say, and what to do about what they said
-- ----------------------------------------------------------------------------
-- The lounge has had emotes since it shipped, and emotes are deliberately
-- undurable: a face is broadcast over Realtime, lives three seconds, and is
-- never written down. Chat cannot work that way, and the reason is not
-- scrollback - it is the report button. You cannot moderate a sentence that
-- only ever existed in six browser tabs. So a message is an event, a row and an
-- id, and the id is what a report names.
--
-- Two gates stand in front of all of it, and they answer different questions:
--
--   * The `chat` feature flag - "may this installation have chat at all". Ours
--     to decide, seeded off, flipped in the backoffice per space or per person
--     like every other flag.
--
--   * `tenants_read_model.chat_enabled` - "does this space want it". Theirs to
--     decide, set by an owner or admin in Space Settings, and recorded on the
--     tenant's own event stream because it is a setting you expect to still
--     hold tomorrow.
--
-- Both must be on. A space that has never heard of chat is not opted into a
-- text channel by us turning a flag on, and a space that wants chat does not
-- get it before we have shipped it to them.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- The space's own switch
-- ----------------------------------------------------------------------------
-- A column beside `lounge_mode` rather than a table of its own, and projected
-- from `ChatEnabledSet` on the tenant stream exactly as `lounge_mode` is
-- projected from `LoungeModeSet`. See src/domain/tenants/projection.ts.
--
-- Defaults false, which is the whole point of it being a separate switch from
-- the flag: turning the feature on for a space must not put words in a room
-- nobody asked to have a chat in.
-- ----------------------------------------------------------------------------
alter table public.tenants_read_model
  add column if not exists chat_enabled boolean not null default false;

-- ----------------------------------------------------------------------------
-- The flag
-- ----------------------------------------------------------------------------
insert into public.feature_flags (key, enabled, label, description) values
  ('chat', false, 'Lounge chat',
   'A text channel in the lounge, alongside the emotes. Each space still has to turn it on for itself in Space Settings.')
on conflict (key) do nothing;

-- ============================================================================
-- Read model: the messages
-- ----------------------------------------------------------------------------
-- One stream per message, like `board_post` and unlike the lounge's chunks. A
-- message has no history worth folding - it is said once and that is the whole
-- of it - so a stream per message keeps every command's load at one row instead
-- of replaying a room's entire conversation to say one more sentence.
--
-- Nothing here records a takedown. That lives in `hidden_chat_messages` below,
-- and the reason is the one 20260803080000 gives for keeping bans off the
-- battlefield's stream: the stream belongs to the space being moderated, and a
-- backoffice admin is not a member of it. They hold the service role, which
-- bypasses RLS but cannot append - `append_events` is security invoker and
-- refuses a caller with no `auth.uid()`. A moderation tool that could only act
-- inside the space it is moderating is not a moderation tool.
-- ============================================================================

create table if not exists public.chat_messages_read_model (
  -- Same id as the aggregate's stream_id, and the id a report names.
  id         uuid        primary key,
  tenant_id  uuid        not null,
  body       text        not null,
  /** Who said it. `actor_id` on the event, copied here so the panel need not join. */
  author_id  uuid,
  /**
   * The handle as it stood when they said it.
   *
   * Denormalised deliberately. A message is a thing somebody said at a moment,
   * and re-labelling last week's conversation because somebody changed their
   * username afterwards would rewrite history to be tidier than it was. It also
   * means the panel renders a hundred messages without a hundred profile
   * lookups, and that a message outlives the account that wrote it - which is
   * exactly the case a moderator is most likely to be reading.
   */
  author_name text       not null default '',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  version    integer     not null
);

-- The scrollback query: one space's conversation, newest first.
create index if not exists chat_messages_read_model_room_idx
  on public.chat_messages_read_model (tenant_id, created_at desc);

alter table public.chat_messages_read_model enable row level security;

-- ============================================================================
-- The takedown list
-- ----------------------------------------------------------------------------
-- Separate from the message row rather than a `hidden` column on it, for the
-- two reasons `banned_worlds` is separate from `battlefields_read_model`:
--
--   * That table is a projection. It is rebuilt from the event log, and a
--     takedown is not something that log says - so a `hidden` column would be
--     cleared by the next replay and the message would come back.
--
--   * The stream belongs to the space being moderated, and its members can
--     write to it. Recording our verdict where they can overwrite it is not
--     recording a verdict.
--
-- Readable by everyone signed in, like `banned_worlds` and for the same reason:
-- the select policy below runs as the caller and has to consult it. A takedown
-- is not a secret - it is the reason a line vanished.
-- ============================================================================

create table if not exists public.hidden_chat_messages (
  message_id uuid        primary key references public.chat_messages_read_model (id) on delete cascade,
  reason     text        not null,
  hidden_by  uuid        references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.hidden_chat_messages enable row level security;

create policy "hidden_chat_messages_select"
  on public.hidden_chat_messages for select
  to authenticated
  using (true);

create policy "hidden_chat_messages_admin_write"
  on public.hidden_chat_messages for all
  to authenticated
  using (public.is_backoffice_admin())
  with check (public.is_backoffice_admin());

-- ----------------------------------------------------------------------------
-- Policies on the messages
-- ----------------------------------------------------------------------------
-- Reading is `tenant_role(...) is not null`, which includes a guest, and that
-- is intended: a guest standing in the lounge can see the emotes and hear the
-- room, and a chat panel they were shown but could not read would be a strange
-- thing to put in front of a visitor.
--
-- The `not exists` is what a takedown actually does, and it is written into the
-- policy rather than into every query for the reason `battlefields_select`
-- carries its ban check the same way: a filter that lives in one query is a
-- filter the next query forgets. A backoffice admin still reads the message,
-- because they hold the service role and RLS does not apply to it - which is
-- the point, since the queue has to show what it took down.
--
-- Writing is `is_tenant_member(...)`, which excludes a guest. That is the same
-- line 20260813000000 drew through the event log - "a guest takes part in
-- matches and does nothing else durable" - drawn here rather than only in the
-- action so that it holds for a guest driving PostgREST by hand. A guest may
-- read the room and pull faces at it; they may not leave writing on the wall of
-- a space they are visiting on a link, under a name they chose at the door.
--
-- The write policy is on the projector's behalf, not the user's: nobody reaches
-- this table except through a projection replaying events the decider already
-- agreed to. Who may say something is decided in src/domain/chat/actions.ts,
-- against the caller's role and the two gates above, and by
-- `events_insert_tenant` underneath that.
-- ----------------------------------------------------------------------------

create policy "chat_messages_select_tenant"
  on public.chat_messages_read_model for select
  to authenticated
  using (
    public.tenant_role(tenant_id) is not null
    and not exists (
      select 1 from public.hidden_chat_messages h
       where h.message_id = chat_messages_read_model.id
    )
  );

create policy "chat_messages_insert_member"
  on public.chat_messages_read_model for insert
  to authenticated
  with check (public.is_tenant_member(tenant_id));

create policy "chat_messages_update_member"
  on public.chat_messages_read_model for update
  to authenticated
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

-- No delete policy. The log is append-only and so is its projection.

-- ============================================================================
-- Reporting a message
-- ----------------------------------------------------------------------------
-- Shaped after `world_reports` in 20260803080000 down to the column names,
-- because it is the same problem with a different subject and the backoffice
-- queue reads both. What that migration says about privacy applies here word
-- for word and is worth repeating: the reporter is never shown to the space.
-- Knowing who complained is the thing that stops people complaining, and in a
-- chat - where the reported person is standing in the room with you - that is
-- not a theoretical concern.
--
-- `reported_by` is the column the request asked for by name, alongside the
-- reason. It is a real foreign key to auth.users, so a report can always be
-- traced to an account; `on delete set null` keeps the report and its reason in
-- the queue when the account goes, because a resolved report is a record of
-- what an admin did and why.
-- ============================================================================

create table if not exists public.chat_message_reports (
  id          uuid        primary key default gen_random_uuid(),
  message_id  uuid        not null references public.chat_messages_read_model (id) on delete cascade,
  /** Who reported it, and from which space. */
  reported_by uuid        references auth.users (id) on delete set null,
  tenant_id   uuid        references public.tenants_read_model (id) on delete set null,
  reason      text        not null,
  status      text        not null default 'open'
                check (status in ('open', 'upheld', 'dismissed')),
  resolved_by uuid        references auth.users (id) on delete set null,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists chat_message_reports_open_idx
  on public.chat_message_reports (status, created_at desc);

create index if not exists chat_message_reports_message_idx
  on public.chat_message_reports (message_id);

-- One open report per person per message, for the reason the world queue has
-- the same index: a frustrated reporter clicking twice should not become two
-- rows for an admin to read, and should not make one complaint look like two.
create unique index if not exists chat_message_reports_one_open_per_reporter_idx
  on public.chat_message_reports (message_id, reported_by)
  where status = 'open';

alter table public.chat_message_reports enable row level security;

-- Members may report, and may read back what they reported. `is_tenant_member`
-- rather than `tenant_role(...) is not null`, matching the messages table: a
-- guest writes nothing durable, and a report is durable. It is also the shape
-- the guest-hardening assertion in 20260813000000 exists to enforce, and a new
-- table keyed the other way would be exactly the hole it was written to catch.
create policy "chat_message_reports_insert_own"
  on public.chat_message_reports for insert
  to authenticated
  with check (
    reported_by = (select auth.uid())
    and public.is_tenant_member(tenant_id)
  );

create policy "chat_message_reports_select_own"
  on public.chat_message_reports for select
  to authenticated
  using (reported_by = (select auth.uid()));

-- Backoffice admins see and resolve everything, through the same email
-- allowlist the rest of the backoffice is gated on.
create policy "chat_message_reports_admin_all"
  on public.chat_message_reports for all
  to authenticated
  using (public.is_backoffice_admin())
  with check (public.is_backoffice_admin());
