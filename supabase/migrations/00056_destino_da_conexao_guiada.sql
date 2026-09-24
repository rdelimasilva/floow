-- supabase/migrations/00056_destino_da_conexao_guiada.sql
-- =============================================================================
-- Conexão guiada do Open Finance: destino escolhido antes da autorização
-- -----------------------------------------------------------------------------
-- As contas e cartões da Polp só existem DEPOIS que o usuário autoriza no
-- banco. Para ele não precisar voltar e vincular à mão, o wizard pergunta o
-- destino antes (conta existente do floow ou nome da conta nova) e o floow
-- aplica sozinho quando os recursos chegam — se houver exatamente um por tipo.
--
-- Os quatro target_* nulos = conexão anterior a esta mudança: fluxo manual.
-- auto_link_done_at marca que o vínculo automático já rodou (roda uma vez só).
--
-- Idempotente: pode rodar de novo sem erro.
-- =============================================================================

ALTER TABLE public.openfinance_connections
  ADD COLUMN IF NOT EXISTS target_account_id uuid NULL
    REFERENCES public.accounts(id) ON DELETE SET NULL;

ALTER TABLE public.openfinance_connections
  ADD COLUMN IF NOT EXISTS target_card_account_id uuid NULL
    REFERENCES public.accounts(id) ON DELETE SET NULL;

ALTER TABLE public.openfinance_connections
  ADD COLUMN IF NOT EXISTS target_account_new_name text NULL;

ALTER TABLE public.openfinance_connections
  ADD COLUMN IF NOT EXISTS target_card_new_name text NULL;

ALTER TABLE public.openfinance_connections
  ADD COLUMN IF NOT EXISTS auto_link_done_at timestamptz NULL;

-- Conexões anteriores a esta mudança seguem no fluxo manual: marcadas como
-- concluídas, para a primeira importação automática (que também vale para
-- conexão só de investimentos) não disparar sozinha nelas ao abrir a tela.
-- Só as sem destino: numa segunda execução, conexão guiada ainda pendente
-- não é tocada. (Uma conexão nova só de investimentos, ainda pendente, seria
-- marcada numa reexecução — perde a importação automática, não dado.)
UPDATE public.openfinance_connections
SET auto_link_done_at = created_at
WHERE auto_link_done_at IS NULL
  AND target_account_id IS NULL
  AND target_card_account_id IS NULL
  AND target_account_new_name IS NULL
  AND target_card_new_name IS NULL;
