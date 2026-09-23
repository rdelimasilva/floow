-- supabase/migrations/00050_recorrente_como_meta_de_gasto.sql
-- =============================================================================
-- Recorrente que também é meta de gasto
-- -----------------------------------------------------------------------------
-- Uma despesa recorrente (aluguel, luz, iFood) já diz quanto o mês compromete
-- naquela categoria. Com a flag ligada, a tela de Meta de Gastos passa a
-- contar esse valor como piso da meta da categoria.
--
-- A meta NÃO é copiada para `budget_entries`: é derivada na leitura, a partir
-- das parcelas do mês (lib/finance/recurring-budget.ts). Copiar exigiria
-- sincronizar as duas tabelas a cada edição, pausa ou exclusão da recorrente.
--
-- Só vale para despesa com categoria; a consulta que deriva a meta filtra os
-- dois, então uma flag ligada em receita ou sem categoria é inofensiva.
-- =============================================================================

ALTER TABLE public.recurring_templates
  ADD COLUMN counts_as_budget boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.recurring_templates.counts_as_budget IS
  'Quando verdadeiro, as parcelas desta recorrente no mes contam como piso da meta de gasto da categoria.';
