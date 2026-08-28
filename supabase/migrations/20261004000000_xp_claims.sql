-- ============================================================================
-- One editor at a time
-- ----------------------------------------------------------------------------
-- docs/xp/backend.md §12.7. Two people may both hold edit rights on a project;
-- until there is real collaboration, only one of them may have it open.
--
-- ---------------------------------------------------------------------------
-- A row with a clock, not a lock
-- ---------------------------------------------------------------------------
-- The claim expires rather than being released. A lock that has to be given
-- back is a lock a crashed tab holds forever, and the person it holds it
-- against is usually the person who owns the thing. The editor renews every 20
-- seconds and the claim dies 90 seconds after the last renewal, so a closed
-- laptop frees a project in a minute and a half without anybody doing anything.
--
-- Releasing on purpose is still worth doing - closing the tab should not make
-- a colleague wait ninety seconds - but it is an optimisation, not the
-- mechanism. Nothing breaks when it does not happen, which is the property
-- that matters on a train.
--
-- ---------------------------------------------------------------------------
-- This is not a permission, and it is not the correctness guarantee
-- ---------------------------------------------------------------------------
-- Who may edit at all is §7.4's ladder, in TypeScript, where the tier and the
-- subscription live. What makes a concurrent save fail rather than clobber is
-- `expected_version` on the stream, which was already true before this existed.
--
-- The claim only reduces how often anybody meets that failure. Saying so
-- matters: if this were the only thing standing between two writers, a clock
-- skew between two app replicas would be a data-loss bug rather than a slightly
-- early takeover.
-- ============================================================================

create table if not exists public.xp_claims (
  /** One row per project, ever. The claim is taken over, not queued. */
  xp_id      uuid        primary key references public.xps_read_model (id) on delete cascade,
  held_by    uuid        not null references auth.users (id) on delete cascade,
  /**
   * When this claim stops meaning anything.
   *
   * Compared against `now()` on the server rather than trusted from a client:
   * a browser that sets its own expiry is a browser that can hold a project
   * forever.
   */
  expires_at timestamptz not null,
  /** For the message somebody else sees: "Ana has had this open since 14:02." */
  claimed_at timestamptz not null default now()
);

-- The sweep, when there is one. Small table, but a project nobody has opened in
-- a month should not keep a row about who opened it in March.
create index if not exists xp_claims_expiry_idx on public.xp_claims (expires_at);

alter table public.xp_claims enable row level security;

-- Whoever may read the project may see who has it open. That is the whole point
-- of the row - the second editor has to be told a name, not just "no".
--
-- Through the same one-table definer functions 20261003000000 established, and
-- for the same reason: no policy on any of these tables references another of
-- them directly, so there is never a path from a policy back to the relation it
-- is a policy for.
create policy "xp_claims_select"
  on public.xp_claims for select
  to authenticated
  using (
    public.xp_in_my_space(xp_id)
    or public.xp_is_mine(xp_id)
    or public.has_xp_grant(xp_id)
  );

-- Taking and renewing a claim is an ordinary write by somebody who can already
-- edit. The narrower rule - that you may not take a *live* claim off somebody
-- else - is in the route rather than here, because it is a comparison against
-- `now()` and a policy that did it would refuse with no way to say who holds it.
--
-- Named commands rather than `for all`, and not from superstition: `for all`
-- includes SELECT and is OR-ed with the select policy above, so a write rule
-- would silently govern reads. That is half of what went wrong in
-- 20261003000000, and it is worth not repeating in the migration that cites it.
create policy "xp_claims_insert"
  on public.xp_claims for insert
  to authenticated
  with check (public.xp_in_my_space(xp_id) or public.xp_is_mine(xp_id));

create policy "xp_claims_update"
  on public.xp_claims for update
  to authenticated
  using (public.xp_in_my_space(xp_id) or public.xp_is_mine(xp_id))
  with check (public.xp_in_my_space(xp_id) or public.xp_is_mine(xp_id));

create policy "xp_claims_delete"
  on public.xp_claims for delete
  to authenticated
  using (public.xp_in_my_space(xp_id) or public.xp_is_mine(xp_id));

comment on table public.xp_claims is
  'Who has the editor open on a project, and until when. Advisory: §7.4 decides '
  'who may edit and expected_version decides what happens when two people save. '
  'See docs/xp/backend.md §12.7.';

-- ----------------------------------------------------------------------------
-- Taking it, atomically
-- ----------------------------------------------------------------------------
-- One statement rather than a read followed by a write, because two editors
-- opening the same project in the same second is exactly the case this exists
-- for - and read-then-write lets both of them see "free" before either writes.
--
-- The condition that makes it safe is the `where` on the conflict branch: the
-- row is overwritten only when it is already yours or has expired. When it
-- refuses, nothing is written and the existing row is returned instead, so the
-- caller can say *whose* it is rather than only "no".
--
-- `security invoker`, so the policies above still apply: this is a convenience
-- for atomicity, not a way around the permission model.
--
-- Every time comes from `now()` here rather than from the caller. Two app
-- replicas with slightly different clocks would otherwise disagree about
-- whether a claim had lapsed, and the disagreement would be settled in favour
-- of whichever replica was fast.
create or replace function public.claim_xp(
  p_xp_id   uuid,
  p_account uuid,
  p_seconds integer
)
returns public.xp_claims
language plpgsql
security invoker
set search_path = public
as $$
declare
  result public.xp_claims;
begin
  insert into public.xp_claims as existing (xp_id, held_by, claimed_at, expires_at)
  values (p_xp_id, p_account, now(), now() + make_interval(secs => p_seconds))
  on conflict (xp_id) do update
    set held_by    = excluded.held_by,
        expires_at = excluded.expires_at,
        -- A renewal keeps the original moment, so "has had this open since
        -- 14:02" stays true rather than resetting every twenty seconds.
        claimed_at = case
          when existing.held_by = p_account and existing.expires_at > now()
            then existing.claimed_at
          else now()
        end
    where existing.held_by = p_account or existing.expires_at <= now()
  returning * into result;

  -- The conflict branch refused, which means somebody else holds a live claim.
  if result.xp_id is null then
    select * into result from public.xp_claims where xp_id = p_xp_id;
  end if;

  return result;
end;
$$;

comment on function public.claim_xp(uuid, uuid, integer) is
  'Take or renew the editing claim on a project. Returns the claim that now '
  'holds - which is somebody else''s when the caller lost. See §12.7.';
