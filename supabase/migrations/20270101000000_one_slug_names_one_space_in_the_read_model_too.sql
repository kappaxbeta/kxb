-- ============================================================================
-- One slug names one space, in the read model too
-- ----------------------------------------------------------------------------
-- Half of the open `tenants_read_model` finding in the review of 2026-08-28,
-- and the half that does not depend on how the other half is decided.
--
-- `tenant_slugs` is the claim table and its `slug` is the primary key: one slug,
-- one space, enforced. `tenants_read_model.slug` is a denormalised copy of the
-- same fact and had only a plain index - so two rows could carry the same slug
-- and the database would not mind.
--
-- That matters because `findPublicTenant()` resolves against the read model
-- *first*, and `/v/[slug]` - a public page, open to anybody, no session - calls
-- it with the service-role client, which bypasses RLS. Combined with the
-- member-writable UPDATE policy on that table, a member of any space could
-- point a slug they do not own at a space they do.
--
-- Two changes, and the index is the one that belongs here:
--
--   * this migration makes the copy carry the constraint the original has, so
--     the second row simply cannot be written;
--   * `findPublicTenant()` now asks `tenant_slugs` first, so the authoritative
--     table decides and the read model is only ever the row it names.
--
-- Neither closes the finding. A member can still rewrite their *own* row's slug
-- to a free one, and every other field on it - that is the design decision
-- written up in the audit. What these two do is make the damage local: you can
-- rename your own space to something silly, and you cannot take somebody
-- else's name.
--
-- The unique index is created plainly rather than CONCURRENTLY, because it must
-- either hold or fail the migration, and this table has one row per space -
-- hundreds, not millions. If it *does* fail on a deployment, that is a real
-- duplicate to look at before forcing it through: two rows with one slug means
-- a projection wrote a row for a space that had already been renamed away.
-- ============================================================================

drop index if exists public.tenants_read_model_slug_idx;

create unique index if not exists tenants_read_model_slug_key
  on public.tenants_read_model (slug);

comment on index public.tenants_read_model_slug_key is
  'One slug, one space - the same rule tenant_slugs.slug carries as its key.';
