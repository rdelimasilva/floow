-- =============================================================================
-- openfinance_resources.sync_version: versão do sync que leu o histórico
-- -----------------------------------------------------------------------------
-- O sync incremental só pede o que mudou desde a última passada. Campo novo
-- que o código passa a gravar (o bill_id da 00075) nunca chegava às linhas que
-- a Polp não altera mais: setembro do Master Black ficou sem bill_id e somou
-- R$ 11.642,54 contra os R$ 11.685,40 pagos. Recurso com versão abaixo da do
-- código relê o histórico uma vez e preenche o que falta (ver
-- apps/web/lib/openfinance/releitura.ts).
--
-- Todo recurso existente começa em 0 e se relê na próxima sincronização.
--
-- APLICAR ANTES DO DEPLOY: o schema do Drizzle passa a ter a coluna, e
-- consulta que seleciona a linha inteira falha sem ela.
-- Rollback do código: o antigo ignora a coluna.
-- Idempotente.
-- =============================================================================

ALTER TABLE public.openfinance_resources
  ADD COLUMN IF NOT EXISTS sync_version integer NOT NULL DEFAULT 0;
