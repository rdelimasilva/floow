-- =============================================================================
-- Floow Finance Migration 00002
-- Finance schema: accounts, categories, transactions, patrimony_snapshots
-- Includes RLS policies (matching 00001 pattern) and system category seed
-- =============================================================================

-- ----------------------------------------------------------------------------
-- ENUMS
-- ----------------------------------------------------------------------------

CREATE TYPE account_type AS ENUM ('checking', 'savings', 'brokerage', 'credit_card', 'cash');
CREATE TYPE transaction_type AS ENUM ('income', 'expense', 'transfer');

-- ----------------------------------------------------------------------------
-- TABLES
-- ----------------------------------------------------------------------------

CREATE TABLE public.accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  name          text NOT NULL,
  type          account_type NOT NULL,
  balance_cents integer NOT NULL DEFAULT 0,
  currency      text NOT NULL DEFAULT 'BRL',
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL org_id = system-wide default, visible to all authenticated users
  org_id      uuid REFERENCES public.orgs(id) ON DELETE CASCADE,
  name        text NOT NULL,
  type        transaction_type NOT NULL,
  color       text,
  icon        text,
  is_system   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.transactions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  account_id        uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  category_id       uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  type              transaction_type NOT NULL,
  amount_cents      integer NOT NULL,
  description       text NOT NULL,
  date              date NOT NULL,
  transfer_group_id uuid,
  imported_at       timestamptz,
  external_id       text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.patrimony_snapshots (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  snapshot_date        date NOT NULL,
  net_worth_cents      integer NOT NULL,
  liquid_assets_cents  integer NOT NULL,
  liabilities_cents    integer NOT NULL DEFAULT 0,
  breakdown            text, -- JSON stored as text
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- INDEXES
-- Without these, RLS causes full table scans on large tables
-- ----------------------------------------------------------------------------

CREATE INDEX idx_accounts_org_id ON public.accounts USING btree (org_id);
CREATE INDEX idx_categories_org_id ON public.categories USING btree (org_id);
CREATE INDEX idx_transactions_org_id ON public.transactions USING btree (org_id, account_id, date);
CREATE INDEX idx_transactions_account_id ON public.transactions USING btree (account_id);
CREATE INDEX idx_transactions_date ON public.transactions USING btree (date);
CREATE INDEX idx_patrimony_snapshots_org_id ON public.patrimony_snapshots USING btree (org_id, snapshot_date);

-- CRITICAL: UNIQUE INDEX for ON CONFLICT DO NOTHING import deduplication (Plan 02-03)
-- PostgreSQL treats NULLs as distinct in unique indexes — only non-null external_id rows are affected
CREATE UNIQUE INDEX uq_transactions_external_account
  ON public.transactions (external_id, account_id)
  WHERE external_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- Enable RLS on ALL tables — enforces multi-tenant isolation at DB level
-- Pattern: org_id IN (SELECT public.get_user_org_ids()) — matching 00001 pattern
-- ----------------------------------------------------------------------------

-- accounts: org members can see and manage their org's accounts
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accounts: members can select"
  ON public.accounts FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "accounts: members can insert"
  ON public.accounts FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "accounts: members can update"
  ON public.accounts FOR UPDATE
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "accounts: members can delete"
  ON public.accounts FOR DELETE
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

-- categories: org members can see their org's categories AND system defaults (org_id IS NULL)
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories: members can select own and system"
  ON public.categories FOR SELECT
  TO authenticated
  USING (
    org_id IN (SELECT public.get_user_org_ids())
    OR org_id IS NULL
  );

CREATE POLICY "categories: members can insert"
  ON public.categories FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "categories: members can update"
  ON public.categories FOR UPDATE
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "categories: members can delete"
  ON public.categories FOR DELETE
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

-- transactions: org members can see and manage their org's transactions
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transactions: members can select"
  ON public.transactions FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "transactions: members can insert"
  ON public.transactions FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "transactions: members can update"
  ON public.transactions FOR UPDATE
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "transactions: members can delete"
  ON public.transactions FOR DELETE
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

-- patrimony_snapshots: org members can see and manage their org's snapshots
ALTER TABLE public.patrimony_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "patrimony_snapshots: members can select"
  ON public.patrimony_snapshots FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "patrimony_snapshots: members can insert"
  ON public.patrimony_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "patrimony_snapshots: members can update"
  ON public.patrimony_snapshots FOR UPDATE
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "patrimony_snapshots: members can delete"
  ON public.patrimony_snapshots FOR DELETE
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

-- ----------------------------------------------------------------------------
-- SYSTEM CATEGORIES SEED (11 categories)
-- org_id = NULL means system-wide (visible to all authenticated users)
-- is_system = true marks these as non-deletable defaults
-- ----------------------------------------------------------------------------

INSERT INTO public.categories (id, org_id, name, type, color, icon, is_system)
VALUES
  -- Income categories
  (gen_random_uuid(), NULL, 'Salario',        'income',  '#22c55e', 'briefcase',    true),
  (gen_random_uuid(), NULL, 'Freelance',      'income',  '#16a34a', 'laptop',       true),
  (gen_random_uuid(), NULL, 'Investimentos',  'income',  '#15803d', 'trending-up',  true),

  -- Expense categories
  (gen_random_uuid(), NULL, 'Aluguel',        'expense', '#ef4444', 'home',         true),
  (gen_random_uuid(), NULL, 'Alimentacao',    'expense', '#f97316', 'utensils',     true),
  (gen_random_uuid(), NULL, 'Transporte',     'expense', '#eab308', 'car',          true),
  (gen_random_uuid(), NULL, 'Saude',          'expense', '#ec4899', 'heart',        true),
  (gen_random_uuid(), NULL, 'Educacao',       'expense', '#8b5cf6', 'book',         true),
  (gen_random_uuid(), NULL, 'Lazer',          'expense', '#06b6d4', 'gamepad-2',    true),
  (gen_random_uuid(), NULL, 'Assinaturas',    'expense', '#6366f1', 'credit-card',  true),
  (gen_random_uuid(), NULL, 'Outros',         'expense', '#6b7280', 'more-horizontal', true);
