create table public.comment_reactions (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '🎉', '👀')),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index idx_comment_reactions_user
on public.comment_reactions(user_id);

alter table public.comment_reactions enable row level security;

create policy "members read comment reactions"
on public.comment_reactions for select to authenticated
using (
  exists (
    select 1
    from public.comments comment
    where comment.id = comment_reactions.comment_id
      and private.current_user_can_access_task(comment.task_id)
  )
);

create policy "members add own comment reactions"
on public.comment_reactions for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.comments comment
    where comment.id = comment_reactions.comment_id
      and private.current_user_can_access_task(comment.task_id)
  )
);

create policy "members update own comment reactions"
on public.comment_reactions for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.comments comment
    where comment.id = comment_reactions.comment_id
      and private.current_user_can_access_task(comment.task_id)
  )
);

create policy "members delete own comment reactions"
on public.comment_reactions for delete to authenticated
using (user_id = (select auth.uid()));

grant select, insert, update, delete
on table public.comment_reactions to authenticated;
