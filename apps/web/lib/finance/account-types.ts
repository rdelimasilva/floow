import { Banknote, PiggyBank, TrendingUp, CreditCard, Wallet } from 'lucide-react'
import type { accountTypeEnum } from '@floow/db'

export type AccountType = (typeof accountTypeEnum.enumValues)[number]

/**
 * Fonte única do rótulo e do ícone de tipo de conta.
 *
 * Antes eram quatro mapas copiados — dois em `account-card.tsx`, um na página
 * da conta, um no formulário de nova conta — mais dois nos gráficos. Eles
 * divergiram: `brokerage` era "Corretora" na UI de contas e "Investimento"
 * nos gráficos, e `cash` era "Dinheiro" em três lugares e "Dinheiro em
 * Espécie" no formulário.
 *
 * `brokerage` é "Investimento" e não "Corretora" porque o tipo diz o que o
 * dinheiro faz, não onde ele está: CDB no Itaú e conta na XP são os dois
 * investimento. O que os separa é a instituição, dimensão que hoje só existe
 * em `openfinance_connections.institution_name` e, para conta manual, no nome
 * livre da conta.
 */
export const ACCOUNT_TYPE_CONFIG = {
  checking: { label: 'Conta Corrente', Icon: Banknote },
  savings: { label: 'Poupança', Icon: PiggyBank },
  brokerage: { label: 'Investimento', Icon: TrendingUp },
  credit_card: { label: 'Cartão de Crédito', Icon: CreditCard },
  cash: { label: 'Dinheiro', Icon: Wallet },
} as const satisfies Record<AccountType, { label: string; Icon: unknown }>

export const ACCOUNT_TYPE_LABEL = {
  checking: ACCOUNT_TYPE_CONFIG.checking.label,
  savings: ACCOUNT_TYPE_CONFIG.savings.label,
  brokerage: ACCOUNT_TYPE_CONFIG.brokerage.label,
  credit_card: ACCOUNT_TYPE_CONFIG.credit_card.label,
  cash: ACCOUNT_TYPE_CONFIG.cash.label,
} as const satisfies Record<AccountType, string>

/** Ordem do enum, para os selects não divergirem dele. */
export const ACCOUNT_TYPE_OPTIONS = [
  { value: 'checking', label: ACCOUNT_TYPE_LABEL.checking },
  { value: 'savings', label: ACCOUNT_TYPE_LABEL.savings },
  { value: 'brokerage', label: ACCOUNT_TYPE_LABEL.brokerage },
  { value: 'credit_card', label: ACCOUNT_TYPE_LABEL.credit_card },
  { value: 'cash', label: ACCOUNT_TYPE_LABEL.cash },
] as const satisfies ReadonlyArray<{ value: AccountType; label: string }>

/**
 * Blocos da tela de Contas. Poupança e dinheiro ficam com as correntes: são
 * dinheiro parado à mão, não aplicação — "Investimentos" é só `brokerage`.
 */
export const BLOCOS_DE_CONTA = [
  { key: 'correntes', titulo: 'Contas correntes', tipos: ['checking', 'savings', 'cash'] },
  { key: 'investimentos', titulo: 'Investimentos', tipos: ['brokerage'] },
  { key: 'cartoes', titulo: 'Cartões', tipos: ['credit_card'] },
] as const satisfies ReadonlyArray<{ key: string; titulo: string; tipos: ReadonlyArray<AccountType> }>

/** Agrupa na ordem dos blocos, omitindo bloco vazio. */
export function agruparPorBloco<T extends { type: AccountType }>(contas: T[]) {
  return BLOCOS_DE_CONTA
    .map((b) => ({ ...b, contas: contas.filter((c) => (b.tipos as ReadonlyArray<AccountType>).includes(c.type)) }))
    .filter((b) => b.contas.length > 0)
}
