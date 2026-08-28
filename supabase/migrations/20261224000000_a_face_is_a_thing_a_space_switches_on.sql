-- ============================================================================
-- The faces flag
-- ----------------------------------------------------------------------------
-- Off by default, like `worlds`, `battle`, `agents` and `radio` before it, and
-- for a reason sharper than any of them. Every other flag in this registry
-- decides whether a *control* is offered. This one decides whether a room
-- containing other people has a camera button in it at all, in a product whose
-- rooms nobody joined expecting to be seen in.
--
-- Nobody's camera can switch itself on: the browser's own permission prompt
-- stands between the button and the light, and it is asked on each person's own
-- device. That is a reason the wrong default is recoverable, not a reason to
-- pick it.
--
-- ----------------------------------------------------------------------------
-- Why this migration exists at all, when the code already falls back to false
-- ----------------------------------------------------------------------------
-- `resolveFeatures` merges the database over the registry's fallbacks, so a key
-- added in code and never inserted here resolves to `false` and the feature is
-- correctly off. The application therefore does not need this row.
--
-- The *backoffice* does. /ovaloffice/feature-flags lists what
-- `listFeatureFlags` reads out of this table, so a flag with no row is not a
-- flag showing as off - it is a flag that is not on the page, and cannot be
-- turned on by anybody. Without this, `faces` would be permanently unreachable
-- surface: shipped, inert, and with no switch anywhere.
--
-- `do nothing` rather than `do update`, so running this against a database
-- where somebody has already switched it on does not switch it back off.
-- ============================================================================

insert into public.feature_flags (key, enabled, label, description) values
  ('faces', false, 'Faces in the lounge',
   'People in a world may switch on their camera, and wear it as a face over their body. The picture goes directly from one browser to another and is never stored.')
on conflict (key) do nothing;
