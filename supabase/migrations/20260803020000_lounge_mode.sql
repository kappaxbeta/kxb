-- Add lounge_mode column to tenants_read_model.
--
-- 'battle' is the default: the lounge already lets members spar freely (see
-- combat.ts), so a space that never touches this setting keeps behaving
-- exactly as it did before the column existed. 'creative' is the admin-gated
-- pause on that, for building without getting dashed mid-block.
alter table public.tenants_read_model
  add column if not exists lounge_mode text not null default 'battle'
    check (lounge_mode in ('creative', 'battle'));
