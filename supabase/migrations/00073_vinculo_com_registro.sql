-- 00073: todo vínculo previsão → realizado tem registro.
--
-- Até aqui o banco aceitava qualquer `matched_transaction_id`. Três caminhos
-- gravavam: aprovar na fila (com proposta), o R1 (sem proposta) e, antes de
-- 21/09, o sync (sem proposta). Vínculo errado sem registro não tem dono nem
-- data, e esconde o lançamento certo: caso de 01/10/2026, Jussara 10/61
-- presa à Unimed, a TED dela sem previsão para casar.
--
-- Daqui em diante: `matched_transaction_id` preenchido exige a proposta
-- APROVADA do mesmo par em `forecast_match_proposals`. Checado no COMMIT
-- (constraint trigger deferida), para que gravar o vínculo e a proposta na
-- mesma transação funcione em qualquer ordem.

-- Quem decidiu: o usuário na fila, o motor (R1, valor igual e par único) ou
-- o passado sem registro, preenchido aqui.
ALTER TABLE public.forecast_match_proposals
  ADD COLUMN IF NOT EXISTS decisao text
    CHECK (decisao IN ('usuario', 'automatico', 'legado'));

-- Proposta de troca: a previsão já está vinculada a este lançamento, que a
-- regra de hoje não casaria, e o realizado da proposta casa. Aprovar solta o
-- vínculo antigo (recusado para sempre) e grava o novo.
ALTER TABLE public.forecast_match_proposals
  ADD COLUMN IF NOT EXISTS substitui_transaction_id uuid
    REFERENCES public.transactions(id) ON DELETE CASCADE;

-- Decisões já tomadas na fila foram do usuário.
UPDATE public.forecast_match_proposals
   SET decisao = 'usuario'
 WHERE status IN ('approved', 'refused') AND decisao IS NULL;

-- O passado: todo vínculo existente ganha o registro que faltava. Aguardando
-- o extrato = absorção do R1; o resto, casamento antigo do sync ou teste.
INSERT INTO public.forecast_match_proposals
  (org_id, forecast_transaction_id, realized_transaction_id, status, decided_at, decisao)
SELECT t.org_id, t.id, t.matched_transaction_id, 'approved', now(),
       CASE WHEN t.aguarda_extrato THEN 'automatico' ELSE 'legado' END
  FROM public.transactions t
 WHERE t.matched_transaction_id IS NOT NULL
ON CONFLICT (forecast_transaction_id, realized_transaction_id) DO UPDATE
   SET status = 'approved',
       decided_at = COALESCE(public.forecast_match_proposals.decided_at, now()),
       decisao = CASE WHEN public.forecast_match_proposals.status = 'approved'
                      THEN public.forecast_match_proposals.decisao
                      ELSE 'legado' END;

-- Lado da previsão: o vínculo que está na linha no fim da transação tem de
-- ter a proposta aprovada do par. Relê a linha (e não usa NEW) porque a
-- checagem é no COMMIT: vale o estado final, não o de cada UPDATE.
CREATE OR REPLACE FUNCTION public.vinculo_exige_proposta_aprovada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  atual uuid;
BEGIN
  SELECT matched_transaction_id INTO atual FROM public.transactions WHERE id = NEW.id;
  IF atual IS NULL THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.forecast_match_proposals
     WHERE forecast_transaction_id = NEW.id
       AND realized_transaction_id = atual
       AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Vínculo sem registro: a previsão % aponta para % sem proposta aprovada', NEW.id, atual
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_vinculo_exige_proposta ON public.transactions;
CREATE CONSTRAINT TRIGGER trg_vinculo_exige_proposta
  AFTER INSERT OR UPDATE OF matched_transaction_id ON public.transactions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (NEW.matched_transaction_id IS NOT NULL)
  EXECUTE FUNCTION public.vinculo_exige_proposta_aprovada();

-- Lado da proposta: a aprovada não deixa de ser aprovada (nem some) enquanto
-- o vínculo dela estiver gravado. Apagar a transação leva a proposta pelo
-- CASCADE, e aí a linha também não existe mais: não barra.
CREATE OR REPLACE FUNCTION public.proposta_aprovada_em_uso()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.transactions
     WHERE id = OLD.forecast_transaction_id
       AND matched_transaction_id = OLD.realized_transaction_id
  ) AND NOT EXISTS (
    SELECT 1 FROM public.forecast_match_proposals
     WHERE forecast_transaction_id = OLD.forecast_transaction_id
       AND realized_transaction_id = OLD.realized_transaction_id
       AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Vínculo sem registro: a proposta aprovada de % -> % saiu com o vínculo gravado',
      OLD.forecast_transaction_id, OLD.realized_transaction_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_proposta_aprovada_em_uso ON public.forecast_match_proposals;
CREATE CONSTRAINT TRIGGER trg_proposta_aprovada_em_uso
  AFTER UPDATE OF status OR DELETE ON public.forecast_match_proposals
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (OLD.status = 'approved')
  EXECUTE FUNCTION public.proposta_aprovada_em_uso();

COMMENT ON COLUMN public.forecast_match_proposals.decisao IS
  'Quem decidiu: usuario (fila), automatico (R1), legado (vínculo anterior à 00073).';
COMMENT ON COLUMN public.forecast_match_proposals.substitui_transaction_id IS
  'Proposta de troca: o realizado ao qual a previsão está vinculada hoje. Aprovar solta esse vínculo e grava o novo.';
