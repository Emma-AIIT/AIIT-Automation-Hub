-- A broadcast that is interrupted part way through its fan-out (the serverless
-- function reaches its execution ceiling before the loop ends) used to leave its
-- log row on "sending" forever, because nothing ever revisited it. The WhatsApp
-- cron now sweeps those orphaned rows into a new terminal status, "not_sent".
-- Widen the status CHECK constraint to allow it, then relabel the rows that are
-- already stuck. This is a relabel only: no message is re-sent.
-- The constraint was recreated inline by an earlier migration, so drop whatever
-- CHECK on this table currently references status before adding the new one.

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
    'failed'::text, 'partial'::text, 'not_sent'::text
  ]));

-- Backfill the already-orphaned rows. Anything still in flight after an hour was
-- never going to finish: the function that owned it is long gone.
update public.whatsapp_broadcast_log
set status = 'not_sent',
    make_error = coalesce(
      make_error,
      'Send was interrupted before it finished. Some groups may still have received it. The broadcast was not re-sent.'
    )
where status in ('queued', 'sending')
  and sent_at < now() - interval '1 hour';

-- Order-independent safety net. If this deploys before the migration is applied,
-- the cron sweeper's "not_sent" write is rejected by the old constraint and it
-- falls back to "failed". Promote those rows to the accurate status here. Matched
-- on the sweeper's exact note, so a genuine Make.com failure is never touched.
update public.whatsapp_broadcast_log
set status = 'not_sent'
where status = 'failed'
  and make_error = 'Send was interrupted before it finished. Some groups may still have received it. The broadcast was not re-sent.';
