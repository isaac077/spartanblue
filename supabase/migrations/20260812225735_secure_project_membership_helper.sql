drop policy if exists "project members add memberships" on public.project_members;
drop policy if exists "owners manage memberships" on public.project_members;
drop function if exists public.is_current_user_project_member(uuid);

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

revoke all on function private.is_current_user_project_member(uuid) from public;
revoke all on function private.is_current_user_project_member(uuid) from anon;
grant execute on function private.is_current_user_project_member(uuid) to authenticated;

create policy "project members add memberships"
on public.project_members
for insert
to authenticated
with check (private.is_current_user_project_member(project_id));

create policy "owners update memberships"
on public.project_members
for update
to authenticated
using (
  exists (
    select 1
    from public.projects p
    where p.id = project_id
      and p.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.projects p
    where p.id = project_id
      and p.owner_id = (select auth.uid())
  )
);

create policy "owners delete memberships"
on public.project_members
for delete
to authenticated
using (
  exists (
    select 1
    from public.projects p
    where p.id = project_id
      and p.owner_id = (select auth.uid())
  )
);
