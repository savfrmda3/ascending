create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.users (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint unique not null,
  username text,
  first_name text,
  level integer not null default 1 check (level > 0),
  xp integer not null default 0 check (xp >= 0),
  rank text not null default 'E' check (rank in ('E', 'D', 'C', 'B', 'A', 'S')),
  streak integer not null default 0 check (streak >= 0),
  hp integer not null default 100 check (hp between 0 and 100),
  energy integer not null default 100 check (energy between 0 and 100),
  current_title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_stats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  strength integer not null default 1 check (strength >= 0),
  intelligence integer not null default 1 check (intelligence >= 0),
  vitality integer not null default 1 check (vitality >= 0),
  discipline integer not null default 1 check (discipline >= 0),
  focus integer not null default 1 check (focus >= 0),
  charisma integer not null default 1 check (charisma >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table public.quest_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  category text not null check (category in ('strength', 'intelligence', 'vitality', 'discipline', 'focus', 'charisma')),
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  xp_reward integer not null check (xp_reward > 0),
  stat_reward_key text not null check (stat_reward_key in ('strength', 'intelligence', 'vitality', 'discipline', 'focus', 'charisma')),
  stat_reward_value integer not null default 1 check (stat_reward_value > 0),
  is_active boolean not null default true
);

create table public.quests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  description text not null,
  type text not null default 'daily' check (type in ('daily', 'generated')),
  category text not null check (category in ('strength', 'intelligence', 'vitality', 'discipline', 'focus', 'charisma')),
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  xp_reward integer not null check (xp_reward > 0),
  stat_reward_key text not null check (stat_reward_key in ('strength', 'intelligence', 'vitality', 'discipline', 'focus', 'charisma')),
  stat_reward_value integer not null default 1 check (stat_reward_value > 0),
  status text not null default 'active' check (status in ('active', 'completed', 'skipped')),
  due_date date not null,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.weekly_bosses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  description text not null,
  objective text not null,
  progress integer not null default 0 check (progress >= 0),
  target integer not null check (target > 0),
  xp_reward integer not null check (xp_reward > 0),
  stat_reward_key text not null check (stat_reward_key in ('strength', 'intelligence', 'vitality', 'discipline', 'focus', 'charisma')),
  stat_reward_value integer not null default 1 check (stat_reward_value > 0),
  status text not null default 'active' check (status in ('active', 'completed', 'expired')),
  starts_at date not null,
  ends_at date not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, starts_at, ends_at)
);

create table public.achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  key text not null,
  title text not null,
  description text not null,
  unlocked_at timestamptz not null default now(),
  unique (user_id, key)
);

create trigger set_users_updated_at
before update on public.users
for each row execute function public.set_updated_at();

create trigger set_user_stats_updated_at
before update on public.user_stats
for each row execute function public.set_updated_at();

create index idx_users_telegram_id on public.users(telegram_id);
create index idx_quests_user_due_date on public.quests(user_id, due_date);
create index idx_quests_user_status on public.quests(user_id, status);
create index idx_weekly_bosses_user_period on public.weekly_bosses(user_id, starts_at, ends_at);
create index idx_achievements_user on public.achievements(user_id);

alter table public.users enable row level security;
alter table public.user_stats enable row level security;
alter table public.quest_templates enable row level security;
alter table public.quests enable row level security;
alter table public.weekly_bosses enable row level security;
alter table public.achievements enable row level security;

revoke all on table
  public.users,
  public.user_stats,
  public.quest_templates,
  public.quests,
  public.weekly_bosses,
  public.achievements
from anon, authenticated;

grant select, insert, update, delete on table
  public.users,
  public.user_stats,
  public.quest_templates,
  public.quests,
  public.weekly_bosses,
  public.achievements
to service_role;

revoke execute on function public.set_updated_at() from anon, authenticated;
grant execute on function public.set_updated_at() to service_role;
