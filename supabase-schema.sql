-- ════════════════════════════════════════════════════════════════════════════
-- Zevahealth / Muscle Atlas — Supabase Schema
--
-- Run this once in your Supabase project: Dashboard → SQL Editor → New query
-- → paste this whole file → Run.
--
-- It creates ONE table (rom_history) and enables Row Level Security with
-- policies that scope every row to its owner via auth.uid().
-- ════════════════════════════════════════════════════════════════════════════

-- ── Table: rom_history ──────────────────────────────────────────────────────
-- Per-user log of measured range-of-motion samples from the assessment flow.

create table if not exists public.rom_history (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  muscle_id    text not null,
  movement_id  text not null,
  side         text not null check (side in ('L', 'R')),
  angle        double precision not null,
  reference    double precision not null,
  created_at   timestamptz not null default now()
);

-- Index for the typical read pattern (per-user, time-ordered).
create index if not exists rom_history_user_created_idx
  on public.rom_history (user_id, created_at desc);

-- Index for the muscle-specific lookups (peakLookup in ExerciseGuidance).
create index if not exists rom_history_user_muscle_idx
  on public.rom_history (user_id, muscle_id);

-- ── Row Level Security ──────────────────────────────────────────────────────
-- Without RLS the anon key would let anyone read/write any row. These
-- policies scope every operation to rows where user_id = auth.uid().

alter table public.rom_history enable row level security;

-- Drop any old policies before recreating (so this file is idempotent).
drop policy if exists "rom_history_select_own" on public.rom_history;
drop policy if exists "rom_history_insert_own" on public.rom_history;
drop policy if exists "rom_history_update_own" on public.rom_history;
drop policy if exists "rom_history_delete_own" on public.rom_history;

create policy "rom_history_select_own"
  on public.rom_history for select
  using (auth.uid() = user_id);

create policy "rom_history_insert_own"
  on public.rom_history for insert
  with check (auth.uid() = user_id);

create policy "rom_history_update_own"
  on public.rom_history for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "rom_history_delete_own"
  on public.rom_history for delete
  using (auth.uid() = user_id);

-- ── Default user_id on insert ───────────────────────────────────────────────
-- The client doesn't have to send user_id explicitly — set it from the JWT.

create or replace function public.set_rom_history_user_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists rom_history_set_user_id on public.rom_history;
create trigger rom_history_set_user_id
  before insert on public.rom_history
  for each row execute function public.set_rom_history_user_id();

-- ════════════════════════════════════════════════════════════════════════════
-- Notes
--
-- 1. Email confirmation: Dashboard → Authentication → Providers → Email →
--    set "Confirm email" to OFF for fastest local testing. Turn it back ON
--    for production.
--
-- 2. Test it: sign up via the in-app modal, then run this in SQL Editor to
--    see your own user_id:
--        select id, email from auth.users;
--    Insert a row by hand to confirm the trigger sets user_id from your JWT:
--        insert into public.rom_history (muscle_id, movement_id, side, angle, reference)
--        values ('biceps_brachii_R', 'elbow_flexion', 'R', 142, 180);
--
-- 3. The app's migrateLocalStorageToSupabase() will fire automatically on
--    your first sign-in if you already have localStorage history — those
--    rows will land here with the correct user_id.
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- OPTIONAL: user_programs — persists the AI-generated 4-week mobility plan
-- so it survives device changes. If skipped, the program still works (it
-- falls back to localStorage), it just won't sync across browsers.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.user_programs (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  generated_at timestamptz not null default now(),
  title        text not null,
  plan         jsonb not null
);

alter table public.user_programs enable row level security;

drop policy if exists "user_programs_select_own" on public.user_programs;
drop policy if exists "user_programs_upsert_own" on public.user_programs;

create policy "user_programs_select_own"
  on public.user_programs for select
  using (auth.uid() = user_id);

create policy "user_programs_upsert_own"
  on public.user_programs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ════════════════════════════════════════════════════════════════════════════
-- muscle_load_health — per-user training-workload summary computed from an
-- Apple Health export (Import Health Data feature). One row per muscle group
-- per import. Same RLS pattern as rom_history: scoped by auth.uid(), explicit
-- user_id on insert, no cross-user access.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.muscle_load_health (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  muscle_group   text not null,
  load_7day      numeric,
  load_28day     numeric,
  acwr           numeric,
  classification text,
  computed_at    timestamptz not null default now()
);

-- Typical read pattern: per-user, most recent import first.
create index if not exists muscle_load_health_user_computed_idx
  on public.muscle_load_health (user_id, computed_at desc);

alter table public.muscle_load_health enable row level security;

drop policy if exists "muscle_load_health_select_own" on public.muscle_load_health;
drop policy if exists "muscle_load_health_insert_own" on public.muscle_load_health;
drop policy if exists "muscle_load_health_update_own" on public.muscle_load_health;
drop policy if exists "muscle_load_health_delete_own" on public.muscle_load_health;

create policy "muscle_load_health_select_own"
  on public.muscle_load_health for select
  using (auth.uid() = user_id);

create policy "muscle_load_health_insert_own"
  on public.muscle_load_health for insert
  with check (auth.uid() = user_id);

create policy "muscle_load_health_update_own"
  on public.muscle_load_health for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "muscle_load_health_delete_own"
  on public.muscle_load_health for delete
  using (auth.uid() = user_id);

-- Default user_id from the JWT on insert (mirrors rom_history's trigger), so the
-- client doesn't strictly have to send it. RLS enforces ownership either way.
create or replace function public.set_muscle_load_health_user_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists muscle_load_health_set_user_id on public.muscle_load_health;
create trigger muscle_load_health_set_user_id
  before insert on public.muscle_load_health
  for each row execute function public.set_muscle_load_health_user_id();


-- ════════════════════════════════════════════════════════════════════════════
-- practitioner_clients — client-granted, read-only practitioner access.
--
-- A CLIENT explicitly grants a PRACTITIONER (by account email) read access to
-- their muscle_load_health and rom_history rows. Strictly additive:
--   * only the client can create a link (insert RLS + SECURITY DEFINER grant fn)
--   * practitioners gain SELECT only — every existing insert/update/delete
--     policy stays exactly as-is, so per-user write isolation is unchanged
--   * either side can end the link at any time
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.practitioner_clients (
  id                   uuid primary key default gen_random_uuid(),
  practitioner_user_id uuid not null references auth.users(id) on delete cascade,
  client_user_id       uuid not null references auth.users(id) on delete cascade,
  -- Labels captured at grant time so each side can render a human name
  -- without needing to query auth.users (which RLS forbids).
  practitioner_label   text,
  client_label         text,
  status               text not null default 'approved'
                       check (status in ('approved', 'revoked')),
  created_at           timestamptz not null default now(),
  unique (practitioner_user_id, client_user_id),
  check (practitioner_user_id <> client_user_id)
);

create index if not exists practitioner_clients_practitioner_idx
  on public.practitioner_clients (practitioner_user_id, status);
create index if not exists practitioner_clients_client_idx
  on public.practitioner_clients (client_user_id, status);

alter table public.practitioner_clients enable row level security;

drop policy if exists "practitioner_clients_select_own"  on public.practitioner_clients;
drop policy if exists "practitioner_clients_insert_client" on public.practitioner_clients;
drop policy if exists "practitioner_clients_update_client" on public.practitioner_clients;
drop policy if exists "practitioner_clients_delete_either" on public.practitioner_clients;

-- Both parties can see the links they are part of.
create policy "practitioner_clients_select_own"
  on public.practitioner_clients for select
  using (auth.uid() = client_user_id or auth.uid() = practitioner_user_id);

-- ONLY the client may create a link (no practitioner self-grant).
create policy "practitioner_clients_insert_client"
  on public.practitioner_clients for insert
  with check (auth.uid() = client_user_id);

-- Only the client may change a link (e.g. mark revoked).
create policy "practitioner_clients_update_client"
  on public.practitioner_clients for update
  using (auth.uid() = client_user_id)
  with check (auth.uid() = client_user_id);

-- Either side may delete (client revokes / practitioner leaves).
create policy "practitioner_clients_delete_either"
  on public.practitioner_clients for delete
  using (auth.uid() = client_user_id or auth.uid() = practitioner_user_id);

-- Client-invoked grant-by-email. SECURITY DEFINER so it can resolve the
-- practitioner's email in auth.users; it ONLY ever inserts with
-- client_user_id = auth.uid(), so a caller cannot grant access to anyone
-- else's data.
create or replace function public.grant_practitioner_access(practitioner_email text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  me       uuid := auth.uid();
  my_email text;
  pract_id uuid;
begin
  if me is null then
    return json_build_object('ok', false, 'error', 'Sign in first.');
  end if;

  select id into pract_id
  from auth.users
  where lower(email) = lower(trim(practitioner_email))
  limit 1;

  if pract_id is null then
    return json_build_object('ok', false, 'error', 'No account found with that email.');
  end if;
  if pract_id = me then
    return json_build_object('ok', false, 'error', 'You cannot share with your own account.');
  end if;

  select email into my_email from auth.users where id = me;

  insert into public.practitioner_clients
    (practitioner_user_id, client_user_id, practitioner_label, client_label, status)
  values
    (pract_id, me, lower(trim(practitioner_email)), my_email, 'approved')
  on conflict (practitioner_user_id, client_user_id)
  do update set status = 'approved';

  return json_build_object('ok', true);
end;
$$;

revoke all on function public.grant_practitioner_access(text) from public, anon;
grant execute on function public.grant_practitioner_access(text) to authenticated;

-- ── Additive read access for approved practitioners ─────────────────────────
-- New PERMISSIVE select policies OR-combine with the existing *_select_own
-- policies — owners keep exactly the access they had; approved practitioners
-- gain SELECT (and nothing else) on their clients' rows.

drop policy if exists "muscle_load_health_select_shared" on public.muscle_load_health;
create policy "muscle_load_health_select_shared"
  on public.muscle_load_health for select
  using (
    exists (
      select 1 from public.practitioner_clients pc
      where pc.practitioner_user_id = auth.uid()
        and pc.client_user_id = muscle_load_health.user_id
        and pc.status = 'approved'
    )
  );

drop policy if exists "rom_history_select_shared" on public.rom_history;
create policy "rom_history_select_shared"
  on public.rom_history for select
  using (
    exists (
      select 1 from public.practitioner_clients pc
      where pc.practitioner_user_id = auth.uid()
        and pc.client_user_id = rom_history.user_id
        and pc.status = 'approved'
    )
  );
