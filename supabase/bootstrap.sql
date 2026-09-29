-- Spartanblue fresh database bootstrap. Apply once to a new Supabase project.
-- Generated from the ordered migration files below; use migrations for upgrades.

-- BEGIN 20260812173000_initial_workspace.sql
create extension if not exists pgcrypto;

create table public.areas (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#5f7c67',
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  avatar_url text,
  area_id uuid references public.areas(id) on delete set null,
  role text not null default 'member' check (role in ('admin','lead','member')),
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  color text not null default '#e9764a',
  owner_id uuid not null references public.profiles(id) on delete cascade,
  area_id uuid references public.areas(id) on delete set null,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','editor','member')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  description text not null default '',
  status text not null default 'backlog' check (status in ('backlog','todo','in_progress','review','done')),
  priority text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  due_date date,
  position integer not null default 0,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.task_steps (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  title text not null,
  completed boolean not null default false,
  position integer not null default 0
);

create table public.task_assignees (
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

create table public.labels (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  color text not null default '#6583a6',
  unique (project_id, name)
);

create table public.task_labels (
  task_id uuid not null references public.tasks(id) on delete cascade,
  label_id uuid not null references public.labels(id) on delete cascade,
  primary key (task_id, label_id)
);

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  area_id uuid references public.areas(id) on delete set null,
  creator_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.template_steps (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates(id) on delete cascade,
  title text not null,
  position integer not null default 0
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  project_id uuid references public.projects(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  type text not null check (type in ('assignment','mention','status','due','comment','system')),
  title text not null,
  body text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_projects_area on public.projects(area_id);
create index idx_project_members_user on public.project_members(user_id);
create index idx_tasks_project_status_position on public.tasks(project_id, status, position);
create index idx_tasks_due_date on public.tasks(due_date) where status <> 'done';
create index idx_task_assignees_user on public.task_assignees(user_id);
create index idx_notifications_user_unread on public.notifications(user_id, created_at desc) where read_at is null;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, area_id)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    nullif(new.raw_user_meta_data ->> 'area_id', '')::uuid
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.touch_task_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tasks_updated_at before update on public.tasks
for each row execute procedure public.touch_task_updated_at();

alter table public.areas enable row level security;
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.tasks enable row level security;
alter table public.task_steps enable row level security;
alter table public.task_assignees enable row level security;
alter table public.labels enable row level security;
alter table public.task_labels enable row level security;
alter table public.templates enable row level security;
alter table public.template_steps enable row level security;
alter table public.comments enable row level security;
alter table public.notifications enable row level security;

create policy "areas are readable" on public.areas for select using (true);
create policy "profiles are readable by signed in users" on public.profiles for select to authenticated using (true);
create policy "users update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "members read projects" on public.projects for select to authenticated
using (owner_id = auth.uid() or exists (select 1 from public.project_members pm where pm.project_id = id and pm.user_id = auth.uid()));
create policy "users create projects" on public.projects for insert to authenticated with check (owner_id = auth.uid());
create policy "owners update projects" on public.projects for update to authenticated using (owner_id = auth.uid());
create policy "owners delete projects" on public.projects for delete to authenticated using (owner_id = auth.uid());

create policy "members read memberships" on public.project_members for select to authenticated
using (user_id = auth.uid() or exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));
create policy "owners manage memberships" on public.project_members for all to authenticated
using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()))
with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));

create policy "project members manage tasks" on public.tasks for all to authenticated
using (exists (select 1 from public.projects p where p.id = project_id and (p.owner_id = auth.uid() or exists (select 1 from public.project_members pm where pm.project_id = p.id and pm.user_id = auth.uid()))))
with check (exists (select 1 from public.projects p where p.id = project_id and (p.owner_id = auth.uid() or exists (select 1 from public.project_members pm where pm.project_id = p.id and pm.user_id = auth.uid()))));

create policy "members manage steps" on public.task_steps for all to authenticated
using (exists (select 1 from public.tasks t where t.id = task_id and exists (select 1 from public.projects p where p.id = t.project_id and (p.owner_id = auth.uid() or exists (select 1 from public.project_members pm where pm.project_id = p.id and pm.user_id = auth.uid())))))
with check (exists (select 1 from public.tasks t where t.id = task_id and exists (select 1 from public.projects p where p.id = t.project_id and (p.owner_id = auth.uid() or exists (select 1 from public.project_members pm where pm.project_id = p.id and pm.user_id = auth.uid())))));

create policy "members manage assignees" on public.task_assignees for all to authenticated
using (exists (select 1 from public.tasks t join public.projects p on p.id = t.project_id where t.id = task_id and (p.owner_id = auth.uid() or exists (select 1 from public.project_members pm where pm.project_id = p.id and pm.user_id = auth.uid()))))
with check (exists (select 1 from public.tasks t join public.projects p on p.id = t.project_id where t.id = task_id and (p.owner_id = auth.uid() or exists (select 1 from public.project_members pm where pm.project_id = p.id and pm.user_id = auth.uid()))));

create policy "members manage labels" on public.labels for all to authenticated
using (exists (select 1 from public.projects p where p.id = project_id and (p.owner_id = auth.uid() or exists (select 1 from public.project_members pm where pm.project_id = p.id and pm.user_id = auth.uid()))))
with check (exists (select 1 from public.projects p where p.id = project_id and (p.owner_id = auth.uid() or exists (select 1 from public.project_members pm where pm.project_id = p.id and pm.user_id = auth.uid()))));
create policy "members manage task labels" on public.task_labels for all to authenticated
using (exists (select 1 from public.tasks t join public.projects p on p.id = t.project_id where t.id = task_id and (p.owner_id = auth.uid() or exists (select 1 from public.project_members pm where pm.project_id = p.id and pm.user_id = auth.uid()))))
with check (exists (select 1 from public.tasks t join public.projects p on p.id = t.project_id where t.id = task_id and (p.owner_id = auth.uid() or exists (select 1 from public.project_members pm where pm.project_id = p.id and pm.user_id = auth.uid()))));

create policy "signed in read templates" on public.templates for select to authenticated using (true);
create policy "signed in create templates" on public.templates for insert to authenticated with check (creator_id = auth.uid());
create policy "creators manage templates" on public.templates for update to authenticated using (creator_id = auth.uid());
create policy "creators delete templates" on public.templates for delete to authenticated using (creator_id = auth.uid());
create policy "signed in read template steps" on public.template_steps for select to authenticated using (true);
create policy "creators manage template steps" on public.template_steps for all to authenticated
using (exists (select 1 from public.templates t where t.id = template_id and t.creator_id = auth.uid()))
with check (exists (select 1 from public.templates t where t.id = template_id and t.creator_id = auth.uid()));

create policy "members manage comments" on public.comments for all to authenticated
using (author_id = auth.uid() or exists (select 1 from public.tasks t join public.projects p on p.id = t.project_id where t.id = task_id and (p.owner_id = auth.uid() or exists (select 1 from public.project_members pm where pm.project_id = p.id and pm.user_id = auth.uid()))))
with check (author_id = auth.uid());

create policy "users read own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "users update own notifications" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "members create notifications" on public.notifications for insert to authenticated with check (actor_id = auth.uid() or actor_id is null);

-- No sample areas or templates in this new workspace.

select pg_catalog.set_config('search_path', 'public', false);

-- END 20260812173000_initial_workspace.sql

-- BEGIN 20260812180000_signup_area_by_name.sql
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  selected_area uuid;
begin
  select id into selected_area
  from public.areas
  where id::text = coalesce(new.raw_user_meta_data ->> 'area_id', '')
     or lower(name) = lower(coalesce(new.raw_user_meta_data ->> 'area_id', ''))
  limit 1;

  insert into public.profiles (id, email, full_name, area_id)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    selected_area
  );
  return new;
end;
$$;

-- END 20260812180000_signup_area_by_name.sql

-- BEGIN 20260812205517_security_hardening.sql
alter function public.touch_task_updated_at() set search_path = public;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- END 20260812205517_security_hardening.sql

-- BEGIN 20260812210619_activity_events.sql
create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  verb text not null check (verb in ('created','moved','commented','completed','reopened','checked')),
  detail text not null default '',
  created_at timestamptz not null default now()
);

create index idx_activity_events_actor_created on public.activity_events(actor_id, created_at desc);
create index idx_activity_events_project_created on public.activity_events(project_id, created_at desc);

alter table public.activity_events enable row level security;

create policy "project members read activity" on public.activity_events
for select to authenticated
using (
  actor_id = (select auth.uid())
  or exists (
    select 1 from public.projects p
    where p.id = project_id
      and (
        p.owner_id = (select auth.uid())
        or exists (
          select 1 from public.project_members pm
          where pm.project_id = p.id and pm.user_id = (select auth.uid())
        )
      )
  )
);

create policy "members create own activity" on public.activity_events
for insert to authenticated
with check (
  actor_id = (select auth.uid())
  and exists (
    select 1 from public.projects p
    where p.id = project_id
      and (
        p.owner_id = (select auth.uid())
        or exists (
          select 1 from public.project_members pm
          where pm.project_id = p.id and pm.user_id = (select auth.uid())
        )
      )
  )
);

grant select, insert on public.activity_events to authenticated;

-- END 20260812210619_activity_events.sql

-- BEGIN 20260812224608_signup_custom_area.sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_area uuid;
  requested_area text;
begin
  requested_area := nullif(trim(coalesce(
    new.raw_user_meta_data ->> 'area_name',
    new.raw_user_meta_data ->> 'area_id',
    ''
  )), '');

  if requested_area is not null then
    select id into selected_area
    from public.areas
    where id::text = requested_area
       or lower(name) = lower(requested_area)
    limit 1;

    if selected_area is null then
      insert into public.areas (name, color)
      values (requested_area, '#3566AC')
      on conflict (name) do update set name = excluded.name
      returning id into selected_area;
    end if;
  end if;

  insert into public.profiles (id, email, full_name, area_id)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    selected_area
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- END 20260812224608_signup_custom_area.sql

-- BEGIN 20260812225227_profile_avatars_notifications_realtime.sql
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "users upload own avatars" on storage.objects;
create policy "users upload own avatars"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "users update own avatars" on storage.objects;
create policy "users update own avatars"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and owner_id = (select auth.uid())::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "users delete own avatars" on storage.objects;
create policy "users delete own avatars"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and owner_id = (select auth.uid())::text
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

create or replace function public.is_current_user_project_member(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = target_project_id
      and (
        p.owner_id = (select auth.uid())
        or exists (
          select 1
          from public.project_members pm
          where pm.project_id = p.id
            and pm.user_id = (select auth.uid())
        )
      )
  );
$$;

revoke all on function public.is_current_user_project_member(uuid) from public;
revoke all on function public.is_current_user_project_member(uuid) from anon;
grant execute on function public.is_current_user_project_member(uuid) to authenticated;

drop policy if exists "project members add memberships" on public.project_members;
create policy "project members add memberships"
on public.project_members
for insert
to authenticated
with check (public.is_current_user_project_member(project_id));

-- END 20260812225227_profile_avatars_notifications_realtime.sql

-- BEGIN 20260812225735_secure_project_membership_helper.sql
drop policy if exists "project members add memberships" on public.project_members;
drop policy if exists "owners manage memberships" on public.project_members;
drop function if exists public.is_current_user_project_member(uuid);

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.is_current_user_project_member(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = target_project_id
      and (
        p.owner_id = (select auth.uid())
        or exists (
          select 1
          from public.project_members pm
          where pm.project_id = p.id
            and pm.user_id = (select auth.uid())
        )
      )
  );
$$;

revoke all on function private.is_current_user_project_member(uuid) from public;
revoke all on function private.is_current_user_project_member(uuid) from anon;
grant execute on function private.is_current_user_project_member(uuid) to authenticated;

create policy "project members add memberships"
on public.project_members
for insert
to authenticated
with check (private.is_current_user_project_member(project_id));

create policy "owners update memberships"
on public.project_members
for update
to authenticated
using (
  exists (
    select 1
    from public.projects p
    where p.id = project_id
      and p.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.projects p
    where p.id = project_id
      and p.owner_id = (select auth.uid())
  )
);

create policy "owners delete memberships"
on public.project_members
for delete
to authenticated
using (
  exists (
    select 1
    from public.projects p
    where p.id = project_id
      and p.owner_id = (select auth.uid())
  )
);

-- END 20260812225735_secure_project_membership_helper.sql

-- BEGIN 20260813151624_fix_project_rls_and_owner_membership.sql
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.is_current_user_project_member(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = target_project_id
      and (
        p.owner_id = (select auth.uid())
        or exists (
          select 1
          from public.project_members pm
          where pm.project_id = p.id
            and pm.user_id = (select auth.uid())
        )
      )
  );
$$;

create or replace function private.is_current_user_project_owner(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = target_project_id
      and p.owner_id = (select auth.uid())
  );
$$;

revoke all on function private.is_current_user_project_member(uuid) from public, anon;
revoke all on function private.is_current_user_project_owner(uuid) from public, anon;
grant execute on function private.is_current_user_project_member(uuid) to authenticated;
grant execute on function private.is_current_user_project_owner(uuid) to authenticated;

drop policy if exists "members read projects" on public.projects;
create policy "members read projects"
on public.projects
for select
to authenticated
using (private.is_current_user_project_member(id));

drop policy if exists "members read memberships" on public.project_members;
create policy "members read memberships"
on public.project_members
for select
to authenticated
using (private.is_current_user_project_member(project_id));

drop policy if exists "project members add memberships" on public.project_members;
create policy "project members add memberships"
on public.project_members
for insert
to authenticated
with check (private.is_current_user_project_member(project_id));

drop policy if exists "owners update memberships" on public.project_members;
create policy "owners update memberships"
on public.project_members
for update
to authenticated
using (private.is_current_user_project_owner(project_id))
with check (private.is_current_user_project_owner(project_id));

drop policy if exists "owners delete memberships" on public.project_members;
create policy "owners delete memberships"
on public.project_members
for delete
to authenticated
using (private.is_current_user_project_owner(project_id));

create or replace function private.add_project_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.project_members (project_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (project_id, user_id)
  do update set role = 'owner';
  return new;
end;
$$;

revoke all on function private.add_project_owner_membership() from public, anon, authenticated;

drop trigger if exists add_project_owner_membership on public.projects;
create trigger add_project_owner_membership
after insert on public.projects
for each row execute function private.add_project_owner_membership();

-- END 20260813151624_fix_project_rls_and_owner_membership.sql

-- BEGIN 20260813152604_allow_project_owner_select.sql
drop policy if exists "members read projects" on public.projects;
create policy "members read projects"
on public.projects
for select
to authenticated
using (
  owner_id = (select auth.uid())
  or (select private.is_current_user_project_member(id))
);

-- END 20260813152604_allow_project_owner_select.sql

-- BEGIN 20260813154219_task_action_workflows.sql
create or replace function public.move_task_to_project(
  p_task_id uuid,
  p_target_project_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source_project_id uuid;
  v_label_names text[];
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select t.project_id
  into v_source_project_id
  from public.tasks t
  where t.id = p_task_id;

  if v_source_project_id is null then
    raise exception 'Task not found or unavailable' using errcode = 'P0002';
  end if;

  if v_source_project_id = p_target_project_id then
    return;
  end if;

  if not (select private.is_current_user_project_member(p_target_project_id)) then
    raise exception 'Target project is unavailable' using errcode = '42501';
  end if;

  select coalesce(array_agg(l.name), array[]::text[])
  into v_label_names
  from public.task_labels tl
  join public.labels l on l.id = tl.label_id
  where tl.task_id = p_task_id;

  insert into public.project_members (project_id, user_id, role)
  select p_target_project_id, ta.user_id, 'member'
  from public.task_assignees ta
  where ta.task_id = p_task_id
  on conflict (project_id, user_id) do nothing;

  delete from public.task_labels
  where task_id = p_task_id;

  update public.tasks
  set project_id = p_target_project_id
  where id = p_task_id;

  insert into public.labels (project_id, name, color)
  select p_target_project_id, source_label.name, source_label.color
  from public.labels source_label
  where source_label.project_id = v_source_project_id
    and source_label.name = any(v_label_names)
  on conflict (project_id, name) do nothing;

  insert into public.task_labels (task_id, label_id)
  select p_task_id, destination_label.id
  from public.labels destination_label
  where destination_label.project_id = p_target_project_id
    and destination_label.name = any(v_label_names)
  on conflict (task_id, label_id) do nothing;
end;
$$;

create or replace function public.copy_task_to_project(
  p_task_id uuid,
  p_target_project_id uuid,
  p_status text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source public.tasks%rowtype;
  v_new_task_id uuid;
  v_target_status text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select t.*
  into v_source
  from public.tasks t
  where t.id = p_task_id;

  if v_source.id is null then
    raise exception 'Task not found or unavailable' using errcode = 'P0002';
  end if;

  if not (select private.is_current_user_project_member(p_target_project_id)) then
    raise exception 'Target project is unavailable' using errcode = '42501';
  end if;

  v_target_status := coalesce(p_status, v_source.status);
  if v_target_status not in ('backlog', 'todo', 'in_progress', 'review', 'done') then
    raise exception 'Invalid task status' using errcode = '22023';
  end if;

  insert into public.project_members (project_id, user_id, role)
  select p_target_project_id, ta.user_id, 'member'
  from public.task_assignees ta
  where ta.task_id = p_task_id
  on conflict (project_id, user_id) do nothing;

  insert into public.tasks (
    project_id,
    title,
    description,
    status,
    priority,
    due_date,
    position,
    created_by
  )
  values (
    p_target_project_id,
    v_source.title || ' · copia',
    v_source.description,
    v_target_status,
    v_source.priority,
    v_source.due_date,
    v_source.position,
    (select auth.uid())
  )
  returning id into v_new_task_id;

  insert into public.task_steps (task_id, title, completed, position)
  select v_new_task_id, step.title, false, step.position
  from public.task_steps step
  where step.task_id = p_task_id;

  insert into public.task_assignees (task_id, user_id)
  select v_new_task_id, ta.user_id
  from public.task_assignees ta
  where ta.task_id = p_task_id
  on conflict (task_id, user_id) do nothing;

  if not exists (
    select 1
    from public.task_assignees ta
    where ta.task_id = v_new_task_id
  ) then
    insert into public.task_assignees (task_id, user_id)
    values (v_new_task_id, (select auth.uid()));
  end if;

  insert into public.labels (project_id, name, color)
  select p_target_project_id, source_label.name, source_label.color
  from public.task_labels tl
  join public.labels source_label on source_label.id = tl.label_id
  where tl.task_id = p_task_id
  on conflict (project_id, name) do nothing;

  insert into public.task_labels (task_id, label_id)
  select v_new_task_id, destination_label.id
  from public.task_labels source_task_label
  join public.labels source_label on source_label.id = source_task_label.label_id
  join public.labels destination_label
    on destination_label.project_id = p_target_project_id
   and destination_label.name = source_label.name
  where source_task_label.task_id = p_task_id
  on conflict (task_id, label_id) do nothing;

  return v_new_task_id;
end;
$$;

revoke all on function public.move_task_to_project(uuid, uuid) from public, anon;
revoke all on function public.copy_task_to_project(uuid, uuid, text) from public, anon;
grant execute on function public.move_task_to_project(uuid, uuid) to authenticated;
grant execute on function public.copy_task_to_project(uuid, uuid, text) to authenticated;

-- END 20260813154219_task_action_workflows.sql

-- BEGIN 20260813162230_project_customization.sql
alter table public.projects
add column if not exists image_url text;

drop policy if exists "owners update projects" on public.projects;
create policy "owners update projects"
on public.projects
for update
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'project-images',
  'project-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "owners upload project images" on storage.objects;
create policy "owners upload project images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'project-images'
  and exists (
    select 1
    from public.projects p
    where p.id::text = (storage.foldername(name))[1]
      and p.owner_id = (select auth.uid())
  )
);

drop policy if exists "owners update project images" on storage.objects;
create policy "owners update project images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'project-images'
  and exists (
    select 1
    from public.projects p
    where p.id::text = (storage.foldername(name))[1]
      and p.owner_id = (select auth.uid())
  )
)
with check (
  bucket_id = 'project-images'
  and exists (
    select 1
    from public.projects p
    where p.id::text = (storage.foldername(name))[1]
      and p.owner_id = (select auth.uid())
  )
);

drop policy if exists "owners delete project images" on storage.objects;
create policy "owners delete project images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'project-images'
  and exists (
    select 1
    from public.projects p
    where p.id::text = (storage.foldername(name))[1]
      and p.owner_id = (select auth.uid())
  )
);

-- END 20260813162230_project_customization.sql

-- BEGIN 20260813164246_ticket_intake_workflow.sql
alter table public.tasks
  add column if not exists external_source text,
  add column if not exists external_id text,
  add column if not exists external_url text;

alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks
  add constraint tasks_status_check
  check (status in ('backlog', 'unassigned', 'todo', 'in_progress', 'review', 'done'));

alter table public.tasks
  drop constraint if exists tasks_external_source_id_key;
alter table public.tasks
  add constraint tasks_external_source_id_key unique (external_source, external_id);

create table if not exists private.workspace_integrations (
  name text primary key,
  secret_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

revoke all on table private.workspace_integrations from public, anon, authenticated;

create or replace function public.ingest_workspace_ticket(
  p_secret text,
  p_project_id uuid,
  p_ticket jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_task_id uuid;
  v_existing_task_id uuid;
  v_folio text;
  v_external_id text;
  v_subject text;
  v_description text;
  v_priority text;
  v_due_date date;
  v_area text;
  v_admin_url text;
  v_label_id uuid;
begin
  if not exists (
    select 1
    from private.workspace_integrations integration
    where integration.name = 'ticket_webhook'
      and integration.secret_hash = encode(
        extensions.digest(coalesce(p_secret, ''), 'sha256'),
        'hex'
      )
  ) then
    raise exception 'Invalid ticket webhook secret' using errcode = '42501';
  end if;

  select project.owner_id
  into v_owner_id
  from public.projects project
  where project.id = p_project_id
    and project.archived = false;

  if v_owner_id is null then
    raise exception 'Ticket project not found' using errcode = 'P0002';
  end if;

  v_external_id := left(trim(coalesce(p_ticket ->> 'id', '')), 160);
  v_folio := left(trim(coalesce(p_ticket ->> 'folio', '')), 80);
  v_subject := left(trim(coalesce(p_ticket ->> 'subject', 'Sin asunto')), 180);
  v_area := left(trim(coalesce(p_ticket ->> 'area', 'Sin área')), 120);
  v_admin_url := left(trim(coalesce(p_ticket ->> 'adminUrl', '')), 1200);

  if v_external_id = '' or v_folio = '' then
    raise exception 'Ticket id and folio are required' using errcode = '22023';
  end if;

  v_priority := case lower(trim(coalesce(p_ticket ->> 'priority', '')))
    when 'urgente' then 'urgent'
    when 'alta' then 'high'
    when 'baja' then 'low'
    else 'medium'
  end;

  begin
    v_due_date := nullif(trim(coalesce(p_ticket ->> 'requiredDate', '')), '')::date;
  exception when others then
    v_due_date := null;
  end;

  v_description := left(concat_ws(E'\n',
    nullif('Cliente: ' || trim(coalesce(p_ticket ->> 'customerName', '')), 'Cliente: '),
    nullif('Empresa: ' || trim(coalesce(p_ticket ->> 'company', '')), 'Empresa: '),
    nullif('Área solicitada: ' || v_area, 'Área solicitada: '),
    nullif('Tipo: ' || trim(coalesce(p_ticket ->> 'requestType', '')), 'Tipo: '),
    nullif('Contacto: ' || trim(coalesce(p_ticket ->> 'email', '')), 'Contacto: '),
    nullif('Teléfono: ' || trim(coalesce(p_ticket ->> 'phone', '')), 'Teléfono: '),
    nullif('Fecha requerida: ' || trim(coalesce(p_ticket ->> 'requiredDate', '')), 'Fecha requerida: '),
    '',
    nullif(trim(coalesce(p_ticket ->> 'description', '')), ''),
    case
      when trim(coalesce(p_ticket ->> 'documentUrl', '')) <> ''
      then E'\nDocumentos: ' || trim(p_ticket ->> 'documentUrl')
      else null
    end
  ), 10000);

  select task.id
  into v_existing_task_id
  from public.tasks task
  where task.external_source = 'ticket_system'
    and task.external_id = v_external_id;

  insert into public.tasks (
    project_id,
    title,
    description,
    status,
    priority,
    due_date,
    position,
    created_by,
    external_source,
    external_id,
    external_url
  )
  values (
    p_project_id,
    left('[' || v_folio || '] ' || v_subject, 220),
    v_description,
    'unassigned',
    v_priority,
    v_due_date,
    coalesce((
      select max(task.position) + 1
      from public.tasks task
      where task.project_id = p_project_id
        and task.status = 'unassigned'
    ), 0),
    v_owner_id,
    'ticket_system',
    v_external_id,
    nullif(v_admin_url, '')
  )
  on conflict (external_source, external_id)
  do update set
    title = excluded.title,
    description = excluded.description,
    priority = excluded.priority,
    due_date = excluded.due_date,
    external_url = excluded.external_url,
    updated_at = now()
  returning id into v_task_id;

  insert into public.labels (project_id, name, color)
  values (p_project_id, 'Ticket', '#A61A1A')
  on conflict (project_id, name) do update set color = excluded.color
  returning id into v_label_id;

  insert into public.task_labels (task_id, label_id)
  values (v_task_id, v_label_id)
  on conflict (task_id, label_id) do nothing;

  if v_area <> '' and lower(v_area) <> 'sin área' then
    insert into public.labels (project_id, name, color)
    values (p_project_id, v_area, '#3566AC')
    on conflict (project_id, name) do update set color = public.labels.color
    returning id into v_label_id;

    insert into public.task_labels (task_id, label_id)
    values (v_task_id, v_label_id)
    on conflict (task_id, label_id) do nothing;
  end if;

  if v_existing_task_id is null then
    insert into public.notifications (
      user_id,
      actor_id,
      project_id,
      task_id,
      type,
      title,
      body
    )
    values (
      v_owner_id,
      null,
      p_project_id,
      v_task_id,
      'system',
      'Nuevo ticket sin asignar',
      v_folio || ' · ' || v_subject
    );
  end if;

  return v_task_id;
end;
$$;

revoke all on function public.ingest_workspace_ticket(text, uuid, jsonb) from public, authenticated;
grant execute on function public.ingest_workspace_ticket(text, uuid, jsonb) to anon, service_role;

create or replace function public.copy_task_to_project(
  p_task_id uuid,
  p_target_project_id uuid,
  p_status text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source public.tasks%rowtype;
  v_new_task_id uuid;
  v_target_status text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select task.*
  into v_source
  from public.tasks task
  where task.id = p_task_id;

  if v_source.id is null then
    raise exception 'Task not found or unavailable' using errcode = 'P0002';
  end if;

  if not (select private.is_current_user_project_member(p_target_project_id)) then
    raise exception 'Target project is unavailable' using errcode = '42501';
  end if;

  v_target_status := coalesce(p_status, v_source.status);
  if v_target_status not in ('backlog', 'unassigned', 'todo', 'in_progress', 'review', 'done') then
    raise exception 'Invalid task status' using errcode = '22023';
  end if;

  insert into public.project_members (project_id, user_id, role)
  select p_target_project_id, assignment.user_id, 'member'
  from public.task_assignees assignment
  where assignment.task_id = p_task_id
  on conflict (project_id, user_id) do nothing;

  insert into public.tasks (
    project_id,
    title,
    description,
    status,
    priority,
    due_date,
    position,
    created_by
  )
  values (
    p_target_project_id,
    v_source.title || ' · copia',
    v_source.description,
    v_target_status,
    v_source.priority,
    v_source.due_date,
    v_source.position,
    (select auth.uid())
  )
  returning id into v_new_task_id;

  insert into public.task_steps (task_id, title, completed, position)
  select v_new_task_id, step.title, false, step.position
  from public.task_steps step
  where step.task_id = p_task_id;

  insert into public.task_assignees (task_id, user_id)
  select v_new_task_id, assignment.user_id
  from public.task_assignees assignment
  where assignment.task_id = p_task_id
  on conflict (task_id, user_id) do nothing;

  if v_target_status <> 'unassigned' and not exists (
    select 1
    from public.task_assignees assignment
    where assignment.task_id = v_new_task_id
  ) then
    insert into public.task_assignees (task_id, user_id)
    values (v_new_task_id, (select auth.uid()));
  end if;

  insert into public.labels (project_id, name, color)
  select p_target_project_id, source_label.name, source_label.color
  from public.task_labels source_task_label
  join public.labels source_label on source_label.id = source_task_label.label_id
  where source_task_label.task_id = p_task_id
  on conflict (project_id, name) do nothing;

  insert into public.task_labels (task_id, label_id)
  select v_new_task_id, destination_label.id
  from public.task_labels source_task_label
  join public.labels source_label on source_label.id = source_task_label.label_id
  join public.labels destination_label
    on destination_label.project_id = p_target_project_id
   and destination_label.name = source_label.name
  where source_task_label.task_id = p_task_id
  on conflict (task_id, label_id) do nothing;

  return v_new_task_id;
end;
$$;

revoke all on function public.copy_task_to_project(uuid, uuid, text) from public, anon;
grant execute on function public.copy_task_to_project(uuid, uuid, text) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;
end;
$$;

-- END 20260813164246_ticket_intake_workflow.sql

-- BEGIN 20260813170208_collaboration_checkins_reports.sql
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

-- END 20260813170208_collaboration_checkins_reports.sql

-- BEGIN 20260813171708_collaboration_indexes.sql
create index if not exists idx_project_posts_author
  on public.project_posts(author_id);
create index if not exists idx_post_comments_author
  on public.post_comments(author_id);
create index if not exists idx_post_reactions_user
  on public.post_reactions(user_id);
create index if not exists idx_task_reactions_user
  on public.task_reactions(user_id);
create index if not exists idx_checkin_schedules_creator
  on public.checkin_schedules(created_by);
create index if not exists idx_checkin_responses_user
  on public.checkin_responses(user_id);

-- END 20260813171708_collaboration_indexes.sql

-- BEGIN 20260813172716_owasp_security_hardening.sql
-- OWASP 2025 hardening: least privilege, immutable ownership fields,
-- notification anti-abuse controls, and bounded untrusted content.

drop policy if exists "areas are readable" on public.areas;
create policy "signed in users read areas"
on public.areas for select to authenticated
using (true);

revoke update on table public.profiles from authenticated;
grant update (full_name, avatar_url, area_id)
on table public.profiles to authenticated;

drop policy if exists "project members add memberships" on public.project_members;
create policy "project members add regular memberships"
on public.project_members for insert to authenticated
with check (
  role = 'member'
  and private.is_current_user_project_member(project_id)
);

drop policy if exists "project members manage tasks" on public.tasks;
create policy "project members read tasks"
on public.tasks for select to authenticated
using (private.is_current_user_project_member(project_id));

create policy "project members create own tasks"
on public.tasks for insert to authenticated
with check (
  private.is_current_user_project_member(project_id)
  and created_by = (select auth.uid())
  and external_source is null
  and external_id is null
  and external_url is null
);

create policy "project members update tasks"
on public.tasks for update to authenticated
using (private.is_current_user_project_member(project_id))
with check (private.is_current_user_project_member(project_id));

create policy "project members delete tasks"
on public.tasks for delete to authenticated
using (private.is_current_user_project_member(project_id));

revoke insert, update on table public.tasks from authenticated;
grant insert (
  project_id, title, description, status, priority, due_date, position, created_by
) on table public.tasks to authenticated;
grant update (
  title, description, status, priority, due_date, position
) on table public.tasks to authenticated;

create or replace function public.move_task_to_project(
  p_task_id uuid,
  p_target_project_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_project_id uuid;
  v_label_names text[];
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select task.project_id
  into v_source_project_id
  from public.tasks task
  where task.id = p_task_id;

  if v_source_project_id is null then
    raise exception 'Task not found or unavailable' using errcode = 'P0002';
  end if;

  if not private.is_current_user_project_member(v_source_project_id)
     or not private.is_current_user_project_member(p_target_project_id) then
    raise exception 'Project is unavailable' using errcode = '42501';
  end if;

  if v_source_project_id = p_target_project_id then
    return;
  end if;

  select coalesce(array_agg(label.name), array[]::text[])
  into v_label_names
  from public.task_labels task_label
  join public.labels label on label.id = task_label.label_id
  where task_label.task_id = p_task_id;

  insert into public.project_members (project_id, user_id, role)
  select p_target_project_id, assignment.user_id, 'member'
  from public.task_assignees assignment
  where assignment.task_id = p_task_id
  on conflict (project_id, user_id) do nothing;

  delete from public.task_labels where task_id = p_task_id;

  update public.tasks
  set project_id = p_target_project_id
  where id = p_task_id;

  insert into public.labels (project_id, name, color)
  select p_target_project_id, source_label.name, source_label.color
  from public.labels source_label
  where source_label.project_id = v_source_project_id
    and source_label.name = any(v_label_names)
  on conflict (project_id, name) do nothing;

  insert into public.task_labels (task_id, label_id)
  select p_task_id, destination_label.id
  from public.labels destination_label
  where destination_label.project_id = p_target_project_id
    and destination_label.name = any(v_label_names)
  on conflict (task_id, label_id) do nothing;
end;
$$;

revoke all on function public.move_task_to_project(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.move_task_to_project(uuid, uuid)
to authenticated;

drop policy if exists "members manage assignees" on public.task_assignees;
create policy "members manage valid task assignees"
on public.task_assignees for all to authenticated
using (private.current_user_can_access_task(task_id))
with check (
  exists (
    select 1
    from public.tasks task
    join public.projects project on project.id = task.project_id
    where task.id = task_assignees.task_id
      and private.is_current_user_project_member(project.id)
      and (
        project.owner_id = task_assignees.user_id
        or exists (
          select 1
          from public.project_members member
          where member.project_id = project.id
            and member.user_id = task_assignees.user_id
        )
      )
  )
);

drop policy if exists "members manage task labels" on public.task_labels;
create policy "members manage same-project task labels"
on public.task_labels for all to authenticated
using (private.current_user_can_access_task(task_id))
with check (
  exists (
    select 1
    from public.tasks task
    join public.labels label on label.id = task_labels.label_id
    where task.id = task_labels.task_id
      and task.project_id = label.project_id
      and private.is_current_user_project_member(task.project_id)
  )
);

drop policy if exists "members manage comments" on public.comments;
create policy "project members read comments"
on public.comments for select to authenticated
using (private.current_user_can_access_task(task_id));

create policy "project members create own comments"
on public.comments for insert to authenticated
with check (
  author_id = (select auth.uid())
  and private.current_user_can_access_task(task_id)
);

create policy "authors update own comments"
on public.comments for update to authenticated
using (author_id = (select auth.uid()))
with check (
  author_id = (select auth.uid())
  and private.current_user_can_access_task(task_id)
);

create policy "authors or owners delete comments"
on public.comments for delete to authenticated
using (
  author_id = (select auth.uid())
  or exists (
    select 1
    from public.tasks task
    where task.id = comments.task_id
      and private.is_current_user_project_owner(task.project_id)
  )
);

drop policy if exists "members create notifications" on public.notifications;
create policy "members create scoped notifications"
on public.notifications for insert to authenticated
with check (
  actor_id = (select auth.uid())
  and private.is_current_user_project_member(notifications.project_id)
  and exists (
    select 1
    from public.projects project
    where project.id = notifications.project_id
      and (
        project.owner_id = notifications.user_id
        or exists (
          select 1
          from public.project_members member
          where member.project_id = project.id
            and member.user_id = notifications.user_id
        )
      )
  )
  and (
    notifications.task_id is null
    or exists (
      select 1
      from public.tasks task
      where task.id = notifications.task_id
        and task.project_id = notifications.project_id
    )
  )
);

create policy "actors read recently created notifications"
on public.notifications for select to authenticated
using (
  actor_id = (select auth.uid())
  and created_at >= now() - interval '1 day'
);

revoke insert, update on table public.notifications from authenticated;
grant insert (
  user_id, actor_id, project_id, task_id, type, title, body
) on table public.notifications to authenticated;
grant update (read_at) on table public.notifications to authenticated;

drop policy if exists "creators manage templates" on public.templates;
create policy "creators update templates"
on public.templates for update to authenticated
using (creator_id = (select auth.uid()))
with check (creator_id = (select auth.uid()));

revoke update on table public.project_posts from authenticated;
grant update (kind, title, body, pinned, updated_at)
on table public.project_posts to authenticated;

revoke update on table public.post_comments from authenticated;
grant update (body) on table public.post_comments to authenticated;

revoke update on table public.checkin_schedules from authenticated;
grant update (
  title, prompt, cadence, scheduled_day, reminder_time, active,
  last_prompt_on, updated_at
) on table public.checkin_schedules to authenticated;

revoke update on table public.task_steps from authenticated;
grant update (title, completed, position)
on table public.task_steps to authenticated;

alter table public.areas
  add constraint areas_name_length_check
  check (char_length(trim(name)) between 1 and 120) not valid;
alter table public.profiles
  add constraint profiles_text_length_check
  check (
    char_length(full_name) <= 180
    and char_length(email) <= 320
    and coalesce(char_length(avatar_url), 0) <= 2048
  ) not valid;
alter table public.projects
  add constraint projects_text_length_check
  check (
    char_length(name) between 1 and 200
    and char_length(description) <= 20000
    and coalesce(char_length(image_url), 0) <= 2048
  ) not valid;
alter table public.tasks
  add constraint tasks_text_length_check
  check (
    char_length(title) between 1 and 500
    and char_length(description) <= 50000
    and coalesce(char_length(external_source), 0) <= 80
    and coalesce(char_length(external_id), 0) <= 160
    and coalesce(char_length(external_url), 0) <= 2048
  ) not valid;
alter table public.task_steps
  add constraint task_steps_title_length_check
  check (char_length(title) between 1 and 1000) not valid;
alter table public.labels
  add constraint labels_name_length_check
  check (char_length(name) between 1 and 120) not valid;
alter table public.templates
  add constraint templates_text_length_check
  check (
    char_length(name) between 1 and 200
    and char_length(description) <= 10000
  ) not valid;
alter table public.template_steps
  add constraint template_steps_title_length_check
  check (char_length(title) between 1 and 1000) not valid;
alter table public.comments
  add constraint comments_body_length_check
  check (char_length(trim(body)) between 1 and 10000) not valid;
alter table public.notifications
  add constraint notifications_text_length_check
  check (
    char_length(title) between 1 and 500
    and char_length(body) <= 5000
  ) not valid;
alter table public.activity_events
  add constraint activity_events_detail_length_check
  check (char_length(detail) <= 2000) not valid;
alter table public.project_posts
  add constraint project_posts_text_length_check
  check (
    char_length(title) <= 500
    and char_length(trim(body)) between 1 and 50000
  ) not valid;
alter table public.post_comments
  add constraint post_comments_body_length_check
  check (char_length(trim(body)) between 1 and 10000) not valid;
alter table public.checkin_schedules
  add constraint checkin_schedules_text_length_check
  check (
    char_length(title) between 1 and 300
    and char_length(prompt) between 1 and 5000
  ) not valid;
alter table public.checkin_responses
  add constraint checkin_responses_body_length_check
  check (char_length(trim(body)) between 1 and 10000) not valid;

-- END 20260813172716_owasp_security_hardening.sql

-- BEGIN 20260813173738_owasp_private_media_and_rpc_isolation.sql
-- Keep internal media behind authenticated, row-scoped signed URLs.
update public.profiles
set avatar_url = split_part(
  avatar_url,
  '/storage/v1/object/public/avatars/',
  2
)
where avatar_url like '%/storage/v1/object/public/avatars/%';

update public.projects
set image_url = split_part(
  image_url,
  '/storage/v1/object/public/project-images/',
  2
)
where image_url like '%/storage/v1/object/public/project-images/%';

update storage.buckets
set public = false
where id in ('avatars', 'project-images');

drop policy if exists "signed in users read avatars" on storage.objects;
create policy "signed in users read avatars"
on storage.objects for select to authenticated
using (bucket_id = 'avatars');

drop policy if exists "project members read project images" on storage.objects;
create policy "project members read project images"
on storage.objects for select to authenticated
using (
  bucket_id = 'project-images'
  and private.is_current_user_project_member(
    case
      when (storage.foldername(name))[1]
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then ((storage.foldername(name))[1])::uuid
      else null
    end
  )
);

-- Keep foreign keys and ownership fields immutable from browser clients.
revoke update on table public.project_members from authenticated;
grant update (role) on table public.project_members to authenticated;

revoke update on table public.comments from authenticated;
grant update (body) on table public.comments to authenticated;

-- Enforce notification abuse controls in the database, across all app instances.
create index if not exists idx_notifications_actor_created
on public.notifications(actor_id, created_at desc);

create or replace function private.enforce_notification_insert_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    if new.actor_id is distinct from (select auth.uid()) then
      raise exception 'Invalid notification actor' using errcode = '42501';
    end if;

    if (
      select count(*)
      from public.notifications notification
      where notification.actor_id = (select auth.uid())
        and notification.created_at >= now() - interval '10 minutes'
    ) >= 60 then
      raise exception 'Notification rate limit exceeded' using errcode = '54000';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_notification_insert_rate()
from public, anon, authenticated;

drop trigger if exists enforce_notification_insert_rate
on public.notifications;
create trigger enforce_notification_insert_rate
before insert on public.notifications
for each row execute function private.enforce_notification_insert_rate();

-- This workflow remains atomic but no longer bypasses RLS.
alter function public.move_task_to_project(uuid, uuid) security invoker;
grant update (project_id) on table public.tasks to authenticated;

-- External integrations can only run through the isolated Edge handlers.
revoke all on function public.ingest_workspace_ticket(text, uuid, jsonb)
from public, anon, authenticated;
grant execute on function public.ingest_workspace_ticket(text, uuid, jsonb)
to service_role;

revoke all on function public.run_workspace_daily_automation(text)
from public, anon, authenticated;
grant execute on function public.run_workspace_daily_automation(text)
to service_role;

-- Limit damage even if an integration secret is ever compromised.
create or replace function private.enforce_ticket_insert_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.external_source = 'ticket_system' and (
    select count(*)
    from public.tasks task
    where task.external_source = 'ticket_system'
      and task.created_at >= now() - interval '10 minutes'
  ) >= 120 then
    raise exception 'Ticket intake rate limit exceeded' using errcode = '54000';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_ticket_insert_rate()
from public, anon, authenticated;

drop trigger if exists enforce_ticket_insert_rate on public.tasks;
create trigger enforce_ticket_insert_rate
before insert on public.tasks
for each row execute function private.enforce_ticket_insert_rate();

-- END 20260813173738_owasp_private_media_and_rpc_isolation.sql

-- BEGIN 20260813174643_restrict_workspace_signup_domain.sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_area uuid;
  requested_area text;
  requested_name text;
begin
  -- Independent workspace: registration accepts personal and corporate email.

  requested_name := left(trim(coalesce(
    new.raw_user_meta_data ->> 'full_name',
    split_part(coalesce(new.email, ''), '@', 1)
  )), 180);
  requested_area := nullif(left(trim(coalesce(
    new.raw_user_meta_data ->> 'area_name',
    new.raw_user_meta_data ->> 'area_id',
    ''
  )), 120), '');

  if requested_area is not null then
    select area.id into selected_area
    from public.areas area
    where area.id::text = requested_area
       or lower(area.name) = lower(requested_area)
    limit 1;

    if selected_area is null then
      insert into public.areas (name, color)
      values (requested_area, '#3566AC')
      on conflict (name) do update set name = excluded.name
      returning id into selected_area;
    end if;
  end if;

  insert into public.profiles (id, email, full_name, area_id)
  values (
    new.id,
    left(coalesce(new.email, ''), 320),
    requested_name,
    selected_area
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user()
from public, anon, authenticated;

-- END 20260813174643_restrict_workspace_signup_domain.sql

-- BEGIN 20260813192320_comment_reactions.sql
create table public.comment_reactions (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '🎉', '👀')),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index idx_comment_reactions_user
on public.comment_reactions(user_id);

alter table public.comment_reactions enable row level security;

create policy "members read comment reactions"
on public.comment_reactions for select to authenticated
using (
  exists (
    select 1
    from public.comments comment
    where comment.id = comment_reactions.comment_id
      and private.current_user_can_access_task(comment.task_id)
  )
);

create policy "members add own comment reactions"
on public.comment_reactions for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.comments comment
    where comment.id = comment_reactions.comment_id
      and private.current_user_can_access_task(comment.task_id)
  )
);

create policy "members update own comment reactions"
on public.comment_reactions for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.comments comment
    where comment.id = comment_reactions.comment_id
      and private.current_user_can_access_task(comment.task_id)
  )
);

create policy "members delete own comment reactions"
on public.comment_reactions for delete to authenticated
using (user_id = (select auth.uid()));

grant select, insert, update, delete
on table public.comment_reactions to authenticated;

-- END 20260813192320_comment_reactions.sql

-- BEGIN 20260813203000_protect_ticket_project.sql
create or replace function private.protect_ticket_project()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_catalog.lower(pg_catalog.btrim(old.name)) = 'mesa de tickets' then
    if tg_op = 'DELETE' then
      raise exception 'Mesa de Tickets is a protected workspace project'
        using errcode = '42501';
    end if;

    if new.name is distinct from old.name
      or pg_catalog.coalesce(new.archived, false) = true then
      raise exception 'Mesa de Tickets cannot be renamed or archived'
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.protect_ticket_project()
from public, anon, authenticated;

drop trigger if exists protect_ticket_project on public.projects;
create trigger protect_ticket_project
before update or delete on public.projects
for each row execute function private.protect_ticket_project();

-- END 20260813203000_protect_ticket_project.sql

-- BEGIN 20260813221000_add_weekly_report_profile_data.sql
-- Store the only weekly-report field that is not already part of a profile.
-- Name, email and department continue to come from profiles + areas.

alter table public.profiles
add column if not exists phone text;

alter table public.profiles
drop constraint if exists profiles_phone_length;

alter table public.profiles
add constraint profiles_phone_length
check (phone is null or char_length(phone) <= 50);

revoke update on table public.profiles from authenticated;
grant update (full_name, avatar_url, area_id, phone)
on table public.profiles to authenticated;

-- END 20260813221000_add_weekly_report_profile_data.sql

-- BEGIN 20260817090000_global_workspace_messages.sql
-- Messages are a Workspace-wide surface rather than belonging to one project.
alter table public.project_posts
  alter column project_id drop not null;

update public.project_posts
set project_id = null
where project_id is not null;

create index if not exists idx_project_posts_workspace_created
  on public.project_posts(pinned desc, created_at desc)
  where project_id is null;

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
      and (
        post.project_id is null
        or private.is_current_user_project_member(post.project_id)
      )
  );
$$;

revoke all on function private.current_user_can_access_post(uuid)
from public, anon;
grant execute on function private.current_user_can_access_post(uuid)
to authenticated;

drop policy if exists "members read project posts" on public.project_posts;
create policy "members read project posts"
on public.project_posts for select to authenticated
using (
  project_id is null
  or private.is_current_user_project_member(project_id)
);

drop policy if exists "members create project posts" on public.project_posts;
create policy "members create project posts"
on public.project_posts for insert to authenticated
with check (
  author_id = (select auth.uid())
  and (
    project_id is null
    or private.is_current_user_project_member(project_id)
  )
);

drop policy if exists "authors update project posts" on public.project_posts;
create policy "authors update project posts"
on public.project_posts for update to authenticated
using (
  author_id = (select auth.uid())
  or (
    project_id is not null
    and private.is_current_user_project_owner(project_id)
  )
)
with check (
  author_id = (select auth.uid())
  and (
    project_id is null
    or private.is_current_user_project_member(project_id)
  )
);

drop policy if exists "authors delete project posts" on public.project_posts;
create policy "authors delete project posts"
on public.project_posts for delete to authenticated
using (
  author_id = (select auth.uid())
  or (
    project_id is not null
    and private.is_current_user_project_owner(project_id)
  )
);

drop policy if exists "members create scoped notifications"
on public.notifications;
create policy "members create scoped notifications"
on public.notifications for insert to authenticated
with check (
  actor_id = (select auth.uid())
  and (
    (
      notifications.project_id is null
      and notifications.task_id is null
      and notifications.type in ('announcement', 'reaction', 'subscription')
      and exists (
        select 1
        from public.profiles recipient
        where recipient.id = notifications.user_id
      )
    )
    or (
      private.is_current_user_project_member(notifications.project_id)
      and exists (
        select 1
        from public.projects project
        where project.id = notifications.project_id
          and (
            project.owner_id = notifications.user_id
            or exists (
              select 1
              from public.project_members member
              where member.project_id = project.id
                and member.user_id = notifications.user_id
            )
          )
      )
      and (
        notifications.task_id is null
        or exists (
          select 1
          from public.tasks task
          where task.id = notifications.task_id
            and task.project_id = notifications.project_id
        )
      )
    )
  )
);

-- END 20260817090000_global_workspace_messages.sql

-- BEGIN 20260817150000_project_meeting_minutes.sql
create table if not exists public.project_minutes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  title text not null,
  meeting_date date not null default current_date,
  attendees text not null default '',
  notes text not null default '',
  agreements text not null default '',
  next_steps text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_minutes_title_length
    check (char_length(trim(title)) between 1 and 200),
  constraint project_minutes_attendees_length
    check (char_length(attendees) <= 3000),
  constraint project_minutes_notes_length
    check (char_length(notes) <= 20000),
  constraint project_minutes_agreements_length
    check (char_length(agreements) <= 12000),
  constraint project_minutes_next_steps_length
    check (char_length(next_steps) <= 12000),
  constraint project_minutes_has_content
    check (
      char_length(trim(notes)) > 0
      or char_length(trim(agreements)) > 0
      or char_length(trim(next_steps)) > 0
    )
);

create index if not exists idx_project_minutes_project_date
  on public.project_minutes(project_id, meeting_date desc, created_at desc);

alter table public.project_minutes enable row level security;

drop policy if exists "members read project minutes" on public.project_minutes;
create policy "members read project minutes"
on public.project_minutes for select to authenticated
using (private.is_current_user_project_member(project_id));

drop policy if exists "members create project minutes" on public.project_minutes;
create policy "members create project minutes"
on public.project_minutes for insert to authenticated
with check (
  author_id = (select auth.uid())
  and private.is_current_user_project_member(project_id)
);

drop policy if exists "authors or owners update project minutes" on public.project_minutes;
create policy "authors or owners update project minutes"
on public.project_minutes for update to authenticated
using (
  author_id = (select auth.uid())
  or private.is_current_user_project_owner(project_id)
)
with check (private.is_current_user_project_member(project_id));

drop policy if exists "authors or owners delete project minutes" on public.project_minutes;
create policy "authors or owners delete project minutes"
on public.project_minutes for delete to authenticated
using (
  author_id = (select auth.uid())
  or private.is_current_user_project_owner(project_id)
);

revoke all on table public.project_minutes from anon;
grant select, insert, delete on table public.project_minutes to authenticated;
grant update (
  title,
  meeting_date,
  attendees,
  notes,
  agreements,
  next_steps,
  updated_at
) on table public.project_minutes to authenticated;

-- END 20260817150000_project_meeting_minutes.sql

-- BEGIN 20260817170000_collaborative_minutes_pdf_attachments.sql
drop policy if exists "authors or owners update project minutes"
on public.project_minutes;
create policy "members update project minutes"
on public.project_minutes for update to authenticated
using (private.is_current_user_project_member(project_id))
with check (private.is_current_user_project_member(project_id));

drop policy if exists "authors or owners delete project minutes"
on public.project_minutes;
create policy "members delete project minutes"
on public.project_minutes for delete to authenticated
using (private.is_current_user_project_member(project_id));

create table if not exists public.project_minute_attachments (
  id uuid primary key default gen_random_uuid(),
  minute_id uuid not null references public.project_minutes(id) on delete cascade,
  uploaded_by uuid references public.profiles(id) on delete set null,
  drive_file_id text not null unique,
  file_name text not null,
  mime_type text not null default 'application/pdf',
  size_bytes bigint not null,
  created_at timestamptz not null default now(),
  constraint project_minute_attachments_drive_id_format
    check (drive_file_id ~ '^[A-Za-z0-9_-]{10,200}$'),
  constraint project_minute_attachments_file_name_length
    check (char_length(trim(file_name)) between 1 and 180),
  constraint project_minute_attachments_pdf_only
    check (mime_type = 'application/pdf'),
  constraint project_minute_attachments_size
    check (size_bytes > 0 and size_bytes <= 52428800)
);

create index if not exists idx_project_minute_attachments_minute
  on public.project_minute_attachments(minute_id, created_at);

alter table public.project_minute_attachments enable row level security;

create or replace function private.current_user_can_access_minute(
  target_minute_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.project_minutes minute
    where minute.id = target_minute_id
      and private.is_current_user_project_member(minute.project_id)
  );
$$;

revoke all on function private.current_user_can_access_minute(uuid)
from public, anon;
grant execute on function private.current_user_can_access_minute(uuid)
to authenticated;

drop policy if exists "members read minute attachments"
on public.project_minute_attachments;
create policy "members read minute attachments"
on public.project_minute_attachments for select to authenticated
using (private.current_user_can_access_minute(minute_id));

drop policy if exists "members add minute attachments"
on public.project_minute_attachments;
create policy "members add minute attachments"
on public.project_minute_attachments for insert to authenticated
with check (
  uploaded_by = (select auth.uid())
  and private.current_user_can_access_minute(minute_id)
);

drop policy if exists "members delete minute attachments"
on public.project_minute_attachments;
create policy "members delete minute attachments"
on public.project_minute_attachments for delete to authenticated
using (private.current_user_can_access_minute(minute_id));

revoke all on table public.project_minute_attachments from anon;
grant select, insert, delete on table public.project_minute_attachments
to authenticated;

-- END 20260817170000_collaborative_minutes_pdf_attachments.sql

-- BEGIN 20260820200938_task_comment_image_attachments.sql
create table if not exists public.comment_attachments (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  uploaded_by uuid references public.profiles(id) on delete set null,
  drive_file_id text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  created_at timestamptz not null default now(),
  constraint comment_attachments_file_name_length
    check (char_length(file_name) between 1 and 180),
  constraint comment_attachments_drive_file_id_format
    check (drive_file_id ~ '^[A-Za-z0-9_-]{10,200}$'),
  constraint comment_attachments_image_type
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint comment_attachments_size
    check (size_bytes > 0 and size_bytes <= 52428800)
);

create index if not exists comment_attachments_comment_id_created_at_idx
  on public.comment_attachments(comment_id, created_at);

alter table public.comment_attachments enable row level security;

revoke all on table public.comment_attachments from public, anon;
grant select, insert, delete on table public.comment_attachments to authenticated;

drop policy if exists "Project members can read comment attachments"
  on public.comment_attachments;
create policy "Project members can read comment attachments"
  on public.comment_attachments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.comments c
      join public.tasks t on t.id = c.task_id
      join public.projects p on p.id = t.project_id
      where c.id = comment_attachments.comment_id
        and (
          p.owner_id = (select auth.uid())
          or exists (
            select 1 from public.project_members pm
            where pm.project_id = p.id
              and pm.user_id = (select auth.uid())
          )
        )
    )
  );

drop policy if exists "Authors can attach images to their comments"
  on public.comment_attachments;
create policy "Authors can attach images to their comments"
  on public.comment_attachments
  for insert
  to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and exists (
      select 1
      from public.comments c
      join public.tasks t on t.id = c.task_id
      join public.projects p on p.id = t.project_id
      where c.id = comment_attachments.comment_id
        and c.author_id = (select auth.uid())
        and (
          p.owner_id = (select auth.uid())
          or exists (
            select 1 from public.project_members pm
            where pm.project_id = p.id
              and pm.user_id = (select auth.uid())
          )
        )
    )
  );

drop policy if exists "Authors and project owners can delete comment attachments"
  on public.comment_attachments;
create policy "Authors and project owners can delete comment attachments"
  on public.comment_attachments
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.comments c
      join public.tasks t on t.id = c.task_id
      join public.projects p on p.id = t.project_id
      where c.id = comment_attachments.comment_id
        and (
          p.owner_id = (select auth.uid())
          or exists (
            select 1 from public.project_members pm
            where pm.project_id = p.id
              and pm.user_id = (select auth.uid())
          )
        )
        and (
          c.author_id = (select auth.uid())
          or p.owner_id = (select auth.uid())
        )
    )
  );

-- END 20260820200938_task_comment_image_attachments.sql

-- BEGIN 20260820202036_index_comment_attachment_uploader.sql
create index if not exists comment_attachments_uploaded_by_idx
  on public.comment_attachments(uploaded_by);

-- END 20260820202036_index_comment_attachment_uploader.sql

-- BEGIN 20260821153817_notification_email_delivery_guard.sql
create table public.notification_email_deliveries (
  notification_id uuid primary key
    references public.notifications(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'sending'
    check (status in ('sending', 'sent', 'failed')),
  attempt_count integer not null default 1
    check (attempt_count between 1 and 20),
  attempted_at timestamptz not null default now(),
  sent_at timestamptz,
  message_id text,
  error_code text,
  constraint notification_email_message_id_length
    check (message_id is null or char_length(message_id) between 1 and 255),
  constraint notification_email_error_code_length
    check (error_code is null or char_length(error_code) between 1 and 80)
);

alter table public.notification_email_deliveries enable row level security;
revoke all on table public.notification_email_deliveries
from public, anon, authenticated;

create index idx_notification_email_deliveries_actor_attempted
on public.notification_email_deliveries(actor_id, attempted_at desc);

create or replace function public.claim_notification_email_delivery(
  p_notification_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_status text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select notification.actor_id
  into v_actor_id
  from public.notifications notification
  where notification.id = p_notification_id
    and notification.actor_id = (select auth.uid())
    and notification.type in ('assignment', 'mention')
    and notification.created_at >= now() - interval '15 minutes';

  if v_actor_id is null then
    raise exception 'Notification is unavailable' using errcode = '42501';
  end if;

  insert into public.notification_email_deliveries (
    notification_id,
    actor_id,
    status,
    attempt_count,
    attempted_at
  ) values (
    p_notification_id,
    v_actor_id,
    'sending',
    1,
    now()
  )
  on conflict (notification_id) do update
  set
    status = 'sending',
    attempt_count = public.notification_email_deliveries.attempt_count + 1,
    attempted_at = now(),
    error_code = null
  where public.notification_email_deliveries.status = 'failed'
    and public.notification_email_deliveries.attempt_count < 20
  returning status into v_status;

  if v_status = 'sending' then
    return 'claimed';
  end if;

  select delivery.status
  into v_status
  from public.notification_email_deliveries delivery
  where delivery.notification_id = p_notification_id;

  if v_status = 'sent' then
    return 'sent';
  end if;
  return 'busy';
end;
$$;

create or replace function public.complete_notification_email_delivery(
  p_notification_id uuid,
  p_message_id text,
  p_success boolean,
  p_error_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_success and (p_message_id is null or char_length(p_message_id) > 255) then
    raise exception 'Message identifier is required' using errcode = '22023';
  end if;
  if not p_success and (
    p_error_code is null or char_length(p_error_code) > 80
  ) then
    raise exception 'Error code is required' using errcode = '22023';
  end if;

  update public.notification_email_deliveries delivery
  set
    status = case when p_success then 'sent' else 'failed' end,
    sent_at = case when p_success then now() else null end,
    message_id = case when p_success then p_message_id else null end,
    error_code = case when p_success then null else p_error_code end
  where delivery.notification_id = p_notification_id
    and delivery.actor_id = (select auth.uid())
    and delivery.status = 'sending';

  if not found then
    raise exception 'Delivery is unavailable' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.claim_notification_email_delivery(uuid)
from public, anon, authenticated;
revoke all on function public.complete_notification_email_delivery(
  uuid, text, boolean, text
)
from public, anon, authenticated;

grant execute on function public.claim_notification_email_delivery(uuid)
to authenticated;
grant execute on function public.complete_notification_email_delivery(
  uuid, text, boolean, text
)
to authenticated;

-- END 20260821153817_notification_email_delivery_guard.sql
