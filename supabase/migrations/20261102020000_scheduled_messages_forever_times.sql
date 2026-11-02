-- Scheduled broadcasts: "∞ Forever" repeat + several times per day.
-- Additive: code that predates this ignores both columns.
--   repeat_forever: the series never finishes; it repeats until switched off or deleted.
--                   repeat_total is kept (last value or 1) but the cron ignores it.
--   repeat_times:   Sydney wall-clock 'HH:mm' slots per period, sorted and unique, max 4.
--                   null = the single time of repeat_anchor_at.
alter table public.scheduled_messages
  add column if not exists repeat_forever boolean not null default false,
  add column if not exists repeat_times text[] null;
