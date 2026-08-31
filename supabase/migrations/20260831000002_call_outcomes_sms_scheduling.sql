-- Outbound Calls, second pass: call outcomes, SMS follow-up, scheduling, transfer.
--
-- Until now a call was recorded as "dialled" and nothing more, because VAPI was
-- never asked to report back. Campaign calls now carry a per-call server
-- override pointing at /api/webhooks/vapi, so each end-of-call report lands here
-- and fills in what actually happened: picked up or not, how long, what was
-- said, what it cost.
--
-- Everything here is additive. No existing column changes meaning.

-- ── Scripts ──────────────────────────────────────────────────────────────────
-- Category mirrors the service lines in Ali's flow diagram (AI, Web Dev, IT).
-- The two SMS bodies are per script so the follow-up matches what was pitched.
alter table public.call_scripts
  add column if not exists category            text,
  add column if not exists sms_answered        text,
  add column if not exists sms_not_answered    text;

-- ── Batches ──────────────────────────────────────────────────────────────────
alter table public.outbound_call_batches
  add column if not exists scheduled_at    timestamptz,
  add column if not exists transfer_number text;

-- "scheduled" joins the status set: queued but deliberately not dialling yet.
alter table public.outbound_call_batches
  drop constraint if exists outbound_call_batches_status_check;

alter table public.outbound_call_batches
  add constraint outbound_call_batches_status_check
  check (status = any (array[
    'scheduled'::text, 'queued'::text, 'dialling'::text, 'completed'::text,
    'partial'::text, 'failed'::text, 'interrupted'::text
  ]));

-- ── Individual calls ─────────────────────────────────────────────────────────
-- outcome is the human-meaningful result, derived from VAPI's endedReason
-- (which has 600+ values, far too many to show anyone).
alter table public.outbound_calls
  add column if not exists outcome          text,
  add column if not exists ended_reason     text,
  add column if not exists duration_seconds integer,
  add column if not exists started_at       timestamptz,
  add column if not exists ended_at         timestamptz,
  add column if not exists cost             numeric(10, 4),
  add column if not exists summary          text,
  add column if not exists transcript       text,
  add column if not exists recording_url    text,
  add column if not exists transferred      boolean not null default false,
  add column if not exists sms_sent_at      timestamptz,
  add column if not exists sms_error        text,
  add column if not exists report_at        timestamptz;

alter table public.outbound_calls
  drop constraint if exists outbound_calls_outcome_check;

alter table public.outbound_calls
  add constraint outbound_calls_outcome_check
  check (outcome is null or outcome = any (array[
    'answered'::text,     -- a human picked up and spoke to the agent
    'no_answer'::text,    -- rang out
    'voicemail'::text,    -- went to machine
    'busy'::text,         -- line engaged
    'failed'::text        -- carrier or pipeline error, never really connected
  ]));

-- Stats queries filter by outcome within a batch.
create index if not exists outbound_calls_outcome_idx
  on public.outbound_calls (batch_id, outcome);

-- Lets the scheduler find due batches without scanning history.
create index if not exists outbound_call_batches_scheduled_idx
  on public.outbound_call_batches (scheduled_at)
  where status = 'scheduled';

-- The webhook looks calls up by the VAPI call id it is told about.
create index if not exists outbound_calls_vapi_id_idx
  on public.outbound_calls (vapi_call_id);
