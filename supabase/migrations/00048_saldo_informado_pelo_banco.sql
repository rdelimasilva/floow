-- supabase/migrations/00048_saldo_informado_pelo_banco.sql
-- =============================================================================
-- O saldo que o banco informa, guardado ao lado do que nós derivamos
-- -----------------------------------------------------------------------------
-- `accounts.balance_cents` é derivado: soma dos lançamentos aplicados. Até
-- aqui ninguém o conferia com a fonte, e o primeiro erro real passou três dias
-- invisível — a Polp reemitiu um pagamento de fatura com outro `external_id`,
-- o dedupe por id não pegou, R$ 11.685,40 entraram duas vezes no saldo, e só
-- apareceu quando o usuário abriu o extrato do banco.
--
-- Um detector de duplicata resolve o defeito que já conhecemos. Comparar o
-- nosso número com o do banco resolve a classe inteira: lançamento faltando,
-- reemitido, duplicado, ou erro nosso de saldo — qualquer um deles faz os dois
-- números divergirem, sem precisarmos prever qual foi.
--
-- Fica em `openfinance_resources`, e não em `accounts`, porque é um dado DA
-- FONTE, não da conta: uma conta sem Open Finance simplesmente não tem essa
-- coluna preenchida, e a ausência é informação honesta em vez de um zero que
-- fingiria conferência.
--
-- `CREDIT_CARD_ACCOUNT` nunca preenche: o detalhe do cartão traz `limits`, não
-- `balance`, porque fatura e limite usado não são a mesma pergunta que saldo.
-- =============================================================================

ALTER TABLE public.openfinance_resources
  ADD COLUMN bank_balance_cents integer,
  ADD COLUMN bank_balance_at    timestamptz;

COMMENT ON COLUMN public.openfinance_resources.bank_balance_cents IS
  'Saldo disponivel que o banco informou na ultima sincronizacao. NULL quando a fonte nao responde saldo (cartao de credito) ou quando a leitura falhou.';

COMMENT ON COLUMN public.openfinance_resources.bank_balance_at IS
  'Quando o banco apurou o saldo (update_date_time do payload), nao quando gravamos. Um saldo velho compara mal com um extrato de hoje.';
