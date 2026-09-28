create index if not exists idx_project_posts_author
  on public.project_posts(author_id);
create index if not exists idx_post_comments_author
  on public.post_comments(author_id);
create index if not exists idx_post_reactions_user
  on public.post_reactions(user_id);
create index if not exists idx_task_reactions_user
  on public.task_reactions(user_id);
create index if not exists idx_checkin_schedules_creator
  on public.checkin_schedules(created_by);
create index if not exists idx_checkin_responses_user
  on public.checkin_responses(user_id);
