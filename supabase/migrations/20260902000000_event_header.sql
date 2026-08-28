-- ============================================================================
-- The event's own header: what the banner says, and where it points
-- ----------------------------------------------------------------------------
-- `EventBanner` renders on every page inside an event and says one thing: when
-- the doors shut. That is the fact nobody can work out from inside a 3D room,
-- and it stays. What it cannot say is anything about *this* event - and the
-- host is the only person who knows the wifi password, the Discord, the
-- schedule, or that the keynote moved to Hall 2.
--
-- So three columns and no new table. The banner already reads `event_spaces`
-- on every page load, so putting the header anywhere else would be a second
-- query for every visit to say a sentence.
--
-- ----------------------------------------------------------------------------
-- Why a function rather than an update policy
-- ----------------------------------------------------------------------------
-- Everything else on this row is the *ceiling* - what the platform sold this
-- event - and it is deliberately backoffice-only, because a host who could
-- widen `guest_writes` could grant themselves what they did not buy. The
-- header is the opposite: it is the host's own copy, and waiting on us to
-- change a sentence on the day of their event is absurd.
--
-- An update policy would have to be trusted with the whole row, since RLS
-- decides rows and not columns; getting the column list right would then live
-- in a `grant update (...)` that any later `grant all` quietly undoes. A
-- SECURITY DEFINER function takes three arguments and can touch nothing else,
-- so the write surface is the signature and cannot drift.
-- ============================================================================

alter table public.event_spaces
  add column if not exists headline text,
  add column if not exists blurb    text,
  add column if not exists links    jsonb not null default '[]'::jsonb;

comment on column public.event_spaces.headline is
  'The host''s own line in the banner. NULL falls back to the phase sentence, which is what every event says before anybody writes one.';
comment on column public.event_spaces.blurb is
  'A sentence or two under the headline. Optional, and usually the schedule or the wifi.';
comment on column public.event_spaces.links is
  'Named links shown in the banner: [{"name": "...", "url": "..."}]. Ordered as the host ordered them.';

-- The shape is checked here as well as in the action, because the action is
-- one caller and this column is read by the banner on every page in the event.
-- A malformed row would render as a crash inside somebody's hackathon.
--
-- A function rather than the predicate written inline, because a CHECK may not
-- contain a subquery and unrolling `jsonb_array_elements` needs one. IMMUTABLE
-- is true of it: it reads nothing but its argument.
create or replace function public.event_links_ok(p_links jsonb)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(p_links) = 'array'
     and jsonb_array_length(p_links) <= 8
     and not exists (
       select 1
         from jsonb_array_elements(p_links) as link
        where jsonb_typeof(link) <> 'object'
           or coalesce(link ->> 'name', '') = ''
           or coalesce(link ->> 'url', '')  = ''
           or length(link ->> 'name') > 40
           or length(link ->> 'url')  > 300
           -- Two schemes and nothing else. `javascript:` in an href that every
           -- guest at an event clicks is the whole reason this list is checked
           -- in the database rather than trusted from the form.
           or not (link ->> 'url' ~* '^https?://')
     );
$$;

comment on function public.event_links_ok(jsonb) is
  'Is this a well-formed event_spaces.links array? Named links, http(s) only, at most eight.';

alter table public.event_spaces
  drop constraint if exists event_spaces_links_shape;

alter table public.event_spaces
  add constraint event_spaces_links_shape check (public.event_links_ok(links));

-- ----------------------------------------------------------------------------
-- The one way a host writes it.
--
-- Owner and admin only: staff at an event are the people who may flip its
-- switches, and this is the same kind of decision. A guest with the link is
-- not one of them.
--
-- Returns false rather than raising when the space is not an event, so the
-- action can say "this space has no event" instead of surfacing a Postgres
-- exception string to somebody looking at a form.
-- ----------------------------------------------------------------------------
create or replace function public.set_event_header(
  p_tenant_id uuid,
  p_headline  text,
  p_blurb     text,
  p_links     jsonb
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

  update public.event_spaces
     set headline   = nullif(btrim(coalesce(p_headline, '')), ''),
         blurb      = nullif(btrim(coalesce(p_blurb, '')), ''),
         links      = coalesce(p_links, '[]'::jsonb),
         updated_at = now()
   where tenant_id = p_tenant_id;

  return found;
end;
$$;

grant execute on function public.set_event_header(uuid, text, text, jsonb) to authenticated;
