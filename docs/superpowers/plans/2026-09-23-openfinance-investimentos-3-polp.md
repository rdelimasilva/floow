# Parte 3 — Tipos, cliente e helpers da Polp

Índice e restrições globais: `2026-09-23-openfinance-investimentos.md`. Independente das Partes 1–2 (só `core-finance`).

Fonte dos formatos: https://polp.com.br/docs/celcoin/ — páginas `consents/<tipo>`, `<tipo>/show`, `<tipo>/transactions`, lidas em 2026-09-23. Onde a doc não publica, o código lê defensivamente em vez de inventar.

### Task 4: Tipos de payload e rotas no cliente

**Files:**
- Create: `packages/core-finance/src/openfinance/polp-investment-types.ts`
- Modify: `packages/core-finance/src/openfinance/polp-client.ts`
- Modify: `packages/core-finance/src/index.ts`
- Test: `packages/core-finance/src/__tests__/openfinance/polp-client.test.ts`

**Interfaces:**
- Produces:
  - `type PolpInvestmentKind = 'BANK_FIXED_INCOME' | 'CREDIT_FIXED_INCOME' | 'FUND' | 'TREASURE_TITLE' | 'VARIABLE_INCOME'`
  - `const POLP_INVESTMENT_KINDS: readonly PolpInvestmentKind[]`
  - `PolpClient.streamInvestments(consentId: string, kind: PolpInvestmentKind): AsyncGenerator<unknown[]>`
  - `PolpClient.streamInvestmentTransactions(kind: PolpInvestmentKind, investmentId: string, query?: TransactionQuery): AsyncGenerator<unknown[]>`
  - Interfaces de payload: `PolpBankFixedIncome`, `PolpCreditFixedIncome`, `PolpFund`, `PolpTreasureTitle`, `PolpVariableIncome`, `PolpInvestmentTransaction`, `PolpMoney`, `PolpRemuneration`.

- [ ] **Step 1: Testes que falham**

Acrescente a `polp-client.test.ts`:

```ts
describe('createPolpClient — investimentos', () => {
  it('lista investimentos pelo consentimento, na rota do tipo, seguindo o cursor', async () => {
    const { client, calls } = harness([
      fakeResponse(200, { data: [{ id: 'f1' }], meta: { next_cursor: 'c2' } }),
      fakeResponse(200, { data: [{ id: 'f2' }], meta: { next_cursor: null } }),
    ])
    const ids: string[] = []
    for await (const page of client.streamInvestments('consent-1', 'FUND')) {
      ids.push(...page.map((i) => (i as { id: string }).id))
    }
    expect(ids).toEqual(['f1', 'f2'])
    expect(calls[0].url).toBe('https://api.polp.test/api/v2/consents/consent-1/funds')
    expect(calls[1].url).toContain('cursor=c2')
  })

  it.each([
    ['BANK_FIXED_INCOME', 'bank-fixed-incomes'],
    ['CREDIT_FIXED_INCOME', 'credit-fixed-incomes'],
    ['FUND', 'funds'],
    ['TREASURE_TITLE', 'treasure-titles'],
    ['VARIABLE_INCOME', 'variable-incomes'],
  ] as const)('movimentações de %s em /%s/{id}/transactions', async (kind, slug) => {
    const { client, calls } = harness([fakeResponse(200, { data: [], meta: { next_cursor: null } })])
    for await (const _ of client.streamInvestmentTransactions(kind, 'inv-1', { fromDate: '2026-01-01' })) { /* vazio */ }
    expect(calls[0].url).toBe(`https://api.polp.test/api/v2/${slug}/inv-1/transactions?fromDate=2026-01-01`)
  })

  it('tipo desconhecido é erro, nunca rota inventada', async () => {
    const { client } = harness([])
    const gen = client.streamInvestments('consent-1', 'LOAN' as never)
    await expect(gen.next()).rejects.toThrow(/investimento desconhecido/)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @floow/core-finance test -- polp-client`
Expected: FAIL (`streamInvestments` não existe).

- [ ] **Step 3: Criar `polp-investment-types.ts`**

```ts
/**
 * Payloads de investimento da Polp (Celcoin v2).
 *
 * Fonte: https://polp.com.br/docs/celcoin/ (seção Investimentos), 2026-09-23.
 * Os cinco tipos têm formatos parecidos e NÃO iguais — fundos chamam a
 * quantidade de `quota_quantity`, renda variável não tem valor líquido nem
 * IR, e a data de referência é `reference_date_time` em três tipos e
 * `reference_date` nos outros dois. Tudo que a doc marca como anulável está
 * como opcional aqui; o normalizador trata ausência como `null`, nunca zero.
 */

export type PolpInvestmentKind =
  | 'BANK_FIXED_INCOME'
  | 'CREDIT_FIXED_INCOME'
  | 'FUND'
  | 'TREASURE_TITLE'
  | 'VARIABLE_INCOME'

export const POLP_INVESTMENT_KINDS: readonly PolpInvestmentKind[] = [
  'BANK_FIXED_INCOME',
  'CREDIT_FIXED_INCOME',
  'FUND',
  'TREASURE_TITLE',
  'VARIABLE_INCOME',
]

/** `{ amount: "1500.00", currency: "BRL" }`. Algumas instituições mandam string solta. */
export type PolpMoney = { amount: string; currency?: string } | string

export interface PolpRemuneration {
  indexer?: string | null
  indexer_additional_info?: string | null
  rate_type?: string | null
  rate_periodicity?: string | null
  calculation?: string | null
  pre_fixed_rate?: string | null
  /** Escala diverge por tipo na doc: "1.000000" ou "100" para 100%. */
  post_fixed_indexer_percentage?: string | null
}

interface PolpInvestmentBase {
  id: string
  consent_id?: string
  isin_code?: string | null
  created_at?: string
  updated_at?: string
}

/** Balance de renda fixa bancária, crédito e Tesouro. */
export interface PolpFixedIncomeBalance {
  reference_date_time?: string | null
  quantity?: string | null
  updated_unit_price?: PolpMoney | null
  gross_amount?: PolpMoney | null
  net_amount?: PolpMoney | null
  income_tax?: PolpMoney | null
  financial_transaction_tax?: PolpMoney | null
  blocked_balance?: PolpMoney | null
  purchase_unit_price?: PolpMoney | null
}

export interface PolpBankFixedIncome extends PolpInvestmentBase {
  investment_type?: string | null
  issuer_institution_cnpj_number?: string | null
  due_date?: string | null
  issue_date?: string | null
  purchase_date?: string | null
  remuneration?: PolpRemuneration | null
  balance?: PolpFixedIncomeBalance | null
}

export interface PolpCreditFixedIncome extends PolpBankFixedIncome {
  debtor_cnpj_number?: string | null
  debtor_name?: string | null
  tax_exempt_product?: string | null
}

export interface PolpTreasureTitle extends PolpInvestmentBase {
  product_name?: string | null
  due_date?: string | null
  purchase_date?: string | null
  remuneration?: PolpRemuneration | null
  balance?: PolpFixedIncomeBalance | null
}

export interface PolpFund extends PolpInvestmentBase {
  name?: string | null
  cnpj_number?: string | null
  anbima_category?: string | null
  balance?: {
    reference_date?: string | null
    quota_quantity?: string | null
    quota_gross_price_value?: PolpMoney | null
    gross_amount?: PolpMoney | null
    net_amount?: PolpMoney | null
    income_tax_provision?: PolpMoney | null
    financial_transaction_tax_provision?: PolpMoney | null
    blocked_amount?: PolpMoney | null
  } | null
}

export interface PolpVariableIncome extends PolpInvestmentBase {
  ticker?: string | null
  issuer_institution_cnpj_number?: string | null
  balance?: {
    reference_date?: string | null
    quantity?: string | null
    closing_price?: PolpMoney | null
    gross_amount?: PolpMoney | null
    blocked_balance?: PolpMoney | null
  } | null
}

/** Movimentação — união dos campos dos cinco tipos. */
export interface PolpInvestmentTransaction {
  id: string
  type?: 'ENTRADA' | 'SAIDA' | string | null
  transaction_type?: string | null
  transaction_type_additional_info?: string | null
  /** Todos menos fundos. */
  transaction_date?: string | null
  /** Só fundos. */
  transaction_conversion_date?: string | null
  transaction_quantity?: string | null
  transaction_quota_quantity?: string | null
  transaction_unit_price?: PolpMoney | null
  transaction_quota_price?: PolpMoney | null
  transaction_value?: PolpMoney | null
  transaction_gross_value?: PolpMoney | null
  transaction_net_value?: PolpMoney | null
  income_tax?: PolpMoney | null
  financial_transaction_tax?: PolpMoney | null
}
```

Em `packages/core-finance/src/index.ts`: `export * from './openfinance/polp-investment-types'`.

- [ ] **Step 4: Rotas no cliente**

Em `polp-client.ts`, importe `PolpInvestmentKind` e acrescente, abaixo de `RESOURCE_DETAIL_PATH`:

```ts
/**
 * Slug de rota por tipo de investimento. Fechado: tipo fora daqui é erro, não
 * rota inventada. A rota de DETALHE (`/<slug>/{id}`) não é usada de propósito —
 * limite de 30 req/min e a doc pede para não fazer polling nela. A listagem
 * por consentimento já traz a posição (`balance`).
 */
const INVESTMENT_ROUTE: Record<PolpInvestmentKind, string> = {
  BANK_FIXED_INCOME: 'bank-fixed-incomes',
  CREDIT_FIXED_INCOME: 'credit-fixed-incomes',
  FUND: 'funds',
  TREASURE_TITLE: 'treasure-titles',
  VARIABLE_INCOME: 'variable-incomes',
}

function investmentRoute(kind: PolpInvestmentKind): string {
  const slug = INVESTMENT_ROUTE[kind]
  if (!slug) throw new Error(`Tipo de investimento desconhecido: ${kind}`)
  return slug
}
```

Na interface `PolpClient`:

```ts
  /** Investimentos do consentimento, com `balance` embutido. Páginas de 15. */
  streamInvestments(consentId: string, kind: PolpInvestmentKind): AsyncGenerator<unknown[]>
  /** Movimentações de um investimento. Páginas de 500. */
  streamInvestmentTransactions(
    kind: PolpInvestmentKind,
    investmentId: string,
    query?: TransactionQuery,
  ): AsyncGenerator<unknown[]>
```

No objeto devolvido por `createPolpClient`:

```ts
    async *streamInvestments(consentId, kind) {
      yield* paginate<unknown>(`/consents/${encodeURIComponent(consentId)}/${investmentRoute(kind)}`)
    },

    async *streamInvestmentTransactions(kind, investmentId, query = {}) {
      yield* paginate<unknown>(
        `/${investmentRoute(kind)}/${encodeURIComponent(investmentId)}/transactions`,
        { ...query },
      )
    },
```

(`async *` para que o erro de tipo desconhecido saia no primeiro `next()`, como o teste espera.)

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @floow/core-finance test -- polp-client && pnpm --filter @floow/core-finance typecheck`
Expected: PASS. Mocks de `PolpClient` em `apps/web/__tests__` que usam `as PolpClient` seguem compilando; se algum declarar o objeto inteiro com tipo, acrescente `streamInvestments: vi.fn()` e `streamInvestmentTransactions: vi.fn()`.

- [ ] **Step 6: Commit**

```bash
git add packages/core-finance/src/openfinance/polp-investment-types.ts packages/core-finance/src/openfinance/polp-client.ts packages/core-finance/src/index.ts packages/core-finance/src/__tests__/openfinance/polp-client.test.ts
git commit -m "feat(polp): rotas e tipos de investimento no cliente"
```

---

### Task 5: Helpers de conversão de investimento

**Files:**
- Create: `packages/core-finance/src/openfinance/investments/convert.ts`
- Test: `packages/core-finance/src/__tests__/openfinance/investments/convert.test.ts`

**Interfaces:**
- Consumes: `parseAmountCents` e `toCompetenceDate` de `../normalize`; `PolpMoney`.
- Produces:
  - `moneyCents(v: PolpMoney | null | undefined): number | null`
  - `decimal(v: PolpMoney | number | null | undefined): number | null`
  - `toFraction(v: string | null | undefined): number | null`
  - `dateOnly(v: string | null | undefined): string | null`
  - `mapEventType(raw: string | null | undefined): { eventType: InvestmentEventType; known: boolean }`
  - `type InvestmentEventType = 'buy' | 'sell' | 'maturity' | 'interest' | 'amortization' | 'dividend' | 'jcp' | 'come_cotas' | 'other'`

- [ ] **Step 1: Testes que falham**

```ts
import { describe, it, expect } from 'vitest'
import { moneyCents, decimal, toFraction, dateOnly, mapEventType } from '../../../openfinance/investments/convert'

describe('moneyCents', () => {
  it('lê o objeto da Polp e a string solta', () => {
    expect(moneyCents({ amount: '1500.25', currency: 'BRL' })).toBe(150025)
    expect(moneyCents('10.5')).toBe(1050)
  })
  it('ausência é null, não zero', () => {
    expect(moneyCents(null)).toBeNull()
    expect(moneyCents(undefined)).toBeNull()
  })
  it('valor ilegível é erro — NaN no saldo é pior que item rejeitado', () => {
    expect(() => moneyCents({ amount: 'abc' })).toThrow()
  })
})

describe('decimal', () => {
  it('preserva casas de cota e preço unitário', () => {
    expect(decimal('12.3456789012')).toBeCloseTo(12.3456789012, 10)
    expect(decimal({ amount: '1.23456789' })).toBeCloseTo(1.23456789, 8)
  })
  it('null e string vazia viram null', () => {
    expect(decimal(null)).toBeNull()
    expect(decimal('')).toBeNull()
  })
  it('lixo é erro', () => {
    expect(() => decimal('1,5')).toThrow()
  })
})

describe('toFraction', () => {
  it('as duas escalas da doc viram fração', () => {
    expect(toFraction('1.000000')).toBe(1)
    expect(toFraction('100')).toBe(1)
    expect(toFraction('1.10')).toBeCloseTo(1.1)
    expect(toFraction('110')).toBeCloseTo(1.1)
    expect(toFraction('0.150000')).toBeCloseTo(0.15)
  })
  it('null segue null', () => {
    expect(toFraction(null)).toBeNull()
  })
})

describe('dateOnly', () => {
  it('data pura passa; timestamp vira data de São Paulo', () => {
    expect(dateOnly('2027-05-10')).toBe('2027-05-10')
    expect(dateOnly('2026-01-31T23:30:00-03:00')).toBe('2026-01-31')
    expect(dateOnly(null)).toBeNull()
  })
})

describe('mapEventType', () => {
  it.each([
    ['APLICACAO', 'buy'], ['COMPRA', 'buy'],
    ['RESGATE', 'sell'], ['VENDA', 'sell'], ['CANCELAMENTO', 'sell'],
    ['VENCIMENTO', 'maturity'],
    ['PAGAMENTO_JUROS', 'interest'], ['PREMIO', 'interest'],
    ['AMORTIZACAO', 'amortization'],
    ['DIVIDENDOS', 'dividend'], ['ALUGUEIS', 'dividend'],
    ['JCP', 'jcp'], ['COME_COTAS', 'come_cotas'],
    ['MULTA', 'other'], ['MORA', 'other'], ['OUTROS', 'other'],
    ['TRANSFERENCIA_TITULARIDADE', 'other'], ['TRANSFERENCIA_CUSTODIA', 'other'], ['TRANSFERENCIA_COTAS', 'other'],
  ])('%s → %s (conhecido)', (raw, expected) => {
    expect(mapEventType(raw)).toEqual({ eventType: expected, known: true })
  })
  it('valor novo vira other e é sinalizado como desconhecido', () => {
    expect(mapEventType('BONIFICACAO')).toEqual({ eventType: 'other', known: false })
    expect(mapEventType(null)).toEqual({ eventType: 'other', known: false })
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @floow/core-finance test -- convert`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar `convert.ts`**

```ts
/**
 * Conversões dos payloads de investimento. Puras, e o único lugar em que
 * string da Polp vira número — ver o cabeçalho de `../normalize.ts`.
 */
import { parseAmountCents, toCompetenceDate } from '../normalize'
import type { PolpMoney } from '../polp-investment-types'

export type InvestmentEventType =
  | 'buy' | 'sell' | 'maturity' | 'interest' | 'amortization'
  | 'dividend' | 'jcp' | 'come_cotas' | 'other'

function rawAmount(v: PolpMoney | number | null | undefined): string | number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'object') return v.amount ?? null
  return v
}

export function moneyCents(v: PolpMoney | null | undefined): number | null {
  const raw = rawAmount(v)
  if (raw === null || raw === '') return null
  return parseAmountCents(String(raw))
}

const DECIMAL = /^\s*-?\d+(\.\d+)?\s*$/

export function decimal(v: PolpMoney | number | null | undefined): number | null {
  const raw = rawAmount(v)
  if (raw === null || raw === '') return null
  if (typeof raw === 'number') return raw
  if (!DECIMAL.test(raw)) throw new Error(`número inválido vindo da Polp: ${JSON.stringify(raw)}`)
  return Number(raw)
}

/**
 * Percentual do indexador em fração (1 = 100% do CDI).
 *
 * A doc mostra "1.000000" na renda fixa bancária e "100" na de crédito para o
 * mesmo 100%. Nenhum título real paga 10x o indexador, então valor acima de 10
 * só pode ser escala percentual. Pendência P2 da spec: confirmar com dado real.
 */
export function toFraction(v: string | null | undefined): number | null {
  const n = decimal(v ?? null)
  if (n === null) return null
  return n > 10 ? n / 100 : n
}

export function dateOnly(v: string | null | undefined): string | null {
  if (!v) return null
  return toCompetenceDate(v)
}

const EVENT_TYPE: Record<string, InvestmentEventType> = {
  APLICACAO: 'buy',
  COMPRA: 'buy',
  RESGATE: 'sell',
  VENDA: 'sell',
  CANCELAMENTO: 'sell',
  VENCIMENTO: 'maturity',
  PAGAMENTO_JUROS: 'interest',
  PREMIO: 'interest',
  AMORTIZACAO: 'amortization',
  DIVIDENDOS: 'dividend',
  ALUGUEIS: 'dividend',
  JCP: 'jcp',
  COME_COTAS: 'come_cotas',
  MULTA: 'other',
  MORA: 'other',
  OUTROS: 'other',
  TRANSFERENCIA_TITULARIDADE: 'other',
  TRANSFERENCIA_CUSTODIA: 'other',
  TRANSFERENCIA_COTAS: 'other',
}

/** `known: false` diz à ingestão que registre issue — enum novo não quebra, mas não passa calado. */
export function mapEventType(raw: string | null | undefined): { eventType: InvestmentEventType; known: boolean } {
  const mapped = raw ? EVENT_TYPE[raw] : undefined
  return mapped ? { eventType: mapped, known: true } : { eventType: 'other', known: false }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @floow/core-finance test -- convert`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core-finance/src/openfinance/investments/convert.ts packages/core-finance/src/__tests__/openfinance/investments/convert.test.ts
git commit -m "feat(polp): conversoes de valor, escala e tipo de movimentacao de investimento"
```
