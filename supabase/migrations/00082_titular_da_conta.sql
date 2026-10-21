-- =============================================================================
-- titular: de quem é cada conta, na família
-- -----------------------------------------------------------------------------
-- A org é a família: até 5 CPFs conectados veem tudo junto. O filtro "Pessoa"
-- precisa saber de quem é cada conta. Só o primeiro nome, digitado na conexão
-- (openfinance_connections.titular) e herdado pela conta vinculada
-- (accounts.titular). Conta manual recebe o nome na edição da conta.
-- NULL = sem titular; a conta só aparece em "Todas as contas".
--
-- APLICAR ANTES DO DEPLOY: o schema do Drizzle passa a ter as colunas e o
-- select das contas as lê.
-- Rollback do código: o antigo ignora as colunas.
-- Idempotente.
-- =============================================================================

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS titular text;

ALTER TABLE public.openfinance_connections
  ADD COLUMN IF NOT EXISTS titular text;
