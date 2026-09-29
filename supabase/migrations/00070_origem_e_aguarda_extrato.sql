-- =============================================================================
-- Origem explícita e marca "aguarda o extrato"
-- -----------------------------------------------------------------------------
-- Numa conta Open Finance, só o extrato daquela conta move o saldo. Todo o
-- resto que entra nela (lançamento manual, linha de arquivo, perna de
-- transferência) aguarda o extrato, que o absorve quando chega.
--
-- `origem` nasce NULLABLE aqui de propósito: enquanto o código novo não está
-- no ar, o código antigo insere sem ela, e um NOT NULL derrubaria produção. O
-- NOT NULL vem na 00071, aplicada DEPOIS do deploy. O tipo do Drizzle já
-- declara `origem` como notNull sem default, então todo insert do código novo
-- é obrigado a dizer de onde a linha vem. O backfill abaixo adivinha pelo
-- formato do id UMA vez, sobre dado parado; daqui em diante a origem é
-- declarada por quem grava.
--
-- Invariante: aguarda_extrato = true => balance_applied = false. Não vira
-- CHECK: o auditor diário (api/cron/auditar-conciliacao) vigia.
--
-- Idempotente: pode rodar de novo sem erro e sem efeito.
-- Ver docs/superpowers/specs/2026-09-28-conciliacao-unica-design.md §3.1
-- =============================================================================

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS origem text
    CHECK (origem IN ('extrato', 'manual', 'arquivo', 'perna',
                      'recorrencia', 'ajuste', 'investimento', 'parcela_prevista'));

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS aguarda_extrato boolean NOT NULL DEFAULT false;

-- Backfill, na ordem da spec. A perna de transferência de recorrência
-- (template com par) fica como `recorrencia`, que é o que
-- `createRecurringTransactions` passa a declarar — sem o
-- `recurring_template_id IS NULL`, o backfill e o código discordariam.
-- O ajuste de saldo não exige affects_cash_flow = false: os antigos são
-- anteriores a essa coluna.
UPDATE public.transactions t
   SET origem = CASE
     WHEN t.external_id LIKE '%:transfer-dest'
       OR t.external_id LIKE '%:transfer-par'
       OR (t.transfer_group_id IS NOT NULL AND t.external_id IS NULL AND t.recurring_template_id IS NULL)
       THEN 'perna'
     WHEN t.recurring_template_id IS NOT NULL THEN 'recorrencia'
     WHEN t.is_installment_forecast THEN 'parcela_prevista'
     WHEN t.description LIKE 'Ajuste de saldo%' AND t.external_id IS NULL AND t.transfer_group_id IS NULL THEN 'ajuste'
     WHEN t.external_id IS NULL AND a.type = 'brokerage' THEN 'investimento'
     WHEN t.external_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.openfinance_resources r WHERE r.account_id = t.account_id)
       THEN CASE
         WHEN t.external_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$'
           THEN 'extrato'
         ELSE 'arquivo'
       END
     WHEN t.external_id IS NOT NULL THEN 'arquivo'
     ELSE 'manual'
   END
  FROM public.accounts a
 WHERE a.id = t.account_id
   AND t.origem IS NULL;

-- A perna prevista (`:transfer-par`) já era "aguarda o extrato" com outro
-- nome: nunca entrou no saldo. Passa a carregar a marca, e o motor a absorve
-- (R1) em vez de mandá-la para a fila.
UPDATE public.transactions
   SET aguarda_extrato = true
 WHERE external_id LIKE '%:transfer-par'
   AND balance_applied = false
   AND aguarda_extrato = false;

CREATE INDEX IF NOT EXISTS idx_transactions_aguarda_extrato
  ON public.transactions (account_id, date)
  WHERE aguarda_extrato AND matched_transaction_id IS NULL;
