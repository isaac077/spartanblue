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
