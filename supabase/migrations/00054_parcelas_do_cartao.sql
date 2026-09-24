-- supabase/migrations/00054_parcelas_do_cartao.sql
-- =============================================================================
-- Parcelas do cartão como eventos futuros
-- -----------------------------------------------------------------------------
-- A Polp manda cada parcela como uma transação, todas com a data da compra.
-- A importação gravava assim e com balance_applied = true: as 10 parcelas de
-- uma compra 10x contavam no mês da compra e já estavam no saldo do cartão.
--
-- Daqui em diante a parcela vale no vencimento da fatura (bill_post_date) e a
-- data da compra fica em purchase_date. Este arquivo cria as colunas e corrige
-- o que já entrou: data vira o vencimento, e a parcela que ficou no futuro
-- sai do saldo e volta a balance_applied = false — applyDueBankTransactions a
-- aplica de novo quando o dia chegar.
-- =============================================================================

BEGIN;

ALTER TABLE public.transactions
  ADD COLUMN purchase_date date,
  ADD COLUMN is_installment_forecast boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.transactions.purchase_date IS
  'Data da compra de parcela de cartao; a date da parcela e o vencimento da fatura.';
COMMENT ON COLUMN public.transactions.is_installment_forecast IS
  'Parcela prevista pelo floow porque o banco ainda nao a mandou. Nunca entra no saldo.';

CREATE INDEX idx_transactions_installment_key
  ON public.transactions (account_id, purchase_date, installment_total, installment_number);

-- Estorno primeiro, enquanto purchase_date ainda é NULL e identifica o alvo.
-- Ignorada fica de fora: toggleIgnoreTransaction já tirou o valor dela do
-- saldo e manteve balance_applied = true; estornar de novo tiraria duas vezes.
-- Despesa é negativa: subtrair a soma devolve o valor ao saldo.
-- Sem fatura fechada, a parcela vai para o dia 1 do mês previsto; o sync corrige o dia depois,
-- porque a parcela futura fica fora do saldo.
WITH hoje AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d),
estorno AS (
  SELECT t.account_id, SUM(t.amount_cents) AS soma
  FROM public.transactions t, hoje
  WHERE t.external_id IS NOT NULL
    AND t.installment_total > 1
    AND (t.bill_post_date IS NOT NULL OR t.bill_forecast_month ~ '^\d{4}-(0[1-9]|1[0-2])$')
    AND t.purchase_date IS NULL
    AND t.balance_applied
    AND NOT t.is_ignored
    AND COALESCE(t.bill_post_date, to_date(t.bill_forecast_month || '-01', 'YYYY-MM-DD')) > hoje.d
  GROUP BY t.account_id
)
UPDATE public.accounts a
SET balance_cents = a.balance_cents - e.soma
FROM estorno e
WHERE a.id = e.account_id;

UPDATE public.transactions t
SET purchase_date = t.date,
    date = COALESCE(t.bill_post_date, to_date(t.bill_forecast_month || '-01', 'YYYY-MM-DD')),
    balance_applied = CASE
      WHEN t.is_ignored THEN t.balance_applied
      WHEN COALESCE(t.bill_post_date, to_date(t.bill_forecast_month || '-01', 'YYYY-MM-DD')) > (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN false
      ELSE t.balance_applied
    END
WHERE t.external_id IS NOT NULL
  AND t.installment_total > 1
  AND (t.bill_post_date IS NOT NULL OR t.bill_forecast_month ~ '^\d{4}-(0[1-9]|1[0-2])$')
  AND t.purchase_date IS NULL;

COMMIT;
