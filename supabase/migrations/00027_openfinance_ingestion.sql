-- =============================================================================
-- Open Finance ingestion via Polp (Celcoin v2) — Migration 00027
-- Ver docs/superpowers/specs/2026-09-02-openfinance-ingestion-design.md
--
-- A API da Polp NÃO é multi-tenant: uma credencial por conta, sem header de
-- tenant, e o webhook traz apenas um resource_id — nada que diga a qual org o
-- dado pertence. A segregação é inteiramente nossa, e é por isso que toda
-- entidade da Polp é registrada localmente COM org_id antes de qualquer dado
-- ser aceito. `openfinance_resources.polp_resource_id` é único justamente para
-- tornar o roteamento do webhook determinístico.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Hierarquia de categorias (D6)
-- ----------------------------------------------------------------------------
-- A taxonomia da Polp tem dois níveis (FOOD_AND_DRINK -> FOOD_AND_DRINK_GROCERIES).
-- Sem parent_id, importá-la achatada quebraria orçamentos existentes: um teto em
-- "Alimentação" deixaria de captar o que passa a cair na categoria filha.

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  -- Valor do enum TransactionCategory da Polp (ex.: FOOD_AND_DRINK_GROCERIES).
  -- É o que liga category_ref das transações à categoria local.
  ADD COLUMN IF NOT EXISTS polp_ref text;

CREATE INDEX IF NOT EXISTS idx_categories_parent_id
  ON public.categories USING btree (parent_id);

-- Uma categoria de sistema por polp_ref. Categorias de org (org_id não nulo)
-- ficam fora: um usuário pode criar a sua própria sem colidir com a taxonomia.
CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_polp_ref_system
  ON public.categories (polp_ref)
  WHERE polp_ref IS NOT NULL AND org_id IS NULL;

-- ----------------------------------------------------------------------------
-- 2. Colunas novas em transactions
-- ----------------------------------------------------------------------------

ALTER TABLE public.transactions
  -- Data de lançamento na fatura do cartão. NULL enquanto não faturada.
  -- ATENÇÃO: a Polp envia a sentinela '0001-01-01' nesse caso; a ingestão
  -- converte para NULL. Gravá-la crua jogaria o lançamento para o ano 1.
  ADD COLUMN IF NOT EXISTS bill_post_date date,
  -- Mês/ano de faturamento previsto (AAAA-MM), sempre preenchido pela Polp,
  -- inclusive para parcelas futuras ainda não lançadas em fatura.
  ADD COLUMN IF NOT EXISTS bill_forecast_month text,
  -- Merchant Category Code, usado como desempate quando category_ref é genérico.
  ADD COLUMN IF NOT EXISTS payee_mcc integer,
  -- Valor cru do enum TransactionCategory da Polp, guardado mesmo quando já
  -- mapeado: permite recategorizar em massa depois sem reimportar.
  ADD COLUMN IF NOT EXISTS category_ref text;

-- Parcelamento NÃO ganha coluna nova: installment_number e installment_total já
-- existem (migration 00012, recorrências) e são exatamente o que a Polp envia em
-- charge_identificator (parcela atual) e charge_number (total). A ingestão
-- escreve nelas, para que uma compra parcelada importada e uma lançada à mão
-- fiquem indistinguíveis para o resto do sistema.

-- Consultas do pacing de caixa (visão futura) filtram por mês de faturamento.
CREATE INDEX IF NOT EXISTS idx_transactions_bill_forecast
  ON public.transactions USING btree (org_id, bill_forecast_month)
  WHERE bill_forecast_month IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. openfinance_connections — um consentimento, sempre de UM CPF
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.openfinance_connections (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  -- Quem conectou. A org é a família e vê o consolidado; esta coluna deixa a
  -- porta aberta para filtrar por pessoa depois, sem exigir nova migration.
  owner_user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  polp_consent_id   text NOT NULL,
  institution_id    text NOT NULL,
  institution_name  text,
  -- SHA-256 do CPF com salt da aplicação. O CPF em claro NUNCA é armazenado:
  -- serve apenas para criar o consentimento (recreate e revoke usam o
  -- consent_id). O hash existe por razão operacional: o teto de reconexão do
  -- Open Finance é regulatório por CPF, e reconectar o mesmo par CPF+banco
  -- queima cota mensal — com o hash detectamos antes de chamar a API.
  cpf_hash          text NOT NULL,
  cpf_masked        text NOT NULL,
  status            text NOT NULL,
  execution_status  text,
  flags             text[] NOT NULL DEFAULT '{}',
  products          text[] NOT NULL DEFAULT '{}',
  last_synced_at    timestamptz,
  revoked_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_openfinance_connections_consent
  ON public.openfinance_connections (polp_consent_id);

-- Impede reconexão duplicada do mesmo CPF+banco dentro da família, complementando
-- o avoidDuplicates do lado da Polp. Parcial: uma conexão revogada não bloqueia
-- uma nova.
CREATE UNIQUE INDEX IF NOT EXISTS uq_openfinance_connections_active
  ON public.openfinance_connections (org_id, cpf_hash, institution_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_openfinance_connections_org_status
  ON public.openfinance_connections USING btree (org_id, status);

-- ----------------------------------------------------------------------------
-- 4. openfinance_resources — conta ou cartão dentro de um consentimento
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.openfinance_resources (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  connection_id     uuid NOT NULL REFERENCES public.openfinance_connections(id) ON DELETE CASCADE,
  -- UUID local da Polp. É a CHAVE do roteamento de webhook: dado este id,
  -- descobrimos a org. Único justamente para que essa resolução nunca seja
  -- ambígua — um resource_id pertence a exatamente uma org, ou a nenhuma.
  polp_resource_id  text NOT NULL,
  resource_type     text NOT NULL,
  status            text NOT NULL,
  -- Conta espelho no floow. NULL até o usuário escolher vincular ou criar.
  account_id        uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  last_synced_at    timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_openfinance_resources_polp_id
  ON public.openfinance_resources (polp_resource_id);

CREATE INDEX IF NOT EXISTS idx_openfinance_resources_org_type
  ON public.openfinance_resources USING btree (org_id, resource_type);

CREATE INDEX IF NOT EXISTS idx_openfinance_resources_connection
  ON public.openfinance_resources USING btree (connection_id);

-- ----------------------------------------------------------------------------
-- 5. openfinance_webhook_events — auditoria e detecção de evento órfão
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.openfinance_webhook_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL quando o evento não pôde ser roteado. Uma linha com org_id nulo é o
  -- alarme: chegou dado que não sabemos de quem é, e foi recusado em vez de
  -- gravado em algum tenant por adivinhação.
  org_id         uuid REFERENCES public.orgs(id) ON DELETE CASCADE,
  event          text NOT NULL,
  resource       text NOT NULL,
  resource_id    text NOT NULL,
  query_params   text,
  status         text NOT NULL DEFAULT 'received',
  reject_reason  text,
  payload        jsonb NOT NULL,
  processed_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_openfinance_webhook_resource
  ON public.openfinance_webhook_events USING btree (resource_id);

CREATE INDEX IF NOT EXISTS idx_openfinance_webhook_status
  ON public.openfinance_webhook_events USING btree (status, created_at DESC);

-- ----------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY
-- Padrão do projeto: org_id IN (SELECT public.get_user_org_ids()), com
-- WITH CHECK no UPDATE para impedir mover linha entre orgs.
--
-- ATENÇÃO: o handler de webhook roda com service role, onde RLS NÃO se aplica.
-- Estas políticas protegem o acesso do usuário autenticado; a segregação no
-- caminho do webhook é feita em código, explicitamente.
-- ----------------------------------------------------------------------------

ALTER TABLE public.openfinance_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "openfinance_connections: members can select"
  ON public.openfinance_connections FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "openfinance_connections: members can insert"
  ON public.openfinance_connections FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "openfinance_connections: members can update"
  ON public.openfinance_connections FOR UPDATE TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "openfinance_connections: members can delete"
  ON public.openfinance_connections FOR DELETE TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

ALTER TABLE public.openfinance_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "openfinance_resources: members can select"
  ON public.openfinance_resources FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "openfinance_resources: members can insert"
  ON public.openfinance_resources FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "openfinance_resources: members can update"
  ON public.openfinance_resources FOR UPDATE TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "openfinance_resources: members can delete"
  ON public.openfinance_resources FOR DELETE TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

-- Eventos de webhook são trilha de auditoria: o usuário lê os seus, e apenas
-- o service role escreve. Sem políticas de INSERT/UPDATE/DELETE para
-- authenticated — a ausência de política já nega a operação.
ALTER TABLE public.openfinance_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "openfinance_webhook_events: members can select"
  ON public.openfinance_webhook_events FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));
