-- Add type and name columns, make category_id nullable
ALTER TABLE public.budget_entries
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'spending',
  ADD COLUMN IF NOT EXISTS name text;

ALTER TABLE public.budget_entries
  ALTER COLUMN category_id DROP NOT NULL;

-- Replace index
DROP INDEX IF EXISTS idx_budget_entries_org_cat;
CREATE INDEX idx_budget_entries_org_type ON public.budget_entries (org_id, type);
