alter table public.users
  add column if not exists timezone text,
  add column if not exists timezone_offset integer;

alter table public.users
  drop constraint if exists users_timezone_offset_check;

alter table public.users
  add constraint users_timezone_offset_check
  check (timezone_offset is null or timezone_offset between -840 and 840);

alter table public.quests
  drop constraint if exists quests_status_check;

alter table public.quests
  add constraint quests_status_check
  check (status in ('active', 'completed', 'skipped', 'replaced'));

delete from public.quest_templates a
using public.quest_templates b
where a.ctid < b.ctid
  and a.title = b.title
  and a.category = b.category
  and a.difficulty = b.difficulty;

create unique index if not exists quest_templates_unique_template_idx
  on public.quest_templates (title, category, difficulty);

create index if not exists idx_quests_user_due_type_status
  on public.quests (user_id, due_date, type, status);

create index if not exists idx_quests_user_boss_relevance
  on public.quests (user_id, category, status, due_date);

with duplicate_active_quests as (
  select id,
         row_number() over (
           partition by user_id, due_date, title, category
           order by created_at asc, id asc
         ) as duplicate_rank
  from public.quests
  where status = 'active'
)
update public.quests q
set status = 'replaced'
from duplicate_active_quests d
where q.id = d.id
  and d.duplicate_rank > 1;

create unique index if not exists quests_unique_active_template_per_day_idx
  on public.quests (user_id, due_date, title, category)
  where status = 'active';
