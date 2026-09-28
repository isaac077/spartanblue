-- Store the only weekly-report field that is not already part of a profile.
-- Name, email and department continue to come from profiles + areas.

alter table public.profiles
add column if not exists phone text;

alter table public.profiles
drop constraint if exists profiles_phone_length;

alter table public.profiles
add constraint profiles_phone_length
check (phone is null or char_length(phone) <= 50);

revoke update on table public.profiles from authenticated;
grant update (full_name, avatar_url, area_id, phone)
on table public.profiles to authenticated;
