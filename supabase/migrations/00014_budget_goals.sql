-- =============================================================================
-- Budget Goals Migration 00014
-- Schema: budget_goals, budget_category_limits, budget_adjustments
-- Includes RLS policies with org isolation via JWT claims
-- =============================================================================

-- ----------------------------------------------------------------------------
-- ENUMS
-- ----------------------------------------------------------------------------

CREATE TYPE public.budget_goal_type AS ENUM ('spending', 'investing');
CREATE TYPE public.budget_period AS ENUM ('monthly', 'quarterly', 'semiannual', 'annual');

-- ----------------------------------------------------------------------------
-- TABLES
-- ----------------------------------------------------------------------------

CREATE TABLE public.budget_goals (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  type                    public.budget_goal_type NOT NULL,
  name                    text NOT NULL,
  target_cents            integer NOT NULL,
  period                  public.budget_period NOT NULL,
  patrimony_target_cents  integer,
  patrimony_deadline      date,
  is_active               boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.budget_category_limits (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_goal_id  uuid NOT NULL REFERENCES public.budget_goals(id) ON DELETE CASCADE,
  category_id     uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  limit_cents     integer NOT NULL
);

CREATE TABLE public.budget_adjustments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_goal_id  uuid NOT NULL REFERENCES public.budget_goals(id) ON DELETE CASCADE,
  amount_cents    integer NOT NULL,
  description     text NOT NULL,
  date            date NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- INDEXES
-- ----------------------------------------------------------------------------

CREATE INDEX idx_budget_goals_org_type_active
  ON public.budget_goals USING btree (org_id, type, is_active);

CREATE UNIQUE INDEX uq_budget_category_limit
  ON public.budget_category_limits (budget_goal_id, category_id);

CREATE INDEX idx_budget_category_limits_goal_id
  ON public.budget_category_limits USING btree (budget_goal_id);

CREATE INDEX idx_budget_adjustments_goal_date
  ON public.budget_adjustments USING btree (budget_goal_id, date);

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------

-- budget_goals (has direct org_id)
ALTER TABLE public.budget_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "budget_goals: org isolation select"
  ON public.budget_goals FOR SELECT
  TO authenticated
  USING (
    org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid
  );

CREATE POLICY "budget_goals: org isolation insert"
  ON public.budget_goals FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid
  );

CREATE POLICY "budget_goals: org isolation update"
  ON public.budget_goals FOR UPDATE
  TO authenticated
  USING (
    org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid
  );

CREATE POLICY "budget_goals: org isolation delete"
  ON public.budget_goals FOR DELETE
  TO authenticated
  USING (
    org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid
  );

-- budget_category_limits (child table — check via subquery on budget_goals.org_id)
ALTER TABLE public.budget_category_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "budget_category_limits: org isolation select"
  ON public.budget_category_limits FOR SELECT
  TO authenticated
  USING (
    budget_goal_id IN (
      SELECT id FROM public.budget_goals
      WHERE org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid
    )
  );

CREATE POLICY "budget_category_limits: org isolation insert"
  ON public.budget_category_limits FOR INSERT
  TO authenticated
  WITH CHECK (
    budget_goal_id IN (
      SELECT id FROM public.budget_goals
      WHERE org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid
    )
  );

CREATE POLICY "budget_category_limits: org isolation update"
  ON public.budget_category_limits FOR UPDATE
  TO authenticated
  USING (
    budget_goal_id IN (
      SELECT id FROM public.budget_goals
      WHERE org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid
    )
  );

CREATE POLICY "budget_category_limits: org isolation delete"
  ON public.budget_category_limits FOR DELETE
  TO authenticated
  USING (
    budget_goal_id IN (
      SELECT id FROM public.budget_goals
      WHERE org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid
    )
  );

-- budget_adjustments (child table — check via subquery on budget_goals.org_id)
ALTER TABLE public.budget_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "budget_adjustments: org isolation select"
  ON public.budget_adjustments FOR SELECT
  TO authenticated
  USING (
    budget_goal_id IN (
      SELECT id FROM public.budget_goals
      WHERE org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid
    )
  );

CREATE POLICY "budget_adjustments: org isolation insert"
  ON public.budget_adjustments FOR INSERT
  TO authenticated
  WITH CHECK (
    budget_goal_id IN (
      SELECT id FROM public.budget_goals
      WHERE org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid
    )
  );

CREATE POLICY "budget_adjustments: org isolation update"
  ON public.budget_adjustments FOR UPDATE
  TO authenticated
  USING (
    budget_goal_id IN (
      SELECT id FROM public.budget_goals
      WHERE org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid
    )
  );

CREATE POLICY "budget_adjustments: org isolation delete"
  ON public.budget_adjustments FOR DELETE
  TO authenticated
  USING (
    budget_goal_id IN (
      SELECT id FROM public.budget_goals
      WHERE org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid
    )
  );
