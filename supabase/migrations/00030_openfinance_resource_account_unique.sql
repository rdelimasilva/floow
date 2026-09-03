-- =============================================================================
-- Uma conta do floow espelha um recurso só — Migration 00030
-- =============================================================================
--
-- `openfinance_resources.account_id` não tinha trava nenhuma, então duas contas
-- do banco podiam apontar para a mesma conta do floow. O efeito não é visível de
-- imediato: os dois extratos entram, as transações não colidem (o dedupe é por
-- (external_id, account_id) e os ids vindos da Polp são diferentes), e o saldo
-- da conta passa a somar movimentação de duas contas distintas. O número fica
-- errado sem nada acusar.
--
-- A validação também existe em resource-actions.ts, com mensagem legível. Esta
-- é a rede: no caminho do app o RLS não vale (a conexão usa o role dono do
-- banco), então a garantia de verdade tem de estar no schema.

CREATE UNIQUE INDEX IF NOT EXISTS uq_openfinance_resources_account
  ON public.openfinance_resources (account_id)
  WHERE account_id IS NOT NULL;

COMMENT ON INDEX public.uq_openfinance_resources_account IS
  'Uma conta do floow espelha no máximo um recurso da Polp. Parcial porque account_id é nulo até o usuário escolher vincular.';
