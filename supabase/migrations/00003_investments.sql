-- =============================================================================
-- Floow Investments Migration 00003
-- Investment schema: assets, portfolio_events, asset_prices
-- Includes RLS policies (matching 00002 pattern)
-- =============================================================================

-- ----------------------------------------------------------------------------
-- ENUMS
-- ----------------------------------------------------------------------------

CREATE TYPE asset_class AS ENUM (
  'br_equity',
  'fii',
  'etf',
  'crypto',
  'fixed_income',
  'international'
);

CREATE TYPE event_type AS ENUM (
  'buy',
  'sell',
  'dividend',
  'interest',
  'split',
  'amortization'
);

-- ----------------------------------------------------------------------------
-- TABLES
-- ----------------------------------------------------------------------------

CREATE TABLE public.assets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  ticker      text NOT NULL,
  name        text NOT NULL,
  asset_class asset_class NOT NULL,
  currency    text NOT NULL DEFAULT 'BRL',
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.portfolio_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  asset_id        uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  -- Application-level FK to accounts (no DB FK to avoid cross-schema complications)
  account_id      uuid NOT NULL,
  event_type      event_type NOT NULL,
  event_date      date NOT NULL,
  -- null for dividend/interest events (no quantity change)
  quantity        integer,
  -- null for split events (no price)
  price_cents     integer,
  total_cents     integer,
  -- decimal ratio for splits (e.g., 2.0000 for 2-for-1 split)
  split_ratio     numeric(10, 4),
  notes           text,
  -- set after INV-07 integration with transaction engine
  transaction_id  uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.asset_prices (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  asset_id    uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  price_date  date NOT NULL,
  price_cents integer NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- INDEXES
-- Without these, RLS causes full table scans on large tables
-- ----------------------------------------------------------------------------

CREATE INDEX idx_assets_org_id ON public.assets USING btree (org_id);
CREATE INDEX idx_assets_ticker ON public.assets USING btree (org_id, ticker);

CREATE INDEX idx_portfolio_events_org_id ON public.portfolio_events USING btree (org_id);
CREATE INDEX idx_portfolio_events_asset_id ON public.portfolio_events USING btree (asset_id);
CREATE INDEX idx_portfolio_events_date ON public.portfolio_events USING btree (org_id, event_date);

CREATE INDEX idx_asset_prices_asset_date ON public.asset_prices USING btree (asset_id, price_date);

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- Enable RLS on ALL tables — enforces multi-tenant isolation at DB level
-- Pattern: org_id IN (SELECT public.get_user_org_ids()) — matching 00002 pattern
-- ----------------------------------------------------------------------------

-- assets: org members can see and manage their org's assets
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assets: members can select"
  ON public.assets FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "assets: members can insert"
  ON public.assets FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "assets: members can update"
  ON public.assets FOR UPDATE
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "assets: members can delete"
  ON public.assets FOR DELETE
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

-- portfolio_events: org members can see and manage their org's portfolio events
ALTER TABLE public.portfolio_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "portfolio_events: members can select"
  ON public.portfolio_events FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "portfolio_events: members can insert"
  ON public.portfolio_events FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "portfolio_events: members can update"
  ON public.portfolio_events FOR UPDATE
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "portfolio_events: members can delete"
  ON public.portfolio_events FOR DELETE
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

-- asset_prices: org members can see and manage their org's asset prices
ALTER TABLE public.asset_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "asset_prices: members can select"
  ON public.asset_prices FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "asset_prices: members can insert"
  ON public.asset_prices FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "asset_prices: members can update"
  ON public.asset_prices FOR UPDATE
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "asset_prices: members can delete"
  ON public.asset_prices FOR DELETE
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));
