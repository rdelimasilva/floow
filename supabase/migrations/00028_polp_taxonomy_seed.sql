-- =============================================================================
-- Seed da taxonomia da Polp em public.categories — Migration 00028
-- Ver docs/superpowers/specs/2026-09-02-openfinance-ingestion-design.md (D6)
--
-- 145 categorias de sistema (org_id NULL): 18 raízes e 127 filhas.
--
-- Espelha packages/core-finance/src/openfinance/taxonomy.ts — a mesma fonte que
-- a ingestão usa para resolver category_ref. taxonomy-seed.test.ts lê estas
-- migrations e falha se um ref existir de um lado e não do outro: a divergência
-- não daria erro nenhum em produção, a transação só chegaria sem categoria e
-- sumiria do orçamento. Ref novo na taxonomia pede migration nova — esta, uma
-- vez aplicada, não se edita.
--
-- As 10 categorias de sistema que o floow já tinha são REAPROVEITADAS quando
-- existem: recebem o polp_ref do nó correspondente e continuam com o mesmo id,
-- o mesmo nome e as mesmas transações apontando para elas. Sem isso a
-- importação criaria um "Salário" novo ao lado do existente, e os orçamentos
-- apontariam para o antigo enquanto os gastos cairiam no novo.
--
-- O alias é melhor esforço, não pré-condição. Categoria de sistema pode ter
-- sido renomeada ou excluída pela interface antes desta migration (o que de
-- fato aconteceu: "Transporte" virou "Carro", e "Saúde", "Outros" e
-- "Assinaturas" foram excluídas). Quem não for encontrada é simplesmente
-- criada no passo seguinte, e a verificação final garante que a taxonomia
-- fique completa de um jeito ou de outro.
--
-- "Assinaturas" não tem alias de propósito: é transversal na taxonomia da Polp
-- (streaming cai em ENTERTAINMENT, telefonia em RENT_AND_UTILITIES) e sobrevive
-- como categoria própria, sem polp_ref — quando ainda existir.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Raízes que já existem no floow recebem o polp_ref
-- ----------------------------------------------------------------------------
-- O nome do floow é mantido: é o que o usuário já vê e o que os orçamentos
-- referenciam. Só o vínculo com a taxonomia é novo.

UPDATE public.categories SET polp_ref = 'ENTERTAINMENT'
  WHERE org_id IS NULL AND is_system = true AND polp_ref IS NULL
    AND name IN ('Lazer');  -- Entretenimento
UPDATE public.categories SET polp_ref = 'FOOD_AND_DRINK'
  WHERE org_id IS NULL AND is_system = true AND polp_ref IS NULL
    AND name IN ('Alimentação');  -- Alimentação e bebidas
UPDATE public.categories SET polp_ref = 'MEDICAL'
  WHERE org_id IS NULL AND is_system = true AND polp_ref IS NULL
    AND name IN ('Saúde');  -- Saúde
UPDATE public.categories SET polp_ref = 'TRANSPORTATION'
  WHERE org_id IS NULL AND is_system = true AND polp_ref IS NULL
    AND name IN ('Transporte', 'Carro');  -- Transporte
UPDATE public.categories SET polp_ref = 'OTHER'
  WHERE org_id IS NULL AND is_system = true AND polp_ref IS NULL
    AND name IN ('Outros');  -- Outros

-- ----------------------------------------------------------------------------
-- 2. Raízes que faltarem
-- ----------------------------------------------------------------------------
-- Todas as 18 entram aqui, mas o NOT EXISTS por polp_ref pula as que o
-- passo 1 acabou de aliasar. É o que torna a migration repetível e o que cobre
-- a categoria que alguém excluiu antes de ela chegar a ser aliasada.

INSERT INTO public.categories (org_id, name, type, color, icon, is_system, polp_ref)
SELECT NULL, v.name, v.type::transaction_type, v.color, v.icon, true, v.ref
FROM (VALUES
  ('INCOME', 'Receitas', 'income', '#22c55e', 'wallet'),
  ('TRANSFER_IN', 'Transferências recebidas', 'transfer', '#14b8a6', 'arrow-down-left'),
  ('TRANSFER_OUT', 'Transferências enviadas', 'transfer', '#0d9488', 'arrow-up-right'),
  ('LOAN_DISBURSEMENTS', 'Empréstimos recebidos', 'income', '#10b981', 'hand-coins'),
  ('LOAN_PAYMENTS', 'Pagamento de empréstimos', 'expense', '#dc2626', 'banknote'),
  ('BANK_FEES', 'Tarifas bancárias', 'expense', '#b91c1c', 'receipt'),
  ('ENTERTAINMENT', 'Entretenimento', 'expense', '#06b6d4', 'gamepad-2'),
  ('FOOD_AND_DRINK', 'Alimentação e bebidas', 'expense', '#f97316', 'utensils'),
  ('GENERAL_MERCHANDISE', 'Compras e mercadorias', 'expense', '#f59e0b', 'shopping-bag'),
  ('HOME_IMPROVEMENT', 'Casa e reformas', 'expense', '#d97706', 'hammer'),
  ('MEDICAL', 'Saúde', 'expense', '#ec4899', 'heart'),
  ('PERSONAL_CARE', 'Cuidados pessoais', 'expense', '#db2777', 'sparkles'),
  ('GENERAL_SERVICES', 'Serviços gerais', 'expense', '#7c3aed', 'wrench'),
  ('GOVERNMENT_AND_NON_PROFIT', 'Governo e doações', 'expense', '#64748b', 'landmark'),
  ('TRANSPORTATION', 'Transporte', 'expense', '#eab308', 'car'),
  ('TRAVEL', 'Viagens', 'expense', '#0ea5e9', 'plane'),
  ('RENT_AND_UTILITIES', 'Aluguel e contas', 'expense', '#f43f5e', 'plug'),
  ('OTHER', 'Outros', 'expense', '#6b7280', 'more-horizontal')
) AS v(ref, name, type, color, icon)
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories c WHERE c.org_id IS NULL AND c.polp_ref = v.ref
);

-- ----------------------------------------------------------------------------
-- 3. Filhas que já existem no floow: polp_ref e parent_id
-- ----------------------------------------------------------------------------
-- Depois do passo 2 porque a raiz de cada uma pode ter acabado de ser criada.
-- "Salário" é filha de "Receitas", não a raiz: INCOME é toda receita, e o alias
-- mora no nível que de fato corresponde.

UPDATE public.categories SET polp_ref = 'INCOME_CONTRACTOR',
       parent_id = (SELECT id FROM public.categories WHERE org_id IS NULL AND polp_ref = 'INCOME')
  WHERE org_id IS NULL AND is_system = true AND polp_ref IS NULL
    AND name IN ('Freelance');
UPDATE public.categories SET polp_ref = 'INCOME_DIVIDENDS',
       parent_id = (SELECT id FROM public.categories WHERE org_id IS NULL AND polp_ref = 'INCOME')
  WHERE org_id IS NULL AND is_system = true AND polp_ref IS NULL
    AND name IN ('Investimentos');
UPDATE public.categories SET polp_ref = 'INCOME_SALARY',
       parent_id = (SELECT id FROM public.categories WHERE org_id IS NULL AND polp_ref = 'INCOME')
  WHERE org_id IS NULL AND is_system = true AND polp_ref IS NULL
    AND name IN ('Salário');
UPDATE public.categories SET polp_ref = 'GENERAL_SERVICES_EDUCATION',
       parent_id = (SELECT id FROM public.categories WHERE org_id IS NULL AND polp_ref = 'GENERAL_SERVICES')
  WHERE org_id IS NULL AND is_system = true AND polp_ref IS NULL
    AND name IN ('Educação');
UPDATE public.categories SET polp_ref = 'RENT_AND_UTILITIES_RENT',
       parent_id = (SELECT id FROM public.categories WHERE org_id IS NULL AND polp_ref = 'RENT_AND_UTILITIES')
  WHERE org_id IS NULL AND is_system = true AND polp_ref IS NULL
    AND name IN ('Aluguel');

-- ----------------------------------------------------------------------------
-- 4. Filhas que faltarem
-- ----------------------------------------------------------------------------
-- type e color vêm da raiz, por JOIN: uma filha nunca diverge da natureza do
-- pai. O JOIN também garante que nenhuma entra sem parent_id — se a raiz
-- faltasse, a linha não seria inserida e o passo 5 acusaria.

INSERT INTO public.categories (org_id, name, type, color, icon, is_system, polp_ref, parent_id)
SELECT NULL, v.name, p.type, p.color, NULL, true, v.ref, p.id
FROM (VALUES
  ('INCOME_CHILD_SUPPORT', 'Pensão alimentícia recebida', 'INCOME'),
  ('INCOME_CONTRACTOR', 'Renda de trabalho autônomo ou freelance', 'INCOME'),
  ('INCOME_DIVIDENDS', 'Dividendos de investimentos', 'INCOME'),
  ('INCOME_GIG_ECONOMY', 'Renda de aplicativos e economia gig', 'INCOME'),
  ('INCOME_INTEREST_EARNED', 'Juros recebidos de contas e poupança', 'INCOME'),
  ('INCOME_LONG_TERM_DISABILITY', 'Auxílio por incapacidade ou invalidez', 'INCOME'),
  ('INCOME_MILITARY', 'Renda militar e benefícios de veteranos', 'INCOME'),
  ('INCOME_RENTAL', 'Renda de aluguéis e locações', 'INCOME'),
  ('INCOME_RETIREMENT_PENSION', 'Aposentadoria e pensão', 'INCOME'),
  ('INCOME_SALARY', 'Salário e ordenados', 'INCOME'),
  ('INCOME_TAX_REFUND', 'Restituição de imposto', 'INCOME'),
  ('INCOME_UNEMPLOYMENT', 'Seguro-desemprego e benefícios afins', 'INCOME'),
  ('INCOME_OTHER', 'Outras receitas', 'INCOME'),
  ('TRANSFER_IN_ACCOUNT_TRANSFER', 'Transferência recebida entre contas próprias', 'TRANSFER_IN'),
  ('TRANSFER_IN_DEPOSIT', 'Depósito recebido', 'TRANSFER_IN'),
  ('TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS', 'Resgate de investimentos e previdência', 'TRANSFER_IN'),
  ('TRANSFER_IN_SAVINGS', 'Resgate de poupança', 'TRANSFER_IN'),
  ('TRANSFER_IN_TRANSFER_IN_FROM_APPS', 'Transferência recebida via apps', 'TRANSFER_IN'),
  ('TRANSFER_IN_WIRE', 'Transferência bancária recebida (TED/DOC)', 'TRANSFER_IN'),
  ('TRANSFER_IN_OTHER_TRANSFER_IN', 'Outras transferências recebidas', 'TRANSFER_IN'),
  ('TRANSFER_OUT_ACCOUNT_TRANSFER', 'Transferência enviada entre contas próprias', 'TRANSFER_OUT'),
  ('TRANSFER_OUT_CRYPTO', 'Transferência para corretoras de criptomoedas', 'TRANSFER_OUT'),
  ('TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS', 'Aporte em investimentos e previdência', 'TRANSFER_OUT'),
  ('TRANSFER_OUT_SAVINGS', 'Depósito em poupança', 'TRANSFER_OUT'),
  ('TRANSFER_OUT_TRANSFER_OUT_FROM_APPS', 'Transferência enviada via apps', 'TRANSFER_OUT'),
  ('TRANSFER_OUT_WIRE', 'Transferência bancária enviada (TED/DOC)', 'TRANSFER_OUT'),
  ('TRANSFER_OUT_WITHDRAWAL', 'Saque', 'TRANSFER_OUT'),
  ('TRANSFER_OUT_OTHER_TRANSFER_OUT', 'Outras transferências enviadas', 'TRANSFER_OUT'),
  ('LOAN_DISBURSEMENTS_AUTO', 'Liberação de financiamento de veículo', 'LOAN_DISBURSEMENTS'),
  ('LOAN_DISBURSEMENTS_CASH_ADVANCES', 'Adiantamento de dinheiro e empréstimo rápido', 'LOAN_DISBURSEMENTS'),
  ('LOAN_DISBURSEMENTS_EWA', 'Antecipação de salário', 'LOAN_DISBURSEMENTS'),
  ('LOAN_DISBURSEMENTS_MORTGAGE', 'Liberação de financiamento imobiliário', 'LOAN_DISBURSEMENTS'),
  ('LOAN_DISBURSEMENTS_PERSONAL', 'Liberação de empréstimo pessoal', 'LOAN_DISBURSEMENTS'),
  ('LOAN_DISBURSEMENTS_STUDENT', 'Liberação de financiamento estudantil', 'LOAN_DISBURSEMENTS'),
  ('LOAN_DISBURSEMENTS_OTHER_DISBURSEMENT', 'Outros empréstimos recebidos', 'LOAN_DISBURSEMENTS'),
  ('LOAN_PAYMENTS_BNPL', 'Pagamento de compra parcelada', 'LOAN_PAYMENTS'),
  ('LOAN_PAYMENTS_CAR_PAYMENT', 'Parcela de financiamento de veículo', 'LOAN_PAYMENTS'),
  ('LOAN_PAYMENTS_CASH_ADVANCES', 'Pagamento de adiantamento de dinheiro', 'LOAN_PAYMENTS'),
  ('LOAN_PAYMENTS_CREDIT_CARD_PAYMENT', 'Pagamento de fatura de cartão de crédito', 'LOAN_PAYMENTS'),
  ('LOAN_PAYMENTS_EWA', 'Pagamento de antecipação de salário', 'LOAN_PAYMENTS'),
  ('LOAN_PAYMENTS_MORTGAGE_PAYMENT', 'Parcela de financiamento imobiliário', 'LOAN_PAYMENTS'),
  ('LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT', 'Parcela de empréstimo pessoal', 'LOAN_PAYMENTS'),
  ('LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT', 'Parcela de financiamento estudantil', 'LOAN_PAYMENTS'),
  ('LOAN_PAYMENTS_OTHER_PAYMENT', 'Outros pagamentos de empréstimos', 'LOAN_PAYMENTS'),
  ('BANK_FEES_ATM_FEES', 'Tarifa de caixa eletrônico', 'BANK_FEES'),
  ('BANK_FEES_INSUFFICIENT_FUNDS', 'Tarifa por saldo insuficiente', 'BANK_FEES'),
  ('BANK_FEES_INTEREST_CHARGE', 'Cobrança de juros', 'BANK_FEES'),
  ('BANK_FEES_FOREIGN_TRANSACTION_FEES', 'Tarifa de transação internacional (IOF)', 'BANK_FEES'),
  ('BANK_FEES_OVERDRAFT_FEES', 'Tarifa de cheque especial', 'BANK_FEES'),
  ('BANK_FEES_LATE_FEES', 'Multa por atraso', 'BANK_FEES'),
  ('BANK_FEES_CASH_ADVANCE', 'Tarifa de saque com cartão de crédito', 'BANK_FEES'),
  ('BANK_FEES_OTHER_BANK_FEES', 'Outras tarifas bancárias', 'BANK_FEES'),
  ('ENTERTAINMENT_CASINOS_AND_GAMBLING', 'Cassinos e apostas', 'ENTERTAINMENT'),
  ('ENTERTAINMENT_MUSIC_AND_AUDIO', 'Música e áudio', 'ENTERTAINMENT'),
  ('ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS', 'Eventos, parques e museus', 'ENTERTAINMENT'),
  ('ENTERTAINMENT_TV_AND_MOVIES', 'TV e filmes', 'ENTERTAINMENT'),
  ('ENTERTAINMENT_VIDEO_GAMES', 'Jogos eletrônicos', 'ENTERTAINMENT'),
  ('ENTERTAINMENT_OTHER_ENTERTAINMENT', 'Outros entretenimentos', 'ENTERTAINMENT'),
  ('FOOD_AND_DRINK_BEER_WINE_AND_LIQUOR', 'Bebidas alcoólicas', 'FOOD_AND_DRINK'),
  ('FOOD_AND_DRINK_COFFEE', 'Cafeterias', 'FOOD_AND_DRINK'),
  ('FOOD_AND_DRINK_FAST_FOOD', 'Fast food e lanches', 'FOOD_AND_DRINK'),
  ('FOOD_AND_DRINK_GROCERIES', 'Supermercado e mercearia', 'FOOD_AND_DRINK'),
  ('FOOD_AND_DRINK_RESTAURANT', 'Restaurantes', 'FOOD_AND_DRINK'),
  ('FOOD_AND_DRINK_VENDING_MACHINES', 'Máquinas de autoatendimento', 'FOOD_AND_DRINK'),
  ('FOOD_AND_DRINK_OTHER_FOOD_AND_DRINK', 'Outras despesas com alimentação', 'FOOD_AND_DRINK'),
  ('GENERAL_MERCHANDISE_BOOKSTORES_AND_NEWSSTANDS', 'Livrarias e bancas', 'GENERAL_MERCHANDISE'),
  ('GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES', 'Roupas e acessórios', 'GENERAL_MERCHANDISE'),
  ('GENERAL_MERCHANDISE_CONVENIENCE_STORES', 'Lojas de conveniência', 'GENERAL_MERCHANDISE'),
  ('GENERAL_MERCHANDISE_DEPARTMENT_STORES', 'Lojas de departamento', 'GENERAL_MERCHANDISE'),
  ('GENERAL_MERCHANDISE_DISCOUNT_STORES', 'Lojas de desconto e variedades', 'GENERAL_MERCHANDISE'),
  ('GENERAL_MERCHANDISE_ELECTRONICS', 'Eletrônicos', 'GENERAL_MERCHANDISE'),
  ('GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES', 'Presentes e novidades', 'GENERAL_MERCHANDISE'),
  ('GENERAL_MERCHANDISE_OFFICE_SUPPLIES', 'Material de escritório', 'GENERAL_MERCHANDISE'),
  ('GENERAL_MERCHANDISE_ONLINE_MARKETPLACES', 'Marketplaces e compras online', 'GENERAL_MERCHANDISE'),
  ('GENERAL_MERCHANDISE_PET_SUPPLIES', 'Produtos para pets', 'GENERAL_MERCHANDISE'),
  ('GENERAL_MERCHANDISE_SPORTING_GOODS', 'Artigos esportivos', 'GENERAL_MERCHANDISE'),
  ('GENERAL_MERCHANDISE_SUPERSTORES', 'Hipermercados e atacarejos', 'GENERAL_MERCHANDISE'),
  ('GENERAL_MERCHANDISE_TOBACCO_AND_VAPE', 'Tabaco e cigarros eletrônicos', 'GENERAL_MERCHANDISE'),
  ('GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE', 'Outras compras e mercadorias', 'GENERAL_MERCHANDISE'),
  ('HOME_IMPROVEMENT_FURNITURE', 'Móveis', 'HOME_IMPROVEMENT'),
  ('HOME_IMPROVEMENT_HARDWARE', 'Materiais de construção e ferragens', 'HOME_IMPROVEMENT'),
  ('HOME_IMPROVEMENT_REPAIR_AND_MAINTENANCE', 'Reparos e manutenção', 'HOME_IMPROVEMENT'),
  ('HOME_IMPROVEMENT_SECURITY', 'Segurança residencial', 'HOME_IMPROVEMENT'),
  ('HOME_IMPROVEMENT_OTHER_HOME_IMPROVEMENT', 'Outras despesas com a casa', 'HOME_IMPROVEMENT'),
  ('MEDICAL_DENTAL_CARE', 'Dentista', 'MEDICAL'),
  ('MEDICAL_EYE_CARE', 'Oftalmologia e ótica', 'MEDICAL'),
  ('MEDICAL_NURSING_CARE', 'Cuidados de enfermagem e cuidadores', 'MEDICAL'),
  ('MEDICAL_PHARMACIES_AND_SUPPLEMENTS', 'Farmácias e suplementos', 'MEDICAL'),
  ('MEDICAL_PRIMARY_CARE', 'Consultas e atendimento médico', 'MEDICAL'),
  ('MEDICAL_VETERINARY_SERVICES', 'Serviços veterinários', 'MEDICAL'),
  ('MEDICAL_OTHER_MEDICAL', 'Outras despesas de saúde', 'MEDICAL'),
  ('PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS', 'Academias e centros de fitness', 'PERSONAL_CARE'),
  ('PERSONAL_CARE_HAIR_AND_BEAUTY', 'Cabelo e beleza', 'PERSONAL_CARE'),
  ('PERSONAL_CARE_LAUNDRY_AND_DRY_CLEANING', 'Lavanderia', 'PERSONAL_CARE'),
  ('PERSONAL_CARE_OTHER_PERSONAL_CARE', 'Outros cuidados pessoais', 'PERSONAL_CARE'),
  ('GENERAL_SERVICES_ACCOUNTING_AND_FINANCIAL_PLANNING', 'Contabilidade e planejamento financeiro', 'GENERAL_SERVICES'),
  ('GENERAL_SERVICES_AUTOMOTIVE', 'Serviços automotivos', 'GENERAL_SERVICES'),
  ('GENERAL_SERVICES_CHILDCARE', 'Creche e cuidado infantil', 'GENERAL_SERVICES'),
  ('GENERAL_SERVICES_CONSULTING_AND_LEGAL', 'Consultoria e serviços jurídicos', 'GENERAL_SERVICES'),
  ('GENERAL_SERVICES_EDUCATION', 'Educação', 'GENERAL_SERVICES'),
  ('GENERAL_SERVICES_INSURANCE', 'Seguros', 'GENERAL_SERVICES'),
  ('GENERAL_SERVICES_POSTAGE_AND_SHIPPING', 'Correios e fretes', 'GENERAL_SERVICES'),
  ('GENERAL_SERVICES_STORAGE', 'Armazenamento e guarda-móveis', 'GENERAL_SERVICES'),
  ('GENERAL_SERVICES_OTHER_GENERAL_SERVICES', 'Outros serviços gerais', 'GENERAL_SERVICES'),
  ('GOVERNMENT_AND_NON_PROFIT_DONATIONS', 'Doações e contribuições', 'GOVERNMENT_AND_NON_PROFIT'),
  ('GOVERNMENT_AND_NON_PROFIT_GOVERNMENT_DEPARTMENTS_AND_AGENCIES', 'Órgãos e taxas governamentais', 'GOVERNMENT_AND_NON_PROFIT'),
  ('GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT', 'Pagamento de impostos', 'GOVERNMENT_AND_NON_PROFIT'),
  ('GOVERNMENT_AND_NON_PROFIT_OTHER_GOVERNMENT_AND_NON_PROFIT', 'Outras despesas com governo e doações', 'GOVERNMENT_AND_NON_PROFIT'),
  ('TRANSPORTATION_BIKES_AND_SCOOTERS', 'Bicicletas e patinetes', 'TRANSPORTATION'),
  ('TRANSPORTATION_GAS', 'Combustível', 'TRANSPORTATION'),
  ('TRANSPORTATION_PARKING', 'Estacionamento', 'TRANSPORTATION'),
  ('TRANSPORTATION_PUBLIC_TRANSIT', 'Transporte público', 'TRANSPORTATION'),
  ('TRANSPORTATION_TAXIS_AND_RIDE_SHARES', 'Táxi e aplicativos de transporte', 'TRANSPORTATION'),
  ('TRANSPORTATION_TOLLS', 'Pedágios', 'TRANSPORTATION'),
  ('TRANSPORTATION_OTHER_TRANSPORTATION', 'Outras despesas de transporte', 'TRANSPORTATION'),
  ('TRAVEL_FLIGHTS', 'Passagens aéreas', 'TRAVEL'),
  ('TRAVEL_LODGING', 'Hospedagem', 'TRAVEL'),
  ('TRAVEL_RENTAL_CARS', 'Aluguel de carros', 'TRAVEL'),
  ('TRAVEL_OTHER_TRAVEL', 'Outras despesas de viagem', 'TRAVEL'),
  ('RENT_AND_UTILITIES_GAS_AND_ELECTRICITY', 'Gás e energia elétrica', 'RENT_AND_UTILITIES'),
  ('RENT_AND_UTILITIES_INTERNET_AND_CABLE', 'Internet e TV a cabo', 'RENT_AND_UTILITIES'),
  ('RENT_AND_UTILITIES_RENT', 'Aluguel', 'RENT_AND_UTILITIES'),
  ('RENT_AND_UTILITIES_SEWAGE_AND_WASTE_MANAGEMENT', 'Esgoto e coleta de lixo', 'RENT_AND_UTILITIES'),
  ('RENT_AND_UTILITIES_TELEPHONE', 'Telefone', 'RENT_AND_UTILITIES'),
  ('RENT_AND_UTILITIES_WATER', 'Água', 'RENT_AND_UTILITIES'),
  ('RENT_AND_UTILITIES_OTHER_UTILITIES', 'Outras contas e serviços', 'RENT_AND_UTILITIES'),
  ('OTHER_OTHER', 'Não categorizado', 'OTHER')
) AS v(ref, name, parent_ref)
JOIN public.categories p ON p.org_id IS NULL AND p.polp_ref = v.parent_ref
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories c WHERE c.org_id IS NULL AND c.polp_ref = v.ref
);

-- ----------------------------------------------------------------------------
-- 5. A taxonomia está completa e bem formada
-- ----------------------------------------------------------------------------
-- Aqui a migration ainda falha alto, e continua sendo o ponto certo para isso:
-- neste momento tudo já deveria estar no lugar, então divergência é defeito no
-- seed, não estado herdado do banco.

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.categories WHERE org_id IS NULL AND polp_ref IS NOT NULL;
  IF n <> 145 THEN
    RAISE EXCEPTION 'seed da taxonomia Polp: esperadas 145 categorias com polp_ref, encontradas %', n;
  END IF;

  SELECT count(*) INTO n FROM public.categories
   WHERE org_id IS NULL AND polp_ref IS NOT NULL AND parent_id IS NULL;
  IF n <> 18 THEN
    RAISE EXCEPTION 'seed da taxonomia Polp: esperadas 18 raizes sem parent_id, encontradas %', n;
  END IF;

  SELECT count(*) INTO n FROM public.categories c
    JOIN public.categories p ON p.id = c.parent_id
   WHERE c.org_id IS NULL AND c.polp_ref IS NOT NULL AND c.type <> p.type;
  IF n > 0 THEN
    RAISE EXCEPTION 'seed da taxonomia Polp: % filhas com type diferente do pai', n;
  END IF;
END $$;
