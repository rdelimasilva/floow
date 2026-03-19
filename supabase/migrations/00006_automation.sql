-- =============================================================================
-- Floow Automation Foundation Migration 00006
-- Automation schema: category_rules, recurring_templates
-- Alters transactions table to add recurring_template_id column
-- Includes GIN index for text search, RLS policies (matching 00005 pattern)
-- pg_trgm extension enables fast ILIKE queries for category rule matching
-- =============================================================================

-- Enable pg_trgm for GIN text search index on category_rules.match_value
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ----------------------------------------------------------------------------
-- TABLES
-- ----------------------------------------------------------------------------

CREATE TABLE public.category_rules (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  category_id  uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  match_type   text NOT NULL CHECK (match_type IN ('contains', 'exact')),
  match_value  text NOT NULL,
  priority     integer NOT NULL DEFAULT 0,
  is_enabled   boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.recurring_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  account_id    uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  category_id   uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  type          transaction_type NOT NULL,
  amount_cents  integer NOT NULL,
  description   text NOT NULL,
  frequency     text NOT NULL CHECK (frequency IN ('daily','weekly','biweekly','monthly','quarterly','yearly')),
  next_due_date date NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ALTER transactions: add recurring_template_id (must follow recurring_templates CREATE TABLE)
ALTER TABLE public.transactions
  ADD COLUMN recurring_template_id uuid REFERENCES public.recurring_templates(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- INDEXES
-- ----------------------------------------------------------------------------

-- Partial unique index: prevents duplicate transaction generation for the same template + date
CREATE UNIQUE INDEX uq_generated_transactions
  ON public.transactions (recurring_template_id, date)
  WHERE recurring_template_id IS NOT NULL;

-- RLS performance index for category_rules
CREATE INDEX idx_category_rules_org_id
  ON public.category_rules USING btree (org_id);

-- GIN index for fast ILIKE text matching on category rules (used in Phase 6 server actions)
CREATE INDEX idx_category_rules_match_value
  ON public.category_rules USING gin (match_value gin_trgm_ops);

-- RLS performance index for recurring_templates
CREATE INDEX idx_recurring_templates_org_id
  ON public.recurring_templates USING btree (org_id);

-- Upcoming-due queries index (Phase 7: list templates due within N days)
CREATE INDEX idx_recurring_templates_next_due_date
  ON public.recurring_templates USING btree (next_due_date);

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- Enable RLS on both automation tables — enforces multi-tenant isolation at DB level
-- Pattern: org_id IN (SELECT public.get_user_org_ids()) — matching 00005 pattern
-- ----------------------------------------------------------------------------

-- category_rules
ALTER TABLE public.category_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "category_rules: members can select"
  ON public.category_rules FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "category_rules: members can insert"
  ON public.category_rules FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "category_rules: members can update"
  ON public.category_rules FOR UPDATE
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "category_rules: members can delete"
  ON public.category_rules FOR DELETE
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

-- recurring_templates
ALTER TABLE public.recurring_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recurring_templates: members can select"
  ON public.recurring_templates FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "recurring_templates: members can insert"
  ON public.recurring_templates FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "recurring_templates: members can update"
  ON public.recurring_templates FOR UPDATE
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "recurring_templates: members can delete"
  ON public.recurring_templates FOR DELETE
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));
