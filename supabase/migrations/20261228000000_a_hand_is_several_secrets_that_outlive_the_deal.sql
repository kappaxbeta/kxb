-- ============================================================================
-- A hand of cards, which is several secrets that outlive the deal
-- ----------------------------------------------------------------------------
-- docs/xp/server-authority.md §5 names what was missing, and it was never
-- infrastructure:
--
-- > Poker is no longer blocked on §4. It is blocked on a *hand*. The secrecy
-- > shipped - one opaque value per player, dealt once, yours in full and
-- > everybody else's as a count - and a hidden *role* is exactly one such
-- > value. A hand is several, drawn from a pile and discarded to another, both
-- > of which outlive the deal and neither of which `xp_arbiter_state` has a
-- > shape for.
--
-- This is that shape, and the game it was needed for: Mau-Mau for two to four,
-- in `packages/maumau`.
--
-- `secrets` stays exactly what it is - one opaque value per player, for roles
-- and sealed bids - and the card game gets its own key, because a hand is not a
-- role with more entries in it. It changes on every turn, it has a pile and a
-- discard behind it, and the rules that move cards between the three *are* the
-- game.
--
-- ---------------------------------------------------------------------------
-- What changes, and what deliberately does not
-- ---------------------------------------------------------------------------
-- | | |
-- |---|---|
-- | `xp_arbitrate` | one dispatch, before its own chain. Nothing else touched. |
-- | `xp_arbiter_view` | one key, `maumau`, redacted by `maumau_seen`. |
-- | new | `maumau_arbitrate` and five helpers it is made of. |
--
-- Both existing functions are restated whole, because that is what `create or
-- replace` takes - rebuilding one from an older copy has silently dropped a
-- branch in this file's siblings before. The only edits are the two named
-- above; everything else in them is character-for-character
-- `20261221000000_a_number_the_whole_table_keeps_for_one_game.sql`.
--
-- ---------------------------------------------------------------------------
-- Nothing here mints anything, and nothing here is reproducible
-- ---------------------------------------------------------------------------
-- The two constraints §4 was built under, and a card game leans on both harder
-- than anything before it:
--
-- **The caller's own session is the identity.** `auth.uid()` is read by
-- `xp_arbitrate` and handed down; the client is never asked who it is. A client
-- that could name the seat it plays from could play out of somebody else's
-- hand, and every legality check would agree with it because the cards really
-- are there.
--
-- **The deal is `random()` and never the seeded stream.** `world.random` is
-- `hash(seed, tick, index)` and every client holds the seed - which is what
-- makes two machines roll the same dice, and what would make every hand at this
-- table computable before the cards finished moving. Public agreement and
-- secrecy are opposite requirements and need opposite sources.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- The small pieces the rules are made of
-- ----------------------------------------------------------------------------
-- Four helpers, each of which is one paragraph of
-- `packages/maumau/src/rules/table.ts` and is a function here for the same
-- reason it is a function there: they are the bits that are easy to get subtly
-- wrong and impossible to notice, and a rule reads better when the arithmetic
-- is somewhere else.

/**
 * Where play goes next.
 *
 * The double modulo is the whole reason this is not written inline. `%` on a
 * negative left-hand side is negative in Postgres exactly as it is in
 * JavaScript, so `(turn - 1) % 4` at seat zero is `-1` and the game silently
 * addresses a seat that is not there - which surfaces as a hand that stops
 * rather than as an error.
 */
create or replace function public.maumau_seat_after(
  p_turn integer, p_direction integer, p_seats integer, p_by integer
)
returns integer
language sql
immutable
as $$
  select case
    when p_seats = 0 then 0
    else (((p_turn + p_direction * p_by) % p_seats) + p_seats) % p_seats
  end;
$$;

/** A suit's letter on the wire, matching `SUIT_LETTER` in `../rules/cards.ts`. */
create or replace function public.maumau_letter(p_suit text)
returns text
language sql
immutable
as $$
  select case p_suit
    when 'hearts' then 'h'
    when 'diamonds' then 'd'
    when 'clubs' then 'c'
    when 'spades' then 's'
    else null
  end;
$$;

/**
 * Who is on one card and said so, after a move.
 *
 * Recomputed from the hand every time rather than being a flag somebody
 * remembers to clear, which is the failure this rule always has: a player who
 * says Mau, is then made to draw two, and later plays back down to one is *not*
 * still covered by what they said three turns ago.
 */
create or replace function public.maumau_settle(
  p_said jsonb, p_seat text, p_declared boolean, p_size integer
)
returns jsonb
language sql
immutable
as $$
  select
    (select coalesce(jsonb_agg(value), '[]'::jsonb)
     from jsonb_array_elements_text(p_said) value
     where value <> p_seat)
    || case when p_size = 1 and p_declared then jsonb_build_array(p_seat) else '[]'::jsonb end;
$$;

/**
 * Take cards off the pile, refilling it from the discard if it runs out.
 *
 * The refill leaves the top card where it is - it is the card everybody is
 * playing on, and shuffling it back in would change what follows what in the
 * middle of somebody's turn. Nothing to refill from means nothing to draw and
 * the caller carries on, which is a floor rather than a rule: reachable only
 * with a hand size `handCap` exists to prevent, and an exception here would
 * take a table down rather than quietly give somebody a card fewer.
 *
 * Returns all three piles because a draw moves cards between all three, and a
 * function that returned only the hand would leave its caller to remember the
 * other two.
 */
create or replace function public.maumau_draw(
  p_hands jsonb, p_pile jsonb, p_discard jsonb, p_seat text, p_count integer
)
returns table (hands jsonb, pile jsonb, discard jsonb)
language plpgsql
as $$
declare
  hand_now jsonb := coalesce(p_hands -> p_seat, '[]'::jsonb);
  pile_now jsonb := coalesce(p_pile, '[]'::jsonb);
  disc_now jsonb := coalesce(p_discard, '[]'::jsonb);
  top_card text;
  card_now text;
begin
  for i in 1..greatest(p_count, 0) loop
    if jsonb_array_length(pile_now) = 0 then
      exit when jsonb_array_length(disc_now) = 0;
      top_card := disc_now ->> (jsonb_array_length(disc_now) - 1);
      /**
       * Shuffled here too, and with `random()` for the same reason the deal is.
       *
       * A refill that kept the discard's order would hand the next few draws to
       * anybody who had been paying attention - every card in it was played
       * face up, in front of everybody.
       */
      select coalesce(jsonb_agg(value order by random()), '[]'::jsonb)
      into pile_now
      from jsonb_array_elements_text(disc_now - (jsonb_array_length(disc_now) - 1)) value;
      disc_now := jsonb_build_array(top_card);
      exit when jsonb_array_length(pile_now) = 0;
    end if;

    card_now := pile_now ->> (jsonb_array_length(pile_now) - 1);
    pile_now := pile_now - (jsonb_array_length(pile_now) - 1);
    hand_now := hand_now || to_jsonb(card_now);
  end loop;

  hands   := jsonb_set(p_hands, array[p_seat], hand_now);
  pile    := pile_now;
  discard := disc_now;
  return next;
end;
$$;

/**
 * What comes back from an ask, and it is never a card.
 *
 * The temptation is to return the card that was drawn - it is the asker's own,
 * after all. That is how a secret leaks: an outcome is the natural thing to
 * log, to broadcast so everybody's animation plays, and to put in an error
 * report. A drawn card reaches its owner the one way anything secret does, as
 * the reply to that client's own `xp_arbiter_view`.
 */
create or replace function public.maumau_outcome(p_game jsonb, p_at integer)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'turn', case
      when p_game -> 'table' is null or p_game -> 'table' = 'null'::jsonb then null
      else p_game -> 'table' -> 'seats' ->> ((p_game -> 'table' ->> 'turn')::integer)
    end,
    'ready', jsonb_array_length(coalesce(p_game -> 'ready', '[]'::jsonb)),
    'seats', jsonb_array_length(coalesce(p_game -> 'seats', '[]'::jsonb)),
    'phase', case
      when p_game -> 'table' is null or p_game -> 'table' = 'null'::jsonb then 'waiting'
      else p_game -> 'table' ->> 'phase'
    end,
    'winner', case
      when p_game -> 'table' is null or p_game -> 'table' = 'null'::jsonb then null
      else p_game -> 'table' ->> 'winner'
    end,
    'at', p_at
  );
$$;

/**
 * The table, from one seat: your hand in full, everybody else's as a count.
 *
 * `seenBy` in `packages/maumau/src/rules/table.ts`, transcribed, and it is the
 * single most important function in this migration. The redaction happens
 * *inside* the view rather than at any call site, so "what this client may
 * know" is one expression in one place - which is the sentence
 * docs/xp/server-authority.md §4.1 makes the whole tier out of.
 *
 * **It carries no `pile`.** A count and not the cards, and that is not an
 * optimisation to be undone later: the order of the pile is who draws what for
 * the rest of the hand, and a client that had it would know the next six cards.
 */
create or replace function public.maumau_seen(p_game jsonb, p_caller text)
returns jsonb
language sql
stable
as $$
  select case
    when p_game is null then null
    else jsonb_build_object(
      'seats', coalesce(p_game -> 'seats', '[]'::jsonb),
      -- Public, like the seats: "who are we waiting for" is a question the
      -- whole table needs answered, not just the person being waited for.
      'ready', coalesce(p_game -> 'ready', '[]'::jsonb),
      'house', p_game -> 'house',
      'me', p_caller,
      'seen', case
        when p_game -> 'table' is null or p_game -> 'table' = 'null'::jsonb then null
        else jsonb_build_object(
          'house', p_game -> 'table' -> 'house',
          'seats', p_game -> 'table' -> 'seats',
          'turn', (p_game -> 'table' ->> 'turn')::integer,
          'direction', (p_game -> 'table' ->> 'direction')::integer,
          'owed', coalesce((p_game -> 'table' ->> 'owed')::integer, 0),
          'wish', p_game -> 'table' -> 'wish',
          'top', p_game -> 'table' -> 'discard' ->> (
            jsonb_array_length(p_game -> 'table' -> 'discard') - 1
          ),
          'pile', jsonb_array_length(coalesce(p_game -> 'table' -> 'pile', '[]'::jsonb)),
          'counts', (
            select coalesce(jsonb_object_agg(seat, jsonb_array_length(cards)), '{}'::jsonb)
            from jsonb_each(p_game -> 'table' -> 'hands') as h(seat, cards)
          ),
          'said', coalesce(p_game -> 'table' -> 'said', '[]'::jsonb),
          'phase', p_game -> 'table' ->> 'phase',
          'winner', p_game -> 'table' -> 'winner',
          'wins', coalesce(p_game -> 'table' -> 'wins', '{}'::jsonb),
          -- The one secret that leaves this function, and it leaves it to
          -- exactly one caller: the person whose hand it is.
          'me', p_caller,
          'hand', coalesce(p_game -> 'table' -> 'hands' -> p_caller, '[]'::jsonb)
        )
      end
    )
  end;
$$;

comment on function public.maumau_seen(jsonb, text) is
  'One player s view of a Mau-Mau table: their hand in full and everybody else s '
  'as a count, with no pile at all. The redaction, in one expression. Mirrors '
  'seenBy in packages/maumau/src/rules/table.ts.';


-- ============================================================================
-- A hand of cards, which is several secrets that outlive the deal
-- ----------------------------------------------------------------------------
-- docs/xp/server-authority.md §5 names exactly what was missing, and it was not
-- infrastructure:
--
-- > Poker is no longer blocked on §4. It is blocked on a *hand*. The secrecy
-- > shipped - one opaque value per player, dealt once, yours in full and
-- > everybody else's as a count - and a hidden *role* is exactly one such
-- > value. A hand is several, drawn from a pile and discarded to another, both
-- > of which outlive the deal and neither of which `xp_arbiter_state` has a
-- > shape for.
--
-- This is that shape. `secrets` stays what it is - one opaque value per player,
-- for roles and sealed bids - and the card game gets its own key, because a
-- hand is not a role with more entries in it: it changes on every turn, it has
-- a pile and a discard behind it, and the rules that move cards between the
-- three are the game.
--
-- ---------------------------------------------------------------------------
-- Its own function, and that is the load-bearing decision here
-- ---------------------------------------------------------------------------
-- `xp_arbitrate` is one `if/elsif` over fourteen actions that all read and
-- write the same handful of jsonb keys and fall through to a single `update` at
-- the bottom which rebuilds the whole state. Adding two hundred lines of card
-- rules into that chain would mean every existing action carrying a table it
-- has never heard of through its own write, and one missed key is a hand of
-- cards silently deleted by somebody rolling a dice.
--
-- So `xp_arbitrate` dispatches anything prefixed `maumau:` straight here, before
-- its own chain begins, and this function writes exactly one key with
-- `jsonb_set`. The two games cannot damage each other because they do not share
-- a line of code - only a row and its lock, which is the thing they genuinely
-- do share.
--
-- ---------------------------------------------------------------------------
-- This is the second implementation of these rules, and it knows it
-- ---------------------------------------------------------------------------
-- The first is `packages/maumau/src/net/arbiter.ts`, which teaches the same
-- rules to `memoryArbiter` so that four clients can be tested in microseconds
-- with no database. That duplication is deliberate and is the cost of the
-- design `boxingArbiter` established - *the rules travel with the game* - but it
-- is a real cost, and the mitigation is that both sides are written against the
-- same state shape and the same sentences.
--
-- **Every refusal below is character-for-character a refusal in
-- `packages/maumau/src/rules/table.ts`.** They are not decoration: they are
-- keys, looked up in `packages/maumau/src/play/words.ts` to be said in German,
-- and `words.test.ts` reads the TypeScript source to check that every one of
-- them has a translation. A sentence changed here and not there is a player
-- shown English in a German game.
--
-- ---------------------------------------------------------------------------
-- The deal uses `random()`, and that is the whole reason this is server-side
-- ---------------------------------------------------------------------------
-- The sentence `20261012000000_xp_arbiter_secrets.sql` had to write once and
-- which applies here with more force, because a hand is bigger than a role:
--
-- > `world.random` is `hash(seed, tick, index)` and every client holds the seed.
-- > Public agreement and secrecy are opposite requirements and they need
-- > opposite sources.
--
-- A deal from the seeded stream is a deal every player can compute before the
-- cards have finished moving.
-- ============================================================================

create or replace function public.maumau_arbitrate(
  p_instance text,
  p_caller   uuid,
  p_action   text,
  p_payload  jsonb,
  p_state    jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  game      jsonb := coalesce(p_state -> 'maumau', '{}'::jsonb);
  house     jsonb := game -> 'house';
  seats     jsonb := coalesce(game -> 'seats', '[]'::jsonb);
  /**
   * Who has said they are looking at the screen.
   *
   * Separate from `seats` because the two answer different questions and change
   * at different moments: you are seated by *arriving*, which the room decided,
   * and you are ready because you said so. Cleared by every deal - ready is
   * about the hand that is starting, and is spent by starting it.
   */
  ready_now jsonb := coalesce(game -> 'ready', '[]'::jsonb);
  tbl       jsonb := nullif(game -> 'table', 'null'::jsonb);
  me        text  := p_caller::text;

  hands     jsonb;
  pile      jsonb;
  discard   jsonb;
  said      jsonb;
  wins      jsonb;
  turn      integer;
  direction integer;
  owed      integer;
  wish      text;
  phase     text;
  winner    text;

  kind      text;
  card      text;
  want_wish text;
  said_mau  boolean;
  victim    text;

  pack      text[];
  buried    text[] := array[]::text[];
  suit      text;
  rank      text;
  ranks     text[];
  at        integer;
  seat      text;
  taken     text[];
  top       text;
  hand      jsonb;
  count_now integer;
  want_hand integer;
  cap       integer;
  size      integer;
  revision  integer := coalesce((game ->> 'at')::integer, 0);
  new_game  jsonb;
begin
  -- ------------------------------------------------------------------------
  -- Sitting down
  -- ------------------------------------------------------------------------
  if p_action = 'maumau:sit' then
    /**
     * The house is pinned by whoever sits first, and a disagreement is named.
     *
     * The same shape `join` uses for hp and damage, and the reason is the same:
     * a second player quietly playing under the first player's rules is a game
     * where somebody's sevens do not stack and nobody is told. Compared as
     * whole objects, because the client has already filled in every default
     * through `readHouse` before it asked - see `MaumauSession.sit`.
     */
    if house is null then
      house := jsonb_build_object(
        'deck',       coalesce(p_payload ->> 'deck', 'short'),
        'hand',       coalesce((p_payload ->> 'hand')::integer, 5),
        'sevens',     coalesce((p_payload ->> 'sevens')::boolean, true),
        'eights',     coalesce((p_payload ->> 'eights')::boolean, true),
        'nines',      coalesce((p_payload ->> 'nines')::boolean, true),
        'aces',       coalesce((p_payload ->> 'aces')::boolean, true),
        'jackOnJack', coalesce((p_payload ->> 'jackOnJack')::boolean, true),
        'mau',        coalesce((p_payload ->> 'mau')::boolean, true)
      );
    elsif p_payload ? 'deck' and (
      house ->> 'deck'       is distinct from p_payload ->> 'deck'
      or house ->> 'sevens'     is distinct from p_payload ->> 'sevens'
      or house ->> 'eights'     is distinct from p_payload ->> 'eights'
      or house ->> 'nines'      is distinct from p_payload ->> 'nines'
      or house ->> 'aces'       is distinct from p_payload ->> 'aces'
      or house ->> 'jackOnJack' is distinct from p_payload ->> 'jackOnJack'
      or house ->> 'mau'        is distinct from p_payload ->> 'mau'
    ) then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'this table was opened with different rules');
    end if;

    if seats ? me then
      return jsonb_build_object('ok', true, 'outcome', maumau_outcome(game, revision));
    end if;

    -- Five, and it is the pack rather than the rules that says so: a short
    -- pack dealt six ways leaves a pile of four. See `MAX_PLAYERS` and
    -- `handCap` in packages/maumau/src/rules/house.ts.
    if jsonb_array_length(seats) >= 5 then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'this table is full');
    end if;

    -- Nobody sits down into a hand in progress: a seat added mid-hand changes
    -- what `direction` means and whose turn is next, halfway through a go.
    if tbl is not null and tbl ->> 'phase' = 'playing' then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'wait for this hand to finish');
    end if;

    new_game := jsonb_build_object(
      'house', house,
      'seats', seats || to_jsonb(me),
      'ready', ready_now,
      'table', tbl,
      'at', revision + 1
    );

  -- ------------------------------------------------------------------------
  -- "I am looking at the screen"
  -- ------------------------------------------------------------------------
  -- A toggle rather than a one-way switch, because somebody who said it and
  -- then had to answer the door should be able to take it back before the cards
  -- are down. Once they are down it means nothing, and the deal clears it.
  elsif p_action = 'maumau:ready' then
    if not seats ? me then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'you are not at this table');
    end if;
    if tbl is not null and tbl ->> 'phase' = 'playing' then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'this hand is not finished');
    end if;

    select coalesce(jsonb_agg(value), '[]'::jsonb) into ready_now
    from jsonb_array_elements_text(ready_now) value where value <> me;

    if coalesce((p_payload ->> 'ready')::boolean, true) then
      ready_now := ready_now || to_jsonb(me);
    end if;

    new_game := jsonb_build_object(
      'house', house,
      'seats', seats,
      'ready', ready_now,
      'table', tbl,
      'at', revision + 1
    );

  -- ------------------------------------------------------------------------
  -- Standing up
  -- ------------------------------------------------------------------------
  elsif p_action = 'maumau:leave' then
    if not seats ? me then
      return jsonb_build_object('ok', true, 'outcome', maumau_outcome(game, revision));
    end if;

    /**
     * Standing up mid-hand ends the hand rather than repacking the table.
     *
     * Removing one seat from a table that has a turn index into it, a direction
     * round it and a debt owed to whoever is next means inventing a rule about
     * the cards somebody walked off with. Ending the hand is honest, and it is
     * what the others can see happening.
     */
    new_game := jsonb_build_object(
      'house', house,
      'seats', (select coalesce(jsonb_agg(value), '[]'::jsonb) from jsonb_array_elements_text(seats) value where value <> me),
      -- The seat goes and what was said from it goes with it, or the table
      -- waits for ever on somebody who has stood up.
      'ready', (select coalesce(jsonb_agg(value), '[]'::jsonb) from jsonb_array_elements_text(ready_now) value where value <> me),
      'table', case when tbl ->> 'phase' = 'playing' then null else tbl end,
      'at', revision + 1
    );

  -- ------------------------------------------------------------------------
  -- The deal
  -- ------------------------------------------------------------------------
  elsif p_action = 'maumau:deal' then
    if not seats ? me then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'you are not at this table');
    end if;
    if jsonb_array_length(seats) < 2 then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'a table needs two');
    end if;
    if tbl is not null and tbl ->> 'phase' = 'playing' then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'this hand is not finished');
    end if;
    /**
     * Everybody has to have said so.
     *
     * Checked here and not only in the client, because the deal is the one act
     * that cannot be taken back: the cards are out, they are secret, and a
     * player who was still loading has already lost a turn.
     */
    if exists (
      select 1 from jsonb_array_elements_text(seats) seat
      where not ready_now ? seat.value
    ) then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'not everybody is ready');
    end if;

    size := case when house ->> 'deck' = 'full' then 52 else 32 end;
    -- `handCap`, transcribed: one share of the pack counting the pile as a
    -- player, off the pack minus the card that goes face up. See house.ts.
    cap := greatest(2, ((size - 1) / (jsonb_array_length(seats) + 1))::integer);
    want_hand := least(cap, greatest(2, coalesce((house ->> 'hand')::integer, 5)));
    house := jsonb_set(house, '{hand}', to_jsonb(want_hand));

    ranks := case
      when house ->> 'deck' = 'full'
      then array['2','3','4','5','6','7','8','9','10','J','Q','K','A']
      else array['7','8','9','10','J','Q','K','A']
    end;

    /**
     * The pack, shuffled by the database and by nothing else.
     *
     * `order by random()` and not a seeded stream - see the header. This is the
     * one moment in the whole game that decides who wins, and it happens
     * somewhere no client has ever seen.
     */
    select array_agg(c order by random()) into pack
    from (
      select s || r as c
      from unnest(array['h','d','c','s']) s
      cross join unnest(ranks) r
    ) all_cards;

    hands := '{}'::jsonb;
    at := 1;
    -- Round by round rather than seat by seat. It changes nothing about a
    -- shuffled pack and everything about reading a stacked one in a test.
    for seat in select value from jsonb_array_elements_text(seats) loop
      hands := jsonb_set(hands, array[seat], '[]'::jsonb);
    end loop;
    for i in 1..want_hand loop
      for seat in select value from jsonb_array_elements_text(seats) loop
        hands := jsonb_set(hands, array[seat], (hands -> seat) || to_jsonb(pack[at]));
        at := at + 1;
      end loop;
    end loop;

    /**
     * The first card up cannot be a jack.
     *
     * A hand that opens on a wild card opens with a wish nobody made, so the
     * first player may follow with anything and the card is wasted. Turned over
     * and buried, which is what a dealer does with it.
     *
     * **The buried ones go back into the pack**, and that line is the whole
     * reason `buried` exists. The first version simply advanced past them and
     * built the pile from what was left, which silently *destroyed* every jack
     * it skipped: a five-handed deal came out with thirty cards in it, no error
     * anywhere, and two cards that could never be drawn or played. Caught by
     * counting the pack after a deal, which is now what the test below every
     * shuffle does.
     */
    top := pack[at];
    while top is not null and substring(top from 2) = 'J' and at < array_length(pack, 1) loop
      buried := buried || top;
      at := at + 1;
      top := pack[at];
    end loop;

    -- The pile, in draw order: the *last* entry is the next card drawn, which
    -- is what `packages/maumau/src/rules/table.ts` means by drawing from the
    -- end. The buried jacks go on the *front*, which is the bottom of it - the
    -- last place they will be reached, exactly as `deal` does with `unshift`.
    select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) into pile from unnest(buried) b;
    select pile || coalesce(jsonb_agg(to_jsonb(pack[i])), '[]'::jsonb) into pile
    from generate_series(array_length(pack, 1), at + 1, -1) i;

    new_game := jsonb_build_object(
      'house', house,
      'seats', seats,
      -- Spent by the deal it started.
      'ready', '[]'::jsonb,
      'table', jsonb_build_object(
        'house', house,
        'seats', seats,
        'hands', hands,
        'pile', pile,
        'discard', jsonb_build_array(top),
        'turn', 0,
        'direction', 1,
        -- A seven face up at the start owes nothing: the specials are all
        -- *played* effects, and the dealer chose nothing.
        'owed', 0,
        'wish', null,
        'said', '[]'::jsonb,
        'phase', 'playing',
        'winner', null,
        -- The score carries across, so a sitting keeps a running total.
        'wins', coalesce(tbl -> 'wins', '{}'::jsonb)
      ),
      'at', revision + 1
    );

  -- ------------------------------------------------------------------------
  -- A move
  -- ------------------------------------------------------------------------
  elsif p_action = 'maumau:move' then
    if tbl is null then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'nothing has been dealt');
    end if;

    hands     := tbl -> 'hands';
    pile      := tbl -> 'pile';
    discard   := tbl -> 'discard';
    said      := coalesce(tbl -> 'said', '[]'::jsonb);
    wins      := coalesce(tbl -> 'wins', '{}'::jsonb);
    turn      := (tbl ->> 'turn')::integer;
    direction := (tbl ->> 'direction')::integer;
    owed      := coalesce((tbl ->> 'owed')::integer, 0);
    wish      := tbl ->> 'wish';
    phase     := tbl ->> 'phase';

    kind      := p_payload ->> 'kind';
    card      := p_payload ->> 'card';
    want_wish := p_payload ->> 'wish';
    said_mau  := coalesce((p_payload ->> 'mau')::boolean, false);
    victim    := p_payload ->> 'who';

    if kind is null or kind not in ('play', 'draw', 'mau', 'catch') then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'that is not a move');
    end if;
    if phase <> 'playing' then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'the hand is over');
    end if;
    /**
     * Who is moving is `p_caller`, never the payload.
     *
     * The one rule that makes every other rule here mean anything: a client
     * that could name the seat it plays from could play out of somebody else's
     * hand, and the legality checks below would agree with it because the cards
     * really are there. `xp_arbitrate` reads `auth.uid()` and this function is
     * handed it; the client is never asked who it is.
     */
    if not (tbl -> 'seats') ? me then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'you are not at this table');
    end if;

    -- ---------------------------------------------------------------------
    -- Saying it, and catching somebody who did not: the two that are not turns
    -- ---------------------------------------------------------------------
    -- They are also each other's race, which is the game. This function holds a
    -- row lock, so exactly one of "Mau!" and "you did not say Mau!" gets there
    -- first and the other is refused by the state the first one left.
    if kind = 'mau' then
      if not coalesce((tbl -> 'house' ->> 'mau')::boolean, true) then
        return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'this table does not play Mau');
      end if;
      if jsonb_array_length(coalesce(hands -> me, '[]'::jsonb)) <> 1 then
        return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'you are not on your last card');
      end if;
      if said ? me then
        return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'you have already said it');
      end if;

      said := maumau_settle(said, me, true, 1);
      -- No turn change: the card is already down and play has moved on.

    elsif kind = 'catch' then
      if not coalesce((tbl -> 'house' ->> 'mau')::boolean, true) then
        return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'this table does not play Mau');
      end if;
      if victim = me then
        return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'you cannot catch yourself');
      end if;
      if victim is null or not (tbl -> 'seats') ? victim then
        return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'they are not at this table');
      end if;
      if jsonb_array_length(coalesce(hands -> victim, '[]'::jsonb)) <> 1 then
        return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'they are not on their last card');
      end if;
      if said ? victim then
        return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'they said it');
      end if;

      select * into hands, pile, discard from maumau_draw(hands, pile, discard, victim, 2);
      -- No turn change and no `said` bookkeeping: they were not in it, which is
      -- why the catch was legal.

    -- ---------------------------------------------------------------------
    -- Everything else is a turn
    -- ---------------------------------------------------------------------
    else
      if (tbl -> 'seats' ->> turn) is distinct from me then
        return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'not your turn');
      end if;

      if kind = 'draw' then
        -- A debt is paid in full or one card is taken. Either way the turn
        -- ends, and `owed` clears whatever the pile could actually cover.
        select * into hands, pile, discard
        from maumau_draw(hands, pile, discard, me, case when owed > 0 then owed else 1 end);
        owed := 0;
        said := maumau_settle(said, me, false, jsonb_array_length(hands -> me));
        turn := maumau_seat_after(turn, direction, jsonb_array_length(tbl -> 'seats'), 1);

      else
        if card is null or not (hands -> me) ? card then
          return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'that card is not in your hand');
        end if;

        rank := substring(card from 2);
        suit := substring(card from 1 for 1);
        top  := discard ->> (jsonb_array_length(discard) - 1);

        -- `follows`, transcribed. Same order and the same sentences.
        if top is null then
          return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'nothing to play on');
        elsif owed > 0 then
          if not (rank = '7' and coalesce((tbl -> 'house' ->> 'sevens')::boolean, true)) then
            return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'you owe cards - play a seven or draw');
          end if;
        elsif rank = 'J' then
          if coalesce((tbl -> 'house' ->> 'jackOnJack')::boolean, true) and substring(top from 2) = 'J' then
            return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'no jack on a jack');
          end if;
        elsif suit = coalesce(maumau_letter(wish), substring(top from 1 for 1)) then
          null;
        elsif wish is null and rank = substring(top from 2) then
          null;
        elsif wish is not null then
          return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'follow the suit that was asked for');
        else
          return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'that follows nothing');
        end if;

        -- A jack has to name a suit, and only a jack may. The second half is
        -- not pedantry: a wish riding on a seven would set the table's wish
        -- with a card that never asked.
        if rank = 'J' then
          if want_wish is null or want_wish not in ('hearts','diamonds','clubs','spades') then
            return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'name a suit');
          end if;
        elsif want_wish is not null then
          return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'only a jack names a suit');
        end if;

        -- Out of the hand and onto the pile.
        select coalesce(jsonb_agg(value), '[]'::jsonb) into hand
        from (
          select value, row_number() over () as n
          from jsonb_array_elements_text(hands -> me) value
        ) all_cards
        where n <> (
          select min(n) from (
            select value as v, row_number() over () as n
            from jsonb_array_elements_text(hands -> me) value
          ) found where v = card
        );
        hands   := jsonb_set(hands, array[me], hand);
        discard := discard || to_jsonb(card);

        -- The wish is replaced on every play, not only by a jack: it is an
        -- instruction about the *next* card, and that card is now down.
        wish := case when rank = 'J' then want_wish else null end;

        said := maumau_settle(said, me, said_mau and coalesce((tbl -> 'house' ->> 'mau')::boolean, true), jsonb_array_length(hand));

        if jsonb_array_length(hand) = 0 then
          phase  := 'over';
          winner := me;
          wins   := jsonb_set(wins, array[me], to_jsonb(coalesce((wins ->> me)::integer, 0) + 1));
        elsif rank = '7' and coalesce((tbl -> 'house' ->> 'sevens')::boolean, true) then
          owed := owed + 2;
          turn := maumau_seat_after(turn, direction, jsonb_array_length(tbl -> 'seats'), 1);
        elsif rank = '8' and coalesce((tbl -> 'house' ->> 'eights')::boolean, true) then
          turn := maumau_seat_after(turn, direction, jsonb_array_length(tbl -> 'seats'), 2);
        elsif rank = '9' and coalesce((tbl -> 'house' ->> 'nines')::boolean, true) then
          /**
           * Turn round, then move on - except at two, where turning round is
           * arithmetically the identity and the card would be wasted.
           *
           * `+1` and `-1` are the same step modulo two, so a nine played
           * head-to-head would pass play on exactly like a queen. At two seats
           * it skips instead, which is what every table means by "reverse" when
           * there are only two of them.
           */
          if jsonb_array_length(tbl -> 'seats') <= 2 then
            turn := maumau_seat_after(turn, direction, jsonb_array_length(tbl -> 'seats'), 2);
          else
            direction := -direction;
            turn := maumau_seat_after(turn, direction, jsonb_array_length(tbl -> 'seats'), 1);
          end if;
        elsif rank = 'A' and coalesce((tbl -> 'house' ->> 'aces')::boolean, true) then
          -- Another go: the turn does not move at all.
          null;
        else
          turn := maumau_seat_after(turn, direction, jsonb_array_length(tbl -> 'seats'), 1);
        end if;
      end if;
    end if;

    new_game := jsonb_build_object(
      'house', house,
      'seats', seats,
      'ready', ready_now,
      'table', jsonb_build_object(
        'house', tbl -> 'house',
        'seats', tbl -> 'seats',
        'hands', hands,
        'pile', pile,
        'discard', discard,
        'turn', turn,
        'direction', direction,
        'owed', owed,
        'wish', wish,
        'said', said,
        'phase', phase,
        'winner', winner,
        'wins', wins
      ),
      'at', revision + 1
    );

  else
    return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'that is not a move');
  end if;

  /**
   * One key, written with `jsonb_set`.
   *
   * Never a rebuilt state object: this row is shared with `xp_arbitrate`'s
   * fourteen other actions, and a write that reconstructed the whole thing
   * would drop a scoreboard or a vote belonging to a different game running in
   * the same instance. The row is already locked by the caller.
   */
  update public.xp_arbiter_state
  set state = jsonb_set(coalesce(p_state, '{}'::jsonb), '{maumau}', new_game),
      updated_at = now()
  where instance = p_instance;

  return jsonb_build_object('ok', true, 'outcome', maumau_outcome(new_game, revision + 1));
end;
$$;

comment on function public.maumau_arbitrate(text, uuid, text, jsonb, jsonb) is
  'Mau-Mau for two to five, decided where no client can reach: sit, ready, deal, '
  'move and leave. Writes only the maumau key of xp_arbiter_state. Never returns a '
  'card - the hand reaches its owner through xp_arbiter_view and nowhere else. '
  'The second implementation of packages/maumau/src/rules/table.ts; the '
  'refusals are character-for-character the same sentences.';


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
  caller    uuid := auth.uid();
  current   jsonb;
  settings  jsonb;
  health    jsonb;
  scores    jsonb;
  secrets   jsonb;
  -- The map `deal` was handed (role to look) and the map it produces (player to
  -- look). Two names because they are keyed by different things, and confusing
  -- the two is the one mistake in this migration that would publish a role.
  looks_in  jsonb;
  views_now jsonb;
  lives     jsonb;
  seats     jsonb;
  seat_want text;
  seat_held text;
  victim    text;
  want_hp   integer;
  want_dmg  integer;
  want_lives integer;
  face_now  integer;
  roll_now  jsonb;
  move_now  jsonb;
  want_lethal text;
  left_hp   integer;
  left_lives integer;
  fatal     boolean := false;
  out_now   boolean := false;
  values_in text[];
  want_sides integer;
  holders   text[];
  holder    text;
  at        integer;
  vote_now  jsonb;
  tally     jsonb;
  choice    text;
  seconds   integer;
  want_round integer;
  -- A level's own declared `run` fields, and the one being written.
  fields_now jsonb;
  want_key   text;
  want_num   numeric;
  /**
   * The card table, carried in and straight back out again.
   *
   * It is written only by `maumau_arbitrate`, which returns before this
   * function's own chain begins - so nothing below ever changes it. What this
   * function does do is *rebuild the whole state object* at the bottom, out of
   * the locals in this block, and a key that is not a local is a key that
   * ceases to exist.
   *
   * That was not hypothetical. Without this line, one player pressing `join` in
   * a deathmatch running in the same instance silently deleted a hand of cards
   * mid-game, with no error anywhere - caught by the last assertion in this
   * migration's own psql run. `vote_now` and `views_now` are here for the same
   * reason and each learned it the same way.
   */
  maumau_now jsonb;
  round_now integer;
  turn_now  jsonb;
  order_in  text[];
  seat      integer;
begin
  if caller is null then
    return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'sign in to play a decided game');
  end if;

  if p_instance is null or length(p_instance) = 0 then
    return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'no instance');
  end if;

  insert into public.xp_arbiter_state (instance)
  values (p_instance)
  on conflict (instance) do nothing;

  select state into current
  from public.xp_arbiter_state
  where instance = p_instance
  for update;

  /**
   * The card game decides its own outcomes, before this function's chain begins.
   *
   * Dispatched rather than added as fourteen more `elsif` branches, and the
   * reason is the write at the bottom of this function: every action here falls
   * through to one `update` that rebuilds the whole state object out of local
   * variables. A hand of cards carried through that would be a hand of cards
   * deleted by the first person to roll a dice.
   *
   * `maumau_arbitrate` writes exactly one key with `jsonb_set` and returns its
   * own verdict. The two games share this row and its lock - which they
   * genuinely do share - and not a line of code.
   */
  if p_action like 'maumau:%' then
    return public.maumau_arbitrate(p_instance, caller, p_action, p_payload, current);
  end if;

  settings := current -> 'settings';
  health   := coalesce(current -> 'health', '{}'::jsonb);
  scores   := coalesce(current -> 'scores', '{}'::jsonb);
  secrets  := coalesce(current -> 'secrets', '{}'::jsonb);
  lives    := coalesce(current -> 'lives', '{}'::jsonb);
  fields_now := coalesce(current -> 'fields', '{}'::jsonb);
  -- Chair name -> whoever is in it. Keyed that way round because the question
  -- asked in play is "is blue free", and because it makes one person in two
  -- chairs unrepresentable rather than merely refused.
  seats    := coalesce(current -> 'seats', '{}'::jsonb);
  vote_now := current -> 'vote';
  -- Carried in and back out again, exactly as `vote_now` is: `deal` writes it,
  -- `reset` clears it, and every other action leaves it alone. Without this the
  -- first `hit` after a deal would make the hidden player visible again.
  views_now := current -> 'views';
  maumau_now := current -> 'maumau';
  round_now := coalesce((current ->> 'round')::integer, 0);
  /**
   * `nullif`, because a JSON null is not a SQL NULL.
   *
   * Found by the first call: `turn_start` answered "turns have already started"
   * on a table nobody had ever sat at. `jsonb_build_object('turn', null)` stores
   * the JSON value `null`, and `current -> 'turn'` hands that back as a jsonb
   * that is very much not NULL — so `turn_now is not null` was true before
   * anything had happened. The same shape as the `not in` trap in
   * `xp_store_clear`: the absent case is the one that reads wrong.
   */
  turn_now  := nullif(current -> 'turn', 'null'::jsonb);

  if p_action = 'join' then
    want_hp  := greatest(1, least(10000, coalesce((p_payload ->> 'hp')::integer, 100)));
    want_dmg := greatest(1, least(10000, coalesce((p_payload ->> 'damage')::integer, 10)));
    -- Null rather than a default: absent means infinite, and a number would
    -- silently turn every existing deathmatch into an elimination game.
    want_lives := case
      when p_payload ->> 'lives' is null then null
      else greatest(1, least(1000, (p_payload ->> 'lives')::integer))
    end;
    /**
     * Which dealt role, if any, has the working gun.
     *
     * Pinned at the join beside `hp` and `damage` and for the same reason: it
     * comes out of the document, every client in the room has the same
     * document, and a client that could name it later could name itself. It is
     * never compared against the deck here - the deck never reaches this
     * function, and does not need to. A value nobody is dealt refuses every hit
     * in the room, which is why `rulesProblems` refuses it in the editor.
     */
    want_lethal := nullif(p_payload ->> 'lethal', '');

    if settings is null then
      settings := jsonb_build_object('hp', want_hp, 'damage', want_dmg)
        || case when want_lives is null then '{}'::jsonb else jsonb_build_object('lives', want_lives) end
        || case when want_lethal is null then '{}'::jsonb else jsonb_build_object('lethal', want_lethal) end;
    elsif (settings ->> 'hp')::integer <> want_hp
       or (settings ->> 'damage')::integer <> want_dmg
       or (settings ->> 'lives') is distinct from (case when want_lives is null then null else want_lives::text end)
       or (settings ->> 'lethal') is distinct from want_lethal
    then
      return jsonb_build_object(
        'ok', false,
        'why', 'refused',
        'message', 'this match was opened with different rules'
      );
    end if;

    if not (health ? caller::text) then
      health := health || jsonb_build_object(caller::text, (settings ->> 'hp')::integer);
      scores := scores || jsonb_build_object(caller::text, coalesce((scores ->> caller::text)::integer, 0));
      if settings ? 'lives' then
        lives := lives || jsonb_build_object(caller::text, (settings ->> 'lives')::integer);
      end if;
    end if;

  elsif p_action = 'deal' then
    if secrets <> '{}'::jsonb then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'this round has already been dealt');
    end if;

    select array_agg(value order by ordinality) into values_in
    from jsonb_array_elements_text(coalesce(p_payload -> 'values', '[]'::jsonb))
      with ordinality as elements(value, ordinality);

    if values_in is null or array_length(values_in, 1) is null then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'nothing to deal');
    end if;

    select array_agg(key) into holders from jsonb_object_keys(health) as keys(key);

    if holders is null or array_length(holders, 1) is null then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'nobody has joined this match');
    end if;
    if array_length(values_in, 1) < array_length(holders, 1) then
      return jsonb_build_object(
        'ok', false,
        'why', 'refused',
        'message', format('%s players and only %s to deal', array_length(holders, 1), array_length(values_in, 1))
      );
    end if;

    /**
     * The top of the deck, and only then shuffled.
     *
     * Cut before the shuffle rather than after it, which is the whole fix: a
     * ten-card deck holding one bug, shuffled and dealt to three, is a bug in
     * the room three times in ten. Cut first and the bug is the first card,
     * every time, and what chance decides is *who gets it* - which is the only
     * thing chance was ever wanted for here.
     *
     * It makes `rules.roles` a priority list, said out loud in its own doc: the
     * roles that must be in play go first. That is how a board game with a
     * variable player count has always handed out roles, and the alternative -
     * a document declaring a deck per player count - is a format nobody could
     * write by hand.
     */
    values_in := values_in[1:array_length(holders, 1)];
    select array_agg(value order by random()) into values_in from unnest(values_in) as shuffled(value);

    at := 1;
    foreach holder in array holders loop
      secrets := secrets || jsonb_build_object(holder, values_in[at]);
      at := at + 1;
    end loop;

    /**
     * And what each of them looks like, worked out here and kept as the answer
     * rather than as the question.
     *
     * The map goes in keyed by *role* and comes out keyed by *player*, and the
     * conversion happening inside this function is the point of it: the row
     * never holds "hidden means invisible" next to "who is hidden", so there is
     * no later view that can accidentally join the two. What is stored is what
     * is published, and there is no redaction decision left to get wrong.
     *
     * Only what is not `normal` is written, so an ordinary deck stores nothing
     * and the view says nothing - a room with no hidden role has a row that is
     * byte-identical to the one it had before this migration.
     */
    looks_in := coalesce(p_payload -> 'seen', '{}'::jsonb);
    -- From nothing rather than from what was carried in: a deal decides the
    -- whole room's looks, so anything left over from before it is wrong by
    -- definition.
    views_now := '{}'::jsonb;
    if looks_in <> '{}'::jsonb then
      foreach holder in array holders loop
        if looks_in ? (secrets ->> holder) then
          views_now := views_now || jsonb_build_object(holder, looks_in ->> (secrets ->> holder));
        end if;
      end loop;
    end if;
    if views_now = '{}'::jsonb then
      views_now := null;
    end if;


  elsif p_action = 'hit' then
    if settings is null then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'nobody has joined this match');
    end if;

    victim := p_payload ->> 'victim';

    if victim is null then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'no victim');
    end if;
    if victim = caller::text then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'you cannot shoot yourself for a point');
    end if;
    if not (health ? caller::text) then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'you are not in this match');
    end if;
    if not (health ? victim) then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'no such player');
    end if;

    /**
     * Whose shot this was, which is the only thing here that reads a secret.
     *
     * One dealt role's shots count and nobody else's do. Before the deal nobody
     * holds it, so nobody can hurt anybody - which is right, because the round
     * has not started.
     *
     * Checked *before* the victim's condition on purpose. "Already down" about
     * a body this shooter could never have affected is a fact they should not
     * be able to collect, and shooting the room one player at a time is
     * otherwise a way to read the health map through the refusals.
     *
     * The message is for one person and says nothing about anybody else. It
     * does not name the victim's role, because the shooter's own role is the
     * whole reason the shot did nothing and the victim had no part in it.
     */
    if settings ? 'lethal' then
      if coalesce(secrets ->> caller::text, '') <> (settings ->> 'lethal') then
        return jsonb_build_object(
          'ok', false,
          'why', 'refused',
          'message', 'your shots do not decide anything here'
        );
      end if;
    end if;

    /**
     * Out before down, and the order is the whole reason to have both.
     *
     * Somebody eliminated is also on zero health forever, so testing health
     * first would answer every shot at them with "already down" and this branch
     * would be unreachable code that looked like a rule. Both are `stale` - a
     * claim from a client that has not caught up - and the difference is which
     * true thing the shooter is told.
     */
    if (lives ? victim) and coalesce((lives ->> victim)::integer, 0) <= 0 then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'already out');
    end if;
    if coalesce((health ->> victim)::integer, 0) <= 0 then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'already down');
    end if;

    left_hp := (health ->> victim)::integer - (settings ->> 'damage')::integer;
    if left_hp <= 0 then
      left_hp := 0;
      fatal := true;
      scores := scores || jsonb_build_object(caller::text, coalesce((scores ->> caller::text)::integer, 0) + 1);

      /**
       * A life, and possibly the last one.
       *
       * Counted here rather than at the revive because this is the moment it
       * happened: a life lost only when somebody presses respawn is a life
       * somebody keeps by closing the tab.
       */
      if lives ? victim then
        left_lives := greatest(0, (lives ->> victim)::integer - 1);
        lives := lives || jsonb_build_object(victim, left_lives);
        out_now := left_lives = 0;
      end if;
    end if;
    health := health || jsonb_build_object(victim, left_hp);

  elsif p_action = 'revive' then
    if settings is null then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'nobody has joined this match');
    end if;
    if not (health ? caller::text) then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'you are not in this match');
    end if;
    /**
     * The refusal that makes elimination stick.
     *
     * `refused` and not `stale`: the round has not moved on and asking again
     * will not help, which is exactly the difference the two words carry. The
     * runtime can keep calling this forever and keep being told the same thing,
     * so being a spectator needs no second code path to ask permission with.
     */
    if (lives ? caller::text) and coalesce((lives ->> caller::text)::integer, 0) <= 0 then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'you are out of this match');
    end if;
    health := health || jsonb_build_object(caller::text, (settings ->> 'hp')::integer);

  elsif p_action = 'vote_open' then
    if not (health ? caller::text) then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'you are not in this match');
    end if;
    if (lives ? caller::text) and coalesce((lives ->> caller::text)::integer, 0) <= 0 then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'you are out of this match');
    end if;
    -- One at a time. A second vote opened over a running one would split the
    -- room between two questions and neither would reach a majority.
    if vote_now is not null then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'a vote is already open');
    end if;
    seconds := greatest(5, least(600, coalesce((p_payload ->> 'seconds')::integer, 60)));
    -- `now()` here and nowhere else. A deadline the client supplies is a
    -- deadline the client moves when it likes the count.
    /**
     * `to_jsonb` on the timestamp rather than `to_char` with a format string.
     *
     * The format string ended `OF`, which renders the offset as `+00` - and
     * `Date.parse('...+00')` is `NaN` in V8, because ISO 8601 wants `+00:00`.
     * Every consequence of that was silent: the countdown rendered as zero from
     * the moment a vote opened, and the client that schedules the close read
     * NaN, gave up, and scheduled nothing - so a vote nobody answered stayed
     * open forever again, through a different door to the one 1fd2b18 shut.
     *
     * Postgres's own jsonb rendering is ISO 8601 with a real offset. Nothing to
     * format, and nothing to get wrong a second time.
     */
    vote_now := jsonb_build_object(
      'closes', to_jsonb(now() + make_interval(secs => seconds)),
      'cast', '{}'::jsonb
    );

  elsif p_action = 'vote' then
    if vote_now is null then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'no vote is open');
    end if;
    if not (health ? caller::text) then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'you are not in this match');
    end if;
    /**
     * Somebody who is out does not vote.
     *
     * The whole reason the majority is measured against who is standing: a
     * knocked-out player who could still vote would be deciding a game they
     * are no longer in, and in a game with hidden roles that is the strongest
     * possible move for the side that lost them.
     */
    if (lives ? caller::text) and coalesce((lives ->> caller::text)::integer, 0) <= 0 then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'you are out of this match');
    end if;

    choice := coalesce(p_payload ->> 'target', 'skip');
    if choice <> 'skip' and not (health ? choice) then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'no such player');
    end if;
    if choice <> 'skip' and (lives ? choice) and coalesce((lives ->> choice)::integer, 0) <= 0 then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'they are already out');
    end if;

    -- Changing your mind is allowed until it closes, and costs nothing to
    -- allow: the tally is computed from the map rather than accumulated, so a
    -- second vote from the same person replaces the first instead of adding to
    -- it. Accumulating would have made vote-changing a way to vote twice.
    vote_now := jsonb_set(vote_now, '{cast}', (vote_now -> 'cast') || jsonb_build_object(caller::text, choice));

    tally := public.xp_arbiter_tally(
      jsonb_build_object('vote', vote_now, 'lives', lives, 'health', health)
    );
    -- Closed early when everybody still in has spoken. Waiting out the clock
    -- after the last vote is a minute of watching nothing happen.
    if (tally ->> 'cast')::integer >= (tally ->> 'standing')::integer then
      if tally ->> 'eliminated' is not null then
        lives := lives || jsonb_build_object(tally ->> 'eliminated', 0);
        health := health || jsonb_build_object(tally ->> 'eliminated', 0);
      end if;
      current := jsonb_set(coalesce(current, '{}'::jsonb), '{lastVote}', tally);
      vote_now := null;
    end if;

  elsif p_action = 'vote_close' then
    if vote_now is null then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'no vote is open');
    end if;
    /**
     * Anybody may ask, and the server decides whether it is time.
     *
     * Which is why this is not a timer: nothing here runs on its own, so the
     * vote closes when the next person asks after the deadline. A client asking
     * early is told the truth rather than refused - it will ask again.
     */
    if now() < (vote_now ->> 'closes')::timestamptz then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'the vote is still open');
    end if;

    tally := public.xp_arbiter_tally(
      jsonb_build_object('vote', vote_now, 'lives', lives, 'health', health)
    );
    if tally ->> 'eliminated' is not null then
      lives := lives || jsonb_build_object(tally ->> 'eliminated', 0);
      health := health || jsonb_build_object(tally ->> 'eliminated', 0);
    end if;
    current := jsonb_set(coalesce(current, '{}'::jsonb), '{lastVote}', tally);
    vote_now := null;

  elsif p_action = 'reset' then
    if not (health ? caller::text) then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'you are not in this match');
    end if;
    /**
     * The round the caller believes it is starting, and it has to be the next
     * one.
     *
     * Which makes two people pressing rematch on the same frame idempotent
     * rather than two resets: the first advances the round and the second is
     * told the round it asked for has already begun. Without it, the second
     * reset would wipe a match that had already started again.
     */
    want_round := coalesce((p_payload ->> 'round')::integer, round_now + 1);
    if want_round <> round_now + 1 then
      return jsonb_build_object(
        'ok', false,
        'why', 'stale',
        'message', format('round %s has already begun', round_now)
      );
    end if;

    /**
     * Everything a round accumulated, gone; everything the *match* agreed,
     * kept.
     *
     * `settings` survives because the rules did not change - a rematch of a
     * three-life game is a three-life game, and clearing them would let the
     * next join pin different numbers. Everybody who joined stays joined and
     * comes back at full health with their lives back, which is what a rematch
     * *is*: an eliminated player who had to re-join would be a rematch that
     * some of the room cannot play.
     */
    round_now := want_round;
    /**
     * And the level's own run counters, which is the whole reason they are
     * here rather than in the store.
     *
     * A rematch of a board game is a board game with nothing on it. Leaving
     * these is the exact bug the scope was invented for, arriving through the
     * rematch door instead of the next session's.
     */
    fields_now := '{}'::jsonb;
    secrets := '{}'::jsonb;
    -- With the deal that produced them. A look left behind is somebody
    -- invisible for a round they were dealt nothing in, and the person it
    -- happens to is the last to find out.
    views_now := null;
    vote_now := null;
    -- With the rest of the round. The next `pass` seats the table again, which
    -- is also how somebody who arrived during the last round gets a seat.
    turn_now := null;
    select jsonb_object_agg(key, (settings ->> 'hp')::integer) into health
    from jsonb_object_keys(health) as players(key);
    select jsonb_object_agg(key, 0) into scores
    from jsonb_object_keys(coalesce(scores, '{}'::jsonb)) as players(key);
    if settings ? 'lives' then
      select jsonb_object_agg(key, (settings ->> 'lives')::integer) into lives
      from jsonb_object_keys(health) as players(key);
    else
      lives := '{}'::jsonb;
    end if;

  elsif p_action = 'roll' then
    /**
     * A dice, decided here because a dice decided anywhere else is not one.
     *
     * The same argument `deal` makes one branch up, arriving from the other
     * side: `deal` is here so a role cannot be re-rolled, and this is here so a
     * *number* cannot. `random()` on the server rather than the seeded stream
     * every client can reproduce — see the header of 20261012000000.
     *
     * The face is returned and **not** kept in the state. What a dice came up
     * as is the level's business: it lands in the document's own `data` field,
     * which is where a rule reads it and where it is already stored. Keeping a
     * second copy here would be a second answer to "what did I roll", and the
     * two would disagree the first time somebody rolled twice in a round.
     */
    if health = '{}'::jsonb then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'nobody has joined this match');
    end if;

    /**
     * Not your turn, not your roll.
     *
     * Only when a turn is actually running: a level that never called
     * `turn_start` is a level with no turns, and refusing every roll in it
     * would break every game that is not a board game. This is the whole of
     * what turn-taking buys — it was the gap the note on `reset` named, and it
     * is the difference between a rule friends keep and a rule the table keeps.
     */
    if turn_now is not null and turn_now ->> 'at' <> caller::text then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'it is not your turn');
    end if;

    want_sides := coalesce((p_payload ->> 'sides')::integer, 6);
    if want_sides < 2 or want_sides > 100 then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'a dice has between 2 and 100 faces');
    end if;

    face_now := 1 + floor(random() * want_sides)::integer;
    /**
     * Recorded, which reverses the decision the note above used to make.
     *
     * It said the face is "the level's business - it lands in the document's own
     * `data`, which is where a rule reads it and where it is already stored",
     * and that keeping a copy here would be a second answer to "what did I
     * roll". The first half is true of exactly one client: the one that pressed.
     *
     * A four-seat table found it. The roll reached the roller and nobody else's
     * screen ever heard about it, because a level's `data` is not a channel -
     * and on the builtin route there is no store behind it at all, so `space`
     * shares nothing there by any path. Three players watched one of them roll
     * an invisible die.
     *
     * There is still only one answer, which is the part the old note was right
     * about: this is *the* roll, and every client's `data` is a mirror of it
     * rather than a second opinion. `by` and `at` are what make it usable as
     * one - a client has to be able to tell last turn's four from this turn's,
     * and a bare number cannot say.
     */
    roll_now := jsonb_build_object(
      'key', p_payload ->> 'key',
      'face', face_now,
      'by', caller,
      'at', coalesce((current ->> 'rolls')::bigint, 0) + 1
    );

  elsif p_action = 'moved' then
    /**
     * A piece went somewhere, said once so the whole table can agree it did.
     *
     * -------------------------------------------------------------------------
     * Why the arbiter and not the socket
     * -------------------------------------------------------------------------
     * Every client spawns a level's entities from the same document in the same
     * order, so an entity's id is the same number on all of them - which makes a
     * move describable in four small fields instead of a position stream. What it
     * still needs is a channel that does not lose things, and the socket is
     * explicitly not one: a dropped position sample is a body that jumps, and a
     * dropped *move* is a board that is permanently wrong.
     *
     * This is the same shape as `roll` one branch up and for the same reason. A
     * board game is a deterministic machine driven by facts the table agrees on;
     * the roll was one, and this is the other.
     *
     * -------------------------------------------------------------------------
     * What is deliberately not checked
     * -------------------------------------------------------------------------
     * **Whether the move is legal.** The rules live in the document - which
     * piece may move, how far, and what happens when it lands - and the arbiter
     * has never read one. Putting them here would mean the database knowing what
     * a six means, which is the thing `roll` refused to do in the other
     * direction. What this owns is that everybody hears the same move, once.
     *
     * And on a board where the move is a *carry*, there is less to be legal
     * about: a piece is picked up by a person and put down by one, so the only
     * fact left is which field it ended up on. `mark` is that field by name,
     * which is also why it is text - `blue-yard` is a place a piece goes and is
     * not a number of squares from anywhere.
     *
     * `at` is a counter rather than a clock, so a client can tell a move it has
     * applied from one it has not without either of us agreeing what time it is.
     */
    if p_payload ->> 'mark' is null then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'a move names the field it landed on');
    end if;

    move_now := jsonb_build_object(
      'id', (p_payload ->> 'id')::integer,
      'mark', p_payload ->> 'mark',
      'by', caller,
      'at', coalesce((current ->> 'moves')::bigint, 0) + 1
    );

  elsif p_action = 'sit' then
    /**
     * A chair, taken by the person who asked for it.
     *
     * -------------------------------------------------------------------------
     * Three refusals, and the second is the one worth having
     * -------------------------------------------------------------------------
     * **A seat with no name** is a client asking a question it did not finish.
     *
     * **A seat somebody else is in.** The whole reason this is here rather than
     * on a client: two people pressing *blue* in the same moment both see it
     * free, and only one of them can be right. Postgres decides, once.
     *
     * **Nothing.** Asking for the chair you are already in is not an error and
     * is not a change - a client that presses twice, or replays a press after a
     * reconnect, should get the same answer both times.
     *
     * And taking a second chair gives up the first, rather than being refused.
     * Somebody who sat down as blue and wants green is changing their mind,
     * which is a thing people do at a table before a game starts; refusing it
     * would leave blue held by somebody who is not playing it.
     */
    seat_want := p_payload ->> 'seat';
    if seat_want is null or seat_want = '' then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'a seat is asked for by name');
    end if;

    seat_held := seats ->> seat_want;
    if seat_held is not null and seat_held <> caller::text then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'somebody is already sitting there');
    end if;

    -- Out of whichever chair they were in, then into this one. Two statements
    -- because the first is a no-op for everybody sitting down for the first
    -- time, which is everybody, once.
    select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into seats
    from jsonb_each_text(seats) as taken(key, value)
    where value <> caller::text;

    seats := seats || jsonb_build_object(seat_want, caller::text);

  elsif p_action = 'turn_start' then
    /**
     * Begin taking turns, in the order people joined.
     *
     * The order is the `health` map's keys, which is join order and is the same
     * for everybody because it is the server's map rather than each client's
     * idea of who is here. Sorted, so two clients asking at the same moment
     * cannot disagree about who is first.
     *
     * Refused once it is running, like `deal`: restarting the order is how
     * somebody who does not like being fourth becomes first.
     */
    if turn_now is not null then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'turns have already started');
    end if;
    if health = '{}'::jsonb then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'nobody has joined this match');
    end if;

    select array_agg(key order by key) into order_in
    from jsonb_object_keys(health) as keys(key)
    where not ((lives ? key) and coalesce((lives ->> key)::integer, 0) <= 0);

    if order_in is null then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'nobody is left to take a turn');
    end if;

    turn_now := jsonb_build_object('at', order_in[1]);

  elsif p_action = 'pass' then
    /**
     * Hand the turn on - and seat the table if nobody has.
     *
     * The one check that matters is unchanged: a client that could pass
     * somebody else's turn could skip the player who is winning. What is new is
     * the case where there is no turn to pass, which used to be answered
     * *nobody is taking turns* and was, until this migration, the only answer a
     * level could ever get - nothing outside SQL could reach `turn_start`.
     *
     * **So the first `pass` seats the table.** A document that says `pass` is a
     * document that means turns, because that verb has never meant anything
     * else, and the alternative was a second way to say the same thing in a
     * format that would then have two. It is still `turn_start`'s rule that
     * decides who is in the order and `turn_start` is still there for anybody
     * who wants to say it out loud.
     *
     * What it deliberately does not decide is *when* a turn should end. Rolling
     * a six and going again is a rule about a game, and the arbiter has never
     * been told any of those.
     */
    /**
     * Everybody still in the match, which is not everybody in `health`.
     *
     * A player the room voted out - or who ran out of lives - stays in that map
     * for good: it is the scoreboard, and a name that disappeared would read as
     * somebody leaving. Taking the order from it unfiltered meant an eliminated
     * player kept being handed turns they are not allowed to take, and the table
     * waited for somebody who is watching.
     *
     * Skipping them is the *room's* rule rather than one invented here, which is
     * the whole reason this is the fix and a timeout is not: being out is a
     * majority decision the vote already carries, and this only stops the order
     * disagreeing with it.
     */
    select array_agg(key order by key) into order_in
    from jsonb_object_keys(health) as keys(key)
    where not ((lives ? key) and coalesce((lives ->> key)::integer, 0) <= 0);

    if order_in is null then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'nobody is left to take a turn');
    end if;

    seat := array_position(order_in, caller::text);
    if seat is null then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'you are not in this match');
    end if;

    /**
     * A turn held by somebody who is out is a turn anybody may move on.
     *
     * They cannot pass it themselves - `pass` refuses a caller who is not in the
     * order at all - so without this the table stops at the moment the room
     * eliminates whoever happened to be holding it, which is the most likely
     * moment of all. The turn goes to the next player *after* them in the full
     * order rather than to the first: being eliminated should not hand the lead
     * back to the top of the table.
     */
    if turn_now is not null and not (turn_now ->> 'at' = any(order_in)) then
      /**
       * Unsticking is not the same as being done.
       *
       * The turn goes to the next player *after* the one who is out - not to the
       * first, because being knocked out should not hand the lead back to the
       * top of the table - and the caller's own turn is **not** consumed. A
       * press that rescued the table and then gave away the go it rescued would
       * punish whoever noticed.
       *
       * One expression rather than a `select ... into`: the value is a bare id
       * and this variable is `jsonb`, so assigning it directly asks Postgres to
       * read a uuid as JSON, and it says so at the first eliminated holder.
       */
      turn_now := jsonb_build_object('at', coalesce(
        (select key from unnest(order_in) as keys(key)
          where key > turn_now ->> 'at' order by key limit 1),
        order_in[1]
      ));
    else
      if turn_now is null then
        turn_now := jsonb_build_object('at', caller::text);
      elsif turn_now ->> 'at' <> caller::text then
        return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'it is not your turn to pass');
      end if;

      -- Round the table. `array_position` is one-based, so `seat % length + 1`
      -- is the next player and wraps to the first from the last.
      turn_now := jsonb_build_object('at', order_in[(seat % array_length(order_in, 1)) + 1]);
    end if;

  elsif p_action = 'field' then
    /**
     * One of the level's own declared numbers, set where everybody can see it.
     *
     * The same shape as `roll` and `moved` above: a fact the table agrees on,
     * said once, published to all of them and counted as this game's rather
     * than as anybody's. What it means is the document's business - see the
     * header - so this checks that it is a number and that the caller is in
     * the match, and nothing else.
     *
     * `set` rather than `add`, deliberately, and it is the client that decides
     * what the new total is. An `add` here would be the arbiter arithmetic on
     * a number it does not know the rules for, and two clients adding one to
     * four would land on six where the document meant five - which is worse
     * than last-write-wins, because it is wrong in a way nobody can see. Last
     * write wins is what `space` already promises one scope over, and this is
     * that promise with an ending.
     */
    if health = '{}'::jsonb then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'nobody has joined this match');
    end if;

    want_key := p_payload ->> 'key';
    /*
      The document's own alphabet for a field name - `DATA_NAME` in
      packages/xp/src/document/data.ts. Checked here as well because a payload
      is not a document: this is the one place a name arrives without having
      been through the parser.
    */
    if want_key is null or want_key !~ '^[a-z][a-z0-9-]{0,31}$' then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'a field is named the way a document names one');
    end if;

    begin
      want_num := (p_payload ->> 'value')::numeric;
    exception when others then
      want_num := null;
    end;
    if want_num is null then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'a field holds a number');
    end if;

    /*
      As many as a document may declare, and no more: `MAX_DATA_FIELDS` is 32,
      so a payload inventing names cannot grow this row without bound.
    */
    if not (fields_now ? want_key) and (select count(*) from jsonb_object_keys(fields_now)) >= 32 then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'this match already keeps as many fields as a level may declare');
    end if;

    fields_now := fields_now || jsonb_build_object(want_key, want_num);

  else
    return jsonb_build_object('ok', false, 'why', 'refused', 'message', format('no rule for "%s"', p_action));
  end if;

  update public.xp_arbiter_state
  set state = jsonb_build_object(
        'settings', settings,
        'health', health,
        'scores', scores,
        'secrets', secrets,
        'lives', lives,
        -- The level's own run counters. Kept between calls like the roll, and
        -- cleared by `reset` unlike the settings: this is the state that is
        -- true for one game and then is not.
        'fields', fields_now,
        -- Absent rather than null when there is no vote running, so `-> 'vote'`
        -- is the whole test and there is no second empty shape to check for.
        'vote', vote_now,
        'lastVote', current -> 'lastVote',
        'round', round_now,
        'turn', turn_now,
        -- The last roll, and the count of them. Kept when this call was not a
        -- roll, so the table does not forget the face between one press and the
        -- next - which is the whole point of recording it.
        'roll', coalesce(roll_now, current -> 'roll'),
        'rolls', coalesce((roll_now ->> 'at')::bigint, (current ->> 'rolls')::bigint, 0),
        -- The last move, kept between calls exactly as the roll is: a client
        -- that joins late reads the board's most recent change rather than a
        -- gap where one happened.
        -- Who is sitting where. Kept between calls like the roll and the move:
        -- somebody joining late needs to know which chairs are taken before
        -- they can pick one, and that is the first thing they need.
        'seats', seats,
        'move', coalesce(move_now, current -> 'move'),
        'moves', coalesce((move_now ->> 'at')::bigint, (current ->> 'moves')::bigint, 0),
        /**
         * Kept between calls, like the roll and the move above.
         *
         * It has to be: this is written by `deal` and cleared by `reset`, and
         * every other action in this function would otherwise wipe it - the
         * first `hit` after a deal would make the hidden player visible again,
         * which is the bug this line exists to not have.
         */
        'views', views_now,
        -- See the declaration. Written by `maumau_arbitrate` and only ever
        -- carried through here.
        'maumau', maumau_now
      ) - (case when vote_now is null then array['vote'] else array[]::text[] end)
        - (case when maumau_now is null then array['maumau'] else array[]::text[] end)
        - (case when views_now is null then array['views'] else array[]::text[] end)
        - (case when turn_now is null then array['turn'] else array[]::text[] end)
        - (case when coalesce(roll_now, current -> 'roll') is null then array['roll'] else array[]::text[] end)
        - (case when coalesce(move_now, current -> 'move') is null then array['move'] else array[]::text[] end),
      updated_at = now()
  where instance = p_instance;

  if roll_now is not null then
    -- The same reply the roller has always had, so nothing on the client
    -- changes for the person who pressed.
    return jsonb_build_object('ok', true, 'outcome', jsonb_build_object('face', face_now));
  end if;

  return jsonb_build_object(
    'ok', true,
    'outcome', jsonb_build_object(
      'scores', scores,
      'health', health,
      'lives', lives,
      'fields', fields_now,
      'fatal', fatal,
      -- Named separately from `fatal` because they are two different things to
      -- draw: one is "they are down for eight seconds" and the other is "they
      -- are not coming back", and a client that had to derive the second from a
      -- number reaching zero would derive it wrong in the match with no lives
      -- in it at all.
      'eliminated', out_now,
      'victim', victim,
      'vote', vote_now,
      'lastVote', current -> 'lastVote',
      -- Which round this outcome belongs to, so a client can tell a rematch
      -- from a scoreboard that happens to have gone back to zero.
      'round', round_now,
      /**
       * Whose turn it is now, so the client that just passed learns where the
       * turn went rather than only that it left.
       */
      'turn', turn_now,
      'dealt', jsonb_array_length(coalesce(jsonb_path_query_array(secrets, '$.keyvalue().key'), '[]'::jsonb))
    )
  );
end;
$$;


create or replace function public.xp_arbiter_view(p_instance text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller  uuid := auth.uid();
  current jsonb;
  secrets jsonb;
begin
  select state into current
  from public.xp_arbiter_state
  where instance = p_instance;

  secrets := coalesce(current -> 'secrets', '{}'::jsonb);

  return jsonb_build_object(
    'scores', coalesce(current -> 'scores', '{}'::jsonb),
    'health', coalesce(current -> 'health', '{}'::jsonb),
    'lives', coalesce(current -> 'lives', '{}'::jsonb),
    -- The level's own run counters, in full to everybody. Public because that
    -- is the entire point of them: a number one client can see is what the
    -- `run` scope already was before it had a way to travel.
    'fields', coalesce(current -> 'fields', '{}'::jsonb),
    'settings', current -> 'settings',
    'me', caller,
    'secret', case when caller is null then null else secrets -> caller::text end,
    'dealt', (select count(*) from jsonb_object_keys(secrets)),
    -- Public, and it has to be: a vote is the room deciding together, so every
    -- client needs the same deadline and the same running count. What is cast
    -- is not a secret either - a vote nobody can watch is a vote nobody plays.
    'vote', current -> 'vote',
    'lastVote', current -> 'lastVote',
    -- So a client can tell a rematch from a scoreboard that has gone to zero.
    'round', coalesce((current ->> 'round')::integer, 0),
    -- Public for the same reason the vote is, and absent when nobody is taking
    -- turns: whose turn it is is the one fact a board game draws every frame,
    -- and a table where only the player being refused knows the answer is a
    -- table nobody can watch.
    'turn', current -> 'turn',
    -- Public, for the same reason the turn is and with the same sentence
    -- behind it: a table where only the player who pressed knows the number is
    -- a table nobody else can play. `at` is a counter rather than a clock, so a
    -- client can tell this turn's four from last turn's without either of us
    -- agreeing what time it is.
    'roll', current -> 'roll',
    -- And the last move, for the same reason: a table where a piece moves on
    -- one screen and not the others is four people playing alone in one room.
    'move', current -> 'move',
    /**
     * Who may be drawn how, and never who was dealt what.
     *
     * The one thing about another player's deal that leaves this table, and it
     * is a *look* rather than a role - see the header. Public, because the whole
     * purpose of it is that every other client draws the room the same way.
     *
     * `views` rather than `seen`, which is the document's word for the same
     * thing, only because the client's own reader already binds `seen` to the
     * whole of this object.
     */
    /**
     * Who is sitting where, in full, to everybody.
     *
     * The most public thing in this list and the least arguable: an empty chair
     * is the one piece of information somebody about to sit down needs, and a
     * table where you cannot see who is already playing blue is a table where
     * you find out by being refused.
     *
     * Not redacted to "your own seat" for that reason, and the redaction would
     * buy nothing anyway - everybody at the board can see which colour each
     * player is moving.
     */
    'seats', coalesce(current -> 'seats', '{}'::jsonb),
    'views', coalesce(current -> 'views', '{}'::jsonb),
    /**
     * The card table, redacted to this caller.
     *
     * Under its own key rather than spread across this object, because a hand
     * is not any of the things above it: `secret` is one opaque value dealt
     * once, and a hand is several that move on every turn. Absent - a JSON
     * null - when nobody has sat down, which is what every client sees before
     * the first `sit` and is a state rather than an error.
     *
     * `maumau_seen` is the redaction and is the only way a hand leaves this
     * database. Nothing else in this function knows a card exists.
     */
    'maumau', maumau_seen(current -> 'maumau', caller::text)
  );
end;
$$;
