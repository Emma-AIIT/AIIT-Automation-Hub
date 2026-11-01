-- Scheduled broadcasts v2 (2026-11-02).
--  * scheduled_messages.enabled: on/off switch. The cron skips rows that are off.
--  * scheduled_messages.repeat_base_sent: repeat_sent at the moment the series was
--    last edited. Editing resets repeat_anchor_at to the new first send, so the
--    occurrence index counted from that anchor is repeat_sent - repeat_base_sent
--    (see occurrenceIndex in src/lib/schedule-repeat.ts).
--  * whatsapp_broadcast_log.scheduled_message_id: links each broadcast a schedule
--    produced back to it, so Broadcast History can badge it "Scheduled" and fold a
--    repeating series into one entry.
-- Purely additive: code that predates it ignores the new columns.
alter table public.scheduled_messages
  add column if not exists enabled boolean not null default true,
  add column if not exists repeat_base_sent int not null default 0;
alter table public.whatsapp_broadcast_log
  add column if not exists scheduled_message_id uuid null
    references public.scheduled_messages(id) on delete set null;
create index if not exists whatsapp_broadcast_log_scheduled_message_idx
  on public.whatsapp_broadcast_log (scheduled_message_id);
