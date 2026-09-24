-- supabase/migrations/00057_fechamento_do_cartao.sql
-- =============================================================================
-- Dia de fechamento e de vencimento do cartão de crédito
-- -----------------------------------------------------------------------------
-- Com o cartão selecionado em Transações, o extrato mostra uma linha com o
-- total da fatura na data de fechamento. A linha é calculada, nunca gravada,
-- e não mexe em saldo nem fluxo de caixa. Ver
-- docs/superpowers/specs/2026-09-24-fatura-no-extrato-design.md.
--
-- NULL = não cadastrado: a linha da fatura não aparece. Dia maior que o mês
-- (31 em fevereiro) vira o último dia, na aplicação.
--
-- Idempotente: pode rodar de novo sem erro.
-- =============================================================================

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS closing_day smallint NULL,
  ADD COLUMN IF NOT EXISTS due_day smallint NULL;

ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_closing_day_range;
ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_closing_day_range CHECK (closing_day BETWEEN 1 AND 31);

ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_due_day_range;
ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_due_day_range CHECK (due_day BETWEEN 1 AND 31);
