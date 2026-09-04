-- =============================================================================
-- Regras de natureza: transformar despesa em transferência, com confirmação
-- explícita do usuário.
-- -----------------------------------------------------------------------------
-- A Polp classifica a mesma operação de dois jeitos na mesma conta corrente.
-- "Saída APLICACAO CDB DI" vem rotulada como transferência; "Aplicação CDB DI",
-- a mesma operação, vem como OTHER e entrou como despesa — R$ 125 mil. E o
-- débito automático da fatura do cartão chega como TARIFA_SERVICOS_AVULSOS com
-- category_ref de tarifa bancária: R$ 106 mil contados duas vezes, porque as
-- compras do cartão já entraram uma a uma.
--
-- `category_rules` não serve: ela atribui categoria, não natureza, e o
-- category_id de lá é NOT NULL. Tabela irmã, com o mesmo padrão de RLS.
--
-- Ver docs/superpowers/specs/2026-09-03-openfinance-nature-reclassification-design.md
-- =============================================================================

CREATE TABLE public.transaction_nature_rules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  -- NULL = vale para a org inteira. Preenchido = só naquela conta.
  account_id  uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  match_type  text NOT NULL CHECK (match_type IN ('contains', 'exact')),
  match_value text NOT NULL CHECK (length(btrim(match_value)) > 0),
  nature      public.transaction_type NOT NULL,
  priority    integer NOT NULL DEFAULT 0,
  is_enabled  boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_transaction_nature_rules_org_id
  ON public.transaction_nature_rules(org_id);

-- Unicidade da regra. Confirmar o mesmo grupo duas vezes — dois cliques, ou o
-- painel reaberto depois de uma revalidação — gravava duas regras idênticas,
-- que a interface não oferece jeito nenhum de remover.
--
-- São DOIS índices parciais, e não um só sobre (org_id, account_id,
-- match_value), porque `account_id` é anulável e no índice único do Postgres
-- NULL nunca colide com NULL: a regra da org inteira escaparia da restrição
-- justamente por ser a de maior alcance.
CREATE UNIQUE INDEX uq_transaction_nature_rules_conta
  ON public.transaction_nature_rules(org_id, account_id, match_value)
  WHERE account_id IS NOT NULL;

CREATE UNIQUE INDEX uq_transaction_nature_rules_org
  ON public.transaction_nature_rules(org_id, match_value)
  WHERE account_id IS NULL;

ALTER TABLE public.transaction_nature_rules ENABLE ROW LEVEL SECURITY;

-- Padrão consolidado pela 00026: a chave no JWT é o ARRAY `org_ids`, e
-- `app_metadata ->> 'org_id'` devolve NULL — o que o RLS trata como falso e
-- bloqueia tudo em silêncio.
CREATE POLICY "transaction_nature_rules: members can select"
  ON public.transaction_nature_rules FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "transaction_nature_rules: members can insert"
  ON public.transaction_nature_rules FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

-- WITH CHECK além do USING: sem ele o usuário poderia mover a regra de uma org
-- dele para outra no meio da atualização.
CREATE POLICY "transaction_nature_rules: members can update"
  ON public.transaction_nature_rules FOR UPDATE TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "transaction_nature_rules: members can delete"
  ON public.transaction_nature_rules FOR DELETE TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

-- `type` cru da Polp (AccountTransactionType). O detector de suspeitas usa como
-- sinal estrutural, e hoje ele se perde depois da normalização. Fica NULL nas
-- linhas já importadas; a próxima sincronização preenche pelo UPDATE de
-- enriquecimento. Sem backfill aqui: o payload cru não está mais disponível.
ALTER TABLE public.transactions ADD COLUMN polp_type text;
