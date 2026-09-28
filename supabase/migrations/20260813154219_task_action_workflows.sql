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
