create table if not exists public.custom_quest_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 2 and 80),
  description text not null default '',
  category text not null check (category in ('strength', 'intelligence', 'vitality', 'discipline', 'focus', 'charisma')),
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  xp_reward integer not null check (xp_reward in (15, 35, 75)),
  stat_reward_key text not null check (stat_reward_key in ('strength', 'intelligence', 'vitality', 'discipline', 'focus', 'charisma')),
  stat_reward_value integer not null default 1 check (stat_reward_value between 1 and 3),
  recurrence_type text not null check (recurrence_type in ('once', 'daily', 'weekly', 'weekdays')),
  weekdays integer[] not null default '{}',
  starts_at date,
  ends_at date,
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at >= starts_at),
  check (recurrence_type <> 'weekdays' or array_length(weekdays, 1) > 0),
  check (weekdays <@ array[1, 2, 3, 4, 5, 6, 7])
);

alter table public.quests
  drop constraint if exists quests_type_check;

alter table public.quests
  add constraint quests_type_check
  check (type in ('daily', 'generated', 'custom'));

alter table public.quests
  add column if not exists source text not null default 'system',
  add column if not exists custom_template_id uuid references public.custom_quest_templates(id) on delete set null;

alter table public.quests
  drop constraint if exists quests_source_check;

alter table public.quests
  add constraint quests_source_check
  check (source in ('system', 'generated', 'custom'));

update public.quests
set source = case
  when type = 'generated' then 'generated'
  when type = 'custom' then 'custom'
  else 'system'
end
where source is distinct from case
  when type = 'generated' then 'generated'
  when type = 'custom' then 'custom'
  else 'system'
end;

create index if not exists idx_custom_quest_templates_user_active
  on public.custom_quest_templates (user_id, is_active, deleted_at);

create index if not exists idx_quests_custom_template_due
  on public.quests (user_id, custom_template_id, due_date);

create unique index if not exists quests_unique_custom_template_per_day_idx
  on public.quests (user_id, custom_template_id, due_date)
  where custom_template_id is not null;

create trigger set_custom_quest_templates_updated_at
before update on public.custom_quest_templates
for each row execute function public.set_updated_at();

alter table public.custom_quest_templates enable row level security;

revoke all on table public.custom_quest_templates from anon, authenticated;
grant select, insert, update, delete on table public.custom_quest_templates to service_role;
