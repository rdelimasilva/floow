-- supabase/migrations/00055_trava_tipo_conta_investimentos.sql
-- =============================================================================
-- Trava o tipo da conta de investimentos do Open Finance
-- -----------------------------------------------------------------------------
-- A conta "Investimentos · <banco>" (openfinance_connections.investment_account_id)
-- nasce `brokerage` de propósito: fica fora do patrimônio e dos seletores de
-- lançamento, e recebe a segunda perna das aplicações/resgates do extrato.
-- Trocar o tipo (para conta corrente, por exemplo) faria esse dinheiro contar
-- duas vezes. O nome continua livre.
--
-- Idempotente: pode rodar de novo sem erro.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.trava_tipo_conta_investimentos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.type IS DISTINCT FROM OLD.type AND EXISTS (
    SELECT 1 FROM public.openfinance_connections c
    WHERE c.investment_account_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'A conta de investimentos do Open Finance não pode mudar de tipo.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trava_tipo_conta_investimentos ON public.accounts;

-- Conta de investimentos que já mudou de tipo antes da trava: volta para
-- brokerage. Sem isto ela ficaria travada no tipo errado — e o vínculo das
-- aplicações (que só liga em conta brokerage) nunca a alcançaria. Depois do
-- DROP TRIGGER: numa segunda execução, a trava antiga não barra a correção.
UPDATE public.accounts
SET type = 'brokerage'
WHERE id IN (
  SELECT investment_account_id FROM public.openfinance_connections
  WHERE investment_account_id IS NOT NULL
)
AND type <> 'brokerage';

-- WHEN: só dispara quando o tipo muda — atualização de saldo e nome não paga a consulta.
CREATE TRIGGER trg_trava_tipo_conta_investimentos
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW
  WHEN (OLD.type IS DISTINCT FROM NEW.type)
  EXECUTE FUNCTION public.trava_tipo_conta_investimentos();
