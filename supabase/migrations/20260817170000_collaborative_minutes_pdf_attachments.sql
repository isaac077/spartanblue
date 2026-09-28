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
