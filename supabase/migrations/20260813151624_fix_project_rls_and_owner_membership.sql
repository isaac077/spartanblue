create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.is_current_user_project_member(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = target_project_id
      and (
        p.owner_id = (select auth.uid())
        or exists (
          select 1
          from public.project_members pm
          where pm.project_id = p.id
            and pm.user_id = (select auth.uid())
        )
      )
  );
$$;

create or replace function private.is_current_user_project_owner(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = target_project_id
      and p.owner_id = (select auth.uid())
  );
$$;

revoke all on function private.is_current_user_project_member(uuid) from public, anon;
revoke all on function private.is_current_user_project_owner(uuid) from public, anon;
grant execute on function private.is_current_user_project_member(uuid) to authenticated;
grant execute on function private.is_current_user_project_owner(uuid) to authenticated;

drop policy if exists "members read projects" on public.projects;
create policy "members read projects"
on public.projects
for select
to authenticated
using (private.is_current_user_project_member(id));

drop policy if exists "members read memberships" on public.project_members;
create policy "members read memberships"
on public.project_members
for select
to authenticated
using (private.is_current_user_project_member(project_id));

drop policy if exists "project members add memberships" on public.project_members;
create policy "project members add memberships"
on public.project_members
for insert
to authenticated
with check (private.is_current_user_project_member(project_id));

drop policy if exists "owners update memberships" on public.project_members;
create policy "owners update memberships"
on public.project_members
for update
to authenticated
using (private.is_current_user_project_owner(project_id))
with check (private.is_current_user_project_owner(project_id));

drop policy if exists "owners delete memberships" on public.project_members;
create policy "owners delete memberships"
on public.project_members
for delete
to authenticated
using (private.is_current_user_project_owner(project_id));

create or replace function private.add_project_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.project_members (project_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (project_id, user_id)
  do update set role = 'owner';
  return new;
end;
$$;

revoke all on function private.add_project_owner_membership() from public, anon, authenticated;

drop trigger if exists add_project_owner_membership on public.projects;
create trigger add_project_owner_membership
after insert on public.projects
for each row execute function private.add_project_owner_membership();
