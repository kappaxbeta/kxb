-- ============================================================================
-- A free handle to offer, when the one somebody wanted is gone
-- ----------------------------------------------------------------------------
-- Renaming yourself to a taken handle was a dead end. The action reported
-- "jane is already taken" and stopped, and the only way forward was to guess
-- again - which for a common name is several guesses, each one a round trip.
--
-- The suffix logic to fix that already exists: `claim_username` walks
-- `jane`, `jane-1`, `jane-2` until one sticks, and every account created since
-- the usernames migration got its handle that way. What it cannot do is answer
-- for somebody who *already has* a row - it returns their current handle
-- untouched, by design, so that a re-run of the signup trigger cannot rename
-- anybody. So this is the same walk with the early return removed and no write
-- at the end of it.
--
-- Why SECURITY DEFINER, which is the only interesting decision here:
-- `user_profiles_select_self_or_shared` means a caller can see their own row
-- and the rows of people they share a workspace with, and nothing else. A
-- suggestion computed under that policy would call `jane` free because the
-- Jane who has it is a stranger - and then the insert would fail on the
-- constraint anyway, which is the dead end this exists to remove. Answering
-- from outside RLS is what makes the answer true.
--
-- It leaks exactly one bit per probe: "some account holds this handle". That
-- is the same bit the unique constraint already discloses to anybody willing
-- to try the write, and handles are shown next to people all over the app -
-- they are public names, not secrets. No row, no email and no user id is
-- readable through this.
-- ============================================================================

create or replace function public.suggest_username(p_seed text)
returns text
language plpgsql
security definer
-- STABLE, not IMMUTABLE: the answer depends on the table, and marking it
-- immutable would let the planner cache a suggestion that has since been taken.
stable
set search_path = public
as $$
declare
  v_base    text := public.username_seed(p_seed);
  v_attempt text;
  n         integer := 0;
begin
  loop
    if n = 0 then
      v_attempt := v_base;
    else
      -- Truncate the base, not the suffix - the same rule `claim_username`
      -- follows, so a suggestion looks like the handles the trigger hands out.
      v_attempt := left(v_base, 31 - length(n::text)) || '-' || n::text;
    end if;

    if not exists (
      select 1 from public.user_profiles where username = v_attempt
    ) then
      return v_attempt;
    end if;

    n := n + 1;
    -- The same ceiling as claim_username. Reaching it means five thousand
    -- people wanted one name, which is a different problem.
    if n > 5000 then
      return null;
    end if;
  end loop;
end;
$$;

comment on function public.suggest_username(text) is
  'The first free handle at or after the one this seed suggests. Reads through RLS on purpose - see the migration.';

-- Anybody signed in may ask. There is nothing here to grant more narrowly:
-- the only callers are the username picker and the welcome wizard, and both
-- run as the person renaming themselves.
grant execute on function public.suggest_username(text) to authenticated;
