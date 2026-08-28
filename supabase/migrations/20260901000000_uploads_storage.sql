-- ============================================================================
-- Uploads move off the app server's disk and into Supabase Storage
-- ----------------------------------------------------------------------------
-- The files used to live on a bind mount next to the app container. That works
-- exactly as long as there is one machine: two app *containers* on one box share
-- the mount, but two app *boxes* do not. An upload accepted by node B is a 404
-- from node A, half the time, forever - which is the single thing standing
-- between this app and a load balancer.
--
-- What does NOT change is the access check. `public.uploads` is still the
-- authorization record: the serving route looks the slug up with the caller's
-- own session, RLS on that table decides whether a row comes back, and a
-- non-member still gets a 404. Only the place the bytes are read from moves.
--
-- The bucket is private, and there are deliberately no policies on
-- `storage.objects` for it. Nothing but the app's service-role client ever
-- touches it, and it is never handed out as a URL - so a browser holding a
-- valid session still cannot reach an object except through `/api/uploads`,
-- which is the only place the tenant check happens. That mirrors the property
-- the bind mount had: the filesystem was not public either, the route was the
-- only door. Adding a public policy here would quietly reopen exactly the hole
-- the uploads table was created to close.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'uploads',
  'uploads',
  false,
  -- Kept in step with MAX_UPLOAD_BYTES in src/lib/uploads.ts. The route checks
  -- the size twice already; this is the backstop for anything that ever reaches
  -- Storage without going through the route.
  10485760,
  -- The same four types the route sniffs for. A file whose bytes say PNG can
  -- still only be stored as one of these, so a future bug in the sniffer cannot
  -- put an HTML document in a bucket we serve from.
  array['image/png', 'image/jpeg', 'image/gif', 'image/webp']
)
on conflict (id) do update
  set public            = excluded.public,
      file_size_limit   = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- The column's meaning narrowed: it used to be a path on a disk this process
-- could stat, and is now an object key inside the bucket above. Same value,
-- same content-addressed `<tenant>/<checksum>.<ext>` shape - the backfill script
-- reuses the paths rather than reminting them, so existing rows keep working
-- without a data migration.
comment on column public.uploads.storage_path is
  'Object key in the private `uploads` Storage bucket: <tenant_id>/<checksum>.<ext>. '
  'Content-addressed, so two uploads of the same bytes share one object and cost '
  'one extra slug rather than a second copy.';
