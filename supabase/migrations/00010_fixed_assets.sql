-- =============================================================================
-- Fixed Assets Module — Types + Assets tables with RLS
-- =============================================================================

CREATE TABLE public.fixed_asset_types (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid REFERENCES public.orgs(id) ON DELETE CASCADE,
  name       text NOT NULL,
  is_system  boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fixed_asset_types_org_id ON public.fixed_asset_types(org_id);

ALTER TABLE public.fixed_asset_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fixed_asset_types: members can select own and system"
  ON public.fixed_asset_types FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()) OR org_id IS NULL);

CREATE POLICY "fixed_asset_types: members can insert"
  ON public.fixed_asset_types FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "fixed_asset_types: members can update"
  ON public.fixed_asset_types FOR UPDATE
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()) OR org_id IS NULL);

CREATE POLICY "fixed_asset_types: members can delete"
  ON public.fixed_asset_types FOR DELETE
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

INSERT INTO public.fixed_asset_types (id, org_id, name, is_system)
VALUES
  (gen_random_uuid(), NULL, 'Imóvel',   true),
  (gen_random_uuid(), NULL, 'Veículo',  true),
  (gen_random_uuid(), NULL, 'Outro',    true);

CREATE TABLE public.fixed_assets (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  type_id              uuid NOT NULL REFERENCES public.fixed_asset_types(id),
  name                 text NOT NULL,
  purchase_value_cents integer NOT NULL,
  purchase_date        date NOT NULL,
  current_value_cents  integer NOT NULL,
  current_value_date   date NOT NULL,
  annual_rate          numeric(7,4) NOT NULL,
  address              text,
  license_plate        text,
  model                text,
  is_active            boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fixed_assets_org_id ON public.fixed_assets(org_id);

ALTER TABLE public.fixed_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fixed_assets: members can select"
  ON public.fixed_assets FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "fixed_assets: members can insert"
  ON public.fixed_assets FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "fixed_assets: members can update"
  ON public.fixed_assets FOR UPDATE
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "fixed_assets: members can delete"
  ON public.fixed_assets FOR DELETE
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));
