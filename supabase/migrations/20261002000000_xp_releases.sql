-- ============================================================================
-- Releases: which versions were ever approved, and which one is live
-- ----------------------------------------------------------------------------
-- `xps_read_model.published_version` is a single integer, and it answers one
-- question well: what does the store serve right now. It cannot answer the two
-- that matter the moment a project has shipped more than once - what has been
-- approved before, and can we go back to it.
--
-- Without this table, "go back" has only one shape: re-submit an old version
-- and wait for review. That is a strange thing to ask of somebody whose only
-- problem is that the version they shipped an hour ago has a bug in it, and
-- whose fix is a version we already read and approved.
--
-- ---------------------------------------------------------------------------
-- What a release is, and why the primary key is (xp_id, version)
-- ---------------------------------------------------------------------------
-- A release is *a version having been approved*, not an act of switching to it.
-- Rolling forward and back between two releases does not make four rows; it
-- moves `published_version` between two that already exist.
--
-- The alternative - a row per switch, with a timestamp range - is a real audit
-- log and answers "what was live on the 4th". Nothing asks that. What everything
-- asks is "what can I go back to", and that is a set of versions rather than a
-- history of pointings. When the audit question does turn up, the event log
-- already has it: XpPublished and XpRolledBack are both in the stream with
-- their times and their actors.
--
-- ---------------------------------------------------------------------------
-- Rolling back does not need a review, and that is the point
-- ---------------------------------------------------------------------------
-- Everything in this table has already been read and approved. Moving between
-- rows is therefore not a way around review - it is movement *inside* what
-- review already permitted, which is why the owner may do it themselves rather
-- than waiting for us. The invariant that keeps that true is enforced in the
-- decider: you may only roll back to a version that has a row here.
-- ============================================================================

create table if not exists public.xp_releases (
  xp_id            uuid        not null references public.xps_read_model (id) on delete cascade,
  /** A version in `xp_versions`. Approved, and therefore go-back-able forever. */
  version          integer     not null check (version > 0),

  /** When it was first approved. Not when it was last made live. */
  released_at      timestamptz not null default now(),
  released_by      uuid        references auth.users (id) on delete set null,

  /**
   * Set when this release was taken down, cleared if it goes live again.
   *
   * A withdrawn release stays in the table. Removing the row would delete the
   * evidence that we once approved something we later pulled, which is exactly
   * the row a moderation question wants, and it would also silently make the
   * version un-rollback-to-able - which is right for a take-down and wrong for
   * an ordinary supersede, and the table cannot tell those apart. The reason
   * text is what tells them apart, and it is written for whoever made it.
   */
  withdrawn_at     timestamptz,
  withdrawn_reason text,

  primary key (xp_id, version)
);

-- The picker: what can this project go back to, newest first.
create index if not exists xp_releases_xp_idx
  on public.xp_releases (xp_id, version desc);

alter table public.xp_releases enable row level security;

-- Who may see the release history.
--
-- Narrower than `may_read_xp` and wider than `may_read_xp_version`: a stranger
-- playing a published project has no business knowing it shipped four times and
-- pulled one of them, and everybody who could open the drafts already knows
-- more than that. So it is the people with a relationship to the project, and
-- not the public.
create policy "xp_releases_select"
  on public.xp_releases for select
  to authenticated
  using (
    exists (
      select 1 from public.xps_read_model x
      where x.id = xp_id
        and (
          x.owner_id = (select auth.uid())
          or public.tenant_role(x.tenant_id) is not null
          or exists (
            select 1 from public.xp_grants g
            where g.xp_id = x.id and g.account_id = (select auth.uid())
          )
        )
    )
  );

-- The projection runs as the signed-in member, so the space's members are who
-- need to write here. The narrower rules - that only the backoffice may create
-- a release, and only the owner may move between them - are the decider's, for
-- the same reason the grants table's are: a policy cannot ask who owns a
-- project without reading the read model it is projecting into.
create policy "xp_releases_write"
  on public.xp_releases for all
  to authenticated
  using (
    exists (
      select 1 from public.xps_read_model x
      where x.id = xp_id and public.tenant_role(x.tenant_id) is not null
    )
  )
  with check (
    exists (
      select 1 from public.xps_read_model x
      where x.id = xp_id and public.tenant_role(x.tenant_id) is not null
    )
  );

comment on table public.xp_releases is
  'Versions that have been approved, and are therefore available to roll back '
  'to without a second review. xps_read_model.published_version says which one '
  'is live; this says which ones could be.';
