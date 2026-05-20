create table if not exists public.user_notification_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  morning_enabled boolean not null default true,
  morning_time text not null default '09:00' check (morning_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  evening_enabled boolean not null default true,
  evening_time text not null default '20:00' check (evening_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  sleep_enabled boolean not null default false,
  bedtime text check (bedtime is null or bedtime ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  sleep_remind_before_minutes integer not null default 45 check (sleep_remind_before_minutes between 15 and 120),
  quest_reminders_enabled boolean not null default false,
  active_quest_reminders_enabled boolean not null default false,
  boss_reminders_enabled boolean not null default false,
  streak_warning_enabled boolean not null default false,
  progress_notifications_enabled boolean not null default true,
  quiet_hours_start text check (quiet_hours_start is null or quiet_hours_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  quiet_hours_end text check (quiet_hours_end is null or quiet_hours_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  max_daily_notifications integer not null default 4 check (max_daily_notifications between 1 and 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null check (type in (
    'morning_protocol',
    'unfinished_quests',
    'active_quest_reminder',
    'evening_report',
    'sleep_reminder',
    'streak_warning',
    'boss_reminder',
    'level_up',
    'achievement'
  )),
  sent_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'sent' check (status in ('sent', 'skipped', 'error'))
);

drop trigger if exists set_user_notification_settings_updated_at on public.user_notification_settings;

create trigger set_user_notification_settings_updated_at
before update on public.user_notification_settings
for each row execute function public.set_updated_at();

insert into public.user_notification_settings (user_id)
select id from public.users
on conflict (user_id) do nothing;

create index if not exists idx_user_notification_settings_user_id
on public.user_notification_settings(user_id);

create index if not exists idx_notification_logs_user_type_sent
on public.notification_logs(user_id, type, sent_at desc);

create index if not exists idx_notification_logs_sent_at
on public.notification_logs(sent_at desc);

alter table public.user_notification_settings enable row level security;
alter table public.notification_logs enable row level security;

revoke all on table public.user_notification_settings from anon, authenticated;
revoke all on table public.notification_logs from anon, authenticated;
grant select, insert, update, delete on table public.user_notification_settings to service_role;
grant select, insert, update, delete on table public.notification_logs to service_role;
