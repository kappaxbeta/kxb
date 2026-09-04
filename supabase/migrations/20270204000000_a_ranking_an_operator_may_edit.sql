-- ============================================================================
-- Hiding somebody from a ranking
-- ----------------------------------------------------------------------------
-- docs/product/economy.md §13. An operator can drop a player from a space's
-- best list without telling them.
--
-- ----------------------------------------------------------------------------
-- Two things make this defensible rather than grubby
-- ----------------------------------------------------------------------------
-- **Only a ranking is hidden.** Coins, purse, play, and every movement in the
-- log are untouched. This is a row missing from a table, not a punishment that
-- reaches into somebody's account, and nothing here can be used to take
-- anything away.
--
-- **It is recorded.** `hidden_by` and `reason` are not optional, and the
-- backoffice writes an audit entry beside them like every other operator
-- action. A silent edit with a name on it is a decision; one without is a
-- capability nobody has to answer for.
--
-- ----------------------------------------------------------------------------
-- Private spaces only, and the distinction is the whole justification
-- ----------------------------------------------------------------------------
-- **This is not enforced by the table.** It is enforced at the read, in
-- `readBestList`, and the constraint could not live here: whether a space is
-- public is a column on another table that changes independently, so a
-- constraint would either go stale or need a trigger chasing it.
--
-- The rule: a public space's ranking is never edited. A public leaderboard that
-- operators silently adjust is a lie told to strangers who have no way to know.
-- A private space's ranking is a community's own business, and hiding a griefer
-- from it is moderation. If somebody ever makes a hidden space public, the rows
-- here stop applying rather than following it - which is the safe direction and
-- is why the check is at the read.
--
-- ----------------------------------------------------------------------------
-- What "shadow" means here
-- ----------------------------------------------------------------------------
-- The hidden player still sees themselves, at the rank they would have held.
-- That is the whole difference between a shadow ban and a ban: a list that
-- visibly loses you is a notification, and somebody who knows they have been
-- hidden simply makes another account. So the filter is applied to *other
-- people's* view of the list - see `readBestList`.
-- ============================================================================

create table if not exists public.leaderboard_hidden (
  tenant_id  uuid        not null references public.tenants_read_model (id) on delete cascade,
  user_id    uuid        not null references auth.users (id) on delete cascade,
  -- The operator. Not nullable: a hiding with nobody's name on it is the thing
  -- this table exists to prevent.
  hidden_by  uuid        not null references auth.users (id),
  -- Required, like the reason on a takedown. An operator who cannot say why in
  -- one sentence should not be doing it.
  reason     text        not null check (length(btrim(reason)) > 0),
  created_at timestamptz not null default now(),

  primary key (tenant_id, user_id)
);

-- ----------------------------------------------------------------------------
-- Row level security
-- ----------------------------------------------------------------------------
-- **Nobody reads this through a session, and nobody writes it.** No policy at
-- all, which with RLS on means every authenticated request sees an empty table.
--
-- That is deliberate and it is the shadow. A member who could read this could
-- discover they had been hidden, which is precisely what a shadow ban is not.
-- A member who could read *anybody's* row could publish the list.
--
-- The leaderboard filters through the service role, in `readBestList`, and the
-- backoffice reads and writes the same way behind its own section grant.
-- ----------------------------------------------------------------------------

alter table public.leaderboard_hidden enable row level security;

comment on table public.leaderboard_hidden is
  'Players hidden from a space best list. Private spaces only - enforced at the read in readBestList, not here. No RLS policies by design: a member who could read this would know they had been hidden, which is the whole thing a shadow ban is not.';
