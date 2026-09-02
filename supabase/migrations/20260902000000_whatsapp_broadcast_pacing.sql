-- Paced WhatsApp broadcasts.
--
-- Broadcasts used to be fanned out inside a single request: /api/whatsapp/broadcast
-- posted to Make.com in parallel batches of 8. Any spacing between groups was an
-- accident of the Make.com scenario sleeping 15 minutes before it replied, so once
-- the fan-out went concurrent every group landed at the same moment - exactly the
-- burst the 15 minute delay existed to prevent.
--
-- Pacing now lives here instead. Each group becomes one queue row with an earliest
-- send time; /api/cron/whatsapp releases at most one row per account per tick and
-- never closer together than the configured interval. The send therefore survives
-- the tab closing, a deploy, and a broadcast far longer than any function ceiling.
--
-- Images can no longer be held in function memory (group 8 goes out hours after the
-- request that accepted it, in a different invocation) so they are staged in the
-- whatsapp-broadcasts storage bucket and deleted when the broadcast finishes.

-- 1. Storage bucket for staged broadcast images -------------------------------
-- Private: the cron reads it with the service role key. Same shape as the
-- ticket-attachments bucket the tickets module already uses.
insert into storage.buckets (id, name, public, file_size_limit)
values ('whatsapp-broadcasts', 'whatsapp-broadcasts', false, 10485760)
on conflict (id) do nothing;

-- 2. Per-group queue -----------------------------------------------------------
create table if not exists public.whatsapp_broadcast_queue (
  id           uuid primary key default gen_random_uuid(),
  broadcast_id uuid not null references public.whatsapp_broadcast_log(id) on delete cascade,
  account_id   text not null,
  chat_id      text not null,
  group_name   text,
  -- Ordinal within the broadcast. Groups go out in the order they were selected.
  position     integer not null default 0,
  -- Earliest this group may be sent. Set at enqueue to now() + position * interval;
  -- the cron additionally enforces the gap against the account's last actual send,
  -- so two overlapping broadcasts on one number still interleave safely.
  send_after   timestamptz not null default now(),
  status       text not null default 'pending'
               check (status in ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  attempts     integer not null default 0,
  error        text,
  sent_at      timestamptz,
  created_at   timestamptz not null default now()
);

-- The cron's hot path: oldest due pending row for one account.
create index if not exists whatsapp_broadcast_queue_due_idx
  on public.whatsapp_broadcast_queue (account_id, status, send_after);

-- Finalising a broadcast counts its remaining rows.
create index if not exists whatsapp_broadcast_queue_broadcast_idx
  on public.whatsapp_broadcast_queue (broadcast_id, status);

-- Per-account pacing check: when did this number last actually send?
create index if not exists whatsapp_broadcast_queue_last_sent_idx
  on public.whatsapp_broadcast_queue (account_id, sent_at desc);

-- 3. Broadcast log gains the staging + pacing fields ---------------------------
-- whatsapp_broadcast_log was created in the dashboard rather than a migration, so
-- add defensively rather than assuming a shape.
alter table public.whatsapp_broadcast_log
  add column if not exists image_path       text,
  add column if not exists interval_minutes integer,
  add column if not exists queued_at        timestamptz;

comment on column public.whatsapp_broadcast_log.image_path is
  'Path in the whatsapp-broadcasts storage bucket. Deleted when the broadcast reaches a terminal status.';
comment on column public.whatsapp_broadcast_log.interval_minutes is
  'Minutes between groups for this broadcast. Null on pre-pacing rows, which were sent in one burst.';
comment on column public.whatsapp_broadcast_log.queued_at is
  'When the broadcast was accepted. sent_at is when the LAST group went out, so it cannot order the history while a send is in flight.';

-- 4. "cancelled" is a terminal status a user can reach -------------------------
-- A paced broadcast can run for hours, so stopping the remaining groups has to be
-- possible. Recreate the CHECK the same way the previous two migrations did: the
-- original was created inline and its name is not fixed.
do $$
declare r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.whatsapp_broadcast_log'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%status%'
  loop
    execute format('alter table public.whatsapp_broadcast_log drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.whatsapp_broadcast_log
  add constraint whatsapp_broadcast_log_status_check
  check (status = any (array[
    'queued'::text, 'sending'::text, 'sent'::text,
    'failed'::text, 'partial'::text, 'not_sent'::text, 'cancelled'::text
  ]));

-- 5. Backfill queued_at so existing history still sorts ------------------------
update public.whatsapp_broadcast_log
set queued_at = coalesce(created_at, sent_at)
where queued_at is null;
