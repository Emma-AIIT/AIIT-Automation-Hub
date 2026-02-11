-- Support tickets and attachments (required before ticket_replies migration)
create table if not exists support_tickets (
  id uuid primary key default gen_random_uuid(),
  caller_name text not null,
  caller_phone text,
  caller_email text,
  caller_business text,
  inquiry text not null,
  summary text,
  status text not null default 'open' check (status in ('open', 'in-progress', 'resolved')),
  assigned_to text,
  vapi_call_id text,
  recording_url text,
  notes text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  updated_at timestamptz not null default now(),
  priority text check (priority is null or priority in ('high', 'low')),
  priority_reason text,
  source text not null default 'phone' check (source in ('phone', 'email', 'manual', 'walk-in')),
  email_subject text,
  email_cc text,
  email_bcc text,
  email_message_id text
);

create table if not exists ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets(id) on delete cascade,
  file_name text not null,
  file_type text not null,
  file_size integer not null,
  storage_path text not null,
  content_id text,
  created_at timestamptz not null default now()
);

create index if not exists ticket_attachments_ticket_id_idx on ticket_attachments(ticket_id);
