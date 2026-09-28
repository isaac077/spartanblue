create table public.notification_email_deliveries (
  notification_id uuid primary key
    references public.notifications(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'sending'
    check (status in ('sending', 'sent', 'failed')),
  attempt_count integer not null default 1
    check (attempt_count between 1 and 20),
  attempted_at timestamptz not null default now(),
  sent_at timestamptz,
  message_id text,
  error_code text,
  constraint notification_email_message_id_length
    check (message_id is null or char_length(message_id) between 1 and 255),
  constraint notification_email_error_code_length
    check (error_code is null or char_length(error_code) between 1 and 80)
);

alter table public.notification_email_deliveries enable row level security;
revoke all on table public.notification_email_deliveries
from public, anon, authenticated;

create index idx_notification_email_deliveries_actor_attempted
on public.notification_email_deliveries(actor_id, attempted_at desc);

create or replace function public.claim_notification_email_delivery(
  p_notification_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_status text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select notification.actor_id
  into v_actor_id
  from public.notifications notification
  where notification.id = p_notification_id
    and notification.actor_id = (select auth.uid())
    and notification.type in ('assignment', 'mention')
    and notification.created_at >= now() - interval '15 minutes';

  if v_actor_id is null then
    raise exception 'Notification is unavailable' using errcode = '42501';
  end if;

  insert into public.notification_email_deliveries (
    notification_id,
    actor_id,
    status,
    attempt_count,
    attempted_at
  ) values (
    p_notification_id,
    v_actor_id,
    'sending',
    1,
    now()
  )
  on conflict (notification_id) do update
  set
    status = 'sending',
    attempt_count = public.notification_email_deliveries.attempt_count + 1,
    attempted_at = now(),
    error_code = null
  where public.notification_email_deliveries.status = 'failed'
    and public.notification_email_deliveries.attempt_count < 20
  returning status into v_status;

  if v_status = 'sending' then
    return 'claimed';
  end if;

  select delivery.status
  into v_status
  from public.notification_email_deliveries delivery
  where delivery.notification_id = p_notification_id;

  if v_status = 'sent' then
    return 'sent';
  end if;
  return 'busy';
end;
$$;

create or replace function public.complete_notification_email_delivery(
  p_notification_id uuid,
  p_message_id text,
  p_success boolean,
  p_error_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_success and (p_message_id is null or char_length(p_message_id) > 255) then
    raise exception 'Message identifier is required' using errcode = '22023';
  end if;
  if not p_success and (
    p_error_code is null or char_length(p_error_code) > 80
  ) then
    raise exception 'Error code is required' using errcode = '22023';
  end if;

  update public.notification_email_deliveries delivery
  set
    status = case when p_success then 'sent' else 'failed' end,
    sent_at = case when p_success then now() else null end,
    message_id = case when p_success then p_message_id else null end,
    error_code = case when p_success then null else p_error_code end
  where delivery.notification_id = p_notification_id
    and delivery.actor_id = (select auth.uid())
    and delivery.status = 'sending';

  if not found then
    raise exception 'Delivery is unavailable' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.claim_notification_email_delivery(uuid)
from public, anon, authenticated;
revoke all on function public.complete_notification_email_delivery(
  uuid, text, boolean, text
)
from public, anon, authenticated;

grant execute on function public.claim_notification_email_delivery(uuid)
to authenticated;
grant execute on function public.complete_notification_email_delivery(
  uuid, text, boolean, text
)
to authenticated;
