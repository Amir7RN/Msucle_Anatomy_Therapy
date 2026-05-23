-- Create ROM history table
create table public.rom_history (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  muscle_id text not null,
  movement_id text not null,
  side text not null,
  angle float not null,
  reference float not null,
  created_at timestamp with time zone default now()
);

-- Enable RLS (Row Level Security)
alter table public.rom_history enable row level security;

-- Policy: Users can only read their own ROM history
create policy "Users can read their own ROM history"
  on public.rom_history
  for select
  using (auth.uid() = user_id);

-- Policy: Users can insert their own ROM history
create policy "Users can insert their own ROM history"
  on public.rom_history
  for insert
  with check (auth.uid() = user_id);

-- Create index for faster queries
create index idx_rom_history_user_id on public.rom_history(user_id);
create index idx_rom_history_user_ts on public.rom_history(user_id, created_at desc);

-- Create user metadata table (optional, for future extensions)
create table public.user_profiles (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Enable RLS on user_profiles
alter table public.user_profiles enable row level security;

create policy "Users can read their own profile"
  on public.user_profiles
  for select
  using (auth.uid() = user_id);

create policy "Users can update their own profile"
  on public.user_profiles
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
