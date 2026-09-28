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
