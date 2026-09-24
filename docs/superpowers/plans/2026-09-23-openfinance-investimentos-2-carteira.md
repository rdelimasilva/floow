# Parte 2 — Carteira e rótulos

Índice e restrições globais: `2026-09-23-openfinance-investimentos.md`. Depende da Parte 1 (T1).

### Task 2: Carteira com eventos novos e posição do banco

**Files:**
- Modify: `packages/core-finance/src/portfolio.ts`
- Create: `packages/core-finance/src/bank-position.ts`
- Modify: `packages/core-finance/src/index.ts`
- Modify: `apps/web/lib/investments/position-snapshots.ts`
- Test: `packages/core-finance/src/__tests__/portfolio.test.ts`
- Test: `packages/core-finance/src/__tests__/bank-position.test.ts`

**Interfaces:**
- Consumes: `assetBankPositions`, `assets.source`, `assetPositionSnapshots.costIsPartial` (T1).
- Produces:
  - `PortfolioEventType` = união dos 11 tipos; `PortfolioEventInput.eventType: PortfolioEventType`.
  - `computeBankPosition(bank: BankPositionInput | null, events: PortfolioEventInput[]): BankPositionResult`
  - `BankPositionInput = { quantity: number | null; grossCents: number | null; netCents: number | null; purchaseUnitPrice: number | null }`
  - `BankPositionResult = { quantityHeld; avgCostCents; totalCostCents; currentPriceCents; currentValueCents; realizedPnLCents; totalDividendsCents; costIsPartial: boolean }`

- [ ] **Step 1: Testes que falham em `portfolio.test.ts`**

```ts
describe('computePosition: tipos vindos do Open Finance', () => {
  it('jcp soma em proventos', () => {
    const r = computePosition([makeEvent({}), makeEvent({ eventType: 'jcp', quantity: null, totalCents: 500 })], 0)
    expect(r.totalDividendsCents).toBe(500)
  })

  it('maturity liquida como venda', () => {
    const r = computePosition([
      makeEvent({ quantity: 10, totalCents: 10000 }),
      makeEvent({ eventType: 'maturity', quantity: 10, totalCents: 12000, eventDate: new Date('2025-01-15') }),
    ], 0)
    expect(r.quantityHeld).toBe(0)
    expect(r.realizedPnLCents).toBe(2000)
  })

  it('come_cotas reduz cotas sem mexer no custo total', () => {
    const r = computePosition([
      makeEvent({ quantity: 100.5, totalCents: 10050 }),
      makeEvent({ eventType: 'come_cotas', quantity: 0.5, totalCents: 60, eventDate: new Date('2024-05-31') }),
    ], 0)
    expect(r.quantityHeld).toBeCloseTo(100, 10)
    expect(r.totalCostCents).toBe(10050)
  })

  it('tax e other não afetam posição nem proventos', () => {
    const r = computePosition([
      makeEvent({}),
      makeEvent({ eventType: 'tax', quantity: null, totalCents: 300 }),
      makeEvent({ eventType: 'other', quantity: 5, totalCents: 999 }),
    ], 0)
    expect(r.quantityHeld).toBe(100)
    expect(r.totalDividendsCents).toBe(0)
  })

  it('quantidade fracionária de cotas', () => {
    const r = computePosition([makeEvent({ quantity: 12.3456789, totalCents: 12346 })], 0)
    expect(r.quantityHeld).toBeCloseTo(12.3456789, 10)
    expect(r.avgCostCents).toBe(1000)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @floow/core-finance test -- portfolio`
Expected: FAIL (erro de tipo em `'jcp'` e `maturity` não liquida).

- [ ] **Step 3: Implementar em `portfolio.ts`**

Substitua o tipo do evento:

```ts
export type PortfolioEventType =
  | 'buy' | 'sell' | 'dividend' | 'interest' | 'split' | 'amortization'
  | 'come_cotas' | 'jcp' | 'maturity' | 'tax' | 'other'

export interface PortfolioEventInput {
  eventType: PortfolioEventType
  // ...demais campos iguais
}
```

No `switch`, troque `case 'sell':` por `case 'sell':\n      case 'maturity':`, troque o grupo de proventos por:

```ts
      case 'dividend':
      case 'jcp':
      case 'interest':
      case 'amortization': {
        totalDividendsCents += event.totalCents ?? 0
        break
      }

      // Come-cotas é IR antecipado pago em COTAS: o fundo recolhe o imposto
      // resgatando parte delas. O dinheiro investido não muda, as cotas caem —
      // o custo total fica e o custo médio por cota sobe.
      case 'come_cotas': {
        quantityHeld -= event.quantity ?? 0
        if (quantityHeld <= 0) {
          quantityHeld = 0
          totalCostCents = 0
        }
        break
      }

      // tax e other ficam no histórico, fora da conta.
      case 'tax':
      case 'other':
        break
```

Atualize o cabeçalho do arquivo com as regras novas (uma linha cada).

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @floow/core-finance test -- portfolio`
Expected: PASS.

- [ ] **Step 5: Teste que falha de `computeBankPosition`**

`packages/core-finance/src/__tests__/bank-position.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeBankPosition } from '../bank-position'
import type { PortfolioEventInput } from '../portfolio'

const compra = (qty: number, total: number, d = '2026-01-10'): PortfolioEventInput => ({
  eventType: 'buy', quantity: qty, priceCents: null, totalCents: total, splitRatio: null, eventDate: new Date(d),
})

describe('computeBankPosition', () => {
  it('valor vem do banco (líquido) e custo do preço de compra informado', () => {
    const r = computeBankPosition({ quantity: 10, grossCents: 12000, netCents: 11500, purchaseUnitPrice: 100 }, [])
    expect(r.currentValueCents).toBe(11500)
    expect(r.totalCostCents).toBe(100000)
    expect(r.costIsPartial).toBe(false)
    expect(r.quantityHeld).toBe(10)
    expect(r.currentPriceCents).toBe(1150)
  })

  it('sem líquido usa o bruto', () => {
    expect(computeBankPosition({ quantity: 2, grossCents: 5000, netCents: null, purchaseUnitPrice: null }, []).currentValueCents).toBe(5000)
  })

  it('sem preço de compra, custo sai dos eventos e é parcial', () => {
    const r = computeBankPosition({ quantity: 10, grossCents: 12000, netCents: null, purchaseUnitPrice: null }, [compra(10, 10000)])
    expect(r.totalCostCents).toBe(10000)
    expect(r.costIsPartial).toBe(true)
  })

  it('proventos e realizado vêm dos eventos', () => {
    const r = computeBankPosition({ quantity: 10, grossCents: 1, netCents: null, purchaseUnitPrice: 1 }, [
      compra(10, 1000),
      { ...compra(0, 70), eventType: 'jcp', quantity: null },
    ])
    expect(r.totalDividendsCents).toBe(70)
  })

  it('sem posição do banco: tudo zero, custo parcial', () => {
    const r = computeBankPosition(null, [compra(10, 1000)])
    expect(r.currentValueCents).toBe(0)
    expect(r.quantityHeld).toBe(0)
    expect(r.costIsPartial).toBe(true)
  })

  it('resgatado por inteiro: quantidade 0 zera valor e preço, sem dividir por zero', () => {
    const r = computeBankPosition({ quantity: 0, grossCents: 0, netCents: 0, purchaseUnitPrice: 100 }, [])
    expect(r.currentValueCents).toBe(0)
    expect(r.currentPriceCents).toBe(0)
    expect(r.avgCostCents).toBe(0)
  })
})
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `pnpm --filter @floow/core-finance test -- bank-position`
Expected: FAIL (módulo não existe).

- [ ] **Step 7: Implementar `bank-position.ts`**

```ts
/**
 * Posição de ativo do Open Finance.
 *
 * O VALOR é o que o banco informa — o histórico de movimentações cobre ~12
 * meses e recalcular pelos eventos divergiria em qualquer ativo mais antigo.
 * O CUSTO é o preço de compra que o banco informa, quando informa; senão, a
 * soma das compras conhecidas, marcada como parcial para a tela avisar.
 * Proventos e lucro realizado vêm dos eventos, que é onde eles existem.
 */
import { computePosition, type PortfolioEventInput } from './portfolio'

export interface BankPositionInput {
  quantity: number | null
  grossCents: number | null
  netCents: number | null
  purchaseUnitPrice: number | null
}

export interface BankPositionResult {
  quantityHeld: number
  avgCostCents: number
  totalCostCents: number
  currentPriceCents: number
  currentValueCents: number
  realizedPnLCents: number
  totalDividendsCents: number
  costIsPartial: boolean
}

export function computeBankPosition(
  bank: BankPositionInput | null,
  events: PortfolioEventInput[],
): BankPositionResult {
  const fromEvents = computePosition(events, 0)
  const quantityHeld = bank?.quantity ?? 0
  const currentValueCents = bank ? (bank.netCents ?? bank.grossCents ?? 0) : 0

  const hasPurchasePrice = bank?.purchaseUnitPrice != null && quantityHeld > 0
  const totalCostCents = hasPurchasePrice
    ? Math.round(bank!.purchaseUnitPrice! * quantityHeld * 100)
    : fromEvents.totalCostCents

  return {
    quantityHeld,
    avgCostCents: quantityHeld > 0 ? Math.round(totalCostCents / quantityHeld) : 0,
    totalCostCents,
    currentPriceCents: quantityHeld > 0 ? Math.round(currentValueCents / quantityHeld) : 0,
    currentValueCents,
    realizedPnLCents: fromEvents.realizedPnLCents,
    totalDividendsCents: fromEvents.totalDividendsCents,
    costIsPartial: !hasPurchasePrice,
  }
}
```

Em `packages/core-finance/src/index.ts`: `export * from './bank-position'`.

- [ ] **Step 8: Rodar e ver passar**

Run: `pnpm --filter @floow/core-finance test -- bank-position portfolio`
Expected: PASS.

- [ ] **Step 9: `position-snapshots.ts` respeita a origem**

Esta mudança é a mitigação do item 1 do Review Focus. Em `apps/web/lib/investments/position-snapshots.ts`:

1. Troque o cast `as 'buy' | 'sell' | ...` por `as PortfolioEventType` (importado de `@floow/core-finance`).
2. Crie a função que monta a linha a partir do banco:

```ts
function toBankSnapshotRow(
  orgId: string,
  assetId: string,
  bank: BankPositionInput | null,
  events: Parameters<typeof toSnapshotRow>[2],
) {
  const r = computeBankPosition(bank, events.map(toEventInput))
  const unrealizedPnLCents = r.currentValueCents - r.totalCostCents
  return {
    assetId,
    orgId,
    quantityHeld: r.quantityHeld,
    avgCostCents: r.avgCostCents,
    totalCostCents: r.totalCostCents,
    currentPriceCents: r.currentPriceCents,
    currentValueCents: r.currentValueCents,
    unrealizedPnLCents,
    unrealizedPnLPercentBps: toPercentBps(unrealizedPnLCents, r.totalCostCents),
    realizedPnLCents: r.realizedPnLCents,
    totalDividendsCents: r.totalDividendsCents,
    costIsPartial: r.costIsPartial,
    updatedAt: new Date(),
  }
}
```

   Extraia o `events.map(...)` que hoje está dentro de `toSnapshotRow` para `function toEventInput(event)` e use-o nos dois lugares. `toSnapshotRow` passa a devolver também `costIsPartial: false`.
3. Crie a leitura da última posição do banco:

```ts
async function getLatestBankPositions(db: DbClient, orgId: string): Promise<Map<string, BankPositionInput>> {
  const rows = await db.execute<{ asset_id: string; quantity: string | null; gross_cents: number | null; net_cents: number | null; purchase_unit_price: string | null }>(
    sql`SELECT DISTINCT ON (asset_id) asset_id, quantity, gross_cents, net_cents, purchase_unit_price
        FROM asset_bank_positions
        WHERE org_id = ${orgId}
        ORDER BY asset_id, reference_date DESC`
  )
  const num = (v: string | null) => (v === null ? null : Number(v))
  return new Map(rows.map((r) => [r.asset_id, {
    quantity: num(r.quantity), grossCents: r.gross_cents, netCents: r.net_cents, purchaseUnitPrice: num(r.purchase_unit_price),
  }]))
}
```

4. Em `recomputeOrgPositionSnapshots`, selecione também `source: assets.source`, carregue `getLatestBankPositions(db, orgId)` no mesmo `Promise.all`, e monte cada linha com:

```ts
asset.source === 'openfinance'
  ? toBankSnapshotRow(orgId, asset.id, bankPositions.get(asset.id) ?? null, eventsByAsset.get(asset.id) ?? [])
  : toSnapshotRow(orgId, asset.id, eventsByAsset.get(asset.id) ?? [], latestPrices[asset.id] ?? 0)
```

   Ativo do banco **sempre** gera linha (mesmo zerado): o histórico dele não some da tela.
5. Em `recomputeAssetPositionSnapshot`, selecione `source` no ativo; se `openfinance`, use `getLatestBankPositions` filtrado ao ativo e `toBankSnapshotRow`; inclua `costIsPartial` no `set` do upsert.
6. Exporte `recomputeAssetPositionSnapshot` e aceite `db` por parâmetro em `recomputeOrgPositionSnapshots(orgId, db = getDb())` — a ingestão (T9) chama com o `db` dela.

- [ ] **Step 10: Typecheck e testes do app**

Run: `pnpm --filter web typecheck && pnpm --filter web test -- investments`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add packages/core-finance/src/portfolio.ts packages/core-finance/src/bank-position.ts packages/core-finance/src/index.ts packages/core-finance/src/__tests__/portfolio.test.ts packages/core-finance/src/__tests__/bank-position.test.ts apps/web/lib/investments/position-snapshots.ts
git commit -m "feat(investimentos): posicao de ativo do banco vem do banco, nao dos eventos"
```

---

### Task 3: Rótulos e classes novas em um lugar só

**Files:**
- Create: `apps/web/lib/investments/asset-labels.ts`
- Modify: `apps/web/components/investments/position-table.tsx`, `allocation-chart.tsx`, `asset-form.tsx`, `asset-edit-form.tsx`, `apps/web/app/(app)/investments/[assetId]/page.tsx` (cada um tem um mapa `br_equity: ...` próprio)
- Modify: `packages/shared/src/schemas/investments.ts`
- Test: `apps/web/__tests__/investments/asset-labels.test.ts`

**Interfaces:**
- Produces: `ASSET_CLASS_LABEL: Record<AssetClass, string>`, `EVENT_TYPE_LABEL: Record<EventType, string>`, `assetDisplayName(a: { ticker: string | null; name: string }): string`.

- [ ] **Step 1: Teste que falha**

```ts
import { describe, it, expect } from 'vitest'
import { assetClassEnum, eventTypeEnum } from '@floow/db'
import { ASSET_CLASS_LABEL, EVENT_TYPE_LABEL, assetDisplayName } from '@/lib/investments/asset-labels'

describe('rótulos de investimento', () => {
  it('toda classe do enum tem rótulo', () => {
    for (const v of assetClassEnum.enumValues) expect(ASSET_CLASS_LABEL[v]).toBeTruthy()
  })
  it('todo tipo de evento do enum tem rótulo', () => {
    for (const v of eventTypeEnum.enumValues) expect(EVENT_TYPE_LABEL[v]).toBeTruthy()
  })
  it('sem ticker, exibe o nome', () => {
    expect(assetDisplayName({ ticker: null, name: 'CDB Banco X 2027' })).toBe('CDB Banco X 2027')
    expect(assetDisplayName({ ticker: 'PETR4', name: 'Petrobras' })).toBe('PETR4')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter web test -- asset-labels`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar `asset-labels.ts`**

```ts
import type { assetClassEnum, eventTypeEnum } from '@floow/db'

type AssetClass = (typeof assetClassEnum.enumValues)[number]
type EventType = (typeof eventTypeEnum.enumValues)[number]

/** Fonte única do rótulo de classe. Antes eram cinco mapas copiados. */
export const ASSET_CLASS_LABEL = {
  br_equity: 'Ações BR',
  fii: 'FIIs',
  etf: 'ETFs',
  crypto: 'Cripto',
  fixed_income: 'Renda Fixa',
  international: 'Internacional',
  fund: 'Fundos',
  treasury: 'Tesouro Direto',
  credit_fixed_income: 'Crédito Privado',
} as const satisfies Record<AssetClass, string>

export const EVENT_TYPE_LABEL = {
  buy: 'Compra',
  sell: 'Venda',
  dividend: 'Dividendo',
  interest: 'Juros',
  split: 'Desdobramento',
  amortization: 'Amortização',
  come_cotas: 'Come-cotas',
  jcp: 'JCP',
  maturity: 'Vencimento',
  tax: 'Imposto',
  other: 'Outros',
} as const satisfies Record<EventType, string>

/** Título de Tesouro e CDB não têm ticker; o nome é o que identifica. */
export function assetDisplayName(asset: { ticker: string | null; name: string }): string {
  return asset.ticker ?? asset.name
}
```

- [ ] **Step 4: Trocar os mapas locais**

Em cada arquivo listado, apague o mapa local (`ASSET_CLASS_LABELS`, e os de tipo de evento em `asset-event-list.tsx` se existirem) e importe de `@/lib/investments/asset-labels`. Onde o componente exibe `ticker`, use `assetDisplayName(...)`. Os **selects** de classe no formulário manual (`asset-form.tsx`, `asset-edit-form.tsx`) continuam oferecendo só as seis classes antigas mais `fund` e `treasury` — `credit_fixed_income` também pode ser manual; ofereça as nove, na ordem do enum.

Em `packages/shared/src/schemas/investments.ts`, troque os dois `z.enum([...seis...])` de classe por `z.enum(['br_equity','fii','etf','crypto','fixed_income','international','fund','treasury','credit_fixed_income'])`; `eventType` do formulário manual segue com os seis de hoje (os novos só chegam pelo banco). `quantity: z.number().int()` vira `z.number().positive()`.

- [ ] **Step 5: Testes e typecheck**

Run: `pnpm --filter web test -- asset-labels investments && pnpm --filter web typecheck && pnpm --filter @floow/shared test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/investments/asset-labels.ts apps/web/__tests__/investments/asset-labels.test.ts apps/web/components/investments packages/shared/src/schemas/investments.ts "apps/web/app/(app)/investments/[assetId]/page.tsx"
git commit -m "refactor(investimentos): rotulos de classe e evento num lugar so, com as classes novas"
```
