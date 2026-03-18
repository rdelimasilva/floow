-- =============================================================================
-- Floow Planning Engine Migration 00005
-- Planning schema: retirement_plans, withdrawal_strategies, succession_plans, heirs
-- Includes RLS policies (matching 00002/00003 pattern)
-- One plan per org: unique index on org_id for retirement_plans, withdrawal_strategies,
-- and succession_plans enables ON CONFLICT DO UPDATE (upsert) pattern.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- TABLES
-- ----------------------------------------------------------------------------

CREATE TABLE public.retirement_plans (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                      uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  current_age                 integer NOT NULL,
  retirement_age              integer NOT NULL,
  life_expectancy             integer NOT NULL DEFAULT 85,
  monthly_contribution_cents  integer NOT NULL,
  desired_monthly_income_cents integer NOT NULL,
  inflation_rate              numeric(5, 4) NOT NULL DEFAULT 0.04,
  -- Scenario overrides — NULL = use system preset (conservative/base/aggressive)
  conservative_return_rate    numeric(5, 4),
  base_return_rate            numeric(5, 4),
  aggressive_return_rate      numeric(5, 4),
  contribution_growth_rate    numeric(5, 4),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.withdrawal_strategies (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                      uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  mode                        text NOT NULL,  -- 'fixed' | 'percentage'
  fixed_monthly_amount_cents  integer,
  percentage_rate             numeric(5, 4),
  liquidation_preset          text NOT NULL DEFAULT 'income_preserving',
  custom_liquidation_order    text,  -- JSON array of asset classes
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.succession_plans (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                          uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  brazilian_state                 text,  -- e.g. 'SP', 'RJ' — for ITCMD rate lookup
  estimated_funeral_costs_cents   integer NOT NULL DEFAULT 1500000,
  estimated_legal_fees_cents      integer NOT NULL DEFAULT 500000,
  additional_liabilities_cents    integer NOT NULL DEFAULT 0,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.heirs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  succession_plan_id  uuid NOT NULL REFERENCES public.succession_plans(id) ON DELETE CASCADE,
  org_id              uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  name                text NOT NULL,
  relationship        text NOT NULL,  -- e.g. 'filho', 'cônjuge', 'outro'
  percentage_share    numeric(5, 2) NOT NULL,  -- 0-100
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- UNIQUE INDEXES — one plan per org (enables ON CONFLICT DO UPDATE upsert)
-- ----------------------------------------------------------------------------

CREATE UNIQUE INDEX uq_retirement_plans_org_id ON public.retirement_plans (org_id);
CREATE UNIQUE INDEX uq_withdrawal_strategies_org_id ON public.withdrawal_strategies (org_id);
CREATE UNIQUE INDEX uq_succession_plans_org_id ON public.succession_plans (org_id);

-- ----------------------------------------------------------------------------
-- INDEXES — performance for RLS org_id filtering
-- Without these, RLS causes full table scans on large tables
-- ----------------------------------------------------------------------------

CREATE INDEX idx_retirement_plans_org_id ON public.retirement_plans USING btree (org_id);
CREATE INDEX idx_withdrawal_strategies_org_id ON public.withdrawal_strategies USING btree (org_id);
CREATE INDEX idx_succession_plans_org_id ON public.succession_plans USING btree (org_id);
CREATE INDEX idx_heirs_org_id ON public.heirs USING btree (org_id);
CREATE INDEX idx_heirs_succession_plan_id ON public.heirs USING btree (succession_plan_id);

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- Enable RLS on ALL tables — enforces multi-tenant isolation at DB level
-- Pattern: org_id IN (SELECT public.get_user_org_ids()) — matching 00002/00003 pattern
-- ----------------------------------------------------------------------------

-- retirement_plans
ALTER TABLE public.retirement_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "retirement_plans: members can select"
  ON public.retirement_plans FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "retirement_plans: members can insert"
  ON public.retirement_plans FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "retirement_plans: members can update"
  ON public.retirement_plans FOR UPDATE
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "retirement_plans: members can delete"
  ON public.retirement_plans FOR DELETE
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

-- withdrawal_strategies
ALTER TABLE public.withdrawal_strategies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "withdrawal_strategies: members can select"
  ON public.withdrawal_strategies FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "withdrawal_strategies: members can insert"
  ON public.withdrawal_strategies FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "withdrawal_strategies: members can update"
  ON public.withdrawal_strategies FOR UPDATE
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "withdrawal_strategies: members can delete"
  ON public.withdrawal_strategies FOR DELETE
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

-- succession_plans
ALTER TABLE public.succession_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "succession_plans: members can select"
  ON public.succession_plans FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "succession_plans: members can insert"
  ON public.succession_plans FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "succession_plans: members can update"
  ON public.succession_plans FOR UPDATE
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "succession_plans: members can delete"
  ON public.succession_plans FOR DELETE
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

-- heirs
ALTER TABLE public.heirs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "heirs: members can select"
  ON public.heirs FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "heirs: members can insert"
  ON public.heirs FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "heirs: members can update"
  ON public.heirs FOR UPDATE
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "heirs: members can delete"
  ON public.heirs FOR DELETE
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));
