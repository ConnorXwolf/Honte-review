-- Honte Review — database setup.
-- Supabase → SQL Editor → paste everything → Run. Safe to run again.
-- Also required: Authentication → Sign In / Providers → Email → turn OFF "Confirm email"
-- (accounts use generated codes, not real email addresses).

-- One row per account. Each account is linked to one OGS player.
-- Several codes may link to the same OGS player: a code is never handed out again, so typing
-- someone's OGS name only ever creates a new, empty account — it never reveals theirs.
create table if not exists public.review_profiles (
  id           uuid primary key references auth.users on delete cascade,
  ogs_id       bigint not null,
  ogs_username text,
  settings     jsonb not null default '{}'::jsonb,   -- KataGo engine/model/visits, etc.
  created_at   timestamptz not null default now()
);
create index if not exists review_profiles_ogs on public.review_profiles (ogs_id);

create table if not exists public.review_games (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  ext_id     text,                                  -- 'ogs:<game id>' for games imported from OGS; null for SGF uploads / manual games
  played_on  date not null default current_date,
  info       jsonb not null default '{}'::jsonb,    -- opponent, colors, ranks, rules, komi, result, notes, AI analysis, variations…
  points     jsonb not null default '[]'::jsonb,    -- key moves
  sgf        text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists review_games_ext on public.review_games (user_id, ext_id) where ext_id is not null;
create index if not exists review_games_day on public.review_games (user_id, played_on);

alter table public.review_profiles enable row level security;
alter table public.review_games enable row level security;

drop policy if exists review_profiles_own on public.review_profiles;
create policy review_profiles_own on public.review_profiles for all
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists review_games_own on public.review_games;
create policy review_games_own on public.review_games for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

notify pgrst, 'reload schema';
