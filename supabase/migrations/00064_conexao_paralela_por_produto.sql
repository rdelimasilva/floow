-- supabase/migrations/00064_conexao_paralela_por_produto.sql
-- =============================================================================
-- Segunda conexão no mesmo banco, com outros produtos
-- -----------------------------------------------------------------------------
-- O produto de um consentimento não muda depois de autorizado. Quem conectou
-- conta e cartão e quer os investimentos precisa de um consentimento paralelo,
-- só de investimentos — refazer o primeiro reimportaria o extrato inteiro.
--
-- O índice antigo permitia uma conexão viva por (org, CPF, banco). A regra
-- agora é da aplicação (conexao-repetida.ts: nenhum produto repetido); o
-- índice novo inclui os produtos e continua barrando o clique duplo, que
-- manda exatamente os mesmos.
--
-- Idempotente: pode rodar de novo sem erro.
-- =============================================================================

DROP INDEX IF EXISTS public.uq_openfinance_connections_active;

CREATE UNIQUE INDEX IF NOT EXISTS uq_openfinance_connections_active_products
  ON public.openfinance_connections (org_id, cpf_hash, institution_id, products)
  WHERE revoked_at IS NULL;
