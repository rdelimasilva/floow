-- supabase/migrations/00053_investimentos_open_finance.sql
-- =============================================================================
-- Investimentos via Open Finance (Polp)
-- -----------------------------------------------------------------------------
-- Ver docs/superpowers/specs/2026-09-23-openfinance-investimentos-design.md
--
-- A carteira passa a ter duas origens. O ativo manual segue como sempre:
-- posição calculada pelos eventos. O ativo do banco tem a posição que o BANCO
-- informa (asset_bank_positions), porque o histórico de movimentações do Open
-- Finance cobre ~12 meses e reconstruir pelos eventos divergiria.
--
-- quantity vira numeric: cota de fundo e fração de título não são inteiras.
-- =============================================================================

CREATE TYPE public.asset_source AS ENUM ('manual', 'openfinance');

ALTER TYPE public.asset_class ADD VALUE IF NOT EXISTS 'fund';
ALTER TYPE public.asset_class ADD VALUE IF NOT EXISTS 'treasury';
ALTER TYPE public.asset_class ADD VALUE IF NOT EXISTS 'credit_fixed_income';

ALTER TYPE public.event_type ADD VALUE IF NOT EXISTS 'come_cotas';
ALTER TYPE public.event_type ADD VALUE IF NOT EXISTS 'jcp';
ALTER TYPE public.event_type ADD VALUE IF NOT EXISTS 'maturity';
ALTER TYPE public.event_type ADD VALUE IF NOT EXISTS 'tax';
ALTER TYPE public.event_type ADD VALUE IF NOT EXISTS 'other';

ALTER TABLE public.assets
  ALTER COLUMN ticker DROP NOT NULL,
  ADD COLUMN source             public.asset_source NOT NULL DEFAULT 'manual',
  ADD COLUMN asset_subtype      text,
  ADD COLUMN isin               text,
  ADD COLUMN cnpj               text,
  ADD COLUMN issuer_name        text,
  ADD COLUMN indexer            text,
  ADD COLUMN pre_fixed_rate     numeric(28, 10),
  ADD COLUMN indexer_percentage numeric(28, 10),
  ADD COLUMN due_date           date;

ALTER TABLE public.portfolio_events
  ALTER COLUMN quantity TYPE numeric(28, 10) USING quantity::numeric,
  ADD COLUMN unit_price          numeric(28, 10),
  ADD COLUMN polp_transaction_id text,
  ADD COLUMN gross_cents         integer,
  ADD COLUMN net_cents           integer,
  ADD COLUMN income_tax_cents    integer;

CREATE UNIQUE INDEX uq_portfolio_events_polp_tx
  ON public.portfolio_events(polp_transaction_id);

ALTER TABLE public.asset_position_snapshots
  ALTER COLUMN quantity_held TYPE numeric(28, 10) USING quantity_held::numeric,
  ADD COLUMN cost_is_partial boolean NOT NULL DEFAULT false;

ALTER TABLE public.openfinance_resources
  ADD COLUMN asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL;

ALTER TABLE public.openfinance_connections
  ADD COLUMN investment_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX uq_openfinance_resources_asset
  ON public.openfinance_resources(asset_id) WHERE asset_id IS NOT NULL;

CREATE TABLE public.asset_bank_positions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  asset_id            uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  reference_date      date NOT NULL,
  quantity            numeric(28, 10),
  unit_price          numeric(28, 10),
  gross_cents         integer,
  net_cents           integer,
  income_tax_cents    integer,
  iof_cents           integer,
  blocked_cents       integer,
  purchase_unit_price numeric(28, 10),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_asset_bank_positions_asset_date
  ON public.asset_bank_positions(asset_id, reference_date);
CREATE INDEX idx_asset_bank_positions_org ON public.asset_bank_positions(org_id);

ALTER TABLE public.asset_bank_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "asset_bank_positions: members can select"
  ON public.asset_bank_positions FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "asset_bank_positions: members can insert"
  ON public.asset_bank_positions FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "asset_bank_positions: members can update"
  ON public.asset_bank_positions FOR UPDATE TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "asset_bank_positions: members can delete"
  ON public.asset_bank_positions FOR DELETE TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

COMMENT ON TABLE public.asset_bank_positions IS
  'Posicao informada pelo banco via Open Finance, uma linha por dia de referencia. Fonte da verdade do valor de ativo com source = openfinance.';
