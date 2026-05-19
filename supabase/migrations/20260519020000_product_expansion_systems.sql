alter table public.quest_templates
  add column if not exists estimated_minutes integer not null default 20 check (estimated_minutes between 1 and 240),
  add column if not exists tags text[] not null default '{}',
  add column if not exists reason text;

alter table public.quests
  add column if not exists estimated_minutes integer,
  add column if not exists tags text[] not null default '{}',
  add column if not exists reason text;

create table if not exists public.skill_nodes (
  key text primary key,
  title text not null,
  description text not null,
  stat_key text not null check (stat_key in ('strength', 'intelligence', 'vitality', 'discipline', 'focus', 'charisma')),
  tier integer not null check (tier in (1, 2, 3)),
  cost integer not null check (cost > 0),
  bonus_text text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.user_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  skill_key text not null references public.skill_nodes(key) on delete cascade,
  unlocked_at timestamptz not null default now(),
  unique (user_id, skill_key)
);

create table if not exists public.inventory_items (
  key text primary key,
  title text not null,
  description text not null,
  type text not null check (type in ('title', 'frame', 'booster', 'shield')),
  rarity text not null check (rarity in ('common', 'rare', 'epic', 'legendary')),
  effect_key text,
  effect_value integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.user_inventory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  item_key text not null references public.inventory_items(key) on delete cascade,
  quantity integer not null default 1 check (quantity > 0),
  acquired_at timestamptz not null default now(),
  unique (user_id, item_key)
);

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  title text not null,
  description text not null,
  starts_at date not null,
  ends_at date not null,
  boss_name text not null,
  reward_title text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (starts_at <= ends_at)
);

create table if not exists public.season_progress (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  quests_completed integer not null default 0 check (quests_completed >= 0),
  bosses_defeated integer not null default 0 check (bosses_defeated >= 0),
  xp integer not null default 0 check (xp >= 0),
  reward_claimed boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (season_id, user_id)
);

create table if not exists public.squads (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  code text unique not null default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  created_at timestamptz not null default now()
);

create table if not exists public.squad_members (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null references public.squads(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  unique (squad_id, user_id),
  unique (user_id)
);

create trigger set_season_progress_updated_at
before update on public.season_progress
for each row execute function public.set_updated_at();

create index if not exists idx_user_skills_user_id on public.user_skills(user_id);
create index if not exists idx_user_inventory_user_id on public.user_inventory(user_id);
create index if not exists idx_season_progress_user_id on public.season_progress(user_id);
create index if not exists idx_squad_members_user_id on public.squad_members(user_id);
create index if not exists idx_squad_members_squad_id on public.squad_members(squad_id);

alter table public.skill_nodes enable row level security;
alter table public.user_skills enable row level security;
alter table public.inventory_items enable row level security;
alter table public.user_inventory enable row level security;
alter table public.seasons enable row level security;
alter table public.season_progress enable row level security;
alter table public.squads enable row level security;
alter table public.squad_members enable row level security;

revoke all on table
  public.skill_nodes,
  public.user_skills,
  public.inventory_items,
  public.user_inventory,
  public.seasons,
  public.season_progress,
  public.squads,
  public.squad_members
from anon, authenticated;

grant select, insert, update, delete on table
  public.skill_nodes,
  public.user_skills,
  public.inventory_items,
  public.user_inventory,
  public.seasons,
  public.season_progress,
  public.squads,
  public.squad_members
to service_role;

insert into public.skill_nodes (key, title, description, stat_key, tier, cost, bonus_text)
values
  ('focus_i', 'Focus I', 'Базовая защита от отвлечений.', 'focus', 1, 1, '+1 FOC при открытии'),
  ('focus_ii', 'Focus II', 'Глубокие блоки даются легче.', 'focus', 2, 2, '+2 FOC при открытии'),
  ('focus_iii', 'Focus III', 'Система чаще предлагает focus-квесты.', 'focus', 3, 3, '+3 FOC при открытии'),
  ('discipline_i', 'Discipline I', 'Ритм дня становится стабильнее.', 'discipline', 1, 1, '+1 DSC при открытии'),
  ('discipline_ii', 'Discipline II', 'Пропуски меньше ломают темп.', 'discipline', 2, 2, '+2 DSC при открытии'),
  ('discipline_iii', 'Discipline III', 'Планирование усиливает серию.', 'discipline', 3, 3, '+3 DSC при открытии'),
  ('vitality_i', 'Vitality I', 'Восстановление энергии ускоряется.', 'vitality', 1, 1, '+1 VIT при открытии'),
  ('vitality_ii', 'Vitality II', 'Здоровье держится устойчивее.', 'vitality', 2, 2, '+2 VIT при открытии'),
  ('vitality_iii', 'Vitality III', 'Тяжелые дни легче пережить.', 'vitality', 3, 3, '+3 VIT при открытии'),
  ('charisma_i', 'Charisma I', 'Социальные квесты становятся проще.', 'charisma', 1, 1, '+1 CHA при открытии'),
  ('charisma_ii', 'Charisma II', 'Коммуникация получает инерцию.', 'charisma', 2, 2, '+2 CHA при открытии'),
  ('charisma_iii', 'Charisma III', 'Голос охотника звучит увереннее.', 'charisma', 3, 3, '+3 CHA при открытии')
on conflict (key) do update set
  title = excluded.title,
  description = excluded.description,
  stat_key = excluded.stat_key,
  tier = excluded.tier,
  cost = excluded.cost,
  bonus_text = excluded.bonus_text,
  is_active = true;

insert into public.inventory_items (key, title, description, type, rarity, effect_key, effect_value)
values
  ('streak_shield', 'Щит серии', 'Одноразовая защита серии для будущей механики streak recovery.', 'shield', 'rare', 'streak_protection', 1),
  ('focus_booster', 'Фокус-ускоритель', 'Награда за победу над боссом фокуса.', 'booster', 'epic', 'focus_bonus', 1),
  ('iron_frame', 'Железная рамка', 'Косметическая рамка профиля за стабильный прогресс.', 'frame', 'common', null, 0),
  ('season_title_token', 'Жетон сезонного титула', 'Открывает сезонный титул после завершения сезона.', 'title', 'legendary', 'title_unlock', 1)
on conflict (key) do update set
  title = excluded.title,
  description = excluded.description,
  type = excluded.type,
  rarity = excluded.rarity,
  effect_key = excluded.effect_key,
  effect_value = excluded.effect_value,
  is_active = true;

insert into public.seasons (key, title, description, starts_at, ends_at, boss_name, reward_title)
values
  ('awakening-2026-05', 'Сезон пробуждения', 'Первый сезон System Hunter: закрепи ритм и победи давление.', date '2026-05-01', date '2026-05-31', 'Архонт инерции', 'Пробужденный охотник')
on conflict (key) do update set
  title = excluded.title,
  description = excluded.description,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  boss_name = excluded.boss_name,
  reward_title = excluded.reward_title,
  is_active = true;
