-- Multiple attachments per WhatsApp broadcast.
--
-- whatsapp_broadcast_log stored at most one staged file (image_path/file_name).
-- WhatsApp has no "multi-attachment" message, so a broadcast with several files
-- goes out to each group as one message per file (see sendToGroup in
-- src/lib/server/whatsapp-broadcast.ts) - the log just needs to remember which
-- files belong to the broadcast, in order.
--
-- image_path/file_name are kept (not dropped) in case anything outside this repo
-- still reads them directly, but the app now reads/writes image_paths/file_names
-- exclusively - backfilled below from the old singular columns so every existing
-- row keeps working with the new code.

alter table public.whatsapp_broadcast_log
  add column if not exists image_paths text[],
  add column if not exists file_names  text[];

comment on column public.whatsapp_broadcast_log.image_paths is
  'Paths in the whatsapp-broadcasts storage bucket, one per attachment, sent as separate messages to each group in order. Superset of the older single-file image_path.';
comment on column public.whatsapp_broadcast_log.file_names is
  'Original file names, same order as image_paths.';

update public.whatsapp_broadcast_log
set image_paths = array[image_path],
    file_names  = array[coalesce(file_name, 'image')]
where image_path is not null
  and image_paths is null;
