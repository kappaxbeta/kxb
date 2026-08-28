-- ============================================================================
-- Contact messages
-- ----------------------------------------------------------------------------
-- Somebody wants to reach a human. That is all this is, and it is deliberately
-- not event-sourced: a message is not a decision anybody made about a thing the
-- app owns, nothing folds it into state, and no rule depends on the order two
-- of them arrived in. It sits next to `world_reports` and `page_views` for the
-- same reason - platform plumbing, belonging to nobody's workspace.
--
-- The form is open to visitors who are not signed in, which is the whole point:
-- the person who cannot get in is exactly the person who needs to write.
-- ============================================================================

create table if not exists public.contact_messages (
  id         uuid        primary key default gen_random_uuid(),
  /** What they call themselves. Free text - an anonymous visitor has no handle. */
  username   text        not null,
  email      text        not null,
  /** Optional: not everybody wants to be called back. */
  phone      text,
  subject    text        not null,
  message    text        not null,
  status     text        not null default 'open'
                check (status in ('open', 'handled')),
  /** Set when the sender had a session, so the backoffice can tell a member
   *  from a stranger. Never trusted for the address - people write from one
   *  account about another. */
  user_id    uuid        references auth.users (id) on delete set null,
  /** Which page they were on. Context for an admin, and nothing more. */
  path       text,
  created_at timestamptz not null default now(),
  handled_by uuid        references auth.users (id) on delete set null,
  handled_at timestamptz
);

-- The inbox is always "the newest of one status", so the status leads.
create index if not exists contact_messages_status_idx
  on public.contact_messages (status, created_at desc);

-- Used by the throttle in the server action, which asks "how many from this
-- address just now".
create index if not exists contact_messages_email_recent_idx
  on public.contact_messages (email, created_at desc);

alter table public.contact_messages enable row level security;

-- Readable and resolvable by backoffice admins, writable by nobody holding a
-- session key. Inserts go through the service role in the server action, the
-- same shape as `page_views`: an anon-insert policy would have to be open to
-- the world by definition, and an open insert policy on a table with a free
-- text column is a spam sink with no throttle in front of it. The action is
-- that throttle.
create policy "contact_messages_admin_all"
  on public.contact_messages for all
  to authenticated
  using (public.is_backoffice_admin())
  with check (public.is_backoffice_admin());
