-- ============================================================================
-- Uploads: an opaque slug per file
-- ----------------------------------------------------------------------------
-- The previous scheme put the tenant id and page id directly in the image URL
-- (`/api/uploads/<tenant-uuid>/<page-id>-<hash>.png`) and served the file to
-- anyone who asked. Two problems, and only one of them is cosmetic.
--
-- The cosmetic one: every embedded image leaked the workspace's internal ids
-- into any document, screenshot or support ticket it appeared in.
--
-- The real one: there was no authorization at all. Private notes in a paid
-- workspace were readable by anyone who had ever seen the URL - including
-- anyone the image was forwarded to.
--
-- This table fixes both by making the URL an opaque slug and giving that slug a
-- row. RLS on the row *is* the access check: the serving route looks the slug
-- up with the caller's own session, so a non-member simply gets no row and the
-- file is a 404. No separate permission logic to keep in sync.
-- ============================================================================

create table if not exists public.uploads (
  /**
   * The public identifier, and the whole of the URL. Random rather than derived
   * so it reveals nothing about the workspace, the page, or the file.
   */
  slug         text        primary key,
  tenant_id    uuid        not null,
  /** Which page it was inserted into, when known. For cleanup, not for access. */
  page_id      uuid,
  /**
   * Path on disk, relative to UPLOAD_DIR. Content-addressed, so two uploads of
   * the same bytes share one file and a duplicated image costs one slug rather
   * than a second copy.
   */
  storage_path text        not null,
  /**
   * Sniffed from the file's magic bytes, never taken from the browser. This is
   * what the serving route sends as Content-Type, so a lie here is a stored
   * XSS rather than a cosmetic error.
   */
  mime         text        not null,
  size_bytes   integer     not null,
  checksum     text        not null,
  uploaded_by  uuid,
  created_at   timestamptz not null default now()
);

create index if not exists uploads_tenant_idx on public.uploads (tenant_id, created_at desc);
-- Several slugs can point at one file; a delete needs to know if it is the last.
create index if not exists uploads_storage_idx on public.uploads (tenant_id, storage_path);

alter table public.uploads enable row level security;

-- Membership is the access check. The serving route selects by slug using the
-- caller's session, so this policy is what makes an outsider's request a 404.
drop policy if exists "uploads_select_tenant" on public.uploads;
create policy "uploads_select_tenant"
  on public.uploads for select
  using (public.tenant_role(tenant_id) is not null);

drop policy if exists "uploads_insert_tenant" on public.uploads;
create policy "uploads_insert_tenant"
  on public.uploads for insert
  with check (public.tenant_role(tenant_id) is not null);

drop policy if exists "uploads_delete_tenant" on public.uploads;
create policy "uploads_delete_tenant"
  on public.uploads for delete
  using (public.tenant_role(tenant_id) is not null);
