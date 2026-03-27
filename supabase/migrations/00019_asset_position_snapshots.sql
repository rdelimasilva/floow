-- Materialized per-asset positions to avoid recomputing the full portfolio on every request.

CREATE TABLE public.asset_position_snapshots (
  asset_id uuid PRIMARY KEY REFERENCES public.assets(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  quantity_held integer NOT NULL,
  avg_cost_cents integer NOT NULL,
  total_cost_cents integer NOT NULL,
  current_price_cents integer NOT NULL,
  current_value_cents integer NOT NULL,
  unrealized_pnl_cents integer NOT NULL,
  unrealized_pnl_percent_bps integer NOT NULL,
  realized_pnl_cents integer NOT NULL,
  total_dividends_cents integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_asset_position_snapshots_org_id
  ON public.asset_position_snapshots USING btree (org_id);

CREATE INDEX idx_asset_position_snapshots_org_value
  ON public.asset_position_snapshots USING btree (org_id, current_value_cents);

CREATE UNIQUE INDEX uq_asset_position_snapshots_asset_org
  ON public.asset_position_snapshots USING btree (asset_id, org_id);

ALTER TABLE public.asset_position_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "asset_position_snapshots: members can select"
  ON public.asset_position_snapshots FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "asset_position_snapshots: members can insert"
  ON public.asset_position_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "asset_position_snapshots: members can update"
  ON public.asset_position_snapshots FOR UPDATE
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "asset_position_snapshots: members can delete"
  ON public.asset_position_snapshots FOR DELETE
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));
