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
