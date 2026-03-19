-- Add auto-categorization tracking column to transactions
ALTER TABLE public.transactions
  ADD COLUMN is_auto_categorized boolean NOT NULL DEFAULT false;
