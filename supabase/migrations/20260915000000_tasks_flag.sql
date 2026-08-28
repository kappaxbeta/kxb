-- ============================================================================
-- The tasks flag
-- ----------------------------------------------------------------------------
-- Off, and unlike every other flag seeded off this one is not guarding
-- something unfinished - it is withdrawing something finished. A checklist is
-- not what this product is for, and the pages editor already carries task
-- lists for anybody who wants one, so the tab goes and the flag is how a space
-- that still wants it gets it back.
--
-- Seeding `false` is therefore a deliberate change of behaviour for existing
-- deployments, which is the opposite of what the seeds for `worlds`, `scenes`
-- and `open_registration` were doing. It is safe in the way that matters: this
-- gates the tab, the route and the writes, and nothing deletes. Every task
-- event stays in the log and every row stays in the read model, so an override
-- flipped on for one space brings their list back exactly as it was.
-- ============================================================================

insert into public.feature_flags (key, enabled, label, description) values
  ('tasks', false, 'Tasks',
   'The per-space task list and its tab. Off by default - withdrawn in favour of task lists inside pages. Turning it on for a space restores its existing list untouched.')
on conflict (key) do nothing;
