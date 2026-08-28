-- ============================================================================
-- A space can see that its own world was played
-- ----------------------------------------------------------------------------
-- 20261028000000 gave the backoffice a real play count and left everybody else
-- with zeroes, because `xp_sessions` grants select to backoffice admins and to
-- nobody else and `xp_play_totals` is `security invoker`. So the one person who
-- most wants the number - the author - is the one who cannot have it.
--
-- docs/xp/creator.md §18.1 is unusually direct about this: at the sizes the fund
-- will run at, the money is not the point. *"A fund at this size is a signal, not
-- an income: it says the thing you made was played, in a unit nobody can argue
-- with. So the thing worth building first is a visible balance."* This is the
-- half of that which needs no fund, no split rule and no payout: the number.
--
-- ---------------------------------------------------------------------------
-- A count, and never the rows behind it
-- ---------------------------------------------------------------------------
-- The rule is [xp-scenes.md](scenes.md) §3.4's, which the project page already
-- says out loud beside the store panel: **an XP's owner owns the game, not the
-- people playing it.** A session row carries an account and a time, and an owner
-- reading those learns who was in their world on Tuesday evening. So this is a
-- function returning aggregates rather than a policy widened to admit somebody:
-- there is no query shape here that can answer *who*, which is a stronger
-- promise than a policy that could be loosened later without anybody noticing
-- what it now discloses.
--
-- **The one leak that is real, and accepted:** a count of 1 in a space of three
-- people is not anonymous to somebody who knows who was online. That is true of
-- every aggregate over a small group, it is the space's own members rather than
-- strangers, and the alternative - a floor below which nothing is shown - hides
-- exactly the number a new world most wants (its first play). Recorded rather
-- than solved.
--
-- ---------------------------------------------------------------------------
-- Definer, calling the invoker function
-- ---------------------------------------------------------------------------
-- The aggregation stays in `xp_play_totals` and this wraps it, rather than being
-- a second `count(*)` that could drift from the first. Inside a `security
-- definer` function the invoker one runs as this function's owner, so RLS is
-- out of the way and the `where` below is the whole of the permission - which is
-- the property worth having: one line to read, and it is the line.
--
-- Who: the owner wherever they now are, and anybody in the space it lives in.
-- Both predicates already exist and neither reads the table it is guarding
-- (20261003000000's rule about recursion). A member rather than an admin,
-- because "how much was this played" is the space library's number and asking
-- as a member is not a disclosure the owner-or-admin gate was protecting.
-- ============================================================================

create or replace function public.xp_play_totals_mine(p_xp_ids uuid[])
returns table (
  xp_id       uuid,
  plays       bigint,
  seconds     bigint,
  last_played timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    x.id,
    t.plays,
    t.seconds,
    t.last_played
  from unnest(p_xp_ids) as asked(id)
  join public.xps_read_model x on x.id = asked.id
  /**
   * The reference spelling, copied from `domain/xps/ref.ts`.
   *
   * That module says it is the only place that knows how a reference is
   * written, and this is the one place that has to disagree: the permission is
   * about a project *id* and the sessions are keyed by *reference*, so
   * something has to join the two, and it cannot be the caller - a caller that
   * supplied the prefix would be supplying the thing being authorised.
   *
   * Copied deliberately and narrowly, the same way `xp_sessions.xp_ref`'s check
   * constraint copies the column pattern it has to fit: the trailing `-v` is
   * what keeps a builtin document called `p-<something>` out of a project's
   * takings, and `plays.test.ts` pins that property against `projectRefPrefix`.
   */
  cross join lateral public.xp_play_totals(array['p-' || x.id::text || '-v']) t
  where public.xp_is_mine(x.id) or public.xp_in_my_space(x.id)
$$;

/**
 * Who may *call* these, which is a different question from what they answer.
 *
 * Two grants arrive without being asked for, and it is worth knowing which:
 * Postgres gives `execute` to `PUBLIC` on every new function, and Supabase's
 * default privileges on this schema give it to `anon`, `authenticated` and
 * `service_role` besides. `grant ... to authenticated` alone therefore changes
 * nothing at all, which is the sort of line that reads like a rule and is not
 * one.
 *
 * The `PUBLIC` grant goes, because a `security definer` function reachable by a
 * role nobody has enumerated is the shape that eventually surprises somebody.
 * **`anon` is deliberately left**, in line with every other function here: a
 * signed-out caller has no `auth.uid()`, so `xp_is_mine` and `xp_in_my_space`
 * are both false and the answer is an empty result - which was checked, not
 * assumed. The predicate is the rule; the grant is not being asked to be one.
 */
revoke execute on function public.xp_play_totals_mine(uuid[]) from public;
revoke execute on function public.xp_play_totals(text[])    from public;

grant execute on function public.xp_play_totals_mine(uuid[]) to authenticated;
grant execute on function public.xp_play_totals(text[])      to authenticated;

comment on function public.xp_play_totals_mine(uuid[]) is
  'Play totals for worlds the caller owns or shares a space with. Aggregates '
  'only: scenes.md §3.4 gives an owner the game and not the people playing it, '
  'so there is no shape here that can answer who or when-by-whom.';
