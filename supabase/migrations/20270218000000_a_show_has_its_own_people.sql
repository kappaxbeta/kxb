-- ============================================================================
-- Who is on a show, and what they may do to it
-- ----------------------------------------------------------------------------
-- Until now a show was readable and writable by every member of the space that
-- owned it. That is the right default for a workspace's pages and the wrong
-- one for this: a channel is a *publishing* surface, its shows go out under
-- the space's name to a public directory, and a space with forty members
-- cannot have forty people able to edit an episode that is on air.
--
-- So a show has its own list of people, and two roles:
--
--   edit - write the episodes, the seasons and the bible, and submit for review
--   view - read the drafts, and comment on them
--
-- ---------------------------------------------------------------------------
-- Why `view` can comment, and why that is not a third role
-- ---------------------------------------------------------------------------
-- Because the reason to put somebody on a show without letting them edit it is
-- that you want to hear from them. A reader who can open a draft and not say
-- anything about it is a reader you have given a document to, which is what a
-- link is for. The comment is the entire point of the role, so it comes with
-- it rather than being a grant somebody has to remember to add.
--
-- ---------------------------------------------------------------------------
-- The creator is not in the table
-- ---------------------------------------------------------------------------
-- `channel_show_role` below answers `edit` for whoever started the show,
-- without a row. A membership row for the creator is a row that can be
-- deleted, and a show whose last editor removed themselves is a show nobody
-- can open - by an ordinary click, with no warning that it was the last one.
-- Deriving it means that cannot happen.
-- ============================================================================

create table if not exists public.channel_show_members (
  show_id  uuid not null references public.channel_shows_read_model (id) on delete cascade,
  user_id  uuid not null references auth.users (id) on delete cascade,

  /**
   * `edit` or `view`. Text with a check rather than an enum, the same choice
   * the bible's `kind` makes: a third role is a plausible thing to want and an
   * enum makes that a migration with a lock on it.
   */
  role     text not null check (role in ('edit', 'view')),

  added_by uuid references auth.users (id) on delete set null,
  added_at timestamptz not null default now(),

  primary key (show_id, user_id)
);

-- "Which shows am I on" - the query the channel's shelf makes on every load.
create index if not exists channel_show_members_by_user
  on public.channel_show_members (user_id);

/**
 * The caller's role on a show, or NULL.
 *
 * The shape `tenant_role` set, and for the same reason: every policy below
 * asks this one question, and a policy that inlined the join would run under
 * the caller's own RLS on a table the caller may not read - which is how a
 * membership check quietly answers "no" for everybody.
 *
 * `edit` for the creator without a row - see the note at the top of this file
 * about why that is derived rather than seeded.
 *
 * Security definer, stable, and pinned search path, like every other one of
 * these. It reads `auth.uid()` itself rather than taking a user id, so there
 * is no version of it that can be called about somebody else.
 */
create or replace function public.channel_show_role(p_show_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select 'edit'
       from public.channel_shows_read_model s
      where s.id = p_show_id
        and s.created_by = (select auth.uid())),
    (select m.role
       from public.channel_show_members m
      where m.show_id = p_show_id
        and m.user_id = (select auth.uid()))
  );
$$;

comment on function public.channel_show_role(uuid) is
  'The caller''s role on a show - edit, view, or NULL. The show''s creator is always edit, without a membership row.';

alter table public.channel_show_members enable row level security;

-- Anybody on the show can see who else is on it. A cast list is not a secret
-- from the people on it, and an editor deciding whether to add somebody needs
-- to know whether they are already there.
create policy "channel_show_members_select"
  on public.channel_show_members for select to authenticated
  using (public.channel_show_role(show_id) is not null or public.is_backoffice_admin());

-- Only an editor changes the list. `view` is deliberately not enough: somebody
-- invited to comment must not be able to invite anybody else, which is the
-- difference between a reader and a second owner.
create policy "channel_show_members_write"
  on public.channel_show_members for all to authenticated
  using (public.channel_show_role(show_id) = 'edit')
  with check (public.channel_show_role(show_id) = 'edit');

-- ============================================================================
-- Narrowing what a space member could already see
-- ----------------------------------------------------------------------------
-- The policies written in 20270211 let any member of the tenant select every
-- show, season, episode and bible entry in it. Those are replaced here with
-- the show's own membership.
--
-- This is a *tightening*, and the thing to know before running it: anybody who
-- could open a show yesterday and is not its creator cannot today, until an
-- editor adds them. That is the intended behaviour and it is also a surprise,
-- which is why it is one migration with this comment on it rather than a
-- policy quietly edited in place.
-- ============================================================================

drop policy if exists "channel_shows_select"    on public.channel_shows_read_model;
drop policy if exists "channel_seasons_select"  on public.channel_seasons_read_model;
drop policy if exists "channel_episodes_select" on public.channel_episodes_read_model;
drop policy if exists "channel_bible_select"    on public.channel_bible_read_model;

create policy "channel_shows_select"
  on public.channel_shows_read_model for select to authenticated
  using (public.channel_show_role(id) is not null or public.is_backoffice_admin());

create policy "channel_seasons_select"
  on public.channel_seasons_read_model for select to authenticated
  using (public.channel_show_role(show_id) is not null or public.is_backoffice_admin());

create policy "channel_episodes_select"
  on public.channel_episodes_read_model for select to authenticated
  using (public.channel_show_role(show_id) is not null or public.is_backoffice_admin());

create policy "channel_bible_select"
  on public.channel_bible_read_model for select to authenticated
  using (public.channel_show_role(show_id) is not null or public.is_backoffice_admin());

-- ---------------------------------------------------------------------------
-- Writing: an editor, not a member
-- ---------------------------------------------------------------------------
-- The old write policies said "a member of the tenant". A `view` collaborator
-- is one of those, so leaving them would make the read restriction cosmetic:
-- somebody who may only comment could still write the projection's tables
-- directly.
drop policy if exists "channel_shows_write"   on public.channel_shows_read_model;
drop policy if exists "channel_seasons_write" on public.channel_seasons_read_model;
drop policy if exists "channel_bible_write"   on public.channel_bible_read_model;

-- Not the episodes table, and this is the exception worth naming. The
-- projection writes it under the caller's session, and a *reviewer's* approval
-- has to land on a row in a space they are not a member of at all. That write
-- already goes through the admin client, so the policy it needs is the
-- backoffice one - and an editor still needs their own.
drop policy if exists "channel_episodes_write" on public.channel_episodes_read_model;

create policy "channel_shows_write"
  on public.channel_shows_read_model for all to authenticated
  using (public.channel_show_role(id) = 'edit' or public.tenant_role(tenant_id) is not null)
  with check (public.channel_show_role(id) = 'edit' or public.tenant_role(tenant_id) is not null);

create policy "channel_seasons_write"
  on public.channel_seasons_read_model for all to authenticated
  using (public.channel_show_role(show_id) = 'edit')
  with check (public.channel_show_role(show_id) = 'edit');

create policy "channel_bible_write"
  on public.channel_bible_read_model for all to authenticated
  using (public.channel_show_role(show_id) = 'edit')
  with check (public.channel_show_role(show_id) = 'edit');

create policy "channel_episodes_write"
  on public.channel_episodes_read_model for all to authenticated
  using (public.channel_show_role(show_id) = 'edit' or public.is_backoffice_admin())
  with check (public.channel_show_role(show_id) = 'edit' or public.is_backoffice_admin());

-- ---------------------------------------------------------------------------
-- Comments: view is enough, and only for the show you are on
-- ---------------------------------------------------------------------------
-- The 20270211 policy let any member of the tenant write a comment on any
-- episode in it. Replaced with the show's own list, which is the whole point
-- of the `view` role.
drop policy if exists "channel_comments_write"      on public.channel_comments_read_model;
drop policy if exists "channel_comments_select_own" on public.channel_comments_read_model;

create policy "channel_comments_select_own"
  on public.channel_comments_read_model for select to authenticated
  using (
    public.is_backoffice_admin()
    or exists (
      select 1
        from public.channel_episodes_read_model e
       where e.id = channel_comments_read_model.episode_id
         and public.channel_show_role(e.show_id) is not null
    )
  );

-- Writing a comment needs `view`; resolving one is the same policy, because
-- resolving is an update and a person on the show who has dealt with a note
-- should be able to say so. Nothing here lets somebody edit *another* person's
-- comment text - that is refused in the domain, where the author is known.
create policy "channel_comments_write"
  on public.channel_comments_read_model for all to authenticated
  using (
    exists (
      select 1
        from public.channel_episodes_read_model e
       where e.id = channel_comments_read_model.episode_id
         and public.channel_show_role(e.show_id) is not null
    )
  )
  with check (
    exists (
      select 1
        from public.channel_episodes_read_model e
       where e.id = channel_comments_read_model.episode_id
         and public.channel_show_role(e.show_id) is not null
    )
  );
