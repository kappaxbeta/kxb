-- ============================================================================
-- Which body a world draws is a fact about you, not about a skin
-- ----------------------------------------------------------------------------
-- Everybody has two bodies - the peep on `profile_avatars`, the XP body on
-- `profile_skins` - and a *mode* saying which of them a world draws. That was
-- the settlement 20270120 arrived at and it is still right. What was wrong is
-- where the mode was kept.
--
-- It lived on `profile_skins.in_lounge`, which quietly made it a fact about a
-- skin: `wearSkin(null)` deletes that row, so taking the XP body off deleted
-- the mode with it. Which meant XP mode was only reachable by somebody who
-- owned something - and the dummy, the body every player already is before
-- they are anybody, could not be worn in a room at all.
--
-- The answer at the time was `profile_avatars.as_dummy`: a *third* body, hung
-- off the peep, offered in the wardrobe as a switch above the animals. It
-- worked and it was the wrong shape, and the report that it was wrong is the
-- plainest statement of the rule this migration writes down:
--
--     you can change the mode, you cannot change the peep into an XP model.
--
-- A peep is an animal. Standing in the dummy is not a costume you put on your
-- peep, it is what your XP body looks like when it is wearing nothing - so it
-- is reached by switching to XP mode, and by nothing else. One question with
-- one control, instead of two controls that could disagree.
--
-- So the flag moves to the row that is about *you* and always exists, and
-- `as_dummy` goes with it:
--
--   * `profile_avatars.show_xp` - the mode. Survives stripping the XP body
--     back to nothing, which is the whole point: nothing *is* the dummy.
--   * `profile_skins.in_lounge` - dropped. It was the mode in the wrong house.
--   * `profile_avatars.as_dummy` - dropped. It was the mode under another name,
--     for the people the old house had no room for.
--
-- Both old answers carry forward, and they carry forward to the same place,
-- which is the evidence that they were one question all along: somebody who
-- wore their skin in the lounge and somebody who stood in the dummy were both
-- asking a world to draw their XP body. `readLoungeLook` now answers both with
-- one rule - the equipped skin, or the dummy when there is none.
-- ============================================================================

do $$ begin
  alter table public.profile_avatars
    add column if not exists show_xp boolean not null default false;
exception when undefined_table then null; end $$;

-- Anybody who was showing their XP body in a world keeps showing it. An insert
-- rather than an update: the mode lived on the *other* table, so a person who
-- had set it may never have picked an animal and may have no row here at all.
-- The default penguin is what `readProfileAvatar` was already answering for
-- them, so writing it changes nothing anybody can see - it only gives the mode
-- somewhere to live.
do $$ begin
  insert into public.profile_avatars (user_id, model, show_xp, updated_at)
  select skins.user_id, 'penguin', true, now()
    from public.profile_skins as skins
   where skins.in_lounge
  on conflict (user_id) do update
    set show_xp = true,
        updated_at = now();
exception when undefined_column then null; end $$;

-- And anybody standing in the dummy was in XP mode under another name. They own
-- no skin - that is what the dummy was for - so XP mode draws them the dummy,
-- which is the body they are already in. Nobody's reflection changes.
do $$ begin
  update public.profile_avatars set show_xp = true where as_dummy;
exception when undefined_column then null; end $$;

alter table public.profile_avatars drop column if exists as_dummy;
alter table public.profile_skins drop column if exists in_lounge;

comment on column public.profile_avatars.show_xp is
  'Mode, not costume: whether a world draws this account''s XP body instead of '
  'their peep. Off by default. Here rather than on profile_skins because the '
  'mode outlives the skin - stripped back to nothing, the XP body is the dummy, '
  'and that is the only way to stand in the dummy. Written only by '
  'showSkinInLounge; equipping a body (chooseSkin) must never touch it.';
