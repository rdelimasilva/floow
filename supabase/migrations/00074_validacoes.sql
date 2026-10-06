-- =============================================================================
-- validacoes: toda decisão de categoria vira um registro
-- -----------------------------------------------------------------------------
-- Entrega 1 da Conciliação v1 (docs/superpowers/specs/
-- 2026-10-06-conciliacao-v1-validacao-assistida-design.md). Mede quanto o
-- palpite acerta antes de qualquer automação nova.
--
-- APLICAR ANTES DO DEPLOY: o código grava o evento na mesma transação da
-- decisão; sem a tabela, classificar no card falha.
-- Rollback do código: o antigo ignora a tabela.
-- Idempotente.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.validacoes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  transaction_id        uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  counterparty_id       uuid REFERENCES public.counterparties(id) ON DELETE SET NULL,
  user_id               uuid,
  acao                  text NOT NULL CHECK (acao IN ('confirmar','corrigir','regra','vinculo','edicao','legado')),
  sugestao_categoria_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  sugestao_origem       text CHECK (sugestao_origem IN ('historico','claude')),
  natureza              text NOT NULL CHECK (natureza IN ('income','expense','transfer')),
  categoria_id          uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_validacoes_contraparte
  ON public.validacoes (org_id, counterparty_id, created_at);

-- Semeadura uma vez só por lançamento.
CREATE UNIQUE INDEX IF NOT EXISTS uq_validacoes_legado
  ON public.validacoes (transaction_id) WHERE acao = 'legado';

ALTER TABLE public.validacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "validacoes: members can select" ON public.validacoes;
CREATE POLICY "validacoes: members can select"
  ON public.validacoes FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

-- 24 meses de decisões já tomadas. created_at = data do lançamento, para a
-- janela de 30 dias das métricas não tratar o histórico como recente.
INSERT INTO public.validacoes (org_id, transaction_id, counterparty_id, acao, natureza, categoria_id, created_at)
SELECT t.org_id, t.id, t.counterparty_id, 'legado', t.type::text, t.category_id, t.date::timestamptz
FROM public.transactions t
WHERE t.review_state = 'confirmed'
  AND t.is_ignored = false
  AND t.counterparty_id IS NOT NULL
  AND t.date >= now() - interval '24 months'
ON CONFLICT (transaction_id) WHERE acao = 'legado' DO NOTHING;
