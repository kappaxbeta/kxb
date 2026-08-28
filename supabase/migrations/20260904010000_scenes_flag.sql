-- ============================================================================
-- The scenes flag
-- ----------------------------------------------------------------------------
-- Off by default, like `worlds` before it and for the same reason: this seeds
-- new surface rather than describing something already shipped, so a resolver
-- outage must not be what turns it on.
--
-- What it gates is the *space* half - pinning a scene to a space's board, and
-- the space's own saved scenes. It does not gate /ovaloffice/scenes, which
-- belongs to the platform, is behind the backoffice admin check already, and
-- has no tenant to read a flag from.
--
-- Note what it deliberately does *not* gate: watching a scene that is already
-- on a board. A flag turned off after somebody pinned one would otherwise leave
-- a notice referring to a picture nobody can see, which is worse than the
-- feature being on - so the flag guards the composer, and the card renders for
-- whoever the row-level policy already lets read the scene.
-- ============================================================================

insert into public.feature_flags (key, enabled, label, description) values
  ('scenes', false, 'Scenes',
   'A space can save scenes from the motion studio and pin them to its board, where they play in place.')
on conflict (key) do nothing;
