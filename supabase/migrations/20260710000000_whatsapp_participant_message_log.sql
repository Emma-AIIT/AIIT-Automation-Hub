-- Individual (1:1) WhatsApp message history for the Participants page.
-- Mirrors whatsapp_broadcast_log but targets individual recipients instead of groups.
-- Rows are written by Make.com after each send; the app only reads from this table.
create table if not exists whatsapp_participant_message_log (
  id uuid primary key default gen_random_uuid(),
  account_id text not null,
  message text,
  recipient_ids text[] not null default '{}',      -- WhatsApp chatIds, e.g. 61412345678@c.us
  recipient_phones text[] not null default '{}',
  recipient_names text[] not null default '{}',
  has_file boolean not null default false,
  file_name text,
  status text not null check (status in ('sent', 'failed', 'partial')),
  make_error text,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_participant_message_log_account_sent_idx
  on whatsapp_participant_message_log (account_id, sent_at desc);
