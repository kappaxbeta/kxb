-- ============================================================================
-- A link you can read out loud
-- ----------------------------------------------------------------------------
-- `guest_links.token` is 32 random bytes as base64url - 43 characters, mixed
-- case, with hyphens and underscores in it. That is the right shape for a URL
-- and the wrong shape for every other way people actually invite each other:
-- across a table, over voice chat, into a phone somebody is holding.
--
-- So a link grows a second name. The token stays the secret in the URL and the
-- code is the spoken form of the same door - both resolve to one row, and
-- revoking the row kills both at once, which is the property a separate
-- "join codes" table would have had to keep in step by hand.
--
-- ----------------------------------------------------------------------------
-- Six characters, from an alphabet chosen for being read aloud
-- ----------------------------------------------------------------------------
-- No O/0, no I/1/L, no U/V. Those are the pairs people mishear and mistype, and
-- a code exists precisely to survive being said across a room. What is left is
-- 26 symbols, and six of them is 26^6 - about 300 million - which is not a
-- secret and is not trying to be.
--
-- **The code is a convenience, not a credential.** It is guessable in a way the
-- token is not, and the mitigations are that it is scoped to one link, dies
-- with it, and that `LINK_TTL_DAYS` gives most of them a week to live. A link
-- that must not be guessed should not be handed out as six characters, and
-- `requires_knock` is the existing answer for that - somebody still has to be
-- let in.
--
-- Nullable, and every existing row keeps NULL. Backfilling would mint codes for
-- links made before this existed, including revoked and expired ones, which is
-- a lot of guessable surface bought for nobody: a link nobody is looking at
-- does not need a spoken form.
-- ============================================================================

alter table public.guest_links
  add column if not exists code text;

comment on column public.guest_links.code is
  'Short spoken form of this link, for typing rather than clicking. Case-insensitive on the way in - see normaliseJoinCode. NULL on links minted before codes existed, and on any link made without one.';

-- ----------------------------------------------------------------------------
-- Unique, and only while the link is worth finding
-- ----------------------------------------------------------------------------
-- Partial on purpose. A code has to be unique among the links somebody could
-- currently join through, and *not* across all history: six characters is a
-- small enough space that a busy installation would start colliding with dead
-- rows, and the minting loop would spend its retries dodging links revoked
-- eighteen months ago.
--
-- Revoked is the only condition in the index. Expiry is a timestamp compared
-- against `now()`, which is not immutable and cannot be indexed on - so the
-- lookup checks it in the query, where it is already checking `uses` against
-- `max_uses`. Two expired links sharing a code is harmless; neither opens.
-- ----------------------------------------------------------------------------
create unique index if not exists guest_links_code_idx
  on public.guest_links (code)
  where code is not null and revoked_at is null;
