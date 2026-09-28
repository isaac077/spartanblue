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
