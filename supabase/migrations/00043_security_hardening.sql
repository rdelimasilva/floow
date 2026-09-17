-- =============================================================================
-- Endurecimento de segurança
-- -----------------------------------------------------------------------------
-- 1. Fecha o INSERT irrestrito em orgs.
-- 2. Cria a trilha de auditoria (append-only) para leitura de dado sensível.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. orgs: remover a policy de INSERT permissiva
--
-- A policy era `WITH CHECK (true)`, com o comentário de que "o trigger cria
-- orgs no signup". O trigger handle_new_user é SECURITY DEFINER e roda como
-- dono da tabela — ele nunca passou por esta policy. Na prática ela só dava a
-- qualquer usuário autenticado o direito de criar orgs órfãs sem limite, via
-- PostgREST. Nenhum código do app insere em orgs pelo cliente.
--
-- Sem policy de INSERT para `authenticated`, o RLS nega por padrão.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "orgs: owners can insert" ON public.orgs;

-- ----------------------------------------------------------------------------
-- 2. audit_log
--
-- Trilha genérica: quem (ator), o quê (ação), sobre qual recurso, em que org.
-- Append-only do ponto de vista do cliente: há policy de SELECT para membros da
-- org, e nenhuma de INSERT/UPDATE/DELETE. Só o backend (que conecta como dono
-- das tabelas) escreve, e ninguém apaga o próprio rastro via PostgREST.
-- ----------------------------------------------------------------------------

CREATE TABLE public.audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid REFERENCES public.orgs(id) ON DELETE CASCADE,
  -- Sem FK para auth.users: a trilha precisa sobreviver à exclusão da conta.
  actor_user_id   uuid,
  action          text NOT NULL,
  resource        text,
  resource_count  integer,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_org_created
  ON public.audit_log USING btree (org_id, created_at DESC);

CREATE INDEX idx_audit_log_actor_created
  ON public.audit_log USING btree (actor_user_id, created_at DESC);

CREATE INDEX idx_audit_log_action_created
  ON public.audit_log USING btree (action, created_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_log: members can select"
  ON public.audit_log FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

COMMENT ON TABLE public.audit_log IS
  'Trilha append-only de ações sensíveis. Escrita só pelo backend; o cliente lê a própria org e não altera nada.';
