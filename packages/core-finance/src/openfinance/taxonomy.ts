/**
 * Taxonomia de categorias da Polp (enum TransactionCategory).
 *
 * Dois níveis: uma raiz (FOOD_AND_DRINK) e suas filhas
 * (FOOD_AND_DRINK_GROCERIES, FOOD_AND_DRINK_RESTAURANT, …). A ingestão recebe
 * `category_ref` já preenchido pela Polp e o resolve para uma categoria local.
 *
 * `floowAlias` liga uma raiz a uma das 11 categorias de sistema que o floow já
 * tinha. É o que impede os orçamentos existentes de pararem de funcionar quando
 * as transações passarem a chegar categorizadas pela Polp: o teto continua na
 * mesma categoria, agora com filhas somando abaixo dela.
 *
 * Fonte: https://polp.com.br/docs/celcoin/accounts/transactions (lida 2026-09-02)
 */

export type TaxonomyKind = 'income' | 'expense' | 'transfer'

export interface TaxonomyNode {
  /** Valor do enum TransactionCategory da Polp. */
  ref: string
  /** Rótulo em pt-BR, como a Polp o publica. */
  label: string
  /** Natureza da categoria no modelo do floow. */
  kind: TaxonomyKind
  /**
   * Nome exato da categoria de sistema já existente no floow que este nó
   * substitui. O seed reaproveita a categoria em vez de criar outra — sem isso,
   * a importação geraria um "Salário" novo ao lado do que já existe, e os
   * orçamentos apontariam para o antigo enquanto os gastos cairiam no novo.
   *
   * O alias mora no nível que de fato corresponde: `Salário` é a filha
   * INCOME_SALARY, não a raiz INCOME (que é "Receitas" em geral).
   */
  floowAlias?: string
  children: { ref: string; label: string; floowAlias?: string }[]
}

export const POLP_TAXONOMY: TaxonomyNode[] = [
  {
    ref: 'INCOME',
    label: 'Receitas',
    kind: 'income',
    children: [
      { ref: 'INCOME_CHILD_SUPPORT', label: 'Pensão alimentícia recebida' },
      { ref: 'INCOME_CONTRACTOR', label: 'Renda de trabalho autônomo ou freelance', floowAlias: 'Freelance' },
      { ref: 'INCOME_DIVIDENDS', label: 'Dividendos de investimentos', floowAlias: 'Investimentos' },
      { ref: 'INCOME_GIG_ECONOMY', label: 'Renda de aplicativos e economia gig' },
      { ref: 'INCOME_INTEREST_EARNED', label: 'Juros recebidos de contas e poupança' },
      { ref: 'INCOME_LONG_TERM_DISABILITY', label: 'Auxílio por incapacidade ou invalidez' },
      { ref: 'INCOME_MILITARY', label: 'Renda militar e benefícios de veteranos' },
      { ref: 'INCOME_RENTAL', label: 'Renda de aluguéis e locações' },
      { ref: 'INCOME_RETIREMENT_PENSION', label: 'Aposentadoria e pensão' },
      { ref: 'INCOME_SALARY', label: 'Salário e ordenados', floowAlias: 'Salário' },
      { ref: 'INCOME_TAX_REFUND', label: 'Restituição de imposto' },
      { ref: 'INCOME_UNEMPLOYMENT', label: 'Seguro-desemprego e benefícios afins' },
      { ref: 'INCOME_OTHER', label: 'Outras receitas' },
    ],
  },
  {
    ref: 'TRANSFER_IN',
    label: 'Transferências recebidas',
    kind: 'transfer',
    children: [
      { ref: 'TRANSFER_IN_ACCOUNT_TRANSFER', label: 'Transferência recebida entre contas próprias' },
      { ref: 'TRANSFER_IN_DEPOSIT', label: 'Depósito recebido' },
      { ref: 'TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS', label: 'Resgate de investimentos e previdência' },
      { ref: 'TRANSFER_IN_SAVINGS', label: 'Resgate de poupança' },
      { ref: 'TRANSFER_IN_TRANSFER_IN_FROM_APPS', label: 'Transferência recebida via apps' },
      { ref: 'TRANSFER_IN_WIRE', label: 'Transferência bancária recebida (TED/DOC)' },
      { ref: 'TRANSFER_IN_OTHER_TRANSFER_IN', label: 'Outras transferências recebidas' },
    ],
  },
  {
    ref: 'TRANSFER_OUT',
    label: 'Transferências enviadas',
    kind: 'transfer',
    children: [
      { ref: 'TRANSFER_OUT_ACCOUNT_TRANSFER', label: 'Transferência enviada entre contas próprias' },
      { ref: 'TRANSFER_OUT_CRYPTO', label: 'Transferência para corretoras de criptomoedas' },
      { ref: 'TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS', label: 'Aporte em investimentos e previdência' },
      { ref: 'TRANSFER_OUT_SAVINGS', label: 'Depósito em poupança' },
      { ref: 'TRANSFER_OUT_TRANSFER_OUT_FROM_APPS', label: 'Transferência enviada via apps' },
      { ref: 'TRANSFER_OUT_WIRE', label: 'Transferência bancária enviada (TED/DOC)' },
      { ref: 'TRANSFER_OUT_WITHDRAWAL', label: 'Saque' },
      { ref: 'TRANSFER_OUT_OTHER_TRANSFER_OUT', label: 'Outras transferências enviadas' },
    ],
  },
  {
    ref: 'LOAN_DISBURSEMENTS',
    label: 'Empréstimos recebidos',
    kind: 'income',
    children: [
      { ref: 'LOAN_DISBURSEMENTS_AUTO', label: 'Liberação de financiamento de veículo' },
      { ref: 'LOAN_DISBURSEMENTS_CASH_ADVANCES', label: 'Adiantamento de dinheiro e empréstimo rápido' },
      { ref: 'LOAN_DISBURSEMENTS_EWA', label: 'Antecipação de salário' },
      { ref: 'LOAN_DISBURSEMENTS_MORTGAGE', label: 'Liberação de financiamento imobiliário' },
      { ref: 'LOAN_DISBURSEMENTS_PERSONAL', label: 'Liberação de empréstimo pessoal' },
      { ref: 'LOAN_DISBURSEMENTS_STUDENT', label: 'Liberação de financiamento estudantil' },
      { ref: 'LOAN_DISBURSEMENTS_OTHER_DISBURSEMENT', label: 'Outros empréstimos recebidos' },
    ],
  },
  {
    ref: 'LOAN_PAYMENTS',
    label: 'Pagamento de empréstimos',
    kind: 'expense',
    children: [
      { ref: 'LOAN_PAYMENTS_BNPL', label: 'Pagamento de compra parcelada' },
      { ref: 'LOAN_PAYMENTS_CAR_PAYMENT', label: 'Parcela de financiamento de veículo' },
      { ref: 'LOAN_PAYMENTS_CASH_ADVANCES', label: 'Pagamento de adiantamento de dinheiro' },
      { ref: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT', label: 'Pagamento de fatura de cartão de crédito' },
      { ref: 'LOAN_PAYMENTS_EWA', label: 'Pagamento de antecipação de salário' },
      { ref: 'LOAN_PAYMENTS_MORTGAGE_PAYMENT', label: 'Parcela de financiamento imobiliário' },
      { ref: 'LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT', label: 'Parcela de empréstimo pessoal' },
      { ref: 'LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT', label: 'Parcela de financiamento estudantil' },
      { ref: 'LOAN_PAYMENTS_OTHER_PAYMENT', label: 'Outros pagamentos de empréstimos' },
    ],
  },
  {
    ref: 'BANK_FEES',
    label: 'Tarifas bancárias',
    kind: 'expense',
    children: [
      { ref: 'BANK_FEES_ATM_FEES', label: 'Tarifa de caixa eletrônico' },
      { ref: 'BANK_FEES_INSUFFICIENT_FUNDS', label: 'Tarifa por saldo insuficiente' },
      { ref: 'BANK_FEES_INTEREST_CHARGE', label: 'Cobrança de juros' },
      { ref: 'BANK_FEES_FOREIGN_TRANSACTION_FEES', label: 'Tarifa de transação internacional (IOF)' },
      { ref: 'BANK_FEES_OVERDRAFT_FEES', label: 'Tarifa de cheque especial' },
      { ref: 'BANK_FEES_LATE_FEES', label: 'Multa por atraso' },
      { ref: 'BANK_FEES_CASH_ADVANCE', label: 'Tarifa de saque com cartão de crédito' },
      { ref: 'BANK_FEES_OTHER_BANK_FEES', label: 'Outras tarifas bancárias' },
    ],
  },
  {
    ref: 'ENTERTAINMENT',
    label: 'Entretenimento',
    kind: 'expense',
    floowAlias: 'Lazer',
    children: [
      { ref: 'ENTERTAINMENT_CASINOS_AND_GAMBLING', label: 'Cassinos e apostas' },
      { ref: 'ENTERTAINMENT_MUSIC_AND_AUDIO', label: 'Música e áudio' },
      { ref: 'ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS', label: 'Eventos, parques e museus' },
      { ref: 'ENTERTAINMENT_TV_AND_MOVIES', label: 'TV e filmes' },
      { ref: 'ENTERTAINMENT_VIDEO_GAMES', label: 'Jogos eletrônicos' },
      { ref: 'ENTERTAINMENT_OTHER_ENTERTAINMENT', label: 'Outros entretenimentos' },
    ],
  },
  {
    ref: 'FOOD_AND_DRINK',
    label: 'Alimentação e bebidas',
    kind: 'expense',
    floowAlias: 'Alimentação',
    children: [
      { ref: 'FOOD_AND_DRINK_BEER_WINE_AND_LIQUOR', label: 'Bebidas alcoólicas' },
      { ref: 'FOOD_AND_DRINK_COFFEE', label: 'Cafeterias' },
      { ref: 'FOOD_AND_DRINK_FAST_FOOD', label: 'Fast food e lanches' },
      { ref: 'FOOD_AND_DRINK_GROCERIES', label: 'Supermercado e mercearia' },
      { ref: 'FOOD_AND_DRINK_RESTAURANT', label: 'Restaurantes' },
      { ref: 'FOOD_AND_DRINK_VENDING_MACHINES', label: 'Máquinas de autoatendimento' },
      { ref: 'FOOD_AND_DRINK_OTHER_FOOD_AND_DRINK', label: 'Outras despesas com alimentação' },
    ],
  },
  {
    ref: 'GENERAL_MERCHANDISE',
    label: 'Compras e mercadorias',
    kind: 'expense',
    children: [
      { ref: 'GENERAL_MERCHANDISE_BOOKSTORES_AND_NEWSSTANDS', label: 'Livrarias e bancas' },
      { ref: 'GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES', label: 'Roupas e acessórios' },
      { ref: 'GENERAL_MERCHANDISE_CONVENIENCE_STORES', label: 'Lojas de conveniência' },
      { ref: 'GENERAL_MERCHANDISE_DEPARTMENT_STORES', label: 'Lojas de departamento' },
      { ref: 'GENERAL_MERCHANDISE_DISCOUNT_STORES', label: 'Lojas de desconto e variedades' },
      { ref: 'GENERAL_MERCHANDISE_ELECTRONICS', label: 'Eletrônicos' },
      { ref: 'GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES', label: 'Presentes e novidades' },
      { ref: 'GENERAL_MERCHANDISE_OFFICE_SUPPLIES', label: 'Material de escritório' },
      { ref: 'GENERAL_MERCHANDISE_ONLINE_MARKETPLACES', label: 'Marketplaces e compras online' },
      { ref: 'GENERAL_MERCHANDISE_PET_SUPPLIES', label: 'Produtos para pets' },
      { ref: 'GENERAL_MERCHANDISE_SPORTING_GOODS', label: 'Artigos esportivos' },
      { ref: 'GENERAL_MERCHANDISE_SUPERSTORES', label: 'Hipermercados e atacarejos' },
      { ref: 'GENERAL_MERCHANDISE_TOBACCO_AND_VAPE', label: 'Tabaco e cigarros eletrônicos' },
      { ref: 'GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE', label: 'Outras compras e mercadorias' },
    ],
  },
  {
    ref: 'HOME_IMPROVEMENT',
    label: 'Casa e reformas',
    kind: 'expense',
    children: [
      { ref: 'HOME_IMPROVEMENT_FURNITURE', label: 'Móveis' },
      { ref: 'HOME_IMPROVEMENT_HARDWARE', label: 'Materiais de construção e ferragens' },
      { ref: 'HOME_IMPROVEMENT_REPAIR_AND_MAINTENANCE', label: 'Reparos e manutenção' },
      { ref: 'HOME_IMPROVEMENT_SECURITY', label: 'Segurança residencial' },
      { ref: 'HOME_IMPROVEMENT_OTHER_HOME_IMPROVEMENT', label: 'Outras despesas com a casa' },
    ],
  },
  {
    ref: 'MEDICAL',
    label: 'Saúde',
    kind: 'expense',
    floowAlias: 'Saúde',
    children: [
      { ref: 'MEDICAL_DENTAL_CARE', label: 'Dentista' },
      { ref: 'MEDICAL_EYE_CARE', label: 'Oftalmologia e ótica' },
      { ref: 'MEDICAL_NURSING_CARE', label: 'Cuidados de enfermagem e cuidadores' },
      { ref: 'MEDICAL_PHARMACIES_AND_SUPPLEMENTS', label: 'Farmácias e suplementos' },
      { ref: 'MEDICAL_PRIMARY_CARE', label: 'Consultas e atendimento médico' },
      { ref: 'MEDICAL_VETERINARY_SERVICES', label: 'Serviços veterinários' },
      { ref: 'MEDICAL_OTHER_MEDICAL', label: 'Outras despesas de saúde' },
    ],
  },
  {
    ref: 'PERSONAL_CARE',
    label: 'Cuidados pessoais',
    kind: 'expense',
    children: [
      { ref: 'PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS', label: 'Academias e centros de fitness' },
      { ref: 'PERSONAL_CARE_HAIR_AND_BEAUTY', label: 'Cabelo e beleza' },
      { ref: 'PERSONAL_CARE_LAUNDRY_AND_DRY_CLEANING', label: 'Lavanderia' },
      { ref: 'PERSONAL_CARE_OTHER_PERSONAL_CARE', label: 'Outros cuidados pessoais' },
    ],
  },
  {
    ref: 'GENERAL_SERVICES',
    label: 'Serviços gerais',
    kind: 'expense',
    children: [
      { ref: 'GENERAL_SERVICES_ACCOUNTING_AND_FINANCIAL_PLANNING', label: 'Contabilidade e planejamento financeiro' },
      { ref: 'GENERAL_SERVICES_AUTOMOTIVE', label: 'Serviços automotivos' },
      { ref: 'GENERAL_SERVICES_CHILDCARE', label: 'Creche e cuidado infantil' },
      { ref: 'GENERAL_SERVICES_CONSULTING_AND_LEGAL', label: 'Consultoria e serviços jurídicos' },
      { ref: 'GENERAL_SERVICES_EDUCATION', label: 'Educação', floowAlias: 'Educação' },
      { ref: 'GENERAL_SERVICES_INSURANCE', label: 'Seguros' },
      { ref: 'GENERAL_SERVICES_POSTAGE_AND_SHIPPING', label: 'Correios e fretes' },
      { ref: 'GENERAL_SERVICES_STORAGE', label: 'Armazenamento e guarda-móveis' },
      { ref: 'GENERAL_SERVICES_OTHER_GENERAL_SERVICES', label: 'Outros serviços gerais' },
    ],
  },
  {
    ref: 'GOVERNMENT_AND_NON_PROFIT',
    label: 'Governo e doações',
    kind: 'expense',
    children: [
      { ref: 'GOVERNMENT_AND_NON_PROFIT_DONATIONS', label: 'Doações e contribuições' },
      { ref: 'GOVERNMENT_AND_NON_PROFIT_GOVERNMENT_DEPARTMENTS_AND_AGENCIES', label: 'Órgãos e taxas governamentais' },
      { ref: 'GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT', label: 'Pagamento de impostos' },
      { ref: 'GOVERNMENT_AND_NON_PROFIT_OTHER_GOVERNMENT_AND_NON_PROFIT', label: 'Outras despesas com governo e doações' },
    ],
  },
  {
    ref: 'TRANSPORTATION',
    label: 'Transporte',
    kind: 'expense',
    floowAlias: 'Transporte',
    children: [
      { ref: 'TRANSPORTATION_BIKES_AND_SCOOTERS', label: 'Bicicletas e patinetes' },
      { ref: 'TRANSPORTATION_GAS', label: 'Combustível' },
      { ref: 'TRANSPORTATION_PARKING', label: 'Estacionamento' },
      { ref: 'TRANSPORTATION_PUBLIC_TRANSIT', label: 'Transporte público' },
      { ref: 'TRANSPORTATION_TAXIS_AND_RIDE_SHARES', label: 'Táxi e aplicativos de transporte' },
      { ref: 'TRANSPORTATION_TOLLS', label: 'Pedágios' },
      { ref: 'TRANSPORTATION_OTHER_TRANSPORTATION', label: 'Outras despesas de transporte' },
    ],
  },
  {
    ref: 'TRAVEL',
    label: 'Viagens',
    kind: 'expense',
    children: [
      { ref: 'TRAVEL_FLIGHTS', label: 'Passagens aéreas' },
      { ref: 'TRAVEL_LODGING', label: 'Hospedagem' },
      { ref: 'TRAVEL_RENTAL_CARS', label: 'Aluguel de carros' },
      { ref: 'TRAVEL_OTHER_TRAVEL', label: 'Outras despesas de viagem' },
    ],
  },
  {
    ref: 'RENT_AND_UTILITIES',
    label: 'Aluguel e contas',
    kind: 'expense',

    children: [
      { ref: 'RENT_AND_UTILITIES_GAS_AND_ELECTRICITY', label: 'Gás e energia elétrica' },
      { ref: 'RENT_AND_UTILITIES_INTERNET_AND_CABLE', label: 'Internet e TV a cabo' },
      { ref: 'RENT_AND_UTILITIES_RENT', label: 'Aluguel', floowAlias: 'Aluguel' },
      { ref: 'RENT_AND_UTILITIES_SEWAGE_AND_WASTE_MANAGEMENT', label: 'Esgoto e coleta de lixo' },
      { ref: 'RENT_AND_UTILITIES_TELEPHONE', label: 'Telefone' },
      { ref: 'RENT_AND_UTILITIES_WATER', label: 'Água' },
      { ref: 'RENT_AND_UTILITIES_OTHER_UTILITIES', label: 'Outras contas e serviços' },
    ],
  },
  {
    ref: 'OTHER',
    label: 'Outros',
    kind: 'expense',
    floowAlias: 'Outros',
    children: [{ ref: 'OTHER_OTHER', label: 'Não categorizado' }],
  },
]

/** Índice ref -> nó raiz, para resolver um category_ref de qualquer nível. */
const ROOT_BY_REF = new Map<string, TaxonomyNode>()
for (const root of POLP_TAXONOMY) {
  ROOT_BY_REF.set(root.ref, root)
  for (const child of root.children) ROOT_BY_REF.set(child.ref, root)
}

/** Raiz a que um `category_ref` pertence. Undefined se o ref for desconhecido. */
export function rootForRef(ref: string): TaxonomyNode | undefined {
  return ROOT_BY_REF.get(ref)
}

/** Todos os refs da taxonomia, raízes e filhas. */
export function allRefs(): string[] {
  return [...ROOT_BY_REF.keys()]
}

/**
 * A natureza de um ref no modelo do floow.
 *
 * Importante para a ingestão: TRANSFER_* não é despesa. Um aporte em poupança
 * classificado como TRANSFER_OUT_SAVINGS sairia como gasto se fosse tratado
 * pelo sinal do valor, inflando o orçamento com dinheiro que só mudou de lugar.
 */
export function kindForRef(ref: string): TaxonomyKind | undefined {
  return ROOT_BY_REF.get(ref)?.kind
}
