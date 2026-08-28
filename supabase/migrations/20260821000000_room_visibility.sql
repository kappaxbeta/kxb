-- ============================================================================
-- Rooms that not everybody needs to know about
-- ----------------------------------------------------------------------------
-- The first cut listed every room to everybody in the space, which is right for
-- most of them - a room is a place, and a place nobody can find is not much of
-- one. But "open a room for a conversation that does not need an audience" is
-- the other half of why you would want more than one lounge, and a list that
-- announces it to twelve people defeats the purpose.
--
-- So: `open` rooms are listed to the whole space, `private` rooms are listed
-- only to the people who can manage them, and are reached by being told where.
--
-- What this is NOT, said plainly because the word "private" invites the other
-- reading: it is *unlisted*, not sealed. `can_enter_room` still admits anybody
-- in the space, deliberately - a room is part of the commons, its id is in a
-- URL somebody will paste, and building a second membership model per room
-- (who is invited, who may invite, what happens when they leave) is a much
-- bigger thing than this. The UI says "unlisted" for that reason, and anyone
-- who needs a hard wall should use a guest link's destination and a space of
-- their own.
--
-- Defaulting to `open` matters for the rooms that already exist: they were
-- created under a rule that listed them to everyone, and quietly hiding them on
-- deploy would look like they had been deleted.
-- ============================================================================

alter table public.rooms_read_model
  add column if not exists visibility text not null default 'open'
  check (visibility in ('open', 'private'));

-- The listing index follows the listing query, which now asks for open rooms.
-- The old index stays useful for the manage view, which asks for all of them.
create index if not exists rooms_tenant_open_idx
  on public.rooms_read_model (tenant_id)
  where closed = false and visibility = 'open';

comment on column public.rooms_read_model.visibility is
  'open = listed to the whole space; private = listed only to owners and admins. Unlisted, not sealed - see the migration.';
