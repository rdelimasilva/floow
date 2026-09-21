-- supabase/migrations/00047_forecast_match_proposals.sql
-- =============================================================================
-- Conciliação previsto×realizado passa a pedir aprovação
-- -----------------------------------------------------------------------------
-- `matchForecastsForAccount` gravava `transactions.matched_transaction_id`
-- direto depois de cada sync: a previsão era declarada cumprida sem ninguém
-- olhar. O risco não é simétrico — casar errado ESCONDE um lançamento de
-- verdade (a previsão sai da fila e o realizado fica sozinho no saldo), e não
-- casar só deixa a previsão pedindo ação.
--
-- Agora o sync propõe e o usuário decide. `matched_transaction_id` continua
-- sendo a única verdade do "conciliado" — quem lê saldo e selo não precisa
-- saber que propostas existem.
--
-- Ver docs/superpowers/specs/2026-09-21-forecast-match-approval-gate-design.md
-- =============================================================================

CREATE TABLE public.forecast_match_proposals (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  forecast_transaction_id  uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  realized_transaction_id  uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  status                   text NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'approved', 'refused')),
  proposed_at              timestamptz NOT NULL DEFAULT now(),
  decided_at               timestamptz
);

CREATE INDEX idx_fmp_org_status ON public.forecast_match_proposals(org_id, status);

-- O par recusado nunca volta a ser proposto: o criador insere com
-- ON CONFLICT DO NOTHING, então a recusa é uma parede e não uma checagem.
CREATE UNIQUE INDEX uq_fmp_par
  ON public.forecast_match_proposals(forecast_transaction_id, realized_transaction_id);

-- Uma proposta aberta por previsão.
CREATE UNIQUE INDEX uq_fmp_previsao_pendente
  ON public.forecast_match_proposals(forecast_transaction_id)
  WHERE status = 'pending';

-- Um realizado não é reivindicado por duas previsões ao mesmo tempo. Espelha
-- idx_transactions_matched_unique da 00042.
CREATE UNIQUE INDEX uq_fmp_realizado_pendente
  ON public.forecast_match_proposals(realized_transaction_id)
  WHERE status = 'pending';

ALTER TABLE public.forecast_match_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "forecast_match_proposals: members can select"
  ON public.forecast_match_proposals FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "forecast_match_proposals: members can insert"
  ON public.forecast_match_proposals FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "forecast_match_proposals: members can update"
  ON public.forecast_match_proposals FOR UPDATE TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "forecast_match_proposals: members can delete"
  ON public.forecast_match_proposals FOR DELETE TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

COMMENT ON TABLE public.forecast_match_proposals IS
  'Par previsto x realizado que o sistema propoe. Aprovar grava matched_transaction_id na previsao; recusar barra aquele par para sempre.';
