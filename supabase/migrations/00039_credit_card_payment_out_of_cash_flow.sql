-- =============================================================================
-- Pagamento de fatura de cartão sai do fluxo de caixa
-- -----------------------------------------------------------------------------
-- Dupla contagem inequívoca: as compras individuais do cartão já entram como
-- despesa, cada uma na sua categoria. Quando o pagamento da fatura entra
-- também, o mês conta a mesma despesa duas vezes.
--
-- Esta é a única categoria de sistema em que a exclusão não depende de
-- interpretação contábil. As demais candidatas do mesmo grupo — liberação e
-- parcela de empréstimo e financiamento (`LOAN_DISBURSEMENTS*`,
-- `LOAN_PAYMENTS*`) — ficaram de fora de propósito: elas movem caixa de
-- verdade, e se contam ou não depende de a tela ser fluxo de caixa puro ou
-- resultado por regime de caixa. Decisão de produto, não de migration.
--
-- Alcance: `org_id IS NULL` é a linha de sistema, compartilhada por todas as
-- orgs, então a regra vale para todos os tenants. Org que já tenha forkado
-- esta categoria (copy-on-write de `category-actions.ts`) mantém a cópia dela
-- intacta, com o valor que escolheu — o que é o comportamento correto: a
-- escolha da org ganha da default global.
--
-- `polp_ref` tem índice único para `org_id IS NULL`, então o WHERE abaixo
-- atinge exatamente uma linha.
-- =============================================================================

UPDATE public.categories
   SET affects_cash_flow = false
 WHERE org_id IS NULL
   AND polp_ref = 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT';

-- Conferência: tem que voltar 1 linha, com affects_cash_flow = false.
SELECT name, polp_ref, affects_cash_flow
  FROM public.categories
 WHERE org_id IS NULL
   AND polp_ref = 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT';
