-- Add call_count column to call_contacts (Contacts phonebook)
-- Run in Supabase Dashboard → SQL Editor
-- Same as supabase/migrations/20260703000000_add_call_count_to_call_contacts.sql
--
-- Tracks how many times each contact has been called by the outbound calling
-- automation. Have the Make.com calling workflow increment this whenever it sets
-- last_called_at, e.g.:
--   UPDATE call_contacts
--   SET call_count = call_count + 1, last_called_at = now()
--   WHERE id = {{contactId}};

ALTER TABLE public.call_contacts
ADD COLUMN IF NOT EXISTS call_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.call_contacts.call_count IS 'Number of times this contact has been called by the outbound calling automation. Incremented by Make.com alongside last_called_at.';
