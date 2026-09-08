-- =============================================================================
-- Vínculo entre o bem e o lançamento que o adquiriu
-- -----------------------------------------------------------------------------
-- O pedido era uma conta de ativos imobilizados, para a compra de um bem ser
-- transferência de dinheiro para ela. Não dá, do jeito que o patrimônio é
-- calculado hoje:
--
--   `computeSnapshot` (packages/core-finance/src/snapshot.ts) soma TODOS os
--   saldos de conta em `liquidAssetsCents` e só depois adiciona
--   `investmentValueCents` e `fixedAssetValueCents` por cima. Um bem que fosse
--   conta entraria no patrimônio duas vezes: uma pelo saldo, outra por
--   `fixed_assets.current_value_cents`.
--
--   E saldo de conta não se move sozinho. `estimateAssetValue`
--   (apps/web/lib/finance/actions.ts) projeta o valor do bem a partir de
--   `current_value_cents`, `current_value_date` e `annual_rate` — a
--   depreciação do carro e a valorização do imóvel. Virar conta trocaria isso
--   por um saldo estático.
--
-- Então o bem continua no registro dele, que já alimenta o patrimônio, e ganha
-- o vínculo com o lançamento da compra. O modelo mental de "o dinheiro virou
-- este bem" fica explícito sem duplicar o ledger.
--
-- Para a compra sair do fluxo de caixa, o caminho é o outro que já existe:
-- categoria com `affects_cash_flow = false` (migration 00038).
--
-- ON DELETE SET NULL e não CASCADE: apagar o lançamento não pode apagar o bem
-- — o carro continua existindo. O vínculo é que se perde.
--
-- A posse é validada na action (`resolveAcquisitionTransactionId` em
-- apps/web/lib/fixed-assets/actions.ts): a FK garante que o id existe, não que
-- ele é da mesma org.
-- =============================================================================

ALTER TABLE public.fixed_assets
  ADD COLUMN IF NOT EXISTS acquisition_transaction_id uuid
    REFERENCES public.transactions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fixed_assets_acquisition_tx
  ON public.fixed_assets (acquisition_transaction_id);

COMMENT ON COLUMN public.fixed_assets.acquisition_transaction_id IS
  'Lancamento que pagou por este bem. NULL quando o bem foi cadastrado sem apontar a compra.';
