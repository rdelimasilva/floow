-- =============================================================================
-- transactions.ocorrido_em: o instante da transação no banco
-- -----------------------------------------------------------------------------
-- O aviso de saldo compara a soma dos lançamentos com o saldo que o banco
-- apurou num instante. O que aconteceu depois desse instante não pode estar no
-- saldo do banco: o salário que entrou às 11:38 contra um saldo das 06:59
-- virou "diferença de R$ 33.557,58" quando a real era R$ 1.509,30. A hora de
-- chegada no app não serve — o débito de ontem chega hoje e já estava lá.
--
-- A Polp manda `transaction_date_time`; até aqui só a data era guardada. O sync
-- preenche o histórico sozinho (VERSAO_DO_SYNC 5).
--
-- APLICAR ANTES DO DEPLOY: o schema do Drizzle passa a ter a coluna, e
-- consulta que seleciona a linha inteira falha sem ela.
-- Rollback do código: o antigo ignora a coluna.
-- Idempotente.
-- =============================================================================

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS ocorrido_em timestamptz;
