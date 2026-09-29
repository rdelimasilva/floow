-- =============================================================================
-- origem NOT NULL
-- -----------------------------------------------------------------------------
-- Aplicar somente DEPOIS do deploy do código novo (que declara `origem` em todo
-- insert). Antes disso, o código antigo em produção insere sem `origem` e este
-- NOT NULL o derrubaria.
--
-- Refaz o backfill da 00067 só para as linhas ainda NULL (as que o código
-- antigo inseriu entre a 00067 e o deploy) e então trava a coluna. A regra do
-- backfill é a mesma da 00067 — o teste origem-da-transacao-schema confere.
--
-- Idempotente: pode rodar de novo sem erro e sem efeito.
-- Ver docs/superpowers/specs/2026-09-28-conciliacao-unica-design.md §3.1
-- =============================================================================

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

ALTER TABLE public.transactions ALTER COLUMN origem SET NOT NULL;
