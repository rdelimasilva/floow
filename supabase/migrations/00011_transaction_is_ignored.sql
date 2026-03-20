-- Add is_ignored flag to transactions for imported transactions that should be excluded from calculations
ALTER TABLE public.transactions ADD COLUMN is_ignored boolean NOT NULL DEFAULT false;
