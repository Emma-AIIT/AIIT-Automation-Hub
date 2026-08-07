-- Incoming WhatsApp messages feed for the Chats page.
-- Mirrors the "Daily Chats" sheet columns. Rows are written by Make.com from the WhatsApp
-- API feed; the app only reads from this table (thread list + per-chat message view).
create table if not exists whatsapp_chat_messages (
  id uuid primary key default gen_random_uuid(),
  account_id text not null,
  chat_id text not null,                 -- WhatsApp chat/group id, e.g. 1203630...@g.us or 6141...@c.us
  group_chat text,                       -- display name of the group/chat ("Group Chat" column)
  sender_name text,                      -- who sent it ("User" column)
  text_msg text,                         -- message body / media URL ("Text Msg" column)
  type_of_message text,                  -- textMessage | extendedTextMessage | imageMessage | quotedMessage | ...
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Fast thread list (order by recent activity) and per-chat message reads.
create index if not exists whatsapp_chat_messages_account_sent_idx
  on whatsapp_chat_messages (account_id, sent_at desc);

create index if not exists whatsapp_chat_messages_account_chat_sent_idx
  on whatsapp_chat_messages (account_id, chat_id, sent_at asc);
