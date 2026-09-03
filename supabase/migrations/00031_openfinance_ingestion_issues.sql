-- =============================================================================
-- Trilha do que a ingestão não conseguiu ler — Migration 00031
-- =============================================================================
--
-- O normalizador levanta erro em valor ou data que não reconhece, e isso é
-- proposital: virar NaN em silêncio poria número errado no saldo do cliente.
-- Mas até agora esse erro subia e derrubava a página inteira de 500 transações.
--
-- Em produção, com clientes, ninguém vai olhar o payload de cada instituição
-- para descobrir o que veio diferente. Então o lote passa a entrar, e o que não
-- deu fica AQUI, com o payload cru — para ser diagnosticado e reimportado
-- depois, em vez de bloquear a importação toda agora.
--
-- Duas garantias que essa tabela sustenta:
--
-- 1. Nada se perde em silêncio. "Faltou uma transação no meu extrato" deixa de
--    ser indebugável: o payload que a Polp mandou está gravado.
-- 2. O recurso NÃO avança seu last_synced_at quando houve rejeição (ver
--    sync.ts). Assim a próxima sincronização repuxa a mesma janela, e as
--    transações voltam sozinhas quando o normalizador for corrigido. Sem isso,
--    a janela avançaria e o dado só voltaria com uma reimportação manual.

CREATE TABLE IF NOT EXISTS public.openfinance_ingestion_issues (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  -- Recurso da Polp de onde veio. ON DELETE SET NULL para a trilha sobreviver
  -- à revogação da conexão: o diagnóstico continua valendo depois.
  resource_id  uuid REFERENCES public.openfinance_resources(id) ON DELETE SET NULL,
  -- `id` da transação na Polp, quando o payload traz um reconhecível.
  external_id  text,
  reason       text NOT NULL,
  payload      jsonb NOT NULL,
  resolved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.openfinance_ingestion_issues IS
  'Itens que a ingestão Open Finance não conseguiu normalizar, com o payload cru para diagnóstico e reimportação.';

-- A consulta que importa é "o que está pendente nesta org", e a de operação é
-- "o que apareceu de novo", por isso as duas colunas no mesmo índice.
CREATE INDEX IF NOT EXISTS idx_openfinance_issues_org_created
  ON public.openfinance_ingestion_issues (org_id, created_at DESC)
  WHERE resolved_at IS NULL;

-- Agrupar por motivo é como se descobre um formato novo de instituição: cinco
-- clientes com a mesma mensagem é padrão, não acaso.
CREATE INDEX IF NOT EXISTS idx_openfinance_issues_reason
  ON public.openfinance_ingestion_issues (reason);

ALTER TABLE public.openfinance_ingestion_issues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "openfinance_ingestion_issues: members can select" ON public.openfinance_ingestion_issues;
DROP POLICY IF EXISTS "openfinance_ingestion_issues: members can insert" ON public.openfinance_ingestion_issues;

-- Só leitura e inserção pela org. Apagar trilha de diagnóstico não é operação
-- de usuário; `resolved_at` existe para marcar o que já foi tratado.
CREATE POLICY "openfinance_ingestion_issues: members can select"
  ON public.openfinance_ingestion_issues FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "openfinance_ingestion_issues: members can insert"
  ON public.openfinance_ingestion_issues FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));
