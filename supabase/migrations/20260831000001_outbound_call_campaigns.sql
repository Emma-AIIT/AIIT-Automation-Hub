-- Outbound Calls module.
-- Ali writes a call script, pastes a list of phone numbers, and the dashboard
-- dials them through VAPI using that script as the assistant's system prompt.
--
-- Three tables:
--   call_scripts          reusable scripts, edited and saved from the page
--   outbound_call_batches one row per "Start calls" click
--   outbound_calls        one row per number in a batch, holding its VAPI call id
--
-- The script is snapshotted onto the batch so editing a script later never
-- rewrites the history of calls that already went out under the old wording.

create table if not exists public.call_scripts (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  script        text not null,
  first_message text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.outbound_call_batches (
  id               uuid primary key default gen_random_uuid(),
  script_id        uuid references public.call_scripts (id) on delete set null,
  script_name      text not null,
  script_snapshot  text not null,
  first_message    text,
  assistant_id     text not null,
  assistant_name   text,
  phone_number_id  text not null,
  from_number      text,
  status           text not null default 'queued'
                     check (status = any (array[
                       'queued'::text, 'dialling'::text, 'completed'::text,
                       'partial'::text, 'failed'::text, 'interrupted'::text
                     ])),
  total_count      integer not null default 0,
  dialled_count    integer not null default 0,
  failed_count     integer not null default 0,
  error            text,
  created_at       timestamptz not null default now(),
  completed_at     timestamptz
);

create table if not exists public.outbound_calls (
  id           uuid primary key default gen_random_uuid(),
  batch_id     uuid not null references public.outbound_call_batches (id) on delete cascade,
  phone_number text not null,
  vapi_call_id text,
  status       text not null default 'queued'
                 check (status = any (array[
                   'queued'::text, 'dialled'::text, 'failed'::text
                 ])),
  error        text,
  created_at   timestamptz not null default now(),
  dialled_at   timestamptz
);

create index if not exists outbound_call_batches_created_idx
  on public.outbound_call_batches (created_at desc);

create index if not exists outbound_calls_batch_idx
  on public.outbound_calls (batch_id, created_at);

-- Lets the cron sweeper find batches abandoned mid-dial without a table scan.
create index if not exists outbound_call_batches_active_idx
  on public.outbound_call_batches (status, created_at)
  where status in ('queued', 'dialling');
