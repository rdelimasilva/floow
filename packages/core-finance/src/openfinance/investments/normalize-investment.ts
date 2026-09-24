/**
 * Investimento da Polp -> ativo do floow + posição do dia.
 *
 * Um normalizador para os cinco tipos porque o que muda entre eles é qual
 * campo carrega cada coisa, não a regra. A tabela de campos está nos ramos
 * do `switch`; o resto é comum.
 */
import type {
  PolpCreditFixedIncome, PolpFixedIncomeBalance, PolpFund,
  PolpInvestmentKind, PolpRemuneration, PolpTreasureTitle, PolpVariableIncome,
} from '../polp-investment-types'
import { dateOnly, decimal, moneyCents, toFraction } from './convert'

export type InvestmentAssetClass = 'fixed_income' | 'credit_fixed_income' | 'fund' | 'treasury' | 'br_equity'

export interface NormalizedInvestmentAsset {
  name: string
  ticker: string | null
  assetClass: InvestmentAssetClass
  assetSubtype: string | null
  isin: string | null
  cnpj: string | null
  issuerName: string | null
  indexer: string | null
  preFixedRate: number | null
  indexerPercentage: number | null
  dueDate: string | null
}

export interface NormalizedBankPosition {
  referenceDate: string
  quantity: number | null
  unitPrice: number | null
  grossCents: number | null
  netCents: number | null
  incomeTaxCents: number | null
  iofCents: number | null
  blockedCents: number | null
  purchaseUnitPrice: number | null
}

export interface NormalizedInvestment {
  polpId: string
  kind: PolpInvestmentKind
  asset: NormalizedInvestmentAsset
  /** null enquanto a Polp não terminou de sincronizar o `balance`. */
  position: NormalizedBankPosition | null
}

const CLASS: Record<PolpInvestmentKind, InvestmentAssetClass> = {
  BANK_FIXED_INCOME: 'fixed_income',
  CREDIT_FIXED_INCOME: 'credit_fixed_income',
  FUND: 'fund',
  TREASURE_TITLE: 'treasury',
  VARIABLE_INCOME: 'br_equity',
}

export function normalizeInvestment(kind: PolpInvestmentKind, raw: unknown): NormalizedInvestment {
  const item = raw as { id?: string }
  if (!item?.id) throw new Error(`investimento ${kind} sem id`)

  switch (kind) {
    case 'BANK_FIXED_INCOME':
    case 'CREDIT_FIXED_INCOME': {
      const r = raw as PolpCreditFixedIncome
      const rem = remuneration(r.remuneration)
      const issuerName = kind === 'CREDIT_FIXED_INCOME' ? (r.debtor_name ?? null) : null
      const head = [r.investment_type ?? (kind === 'BANK_FIXED_INCOME' ? 'Renda fixa' : 'Crédito privado'), issuerName]
        .filter(Boolean).join(' ')
      return {
        polpId: item.id,
        kind,
        asset: {
          name: withDue(`${head}${rem.label ? ' ' + rem.label : ''}`, r.due_date),
          ticker: null,
          assetClass: CLASS[kind],
          assetSubtype: r.investment_type ?? null,
          isin: r.isin_code ?? null,
          cnpj: r.issuer_institution_cnpj_number ?? null,
          issuerName,
          indexer: rem.indexer,
          preFixedRate: rem.preFixedRate,
          indexerPercentage: rem.indexerPercentage,
          dueDate: r.due_date ?? null,
        },
        position: fixedIncomePosition(r.balance),
      }
    }
    case 'TREASURE_TITLE': {
      const r = raw as PolpTreasureTitle
      const rem = remuneration(r.remuneration)
      return {
        polpId: item.id,
        kind,
        asset: {
          name: r.product_name ?? withDue(`Tesouro ${rem.indexer ?? ''}`.trim(), r.due_date),
          ticker: null,
          assetClass: 'treasury',
          assetSubtype: null,
          isin: r.isin_code ?? null,
          cnpj: null,
          issuerName: null,
          indexer: rem.indexer,
          preFixedRate: rem.preFixedRate,
          indexerPercentage: rem.indexerPercentage,
          dueDate: r.due_date ?? null,
        },
        position: fixedIncomePosition(r.balance),
      }
    }
    case 'FUND': {
      const r = raw as PolpFund
      const b = r.balance
      const referenceDate = dateOnly(b?.reference_date)
      return {
        polpId: item.id,
        kind,
        asset: {
          ...emptyAsset('fund'),
          name: r.name ?? `Fundo ${r.cnpj_number ?? item.id}`,
          assetSubtype: r.anbima_category ?? null,
          isin: r.isin_code ?? null,
          cnpj: r.cnpj_number ?? null,
        },
        position: b && referenceDate ? {
          referenceDate,
          quantity: decimal(b.quota_quantity),
          unitPrice: decimal(b.quota_gross_price_value),
          grossCents: moneyCents(b.gross_amount),
          netCents: moneyCents(b.net_amount),
          incomeTaxCents: moneyCents(b.income_tax_provision),
          iofCents: moneyCents(b.financial_transaction_tax_provision),
          blockedCents: moneyCents(b.blocked_amount),
          purchaseUnitPrice: null,
        } : null,
      }
    }
    case 'VARIABLE_INCOME': {
      const r = raw as PolpVariableIncome
      const b = r.balance
      const referenceDate = dateOnly(b?.reference_date)
      return {
        polpId: item.id,
        kind,
        asset: {
          ...emptyAsset('br_equity'),
          name: r.ticker ?? r.isin_code ?? 'Renda variável',
          ticker: r.ticker ?? null,
          isin: r.isin_code ?? null,
          cnpj: r.issuer_institution_cnpj_number ?? null,
        },
        position: b && referenceDate ? {
          referenceDate,
          quantity: decimal(b.quantity),
          unitPrice: decimal(b.closing_price),
          grossCents: moneyCents(b.gross_amount),
          netCents: null,
          incomeTaxCents: null,
          iofCents: null,
          blockedCents: moneyCents(b.blocked_balance),
          purchaseUnitPrice: null,
        } : null,
      }
    }
    default:
      throw new Error(`tipo de investimento desconhecido: ${kind as string}`)
  }
}

function emptyAsset(assetClass: InvestmentAssetClass): NormalizedInvestmentAsset {
  return {
    name: '', ticker: null, assetClass, assetSubtype: null, isin: null, cnpj: null,
    issuerName: null, indexer: null, preFixedRate: null, indexerPercentage: null, dueDate: null,
  }
}

function fixedIncomePosition(b: PolpFixedIncomeBalance | null | undefined): NormalizedBankPosition | null {
  const referenceDate = dateOnly(b?.reference_date_time)
  if (!b || !referenceDate) return null
  return {
    referenceDate,
    quantity: decimal(b.quantity),
    unitPrice: decimal(b.updated_unit_price),
    grossCents: moneyCents(b.gross_amount),
    netCents: moneyCents(b.net_amount),
    incomeTaxCents: moneyCents(b.income_tax),
    iofCents: moneyCents(b.financial_transaction_tax),
    blockedCents: moneyCents(b.blocked_balance),
    purchaseUnitPrice: decimal(b.purchase_unit_price),
  }
}

function remuneration(rem: PolpRemuneration | null | undefined) {
  const indexer = rem?.indexer ?? null
  const preFixedRate = decimal(rem?.pre_fixed_rate ?? null)
  const indexerPercentage = toFraction(rem?.post_fixed_indexer_percentage)

  let label = ''
  if (indexer === 'PRE_FIXADO' && preFixedRate !== null) label = `${pct(preFixedRate)} a.a.`
  else if (indexer && indexerPercentage !== null) label = `${pct(indexerPercentage)} ${indexer}`
  else if (indexer && preFixedRate !== null) label = `${indexer} + ${pct(preFixedRate)}`
  else if (indexer) label = indexer

  return { indexer, preFixedRate, indexerPercentage, label }
}

/** 0.125 -> "12,5%". */
function pct(fraction: number): string {
  return `${Number((fraction * 100).toFixed(2)).toString().replace('.', ',')}%`
}

/** "CDB 110% CDI" + "2027-05-10" -> "CDB 110% CDI · venc. 05/2027". */
function withDue(label: string, due: string | null | undefined): string {
  if (!due) return label
  return `${label} · venc. ${due.slice(5, 7)}/${due.slice(0, 4)}`
}
