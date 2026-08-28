-- What an event's guest may and may not write, asked of the database itself.
-- A hidden button is not a boundary; this is.
--
-- Run against the local stack:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--        -q -f supabase/snippets/event-guest-policy.sql
--
-- Rolls back at the end, so it leaves nothing behind and is safe to re-run.
-- The expected output is at the bottom of this file; any line that differs is
-- a real change in what a stranger on a link is allowed to do.
--
-- Literal uuids rather than a temp table: a temp table is owned by `postgres`
-- and these checks run as `authenticated`, which cannot read it.
--
-- ---------------------------------------------------------------------------
-- Two ways this harness lied before it worked, both worth knowing about
-- ---------------------------------------------------------------------------
-- Every check reported ALLOWED, including renaming the space, because the
-- fixture had no events and so the space looked *unclaimed* - the bootstrap
-- clause in `events_insert_tenant` opens everything for a space mid-creation.
-- Then every check reported REFUSED, because the guest row had no
-- `admitted_at` and `tenant_role()` treats that as still standing at the door.
--
-- Both produced a green-looking wall of identical answers. If you extend this
-- file, keep at least one check on each side of every rule, so a harness that
-- has stopped exercising anything cannot pass.

\set ON_ERROR_STOP on
\pset pager off
\set T '''00000000-0000-4000-8000-00000000e001'''
\set G '''00000000-0000-4000-8000-00000000e002'''
\set O '''00000000-0000-4000-8000-00000000e003'''
\set ROPEN '''00000000-0000-4000-8000-00000000e004'''
\set RSEAL '''00000000-0000-4000-8000-00000000e005'''

begin;

insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
values (:O, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'owner@example.test', false, now(), now());

insert into auth.users (id, instance_id, aud, role, is_anonymous, created_at, updated_at)
values (:G, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        true, now(), now());

insert into public.tenants_read_model (id, slug, name, archived, created_at, updated_at, version)
values (:T, 'policy-check', 'Policy Check', false, now(), now(), 1);

insert into public.tenant_members (tenant_id, user_id, role, joined_at)
values (:T, :O, 'owner', now());

insert into public.rooms_read_model
  (room_id, tenant_id, name, slug, closed, created_at, updated_at, version, guest_build)
values (:ROPEN, :T, 'Open hall', 'open-hall', false, now(), now(), 1, true),
       (:RSEAL, :T, 'Sponsor room', 'sponsor-room', false, now(), now(), 1, false);

-- The ceiling: build, board and rooms are sold. Tasks are not.
insert into public.event_spaces
  (tenant_id, opens_at, closes_at, preset, guest_writes, surfaces, room_cap, room_max, room_overflow)
values (:T, now() - interval '1 hour', now() + interval '1 day', 'hackathon',
        array['build','board','rooms'], array['lounge','rooms','board'], 10, 12, true);

-- `admitted_at` is what separates somebody standing at the door from somebody
-- who has been let in - `tenant_role()` returns null for a knocker. A harness
-- that forgot it would report REFUSED for everything and look like a working
-- lockdown.
insert into public.tenant_guests (tenant_id, guest_id, display_name, expires_at, admitted_at)
values (:T, :G, 'Stranger', now() + interval '1 hour', now());

-- One real event on the tenant's own stream, written by the owner.
--
-- Without this the space looks *unclaimed* - `tenant_is_unclaimed()` is "no
-- event here was written by anybody but you" - and the bootstrap clause in
-- `events_insert_tenant` lets the guest write anything at all. That is correct
-- behaviour for a space mid-creation and it silently made an earlier version of
-- this harness report ALLOWED for every single check, including renaming the
-- space. A test that cannot fail is worse than no test, so this line is the
-- load-bearing one in the whole file.
insert into public.events
  (stream_id, stream_type, version, type, data, metadata, actor_id, tenant_id)
values (:T, 'tenant', 1, 'TenantCreated',
        '{"name":"Policy Check","slug":"policy-check"}'::jsonb, '{}'::jsonb, :O, :T);

/**
 * Try one insert as the guest, and report whether the policy allowed it.
 *
 * The attempt is wrapped in its own block, because a refused insert would
 * otherwise abort the transaction and every later check would report "refused"
 * for the wrong reason - a test that passes while proving nothing.
 */
create or replace function pg_temp.try_write(label text, p_stream_type text, p_data jsonb)
returns text language plpgsql as $$
declare ok boolean := true;
begin
  begin
    insert into public.events (stream_id, stream_type, version, type, data, metadata, actor_id, tenant_id)
    values (gen_random_uuid(), p_stream_type, 1, 'Probe', p_data, '{}'::jsonb,
            '00000000-0000-4000-8000-00000000e002',
            '00000000-0000-4000-8000-00000000e001');
  exception when others then
    ok := false;
  end;
  return rpad(label, 44) || case when ok then 'ALLOWED' else 'REFUSED' end;
end $$;

\pset tuples_only on
\pset format unaligned

\echo ''
\echo '--- inside an open event ---'
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000e002","role":"authenticated"}', true) \g /dev/null

select rpad('running as', 44) || current_user || ', claimed space';
select pg_temp.try_write('build in the lounge (sold)', 'lounge_chunk', '{}'::jsonb);
select pg_temp.try_write('build in the open room', 'lounge_chunk',
       jsonb_build_object('worldId', '00000000-0000-4000-8000-00000000e004'));
select pg_temp.try_write('build in the sponsor room (room says no)', 'lounge_chunk',
       jsonb_build_object('worldId', '00000000-0000-4000-8000-00000000e005'));
select pg_temp.try_write('post on the board (sold)', 'board_post', '{}'::jsonb);
select pg_temp.try_write('open a room (sold)', 'room', '{}'::jsonb);
select pg_temp.try_write('write a task (NOT sold)', 'task', '{}'::jsonb);
select pg_temp.try_write('rename the space (never)', 'tenant', '{}'::jsonb);
reset role;

\echo ''
\echo '--- the host switches build off ---'
update public.tenants_read_model set capabilities = '{"build": false}'::jsonb where id = :T;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000e002","role":"authenticated"}', true) \g /dev/null
select pg_temp.try_write('build in the lounge (staff said no)', 'lounge_chunk', '{}'::jsonb);
select pg_temp.try_write('post on the board (untouched)', 'board_post', '{}'::jsonb);
reset role;

\echo ''
\echo '--- after the event closes ---'
update public.tenants_read_model set capabilities = '{}'::jsonb where id = :T;
update public.event_spaces
   set opens_at = now() - interval '2 days', closes_at = now() - interval '1 minute'
 where tenant_id = :T;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000e002","role":"authenticated"}', true) \g /dev/null
select pg_temp.try_write('build in the lounge', 'lounge_chunk', '{}'::jsonb);
select pg_temp.try_write('post on the board', 'board_post', '{}'::jsonb);
select rpad('the door: event_open()', 44) || public.event_open(:T)::text;
select rpad('but nobody is ejected: tenant_role()', 44) ||
       coalesce(public.tenant_role(:T), 'null');
reset role;

\echo ''
\echo '--- an ordinary space, no event ---'
delete from public.event_spaces where tenant_id = :T;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000e002","role":"authenticated"}', true) \g /dev/null
select pg_temp.try_write('build (as before this feature: no)', 'lounge_chunk', '{}'::jsonb);
select rpad('event_open() on a non-event', 44) || public.event_open(:T)::text;
reset role;

\echo ''
rollback;

-- ---------------------------------------------------------------------------
-- Expected output
-- ---------------------------------------------------------------------------
-- --- inside an open event ---
-- running as                                  authenticated, claimed space
-- build in the lounge (sold)                  ALLOWED
-- build in the open room                      ALLOWED
-- build in the sponsor room (room says no)    REFUSED
-- post on the board (sold)                    ALLOWED
-- open a room (sold)                          ALLOWED
-- write a task (NOT sold)                     REFUSED
-- rename the space (never)                    REFUSED
--
-- --- the host switches build off ---
-- build in the lounge (staff said no)         REFUSED
-- post on the board (untouched)               ALLOWED
--
-- --- after the event closes ---
-- build in the lounge                         REFUSED
-- post on the board                           REFUSED
-- the door: event_open()                      false
-- but nobody is ejected: tenant_role()        guest
--
-- --- an ordinary space, no event ---
-- build (as before this feature: no)          REFUSED
-- event_open() on a non-event                 true
