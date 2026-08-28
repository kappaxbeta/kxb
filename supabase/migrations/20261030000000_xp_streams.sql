-- ============================================================================
-- What a level records forever
-- ----------------------------------------------------------------------------
-- The `persistence` port has had three calls since it was written and two
-- implementations of the third: the memory host and `local.ts`. `append` is the
-- one that means *record this outcome and never let it be overwritten* -
-- docs/xp/scenes.md §3.3 made it a separate call precisely so that history is a
-- thing an author chooses rather than a thing every `put` accidentally does -
-- and on our own host it did not exist. A document declaring it in
-- `backend.needs` was honestly refused; a document that merely wanted it lost
-- every result it recorded.
--
-- ---------------------------------------------------------------------------
-- Not the same table as `xp_store`, and not the same table as `xp_sessions`
-- ---------------------------------------------------------------------------
-- Three record-keepers now, and they are different in who is speaking:
--
--   - **`xp_store`** (20261006000000) - the game's *current* state. One row per
--     scope, last-write-wins, answering "how many coins". History would make it
--     a fold from the beginning, which is the cost snapshotting exists to avoid.
--   - **`xp_sessions`** (20261027000000) - the *runtime's* bookkeeping about
--     play. Written by us, about the player, never by the level.
--   - **this** - the *level's* own record, written by an author's script about
--     something that happened in their world. A race time, a winner, a hand
--     played out.
--
-- The third is the only one where the row's shape is the author's rather than
-- ours, which is why `data` is a `jsonb` this table has no opinion about beyond
-- its size.
--
-- ---------------------------------------------------------------------------
-- Ordered by identity, not by a sequence column
-- ---------------------------------------------------------------------------
-- The port promises append-only *and ordered*. A `seq` per stream would mean
-- reading `max(seq) + 1` and writing it back, which two clients can interleave
-- - the loser hitting a unique constraint and retrying, for a number nobody
-- reads. `bigint generated always as identity` is monotonic and already unique,
-- so ordering is `order by id` and there is nothing to contend on.
--
-- ---------------------------------------------------------------------------
-- Nothing reads it through the port yet, and that is not an oversight
-- ---------------------------------------------------------------------------
-- `XpPersistence` is `get`, `put`, `append` - there is no `history`. Reading
-- everybody's is the same shape as `board()` on the store, which sits *beside*
-- the port rather than in it, and the day a document asks for its own history
-- that is where it goes. Until then the rows are readable by the people the
-- policies below name, and the guarantee being bought now is the one that
-- cannot be added later: that the writes happened, in order, and that nothing
-- overwrote them.
-- ============================================================================

create table if not exists public.xp_streams (
  id uuid primary key default gen_random_uuid(),

  /**
   * The order, and the only one there is.
   *
   * Separate from the key so it can be `identity`: a uuid primary key does not
   * sort, and "append-only and ordered" is the whole promise of this call.
   */
  ordinal bigint generated always as identity,

  xp_id uuid not null references public.xps_read_model (id) on delete cascade,

  /**
   * The author's name for one stream - `match:1`, `times`, `hands`.
   *
   * Theirs entirely, and bounded rather than validated: this table cannot know
   * what a level's streams are called, and a rule guessing at it would be a
   * rule an author has to work around. The alphabet is left open for the same
   * reason `store` keys are, and the length is the ceiling that keeps an
   * accidental blob out of a name.
   */
  stream text not null check (char_length(stream) between 1 and 64),

  /** What kind of thing happened. The author's word, same treatment. */
  type text not null check (char_length(type) between 1 and 64),

  /**
   * What happened, and this table has no opinion about its shape.
   *
   * 2 KB, which is the size that matters here rather than `xp_store`'s 256 KB:
   * that one is a whole save and this is one event, and a hundred thousand of
   * them is the failure mode. A race time is forty bytes. A document that needs
   * more per event is describing a save.
   */
  data jsonb not null default '{}'::jsonb,
  constraint xp_streams_data_size check (pg_column_size(data) <= 2048),

  /**
   * Who was playing when the level recorded this.
   *
   * `on delete set null` rather than a cascade, and it is the same argument
   * `xp_sessions` makes: a race time that vanished when somebody closed their
   * account would silently rewrite the level's own history, which is the one
   * thing an append-only record must not do. The person goes; what happened
   * stays, with nobody attached to it.
   */
  account_id uuid references auth.users (id) on delete set null,

  at timestamptz not null default now()
);

/** Reading one stream, in order. The only access pattern there is. */
create index if not exists xp_streams_reading_idx
  on public.xp_streams (xp_id, stream, ordinal);

/** The ceiling below is counted per writer, so it is indexed that way. */
create index if not exists xp_streams_writer_idx
  on public.xp_streams (xp_id, stream, account_id);

alter table public.xp_streams enable row level security;

-- ---------------------------------------------------------------------------
-- Who may read, and the absence that matters
-- ---------------------------------------------------------------------------
-- **There is no UPDATE policy and no DELETE policy**, and that absence is the
-- whole feature: a score that can be overwritten is a score somebody can
-- overwrite, which is `host.ts`'s own sentence about why this call exists. It
-- is the same way `events` is kept append-only.
--
-- Reading is the space's and the owner's, through the two predicates that
-- already exist and neither of which reads the table it guards. Deliberately
-- *not* per-writer-only: a leaderboard is the point, and a history only its
-- author can see is a history with no use.
--
-- What this means for an author, said out loud because it is a real
-- consequence: **whatever a level appends is visible to the space it lives in.**
-- This is the level's record rather than the player's save, and it is not the
-- place for anything a player would consider theirs. `player` scope on
-- `xp_store` is that place, and only its owner can read it.
create policy "xp_streams_select"
  on public.xp_streams for select
  to authenticated
  using (public.xp_is_mine(xp_id) or public.xp_in_my_space(xp_id));

-- No insert policy either: every write goes through the function below, which
-- is where the ceiling lives. A policy that admitted a direct insert would be a
-- second way in that the ceiling does not guard.

/**
 * Append one entry, or refuse and say why.
 *
 * `security definer`, because the ceiling is the point and a check the caller
 * could skip is not a ceiling. It also assigns the author's account rather than
 * accepting one, so a level cannot record something under somebody else's name.
 *
 * ---------------------------------------------------------------------------
 * The ceiling is per writer, which is the version that works
 * ---------------------------------------------------------------------------
 * A cap per `(xp, stream)` is the obvious one and it is the wrong one: one
 * account in a loop fills it and every other player's writes are refused from
 * then on - a denial of service against the level, by a stranger, on the
 * author's behalf. Per `(xp, stream, account)` a runaway script costs its own
 * author their own history and nobody else's.
 *
 * 500 entries at 2 KB is a megabyte per person per stream, which is far above a
 * season of race times and far below a problem.
 *
 * ---------------------------------------------------------------------------
 * Refused, not dropped
 * ---------------------------------------------------------------------------
 * Hitting the ceiling raises. `append` returns a promise the runtime can catch
 * and show, exactly as a failed `put` already is (§7.8), and a call that
 * silently discarded the thing an author asked to keep forever would be the
 * worst possible reading of this port's one promise.
 */
create or replace function public.xp_stream_append(
  p_xp_id  uuid,
  p_stream text,
  p_type   text,
  p_data   jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account uuid := (select auth.uid());
  v_held    bigint;
begin
  if v_account is null then
    raise exception 'recording in this level needs an account; this session has none'
      using errcode = '42501';
  end if;

  /**
   * The level has to be one this person is in.
   *
   * The same reach as the select policy, and it is checked here because the
   * definer bypasses that policy: without it, any account could write into any
   * project's stream by knowing its id.
   */
  if not (public.xp_is_mine(p_xp_id) or public.xp_in_my_space(p_xp_id)) then
    raise exception 'no such level' using errcode = '42501';
  end if;

  select count(*) into v_held
    from public.xp_streams s
   where s.xp_id = p_xp_id
     and s.stream = p_stream
     and s.account_id = v_account;

  if v_held >= 500 then
    raise exception 'this level has recorded as much as it may in "%" (500 entries)', p_stream
      using errcode = '53100';
  end if;

  /**
   * The size, said in words rather than left to the constraint.
   *
   * The check on the column is what actually enforces it and stays; this is
   * about what an author reads when they hit it. Without this the sentence is
   * `new row for relation "xp_streams" violates check constraint
   * "xp_streams_data_size"`, which names our table and our constraint to
   * somebody whose only question is which of their events was too big — and the
   * other three refusals here are already phrased for a person.
   */
  if pg_column_size(coalesce(p_data, '{}'::jsonb)) > 2048 then
    raise exception 'one recorded event may be 2 KB; "%" was bigger. A save that size belongs in store.put', p_type
      using errcode = '22001';
  end if;

  insert into public.xp_streams (xp_id, stream, type, data, account_id)
  values (p_xp_id, p_stream, p_type, coalesce(p_data, '{}'::jsonb), v_account);
end;
$$;

revoke execute on function public.xp_stream_append(uuid, text, text, jsonb) from public;
grant execute on function public.xp_stream_append(uuid, text, text, jsonb) to authenticated;

comment on table public.xp_streams is
  'A level''s own append-only record, behind persistence.append. No UPDATE and '
  'no DELETE policy: that absence is the guarantee. Written only through '
  'xp_stream_append, which holds the per-writer ceiling.';
