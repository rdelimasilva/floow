-- =============================================================================
-- Papel de aplicação sujeito a RLS
-- -----------------------------------------------------------------------------
-- NÃO faz cutover. Cria o papel e os grants; trocar o DATABASE_URL é um passo
-- manual, depois de validar. Ver docs/adr/0001-rls-no-caminho-do-app.md.
--
-- Hoje o app conecta como dono das tabelas. Dono ignora RLS, então toda policy
-- deste repositório é decorativa no caminho do Drizzle — o isolamento entre
-- orgs existe só porque cada query lembra de filtrar por org_id.
--
-- Mesmo desenho do PostgREST: um papel de login SEM privilégio próprio
-- (NOINHERIT), que só consegue fazer algo depois de assumir `authenticated`
-- dentro da transação. É o que withRls() faz.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'floow_app') THEN
    -- Sem senha aqui de propósito: senha em migration é senha no git.
    -- Defina fora do versionamento:
    --   ALTER ROLE floow_app WITH PASSWORD '<senha forte>';
    CREATE ROLE floow_app LOGIN NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;

-- NOINHERIT: floow_app não usa os privilégios de authenticated automaticamente.
-- Só passa a valer depois de `set_config('role','authenticated',true)`, que é
-- justamente o ponto onde as claims do usuário também entram. Conexão sem
-- contexto não enxerga nada.
GRANT authenticated TO floow_app;

GRANT CONNECT ON DATABASE postgres TO floow_app;
GRANT USAGE ON SCHEMA public TO floow_app;

-- Blindagem: se alguém apontar DATABASE_URL para este papel e esquecer o
-- withRls, que não haja acesso nenhum em vez de acesso amplo.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM floow_app;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM floow_app;

COMMENT ON ROLE floow_app IS
  'Papel de login do app. Sem privilégio próprio: precisa assumir authenticated na transação (withRls).';
