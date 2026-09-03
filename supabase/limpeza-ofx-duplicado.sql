-- =============================================================================
-- Remove o OFX duplicado das contas que passaram a receber dados da Polp
-- =============================================================================
--
-- NÃO é migration: é uma limpeza pontual deste banco. Rodar tudo de uma vez no
-- SQL Editor — os comandos ficam numa transação implícita única, e qualquer
-- erro derruba o conjunto sem deixar meio-caminho.
--
-- Alvo: transações com `imported_at` cujo `external_id` NÃO é UUID, em contas
-- vinculadas a um recurso Open Finance. A Polp usa UUID como id; o OFX usa o
-- FITID do banco. É essa diferença que faz o dedupe por (external_id,
-- account_id) não pegar a duplicação — e é ela que identifica o que sai.
--
-- Conta sem vínculo Open Finance fica intacta: sem a Polp cobrindo o período,
-- não há duplicação para desfazer. É por isso que "Banco Itaú" não é tocada
-- aqui.

-- ----------------------------------------------------------------------------
-- 1. Backup, no próprio banco
-- ----------------------------------------------------------------------------
-- Sem IF NOT EXISTS de propósito: se a tabela já existir, este script já rodou,
-- e rodar de novo aplicaria a reversão de saldo duas vezes. Falhar aqui é a
-- proteção.

CREATE TABLE public.backup_ofx_removidas AS
SELECT t.*, now() AS backed_up_at
FROM public.transactions t
JOIN public.openfinance_resources r ON r.account_id = t.account_id
WHERE t.imported_at IS NOT NULL
  AND NOT (t.external_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}');

-- ----------------------------------------------------------------------------
-- 2. Perna de transferência não se apaga sozinha
-- ----------------------------------------------------------------------------
-- Apagar um lado sumiria com o par e deixaria o saldo da outra conta errado,
-- sem nada acusar. Se aparecer alguma, a limpeza para aqui para ser revista.

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.backup_ofx_removidas WHERE transfer_group_id IS NOT NULL;
  IF n > 0 THEN
    RAISE EXCEPTION 'limpeza abortada: % transacoes sao perna de transferencia', n;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Reverte o efeito no saldo
-- ----------------------------------------------------------------------------
-- Só o que tinha `balance_applied` entrou no saldo. Lançamento futuro (parcela,
-- recorrência) não entrou, e subtrair mudaria um saldo que ele nunca tocou.

UPDATE public.accounts a
SET balance_cents = a.balance_cents - COALESCE(
  (SELECT sum(b.amount_cents)
     FROM public.backup_ofx_removidas b
    WHERE b.account_id = a.id AND b.balance_applied), 0)
WHERE a.id IN (SELECT DISTINCT account_id FROM public.backup_ofx_removidas);

-- ----------------------------------------------------------------------------
-- 4. Remove
-- ----------------------------------------------------------------------------

DELETE FROM public.transactions
WHERE id IN (SELECT id FROM public.backup_ofx_removidas);

-- ----------------------------------------------------------------------------
-- 5. O que ficou
-- ----------------------------------------------------------------------------

SELECT a.name AS conta,
       a.type,
       (a.balance_cents / 100.0) AS saldo,
       count(t.id) AS transacoes,
       count(t.id) FILTER (WHERE t.external_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}') AS da_polp,
       (SELECT count(*) FROM public.backup_ofx_removidas b WHERE b.account_id = a.id) AS removidas
FROM public.accounts a
LEFT JOIN public.transactions t ON t.account_id = a.id
GROUP BY a.id, a.name, a.type, a.balance_cents
ORDER BY transacoes DESC;

-- =============================================================================
-- Para desfazer, enquanto a tabela de backup existir:
--
--   BEGIN;
--   INSERT INTO public.transactions
--     SELECT (b.*)::public.transactions.* FROM public.backup_ofx_removidas b;  -- conferir colunas
--   UPDATE public.accounts a
--     SET balance_cents = a.balance_cents + COALESCE(
--       (SELECT sum(b.amount_cents) FROM public.backup_ofx_removidas b
--         WHERE b.account_id = a.id AND b.balance_applied), 0)
--    WHERE a.id IN (SELECT DISTINCT account_id FROM public.backup_ofx_removidas);
--   COMMIT;
--
-- Depois de conferir o resultado por alguns dias:
--   DROP TABLE public.backup_ofx_removidas;
-- =============================================================================
