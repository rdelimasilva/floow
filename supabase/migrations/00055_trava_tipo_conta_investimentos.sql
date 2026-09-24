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

CREATE TRIGGER trg_trava_tipo_conta_investimentos
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.trava_tipo_conta_investimentos();
