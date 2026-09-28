create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  selected_area uuid;
begin
  select id into selected_area
  from public.areas
  where id::text = coalesce(new.raw_user_meta_data ->> 'area_id', '')
     or lower(name) = lower(coalesce(new.raw_user_meta_data ->> 'area_id', ''))
  limit 1;

  insert into public.profiles (id, email, full_name, area_id)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    selected_area
  );
  return new;
end;
$$;
