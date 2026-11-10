-- =============================================================================
-- Dados de mercado
-- -----------------------------------------------------------------------------
-- Base do agente de análise patrimonial. Os jobs de /api/cron/mercado-* baixam
-- uma vez por dia CDI, Selic e IPCA (BCB), cotas e taxas de fundos (CVM),
-- preços do Tesouro e cotações da B3 (brapi). A análise lê só daqui e nunca
-- chama a fonte na hora.
--
-- Dado público e igual para todo mundo: nenhuma tabela tem org_id. Usuário
-- logado pode ler; ninguém escreve pelo RLS. Os jobs gravam pela conexão de
-- serviço. A policy de leitura existe por causa do ADR 0001: depois do
-- cutover, o app roda como authenticated, e sem ela a leitura voltaria vazia
-- sem erro.
--
-- Nenhuma FK com o resto do banco. Para desfazer, basta dropar as seis.
-- =============================================================================

CREATE TABLE public.indicadores_diarios (
  serie text NOT NULL,
  data  date NOT NULL,
  valor numeric(18, 8) NOT NULL,
  PRIMARY KEY (serie, data)
);

CREATE TABLE public.cotacoes_b3 (
  ticker     text NOT NULL,
  data       date NOT NULL,
  fechamento numeric(18, 6) NOT NULL,
  PRIMARY KEY (ticker, data)
);

CREATE TABLE public.cotas_fundos (
  cnpj       text NOT NULL,
  data       date NOT NULL,
  cota       numeric(28, 12) NOT NULL,
  patrimonio numeric(20, 2),
  subclasse  text NOT NULL DEFAULT '',
  PRIMARY KEY (cnpj, data)
);

CREATE TABLE public.fundos_cvm (
  cnpj                   text PRIMARY KEY,
  cnpj_classe            text,
  nome                   text NOT NULL,
  classe_anbima          text,
  taxa_adm               numeric(10, 4),
  taxa_performance       numeric(10, 4),
  dias_conversao_resgate integer,
  dias_pagamento_resgate integer,
  data_referencia        date NOT NULL,
  atualizado_em          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tesouro_precos (
  tipo        text NOT NULL,
  vencimento  date NOT NULL,
  data        date NOT NULL,
  taxa_compra numeric(10, 4),
  taxa_venda  numeric(10, 4),
  pu_compra   numeric(18, 6),
  pu_venda    numeric(18, 6),
  PRIMARY KEY (tipo, vencimento, data)
);

CREATE TABLE public.execucoes_mercado (
  id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job    text NOT NULL,
  inicio timestamptz NOT NULL,
  fim    timestamptz NOT NULL,
  ok     boolean NOT NULL,
  linhas integer NOT NULL,
  nao_encontrados integer,
  erro   text
);

CREATE INDEX idx_execucoes_mercado_job_inicio ON public.execucoes_mercado (job, inicio DESC);

ALTER TABLE public.indicadores_diarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotacoes_b3         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotas_fundos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fundos_cvm          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tesouro_precos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.execucoes_mercado   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "indicadores_diarios: leitura pública" ON public.indicadores_diarios FOR SELECT TO authenticated USING (true);
CREATE POLICY "cotacoes_b3: leitura pública"         ON public.cotacoes_b3         FOR SELECT TO authenticated USING (true);
CREATE POLICY "cotas_fundos: leitura pública"        ON public.cotas_fundos        FOR SELECT TO authenticated USING (true);
CREATE POLICY "fundos_cvm: leitura pública"          ON public.fundos_cvm          FOR SELECT TO authenticated USING (true);
CREATE POLICY "tesouro_precos: leitura pública"      ON public.tesouro_precos      FOR SELECT TO authenticated USING (true);
CREATE POLICY "execucoes_mercado: leitura pública"   ON public.execucoes_mercado   FOR SELECT TO authenticated USING (true);
