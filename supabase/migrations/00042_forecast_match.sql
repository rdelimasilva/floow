-- =============================================================================
-- Vínculo do lançamento previsto com o realizado
-- -----------------------------------------------------------------------------
-- O defeito: `reconcileRecurringBalances` (apps/web/lib/finance/actions.ts)
-- aplica o valor PREVISTO no saldo quando a data chega, e o sync depois
-- importa o real com `external_id` novo. Nada casa os dois — o dedupe do sync
-- é só por `external_id`, e previsto de template tem `external_id NULL`.
-- Resultado: os dois contam.
--
-- Está em produção. O salário de 15/07/2026 existe duas vezes: R$ 32.500,00
-- do template e R$ 32.638,85 do Itaú. Com critério apertado (mesmo dia, valor
-- a 3%) são 5 previstos já aplicados com par realizado.
--
-- `matched_transaction_id` aponta do PREVISTO para o REALIZADO. A direção
-- importa: o realizado é a verdade, o previsto é a estimativa que se resolveu.
--
-- O previsto casado nunca entra no saldo — `reconcileRecurringBalances` passa
-- a ignorar quem tem vínculo. Sem isso o casamento não resolveria nada: a
-- linha continuaria sendo aplicada na data.
--
-- Índice único parcial: um realizado não pode ser reivindicado por dois
-- previstos. O caminho contrário já é garantido por ser uma coluna só.
-- `WHERE ... IS NOT NULL` porque a esmagadora maioria das linhas tem NULL, e
-- NULL não colide em índice único de qualquer forma.
--
-- ON DELETE SET NULL e não CASCADE: apagar o realizado devolve o previsto ao
-- estado aberto, em vez de apagar a previsão junto.
--
-- Esta migration NÃO mexe nos 5 casos que já contam dobrado. Consertar o
-- passado é decisão separada, que o dono do produto ainda não tomou.
-- =============================================================================

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS matched_transaction_id uuid
    REFERENCES public.transactions(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_matched_unique
  ON public.transactions (matched_transaction_id)
  WHERE matched_transaction_id IS NOT NULL;

COMMENT ON COLUMN public.transactions.matched_transaction_id IS
  'Aponta do lancamento previsto para o realizado que o cumpriu. Previsto com vinculo nunca entra no saldo.';
