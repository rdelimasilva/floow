-- =============================================================================
-- Fila de revisão por contraparte, substituindo a detecção de natureza por
-- texto (00034). Ver
-- docs/superpowers/specs/2026-09-04-openfinance-counterparty-review-design.md
-- =============================================================================

CREATE TYPE public.counterparty_key_type AS ENUM ('tax_id', 'description');
CREATE TYPE public.counterparty_direction AS ENUM ('in', 'out');
CREATE TYPE public.review_state AS ENUM ('confirmed', 'pending');

CREATE TABLE public.counterparties (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  key_type      public.counterparty_key_type NOT NULL,
  key_value     text NOT NULL CHECK (length(btrim(key_value)) > 0),
  direction     public.counterparty_direction NOT NULL,
  -- NULL para tax_id (mesma entidade em qualquer conta). Obrigatório para
  -- description (vocabulário daquele banco específico).
  account_id    uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  nature        public.transaction_type,
  category_id   uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  display_name  text NOT NULL,
  confirmed_at  timestamptz,
  confirmed_by  uuid REFERENCES public.profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (nature = 'transfer' AND category_id IS NULL)
    OR (nature IN ('income', 'expense') AND category_id IS NOT NULL)
    OR (nature IS NULL AND category_id IS NULL)
  )
);

CREATE INDEX idx_counterparties_org_id ON public.counterparties(org_id);

-- Dois índices únicos parciais, não um: account_id é anulável, e NULL nunca
-- colide com NULL num índice único do Postgres. Sem a partição, duas
-- contrapartes tax_id idênticas (account_id nulo nas duas) coexistiriam.
CREATE UNIQUE INDEX uq_counterparties_tax_id
  ON public.counterparties(org_id, key_type, key_value, direction)
  WHERE account_id IS NULL;

CREATE UNIQUE INDEX uq_counterparties_description
  ON public.counterparties(org_id, key_type, key_value, direction, account_id)
  WHERE account_id IS NOT NULL;

ALTER TABLE public.counterparties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "counterparties: members can select"
  ON public.counterparties FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "counterparties: members can insert"
  ON public.counterparties FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "counterparties: members can update"
  ON public.counterparties FOR UPDATE TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "counterparties: members can delete"
  ON public.counterparties FOR DELETE TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

-- Migra as 3 regras de natureza existentes. Direção 'out': o detector antigo
-- só olhava lançamentos type='expense' (nature-queries.ts), então toda regra
-- gravada até aqui só valia para dinheiro saindo — preservar isso é FIEL ao
-- comportamento antigo, não uma escolha nova.
--
-- SÓ regra 'transfer' migra CONFIRMADA. Regra 'expense' ("é despesa mesmo",
-- ver nature-actions.ts) tinha nature sem categoria — e o CHECK acima exige
-- categoria para nature confirmada em expense/income. Reconstruir a categoria
-- por category_ref em SQL duplicaria em TypeScript a mesma lógica que já
-- existe (loadCategoryIndex, sync.ts) — a "dobra" que este projeto evita em
-- toda parte. Regra 'expense' migra como PENDENTE (nature NULL): a
-- contraparte volta para a fila do bootstrap, o usuário confirma de novo com
-- categoria — redundante, nunca incorreto. É diferente de perder a
-- informação: sem isso, ela desapareceria calada dentro do CASE abaixo.
INSERT INTO public.counterparties
  (org_id, key_type, key_value, direction, account_id, nature, category_id, display_name, confirmed_at)
SELECT
  org_id,
  'description'::public.counterparty_key_type,
  match_value,
  'out'::public.counterparty_direction,
  account_id,
  CASE WHEN nature = 'transfer' THEN nature ELSE NULL END,
  NULL,
  match_value,
  CASE WHEN nature = 'transfer' THEN now() ELSE NULL END
FROM public.transaction_nature_rules
WHERE account_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- account_id NULL não pode migrar para key_type='description' (a chave exige
-- conta). Nenhuma linha de produção está nesse estado (a UI sempre gravou
-- accountId do grupo), mas o CHECK abaixo teria rejeitado o INSERT em
-- silêncio caso existisse — não existe, confirmado contra produção antes
-- desta migração.

-- NÃO derruba transaction_nature_rules aqui. `sync.ts` (Task 5) e
-- `nature-actions.ts`/`nature-rules.ts` (Task 11) continuam consultando esta
-- tabela até serem reescritos — derrubá-la agora quebraria o repo inteiro no
-- intervalo entre esta task e aquelas. O DROP fica na migração 00036,
-- escrita na Task 11, depois que o último consumidor for removido.

-- Colunas novas em transactions.
ALTER TABLE public.transactions
  ADD COLUMN counterparty_id uuid REFERENCES public.counterparties(id) ON DELETE SET NULL,
  ADD COLUMN counterparty_tax_id text,
  ADD COLUMN counterparty_name text,
  ADD COLUMN review_state public.review_state NOT NULL DEFAULT 'confirmed';

-- Índice que serve DOIS propósitos: a contagem do portão
-- (org_id, review_state = 'pending') e o filtro dos 4 agregadores
-- (org_id, review_state = 'confirmed').
CREATE INDEX idx_transactions_org_review_state
  ON public.transactions(org_id, review_state);

CREATE INDEX idx_transactions_counterparty_id
  ON public.transactions(counterparty_id)
  WHERE counterparty_id IS NOT NULL;

-- Portão: quando a org zerou a fila pela primeira vez, fica destravada para
-- sempre, mesmo que uma conexão nova traga uma pendência grande depois.
ALTER TABLE public.orgs
  ADD COLUMN review_gate_cleared_at timestamptz;
