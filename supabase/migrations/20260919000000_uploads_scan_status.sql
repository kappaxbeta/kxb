-- ============================================================================
-- Uploads carry the verdict of the check that let them in
-- ----------------------------------------------------------------------------
-- Every upload is now rebuilt from its pixels before it is stored - decoded and
-- re-encoded by `src/lib/image-sanitize.ts`, which is what turns a polyglot
-- (a valid JPEG with an executable appended) back into just a JPEG. That runs
-- inline, inside the upload request, so a file that fails it never gets a row
-- here at all and this column is `clean` on everything the app writes.
--
-- So why store it. Because the inline path is only viable while the check is
-- cheap. The day this pipeline accepts a PDF, or grows a ClamAV pass that wants
-- a second and a half and 1.2GB of signatures, the check has to move off the
-- request - and at that point the row has to exist before the verdict does.
-- Adding the column now costs nothing; adding it later means a migration, two
-- serving routes and the editor all changing in the same commit.
--
-- The half that is load-bearing today is the filter. `/api/uploads/[slug]` and
-- `/api/event-banners/[id]` both select `scan_status = 'clean'`, which is a
-- no-op against a table where every row is clean, and is the entire difference
-- between a quarantine state and a column nobody reads.
-- ============================================================================

alter table public.uploads
  add column if not exists scan_status text not null default 'clean';

-- Separate from the `add column`, which does nothing on a re-run and would take
-- the constraint with it.
alter table public.uploads
  drop constraint if exists uploads_scan_status_check;
alter table public.uploads
  add constraint uploads_scan_status_check
    check (scan_status in ('pending', 'clean', 'rejected'));

comment on column public.uploads.scan_status is
  'Verdict of the content check in src/lib/image-sanitize.ts. `clean` is the '
  'only value the app writes today - the check is inline, so a failure returns '
  'an error instead of inserting a row. `pending` and `rejected` exist for a '
  'future asynchronous scan; the serving routes already refuse anything that is '
  'not `clean`.';

-- Partial, because the serving routes only ever ask for clean rows and the
-- planner should not walk the others. Also keeps the eventual "what is still
-- pending" sweep cheap by staying small.
create index if not exists uploads_pending_idx
  on public.uploads (created_at)
  where scan_status <> 'clean';
