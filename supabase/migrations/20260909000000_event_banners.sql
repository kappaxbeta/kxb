-- ============================================================================
-- Event banners: the hero, saved, and pointed at a door
-- ----------------------------------------------------------------------------
-- The banner studio (`?h=`, src/domain/studio/hero.ts) composes a hero and
-- hands back a PNG. That was right while the only reader was the admin who
-- composed it and the artefact was a file they dropped into a design. It is
-- wrong now that the thing a host wants to do with it is *publish* it: put the
-- picture in front of people who are not signed in, over a button that lets
-- them walk into the event.
--
-- Publishing needs three things the query string cannot give:
--
--   1. A name and an owner, so the arrangement survives losing the link - the
--      cost `hero.ts` accepted in as many words, come due for the same reason
--      published_scenes said it had.
--   2. A rendering, so a page can show the banner without mounting a canvas
--      and a font loader for an anonymous visitor on a phone.
--   3. Somewhere for the event to point at it, so "which banner" is a decision
--      the host makes once rather than a URL they paste into two places.
--
-- ----------------------------------------------------------------------------
-- Why the document *and* a poster, when published_scenes deliberately dropped
-- its poster
-- ----------------------------------------------------------------------------
-- 20260904030000_scene_poster_out.sql took `poster` back out of
-- published_scenes and the argument was good: a picture of a document, stored
-- beside the document, is a cache with no invalidation, and re-saving from
-- anywhere without a canvas left a poster of the old arrangement attached to
-- the new one.
--
-- Both halves of that are answered here rather than ignored:
--
--   * There is exactly one writer. `saveEventBanner` paints the frame at
--     `motion.posterTime` and uploads it in the same call that writes the row,
--     so a row without a freshly baked poster cannot be produced by the app at
--     all. A scene could be re-saved by a fork or an action with no canvas in
--     front of it; a banner cannot - saving one *is* the export.
--   * The reader is not a member. A scene's poster saved a signed-in admin a
--     WebGL context on a list page; this poster is the only way an anonymous
--     visitor sees the banner at all, because the alternative is shipping the
--     painter, nineteen block renders and a font to somebody who has not yet
--     decided to click anything.
--
-- The poster is a slug into `uploads`, not bytes in this row. That reuses the
-- whole upload pipeline - magic-byte sniffing, content addressing, the tenant's
-- storage prefix - and keeps a 1920x1080 PNG out of every query that lists
-- banners. See the public serving route for why it is not read back through
-- /api/uploads/<slug>.
--
-- ----------------------------------------------------------------------------
-- Why a table and not an aggregate
-- ----------------------------------------------------------------------------
-- The same reason published_scenes gives, minus its first half: a banner always
-- has a tenant, so `append_events()` would accept it. What still rules the log
-- out is the second reason - the content is one opaque document replaced
-- wholesale on every save, and "what did this banner look like on Tuesday" is
-- not a question anybody has asked. A stream whose payload is the entire state
-- on every write costs what a table costs and answers nothing extra.
-- ============================================================================

create table if not exists public.event_banners (
  id         uuid primary key default gen_random_uuid(),

  /**
   * The space that made it.
   *
   * Not nullable, unlike published_scenes.tenant_id - there is no platform
   * banner. A banner is composed to be attached to one space's event, and the
   * backoffice studio has no tenant to save into, so it keeps the export
   * buttons it has always had.
   */
  tenant_id  uuid not null references public.tenants_read_model (id) on delete cascade,

  name       text not null check (length(name) between 1 and 60),

  /**
   * The StudioHero, exactly as the composer serialises it.
   *
   * Opaque here on purpose, for the reason published_scenes.document gives:
   * `parseHero` clamps every number and drops any layout, corner or block model
   * it does not recognise, on the way in *and* on the way out. The trust
   * boundary is that parser, not a check constraint here that would have to be
   * kept in step with the document by hand.
   */
  document   jsonb not null,

  /**
   * The baked frame, as an `uploads.slug`.
   *
   * Null is legal and renders as the sky alone - a banner saved from a context
   * where the canvas would not export is still a banner, and losing the picture
   * should not lose the arrangement that made it.
   */
  poster_slug text check (poster_slug is null or length(poster_slug) <= 64),

  /** Who composed it. Nullable so deleting an account does not delete the event's banner. */
  author_id  uuid references auth.users (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.event_banners is
  'Saved hero documents, composed in the banner studio and attachable to an event.';

create index if not exists event_banners_tenant_idx
  on public.event_banners (tenant_id, updated_at desc);

alter table public.event_banners enable row level security;

-- ---------------------------------------------------------------------------
-- Reading, and why there is no anon policy
-- ---------------------------------------------------------------------------
-- A banner is shown to people who are not signed in, so the obvious move is the
-- `to anon using (…)` published_scenes has. It is refused here because the
-- condition would have to be "is this banner attached to an event", which means
-- a policy on this table reaching into event_spaces on every row read - and
-- because the row carries more than the public page shows: the document, the
-- author, the arrangement of a banner the host may still be drafting.
--
-- The public pages read through the service role instead, in one narrow query
-- that returns the two fields a visitor is meant to see. The disclosure is then
-- a decision written in TypeScript that can be read in one place, rather than a
-- predicate that has to stay true as columns are added.
create policy "event_banners_select"
  on public.event_banners for select
  to authenticated
  using (
    public.tenant_role(tenant_id) is not null
    or public.is_backoffice_admin()
  );

-- Composing is the leadership's. A guest at an event may not leave a banner in
-- the space that invited them, and an ordinary member has nowhere to attach one
-- - `set_event_banner` below refuses anybody but an owner or an admin.
create policy "event_banners_insert"
  on public.event_banners for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and public.tenant_role(tenant_id) in ('owner', 'admin')
  );

-- The `with check` repeats the `using` clause so an update cannot hand a banner
-- to another space on its way past.
create policy "event_banners_update"
  on public.event_banners for update
  to authenticated
  using (public.tenant_role(tenant_id) in ('owner', 'admin'))
  with check (public.tenant_role(tenant_id) in ('owner', 'admin'));

create policy "event_banners_delete"
  on public.event_banners for delete
  to authenticated
  using (public.tenant_role(tenant_id) in ('owner', 'admin'));

-- ============================================================================
-- What the event points at
-- ============================================================================

alter table public.event_spaces
  add column if not exists banner_id      uuid
                                          references public.event_banners (id) on delete set null,
  /**
   * The guest link the banner's button carries.
   *
   * A reference to a row in `guest_links` rather than a copy of its token, and
   * that is the whole reason this is a column and not a URL the host types.
   * Revoking a link, spending its last use or letting it expire has to close
   * the door on the front page too - and it does, because the public read joins
   * this row and applies the same rules `/g/[token]` applies. A pasted URL
   * would go on working until somebody remembered the banner existed.
   *
   * `on delete set null`: deleting the link leaves a banner with no button,
   * which is a banner. It must never leave a button pointing nowhere.
   */
    add column if not exists banner_link_id uuid
                                          references public.guest_links (id) on delete set null,
  /**
   * Does this event appear on the front page?
   *
   * Ours, not the host's, and deliberately on the same row as everything else
   * the platform decides - `guest_writes`, `surfaces`, the caps. The front page
   * is the product's own pitch, and a self-serve checkbox that puts a
   * customer's banner on it is a billboard we would be renting by accident.
   *
   * So this is set from the backoffice through the service role, exactly as
   * `configureEvent` sets the rest of this row, and there is no function
   * granting it to anybody holding a session.
   */
    add column if not exists featured      boolean not null default false;

comment on column public.event_spaces.banner_id is
  'The saved banner shown on the public door and, when featured, on the front page.';
comment on column public.event_spaces.banner_link_id is
  'The guest link the banner''s call to action carries. Checked live, so revoking it closes the door.';
comment on column public.event_spaces.featured is
  'Backoffice-only. Whether this event is shown on the front page.';

-- The front page asks "which events are featured and open" on every uncached
-- render, and the answer is nearly always a handful of rows out of every event
-- that has ever run. Partial, so the index is the size of the answer.
create index if not exists event_spaces_featured_idx
  on public.event_spaces (closes_at desc)
  where featured;

-- ============================================================================
-- The one way a host attaches one
-- ============================================================================
-- The same shape and the same argument as `set_event_header` in
-- 20260902000000: everything else on `event_spaces` is the ceiling the platform
-- sold, an update policy would have to be trusted with the whole row because
-- RLS decides rows and not columns, and a `grant update (...)` naming two
-- columns is undone by the next `grant all` nobody notices.
--
-- What this adds over the header's version is that both arguments are
-- *references*, so the function has to prove they are this space's own. Without
-- those two checks a host could point their banner at another space's guest
-- link by id and mint themselves a door into it - the one genuinely dangerous
-- thing on this row, since the token is then rendered to the public.
create or replace function public.set_event_banner(
  p_tenant_id uuid,
  p_banner_id uuid,
  p_link_id   uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  role text;
begin
  select public.tenant_role(p_tenant_id) into role;

  if role is null or role not in ('owner', 'admin') then
    return false;
  end if;

  -- Null clears the attachment, which is how a host takes their banner down.
  if p_banner_id is not null and not exists (
    select 1 from public.event_banners
     where id = p_banner_id and tenant_id = p_tenant_id
  ) then
    return false;
  end if;

  if p_link_id is not null and not exists (
    select 1 from public.guest_links
     where id = p_link_id and tenant_id = p_tenant_id
  ) then
    return false;
  end if;

  update public.event_spaces
     set banner_id      = p_banner_id,
         banner_link_id = p_link_id,
         updated_at     = now()
   where tenant_id = p_tenant_id;

  return found;
end;
$$;

comment on function public.set_event_banner(uuid, uuid, uuid) is
  'Attach one of this space''s saved banners, and the guest link its button carries. Owner and admin only.';

grant execute on function public.set_event_banner(uuid, uuid, uuid) to authenticated;
