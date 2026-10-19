-- =============================================================================
-- openfinance_resources.divergencia_leituras: leituras seguidas que discordam
-- -----------------------------------------------------------------------------
-- O Itaú desconta o débito automático do saldo no dia e só põe a linha no
-- extrato no dia seguinte, carimbada depois da apuração. Entre um sync e o
-- outro, o saldo do banco e a soma dos lançamentos discordam sem lançamento
-- errado nenhum (R$ 1.509,30 em 15/10, R$ 316,74 em 18/10/2026), e o aviso
-- de divergência acendia à toa.
--
-- O sync conta quantas leituras seguidas discordaram; o aviso só aparece da
-- segunda em diante. Começa em 0: o aviso de hoje some e volta só se a
-- diferença sobreviver a duas leituras.
--
-- APLICAR ANTES DO DEPLOY: o schema do Drizzle passa a ter a coluna e a tela
-- de Contas a seleciona.
-- Rollback do código: o antigo ignora a coluna.
-- Idempotente.
-- =============================================================================

ALTER TABLE public.openfinance_resources
  ADD COLUMN IF NOT EXISTS divergencia_leituras integer NOT NULL DEFAULT 0;
