-- supabase/migrations/00059_sugestao_para_categoria_existente.sql
-- =============================================================================
-- Sugestão de categoria que aponta para uma categoria que já existe
-- -----------------------------------------------------------------------------
-- A primeira versão só sabia sugerir categoria nova, e com o nome tirado da
-- descrição: "PIX para Maraisa" virou a categoria "Maraisa". Agora a sugestão
-- pode dizer "mover para Assistente de limpeza". Preenchido = aceitar move os
-- lançamentos para esta categoria; NULL = aceitar cria a categoria nova.
--
-- Idempotente: pode rodar de novo sem erro.
-- =============================================================================

ALTER TABLE public.category_suggestions
  ADD COLUMN IF NOT EXISTS target_category_id uuid
  REFERENCES public.categories(id) ON DELETE CASCADE;
