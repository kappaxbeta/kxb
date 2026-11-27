-- ============================================================================
-- An episode's points: the plan for it, before there is prose
-- ----------------------------------------------------------------------------
-- The season writer under Pages lays a season out as its episodes and a few
-- lines each - what happens, who wants what - and hands those lines to the
-- browser's own model to write the episode from. `EpisodeOutlined` in
-- src/domain/channels/events.ts is the event, and its comment says why it is
-- not part of a save: rewording a plan must not move the version, must not
-- make a published episode `changed`, and must be allowed while in review.
--
-- One column on the read model, and nothing about who may read it changes:
-- the row's existing policies already decide who sees an episode at all, and
-- the points are the author's notes on it, shown to the same people.
--
-- `updated_at` is never touched by an outline (see the projection), because
-- `episodeWindow` reads it as "when was this last sent out".
-- ============================================================================

alter table public.channel_episodes_read_model
  add column if not exists outline text not null default '';

-- The domain's own ceiling (MAX_POINTS), stated where a bypass would land.
alter table public.channel_episodes_read_model
  drop constraint if exists channel_episodes_outline_length;
alter table public.channel_episodes_read_model
  add constraint channel_episodes_outline_length check (char_length(outline) <= 4000);

comment on column public.channel_episodes_read_model.outline is
  'The episode''s points, from EpisodeOutlined. The plan for the prose, not the prose; never moves updated_at.';
