# Parte 4 — Normalizar investimento e posição

Índice e restrições globais: `2026-09-23-openfinance-investimentos.md`. Depende da Parte 3 (T4, T5).

### Task 6: Investimento e posição

**Files:**
- Create: `packages/core-finance/src/openfinance/investments/normalize-investment.ts`
- Create: `packages/core-finance/src/openfinance/investments/index.ts`
- Modify: `packages/core-finance/src/index.ts`
- Test: `packages/core-finance/src/__tests__/openfinance/investments/normalize-investment.test.ts`

**Interfaces:**
- Consumes: `moneyCents`, `decimal`, `toFraction`, `dateOnly` (T5); tipos de payload (T4).
- Produces:

```ts
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

export function normalizeInvestment(kind: PolpInvestmentKind, raw: unknown): NormalizedInvestment
```

- [ ] **Step 1: Testes que falham**

```ts
import { describe, it, expect } from 'vitest'
import { normalizeInvestment } from '../../../openfinance/investments/normalize-investment'

const money = (amount: string) => ({ amount, currency: 'BRL' })

describe('normalizeInvestment — renda fixa bancária', () => {
  const cdb = {
    id: 'bfi-1',
    investment_type: 'CDB',
    issuer_institution_cnpj_number: '60701190000104',
    isin_code: 'BRITAUCDB001',
    due_date: '2027-05-10',
    remuneration: { indexer: 'CDI', post_fixed_indexer_percentage: '1.100000', pre_fixed_rate: null },
    balance: {
      reference_date_time: '2026-09-22T03:00:00Z',
      quantity: '10.000000',
      updated_unit_price: money('1123.456789'),
      gross_amount: money('11234.57'),
      net_amount: money('11020.10'),
      income_tax: money('190.12'),
      financial_transaction_tax: money('24.35'),
      blocked_balance: money('0.00'),
      purchase_unit_price: money('1000.00'),
    },
  }

  it('identidade, remuneração e nome legível', () => {
    const r = normalizeInvestment('BANK_FIXED_INCOME', cdb)
    expect(r.polpId).toBe('bfi-1')
    expect(r.asset).toEqual({
      name: 'CDB 110% CDI · venc. 05/2027',
      ticker: null,
      assetClass: 'fixed_income',
      assetSubtype: 'CDB',
      isin: 'BRITAUCDB001',
      cnpj: '60701190000104',
      issuerName: null,
      indexer: 'CDI',
      preFixedRate: null,
      indexerPercentage: 1.1,
      dueDate: '2027-05-10',
    })
  })

  it('posição do banco em centavos e decimais', () => {
    expect(normalizeInvestment('BANK_FIXED_INCOME', cdb).position).toEqual({
      referenceDate: '2026-09-22',
      quantity: 10,
      unitPrice: 1123.456789,
      grossCents: 1123457,
      netCents: 1102010,
      incomeTaxCents: 19012,
      iofCents: 2435,
      blockedCents: 0,
      purchaseUnitPrice: 1000,
    })
  })

  it('balance nulo: posição nula, ativo continua', () => {
    const r = normalizeInvestment('BANK_FIXED_INCOME', { ...cdb, balance: null })
    expect(r.position).toBeNull()
    expect(r.asset.assetSubtype).toBe('CDB')
  })

  it('prefixado descreve a taxa ao ano', () => {
    const r = normalizeInvestment('BANK_FIXED_INCOME', {
      ...cdb, remuneration: { indexer: 'PRE_FIXADO', pre_fixed_rate: '0.125000' },
    })
    expect(r.asset.name).toBe('CDB 12,5% a.a. · venc. 05/2027')
    expect(r.asset.preFixedRate).toBeCloseTo(0.125)
  })
})

describe('normalizeInvestment — crédito, Tesouro, fundo, renda variável', () => {
  it('debênture com escala "100" e devedor', () => {
    const r = normalizeInvestment('CREDIT_FIXED_INCOME', {
      id: 'cfi-1', investment_type: 'DEBENTURES', debtor_name: 'Energia SA',
      due_date: '2030-01-15', remuneration: { indexer: 'IPCA', pre_fixed_rate: '0.065' }, balance: null,
    })
    expect(r.asset.assetClass).toBe('credit_fixed_income')
    expect(r.asset.issuerName).toBe('Energia SA')
    expect(r.asset.name).toBe('DEBENTURES Energia SA IPCA + 6,5% · venc. 01/2030')
  })

  it('Tesouro usa o nome do produto', () => {
    const r = normalizeInvestment('TREASURE_TITLE', {
      id: 'tt-1', product_name: 'Tesouro IPCA+ 2035', due_date: '2035-05-15',
      remuneration: { indexer: 'IPCA' }, balance: null,
    })
    expect(r.asset.name).toBe('Tesouro IPCA+ 2035')
    expect(r.asset.assetClass).toBe('treasury')
  })

  it('fundo: cotas, reference_date e provisões', () => {
    const r = normalizeInvestment('FUND', {
      id: 'f-1', name: 'Fundo XP DI', cnpj_number: '11222333000144',
      balance: {
        reference_date: '2026-09-21', quota_quantity: '1234.5678901234',
        quota_gross_price_value: money('2.5123456'), gross_amount: money('3101.62'),
        net_amount: money('3050.00'), income_tax_provision: money('51.62'),
        financial_transaction_tax_provision: null, blocked_amount: null,
      },
    })
    expect(r.asset).toMatchObject({ name: 'Fundo XP DI', cnpj: '11222333000144', assetClass: 'fund' })
    expect(r.position).toMatchObject({
      referenceDate: '2026-09-21', grossCents: 310162, netCents: 305000, incomeTaxCents: 5162, iofCents: null, purchaseUnitPrice: null,
    })
    expect(r.position!.quantity).toBeCloseTo(1234.5678901234, 10)
  })

  it('renda variável: ticker, sem líquido nem IR', () => {
    const r = normalizeInvestment('VARIABLE_INCOME', {
      id: 'vi-1', ticker: 'PETR4', isin_code: 'BRPETRACNPR6',
      balance: { reference_date: '2026-09-22', quantity: '100', closing_price: money('38.50'), gross_amount: money('3850.00') },
    })
    expect(r.asset).toMatchObject({ ticker: 'PETR4', name: 'PETR4', assetClass: 'br_equity' })
    expect(r.position).toMatchObject({ quantity: 100, unitPrice: 38.5, grossCents: 385000, netCents: null, incomeTaxCents: null })
  })

  it('sem id é erro — é a chave de tudo que vem depois', () => {
    expect(() => normalizeInvestment('FUND', { name: 'x' })).toThrow(/sem id/)
  })

  it('balance sem data de referência não vira posição', () => {
    expect(normalizeInvestment('FUND', { id: 'f', name: 'x', balance: { quota_quantity: '1' } }).position).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @floow/core-finance test -- normalize-investment`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar `normalize-investment.ts`**

```ts
/**
 * Investimento da Polp -> ativo do floow + posição do dia.
 *
 * Um normalizador para os cinco tipos porque o que muda entre eles é qual
 * campo carrega cada coisa, não a regra. A tabela de campos está nos ramos
 * do `switch`; o resto é comum.
 */
import type {
  PolpBankFixedIncome, PolpCreditFixedIncome, PolpFixedIncomeBalance, PolpFund,
  PolpInvestmentKind, PolpRemuneration, PolpTreasureTitle, PolpVariableIncome,
} from '../polp-investment-types'
import { dateOnly, decimal, moneyCents, toFraction } from './convert'

// (interfaces da seção "Produces" acima, exportadas aqui)

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
```

`investments/index.ts`:

```ts
export * from './convert'
export * from './normalize-investment'
export * from './normalize-investment-transaction'
```

(o terceiro arquivo nasce na T7; até lá, deixe só as duas primeiras linhas). Em `packages/core-finance/src/index.ts`: `export * from './openfinance/investments'`.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @floow/core-finance test -- normalize-investment && pnpm --filter @floow/core-finance typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core-finance/src/openfinance/investments packages/core-finance/src/index.ts packages/core-finance/src/__tests__/openfinance/investments/normalize-investment.test.ts
git commit -m "feat(polp): normaliza investimento e posicao dos cinco tipos"
```
