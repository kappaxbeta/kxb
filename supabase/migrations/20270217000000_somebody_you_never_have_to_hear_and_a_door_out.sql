-- ============================================================================
-- Somebody you never have to hear, and a door out of the account
-- ----------------------------------------------------------------------------
-- Two unrelated subjects in one migration because they arrived from one place:
-- App Store review. Guideline 1.2 wants a user-generated-content app to offer
-- **blocking** alongside the reporting it already has, and 5.1.1(v) wants an
-- app that creates accounts to let somebody **delete** theirs from inside it.
-- Neither is a feature anybody asked for by name, and both are the difference
-- between shipping and not.
--
-- They are kept apart below and share nothing but this file.
-- ============================================================================

-- ============================================================================
-- 1. Blocking
-- ----------------------------------------------------------------------------
-- Reporting and blocking answer different questions and it is worth writing
-- down which is which, because the temptation is to build one of them twice.
--
--   * A **report** is addressed to us. It says "somebody should look at this",
--     it goes into a queue, and what happens next is a moderator's decision -
--     see `content_reports` and `chat_message_reports`.
--   * A **block** is addressed to nobody. It is not a complaint, it needs no
--     verdict and it waits for no one: it takes effect the moment it is made
--     and it is undone the moment it is withdrawn.
--
-- So this table has no status column, no reason, no reviewer and no audit
-- trail. Those would all be answers to "was this justified", and the honest
-- answer is that nobody is asking. A block is one person's arrangement of
-- their own room.
-- ============================================================================

create table if not exists public.blocked_users (
  /**
   * Who is doing the blocking. Always the caller - the policies below never
   * admit any other value, so this column cannot be used to block on somebody
   * else's behalf.
   */
  blocker_id uuid        not null references auth.users (id) on delete cascade,

  /**
   * Who they no longer want to hear.
   *
   * `on delete cascade` here is right where it is wrong almost everywhere else
   * in this schema (see 20261223000000): this is not derived from the log and
   * nothing replays it. An account that is gone can say nothing, so a block
   * naming it has no work left to do and should not be kept.
   */
  blocked_id uuid        not null references auth.users (id) on delete cascade,

  created_at timestamptz not null default now(),

  primary key (blocker_id, blocked_id),

  -- Blocking yourself would silence your own messages in your own scrollback,
  -- which reads as the product being broken rather than as a choice being
  -- honoured. Refused here rather than only in the action, because the action
  -- is a POST endpoint and this is a table.
  constraint blocked_users_not_self check (blocker_id <> blocked_id)
);

-- The read is always "everyone I have blocked", which the primary key's own
-- index already answers. The reverse question - "who has blocked me" - is
-- deliberately not asked anywhere and gets no index: a block is not something
-- the blocked person is told about, and an index is the first step towards a
-- feature that tells them.

alter table public.blocked_users enable row level security;

create policy "blocked_users_select_own"
  on public.blocked_users for select
  to authenticated
  using (blocker_id = (select auth.uid()));

create policy "blocked_users_insert_own"
  on public.blocked_users for insert
  to authenticated
  with check (blocker_id = (select auth.uid()));

create policy "blocked_users_delete_own"
  on public.blocked_users for delete
  to authenticated
  using (blocker_id = (select auth.uid()));

-- No update policy. A block has nothing to change: it is made or it is
-- withdrawn, and withdrawing it is the delete above.

comment on table public.blocked_users is
  'One person''s private list of accounts they do not want to hear from. No '
  'status, no reason, no review - a block is an arrangement, not a complaint.';

-- ----------------------------------------------------------------------------
-- Blocking in the chat's select policy, not in a query
-- ----------------------------------------------------------------------------
-- `hidden.ts` filters taken-down blueprints a layer above the database and its
-- comment explains why that was right there: a hidden blueprint must keep
-- resolving for the furniture already standing on it, so only the *listings*
-- may stop.
--
-- A blocked person's message has no such second life. Nothing points at it,
-- nothing renders from it, and there is exactly one thing anyone wants: for it
-- not to arrive. That makes this the `banned_worlds` case rather than the
-- `hidden_content` case, so it goes where the ban went - into the policy, so
-- every reader gets the same answer whether they come through
-- `listChatMessages`, through `readRoomChat`, or through PostgREST by hand.
--
-- The live path is the one place this cannot reach: a message that arrives over
-- Realtime was never selected from this table. `chat-dock.tsx` filters those
-- against the same list, and that is a second copy of the rule - unavoidable,
-- because there are genuinely two transports.
-- ----------------------------------------------------------------------------

create or replace function public.author_is_blocked(p_author_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select p_author_id is not null
     and exists (
       select 1
         from public.blocked_users b
        where b.blocker_id = (select auth.uid())
          and b.blocked_id = p_author_id
     );
$$;

-- SECURITY INVOKER, and that is load-bearing: the subquery is then subject to
-- `blocked_users_select_own`, so the function physically cannot answer a
-- question about anybody else's list even if a future caller asks one.
comment on function public.author_is_blocked(uuid) is
  'Has the caller blocked this author? Asked by the chat read policy. INVOKER '
  'so it can only ever see the caller''s own blocks.';

grant execute on function public.author_is_blocked(uuid) to authenticated;

drop policy if exists "chat_messages_select_tenant" on public.chat_messages_read_model;
create policy "chat_messages_select_tenant"
  on public.chat_messages_read_model
  for select
  to authenticated
  using (
    tenant_role(tenant_id) is not null
    and not public.chat_message_hidden(id)
    and not public.author_is_blocked(author_id)
  );

-- ============================================================================
-- 2. Closing an account
-- ----------------------------------------------------------------------------
-- The account itself is closed in `auth.users` by the application - the address
-- is released, the password and the identities go, and the row is banned so
-- nothing can sign back into it. What that leaves behind is a question nobody
-- can answer afterwards: was this account closed by the person who owned it, or
-- did something else happen to it?
--
-- One row, written at the moment of the deed, answers it. It holds no personal
-- data at all - not the address, not the handle, not the spaces - because the
-- entire point of the act it records is that those are gone. An id and a date
-- is what is left, and it is what a support question a month later actually
-- needs.
--
-- **No foreign key.** Every other "who did this" column in this schema points
-- at `auth.users` so the row can be resolved to a person; this one must not,
-- because the day may come when the auth row is removed for real and this
-- record has to outlive it. That is the same reasoning `content_reports`
-- gives for `target_id`: a cascade would delete the record exactly when it
-- starts to matter.
-- ============================================================================

create table if not exists public.closed_accounts (
  user_id    uuid        primary key,
  closed_at  timestamptz not null default now(),

  /**
   * How many spaces they walked out of on the way, and how many they archived
   * behind them. Counts rather than ids: which spaces somebody was in is the
   * personal data this table exists to be free of, and "left 3, archived 1" is
   * everything a support answer needs.
   */
  spaces_left     integer not null default 0,
  spaces_archived integer not null default 0
);

alter table public.closed_accounts enable row level security;

-- No policies at all, which is the deliberate reading of "operators only":
-- RLS with no policy denies every row to every role that is subject to it, and
-- the service key is not. Nothing signed in can read this, including the
-- person it names - who, by construction, cannot sign in anyway.

comment on table public.closed_accounts is
  'One row per account closed from inside the product. Carries no personal '
  'data - the deed it records is the removal of all of it.';
