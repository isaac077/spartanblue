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
