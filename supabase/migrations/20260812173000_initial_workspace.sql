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
