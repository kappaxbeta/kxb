-- Add is_public_lounge column to tenants_read_model
alter table public.tenants_read_model
  add column if not exists is_public_lounge boolean not null default true;
