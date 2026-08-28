-- ============================================================================
-- Access control: who may get an account, and how many fit in a space
-- ----------------------------------------------------------------------------
-- Three things arrive together because they are one decision split three ways:
--
--   1. A door. `open_registration` says whether anybody may sign up, or whether
--      they join a queue instead.
--   2. A queue. `account_applications` is that queue - somebody asking to be
--      let in, plus the evidence that they agreed to be written to.
--   3. A key. `account_invites` is what gets somebody past a closed door,
--      whether they queued or an admin just decided to invite them.
--
-- And, unrelated to the door but flag-shaped in the same way, `seat_limit`:
-- how many people fit in one space.
--
-- None of it is event-sourced. An application is not a decision the app owns -
-- it is somebody knocking - and an invite is a capability with a lifetime, not
-- a fact about a workspace. They sit beside `contact_messages` for exactly the
-- reason its migration gives: platform plumbing, belonging to nobody's
-- workspace, with no history worth folding.
-- ============================================================================

-- ============================================================================
-- 1. Flags that carry a number
-- ----------------------------------------------------------------------------
-- `feature_flags` answered yes/no, and a seat limit is a "yes, and how many".
-- Rather than a second config mechanism, the existing one grows one nullable
-- column - which means the seat limit inherits the whole override story for
-- free: a global default, a different number for one space, all of it already
-- edited in one place in the backoffice.
--
-- The boolean keeps its meaning and stays the gate: `enabled = false` on
-- `seat_limit` means *no limit*, whatever the number says. That ordering is
-- what makes "unlimited" expressible at all, and it is why the resolver below
-- checks `enabled` before it looks at `value_int`.
--
-- `resolve_features()` is deliberately left alone. It returns a flat
-- {key: boolean} object that every request destructures, and widening it to
-- {key: {enabled, value}} would rewrite every caller to buy nothing - the one
-- flag that has a number gets `tenant_seat_limit()` below instead.
-- ============================================================================

alter table public.feature_flags
  add column if not exists value_int integer;

alter table public.feature_flag_overrides
  add column if not exists value_int integer;

comment on column public.feature_flags.value_int is
  'The number a valued flag carries. NULL for a plain on/off flag. Only read when enabled is true.';

comment on column public.feature_flag_overrides.value_int is
  'Overrides the flag''s number for this subject. NULL falls back to the global number.';

-- ----------------------------------------------------------------------------
-- The two new flags
-- ----------------------------------------------------------------------------
-- `on conflict do nothing`, like the original seed: the global value is a thing
-- an admin is expected to change, and a re-run of this migration must not
-- reopen registration underneath somebody who closed it.
--
-- `open_registration` seeds *true* even though its code-side fallback is false.
-- Those answer different questions. The seed is "what should a deployment that
-- has never thought about this do" - and the answer is "keep working exactly as
-- it did yesterday", because shipping this migration must not lock an existing
-- product's front door. The fallback is "what should we assume when the
-- resolver is broken", and there the safe answer is the opposite: a database
-- blip must never be what reopens a door an operator deliberately shut.
--
-- `seat_limit` seeds off, so nothing changes for anybody until an admin picks a
-- number. The 12 is parked in value_int so the backoffice has something
-- sensible to show when they first switch it on - it is the default for every
-- space at once, and the number an admin edits in one field. A per-space
-- override is the exception to it, not the way to set it.
-- ----------------------------------------------------------------------------

insert into public.feature_flags (key, enabled, value_int, label, description) values
  ('open_registration', true, null, 'Open registration',
   'On means anybody can create an account. Off means sign-up is by invitation only, and everyone else lands on the waiting list at /waitlist. Invitations work either way.'),
  ('seat_limit', false, 12, 'Seat limit per space',
   'Off means a space may hold any number of people. On caps members plus pending invitations at the number, for every space at once. Override it for one space to give that space a different cap.')
on conflict (key) do nothing;

-- ============================================================================
-- 2. tenant_seat_limit(tenant)
-- ----------------------------------------------------------------------------
-- The cap for one space, or NULL for "no cap".
--
-- Its own function rather than a branch of resolve_features() because the one
-- caller that matters most cannot use that function at all. Accepting an
-- invitation is done by somebody who is *not yet a member*, and the tenant
-- layer of resolve_features() deliberately refuses to answer for a workspace
-- the caller does not belong to. A pending invitee asking "is there room for
-- me" would have been told the global default and walked straight past a
-- per-space cap.
--
-- So this one answers for any workspace id, to anybody. What that discloses is
-- one integer - a space's seat cap - to someone who already has to guess a
-- uuid. Weighed against a cap that silently does not apply to the exact people
-- it exists to stop, that is the right trade.
--
-- User-scope overrides are ignored on purpose. A seat limit is a property of
-- the room, not of the person walking into it; honouring a user override would
-- mean the same space held a different number of people depending on who asked.
--
-- Called with no argument it answers for no particular space, which is the
-- global default - the left join finds nothing to override with. That is what
-- the landing page asks, and the reason it can: `feature_flags` itself is
-- admin-only under RLS, so a signed-out visitor has no other way to learn the
-- terms the front page is advertising.
-- ============================================================================

create or replace function public.tenant_seat_limit(p_tenant_id uuid default null)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
           when coalesce(o.enabled, f.enabled)
            and coalesce(o.value_int, f.value_int) > 0
           then coalesce(o.value_int, f.value_int)
         end
    from public.feature_flags f
    left join public.feature_flag_overrides o
      on  o.flag_key = f.key
      and o.scope    = 'tenant'
      and o.scope_id = p_tenant_id
   where f.key = 'seat_limit';
$$;

grant execute on function public.tenant_seat_limit(uuid) to authenticated, anon;

-- ============================================================================
-- 3. The waiting list
-- ----------------------------------------------------------------------------
-- Somebody asking for an account while the door is shut.
--
-- The consent columns are the reason this table is more than an email column.
-- Asking "do you want the newsletter" is easy; being able to show, a year
-- later, that this address said yes at this moment from this address is the
-- part that matters, and it cannot be reconstructed afterwards. So the tick,
-- the timestamp and the IP are written together or not at all - see the check
-- constraint - and `consent_at` is never just `created_at` reused, because
-- somebody can join the list without wanting the newsletter.
--
-- Note the deliberate inconsistency with `page_views`, which hashes the address
-- and throws it away. That table is measuring traffic, where an identifiable
-- address buys nothing. This one is keeping evidence of a promise, which is the
-- one purpose an address is genuinely necessary for - and is why it is stored
-- against a specific opt-in rather than against every visit.
-- ============================================================================

create table if not exists public.account_applications (
  id         uuid        primary key default gen_random_uuid(),
  email      text        not null,
  /** What to call them. Optional - an address is enough to join a queue. */
  username   text,
  /** Why they want in. Free text, and the thing an admin actually reads. */
  note       text,
  status     text        not null default 'pending'
               check (status in ('pending', 'invited', 'rejected')),

  -- --------------------------------------------------------------------------
  -- Consent, and the evidence for it
  -- --------------------------------------------------------------------------
  /** Did they tick the box. */
  newsletter_consent boolean     not null default false,
  /** When they ticked it. NULL when they did not. */
  consent_at         timestamptz,
  /** Where from. `inet` rather than text, so a malformed address is rejected
   *  by the column instead of stored as a string nobody can query. */
  consent_ip         inet,
  /** Which browser said it. Weak evidence on its own, useful beside the rest. */
  consent_user_agent text,

  -- --------------------------------------------------------------------------
  -- The application itself
  -- --------------------------------------------------------------------------
  created_at  timestamptz not null default now(),
  /** The address the application arrived from, for spotting a flood of them. */
  created_ip  inet,
  reviewed_by uuid        references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  review_note text,

  /**
   * Consent is a fact with a time and a place, or it is not consent.
   *
   * Enforced by the column rather than by the action that writes it, because a
   * row saying "yes to the newsletter" with no timestamp is worse than useless
   * - it looks like evidence and is not, and by the time anybody needs it the
   * code that wrote it is long gone.
   */
  constraint account_applications_consent_evidence check (
    not newsletter_consent
    or (consent_at is not null and consent_ip is not null)
  )
);

-- One row per address. Re-applying corrects the row it already has rather than
-- stacking a second one - see applyForAccount, which is also what keeps a
-- rejected applicant from learning they were rejected by watching the list
-- accept them again.
create unique index if not exists account_applications_email_key
  on public.account_applications (lower(email));

-- The queue is always "the oldest pending", so the status leads.
create index if not exists account_applications_status_idx
  on public.account_applications (status, created_at desc);

alter table public.account_applications enable row level security;

-- Readable and reviewable by backoffice admins; writable by nobody holding a
-- session key. Applications are inserted through the service role in the server
-- action, exactly as contact messages are, and for the same reason: the person
-- applying has no session by definition, so an insert policy here would have to
-- be open to the world, and an open insert policy on a table with a free text
-- column is a spam sink with no throttle in front of it. The action is the
-- throttle.
drop policy if exists "account_applications_admin_all" on public.account_applications;

create policy "account_applications_admin_all"
  on public.account_applications for all
  to authenticated
  using (public.is_backoffice_admin())
  with check (public.is_backoffice_admin());

-- ============================================================================
-- 4. Invites
-- ----------------------------------------------------------------------------
-- The key to a closed door. Either answering an application, or minted by an
-- admin for somebody who never queued.
--
-- The token is stored in the clear, which is a real choice and not an
-- oversight. Hashing it would be better hygiene, and would also make the
-- backoffice unable to show the link twice - an admin who closes the tab loses
-- the invite and has to mint another. Every product with invite links makes the
-- same call. What makes it defensible here: the table is admin-only under RLS,
-- the token buys nothing but the ability to *create an account* (not to enter
-- any space), it expires, it can be revoked, and a breach that reaches this
-- table has already reached auth.users, where the tokens would be moot.
--
-- `email` being nullable is the difference between the two kinds of invite. Set,
-- and the invite only works for that mailbox - which is what an approved
-- application gets. NULL, and it works for whoever holds the link, which is what
-- "invite a few friends" needs.
-- ============================================================================

create table if not exists public.account_invites (
  id         uuid        primary key default gen_random_uuid(),
  /** The secret in the link. Unique so a collision is a failed insert, not a
   *  second invite quietly sharing one token. */
  token      text        not null unique,
  /** Locks the invite to one mailbox. NULL means anybody holding the link. */
  email      text,
  /** Who this is for, in an admin's words. */
  note       text,
  /** How many accounts this token may create. */
  max_uses   integer     not null default 1 check (max_uses > 0),
  uses       integer     not null default 0 check (uses >= 0),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid        references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  /** The application this answers, when it came out of the queue. Keeps the
   *  queue and the key joined up, so approving twice is visible. */
  application_id   uuid  references public.account_applications (id) on delete set null,
  last_redeemed_by uuid  references auth.users (id) on delete set null,
  last_redeemed_at timestamptz
);

-- Redemption looks a token up by its exact value on every gated sign-up, and
-- the unique index above already serves that. This one is for the backoffice
-- list, which reads newest-first.
create index if not exists account_invites_created_idx
  on public.account_invites (created_at desc);

create index if not exists account_invites_application_idx
  on public.account_invites (application_id);

alter table public.account_invites enable row level security;

-- Same posture as the applications table, and it matters more here: a member
-- who could read this table could read every unredeemed invite token in the
-- system. Redemption runs through the service role in the sign-up path, where
-- the caller is by definition not signed in yet.
drop policy if exists "account_invites_admin_all" on public.account_invites;

create policy "account_invites_admin_all"
  on public.account_invites for all
  to authenticated
  using (public.is_backoffice_admin())
  with check (public.is_backoffice_admin());
