# Supabase Authentication Setup Guide

## 1. Create Supabase Project

1. Go to https://supabase.com and sign up for free
2. Click "New Project"
3. Fill in:
   - Project Name: `zeva-health` (or your preference)
   - Database Password: Generate a strong password
   - Region: Choose closest to your users (default: us-east-1)
4. Wait for project to initialize (~2 minutes)

## 2. Get Your Credentials

After project creation:
1. Go to Project Settings → API
2. Copy:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **Anon Public Key** (labeled as "anon public")

## 3. Create Environment Variables

Create a `.env.local` file in your project root:

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...xxxxx
```

Replace `xxxxx` with your actual values from Step 2.

## 4. Database Schema Setup

In Supabase Dashboard, go to SQL Editor and run this:

```sql
-- Create ROM history table
create table public.rom_history (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  muscle_id text not null,
  movement_id text not null,
  side text not null, -- 'L' or 'R'
  angle float not null,
  reference float not null,
  created_at timestamp with time zone default now(),
  
  -- Index for fast queries by user
  unique(id)
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
```

## 5. Enable Email Auth

In Supabase Dashboard:
1. Go to Authentication → Providers
2. Email is enabled by default ✓
3. (Optional) Enable Google OAuth:
   - Click "Google"
   - Follow the prompts to set up Google OAuth
   - Add redirect URL from the provider page

## 6. Email Templates (Optional)

In Authentication → Email Templates, you can customize:
- Confirmation emails
- Password reset emails
- Magic link emails

## 7. Install Dependencies

```bash
npm install @supabase/supabase-js
npm install @supabase/auth-helpers-react
```

That's it! Your Supabase backend is ready.

## Troubleshooting

- **"Invalid API key"**: Make sure you're using the **anon public** key, not the service role key
- **"User not found"**: Check that Row Level Security policies are correctly set
- **CORS errors**: Go to Authentication → URL Configuration and add your app's URL
