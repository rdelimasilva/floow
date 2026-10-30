-- =============================================================================
-- Venda do bem
-- -----------------------------------------------------------------------------
-- Espelha o vínculo da compra (migration 00040). Vender um bem era "Excluir":
-- o bem saía do patrimônio, mas não ficava registrado quando foi vendido, por
-- quanto, nem qual entrada de dinheiro pagou por ele.
--
-- Data e valor vêm do lançamento da venda e ficam copiados aqui. Assim o
-- resultado continua visível se o lançamento for apagado depois (o vínculo
-- vira NULL pelo ON DELETE SET NULL, como na compra).
--
-- O bem vendido fica com is_active = false, e é isso que o tira do patrimônio
-- (getFixedAssets e o CFO filtram por is_active). sold_at preenchido separa o
-- vendido do excluído.
-- =============================================================================

ALTER TABLE public.fixed_assets
  ADD COLUMN IF NOT EXISTS sold_at date,
  ADD COLUMN IF NOT EXISTS sale_value_cents integer,
  ADD COLUMN IF NOT EXISTS sale_transaction_id uuid
    REFERENCES public.transactions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fixed_assets_sale_tx
  ON public.fixed_assets (sale_transaction_id);

COMMENT ON COLUMN public.fixed_assets.sale_transaction_id IS
  'Lancamento que recebeu o dinheiro da venda. NULL se o bem nao foi vendido ou se o lancamento foi apagado.';
