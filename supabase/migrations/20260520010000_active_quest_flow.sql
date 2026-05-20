alter table public.quests
add column if not exists started_at timestamptz;

alter table public.quests
add column if not exists cancelled_at timestamptz;

alter table public.quests
add column if not exists deleted_at timestamptz;

alter table public.quests
add column if not exists custom_template_id uuid;

update public.quests
set
  status = 'skipped',
  cancelled_at = coalesce(cancelled_at, now())
where status = 'replaced';

alter table public.quests
drop constraint if exists quests_status_check;

alter table public.quests
add constraint quests_status_check
check (status in ('active', 'in_progress', 'completed', 'skipped'));

alter table public.quests
drop constraint if exists quests_type_check;

alter table public.quests
add constraint quests_type_check
check (type in ('daily', 'generated', 'custom'));

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'custom_quest_templates'
  ) and not exists (
    select 1
    from pg_constraint
    where conname = 'quests_custom_template_id_fkey'
  ) then
    alter table public.quests
    add constraint quests_custom_template_id_fkey
    foreign key (custom_template_id)
    references public.custom_quest_templates(id)
    on delete set null;
  end if;
end $$;

alter table public.custom_quest_templates
drop constraint if exists custom_quest_templates_title_check;

alter table public.custom_quest_templates
add constraint custom_quest_templates_title_check
check (char_length(trim(title)) between 1 and 80);

create index if not exists idx_quests_user_in_progress
on public.quests(user_id, status, due_date)
where status = 'in_progress' and deleted_at is null;

create index if not exists idx_quests_user_due_not_deleted
on public.quests(user_id, due_date)
where deleted_at is null;

create unique index if not exists idx_quests_custom_template_due_date
on public.quests(user_id, custom_template_id, due_date)
where custom_template_id is not null;
