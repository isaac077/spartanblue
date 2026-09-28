alter table public.projects
add column if not exists image_url text;

drop policy if exists "owners update projects" on public.projects;
create policy "owners update projects"
on public.projects
for update
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'project-images',
  'project-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "owners upload project images" on storage.objects;
create policy "owners upload project images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'project-images'
  and exists (
    select 1
    from public.projects p
    where p.id::text = (storage.foldername(name))[1]
      and p.owner_id = (select auth.uid())
  )
);

drop policy if exists "owners update project images" on storage.objects;
create policy "owners update project images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'project-images'
  and exists (
    select 1
    from public.projects p
    where p.id::text = (storage.foldername(name))[1]
      and p.owner_id = (select auth.uid())
  )
)
with check (
  bucket_id = 'project-images'
  and exists (
    select 1
    from public.projects p
    where p.id::text = (storage.foldername(name))[1]
      and p.owner_id = (select auth.uid())
  )
);

drop policy if exists "owners delete project images" on storage.objects;
create policy "owners delete project images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'project-images'
  and exists (
    select 1
    from public.projects p
    where p.id::text = (storage.foldername(name))[1]
      and p.owner_id = (select auth.uid())
  )
);
