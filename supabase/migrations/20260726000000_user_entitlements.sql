-- ============================================================================
-- User entitlements: a mirror of Stripe, per person
-- ----------------------------------------------------------------------------
-- Everything else derived in this codebase is a projection of our own event
-- log. This table is not, and the distinction is worth being explicit about:
-- the facts here belong to *Stripe*. Whether a subscription renewed last night,
-- and what date it is now paid through, are things that happened in someone
-- else's system. We did not decide them and cannot replay them.
--
-- So this is a cache with a `synced_at`, refreshed by a daily job, and it is
-- allowed to be stale. What it must never be is *authoritative*: when the
-- answer really matters - at the moment someone tries to create a workspace -
-- the code asks Stripe directly and updates this row on the way past.
--
-- Why per user rather than per workspace: entitlement is "how many workspaces
-- may this person own", which is a fact about the person. A workspace's own
-- subscription row (subscriptions_read_model) still exists and still tracks
-- what was bought *for that workspace*; the two answer different questions.
-- ============================================================================

create table if not exists public.user_entitlements (
  user_id            uuid        primary key references auth.users (id) on delete cascade,
  stripe_customer_id text,
  /** Workspaces this person may own. One per paid seat. */
  seats              integer     not null default 0,
  /**
   * Mirrors Stripe's subscription status, plus 'none' for people who have
   * never subscribed. 'canceled' and 'expired' both mean read-only - the
   * account keeps every workspace and every block, but records nothing new
   * until they resume.
   */
  status             text        not null default 'none'
    check (status in ('none', 'active', 'trialing', 'past_due', 'canceled', 'expired')),
  /** Paid through. NULL when there has never been a subscription. */
  current_period_end timestamptz,
  /** Which price granted this, so a plan change is visible. */
  price_id           text,
  /** When we last asked Stripe. Staleness is expected; invisible staleness is not. */
  synced_at          timestamptz not null default now()
);

create index if not exists user_entitlements_period_idx
  on public.user_entitlements (current_period_end);

alter table public.user_entitlements enable row level security;

-- Readable by the person it describes, and by nobody else. There is
-- deliberately no INSERT/UPDATE/DELETE policy: the only writer is the sync job
-- running as the service role, which bypasses RLS. A user who could write their
-- own entitlement could grant themselves unlimited workspaces.
create policy "user_entitlements_select_own"
  on public.user_entitlements for select
  using (user_id = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- Is this workspace paid for?
-- ----------------------------------------------------------------------------
-- Every page behind /t/[slug] needs this, and it cannot be a plain query: the
-- caller is usually *not* the owner, and `user_entitlements` only lets you read
-- your own row. A member has no business seeing the owner's billing status, but
-- does need to know whether the workspace is writable.
--
-- SECURITY DEFINER answers exactly that one question and leaks nothing else -
-- a boolean, not a subscription.
--
-- Note it asks about *status*, not seats. Seats gate how many workspaces a
-- person may create; status gates whether their workspaces may be written to.
-- Conflating them would mean an owner who downgrades from three seats to one
-- has two workspaces silently pick which of them still works.
-- ----------------------------------------------------------------------------

create or replace function public.tenant_is_entitled(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.tenant_members m
      join public.user_entitlements e on e.user_id = m.user_id
     where m.tenant_id = p_tenant_id
       and m.role = 'owner'
       and e.status in ('active', 'trialing')
       and e.seats > 0
  );
$$;

grant execute on function public.tenant_is_entitled(uuid) to authenticated;
