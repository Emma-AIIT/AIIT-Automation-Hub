-- Add call_count to call_contacts (Contacts phonebook)
--
-- Tracks how many times each contact has been called by the outbound calling
-- automation. The Make.com calling workflow increments this alongside the
-- existing last_called_at timestamp (e.g. call_count = call_count + 1). The
-- Contacts page defaults to sorting by this column, most-called first.

ALTER TABLE public.call_contacts
ADD COLUMN IF NOT EXISTS call_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.call_contacts.call_count IS 'Number of times this contact has been called by the outbound calling automation. Incremented by Make.com alongside last_called_at.';
