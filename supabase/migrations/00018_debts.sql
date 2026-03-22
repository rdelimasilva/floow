CREATE TABLE public.debts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL,
  total_cents integer NOT NULL,
  installments integer NOT NULL,
  installment_cents integer NOT NULL,
  interest_rate numeric(7,4),
  start_date date NOT NULL,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_debts_org_active ON public.debts (org_id, is_active);

ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "debts: org isolation select"
  ON public.debts FOR SELECT TO authenticated
  USING (org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid);

CREATE POLICY "debts: org isolation insert"
  ON public.debts FOR INSERT TO authenticated
  WITH CHECK (org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid);

CREATE POLICY "debts: org isolation update"
  ON public.debts FOR UPDATE TO authenticated
  USING (org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid);

CREATE POLICY "debts: org isolation delete"
  ON public.debts FOR DELETE TO authenticated
  USING (org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid);
