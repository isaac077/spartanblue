create or replace function private.protect_ticket_project()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_catalog.lower(pg_catalog.btrim(old.name)) = 'mesa de tickets' then
    if tg_op = 'DELETE' then
      raise exception 'Mesa de Tickets is a protected workspace project'
        using errcode = '42501';
    end if;

    if new.name is distinct from old.name
      or pg_catalog.coalesce(new.archived, false) = true then
      raise exception 'Mesa de Tickets cannot be renamed or archived'
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.protect_ticket_project()
from public, anon, authenticated;

drop trigger if exists protect_ticket_project on public.projects;
create trigger protect_ticket_project
before update or delete on public.projects
for each row execute function private.protect_ticket_project();
