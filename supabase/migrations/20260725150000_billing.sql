-- ============================================================================
-- Billing: one Stripe subscription per workspace, paid by SEPA Direct Debit
-- ----------------------------------------------------------------------------
-- Two things about SEPA drive this design, and neither is a Stripe detail - they
-- are properties of the payment rail:
--
--   1. A debit is not instant. It confirms in 2-5 business days. So "pay, then
--      get access" would mean a working product a week after signup, which
--      users read as broken. The workspace opens immediately and the money
--      arrives later, as an event.
--
--   2. A debit can be reversed for up to 8 weeks (13 months if the payer claims
--      it was unauthorised). "Paid" is therefore never final. A workspace can
--      go from active to suspended long after the fact, which is exactly the
--      kind of history an append-only log is good at holding.
--
-- Consequence: payment state is a *stream*, not a boolean column. The read
-- model below is a cache of that stream, same as every other read model here.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- System events
-- ----------------------------------------------------------------------------
-- Until now every event was written by a signed-in person, and both
-- append_events() and the events insert policy enforced actor_id = auth.uid().
--
-- A Stripe webhook has no session. It is authenticated by a signature on the
-- request body, not by a JWT, and the "who" behind `invoice.payment_failed` is
-- a bank, days after the fact. Borrowing some user's id to satisfy a NOT NULL
-- would put a false fact in an immutable log.
--
-- So actor_id becomes nullable, and NULL means "the system did this". Queries
-- that attribute events to people already tolerate a missing match, because the
-- read model joins on membership which a departed member no longer has.
-- ----------------------------------------------------------------------------

alter table public.events alter column actor_id drop not null;

comment on column public.events.actor_id is
  'The user who appended this event, or NULL for system events (webhooks). Not an owner - the tenant owns the data.';

-- tasks_read_model.created_by is copied straight from the event's actor, so it
-- inherits the same nullability. No task is created by a webhook today, but a
-- read model that cannot represent what the log can hold is a projection
-- waiting to crash on replay.
alter table public.tasks_read_model alter column created_by drop not null;

-- ----------------------------------------------------------------------------
-- append_events(), now callable by the service role
-- ----------------------------------------------------------------------------
-- The only change is the authentication guard. A service-role connection has no
-- auth.uid() but is trusted, and Supabase gives it BYPASSRLS, so the insert
-- policy does not apply to it - which is precisely why the webhook route must
-- verify the Stripe signature before it ever reaches this function.
-- ----------------------------------------------------------------------------

create or replace function public.append_events(
  p_tenant_id        uuid,
  p_stream_id        uuid,
  p_stream_type      text,
  p_expected_version integer,
  p_events           jsonb
)
returns setof public.events
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actual_version integer;
  v_stream_tenant  uuid;
  v_event          jsonb;
  v_version        integer;
begin
  if (select auth.uid()) is null and (select auth.role()) <> 'service_role' then
    raise exception 'append_events: not authenticated'
      using errcode = '42501';
  end if;

  if jsonb_typeof(p_events) <> 'array' then
    raise exception 'append_events: p_events must be a JSON array, got %',
      coalesce(jsonb_typeof(p_events), 'null')
      using errcode = '22023';
  end if;

  if jsonb_array_length(p_events) = 0 then
    return;
  end if;

  v_stream_tenant := public.stream_tenant(p_stream_id);

  if v_stream_tenant is not null and v_stream_tenant <> p_tenant_id then
    raise exception
      'append_events: stream % belongs to another tenant', p_stream_id
      using errcode = '42501';
  end if;

  select coalesce(max(version), 0)
    into v_actual_version
    from public.events
   where stream_id = p_stream_id;

  if v_actual_version <> p_expected_version then
    raise exception
      'append_events: concurrency conflict on stream % (expected version %, actual %)',
      p_stream_id, p_expected_version, v_actual_version
      using errcode = '40001';
  end if;

  v_version := v_actual_version;

  for v_event in select * from jsonb_array_elements(p_events)
  loop
    v_version := v_version + 1;

    return query
      insert into public.events (
        tenant_id, stream_id, stream_type, version, type, data, metadata, actor_id
      )
      values (
        p_tenant_id,
        p_stream_id,
        p_stream_type,
        v_version,
        v_event ->> 'type',
        coalesce(v_event -> 'data', '{}'::jsonb),
        coalesce(v_event -> 'metadata', '{}'::jsonb),
        (select auth.uid())
      )
      returning *;
  end loop;
end;
$$;

-- ============================================================================
-- Read model: subscriptions
-- ----------------------------------------------------------------------------
-- One row per workspace, projected from the `subscription` stream by
-- src/domain/billing/projection.ts.
--
-- `status` is the whole point. It is what the write path consults to decide
-- whether a workspace may still record events:
--
--   pending   - subscription created, first debit not yet settled. Writable.
--               This is where a brand new SEPA workspace lives for days.
--   active    - a payment has cleared. Writable.
--   past_due  - a debit failed; Stripe is retrying. Still writable, because one
--               failed collection is usually a bank hiccup, not a deadbeat.
--   suspended - Stripe gave up, or a settled payment was reversed. Read-only.
--   canceled  - deliberately ended by the workspace owner. Read-only.
--
-- Only `suspended` and `canceled` block writes. That is the "read-only, keep
-- all data" rule: nothing is ever deleted, the log stays readable, and paying
-- flips it straight back.
-- ============================================================================

create table if not exists public.subscriptions_read_model (
  tenant_id              uuid        primary key,
  status                 text        not null
    check (status in ('pending', 'active', 'past_due', 'suspended', 'canceled')),
  stripe_customer_id     text,
  stripe_subscription_id text,
  -- Minor units, so 2000 = EUR 20.00. Never a float: binary floating point
  -- cannot represent 0.10 exactly, and money that does not add up is worse than
  -- money that is awkward to format.
  amount_cents           integer,
  currency               text,
  /** End of the paid period, from Stripe. Null until the first invoice. */
  current_period_end     timestamptz,
  /** Why it was suspended, for the banner. */
  last_failure_reason    text,
  created_at             timestamptz not null,
  updated_at             timestamptz not null,
  version                integer     not null
);

alter table public.subscriptions_read_model enable row level security;

-- Any member may see whether the workspace is paid up - a read-only banner is
-- useless if only owners can see it. Nobody sees payment instruments; those
-- never leave Stripe.
create policy "subscriptions_select_member"
  on public.subscriptions_read_model for select
  using (public.tenant_role(tenant_id) is not null);

-- Written by the projector, which runs either as a member catching up or as the
-- service role draining a webhook.
create policy "subscriptions_insert_member"
  on public.subscriptions_read_model for insert
  with check (public.tenant_role(tenant_id) is not null);

create policy "subscriptions_update_member"
  on public.subscriptions_read_model for update
  using (public.tenant_role(tenant_id) is not null)
  with check (public.tenant_role(tenant_id) is not null);

-- ============================================================================
-- Webhook idempotency
-- ----------------------------------------------------------------------------
-- Stripe delivers at least once, and will redeliver on any non-2xx or timeout.
-- Without a dedupe table a retried `invoice.payment_succeeded` appends a second
-- PaymentSucceeded event, and the log grows a payment that never happened.
--
-- The primary key does the work: the webhook inserts the Stripe event id first
-- and treats a 23505 as "already handled, return 200".
--
-- RLS is enabled with no policies at all. Only the service role touches this,
-- and the service role bypasses RLS - so the absence of policies means no
-- signed-in user can read or write it, which is what we want for something that
-- is purely infrastructure.
-- ============================================================================

create table if not exists public.stripe_webhook_events (
  id           text        primary key,
  type         text        not null,
  received_at  timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;
