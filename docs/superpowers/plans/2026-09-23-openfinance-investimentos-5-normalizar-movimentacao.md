# Parte 5 — Normalizar movimentações

Índice e restrições globais: `2026-09-23-openfinance-investimentos.md`. Depende da Parte 3 (T5).

### Task 7: Movimentações

**Files:**
- Create: `packages/core-finance/src/openfinance/investments/normalize-investment-transaction.ts`
- Modify: `packages/core-finance/src/openfinance/investments/index.ts`
- Test: `packages/core-finance/src/__tests__/openfinance/investments/normalize-investment-transaction.test.ts`

**Interfaces:**
- Consumes: `mapEventType`, `moneyCents`, `decimal`, `dateOnly`, `InvestmentEventType` (T5).
- Produces:

```ts
export interface NormalizedInvestmentEvent {
  polpTransactionId: string
  eventType: InvestmentEventType
  /** `transaction_type` cru quando não reconhecido — a ingestão registra issue. */
  unknownType: string | null
  eventDate: string
  quantity: number | null
  unitPrice: number | null
  priceCents: number | null
  totalCents: number | null
  grossCents: number | null
  netCents: number | null
  incomeTaxCents: number | null
  notes: string | null
}

export function normalizeInvestmentTransaction(raw: unknown): NormalizedInvestmentEvent
```

- [ ] **Step 1: Testes que falham**

```ts
import { describe, it, expect } from 'vitest'
import { normalizeInvestmentTransaction } from '../../../openfinance/investments/normalize-investment-transaction'

const money = (amount: string) => ({ amount, currency: 'BRL' })

describe('normalizeInvestmentTransaction', () => {
  it('aplicação em CDB: custo é o bruto', () => {
    const r = normalizeInvestmentTransaction({
      id: 'tx-1', type: 'ENTRADA', transaction_type: 'APLICACAO', transaction_date: '2025-03-10',
      transaction_quantity: '10', transaction_unit_price: money('1000.00'),
      transaction_gross_value: money('10000.00'), transaction_net_value: money('10000.00'),
      income_tax: money('0'),
    })
    expect(r).toEqual({
      polpTransactionId: 'tx-1', eventType: 'buy', unknownType: null, eventDate: '2025-03-10',
      quantity: 10, unitPrice: 1000, priceCents: 100000, totalCents: 1000000,
      grossCents: 1000000, netCents: 1000000, incomeTaxCents: 0, notes: null,
    })
  })

  it('resgate: total é o líquido que caiu na conta', () => {
    const r = normalizeInvestmentTransaction({
      id: 'tx-2', transaction_type: 'RESGATE', transaction_date: '2026-03-10', transaction_quantity: '10',
      transaction_gross_value: money('11200.00'), transaction_net_value: money('10980.00'), income_tax: money('220.00'),
    })
    expect(r).toMatchObject({ eventType: 'sell', totalCents: 1098000, grossCents: 1120000, incomeTaxCents: 22000 })
  })

  it('fundo: data de conversão, cotas e preço da cota', () => {
    const r = normalizeInvestmentTransaction({
      id: 'tx-3', transaction_type: 'APLICACAO', transaction_conversion_date: '2026-02-02',
      transaction_quota_quantity: '398.1234567', transaction_quota_price: money('2.5117'),
      transaction_value: money('1000.00'),
    })
    expect(r.eventDate).toBe('2026-02-02')
    expect(r.quantity).toBeCloseTo(398.1234567, 7)
    expect(r.priceCents).toBe(251)
    expect(r.totalCents).toBe(100000)
  })

  it('come-cotas: quantidade de cotas e total = IR', () => {
    const r = normalizeInvestmentTransaction({
      id: 'tx-4', transaction_type: 'COME_COTAS', transaction_conversion_date: '2026-05-29',
      transaction_quota_quantity: '3.21', income_tax: money('8.07'),
    })
    expect(r).toMatchObject({ eventType: 'come_cotas', quantity: 3.21, totalCents: 807 })
  })

  it('JCP em renda variável usa transaction_value', () => {
    const r = normalizeInvestmentTransaction({
      id: 'tx-5', transaction_type: 'JCP', transaction_date: '2026-08-15', transaction_value: money('42.50'),
    })
    expect(r).toMatchObject({ eventType: 'jcp', totalCents: 4250, quantity: null })
  })

  it('tipo novo vira other, guarda o cru e a nota', () => {
    const r = normalizeInvestmentTransaction({
      id: 'tx-6', transaction_type: 'BONIFICACAO', transaction_type_additional_info: 'bonus 10%',
      transaction_date: '2026-01-05', transaction_quantity: '5',
    })
    expect(r).toMatchObject({ eventType: 'other', unknownType: 'BONIFICACAO', notes: 'bonus 10%' })
  })

  it('sem id ou sem data é erro', () => {
    expect(() => normalizeInvestmentTransaction({ transaction_type: 'COMPRA', transaction_date: '2026-01-01' })).toThrow(/sem id/)
    expect(() => normalizeInvestmentTransaction({ id: 'x', transaction_type: 'COMPRA' })).toThrow(/sem data/)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @floow/core-finance test -- normalize-investment-transaction`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
/**
 * Movimentação de investimento da Polp -> evento da carteira.
 *
 * Um só normalizador para os cinco tipos: fundos trocam `transaction_date`
 * por `transaction_conversion_date` e `transaction_quantity` por
 * `transaction_quota_quantity`; o resto é o mesmo vocabulário.
 *
 * Qual valor é o "total" depende do que o evento significa para a carteira:
 * na compra, o que saiu do bolso (bruto); no resto, o que entrou (líquido);
 * no come-cotas, o imposto — é ele que as cotas pagaram.
 */
import type { PolpInvestmentTransaction } from '../polp-investment-types'
import { dateOnly, decimal, mapEventType, moneyCents, type InvestmentEventType } from './convert'

// (interface NormalizedInvestmentEvent da seção "Produces", exportada aqui)

export function normalizeInvestmentTransaction(raw: unknown): NormalizedInvestmentEvent {
  const tx = raw as PolpInvestmentTransaction
  if (!tx?.id) throw new Error('movimentação de investimento sem id')

  const eventDate = dateOnly(tx.transaction_conversion_date ?? tx.transaction_date)
  if (!eventDate) throw new Error(`movimentação ${tx.id} sem data`)

  const { eventType, known } = mapEventType(tx.transaction_type)
  const quantity = decimal(tx.transaction_quota_quantity ?? tx.transaction_quantity)
  const unitPrice = decimal(tx.transaction_quota_price ?? tx.transaction_unit_price)
  const grossCents = moneyCents(tx.transaction_gross_value)
  const netCents = moneyCents(tx.transaction_net_value)
  const valueCents = moneyCents(tx.transaction_value)
  const incomeTaxCents = moneyCents(tx.income_tax)

  return {
    polpTransactionId: tx.id,
    eventType,
    unknownType: known ? null : (tx.transaction_type ?? null),
    eventDate,
    quantity,
    unitPrice,
    priceCents: unitPrice === null ? null : Math.round(unitPrice * 100),
    totalCents: totalFor(eventType, { grossCents, netCents, valueCents, incomeTaxCents }),
    grossCents,
    netCents,
    incomeTaxCents,
    notes: tx.transaction_type_additional_info ?? null,
  }
}

function totalFor(
  eventType: InvestmentEventType,
  v: { grossCents: number | null; netCents: number | null; valueCents: number | null; incomeTaxCents: number | null },
): number | null {
  if (eventType === 'come_cotas') return v.incomeTaxCents ?? v.valueCents ?? v.grossCents
  if (eventType === 'buy') return v.grossCents ?? v.valueCents ?? v.netCents
  return v.netCents ?? v.valueCents ?? v.grossCents
}
```

Acrescente `export * from './normalize-investment-transaction'` em `investments/index.ts`.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @floow/core-finance test && pnpm --filter @floow/core-finance typecheck`
Expected: PASS (a suíte inteira do pacote).

- [ ] **Step 5: Commit**

```bash
git add packages/core-finance/src/openfinance/investments packages/core-finance/src/__tests__/openfinance/investments/normalize-investment-transaction.test.ts
git commit -m "feat(polp): normaliza movimentacoes de investimento"
```
