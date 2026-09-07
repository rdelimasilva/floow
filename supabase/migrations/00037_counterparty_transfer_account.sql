-- =============================================================================
-- Transferência com conta de destino, cobrindo a fila de contrapartes. Ver
-- docs/superpowers/specs/2026-09-07-counterparty-transfer-account-design.md
-- =============================================================================

ALTER TABLE public.counterparties
  ADD COLUMN transfer_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL;

-- Necessário porque o fork "destino é Open Finance" (ver spec §4) não cria
-- segunda linha — sem esta coluna, aquele lançamento específico não teria
-- onde registrar pra qual conta foi.
ALTER TABLE public.transactions
  ADD COLUMN transfer_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL;

-- O CHECK de nature/category_id (migração 00035) precisa incluir
-- transfer_account_id. Resolvido em runtime porque o nome do CHECK sem
-- rótulo explícito é gerado pelo Postgres — não há garantia de qual sufixo
-- ele escolheu sem inspecionar o banco de verdade.
DO $$
DECLARE
  check_name text;
BEGIN
  SELECT conname INTO check_name
  FROM pg_constraint
  WHERE conrelid = 'public.counterparties'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%nature%category_id%';

  IF check_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.counterparties DROP CONSTRAINT %I', check_name);
  END IF;
END $$;

-- NOT VALID: o backfill da migração 00035 já criou linhas
-- `nature = 'transfer', confirmed_at = now()` sem `transfer_account_id` (a
-- coluna não existia ainda), e qualquer transferência confirmada pela fila
-- desde então está no mesmo estado — a spec (§7) promete explicitamente que
-- essas linhas legadas "ficam como estão". Um `ADD CONSTRAINT` validante
-- checa TODAS as linhas existentes e falharia contra qualquer banco com uma
-- linha assim. `NOT VALID` pula a validação do que já existe e aplica a
-- migração sem tocar nelas, mas continua valendo para todo INSERT/UPDATE
-- daqui pra frente — que é tudo que `confirmCounterparty` faz.
ALTER TABLE public.counterparties
  ADD CONSTRAINT counterparties_nature_check CHECK (
    (nature = 'transfer' AND category_id IS NULL AND transfer_account_id IS NOT NULL)
    OR (nature IN ('income', 'expense') AND category_id IS NOT NULL AND transfer_account_id IS NULL)
    OR (nature IS NULL AND category_id IS NULL AND transfer_account_id IS NULL)
  ) NOT VALID;
