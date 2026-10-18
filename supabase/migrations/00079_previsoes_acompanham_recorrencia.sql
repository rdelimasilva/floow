-- =============================================================================
-- Previsões pendentes de recorrência voltam a seguir o modelo
-- -----------------------------------------------------------------------------
-- Até o commit "editar a recorrência leva categoria, valor, conta e descrição
-- às parcelas pendentes", editar o modelo mudava só a data das parcelas. As
-- previsões já geradas ficaram com a categoria, o valor, a conta e a descrição
-- de antes: "TIM internet" sem categoria, "Flavio - Terapia" em Saúde/R$ 2.300
-- com o modelo em Psicólogo/R$ 3.800, "Aluguel, condomínio e iptu" em "Casa "
-- com o modelo em Aluguel — e o Ritmo e o Plano de Gastos olhando a categoria
-- errada.
--
-- Mesmo recorte que a edição usa (`condicoesDeParcelasPendentes`): previsão
-- pura, de hoje em diante — sem saldo aplicado, sem vínculo, não ignorada.
-- O que o banco já cumpriu ou está no saldo fica como está.
--
-- Genérica, para todas as orgs: é o estado que a edição deixaria se tivesse
-- propagado desde o início. Depois do deploy o próprio app mantém o
-- alinhamento (e salvar a recorrência realinha a série dela).
--
-- Pode ser aplicada antes ou depois do deploy. Idempotente.
-- Renumerar se outra migration 00079 entrar antes.
-- =============================================================================

UPDATE public.transactions t
SET
  category_id = rt.category_id,
  is_auto_categorized = false,
  account_id = rt.account_id,
  type = rt.type,
  amount_cents = CASE WHEN rt.type = 'income' THEN abs(rt.amount_cents) ELSE -abs(rt.amount_cents) END,
  description = CASE
    WHEN t.installment_total > 1 AND t.installment_number IS NOT NULL
      THEN rt.description || ' (' || t.installment_number || '/' || t.installment_total || ')'
    ELSE rt.description
  END
FROM public.recurring_templates rt
WHERE rt.id = t.recurring_template_id
  AND rt.org_id = t.org_id
  AND t.balance_applied = false
  AND t.matched_transaction_id IS NULL
  AND t.is_ignored = false
  AND t.date >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
  AND (
    t.category_id IS DISTINCT FROM rt.category_id
    OR t.account_id IS DISTINCT FROM rt.account_id
    OR t.type IS DISTINCT FROM rt.type
    OR t.amount_cents IS DISTINCT FROM (CASE WHEN rt.type = 'income' THEN abs(rt.amount_cents) ELSE -abs(rt.amount_cents) END)
  );
