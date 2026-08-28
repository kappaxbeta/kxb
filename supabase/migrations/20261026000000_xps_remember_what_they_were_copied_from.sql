-- ============================================================================
-- A copy remembers what it was copied from
-- ============================================================================
-- docs/xp/backlog.md §1c: *"in the room tab, admins and members can both edit —
-- but a member cannot change the instance code. They open the editor, make a
-- copy in the space, change that, and it shows in the room."*
--
-- The fact needed to close that loop already exists and was being thrown away.
-- `XpCreated` has carried `copiedFrom` since `copyXp` was written; the
-- projection never wrote it down, so nothing could ask *which of this space's
-- projects came from the level this room plays* — which is the whole of "and it
-- shows in the room", and the difference between an offer somebody can find and
-- a draft buried among every project in the space.
--
-- ----------------------------------------------------------------------------
-- Derived, not declared, and that is the decision
-- ----------------------------------------------------------------------------
-- The alternative was an explicit "offer this copy to room X" — a second column
-- and a second act. It is worse for one reason: a member could then make the
-- copy and never offer it, which is exactly the dead end this entry exists to
-- remove. A copy of the level a room plays *is* the offer.
--
-- What that costs, said plainly: a copy taken for some unrelated reason also
-- appears on the room's list. That is a list an admin reads and chooses from
-- rather than something that fires on its own, and the project's name is on it.
--
-- ----------------------------------------------------------------------------
-- Nullable, and no foreign key
-- ----------------------------------------------------------------------------
-- Nullable because nearly every project is not a copy, and a default would be
-- inventing a source for the ones that were made from nothing.
--
-- **No `references`**, deliberately. The source may be archived, removed, or
-- moved to another space, and none of those should reach over and rewrite the
-- copy's own history — a copy is a fact about how a document came to exist, not
-- a live link to a row. `on delete set null` would erase that fact and cascade
-- would delete work belonging to somebody else, which is the same argument
-- `owner_id` makes one column up and lands the other side of it.
-- ============================================================================

alter table public.xps_read_model
  add column if not exists copied_from uuid;

comment on column public.xps_read_model.copied_from is
  'The project this one was copied from, from XpCreated. Not a foreign key: a '
  'copy is a fact about how a document came to exist, and an archived or moved '
  'source must not rewrite it. See 20261026000000.';

-- The only question asked of it: "what in this space came from that project?"
-- Partial for the same reason `xps_tenant_idx` is - a room's list of offers
-- never wants archived work - and on the pair because the tenant is always
-- known before the source is.
create index if not exists xps_copied_from_idx
  on public.xps_read_model (tenant_id, copied_from)
  where copied_from is not null and state <> 'archived';

-- ----------------------------------------------------------------------------
-- Backfill from the log, because the fact was never lost - only unwritten
-- ----------------------------------------------------------------------------
-- Every copy ever made carries this in its own `XpCreated`, so the column can
-- be filled without a replay of the whole projection. A rebuild would also do
-- it and would rewrite every row in the table to recover one field.
update public.xps_read_model x
set copied_from = (e.data ->> 'copiedFrom')::uuid
from public.events e
where e.stream_id = x.id
  and e.type = 'XpCreated'
  and e.data ? 'copiedFrom'
  and x.copied_from is null;
