-- Make the WhatsApp tables multi-account safe for the AIIT Business Account rollout.
-- WhatsApp group/chat ids are only unique per linked number: if two accounts are
-- members of the same group, both syncs write the same group id. Single-column
-- natural keys let the second account's sync overwrite the first account's rows,
-- so every natural key must include account_id.
-- Safe on existing data: all current rows belong to 'aiit-automation' and their
-- ids were already unique, so the composite keys hold trivially.

begin;

-- 1. whatsapp_groups: PK (id) -> (id, account_id)
alter table public.whatsapp_groups
  drop constraint whatsapp_groups_pkey;
alter table public.whatsapp_groups
  add constraint whatsapp_groups_pkey primary key (id, account_id);

-- 2. whatsapp_dashboard_groups: PK (group_id) -> (group_id, account_id)
alter table public.whatsapp_dashboard_groups
  drop constraint whatsapp_dashboard_groups_pkey;
alter table public.whatsapp_dashboard_groups
  add constraint whatsapp_dashboard_groups_pkey primary key (group_id, account_id);

-- 3. whatsapp_group_participants: replace the (group_chat_id, participant_id)
--    unique key with (account_id, group_chat_id, participant_id). The old key
--    was created outside the repo's migrations so its name is unknown — drop
--    every non-PK unique constraint/index on the table before recreating.
do $$
declare r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.whatsapp_group_participants'::regclass
      and contype = 'u'
  loop
    execute format('alter table public.whatsapp_group_participants drop constraint %I', r.conname);
  end loop;

  for r in
    select i.indexrelid::regclass::text as idx
    from pg_index i
    where i.indrelid = 'public.whatsapp_group_participants'::regclass
      and i.indisunique
      and not i.indisprimary
      and not exists (select 1 from pg_constraint c where c.conindid = i.indexrelid)
  loop
    execute format('drop index %s', r.idx);
  end loop;
end $$;

create unique index whatsapp_group_participants_account_group_participant_key
  on public.whatsapp_group_participants (account_id, group_chat_id, participant_id);

-- 4. Read-path indexes for account-scoped queries
create index if not exists whatsapp_groups_account_name_idx
  on public.whatsapp_groups (account_id, name);

create index if not exists whatsapp_broadcast_log_account_sent_idx
  on public.whatsapp_broadcast_log (account_id, sent_at desc);

create index if not exists scheduled_messages_status_scheduled_idx
  on public.scheduled_messages (status, scheduled_at);

commit;
