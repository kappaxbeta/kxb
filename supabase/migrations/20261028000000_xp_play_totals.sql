-- ============================================================================
-- How much a world was played
-- ----------------------------------------------------------------------------
-- 20261027000000 started writing sessions down and said nothing reads them. This
-- is the first reader, and it exists because something on screen was already
-- claiming to be this number: `xps_read_model.plays` is ordered by and printed
-- in the backoffice review queue ("most played first"), and **nothing has ever
-- written to it**. Every project has shown `0 plays` since the column was
-- created, and the sort has been a no-op over a column of zeros.
--
-- ---------------------------------------------------------------------------
-- Derived, not accumulated
-- ---------------------------------------------------------------------------
-- The obvious repair is a trigger that increments the counter. docs/xp/creator.md
-- §18.3 already refused that shape for the fund - *accrual is computed from the
-- log, not accumulated in a counter* - and the argument is not about money: a
-- counter cannot be recomputed, so a bug in it is permanent, and it disagrees
-- with the rows the moment anything is deleted. `on delete set null` on the
-- account means rows *do* change, which is exactly the case a counter gets
-- wrong and this gets right for free.
--
-- ---------------------------------------------------------------------------
-- Prefixes, because the spelling belongs to one module
-- ---------------------------------------------------------------------------
-- Sessions are keyed by reference - `p-<uuid>-v3` - and "how much was this
-- world played" wants every version of it. The caller passes the prefix it
-- built with `domain/xps/ref.ts` (`projectRefPrefix`) rather than a uuid this
-- function pastes into a pattern of its own, because that module says it is the
-- only place that knows how a reference is spelled, and a second spelling in SQL
-- is how two of them end up disagreeing about which sessions are whose.
--
-- The honest cost: `like prefix || '%'` on a default-collation column does not
-- use the btree on `xp_ref`. At a row per session and a backoffice page asking,
-- a sequential scan is the right answer for a long time; the fix when it stops
-- being one is a `text_pattern_ops` index, not a shape change here.
--
-- ---------------------------------------------------------------------------
-- Invoker, so the policy is still the boundary
-- ---------------------------------------------------------------------------
-- No `security definer`. `xp_sessions` grants select to backoffice admins and to
-- nobody else, so this answers with zeroes for anybody else who calls it rather
-- than needing a gate of its own - the same arrangement, and the same reason,
-- as every policy since 20261003000000: one place for the rule.
-- ============================================================================

create or replace function public.xp_play_totals(p_prefixes text[])
returns table (
  prefix      text,
  plays       bigint,
  seconds     bigint,
  last_played timestamptz
)
language sql
stable
set search_path = public
as $$
  select
    p.prefix,
    count(s.id)                    as plays,
    coalesce(sum(s.seconds), 0)    as seconds,
    max(s.ended_at)                as last_played
  from unnest(p_prefixes) as p(prefix)
  -- A left join, so a world nobody has played comes back as a zero rather than
  -- as a missing key the caller has to remember to default. The one that is
  -- absent is the one somebody forgets.
  left join public.xp_sessions s on s.xp_ref like p.prefix || '%'
  group by p.prefix
$$;

grant execute on function public.xp_play_totals(text[]) to authenticated;

comment on function public.xp_play_totals(text[]) is
  'Sessions per world, for a list of reference prefixes from '
  'domain/xps/ref.ts. Security invoker: xp_sessions'' own policy decides who '
  'sees anything, so this returns zeroes rather than a refusal.';
