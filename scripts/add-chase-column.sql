-- Add chase column to clients (Debt Recovery)
-- Run in Supabase Dashboard → SQL Editor
-- Same as supabase/migrations/20250203000000_add_chase_to_clients.sql

ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS chase text NOT NULL DEFAULT 'to_chase';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'clients_chase_check' AND conrelid = 'public.clients'::regclass
  ) THEN
    ALTER TABLE public.clients
    ADD CONSTRAINT clients_chase_check CHECK (chase IN ('to_chase', 'do_not_chase'));
  END IF;
END $$;

COMMENT ON COLUMN public.clients.chase IS 'Debt recovery: to_chase = contact for recovery, do_not_chase = exclude from chase list. Default to_chase.';
