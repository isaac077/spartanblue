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
