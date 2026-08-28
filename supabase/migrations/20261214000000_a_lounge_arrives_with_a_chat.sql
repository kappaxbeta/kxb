-- ============================================================================
-- A lounge arrives with a chat
-- ----------------------------------------------------------------------------
-- 20260816000000 put chat behind two switches and started both of them off.
-- The argument for the second one is quoted here in full because this
-- migration is the thing that overturns it:
--
--   "Defaults false, which is the whole point of it being a separate switch
--    from the flag: turning the feature on for a space must not put words in a
--    room nobody asked to have a chat in."
--
-- That was right while chat was unshipped surface and the flag was off
-- everywhere: nobody had asked for a chat because nobody had been offered one.
-- It is wrong now. A lounge is a room with people standing in it, and the only
-- thing the caution buys today is the first visitor discovering they cannot
-- say hello until an owner has found Space Settings.
--
-- So both switches flip, and the *shape* of the pair does not change - which
-- is the part worth being careful about. Chat is still two decisions, ours and
-- theirs, still ANDed in `chatOpen()`, and Space Settings still turns it off.
-- What changes is only which way each one points when nobody has spoken.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Theirs: the space's own switch
-- ----------------------------------------------------------------------------
alter table public.tenants_read_model
  alter column chat_enabled set default true;

-- ----------------------------------------------------------------------------
-- The spaces that already exist
-- ----------------------------------------------------------------------------
-- The column cannot tell "never decided" from "decided no" - it is `not null`
-- and both read as false - so the log is asked instead. A space that has never
-- emitted `ChatEnabledSet` never touched the switch, and gets the new default;
-- a space that emitted one and turned it off said no, and keeps it.
--
-- Deliberately *not* an event. This is not a decision anybody made about their
-- space, it is us changing what an empty history means, and writing it as
-- `ChatEnabledSet` on five hundred tenant streams would put words in the log
-- that no owner ever said - and would then have to be replayed past forever.
-- `initialTenantState.chatEnabled` in src/domain/tenants/aggregate.ts is the
-- same change on the read side, which is what keeps a replay agreeing with
-- this row.
-- ----------------------------------------------------------------------------
update public.tenants_read_model t
   set chat_enabled = true,
       updated_at   = now()
 where t.chat_enabled = false
   and not exists (
     select 1
       from public.events e
      where e.stream_id = t.id
        and e.type = 'ChatEnabledSet'
   );

-- ----------------------------------------------------------------------------
-- Ours: the flag
-- ----------------------------------------------------------------------------
-- Overrides are left exactly as they are, and both directions survive on
-- purpose: a space we switched chat off for stays off, and a space we were
-- trialling it with keeps a row that now agrees with the default and can be
-- cleaned up in the backoffice whenever somebody notices it.
--
-- `fallback` in src/domain/flags/keys.ts moves with this. A resolver outage now
-- falls back to on, for the reason argued there: the surprising failure is no
-- longer "a channel opened", it is "the Chat tab vanished from a room that was
-- talking in it".
-- ----------------------------------------------------------------------------
update public.feature_flags
   set enabled     = true,
       description = 'A text channel in the lounge, alongside the emotes. On by default; each space can switch its own off in Space Settings.',
       updated_at  = now()
 where key = 'chat';
