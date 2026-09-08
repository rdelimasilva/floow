-- =============================================================================
-- Liberação de empréstimo e financiamento sai do fluxo de caixa
-- -----------------------------------------------------------------------------
-- Decisão pedida: das 11 categorias de sistema de empréstimo e financiamento,
-- quais saem do relatório de fluxo de caixa.
--
-- SAEM — todo o prefixo `LOAN_DISBURSEMENTS`:
--   Empréstimo recebido, antecipação de salário, liberação de financiamento
--   imobiliário, de veículo, estudantil, adiantamento de dinheiro.
--   O dinheiro entra na conta, mas não é receita — é dívida contraída. Somar
--   isso como receita infla o mês de quem tomou financiamento imobiliário
--   pelo valor do imóvel. Nenhuma leitura contábil chama liberação de
--   empréstimo de receita, então aqui não há ambiguidade.
--
-- FICAM — todo o prefixo `LOAN_PAYMENTS` (exceto fatura de cartão, que já saiu
-- na 00039):
--   Parcela de financiamento imobiliário, de veículo, estudantil, parcela de
--   empréstimo pessoal, compra parcelada.
--   A parcela é dinheiro saindo de verdade, e a parte de juros É despesa. O
--   floow não separa principal de juros — não há coluna para isso — então
--   excluir a parcela inteira esconderia despesa real. Entre esconder juros
--   pagos e contar amortização como despesa, contar é o erro menor: o
--   usuário vê o dinheiro que de fato saiu do bolso dele.
--
-- A assimetria é deliberada e visível: empréstimo recebido não conta como
-- entrada, mas a parcela conta como saída. O efeito é um resultado mensal mais
-- pessimista que o caixa puro. Se você preferir simetria — os dois fora, com
-- empréstimo tratado como puro balanço patrimonial — é trocar o prefixo do
-- WHERE abaixo por `LOAN_%`.
--
-- Org que já forkou alguma dessas categorias (copy-on-write de
-- `category-actions.ts`) mantém a escolha dela: a linha de sistema é só o
-- padrão.
-- =============================================================================

UPDATE public.categories
   SET affects_cash_flow = false
 WHERE org_id IS NULL
   AND polp_ref LIKE 'LOAN_DISBURSEMENTS%';

-- Conferência: as liberações ficam false, os pagamentos seguem true
-- (menos a fatura de cartão, desligada na 00039).
SELECT polp_ref, name, affects_cash_flow
  FROM public.categories
 WHERE org_id IS NULL
   AND polp_ref LIKE 'LOAN_%'
 ORDER BY affects_cash_flow, polp_ref;
