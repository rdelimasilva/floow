-- =============================================================================
-- affects_cash_flow: padrão na categoria, exceção no lançamento
-- -----------------------------------------------------------------------------
-- Movimentação que acontece de verdade e não é resultado de caixa — aplicação
-- e resgate de investimento, aporte, empréstimo — poluía o fluxo de caixa como
-- receita ou despesa. O único jeito de limpar era o olho (`is_ignored`), que
-- significa "este lançamento é errado, não existe" e apaga a linha também de
-- orçamentos, dívidas e CFO. A aplicação aconteceu; ela precisa continuar
-- contando nos demais.
--
-- `categories.affects_cash_flow` carrega o padrão, porque a propriedade é da
-- natureza da movimentação: "Aplicação CDB" nunca é despesa de fluxo de caixa,
-- em nenhum lançamento.
--
-- `transactions.affects_cash_flow` é NULLABLE de propósito. NULL significa
-- "herda da categoria", então mudar o checkbox da categoria depois arrasta
-- todos os lançamentos que ninguém marcou à mão. Só a linha com valor
-- explícito fica parada. Mesma forma da exceção por lançamento da fila de
-- contrapartes.
--
-- Default `true` nas duas pontas preserva o comportamento atual: nenhuma linha
-- existente muda de lado no relatório ao aplicar esta migration.
--
-- Consumido em `apps/web/lib/finance/queries.ts`, na agregação
-- `loadMonthlyCashFlowSummary`, via
-- `coalesce(transactions.affects_cash_flow, categories.affects_cash_flow, true)`.
-- =============================================================================

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS affects_cash_flow boolean NOT NULL DEFAULT true;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS affects_cash_flow boolean;

COMMENT ON COLUMN public.categories.affects_cash_flow IS
  'Padrao de "conta como receita/despesa no fluxo de caixa" para os lancamentos desta categoria. false em aplicacao/resgate de investimento, aporte, emprestimo.';

COMMENT ON COLUMN public.transactions.affects_cash_flow IS
  'Excecao por lancamento ao padrao da categoria. NULL = herda da categoria.';
