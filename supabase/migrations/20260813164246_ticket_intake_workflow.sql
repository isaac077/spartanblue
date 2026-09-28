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
