-- =============================================================================
-- faturas_do_banco: fatura fechada do cartão como o banco informa
-- -----------------------------------------------------------------------------
-- O sync grava o que o endpoint de faturas da Polp devolve: fechamento,
-- vencimento e total. A fatura fechada passa a mostrar esse total, que vale
-- mais que a soma dos lançamentos (agosto do Master Black: o PDF soma
-- R$ 14.004,29, a lista da Polp R$ 13.904,29 — duas cobranças de R$ 50
-- faltando). A fatura aberta é prevista a partir dele (ver
-- packages/core-finance/src/fatura.ts).
--
-- APLICAR ANTES DO DEPLOY: o sync grava aqui e a fatura do extrato lê daqui.
-- Rollback do código: o antigo ignora a tabela.
-- Idempotente.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.faturas_do_banco (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  account_id   uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  bill_id      text NOT NULL,
  fechamento   date NOT NULL,
  vencimento   date NOT NULL,
  total_cents  integer NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_faturas_do_banco_conta_bill
  ON public.faturas_do_banco (account_id, bill_id);

ALTER TABLE public.faturas_do_banco ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "faturas_do_banco: members can select" ON public.faturas_do_banco;
CREATE POLICY "faturas_do_banco: members can select"
  ON public.faturas_do_banco FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));
