-- ============================================================================
-- The levels we ship, and the two things an operator may say about one
-- ----------------------------------------------------------------------------
-- Every `.xp.json` under `public/xp/xps/` is a level the platform ships. Until
-- now that was the whole story: the file is in the image, `listBuiltinXps` and
-- `listXpCatalogue` read the directory, and the only way to change what is on
-- the shelf was a commit and a deploy. That is right for the *content* - a
-- level is code, it belongs in the repo, and it is reviewed the way code is -
-- and wrong for the two decisions an operator actually needs to make between
-- deploys:
--
--   * **is this one listed** - a level that turns out to be broken, or one
--     built ahead of an announcement, should be takeable off the shelf now
--     rather than at the next deploy;
--   * **is this one still the version we shipped** - a fix typed in the editor
--     and dropped back in, live, without waiting for CI.
--
-- So this table is an *overlay*, not a store. No row means "exactly what the
-- image holds, listed" - which is what every level is the moment it is added to
-- the repo, with nothing to insert and nothing to remember. A row is an
-- operator having said otherwise.
--
-- ----------------------------------------------------------------------------
-- `published` is about the shelf, not about secrecy
-- ----------------------------------------------------------------------------
-- Worth being blunt, because the column name invites the wrong reading: these
-- documents live under `public/` and are served as static files. Unpublishing
-- one takes it out of the store, the battle picker and the play rail; it does
-- not make `/xp/xps/<id>.xp.json` stop answering, and it never could while the
-- file is in the image. Anything that must not be readable does not belong in
-- `public/` in the first place.
--
-- ----------------------------------------------------------------------------
-- Why the document is a column here rather than a version in `xp_versions`
-- ----------------------------------------------------------------------------
-- `xp_versions` belongs to projects: rows in `xps_read_model`, owned by a
-- tenant, with a stream, a review state and a copy history. A builtin has none
-- of those - it is identified by a filename, and `domain/xps/ref.ts` spells it
-- `builtin:<id>` precisely so that it is *not* a project reference. Giving one
-- a project row to hold an override would mean inventing an owner space for
-- levels the platform ships, and every surface that asks "is this ours or
-- somebody's" would have to learn a fourth answer.
--
-- One nullable jsonb column says the whole thing instead: null is "the file we
-- shipped", non-null is "this, until somebody reverts it". Reverting is
-- `document = null`, which is what makes the next deploy meaningful again.
-- ============================================================================

create table if not exists public.builtin_xps (
  /**
   * The filename without its suffix - `steal-a-plant`.
   *
   * Constrained to the same alphabet the routes already enforce
   * (`safeId` in `/xp/[id]`), because this string is joined onto a path on the
   * way to `readFile`. A row that could not name a file is a row that should
   * not exist.
   */
  id          text primary key check (id ~ '^[a-z0-9][a-z0-9-]*$'),

  /** On the shelf. Default true, so a row written only to hold an override
   *  does not quietly take the level down. */
  published   boolean not null default true,

  /**
   * The document to serve instead of the file, or null for "the file".
   *
   * Validated by `parseXp` before it is written, in `builtin-actions.ts` -
   * there is no check constraint here that could do the same job, and one that
   * only asserted `jsonb_typeof = 'object'` would be a guard people mistake for
   * the real one.
   */
  document    jsonb check (document is null or jsonb_typeof(document) = 'object'),

  /** What the override weighs, so the list can say so without parsing it. */
  bytes       integer check (bytes is null or bytes >= 0),

  /** Who last touched it, for the row and for the audit line beside it. */
  updated_by  uuid references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

-- The read every listing does: "which of these are off the shelf, and which are
-- overridden". Small table, so this is for shape rather than for speed - it is
-- the index a `where not published` scan would want the day the shelf is long.
create index if not exists builtin_xps_unlisted_idx
  on public.builtin_xps (id)
  where not published;

alter table public.builtin_xps enable row level security;

-- ---------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------
-- Anybody, signed in or not. The store at /browse is a public page and the
-- overlay is what tells it which cards to draw; a policy that needed a session
-- would mean a signed-out visitor seeing a level the team had taken down.
--
-- The `document` column travels with that, and the header says why it costs
-- nothing: the shipped document is a static file on the same host already.
create policy "builtin_xps_select"
  on public.builtin_xps for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Writing
-- ---------------------------------------------------------------------------
-- No policy at all, deliberately, and the same reasoning as `backoffice_audit`:
-- the only writer is a server action that has already passed
-- `requireBackofficeSection('xps', 'write')` and runs with the service role. A
-- policy here would be a second, weaker answer to a question the gate has
-- already answered - and the shape it would need (`is_backoffice_admin()`)
-- cannot see per-section grants at all, so it would be wrong as well as
-- redundant.
