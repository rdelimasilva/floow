-- =============================================================================
-- Estorna do saldo das contas a previsao de template que nunca deveria ter
-- entrado nele
-- -----------------------------------------------------------------------------
-- A regra passou a ser: `accounts.balance_cents` e so o que aconteceu de
-- verdade. Previsao de template fica `balance_applied = false` ate o
-- lancamento do banco casar com ela, e quem soma no saldo e o realizado.
--
-- Dois caminhos violavam isso e foram corrigidos no codigo:
--
--   1. `generateForTemplate` gravava a ocorrencia vencida sem passar
--      `balance_applied`, pegava o default `true` da coluna e somava o valor
--      no saldo da conta.
--   2. `reconcileRecurringBalances`, disparada a cada carga do app, aplicava
--      no saldo QUALQUER linha pendente cuja data tivesse chegado.
--
-- O (2) era o pior: ao virar `balance_applied = true`, tirava a previsao da
-- fila de casamento, porque `matchForecastsForAccount` so olha previsto
-- aberto. Resultado: a conciliacao so funcionava quando o extrato vinha
-- ADIANTADO. Chegando no dia ou depois -- o normal -- a previsao ja tinha saido
-- da fila e os dois lancamentos contavam.
--
-- Medido em producao por scripts/forecast-balance-audit.mjs antes desta
-- migration:
--
--   41 linhas de template dentro do saldo de uma conta
--   Saldo da conta:       R$ 126.936,84
--   Estimativa embutida:  R$ 126.746,00
--   Saldo apos o estorno: R$     190,84
--   Dessas 41, com par realizado plausivel: 21 (contando dobrado hoje)
--
-- Depois desta migration as 41 voltam a ser previsao aberta. A proxima
-- sincronizacao casa as que tem par -- a janela de +-7 dias de
-- `matchForecast` agora vale de verdade, porque nada mais as tira da fila -- e
-- as restantes ficam marcadas "nao conciliado" na listagem, esperando decisao.
--
-- `is_ignored = false` porque ignorar um lancamento JA estorna o saldo
-- (`toggleIgnoreTransaction`, actions.ts). Incluir a linha ignorada aqui
-- subtrairia o mesmo valor duas vezes.
--
-- `external_id IS NULL` garante que so a linha nascida de template e tocada.
-- Lancamento do banco continua somando no saldo, como sempre -- inclusive o
-- agendado, que `applyDueBankTransactions` aplica quando a data chega.
-- =============================================================================

-- Um unico statement, de proposito. A primeira versao usava uma TEMP TABLE
-- com ON COMMIT DROP para as duas escritas enxergarem o mesmo conjunto, e
-- quebrava em cliente que roda statement a statement: a tabela sumia antes do
-- segundo comando. A CTE que escreve resolve o mesmo problema sem depender de
-- o cliente manter a transacao aberta -- `estornadas` devolve exatamente as
-- linhas que ela mesma virou, e o UPDATE de `accounts` soma so essas.
--
-- CAST(... AS int) e nao `::int` pelo mesmo motivo de portabilidade: cliente
-- que trata `:` como marcador de parametro engole o `::int` e o erro aparece
-- na linha seguinte, longe da causa.

WITH estornadas AS (
  UPDATE public.transactions
  SET balance_applied = false
  WHERE recurring_template_id IS NOT NULL
    AND external_id IS NULL
    AND balance_applied = true
    AND is_ignored = false
  RETURNING account_id, amount_cents
),
por_conta AS (
  SELECT account_id, CAST(sum(amount_cents) AS int) AS delta
  FROM estornadas
  GROUP BY account_id
)
UPDATE public.accounts a
SET balance_cents = a.balance_cents - p.delta,
    updated_at    = now()
FROM por_conta p
WHERE a.id = p.account_id;
