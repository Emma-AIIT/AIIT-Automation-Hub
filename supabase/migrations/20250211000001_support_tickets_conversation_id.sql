-- Store Outlook conversationId so inbound replies can match by thread (no In-Reply-To needed)
alter table support_tickets add column if not exists conversation_id text;
create index if not exists support_tickets_conversation_id_idx on support_tickets(conversation_id) where conversation_id is not null;
