-- =============================================================================
-- vinculo_revisado_em
-- -----------------------------------------------------------------------------
-- "Não é nenhum" na tela Conciliar: o lançamento do banco foi revisado e não
-- cumpre previsão nenhuma. Nulo = nunca revisado. Aplicar ANTES do deploy (o
-- código novo lê a coluna). Rollback: o código antigo ignora a coluna.
-- Idempotente.
-- Ver docs/superpowers/specs/2026-10-01-conciliar-modo-foco-design.md §6
-- =============================================================================

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS vinculo_revisado_em timestamptz;
