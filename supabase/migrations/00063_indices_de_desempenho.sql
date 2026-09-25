-- supabase/migrations/00063_indices_de_desempenho.sql
-- =============================================================================
-- Índices que faltavam em transactions
-- -----------------------------------------------------------------------------
-- Achados da varredura de desempenho de 24/09/2026.
--
-- 1. transfer_group_id: sem índice, todo filtro por grupo de transferência
--    (excluir, editar, desfazer par, prévia de correção de regra) lia as
--    linhas da org inteira e filtrava uma a uma. Parcial: a maioria dos
--    lançamentos não é transferência.
--
-- 2. (org_id, recurring_template_id, date): a tela de recorrentes agrupa as
--    ocorrências por template (próxima e última data) em toda carga. O índice
--    que existia começa por recurring_template_id e não tem org_id, então a
--    consulta varria a org. Parcial pelo mesmo motivo.
--
-- Tabela pequena (milhares de linhas): CREATE INDEX comum é instantâneo, e
-- CONCURRENTLY não roda dentro da transação do SQL Editor.
--
-- Idempotente: pode rodar de novo sem erro.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_transactions_transfer_group
  ON public.transactions (transfer_group_id)
  WHERE transfer_group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_org_template_date
  ON public.transactions (org_id, recurring_template_id, date)
  WHERE recurring_template_id IS NOT NULL;
