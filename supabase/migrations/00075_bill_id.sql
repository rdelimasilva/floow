-- =============================================================================
-- transactions.bill_id: a fatura em que o banco fechou o lançamento do cartão
-- -----------------------------------------------------------------------------
-- A Polp manda `bill_id` em cada transação de cartão de fatura já fechada. É o
-- que diz, sem adivinhar, que compras compõem cada fatura: o dia real de
-- fechamento varia, e pelo dia cadastrado a compra da virada ia para a fatura
-- errada (setembro do Master Black: R$ 11.642,54 calculado, R$ 11.685,40 pago;
-- pelo bill_id, o valor pago exato). O sync preenche o histórico sozinho.
--
-- APLICAR ANTES DO DEPLOY: o schema do Drizzle passa a ter a coluna, e
-- consulta que seleciona a linha inteira falha sem ela.
-- Rollback do código: o antigo ignora a coluna.
-- Idempotente.
-- =============================================================================

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS bill_id text;
