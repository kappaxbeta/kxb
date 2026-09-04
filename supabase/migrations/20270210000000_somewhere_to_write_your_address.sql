-- ============================================================================
-- News signups
-- ----------------------------------------------------------------------------
-- Somewhere for a reader to say "tell me when the next chapter is up".
--
-- This table is a *consent record* before it is a mailing list, and the column
-- order says so: what they agreed to, in the words they were shown, at a time,
-- from a page. Under §7 UWG and Art. 7 GDPR the burden is on us to show that a
-- given address asked for this, and "we have their email" is not that. The
-- wording is stored per row rather than referenced by version number, because
-- the question a complaint asks is "what did this person actually read", and a
-- version number only answers it while the table it points at still exists.
--
-- ----------------------------------------------------------------------------
-- Nothing may be sent to a row until `confirmed_at` is set
-- ----------------------------------------------------------------------------
-- Double opt-in, which is not optional here: a single-opt-in list in Germany
-- is one typo'd address away from a complaint we cannot answer, because
-- anybody can type anybody's address into a form.
--
-- The confirmation mail does not exist yet, and that is a deliberate half
-- rather than an oversight. This app has no outbound mail of its own - the
-- only SMTP in the system belongs to GoTrue and carries auth mail - so adding
-- one is its own piece of work. Until it lands, rows arrive unconfirmed and
-- stay that way, which is the safe state: the list cannot be mailed, and the
-- addresses are not lost.
--
-- `confirm_token` is written on the way in rather than when the mail is built,
-- so the row is already whole when that work happens.
-- ============================================================================

create table if not exists public.news_subscribers (
  id            uuid primary key default gen_random_uuid(),

  /**
   * Lowercased on the way in by the action, and unique.
   *
   * Not the primary key: an address that unsubscribes and comes back should be
   * the same row with a new consent, not a resurrected one, and a natural key
   * makes "delete me" and "forget me" harder to tell apart than they should be.
   */
  email         text not null unique check (position('@' in email) > 1 and length(email) <= 320),

  /** Which language they were reading when they signed up. What to write to
   *  them in, and the reason `consent_text` below is not always German. */
  locale        text not null default 'en' check (locale in ('en', 'de', 'bg')),

  /**
   * The exact sentence they ticked, stored verbatim.
   *
   * The whole point of the table. A version number would be cheaper and would
   * answer a different question than the one that gets asked.
   */
  consent_text  text not null check (length(consent_text) between 10 and 2000),
  consented_at  timestamptz not null default now(),

  /** Where they were standing. Context for a complaint, and nothing else. */
  source_path   text,

  /**
   * Set when they answer the confirmation mail. Null means: do not send to
   * this address. Every read that builds a send has to filter on it.
   */
  confirm_token uuid not null default gen_random_uuid(),
  confirmed_at  timestamptz,

  /** Set on the way out. The row stays, so a later signup is a new consent on
   *  a known address rather than a row that has to be recreated. */
  unsubscribed_at timestamptz,

  created_at    timestamptz not null default now()
);

-- The only read that will ever be hot: "who may be sent to". Partial, because
-- the unconfirmed and the unsubscribed are never in that answer.
create index if not exists news_subscribers_sendable_idx
  on public.news_subscribers (confirmed_at)
  where confirmed_at is not null and unsubscribed_at is null;

alter table public.news_subscribers enable row level security;

-- ---------------------------------------------------------------------------
-- Writing
-- ---------------------------------------------------------------------------
-- Anybody may add their own address, signed in or not - this is a public
-- marketing page and requiring an account to hear about a story would defeat
-- the point of the story being public.
create policy "news_subscribers_insert"
  on public.news_subscribers for insert
  to anon, authenticated
  with check (true);

-- ---------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------
-- Nobody but the backoffice, and there is deliberately no self-read: a policy
-- letting anon select their own row would let anyone check whether an address
-- is on the list by asking, one address at a time. There is nothing a
-- subscriber needs to read here that the confirmation mail will not tell them.
create policy "news_subscribers_select_admin"
  on public.news_subscribers for select
  to authenticated
  using (public.is_backoffice_admin());

create policy "news_subscribers_update_admin"
  on public.news_subscribers for update
  to authenticated
  using (public.is_backoffice_admin())
  with check (public.is_backoffice_admin());

create policy "news_subscribers_delete_admin"
  on public.news_subscribers for delete
  to authenticated
  using (public.is_backoffice_admin());
