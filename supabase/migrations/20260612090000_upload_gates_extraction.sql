-- Upload gates for the AI pipeline:
-- 1. Server-side weight gate — the course-materials bucket now rejects files
--    over 10 MB and any MIME type we cannot extract text from. The client
--    checks the same limits first for a friendly message, but the bucket is
--    the enforcement (a hand-rolled request can't bypass it).
-- 2. Extraction-at-upload — course_materials tracks the text extraction that
--    now runs right after upload (extract-material Edge Function) instead of
--    inside generation. A scanned PDF fails here, immediately, not minutes
--    into an AI run.

update storage.buckets
set
  file_size_limit = 10485760, -- 10 MB
  allowed_mime_types = array[
    'application/pdf',
    'text/plain',
    'text/markdown',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
where id = 'course-materials';

-- pending = uploaded before this feature or extraction still running;
-- generate-course falls back to inline extraction for those legacy rows.
alter table public.course_materials
  add column extract_status text not null default 'pending'
    check (extract_status in ('pending', 'ready', 'failed')),
  add column extract_error text,
  add column extracted_path text,
  add column extracted_chars integer;
