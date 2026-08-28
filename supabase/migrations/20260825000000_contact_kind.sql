-- ============================================================================
-- Business inquiries in the contact inbox
-- ----------------------------------------------------------------------------
-- A second front door was added at /events, where somebody books the product
-- for a date rather than reporting that it is broken. Both are "a person wants
-- to reach a human", so both land in `contact_messages` - a separate table
-- would duplicate the throttle, the honeypot, the service-role insert and the
-- handled/open lifecycle, and would then need a second inbox to read it in.
--
-- What it does need is to be *findable*. An enquiry worth a few hundred euro
-- sitting between two bug reports, in a list sorted only by arrival, is an
-- enquiry that gets answered on Thursday. Hence `kind`: same table, same inbox,
-- its own filter and its own badge.
--
-- `default 'general'` is what makes this migration safe on a table that already
-- has rows in it, and is also the honest reading of them: everything written
-- before /events existed came through the support form.
-- ============================================================================

alter table public.contact_messages
  add column if not exists kind text not null default 'general'
    check (kind in ('general', 'business'));

comment on column public.contact_messages.kind is
  'Which form it came from: ''general'' is the support/contact form, ''business'' is the event booking form at /events.';

-- ----------------------------------------------------------------------------
-- What an event enquiry needs on top of a message.
--
-- Three columns rather than three lines the organiser is trusted to include in
-- the prose, because these are the only three facts that decide whether the
-- answer is a price or a polite no, and reading them out of a paragraph is how
-- a quote goes out with the wrong date on it.
--
-- All text, all nullable. Nullable because a bug report has no headcount, and
-- text because the true answer to "when" is frequently "second week of March,
-- probably" - a `date` column cannot hold that, so it would push the real
-- answer back into the prose and leave the structured field lying.
-- ----------------------------------------------------------------------------

alter table public.contact_messages
  add column if not exists event_type text,
  add column if not exists event_when text,
  add column if not exists event_size text;

comment on column public.contact_messages.event_when is
  'Free text on purpose: "14 March", "second week of May", "not fixed yet" are all real answers.';

-- The inbox is "the newest of one status, optionally of one kind", so this
-- mirrors `contact_messages_status_idx` with the kind in front of it rather
-- than replacing it - the unfiltered view is still the common one.
create index if not exists contact_messages_kind_status_idx
  on public.contact_messages (kind, status, created_at desc);
