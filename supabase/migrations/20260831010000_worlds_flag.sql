-- ============================================================================
-- The world catalogue flag
-- ----------------------------------------------------------------------------
-- Off by default, like `battle`, `agents` and `radio` before it, and for the
-- same reason: this seeds new surface rather than describing something already
-- shipped, so a resolver outage must not be what turns it on.
--
-- What it gates is the *space* half - a workspace's own builder, its saved
-- worlds, and pulling one into a battlefield. It does not gate /worlds, which
-- is a public page belonging to the platform rather than to any space, and has
-- no tenant to read a flag from.
-- ============================================================================

insert into public.feature_flags (key, enabled, label, description) values
  ('worlds', false, 'World catalogue',
   'A space can build worlds in the block builder, publish them, and pull worlds other spaces have published into a battlefield of its own.')
on conflict (key) do nothing;
