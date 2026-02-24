-- Seed whatsapp_group_participants with pre-extracted participant data.
-- Run once in Supabase SQL Editor, or run the generated file with psql (recommended for large files).
-- Idempotent: ON CONFLICT (group_chat_id, participant_id) updates existing rows.
--
-- Run entire generated file with psql (Supabase: Project Settings → Database → Connection string → URI, Direct connection):
--   psql "postgresql://postgres:YOUR_PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres" -f scripts/seed-whatsapp-group-participants-generated.sql
--
-- To regenerate from CSV (columns: Group Chat, Participant ID, Name, Partipant Number, Group Chat ID):
--   node scripts/csv-to-participants-sql.js "path/to/Whatsapp Automation - GC & Participants.csv" > scripts/seed-whatsapp-group-participants-generated.sql

INSERT INTO public.whatsapp_group_participants (
  group_chat_id,
  group_chat_name,
  participant_id,
  participant_phone,
  participant_name
)
VALUES
  ('120363024669282426@g.us', 'The Hijra Project —Make The Move', '201114546275@c.us', '201114546275', NULL),
  ('120363024669282426@g.us', 'The Hijra Project —Make The Move', '27793647757@c.us', '27793647757', NULL)
  -- Add more rows here, or generate from CSV using: node scripts/csv-to-participants-sql.js <your.csv>
ON CONFLICT (group_chat_id, participant_id) DO UPDATE SET
  group_chat_name = EXCLUDED.group_chat_name,
  participant_phone = EXCLUDED.participant_phone,
  participant_name = EXCLUDED.participant_name;
