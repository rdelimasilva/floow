-- Refactor budget_entries: recurring model (start_month/end_month) instead of per-month rows
-- Drop old table and recreate with new schema

DROP TABLE IF EXISTS public.budget_entries;

CREATE TABLE public.budget_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  planned_cents integer NOT NULL,
  start_month date NOT NULL,
  end_month date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_budget_entries_org_cat
  ON public.budget_entries (org_id, category_id);

ALTER TABLE public.budget_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "budget_entries: org isolation select"
  ON public.budget_entries FOR SELECT TO authenticated
  USING (org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid);

CREATE POLICY "budget_entries: org isolation insert"
  ON public.budget_entries FOR INSERT TO authenticated
  WITH CHECK (org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid);

CREATE POLICY "budget_entries: org isolation update"
  ON public.budget_entries FOR UPDATE TO authenticated
  USING (org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid);

CREATE POLICY "budget_entries: org isolation delete"
  ON public.budget_entries FOR DELETE TO authenticated
  USING (org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid);
