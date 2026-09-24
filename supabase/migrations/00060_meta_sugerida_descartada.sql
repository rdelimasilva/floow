-- supabase/migrations/00060_meta_sugerida_descartada.sql
-- =============================================================================
-- Sugestão de meta descartada
-- -----------------------------------------------------------------------------
-- O Plano de Gastos sugere meta para categoria sem meta, pela mediana do gasto
-- mensal. "Descartar" grava a categoria aqui e a sugestão não volta para
-- aquela org. Apagar a categoria apaga o descarte junto.
--
-- Idempotente: pode rodar de novo sem erro.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.budget_goal_suggestion_dismissals (
  org_id       uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  category_id  uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, category_id)
);

ALTER TABLE public.budget_goal_suggestion_dismissals ENABLE ROW LEVEL SECURITY;

-- Padrão da 00026: a chave no JWT é o ARRAY `org_ids`.
DROP POLICY IF EXISTS "budget_goal_suggestion_dismissals: members can select" ON public.budget_goal_suggestion_dismissals;
CREATE POLICY "budget_goal_suggestion_dismissals: members can select"
  ON public.budget_goal_suggestion_dismissals FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

DROP POLICY IF EXISTS "budget_goal_suggestion_dismissals: members can insert" ON public.budget_goal_suggestion_dismissals;
CREATE POLICY "budget_goal_suggestion_dismissals: members can insert"
  ON public.budget_goal_suggestion_dismissals FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

DROP POLICY IF EXISTS "budget_goal_suggestion_dismissals: members can delete" ON public.budget_goal_suggestion_dismissals;
CREATE POLICY "budget_goal_suggestion_dismissals: members can delete"
  ON public.budget_goal_suggestion_dismissals FOR DELETE TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));
