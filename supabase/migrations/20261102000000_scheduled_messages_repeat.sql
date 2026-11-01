-- Repeat option for scheduled broadcasts (daily / weekly / monthly, N times).
--
-- One scheduled_messages row per series. It stays 'pending' until its last send;
-- after each send the cron moves scheduled_at to the next occurrence (worked out
-- from repeat_anchor_at in Sydney wall-clock time, src/lib/schedule-repeat.ts)
-- and adds 1 to repeat_sent. repeat_total counts the first send.
--
-- scheduled_messages predates the migrations folder, hence "if not exists".
-- Existing rows get none / 1 / 0 and behave exactly as before.

alter table public.scheduled_messages
  add column if not exists repeat_interval text not null default 'none'
    check (repeat_interval in ('none', 'daily', 'weekly', 'monthly')),
  add column if not exists repeat_total int not null default 1
    check (repeat_total between 1 and 52),
  add column if not exists repeat_sent int not null default 0,
  add column if not exists repeat_anchor_at timestamptz;
