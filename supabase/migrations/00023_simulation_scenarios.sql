-- Saved simulation scenarios (named presets per org)
CREATE TABLE public.simulation_scenarios (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  name          text NOT NULL,
  mode          text NOT NULL CHECK (mode IN ('contribution', 'income')),
  portfolio_cents        integer NOT NULL DEFAULT 0,
  current_age            integer NOT NULL,
  retirement_age         integer NOT NULL,
  life_expectancy        integer NOT NULL DEFAULT 85,
  monthly_contribution_cents  integer NOT NULL DEFAULT 0,
  desired_monthly_income_cents integer NOT NULL DEFAULT 0,
  inflation_rate         numeric(5,4) NOT NULL DEFAULT 0.04,
  conservative_return_rate  numeric(5,4),
  base_return_rate          numeric(5,4),
  aggressive_return_rate    numeric(5,4),
  contribution_growth_rate  numeric(5,4),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_simulation_scenarios_org ON public.simulation_scenarios(org_id, updated_at DESC);

ALTER TABLE public.simulation_scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "simulation_scenarios: members can manage"
  ON public.simulation_scenarios
  FOR ALL
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));
