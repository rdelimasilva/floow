-- supabase/migrations/00065_final_do_cartao.sql
-- =============================================================================
-- Final do cartão em cada lançamento
-- -----------------------------------------------------------------------------
-- A fatura é uma só, mas titular, adicional e cartão virtual compram com
-- finais diferentes. A Polp manda o final em `identification_number` de cada
-- transação de cartão; aqui ele fica guardado para a lista filtrar por ele.
--
-- Só os quatro últimos dígitos, nunca o número inteiro. NULL em conta
-- corrente, em lançamento manual e quando o banco não manda.
--
-- Índice parcial: só lançamento de cartão Open Finance tem o campo.
--
-- Idempotente: pode rodar de novo sem erro.
-- =============================================================================

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS card_last_digits text;

CREATE INDEX IF NOT EXISTS idx_transactions_card_last_digits
  ON public.transactions (org_id, account_id, card_last_digits)
  WHERE card_last_digits IS NOT NULL;
