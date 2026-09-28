create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_area uuid;
  requested_area text;
  requested_name text;
begin
  -- Independent workspace: registration accepts personal and corporate email.

  requested_name := left(trim(coalesce(
    new.raw_user_meta_data ->> 'full_name',
    split_part(coalesce(new.email, ''), '@', 1)
  )), 180);
  requested_area := nullif(left(trim(coalesce(
    new.raw_user_meta_data ->> 'area_name',
    new.raw_user_meta_data ->> 'area_id',
    ''
  )), 120), '');

  if requested_area is not null then
    select area.id into selected_area
    from public.areas area
    where area.id::text = requested_area
       or lower(area.name) = lower(requested_area)
    limit 1;

    if selected_area is null then
      insert into public.areas (name, color)
      values (requested_area, '#3566AC')
      on conflict (name) do update set name = excluded.name
      returning id into selected_area;
    end if;
  end if;

  insert into public.profiles (id, email, full_name, area_id)
  values (
    new.id,
    left(coalesce(new.email, ''), 320),
    requested_name,
    selected_area
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user()
from public, anon, authenticated;
