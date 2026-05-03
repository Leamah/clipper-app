-- Add overlay columns to clipper_jobs so the backend can read them
alter table clipper_jobs
  add column if not exists watermark_id      uuid references clipper_user_watermarks(id) on delete set null,
  add column if not exists reaction_video_id uuid references clipper_user_reactions(id)  on delete set null,
  add column if not exists reaction_position text check (reaction_position in ('top-left','top-right','bottom-left','bottom-right')),
  add column if not exists commentary_text   text;
