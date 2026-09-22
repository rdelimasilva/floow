-- supabase/migrations/00049_propostas_de_duplicata.sql
-- =============================================================================
-- O mesmo lançamento entregue duas vezes pela fonte passa a pedir decisão
-- -----------------------------------------------------------------------------
-- A ingestão deduplica pelo índice único `(external_id, account_id)`, que não
-- protege quando a Polp REEMITE o mesmo evento com outro id — foi o que houve
-- em 16/09: o pagamento da fatura entrou como "SAIDA FATURA PERSON MC BLACK" e
-- de novo como "Débito automático FATURA PERSON MC BLACK", e R$ 11.685,40
-- pesaram duas vezes no saldo até alguém conferir o extrato.
--
-- Propõe, nunca apaga, pelo mesmo motivo de `forecast_match_proposals`: o risco
-- não é simétrico. Apagar errado destrói um lançamento real e o usuário não
-- tem como saber que ele existiu; deixar o par na fila só pede um clique.
-- Compras repetidas legítimas — "Westwing" cinco vezes no mesmo dia, mesmo
-- valor — têm a mesma cara de duplicata para qualquer heurística, e só o dono
-- da conta sabe a diferença.
--
-- Aprovar marca a duplicata como `is_ignored`, não a deleta: `is_ignored` já
-- significa "este lançamento é errado, não existe" no schema, já a remove de
-- orçamentos, dívidas e CFO, reverte o saldo — e é reversível.
--
-- Ver packages/core-finance/src/openfinance/duplicata.ts para o sinal que
-- separa duplicata de compra repetida (o instante de emissão do UUIDv7).
-- =============================================================================

CREATE TABLE public.duplicate_proposals (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                     uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  -- O que fica: a versão que conhece a contraparte, ou a emitida primeiro
  -- quando as duas sabem o mesmo.
  manter_transaction_id      uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  -- O reemitido, candidato a sair.
  duplicata_transaction_id   uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  -- Distância entre as emissões, em minutos: é o que justifica a proposta na
  -- tela. Sem isso o usuário vê dois lançamentos iguais e nenhuma razão.
  minutos_entre_emissoes     integer NOT NULL,
  status                     text NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'approved', 'refused')),
  proposed_at                timestamptz NOT NULL DEFAULT now(),
  decided_at                 timestamptz,

  -- Um lançamento não é duplicata de si mesmo.
  CONSTRAINT duplicate_proposals_lados_distintos
    CHECK (manter_transaction_id <> duplicata_transaction_id)
);

CREATE INDEX idx_dp_org_status ON public.duplicate_proposals(org_id, status);

-- O par recusado nunca volta: o criador insere com ON CONFLICT DO NOTHING,
-- então a recusa é parede e não checagem. Mesmo desenho da 00047.
CREATE UNIQUE INDEX uq_dp_par
  ON public.duplicate_proposals(manter_transaction_id, duplicata_transaction_id);

-- Uma proposta aberta por lançamento suspeito.
CREATE UNIQUE INDEX uq_dp_duplicata_pendente
  ON public.duplicate_proposals(duplicata_transaction_id)
  WHERE status = 'pending';

ALTER TABLE public.duplicate_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "duplicate_proposals: members can select"
  ON public.duplicate_proposals FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "duplicate_proposals: members can insert"
  ON public.duplicate_proposals FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "duplicate_proposals: members can update"
  ON public.duplicate_proposals FOR UPDATE TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "duplicate_proposals: members can delete"
  ON public.duplicate_proposals FOR DELETE TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

COMMENT ON TABLE public.duplicate_proposals IS
  'Par de lancamentos que a fonte entregou duas vezes. Aprovar marca a duplicata como is_ignored e reverte o saldo; recusar barra aquele par para sempre.';
