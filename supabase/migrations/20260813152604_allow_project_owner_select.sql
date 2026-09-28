drop policy if exists "members read projects" on public.projects;
create policy "members read projects"
on public.projects
for select
to authenticated
using (
  owner_id = (select auth.uid())
  or (select private.is_current_user_project_member(id))
);
