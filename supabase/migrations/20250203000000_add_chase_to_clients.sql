-- Add chase column to clients table for debt recovery "to chase" / "do not chase"
-- Run this in Supabase SQL Editor or via Supabase CLI

-- Add column: 'to_chase' | 'do_not_chase', default 'to_chase'
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS chase text NOT NULL DEFAULT 'to_chase';

-- Constrain allowed values (idempotent: skip if constraint already exists)
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

-- Comment for documentation
COMMENT ON COLUMN public.clients.chase IS 'Debt recovery: to_chase = contact for recovery, do_not_chase = exclude from chase list. Default to_chase.';
