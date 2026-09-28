create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_area uuid;
  requested_area text;
begin
  requested_area := nullif(trim(coalesce(
    new.raw_user_meta_data ->> 'area_name',
    new.raw_user_meta_data ->> 'area_id',
    ''
  )), '');

  if requested_area is not null then
    select id into selected_area
    from public.areas
    where id::text = requested_area
       or lower(name) = lower(requested_area)
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
    coalesce(new.email, ''),
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    selected_area
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
