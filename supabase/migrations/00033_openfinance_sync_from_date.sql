-- =============================================================================
-- A partir de quando importar cada recurso — Migration 00033
-- =============================================================================
--
-- A primeira sincronização puxa todo o histórico que a instituição libera — na
-- conta de teste, 12 meses e 627 transações. Se a conta do floow já tem
-- movimentação daquele período (importada de OFX/CSV ou lançada à mão), ela
-- entra DUPLICADA: o dedupe é por (external_id, account_id), e o `external_id`
-- de um OFX é o FITID do banco, que não tem relação com o id da Polp.
--
-- O efeito é o pior tipo de erro num app de finanças: o saldo conta o mesmo
-- dinheiro duas vezes, e o extrato fica com pares de lançamentos parecidos que
-- ninguém sabe se são duas compras iguais ou uma compra importada duas vezes.
--
-- `sync_from_date` é o corte. A interface sugere o dia seguinte à última
-- transação que a conta já tem, que é a data que elimina a sobreposição sem
-- perder histórico — e o usuário pode mudar, porque só ele sabe se aquele
-- histórico antigo é confiável ou se prefere reimportar tudo do banco.

ALTER TABLE public.openfinance_resources
  ADD COLUMN IF NOT EXISTS sync_from_date date;

COMMENT ON COLUMN public.openfinance_resources.sync_from_date IS
  'Data mínima de transação a importar na primeira sincronização. Evita duplicar o que já existe na conta por outra origem. NULL importa todo o histórico disponível.';
