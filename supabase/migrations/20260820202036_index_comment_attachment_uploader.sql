create index if not exists comment_attachments_uploaded_by_idx
  on public.comment_attachments(uploaded_by);
