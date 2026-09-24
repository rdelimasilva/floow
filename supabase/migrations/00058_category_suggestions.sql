-- supabase/migrations/00058_category_suggestions.sql
-- =============================================================================
-- Sugestões de categoria a partir dos gastos de 12 meses
-- -----------------------------------------------------------------------------
-- Uma rotina semanal (e um botão na tela de metas) agrupa os gastos por
-- estabelecimento e sugere categorias novas. A tabela guarda o status para
-- que uma sugestão recusada nunca volte. Ver
-- docs/superpowers/specs/2026-09-24-sugestao-de-categorias-design.md.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.category_suggestions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  kind                text NOT NULL CHECK (kind IN ('uncategorized', 'split')),
  fingerprint         text NOT NULL,
  suggested_name      text NOT NULL,
  parent_category_id  uuid REFERENCES public.categories(id) ON DELETE CASCADE,
  -- De onde os lançamentos saem no aceite. No tipo 'uncategorized' os sem
  -- categoria (NULL) entram sempre, além destes ids.
  source_category_ids uuid[] NOT NULL DEFAULT '{}',
  merchant_key        text NOT NULL,
  -- Termo da regra `contains`; NULL = o aceite só recategoriza o histórico.
  match_value         text,
  tx_count            integer NOT NULL,
  total_cents         bigint NOT NULL,
  monthly_avg_cents   bigint NOT NULL,
  status              text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'accepted', 'dismissed')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_category_suggestions_org_status
  ON public.category_suggestions(org_id, status);

ALTER TABLE public.category_suggestions ENABLE ROW LEVEL SECURITY;

-- Padrão da 00026: a chave no JWT é o ARRAY `org_ids`.
CREATE POLICY "category_suggestions: members can select"
  ON public.category_suggestions FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "category_suggestions: members can insert"
  ON public.category_suggestions FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "category_suggestions: members can update"
  ON public.category_suggestions FOR UPDATE TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "category_suggestions: members can delete"
  ON public.category_suggestions FOR DELETE TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));
