create table if not exists public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  primary_goal text not null default 'focus'
    check (primary_goal in ('sport', 'discipline', 'study', 'focus', 'health', 'charisma')),
  desired_difficulty text not null default 'medium'
    check (desired_difficulty in ('easy', 'medium', 'hard')),
  quests_per_day integer not null default 5 check (quests_per_day between 1 and 7),
  wake_time time,
  sleep_time time,
  allow_physical_quests boolean not null default true,
  preferred_categories text[] not null default array[]::text[],
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id),
  constraint user_settings_preferred_categories_check check (
    preferred_categories <@ array[
      'strength',
      'intelligence',
      'vitality',
      'discipline',
      'focus',
      'charisma'
    ]::text[]
  )
);

create trigger set_user_settings_updated_at
before update on public.user_settings
for each row execute function public.set_updated_at();

insert into public.user_settings (user_id)
select id from public.users
on conflict (user_id) do nothing;

create index if not exists idx_user_settings_user_id
  on public.user_settings (user_id);

alter table public.user_settings enable row level security;

revoke all on table public.user_settings from anon, authenticated;
grant select, insert, update, delete on table public.user_settings to service_role;
