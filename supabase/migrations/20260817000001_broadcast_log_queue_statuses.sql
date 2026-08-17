-- Broadcasts are now queued server-side and processed in the background, so the
-- log row moves through queued -> sending -> sent/partial/failed. Widen the
-- status CHECK constraint to allow the two new in-flight statuses.
-- The original constraint was created inline (name not fixed in migrations),
-- so find and drop any CHECK on this table that references status.

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
  check (status = any (array['queued'::text, 'sending'::text, 'sent'::text, 'failed'::text, 'partial'::text]));
