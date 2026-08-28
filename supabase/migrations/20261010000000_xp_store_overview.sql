-- ============================================================================
-- What is stored under this space
-- ----------------------------------------------------------------------------
-- docs/xp/state.md §7.5, Reading A. A space owner asking which of their XPs
-- hold saves, how much, and when they were last written - so that "our games are
-- keeping something about our players" is a question with an answer rather than
-- a guess.
--
-- ---------------------------------------------------------------------------
-- Sizes and keys, never contents
-- ---------------------------------------------------------------------------
-- §3.4 is the rule this function exists to keep rather than to route around:
-- **an XP's owner cannot read a `player` row.** They own the game, not the
-- people playing it. So this returns a count, a byte total, a last-written
-- timestamp, and for the space's own row the *names* of its fields - and never a
-- value from a `player` row, not even one.
--
-- That is why it is a function at all. The select policy already refuses the
-- owner those rows, correctly, which also means an aggregate over them is
-- refused. A `security definer` that returns only counts is the narrowest way to
-- answer "how much" without answering "what" - the alternative being a policy
-- that lets an owner read player rows and a promise that the UI will not show
-- them, which is the arrangement that eventually shows them.
--
-- ---------------------------------------------------------------------------
-- Owners and admins, not every member
-- ---------------------------------------------------------------------------
-- A member plays the games; this is the operator's window onto stored personal
-- data, and it belongs with the people who answer for it. `tenant_role` is the
-- same membership test every other policy since 20260725130000 uses.
-- ============================================================================

create or replace function public.xp_store_overview(p_tenant uuid)
returns table (
  xp_id       uuid,
  xp_name     text,
  scope       text,
  rows        bigint,
  bytes       bigint,
  keys        text[],
  last_write  timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  -- The keys are per row and everything else is per group, so the row-level
  -- work happens once, inside, and the outside only counts. Written this way
  -- because the obvious shape - the key subquery in the grouped select - reads
  -- fine and does not compile: it uses an ungrouped column from the outer query.
  select
    r.xp_id,
    r.xp_name,
    r.scope,
    count(*)                                        as rows,
    sum(r.bytes)                                    as bytes,
    /**
     * Keyed off the grouped columns, which is what makes it legal here.
     *
     * `xp_id` and `scope` are both in the `group by`, so a subquery may use
     * them; the value column may not, which is the whole reason this is not
     * simply `jsonb_object_keys(value)` in the select list. It reads as a second
     * visit to the table and costs one index lookup on a row already in cache.
     */
    (
      select array_agg(k order by k)
      from public.xp_store s2, jsonb_object_keys(s2.value) as k
      where s2.xp_id = r.xp_id and s2.scope = 'space' and r.scope = 'space'
    )                                               as keys,
    max(r.updated_at)                               as last_write
  from (
    select
      s.xp_id,
      x.name                    as xp_name,
      s.scope,
      pg_column_size(s.value)   as bytes,
      s.updated_at
    from public.xp_store s
    join public.xps_read_model x on x.id = s.xp_id
    where x.tenant_id = p_tenant
      and public.tenant_role(p_tenant) in ('owner', 'admin')
  ) r
  group by r.xp_id, r.xp_name, r.scope
  order by r.xp_name, r.scope;
$$;

comment on function public.xp_store_overview(uuid) is
  'state.md §7.5 Reading A: sizes and keys of a space''s XP stores, never contents.';
