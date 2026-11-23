-- =============================================================================
-- Previsão de recorrência sai do saldo
-- -----------------------------------------------------------------------------
-- Editar uma previsão de recorrência com a data já passada a punha no saldo
-- (`deveAplicarSaldoNaEdicao` devolvia true para template com data vencida).
-- Duas consequências: a conta contava a previsão e o realizado, e a previsão
-- sumia da conciliação, que só procura previsão fora do saldo. Caso real:
-- "Energia (2/61)" de R$ 250,00 em 17/11, com a Enel de R$ 234,44 no mesmo
-- dia sem ter com quem casar.
--
-- A regra do app é que previsão de template nunca entra no saldo; quem soma é
-- o realizado que a cumpre (`applyDueBankTransactions`). Esta migration leva
-- ao estado que a edição deveria ter deixado: tira do saldo da conta o valor
-- de toda previsão de template aplicada e a marca como fora do saldo.
-- Genérica, para todas as orgs. Ignorada não estava somando na conta, então
-- só a marca muda.
--
-- Idempotente. Renumerar se outra migration 00086 entrar antes.
-- =============================================================================

WITH fora AS (
  UPDATE public.transactions
  SET balance_applied = false
  WHERE recurring_template_id IS NOT NULL
    AND balance_applied = true
  RETURNING account_id, amount_cents, is_ignored
),
por_conta AS (
  SELECT account_id, SUM(amount_cents) AS total
  FROM fora
  WHERE NOT is_ignored
  GROUP BY account_id
)
UPDATE public.accounts a
SET balance_cents = a.balance_cents - p.total
FROM por_conta p
WHERE a.id = p.account_id;
