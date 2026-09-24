-- =============================================================================
-- Código Polp segue a reatribuição — Migration 00052
-- =============================================================================
--
-- Excluir uma categoria com reatribuição move transações, recorrências,
-- orçamentos, dívidas e regras para o destino, mas o `polp_ref` ficava na
-- categoria excluída (ou escondida). A ingestão resolve `category_ref` por
-- `polp_ref` e ignora categoria escondida, então as próximas transações com
-- aquele código chegavam sem categoria.
--
-- Esta tabela guarda, por org, para onde vai cada código cuja categoria saiu.
-- Ela vence o `polp_ref` das categorias na hora de importar.

CREATE TABLE IF NOT EXISTS public.polp_ref_redirects (
  org_id      uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  polp_ref    text NOT NULL,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, polp_ref)
);

COMMENT ON TABLE public.polp_ref_redirects IS
  'Para qual categoria vai um código Polp (category_ref) cuja categoria a org excluiu com reatribuição.';

ALTER TABLE public.polp_ref_redirects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "polp_ref_redirects: members can select" ON public.polp_ref_redirects;
DROP POLICY IF EXISTS "polp_ref_redirects: members can insert" ON public.polp_ref_redirects;
DROP POLICY IF EXISTS "polp_ref_redirects: members can update" ON public.polp_ref_redirects;
DROP POLICY IF EXISTS "polp_ref_redirects: members can delete" ON public.polp_ref_redirects;

CREATE POLICY "polp_ref_redirects: members can select"
  ON public.polp_ref_redirects FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "polp_ref_redirects: members can insert"
  ON public.polp_ref_redirects FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "polp_ref_redirects: members can update"
  ON public.polp_ref_redirects FOR UPDATE TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "polp_ref_redirects: members can delete"
  ON public.polp_ref_redirects FOR DELETE TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));
