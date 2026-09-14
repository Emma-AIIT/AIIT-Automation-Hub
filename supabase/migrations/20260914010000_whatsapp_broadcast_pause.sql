-- Pause/resume for in-flight WhatsApp broadcasts.
--
-- "Stop" (cancelBroadcast) is permanent - once cancelled, remaining groups never
-- go out. There was no way to temporarily freeze a broadcast (e.g. to test an
-- unrelated change without a multi-hour paced send competing for the same
-- Make.com scenario/account timeline) and pick it back up later.
--
-- paused is a simple flag rather than a new terminal status: drainBroadcastQueue
-- skips a paused broadcast's due queue rows entirely - not claimed, no attempt
-- consumed, send_after untouched - so resuming continues from whichever group is
-- next rather than restarting or skipping any. See pauseBroadcast/resumeBroadcast
-- in src/lib/server/whatsapp-broadcast.ts.

alter table public.whatsapp_broadcast_log
  add column if not exists paused boolean not null default false;

comment on column public.whatsapp_broadcast_log.paused is
  'When true, drainBroadcastQueue skips this broadcast''s pending queue rows entirely (no claim, no attempt consumed) until resumed. Groups already sent are unaffected.';
