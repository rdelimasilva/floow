-- supabase/migrations/00062_gasto_com_claude_por_org.sql
-- =============================================================================
-- Gasto com o Claude por org, por mês
-- -----------------------------------------------------------------------------
-- A sugestão de categoria da fila chama o Claude com a chave única do floow.
-- Esta tabela soma o custo de cada chamada por org e mês (fuso de São Paulo),
-- e o código para de chamar quando a org passa de US$ 0,50 no mês.
--
-- Custo em micro-dólares (1 USD = 1.000.000) para somar inteiro, sem float.
-- Só o backend escreve (roda na importação, sem usuário); membros leem.
--
-- Idempotente: pode rodar de novo sem erro.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.llm_usage (
  org_id           uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  month            date NOT NULL,
  cost_micro_usd   bigint NOT NULL DEFAULT 0 CHECK (cost_micro_usd >= 0),
  calls            integer NOT NULL DEFAULT 0,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, month)
);

ALTER TABLE public.llm_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "llm_usage: members can select" ON public.llm_usage;
CREATE POLICY "llm_usage: members can select"
  ON public.llm_usage FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));
