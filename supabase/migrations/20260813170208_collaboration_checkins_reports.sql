alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'assignment', 'mention', 'status', 'due', 'comment', 'system',
    'announcement', 'checkin', 'reaction', 'subscription'
  ));

alter table public.notifications
  add column if not exists dedupe_key text;

alter table public.notifications
  drop constraint if exists notifications_dedupe_key_key;
alter table public.notifications
  add constraint notifications_dedupe_key_key unique (dedupe_key);

create table public.project_posts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'message' check (kind in ('message', 'announcement')),
  title text not null default '',
  body text not null,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.project_posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table public.post_reactions (
  post_id uuid not null references public.project_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '🎉', '👀')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.post_subscriptions (
  post_id uuid not null references public.project_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.task_reactions (
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '🎉', '👀')),
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

create table public.task_subscriptions (
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

create table public.checkin_schedules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  prompt text not null,
  cadence text not null default 'weekly'
    check (cadence in ('daily', 'weekdays', 'weekly', 'monthly')),
  scheduled_day smallint not null default 1 check (scheduled_day between 0 and 28),
  reminder_time time not null default '09:00',
  active boolean not null default true,
  last_prompt_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.checkin_responses (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.checkin_schedules(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  response_date date not null default (timezone('America/Mexico_City', now()))::date,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (schedule_id, user_id, response_date)
);

create index idx_project_posts_project_created
  on public.project_posts(project_id, pinned desc, created_at desc);
create index idx_post_comments_post_created
  on public.post_comments(post_id, created_at);
create index idx_post_subscriptions_user
  on public.post_subscriptions(user_id, post_id);
create index idx_task_subscriptions_user
  on public.task_subscriptions(user_id, task_id);
create index idx_checkin_schedules_project_active
  on public.checkin_schedules(project_id, active);
create index idx_checkin_responses_schedule_date
  on public.checkin_responses(schedule_id, response_date desc);
create index idx_tasks_project_due_active
  on public.tasks(project_id, due_date, status)
  where due_date is not null and status <> 'done';

create or replace function private.current_user_can_access_task(target_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tasks task
    where task.id = target_task_id
      and private.is_current_user_project_member(task.project_id)
  );
$$;

create or replace function private.current_user_can_access_post(target_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.project_posts post
    where post.id = target_post_id
      and private.is_current_user_project_member(post.project_id)
  );
$$;

create or replace function private.current_user_can_access_checkin(target_schedule_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.checkin_schedules schedule
    where schedule.id = target_schedule_id
      and private.is_current_user_project_member(schedule.project_id)
  );
$$;

revoke all on function private.current_user_can_access_task(uuid) from public, anon;
revoke all on function private.current_user_can_access_post(uuid) from public, anon;
revoke all on function private.current_user_can_access_checkin(uuid) from public, anon;
grant execute on function private.current_user_can_access_task(uuid) to authenticated;
grant execute on function private.current_user_can_access_post(uuid) to authenticated;
grant execute on function private.current_user_can_access_checkin(uuid) to authenticated;

alter table public.project_posts enable row level security;
alter table public.post_comments enable row level security;
alter table public.post_reactions enable row level security;
alter table public.post_subscriptions enable row level security;
alter table public.task_reactions enable row level security;
alter table public.task_subscriptions enable row level security;
alter table public.checkin_schedules enable row level security;
alter table public.checkin_responses enable row level security;

create policy "members read project posts"
on public.project_posts for select to authenticated
using (private.is_current_user_project_member(project_id));

create policy "members create project posts"
on public.project_posts for insert to authenticated
with check (
  author_id = (select auth.uid())
  and private.is_current_user_project_member(project_id)
);

create policy "authors update project posts"
on public.project_posts for update to authenticated
using (
  author_id = (select auth.uid())
  or private.is_current_user_project_owner(project_id)
)
with check (
  author_id = (select auth.uid())
  and private.is_current_user_project_member(project_id)
);

create policy "authors delete project posts"
on public.project_posts for delete to authenticated
using (
  author_id = (select auth.uid())
  or private.is_current_user_project_owner(project_id)
);

create policy "members read post comments"
on public.post_comments for select to authenticated
using (private.current_user_can_access_post(post_id));

create policy "members create post comments"
on public.post_comments for insert to authenticated
with check (
  author_id = (select auth.uid())
  and private.current_user_can_access_post(post_id)
);

create policy "authors manage post comments"
on public.post_comments for update to authenticated
using (author_id = (select auth.uid()))
with check (author_id = (select auth.uid()));

create policy "authors delete post comments"
on public.post_comments for delete to authenticated
using (author_id = (select auth.uid()));

create policy "members read post reactions"
on public.post_reactions for select to authenticated
using (private.current_user_can_access_post(post_id));

create policy "members add own post reactions"
on public.post_reactions for insert to authenticated
with check (
  user_id = (select auth.uid())
  and private.current_user_can_access_post(post_id)
);

create policy "members update own post reactions"
on public.post_reactions for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and private.current_user_can_access_post(post_id)
);

create policy "members delete own post reactions"
on public.post_reactions for delete to authenticated
using (user_id = (select auth.uid()));

create policy "members read post subscriptions"
on public.post_subscriptions for select to authenticated
using (private.current_user_can_access_post(post_id));

create policy "members add own post subscriptions"
on public.post_subscriptions for insert to authenticated
with check (
  user_id = (select auth.uid())
  and private.current_user_can_access_post(post_id)
);

create policy "members delete own post subscriptions"
on public.post_subscriptions for delete to authenticated
using (user_id = (select auth.uid()));

create policy "members read task reactions"
on public.task_reactions for select to authenticated
using (private.current_user_can_access_task(task_id));

create policy "members add own task reactions"
on public.task_reactions for insert to authenticated
with check (
  user_id = (select auth.uid())
  and private.current_user_can_access_task(task_id)
);

create policy "members update own task reactions"
on public.task_reactions for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and private.current_user_can_access_task(task_id)
);

create policy "members delete own task reactions"
on public.task_reactions for delete to authenticated
using (user_id = (select auth.uid()));

create policy "members read task subscriptions"
on public.task_subscriptions for select to authenticated
using (private.current_user_can_access_task(task_id));

create policy "members add own task subscriptions"
on public.task_subscriptions for insert to authenticated
with check (
  user_id = (select auth.uid())
  and private.current_user_can_access_task(task_id)
);

create policy "members delete own task subscriptions"
on public.task_subscriptions for delete to authenticated
using (user_id = (select auth.uid()));

create policy "members read checkin schedules"
on public.checkin_schedules for select to authenticated
using (private.is_current_user_project_member(project_id));

create policy "members create checkin schedules"
on public.checkin_schedules for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.is_current_user_project_member(project_id)
);

create policy "creators update checkin schedules"
on public.checkin_schedules for update to authenticated
using (
  created_by = (select auth.uid())
  or private.is_current_user_project_owner(project_id)
)
with check (private.is_current_user_project_member(project_id));

create policy "creators delete checkin schedules"
on public.checkin_schedules for delete to authenticated
using (
  created_by = (select auth.uid())
  or private.is_current_user_project_owner(project_id)
);

create policy "members read checkin responses"
on public.checkin_responses for select to authenticated
using (private.current_user_can_access_checkin(schedule_id));

create policy "members create own checkin responses"
on public.checkin_responses for insert to authenticated
with check (
  user_id = (select auth.uid())
  and private.current_user_can_access_checkin(schedule_id)
);

create policy "members update own checkin responses"
on public.checkin_responses for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and private.current_user_can_access_checkin(schedule_id)
);

create policy "members delete own checkin responses"
on public.checkin_responses for delete to authenticated
using (user_id = (select auth.uid()));

grant select, insert, update, delete on table public.project_posts to authenticated;
grant select, insert, update, delete on table public.post_comments to authenticated;
grant select, insert, update, delete on table public.post_reactions to authenticated;
grant select, insert, delete on table public.post_subscriptions to authenticated;
grant select, insert, update, delete on table public.task_reactions to authenticated;
grant select, insert, delete on table public.task_subscriptions to authenticated;
grant select, insert, update, delete on table public.checkin_schedules to authenticated;
grant select, insert, update, delete on table public.checkin_responses to authenticated;

create or replace function public.run_workspace_daily_automation(p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  local_today date := (timezone('America/Mexico_City', now()))::date;
  inserted_due integer := 0;
  inserted_checkins integer := 0;
begin
  if not exists (
    select 1
    from private.workspace_integrations integration
    where integration.name = 'daily_automation'
      and integration.secret_hash = encode(
        extensions.digest(coalesce(p_secret, ''), 'sha256'),
        'hex'
      )
  ) then
    raise exception 'Invalid automation secret' using errcode = '42501';
  end if;

  with recipients as (
    select
      task.id as task_id,
      task.project_id,
      task.title,
      task.due_date,
      coalesce(assignment.user_id, project.owner_id) as user_id
    from public.tasks task
    join public.projects project on project.id = task.project_id
    left join public.task_assignees assignment on assignment.task_id = task.id
    where task.status <> 'done'
      and task.due_date is not null
      and task.due_date <= local_today + 3
  ), inserted as (
    insert into public.notifications (
      user_id, actor_id, project_id, task_id, type, title, body, dedupe_key
    )
    select
      recipient.user_id,
      null,
      recipient.project_id,
      recipient.task_id,
      'due',
      case
        when recipient.due_date < local_today then 'To-do vencido'
        when recipient.due_date = local_today then 'Entrega para hoy'
        else 'Próxima entrega'
      end,
      recipient.title,
      'due:' || recipient.task_id || ':' || recipient.user_id || ':' || local_today
    from recipients recipient
    on conflict (dedupe_key) do nothing
    returning id
  )
  select count(*) into inserted_due from inserted;

  with due_schedules as (
    select schedule.*
    from public.checkin_schedules schedule
    where schedule.active
      and (
        schedule.cadence = 'daily'
        or (schedule.cadence = 'weekdays' and extract(isodow from local_today) between 1 and 5)
        or (schedule.cadence = 'weekly' and extract(dow from local_today) = schedule.scheduled_day)
        or (schedule.cadence = 'monthly' and extract(day from local_today) = schedule.scheduled_day)
      )
  ), recipients as (
    select
      schedule.id as schedule_id,
      schedule.project_id,
      schedule.title,
      project.owner_id as user_id
    from due_schedules schedule
    join public.projects project on project.id = schedule.project_id
    union
    select
      schedule.id,
      schedule.project_id,
      schedule.title,
      member.user_id
    from due_schedules schedule
    join public.project_members member on member.project_id = schedule.project_id
  ), inserted as (
    insert into public.notifications (
      user_id, actor_id, project_id, task_id, type, title, body, dedupe_key
    )
    select
      recipient.user_id,
      null,
      recipient.project_id,
      null,
      'checkin',
      'Check-in pendiente',
      recipient.title,
      'checkin:' || recipient.schedule_id || ':' || recipient.user_id || ':' || local_today
    from recipients recipient
    on conflict (dedupe_key) do nothing
    returning id
  )
  select count(*) into inserted_checkins from inserted;

  update public.checkin_schedules schedule
  set last_prompt_on = local_today,
      updated_at = now()
  where schedule.active
    and (
      schedule.cadence = 'daily'
      or (schedule.cadence = 'weekdays' and extract(isodow from local_today) between 1 and 5)
      or (schedule.cadence = 'weekly' and extract(dow from local_today) = schedule.scheduled_day)
      or (schedule.cadence = 'monthly' and extract(day from local_today) = schedule.scheduled_day)
    );

  return jsonb_build_object(
    'ok', true,
    'date', local_today,
    'due_reminders', inserted_due,
    'checkin_reminders', inserted_checkins
  );
end;
$$;

revoke all on function public.run_workspace_daily_automation(text)
  from public, authenticated;
grant execute on function public.run_workspace_daily_automation(text)
  to anon, service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'project_posts', 'post_comments', 'post_reactions', 'post_subscriptions',
    'task_reactions', 'task_subscriptions', 'checkin_schedules', 'checkin_responses'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;
