-- ----------------------------------------------------------------------------
-- A skin that comes in two colours
-- ----------------------------------------------------------------------------
-- The mech ships painted twice: white-and-green, and olive-and-orange. Same
-- mesh, same rig, same UVs - one texture swapped, which is how several of the
-- character kits ship. Two questions fall out of that, and they have different
-- answers.
--
-- *What do you wear?* A model id, as always. A colour that lived only in the
-- renderer could not travel down the presence channel, into a document or into
-- an ownership row, so the colourway is baked into its own `.glb` and is its
-- own catalogue id - `spacenina/CombatMech_Olive`. Nothing downstream had to
-- learn a new shape.
--
-- *What do you buy?* The mech. Paint is not a second character, and charging
-- twice for one body with the trim redone is the kind of shop nobody wants to
-- be in. So the colour is a row on the shelf that is never sold: `variant_of`
-- points at the skin it is a colour of, the shop draws it as a swatch on that
-- skin's card rather than as a card of its own, and owning the parent is what
-- lets you wear it.
--
-- The last of those is the only rule that has to be in the database. Ownership
-- is adjudicated by the write policy on `profile_skins` - deliberately, see the
-- note where it was written - so a colour you may wear has to widen *that*,
-- not a call site. Two ways to do it and one of them is wrong: granting a
-- second `skin_ownership` row per colour at every purchase would mean editing
-- claim, spend, gift, bucks and the backoffice grant, five places that must
-- agree forever, and would still leave anybody who bought yesterday without
-- today's new colour. Resolving through `variant_of` in the policy is one
-- place and is retroactive by construction.
-- ----------------------------------------------------------------------------

alter table public.skins
  add column if not exists variant_of text references public.skins (id);

comment on column public.skins.variant_of is
  'The skin this row is a colourway of. Null for a skin sold in its own right; '
  'set means it is never on the shelf alone and is worn by whoever owns the parent.';

-- A colour of a colour is not a thing, and one level is all the shop draws.
-- Cheap to state, and the alternative is a recursive read in a row policy.
alter table public.skins drop constraint if exists skins_variant_is_not_itself;
alter table public.skins add constraint skins_variant_is_not_itself
  check (variant_of is null or variant_of <> id);

-- ----------------------------------------------------------------------------
-- The olive mech
-- ----------------------------------------------------------------------------
-- Priced at nothing in both currencies, and that is not a free skin: a variant
-- is never offered for sale at all, so the numbers are unread. They are zero
-- rather than copied from the parent so that a report summing the shelf does
-- not count the mech twice.
--
-- The backstory is one line because the card shows the parent's; this is what
-- the swatch says when you hover it.
-- ----------------------------------------------------------------------------
insert into public.skins (id, name, tier, price_cents, voucher_cost, backstory, active, variant_of) values
  ('spacenina/CombatMech_Olive', 'Rustbucket in olive', 'skin', 0, 0,
   'The same Rustbucket in field paint, which it repainted itself one weekend and has never explained.',
   true, 'spacenina/CombatMech')
on conflict (id) do nothing;

-- And if the row was already there from an earlier run of this file, make sure
-- it is a colour rather than a twelfth character on the shelf.
update public.skins
   set variant_of = 'spacenina/CombatMech'
 where id = 'spacenina/CombatMech_Olive'
   and variant_of is null;

-- ----------------------------------------------------------------------------
-- Wearing a colour of something you own
-- ----------------------------------------------------------------------------
-- Both write policies, restated whole rather than patched: a policy is replaced
-- by dropping and recreating it, and the two have to say the same thing or an
-- update becomes a way to reach what an insert refuses.
--
-- The added clause is the second `exists`: you may wear a model whose row is a
-- variant of a skin you own. `s.variant_of` is checked against ownership, never
-- `s.id`, so this cannot be walked upwards - owning a colour would not give you
-- the parent, and nothing issues ownership of a colour anyway.
-- ----------------------------------------------------------------------------
drop policy if exists profile_skins_write_self on public.profile_skins;
create policy profile_skins_write_self
  on public.profile_skins for insert
  with check (
    user_id = auth.uid()
    and (
      exists (
        select 1 from public.skin_ownership o
        where o.user_id = auth.uid() and o.skin_id = model
      )
      or exists (
        select 1
        from public.skins s
        join public.skin_ownership o
          on o.skin_id = s.variant_of
        where s.id = model and o.user_id = auth.uid()
      )
    )
  );

drop policy if exists profile_skins_update_self on public.profile_skins;
create policy profile_skins_update_self
  on public.profile_skins for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (
      exists (
        select 1 from public.skin_ownership o
        where o.user_id = auth.uid() and o.skin_id = model
      )
      or exists (
        select 1
        from public.skins s
        join public.skin_ownership o
          on o.skin_id = s.variant_of
        where s.id = model and o.user_id = auth.uid()
      )
    )
  );

-- ----------------------------------------------------------------------------
-- A colour cannot be bought, taken or gifted
-- ----------------------------------------------------------------------------
-- Wearing was the rule that had to be widened; owning is the one that has to be
-- shut, and it turned out to matter immediately. A colour is priced at zero in
-- both currencies - because it is not for sale - and `claim_free_skin` reads
-- exactly that shape as "free, take it", as does `spend_skin_vouchers` when the
-- voucher cost is nothing. So the row that exists to be paint would have been
-- claimable by anybody who typed its id, without ever owning the mech.
--
-- Guarded here rather than in those three functions, and the choice is the
-- point: claim, spend, gift, the bucks checkout and the backoffice grant are
-- five doors into one table, they will not stay five, and a rule copied into
-- each is a rule that is one new door away from being wrong. The table is where
-- the rule cannot be missed.
--
-- It raises rather than returning a code, so a claim on a colour is an error
-- and not a sentence. That is the honest shape for it: nothing in the product
-- offers this, so anybody reaching it typed an id by hand.
-- ----------------------------------------------------------------------------
create or replace function public.skin_ownership_is_not_a_colour()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if exists (
    select 1 from public.skins s
    where s.id = new.skin_id and s.variant_of is not null
  ) then
    raise exception 'skin % is a colourway; the skin it is painted from is what is owned',
      new.skin_id
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists skin_ownership_is_not_a_colour on public.skin_ownership;
create trigger skin_ownership_is_not_a_colour
  before insert or update of skin_id on public.skin_ownership
  for each row execute function public.skin_ownership_is_not_a_colour();
