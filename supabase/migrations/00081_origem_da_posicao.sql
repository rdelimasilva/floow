-- =============================================================================
-- asset_bank_positions.origem: quem disse que a posição zerou
-- -----------------------------------------------------------------------------
-- Em 19/10/2026 a XP mandou, com data de domingo 18/10, saldo zero em todos os
-- títulos do Tesouro sem venda nem resgate, e a carteira perdeu R$ 444 mil.
-- Zero do banco agora precisa de prova (venda/resgate/vencimento, papel
-- vencido ou zero sustentado por 7 dias); o zero que o próprio sync grava
-- quando o papel some da listagem (`zerarAusentes`) vale na hora. A coluna
-- separa os dois — até aqui só dava para adivinhar pelo PU nulo.
--
-- Backfill: a única linha de ausência existente tem PU e PU de compra nulos
-- (o banco sempre manda os dois, nem que 0).
--
-- APLICAR ANTES DO DEPLOY: o schema do Drizzle passa a ter a coluna e a
-- leitura da carteira a seleciona.
-- Rollback do código: o antigo ignora a coluna.
-- Idempotente.
-- =============================================================================

ALTER TABLE public.asset_bank_positions
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'banco';

DO $$ BEGIN
  ALTER TABLE public.asset_bank_positions
    ADD CONSTRAINT asset_bank_positions_origem_check CHECK (origem IN ('banco', 'ausencia'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

UPDATE public.asset_bank_positions
   SET origem = 'ausencia'
 WHERE origem = 'banco'
   AND unit_price IS NULL AND purchase_unit_price IS NULL
   AND coalesce(quantity, 0) = 0 AND coalesce(gross_cents, 0) = 0 AND coalesce(net_cents, 0) = 0;
