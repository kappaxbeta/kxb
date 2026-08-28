-- ============================================================================
-- The arbiter: outcomes no client may decide
-- ----------------------------------------------------------------------------
-- docs/xp/server-authority.md §4.1. The first slice of §4, and deliberately not
-- a card game: a kill. Two clients disagree, one of them is the one who
-- benefits, there is no secret anywhere in it, and the outcome has to move two
-- numbers at once.
--
-- ---------------------------------------------------------------------------
-- Why this is a database function and not an edge function
-- ---------------------------------------------------------------------------
-- The hardest requirement in §4 is not secrecy. It is *two rows changing
-- together or not at all, with one of the owners offline* - which is a
-- transaction, and this is the only thing in the stack that has one. An edge
-- function holding per-round state is a second stateful thing to operate and
-- one that loses the round it was holding when it restarts.
--
-- And the constraint that removes a whole family of designs: **nothing here
-- mints a token.** Production signs its JWTs with ES256 and there is no shared
-- secret to sign with, so any design where a server hands the client a
-- per-round credential works on a laptop and fails on the box. The caller's
-- ordinary session is the identity; `auth.uid()` is read here and the client is
-- never asked who it is.
--
-- ---------------------------------------------------------------------------
-- The table has no select policy, and that is the point
-- ---------------------------------------------------------------------------
-- RLS is on and *nothing* grants a direct read. The functions below are the
-- only door, which is what makes "the client cannot see the other hand" a
-- property of the schema rather than a rule every future query has to remember.
-- Today's state holds no secret at all; the shape is established now so that the
-- first thing that does is not also the first thing to need a new table.
--
-- The instance key is the room's topic - the one string every client in an
-- instance already agrees about, and the same string the seeded dice are
-- addressed from.
-- ============================================================================

create table if not exists public.xp_arbiter_state (
  /** The room topic. Same value every client in the instance already holds. */
  instance   text        primary key,
  /**
   * Which XP is being played, when it is a saved one.
   *
   * Nullable because a lobby or a demo room is a real instance with no project
   * behind it, and refusing those would mean the arbiter only works for games
   * somebody had already published.
   */
  xp_id      uuid        references public.xps_read_model (id) on delete cascade,
  /** Scores, lives, and whatever a later game keeps. Never read by a client. */
  state      jsonb       not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists xp_arbiter_state_xp_idx on public.xp_arbiter_state (xp_id);
-- For the sweep. A finished match's row is worth keeping for as long as
-- somebody might reload into it and no longer.
create index if not exists xp_arbiter_state_updated_idx on public.xp_arbiter_state (updated_at);

alter table public.xp_arbiter_state enable row level security;

-- No policies. Deliberately, and it is not an oversight to be fixed later:
-- with RLS on and nothing granted, every path to this table is one of the
-- definer functions below. A `select` policy added here in six months is the
-- change that quietly turns a secret into a fetch.

comment on table public.xp_arbiter_state is
  'Server-decided state for one XP instance, keyed by room topic. No client '
  'reads this table directly - xp_arbitrate and xp_arbiter_view are the only '
  'door. See docs/xp/server-authority.md §4.1.';

-- ----------------------------------------------------------------------------
-- Asking for an outcome
-- ----------------------------------------------------------------------------
-- Returns a *verdict*, never a bare value: `{ok: true, outcome: …}` or
-- `{ok: false, why: …, message: …}`, matching `XpVerdict` in
-- packages/xp/src/host.ts. "Stored it" and "agreed with you" are different
-- answers and one number cannot say which it meant.
--
-- `why` is one of `refused` (the rules said no) or `stale` (the round moved on).
-- The third kind, `lost`, is never returned by anything: it is what the *client*
-- concludes when no reply arrives, and a server that could send it would by
-- definition not have lost the message.
--
-- `security definer`, because the table denies everyone. `set search_path` for
-- the usual reason a definer function must.
create or replace function public.xp_arbitrate(
  p_instance text,
  p_action   text,
  p_payload  jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller  uuid := auth.uid();
  current jsonb;
  scores  jsonb;
  lives   jsonb;
  victim  text;
  starting integer;
begin
  -- An arbiter without an identity cannot credit anybody, so it refuses rather
  -- than inventing one. This is why a document needing `arbiter` also needs
  -- `identity`: a guest with no account can play, but not in a game whose
  -- outcomes are decided here.
  if caller is null then
    return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'sign in to play a decided game');
  end if;

  if p_instance is null or length(p_instance) = 0 then
    return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'no instance');
  end if;

  -- The row is created by whoever gets there first and then locked for the rest
  -- of this statement. Read-then-write without this lock is how two kills in
  -- the same tick both read three lives and both write two.
  insert into public.xp_arbiter_state (instance)
  values (p_instance)
  on conflict (instance) do nothing;

  select state into current
  from public.xp_arbiter_state
  where instance = p_instance
  for update;

  scores := coalesce(current -> 'scores', '{}'::jsonb);
  lives  := coalesce(current -> 'lives', '{}'::jsonb);

  if p_action = 'join' then
    starting := coalesce((p_payload ->> 'lives')::integer, 3);
    -- Joining twice is not an error and must not refill your lives; a client
    -- that reconnects mid-match would otherwise come back whole.
    if not (lives ? caller::text) then
      lives := lives || jsonb_build_object(caller::text, starting);
      scores := scores || jsonb_build_object(caller::text, coalesce((scores ->> caller::text)::integer, 0));
    end if;

  elsif p_action = 'kill' then
    victim := p_payload ->> 'victim';

    if victim is null then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'no victim');
    end if;
    -- The credit goes to whoever asked, never to whoever the payload named. A
    -- client that can name the scorer is a client that can score for somebody
    -- else, which is the same bug as trusting the wire.
    if victim = caller::text then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'you cannot kill yourself for a point');
    end if;
    if not (lives ? victim) then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'no such player');
    end if;
    if coalesce((lives ->> victim)::integer, 0) <= 0 then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'already out');
    end if;
    if not (lives ? caller::text) then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'you are not in this match');
    end if;

    -- Both numbers, in one assignment each, inside one transaction. Either the
    -- update below happens or neither of these did - which is the requirement
    -- §7.6 could not get from last-write-wins over two jsonb blobs.
    lives  := lives  || jsonb_build_object(victim, (lives ->> victim)::integer - 1);
    scores := scores || jsonb_build_object(caller::text, coalesce((scores ->> caller::text)::integer, 0) + 1);

  else
    return jsonb_build_object('ok', false, 'why', 'refused', 'message', format('no rule for "%s"', p_action));
  end if;

  update public.xp_arbiter_state
  set state = jsonb_build_object('scores', scores, 'lives', lives),
      updated_at = now()
  where instance = p_instance;

  return jsonb_build_object(
    'ok', true,
    'outcome', jsonb_build_object('scores', scores, 'lives', lives)
  );
end;
$$;

comment on function public.xp_arbitrate(text, text, jsonb) is
  'Ask for an outcome in one XP instance. Returns an XpVerdict as jsonb. The '
  'caller is auth.uid() and never the payload.';

-- ----------------------------------------------------------------------------
-- Reading what you are entitled to know
-- ----------------------------------------------------------------------------
-- A *reply to the asker*, never a broadcast: the socket sends to the whole
-- topic, so there is no such thing as a private message on it.
--
-- Nothing in a deathmatch is secret, so this returns the whole of it today. The
-- redaction is one expression in one place, which is what makes the first game
-- with a hand a change here rather than a new mechanism.
create or replace function public.xp_arbiter_view(p_instance text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller  uuid := auth.uid();
  current jsonb;
begin
  if caller is null then
    return jsonb_build_object('scores', '{}'::jsonb, 'lives', '{}'::jsonb, 'me', null);
  end if;

  select state into current
  from public.xp_arbiter_state
  where instance = p_instance;

  if current is null then
    return jsonb_build_object('scores', '{}'::jsonb, 'lives', '{}'::jsonb, 'me', caller);
  end if;

  return jsonb_build_object(
    'scores', coalesce(current -> 'scores', '{}'::jsonb),
    'lives', coalesce(current -> 'lives', '{}'::jsonb),
    -- So a client never has to work out which of these rows is its own from a
    -- player id it holds separately.
    'me', caller
  );
end;
$$;

comment on function public.xp_arbiter_view(text) is
  'What this client may know about an instance, redacted server-side. The only '
  'read path to xp_arbiter_state.';

revoke all on function public.xp_arbitrate(text, text, jsonb) from public;
revoke all on function public.xp_arbiter_view(text) from public;
grant execute on function public.xp_arbitrate(text, text, jsonb) to authenticated;
grant execute on function public.xp_arbiter_view(text) to authenticated;
