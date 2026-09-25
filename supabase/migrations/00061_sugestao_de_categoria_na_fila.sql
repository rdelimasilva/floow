-- supabase/migrations/00061_sugestao_de_categoria_na_fila.sql
-- =============================================================================
-- Sugestão de categoria na fila "Classificar lançamentos"
-- -----------------------------------------------------------------------------
-- Ao fim de cada importação, o floow sugere a categoria de cada contraparte
-- pendente: pelo histórico do próprio usuário ou, se ele não decide, pelo
-- Claude. A sugestão só pré-seleciona a categoria na fila; quem confirma é
-- sempre o usuário (teste de 24/09/2026: confirmar sozinho errou 6 de 8).
--
-- suggested_category_id  categoria pré-selecionada na fila (NULL = sem sugestão)
-- suggestion_source      'historico' | 'claude'
-- auto_attempted_at      já tentou sugerir: não pergunta de novo ao Claude a
--                        cada importação
--
-- Idempotente: pode rodar de novo sem erro.
-- =============================================================================

ALTER TABLE public.counterparties
  ADD COLUMN IF NOT EXISTS suggested_category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suggestion_source text CHECK (suggestion_source IN ('historico', 'claude')),
  ADD COLUMN IF NOT EXISTS auto_attempted_at timestamptz;
