# Motor de Pacing de Orçamento — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o motor que cruza o orçado por categoria com o gasto diário efetivo, separando cartão de crédito de conta corrente, e projeta o fechamento do mês.

**Architecture:** Uma função pura em `@floow/core-finance` faz todo o cálculo (acumulado, projeção, status) sem I/O, coberta por testes unitários. Uma query em `apps/web` agrega no banco por dia × tipo de conta × categoria e alimenta essa função. Nenhuma alteração de schema.

**Tech Stack:** TypeScript, Vitest 3, Drizzle ORM, Next.js `unstable_cache`.

**Spec:** `docs/superpowers/specs/2026-09-02-budget-pacing-design.md`

## Global Constraints

- Nenhuma migration. Nenhuma alteração em `supabase/migrations/`.
- Nenhum arquivo pode exceder 500 linhas (`CLAUDE.md`).
- Despesas são persistidas com `amount_cents` **negativo** (`apps/web/lib/finance/actions.ts:301`). A agregação usa `SUM(-amount_cents)`, nunca `ABS`.
- Datas de transação são `date` puro (sem hora). Toda comparação e formatação usa **UTC**, nunca horário local. Formato canônico: `YYYY-MM-DD`.
- Limiares nomeados como constantes exportadas: `RISK_THRESHOLD = 1.1`, `LOW_CONFIDENCE_DAY_CUTOFF = 7`.
- `getSpendingByCategory` **não** pode ser removida nem ter sua assinatura alterada — `/budgets/spending` depende dela.
- Todo texto de UI em português do Brasil.

---

### Task 1: Tipos, contrato e caso vazio

**Files:**
- Create: `packages/core-finance/src/budget-pacing.ts`
- Test: `packages/core-finance/src/__tests__/budget-pacing.test.ts`

**Interfaces:**
- Consumes: nada (primeira task)
- Produces: os tipos `AccountKind`, `PacingStatus`, `Confidence`, `DailySpendRow`, `BudgetCap`, `BudgetPacingInput`, `BudgetPacingResult`, as constantes `RISK_THRESHOLD` e `LOW_CONFIDENCE_DAY_CUTOFF`, e a função `computeBudgetPacing(input: BudgetPacingInput): BudgetPacingResult`. Todas as tasks seguintes estendem esta mesma função e este mesmo arquivo de teste.

- [ ] **Step 1: Escrever o teste que falha**

Criar `packages/core-finance/src/__tests__/budget-pacing.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeBudgetPacing } from '../budget-pacing'

/** Datas sempre em UTC ao meio-dia, para não haver deslocamento de fuso. */
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 12, 0, 0))

describe('computeBudgetPacing', () => {
  it('devolve estrutura zerada para entrada vazia, sem lançar exceção', () => {
    const result = computeBudgetPacing({
      daily: [],
      budgets: [],
      monthStart: utc(2026, 9, 1),
      today: utc(2026, 9, 12),
    })

    expect(result.total.plannedCents).toBe(0)
    expect(result.total.spentCents).toBe(0)
    expect(result.total.unbudgetedCents).toBe(0)
    expect(result.total.projectedCents).toBe(0)
    expect(result.total.daysInMonth).toBe(30)
    expect(result.byCategory).toEqual([])
    expect(result.series).toHaveLength(30)
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm --filter @floow/core-finance exec vitest run src/__tests__/budget-pacing.test.ts`
Expected: FAIL — `Failed to resolve import "../budget-pacing"`

- [ ] **Step 3: Implementação mínima**

Criar `packages/core-finance/src/budget-pacing.ts`:

```ts
/**
 * Pacing de orçamento: cruza o orçado por categoria com o gasto diário efetivo.
 * Função pura — sem I/O, sem React. Ver docs/superpowers/specs/2026-09-02-budget-pacing-design.md
 */

/** Acima deste múltiplo do teto, a projeção classifica a categoria como risco. */
export const RISK_THRESHOLD = 1.1
/** Antes deste dia do mês, a projeção é ruído e a confiança é baixa. */
export const LOW_CONFIDENCE_DAY_CUTOFF = 7

export type AccountKind = 'checking' | 'savings' | 'brokerage' | 'credit_card' | 'cash'
export type PacingStatus = 'ok' | 'atencao' | 'risco' | 'estourado'
export type Confidence = 'low' | 'normal' | 'final'

export const ACCOUNT_KINDS: AccountKind[] = [
  'checking',
  'savings',
  'brokerage',
  'credit_card',
  'cash',
]

export interface DailySpendRow {
  /** YYYY-MM-DD */
  date: string
  accountType: AccountKind
  categoryId: string | null
  /** Positivo, já normalizado pela query. */
  cents: number
}

export interface BudgetCap {
  categoryId: string
  plannedCents: number
}

export interface BudgetPacingInput {
  daily: DailySpendRow[]
  budgets: BudgetCap[]
  /** Primeiro dia do mês analisado. */
  monthStart: Date
  today: Date
}

export interface BudgetPacingResult {
  series: {
    date: string
    /** Acumulados desde o dia 1 do mês. */
    byAccountTypeCum: Record<AccountKind, number>
    budgetedCum: number
    unbudgetedCum: number
  }[]
  total: {
    plannedCents: number
    spentCents: number
    unbudgetedCents: number
    projectedCents: number
    confidence: Confidence
    daysElapsed: number
    daysInMonth: number
  }
  byCategory: {
    categoryId: string
    plannedCents: number
    spentCents: number
    projectedCents: number
    status: PacingStatus
  }[]
}

/** YYYY-MM-DD a partir de um Date, sempre em UTC. */
export function toISODate(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function emptyByAccountType(): Record<AccountKind, number> {
  return { checking: 0, savings: 0, brokerage: 0, credit_card: 0, cash: 0 }
}

export function computeBudgetPacing(input: BudgetPacingInput): BudgetPacingResult {
  const { monthStart } = input
  const year = monthStart.getUTCFullYear()
  const month = monthStart.getUTCMonth()
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()

  const series: BudgetPacingResult['series'] = []
  for (let day = 1; day <= daysInMonth; day++) {
    series.push({
      date: toISODate(new Date(Date.UTC(year, month, day))),
      byAccountTypeCum: emptyByAccountType(),
      budgetedCum: 0,
      unbudgetedCum: 0,
    })
  }

  return {
    series,
    total: {
      plannedCents: 0,
      spentCents: 0,
      unbudgetedCents: 0,
      projectedCents: 0,
      confidence: 'low',
      daysElapsed: 0,
      daysInMonth,
    },
    byCategory: [],
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm --filter @floow/core-finance exec vitest run src/__tests__/budget-pacing.test.ts`
Expected: PASS (1 teste)

- [ ] **Step 5: Commit**

```bash
git add packages/core-finance/src/budget-pacing.ts packages/core-finance/src/__tests__/budget-pacing.test.ts
git commit -m "feat(budget): contrato e tipos de computeBudgetPacing"
```

---

### Task 2: Série diária acumulada com split por tipo de conta

**Files:**
- Modify: `packages/core-finance/src/budget-pacing.ts`
- Test: `packages/core-finance/src/__tests__/budget-pacing.test.ts`

**Interfaces:**
- Consumes: `computeBudgetPacing`, `DailySpendRow`, `toISODate` da Task 1
- Produces: `series[].byAccountTypeCum` preenchido e acumulado. As tasks 3 a 5 leem os mesmos `daily` rows mas não alteram `series`.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar ao mesmo `describe` em `budget-pacing.test.ts`:

```ts
  it('acumula gasto por tipo de conta ao longo dos dias', () => {
    const result = computeBudgetPacing({
      daily: [
        { date: '2026-09-01', accountType: 'credit_card', categoryId: 'a', cents: 10000 },
        { date: '2026-09-03', accountType: 'credit_card', categoryId: 'a', cents: 5000 },
        { date: '2026-09-03', accountType: 'checking', categoryId: 'a', cents: 2000 },
      ],
      budgets: [],
      monthStart: utc(2026, 9, 1),
      today: utc(2026, 9, 12),
    })

    const d1 = result.series[0]
    const d2 = result.series[1]
    const d3 = result.series[2]

    expect(d1.byAccountTypeCum.credit_card).toBe(10000)
    // Dia sem transação mantém o acumulado do dia anterior.
    expect(d2.byAccountTypeCum.credit_card).toBe(10000)
    expect(d3.byAccountTypeCum.credit_card).toBe(15000)
    expect(d3.byAccountTypeCum.checking).toBe(2000)
    expect(d3.byAccountTypeCum.savings).toBe(0)
    // O último dia carrega o total do mês.
    expect(result.series[29].byAccountTypeCum.credit_card).toBe(15000)
  })

  it('ignora linhas cuja data cai fora do mês analisado', () => {
    const result = computeBudgetPacing({
      daily: [
        { date: '2026-08-31', accountType: 'checking', categoryId: 'a', cents: 99900 },
        { date: '2026-10-01', accountType: 'checking', categoryId: 'a', cents: 88800 },
        { date: '2026-09-05', accountType: 'checking', categoryId: 'a', cents: 1000 },
      ],
      budgets: [],
      monthStart: utc(2026, 9, 1),
      today: utc(2026, 9, 12),
    })

    expect(result.series[29].byAccountTypeCum.checking).toBe(1000)
  })
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm --filter @floow/core-finance exec vitest run src/__tests__/budget-pacing.test.ts`
Expected: FAIL — recebe 0, esperava 10000

- [ ] **Step 3: Implementar a acumulação**

Em `budget-pacing.ts`, substituir o corpo de `computeBudgetPacing` entre a criação de `series` e o `return`. O laço que criava `series` passa a indexar por data, e um segundo laço acumula:

```ts
  // Índice: YYYY-MM-DD -> posição em series
  const indexByDate = new Map<string, number>()
  const series: BudgetPacingResult['series'] = []
  for (let day = 1; day <= daysInMonth; day++) {
    const date = toISODate(new Date(Date.UTC(year, month, day)))
    indexByDate.set(date, series.length)
    series.push({
      date,
      byAccountTypeCum: emptyByAccountType(),
      budgetedCum: 0,
      unbudgetedCum: 0,
    })
  }

  // Soma cada linha no seu dia; linhas fora do mês são ignoradas.
  for (const row of input.daily) {
    const idx = indexByDate.get(row.date)
    if (idx === undefined) continue
    series[idx].byAccountTypeCum[row.accountType] += row.cents
  }

  // Converte os totais diários em acumulados.
  for (let i = 1; i < series.length; i++) {
    for (const kind of ACCOUNT_KINDS) {
      series[i].byAccountTypeCum[kind] += series[i - 1].byAccountTypeCum[kind]
    }
  }
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm --filter @floow/core-finance exec vitest run src/__tests__/budget-pacing.test.ts`
Expected: PASS (3 testes)

- [ ] **Step 5: Commit**

```bash
git add packages/core-finance/src/budget-pacing.ts packages/core-finance/src/__tests__/budget-pacing.test.ts
git commit -m "feat(budget): serie diaria acumulada por tipo de conta"
```

---

### Task 3: Separação entre gasto orçado e não orçado

**Files:**
- Modify: `packages/core-finance/src/budget-pacing.ts`
- Test: `packages/core-finance/src/__tests__/budget-pacing.test.ts`

**Interfaces:**
- Consumes: tudo das Tasks 1 e 2
- Produces: `total.plannedCents`, `total.spentCents`, `total.unbudgetedCents`, e `series[].budgetedCum` / `series[].unbudgetedCum`. A Task 4 projeta a partir de `total.spentCents`; a Task 5 usa o mesmo mapa de tetos.

Regra da spec (D5): só categorias **com teto** entram em `spentCents`. Teto zero ou ausente conta como não orçado.

- [ ] **Step 1: Escrever o teste que falha**

```ts
  it('separa gasto orcado de nao orcado, incluindo transacao sem categoria', () => {
    const result = computeBudgetPacing({
      daily: [
        { date: '2026-09-02', accountType: 'checking', categoryId: 'alim', cents: 30000 },
        { date: '2026-09-02', accountType: 'checking', categoryId: 'saude', cents: 20000 },
        { date: '2026-09-02', accountType: 'cash', categoryId: null, cents: 5000 },
      ],
      budgets: [{ categoryId: 'alim', plannedCents: 100000 }],
      monthStart: utc(2026, 9, 1),
      today: utc(2026, 9, 12),
    })

    expect(result.total.plannedCents).toBe(100000)
    expect(result.total.spentCents).toBe(30000)
    // 'saude' nao tem teto e o gasto em dinheiro nao tem categoria.
    expect(result.total.unbudgetedCents).toBe(25000)
    expect(result.series[1].budgetedCum).toBe(30000)
    expect(result.series[1].unbudgetedCum).toBe(25000)
  })

  it('trata teto zero como categoria sem teto', () => {
    const result = computeBudgetPacing({
      daily: [{ date: '2026-09-02', accountType: 'checking', categoryId: 'lazer', cents: 7000 }],
      budgets: [{ categoryId: 'lazer', plannedCents: 0 }],
      monthStart: utc(2026, 9, 1),
      today: utc(2026, 9, 12),
    })

    expect(result.total.plannedCents).toBe(0)
    expect(result.total.spentCents).toBe(0)
    expect(result.total.unbudgetedCents).toBe(7000)
    expect(result.byCategory).toEqual([])
  })
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm --filter @floow/core-finance exec vitest run src/__tests__/budget-pacing.test.ts`
Expected: FAIL — `total.plannedCents` recebe 0, esperava 100000

- [ ] **Step 3: Implementar a separação**

Antes do laço que soma as linhas, construir o mapa de tetos:

```ts
  // Teto zero ou ausente = categoria não orçada (spec D5).
  const capByCategory = new Map<string, number>()
  for (const b of input.budgets) {
    if (b.plannedCents > 0) capByCategory.set(b.categoryId, b.plannedCents)
  }
```

No laço que soma as linhas em `series`, acrescentar a separação:

```ts
  for (const row of input.daily) {
    const idx = indexByDate.get(row.date)
    if (idx === undefined) continue
    series[idx].byAccountTypeCum[row.accountType] += row.cents

    const isBudgeted = row.categoryId !== null && capByCategory.has(row.categoryId)
    if (isBudgeted) series[idx].budgetedCum += row.cents
    else series[idx].unbudgetedCum += row.cents
  }
```

No laço de acumulação, acrescentar os dois campos:

```ts
  for (let i = 1; i < series.length; i++) {
    for (const kind of ACCOUNT_KINDS) {
      series[i].byAccountTypeCum[kind] += series[i - 1].byAccountTypeCum[kind]
    }
    series[i].budgetedCum += series[i - 1].budgetedCum
    series[i].unbudgetedCum += series[i - 1].unbudgetedCum
  }
```

E no `return`, trocar os zeros correspondentes:

```ts
  const last = series[series.length - 1]
  let plannedCents = 0
  for (const planned of capByCategory.values()) plannedCents += planned
```

`total.plannedCents` passa a ser `plannedCents`, `total.spentCents` passa a ser `last.budgetedCum`, e `total.unbudgetedCents` passa a ser `last.unbudgetedCum`.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm --filter @floow/core-finance exec vitest run src/__tests__/budget-pacing.test.ts`
Expected: PASS (5 testes)

- [ ] **Step 5: Commit**

```bash
git add packages/core-finance/src/budget-pacing.ts packages/core-finance/src/__tests__/budget-pacing.test.ts
git commit -m "feat(budget): separa gasto orcado de nao orcado"
```

---

### Task 4: Dias decorridos, projeção e confiança

**Files:**
- Modify: `packages/core-finance/src/budget-pacing.ts`
- Test: `packages/core-finance/src/__tests__/budget-pacing.test.ts`

**Interfaces:**
- Consumes: tudo das Tasks 1 a 3
- Produces: `total.daysElapsed`, `total.projectedCents`, `total.confidence`, e a função interna `project(spentCents: number): number` que a Task 5 reutiliza para projetar cada categoria.

Regra da spec — três casos, definidos pela posição de `today` em relação ao mês de `monthStart`:

| Caso | `daysElapsed` | Projeção |
|---|---|---|
| Mês corrente | dia de `today` | `spent ÷ daysElapsed × daysInMonth` |
| Mês passado | `daysInMonth` | `= spent` |
| Mês futuro | `0` | `0` |

- [ ] **Step 1: Escrever o teste que falha**

```ts
  const umPorDia = (dias: number, centsPorDia: number) =>
    Array.from({ length: dias }, (_, i) => ({
      date: `2026-09-${String(i + 1).padStart(2, '0')}`,
      accountType: 'checking' as const,
      categoryId: 'alim',
      cents: centsPorDia,
    }))

  it('projeta o fechamento pelo ritmo corrente no mes em andamento', () => {
    // 12 dias de setembro, R$ 100,00 por dia = 120000 acumulado.
    const result = computeBudgetPacing({
      daily: umPorDia(12, 10000),
      budgets: [{ categoryId: 'alim', plannedCents: 250000 }],
      monthStart: utc(2026, 9, 1),
      today: utc(2026, 9, 12),
    })

    expect(result.total.daysElapsed).toBe(12)
    expect(result.total.spentCents).toBe(120000)
    // 120000 / 12 * 30 = 300000
    expect(result.total.projectedCents).toBe(300000)
    expect(result.total.confidence).toBe('normal')
  })

  it('marca confianca baixa antes do dia 7', () => {
    const result = computeBudgetPacing({
      daily: umPorDia(3, 10000),
      budgets: [{ categoryId: 'alim', plannedCents: 250000 }],
      monthStart: utc(2026, 9, 1),
      today: utc(2026, 9, 3),
    })

    expect(result.total.daysElapsed).toBe(3)
    expect(result.total.confidence).toBe('low')
    expect(result.total.projectedCents).toBe(300000)
  })

  it('no dia 1 projeta sem dividir por zero', () => {
    const result = computeBudgetPacing({
      daily: umPorDia(1, 10000),
      budgets: [{ categoryId: 'alim', plannedCents: 250000 }],
      monthStart: utc(2026, 9, 1),
      today: utc(2026, 9, 1),
    })

    expect(result.total.daysElapsed).toBe(1)
    expect(result.total.projectedCents).toBe(300000)
    expect(Number.isFinite(result.total.projectedCents)).toBe(true)
  })

  it('em mes encerrado a projecao iguala o realizado', () => {
    const result = computeBudgetPacing({
      daily: umPorDia(30, 10000),
      budgets: [{ categoryId: 'alim', plannedCents: 250000 }],
      monthStart: utc(2026, 9, 1),
      today: utc(2026, 10, 15),
    })

    expect(result.total.daysElapsed).toBe(30)
    expect(result.total.spentCents).toBe(300000)
    expect(result.total.projectedCents).toBe(300000)
    expect(result.total.confidence).toBe('final')
  })

  it('em mes futuro zera dias decorridos e projecao', () => {
    const result = computeBudgetPacing({
      daily: [],
      budgets: [{ categoryId: 'alim', plannedCents: 250000 }],
      monthStart: utc(2026, 12, 1),
      today: utc(2026, 9, 12),
    })

    expect(result.total.daysElapsed).toBe(0)
    expect(result.total.projectedCents).toBe(0)
    expect(result.total.confidence).toBe('low')
    expect(result.total.daysInMonth).toBe(31)
  })

  it('conta 28 dias em fevereiro nao bissexto e 31 em janeiro', () => {
    const fev = computeBudgetPacing({
      daily: [], budgets: [], monthStart: utc(2026, 2, 1), today: utc(2026, 2, 10),
    })
    const jan = computeBudgetPacing({
      daily: [], budgets: [], monthStart: utc(2026, 1, 1), today: utc(2026, 1, 10),
    })

    expect(fev.total.daysInMonth).toBe(28)
    expect(fev.series).toHaveLength(28)
    expect(jan.total.daysInMonth).toBe(31)
  })
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm --filter @floow/core-finance exec vitest run src/__tests__/budget-pacing.test.ts`
Expected: FAIL — `total.daysElapsed` recebe 0, esperava 12

- [ ] **Step 3: Implementar dias decorridos, projeção e confiança**

Logo após calcular `daysInMonth`, acrescentar:

```ts
  // Comparação puramente por data em UTC, sem componente de hora.
  const monthStartMs = Date.UTC(year, month, 1)
  const monthEndMs = Date.UTC(year, month, daysInMonth)
  const todayMs = Date.UTC(
    input.today.getUTCFullYear(),
    input.today.getUTCMonth(),
    input.today.getUTCDate(),
  )

  const isFutureMonth = todayMs < monthStartMs
  const isPastMonth = todayMs > monthEndMs

  const daysElapsed = isFutureMonth ? 0 : isPastMonth ? daysInMonth : input.today.getUTCDate()

  const confidence: Confidence = isPastMonth
    ? 'final'
    : daysElapsed < LOW_CONFIDENCE_DAY_CUTOFF
      ? 'low'
      : 'normal'

  /** Extrapola o gasto acumulado para o mês inteiro pelo ritmo corrente. */
  const project = (spentCents: number): number => {
    if (daysElapsed === 0) return 0
    if (isPastMonth) return spentCents
    return Math.round((spentCents / daysElapsed) * daysInMonth)
  }
```

No `return`, `total.projectedCents` passa a ser `project(last.budgetedCum)`, e `daysElapsed` e `confidence` passam a usar as variáveis acima.

Nota: mês futuro cai em `daysElapsed === 0`, portanto `confidence` fica `'low'` — coerente com a spec, já que não há base nenhuma para projetar.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm --filter @floow/core-finance exec vitest run src/__tests__/budget-pacing.test.ts`
Expected: PASS (11 testes)

- [ ] **Step 5: Commit**

```bash
git add packages/core-finance/src/budget-pacing.ts packages/core-finance/src/__tests__/budget-pacing.test.ts
git commit -m "feat(budget): projecao por ritmo com nivel de confianca"
```

---

### Task 5: Status por categoria

**Files:**
- Modify: `packages/core-finance/src/budget-pacing.ts`
- Test: `packages/core-finance/src/__tests__/budget-pacing.test.ts`

**Interfaces:**
- Consumes: `capByCategory` (Task 3), `project()` (Task 4)
- Produces: `byCategory[]` completo, com `categoryId`, `plannedCents`, `spentCents`, `projectedCents` e `status`. É o formato que a fatia 2.4 grava em `cfo_insights.metric`.

Regra da spec, avaliada nesta ordem — o primeiro que casar vence:

| Status | Condição |
|---|---|
| `estourado` | `spentCents > plannedCents` |
| `risco` | `projectedCents > plannedCents * RISK_THRESHOLD` |
| `atencao` | `projectedCents > plannedCents` |
| `ok` | caso contrário |

- [ ] **Step 1: Escrever o teste que falha**

```ts
  const noDia = (dia: number, categoryId: string, cents: number) => ({
    date: `2026-09-${String(dia).padStart(2, '0')}`,
    accountType: 'credit_card' as const,
    categoryId,
    cents,
  })

  it('classifica cada categoria e inclui as que nao tiveram gasto', () => {
    const result = computeBudgetPacing({
      daily: [
        // Realizado ja acima do teto -> estourado.
        noDia(5, 'lazer', 60000),
        // 120000 em 12 dias -> projeta 300000 contra teto 250000 = 120% -> risco.
        noDia(5, 'alim', 120000),
        // 40000 em 12 dias -> projeta 100000 contra teto 95000 = 105% -> atencao.
        noDia(5, 'transp', 40000),
      ],
      budgets: [
        { categoryId: 'lazer', plannedCents: 50000 },
        { categoryId: 'alim', plannedCents: 250000 },
        { categoryId: 'transp', plannedCents: 95000 },
        { categoryId: 'moradia', plannedCents: 200000 },
      ],
      monthStart: utc(2026, 9, 1),
      today: utc(2026, 9, 12),
    })

    const by = Object.fromEntries(result.byCategory.map((c) => [c.categoryId, c]))

    expect(by.lazer.status).toBe('estourado')
    expect(by.alim.status).toBe('risco')
    expect(by.alim.projectedCents).toBe(300000)
    expect(by.transp.status).toBe('atencao')
    // Categoria com teto e sem gasto continua na lista, como ok.
    expect(by.moradia.status).toBe('ok')
    expect(by.moradia.spentCents).toBe(0)
    expect(result.byCategory).toHaveLength(4)
  })

  it('estourado vence mesmo quando a projecao esta abaixo do teto', () => {
    // Gasto concentrado no dia 1 de um mes ja encerrado: projecao = realizado.
    const result = computeBudgetPacing({
      daily: [noDia(1, 'lazer', 51000)],
      budgets: [{ categoryId: 'lazer', plannedCents: 50000 }],
      monthStart: utc(2026, 9, 1),
      today: utc(2026, 10, 5),
    })

    expect(result.byCategory[0].status).toBe('estourado')
  })

  it('respeita as fronteiras exatas de 100% e 110%', () => {
    // 10000 em 10 dias -> projeta 30000. Teto 30000 = exatamente 100% -> ok.
    const emCima = computeBudgetPacing({
      daily: [noDia(1, 'x', 10000)],
      budgets: [{ categoryId: 'x', plannedCents: 30000 }],
      monthStart: utc(2026, 9, 1),
      today: utc(2026, 9, 10),
    })
    expect(emCima.byCategory[0].projectedCents).toBe(30000)
    expect(emCima.byCategory[0].status).toBe('ok')

    // Mesma projecao contra teto 27273 -> 110,0% -> ainda atencao, nao risco.
    const noLimite = computeBudgetPacing({
      daily: [noDia(1, 'x', 10000)],
      budgets: [{ categoryId: 'x', plannedCents: 27273 }],
      monthStart: utc(2026, 9, 1),
      today: utc(2026, 9, 10),
    })
    expect(noLimite.byCategory[0].status).toBe('atencao')
  })

  it('em mes futuro nenhuma categoria recebe alerta', () => {
    const result = computeBudgetPacing({
      daily: [],
      budgets: [{ categoryId: 'alim', plannedCents: 250000 }],
      monthStart: utc(2026, 12, 1),
      today: utc(2026, 9, 12),
    })

    expect(result.byCategory[0].status).toBe('ok')
    expect(result.byCategory[0].projectedCents).toBe(0)
  })
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm --filter @floow/core-finance exec vitest run src/__tests__/budget-pacing.test.ts`
Expected: FAIL — `result.byCategory` está vazio

- [ ] **Step 3: Implementar o status por categoria**

Acrescentar, antes do `return`:

```ts
  // Gasto do mês por categoria, apenas para as categorias com teto.
  const spentByCategory = new Map<string, number>()
  for (const row of input.daily) {
    if (row.categoryId === null) continue
    if (!indexByDate.has(row.date)) continue
    if (!capByCategory.has(row.categoryId)) continue
    spentByCategory.set(row.categoryId, (spentByCategory.get(row.categoryId) ?? 0) + row.cents)
  }

  const byCategory: BudgetPacingResult['byCategory'] = []
  for (const [categoryId, plannedCents] of capByCategory) {
    const spentCents = spentByCategory.get(categoryId) ?? 0
    const projectedCents = project(spentCents)

    let status: PacingStatus
    if (spentCents > plannedCents) status = 'estourado'
    else if (projectedCents > plannedCents * RISK_THRESHOLD) status = 'risco'
    else if (projectedCents > plannedCents) status = 'atencao'
    else status = 'ok'

    byCategory.push({ categoryId, plannedCents, spentCents, projectedCents, status })
  }
```

No `return`, `byCategory` passa a ser a variável acima em vez de `[]`.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm --filter @floow/core-finance exec vitest run src/__tests__/budget-pacing.test.ts`
Expected: PASS (15 testes)

- [ ] **Step 5: Rodar a suíte inteira do pacote e o typecheck**

Run: `pnpm --filter @floow/core-finance test`
Expected: PASS — nenhum teste pré-existente quebrado

Run: `pnpm --filter @floow/core-finance typecheck`
Expected: sem erros

- [ ] **Step 6: Commit**

```bash
git add packages/core-finance/src/budget-pacing.ts packages/core-finance/src/__tests__/budget-pacing.test.ts
git commit -m "feat(budget): status por categoria com limiares nomeados"
```

---

### Task 6: Exportar o módulo no pacote

**Files:**
- Modify: `packages/core-finance/src/index.ts`

**Interfaces:**
- Consumes: `packages/core-finance/src/budget-pacing.ts` (Tasks 1 a 5)
- Produces: `computeBudgetPacing` e seus tipos importáveis via `@floow/core-finance`. A Task 7 e a fatia 2.3 dependem deste export.

- [ ] **Step 1: Acrescentar o export**

Ao final de `packages/core-finance/src/index.ts`, seguindo o padrão de comentário por fase já usado no arquivo:

```ts
// Pacing de orçamento — orçado x realizado diário
export * from './budget-pacing'
```

- [ ] **Step 2: Verificar que o símbolo resolve pelo entrypoint do pacote**

Run: `pnpm --filter @floow/core-finance typecheck`
Expected: sem erros

Run: `pnpm --filter @floow/web typecheck`
Expected: sem erros. Esta é a verificação que vale: o pacote é consumido como TypeScript direto (`package.json` do pacote aponta `main` e `types` para `./src/index.ts`, sem etapa de build), então o typecheck do app é o que prova que o símbolo resolve pelo entrypoint.

- [ ] **Step 3: Commit**

```bash
git add packages/core-finance/src/index.ts
git commit -m "feat(budget): exporta budget-pacing no entrypoint do pacote"
```

---

### Task 7: Query agregada por dia, tipo de conta e categoria

**Files:**
- Create: `apps/web/lib/finance/budget-daily-queries.ts`
- Read for reference: `apps/web/lib/finance/budget-queries.ts:131-160` (`getSpendingByCategory`, de onde vêm os filtros e o padrão de cache)

**Interfaces:**
- Consumes: `DailySpendRow` e `AccountKind` de `@floow/core-finance` (Task 6)
- Produces: `getDailySpending(orgId: string, start: Date, end: Date): Promise<DailySpendRow[]>` — consumida pela fatia 2.3 (tela), que não faz parte deste plano.

Esta task **não tem teste unitário**. O repo mocka `@floow/db` com `vi.mock` (`apps/web/__tests__/finance/actions.test.ts`), o que para uma query com `INNER JOIN` e `GROUP BY` testaria o mock, não a query. A verificação é o typecheck mais o invariante de reconciliação do Step 3.

- [ ] **Step 1: Escrever a query**

Criar `apps/web/lib/finance/budget-daily-queries.ts`:

```ts
import { unstable_cache } from 'next/cache'
import { cache } from 'react'
import { and, eq, gte, lte, sql } from 'drizzle-orm'
import { getDb, transactions, accounts } from '@floow/db'
import type { DailySpendRow, AccountKind } from '@floow/core-finance'
import { budgetSpendingTag } from '@/lib/cache-tags'

/**
 * Gasto diário agregado por dia, tipo de conta e categoria, no intervalo dado.
 *
 * Despesas são persistidas com valor negativo (ver actions.ts:301), por isso a
 * soma usa -amount_cents: o resultado sai positivo e um estorno importado como
 * expense positivo abate corretamente.
 *
 * Função irmã de getSpendingByCategory, não substituta — /budgets/spending
 * continua usando aquela.
 */
export const getDailySpending = cache(async function getDailySpending(
  orgId: string,
  start: Date,
  end: Date,
): Promise<DailySpendRow[]> {
  return unstable_cache(
    async () => {
      const db = getDb()

      const rows = await db
        .select({
          date: sql<string>`to_char(${transactions.date}, 'YYYY-MM-DD')`.as('date'),
          accountType: accounts.type,
          categoryId: transactions.categoryId,
          cents: sql<number>`SUM(-${transactions.amountCents})`.as('cents'),
        })
        .from(transactions)
        .innerJoin(accounts, eq(transactions.accountId, accounts.id))
        .where(
          and(
            eq(transactions.orgId, orgId),
            eq(transactions.type, 'expense'),
            eq(transactions.isIgnored, false),
            gte(transactions.date, start),
            lte(transactions.date, end),
          ),
        )
        .groupBy(sql`1`, accounts.type, transactions.categoryId)

      return rows.map((r) => ({
        date: r.date,
        accountType: r.accountType as AccountKind,
        categoryId: r.categoryId,
        cents: Number(r.cents),
      }))
    },
    ['budget-daily-spending', orgId, start.toISOString(), end.toISOString()],
    { tags: [budgetSpendingTag(orgId)], revalidate: 300 },
  )()
})
```

`budgetSpendingTag` já é exportada de `apps/web/lib/cache-tags.ts:68` e é a mesma tag que `budget-actions.ts:42` e `recurring-actions.ts:378` invalidam ao criar ou editar transação. Reusá-la é o que faz o cache da query nova se invalidar sozinho, sem código novo. **Nenhum arquivo de cache-tags precisa ser modificado.**

- [ ] **Step 2: Verificar tipos**

Run: `pnpm --filter @floow/web typecheck`
Expected: sem erros

- [ ] **Step 3: Verificar o invariante de reconciliação**

Esta é a verificação que substitui o teste unitário: a soma da query nova, no mesmo intervalo, tem que bater com a da query antiga. Roda-se em SQL direto, porque o repo não tem runner de TypeScript avulso (`package.json` só define `dev`, `build`, `lint`, `typecheck`, `test` via turbo).

Substituir `<ORG_ID>` por uma org real do banco de desenvolvimento e ajustar o intervalo para um mês com movimento:

```sql
SELECT
  (SELECT COALESCE(SUM(-t.amount_cents), 0)
     FROM transactions t
     JOIN accounts a ON a.id = t.account_id
    WHERE t.org_id = '<ORG_ID>' AND t.type = 'expense' AND t.is_ignored = false
      AND t.date >= '2026-09-01' AND t.date <= '2026-09-30') AS total_query_nova,
  (SELECT COALESCE(SUM(ABS(t.amount_cents)), 0)
     FROM transactions t
    WHERE t.org_id = '<ORG_ID>' AND t.type = 'expense' AND t.is_ignored = false
      AND t.date >= '2026-09-01' AND t.date <= '2026-09-30') AS total_query_antiga,
  (SELECT COUNT(*)
     FROM transactions t
    WHERE t.org_id = '<ORG_ID>' AND t.type = 'expense' AND t.is_ignored = false
      AND t.amount_cents > 0) AS despesas_com_sinal_positivo;
```

Run: `psql "$DATABASE_URL" -f <arquivo>` — ou colar no SQL Editor do Supabase.

Expected:
- `total_query_nova` igual a `total_query_antiga`. Divergência aqui significa que o `INNER JOIN` com `accounts` está descartando linhas (transação apontando para conta inexistente) — investigar antes de seguir.
- `despesas_com_sinal_positivo` igual a `0`. É a confirmação de que `ABS(x)` e `-x` são equivalentes para os dados atuais, que é a premissa da Task 8. Se for maior que zero, essas linhas já estão sendo contadas com sinal trocado hoje e a Task 8 vai **corrigir** o número exibido em `/budgets/spending` — o que precisa ser sinalizado ao usuário antes de commitar, porque deixa de ser mudança neutra.

Nenhum arquivo é criado nesta etapa.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/finance/budget-daily-queries.ts apps/web/lib/finance/budget-queries.ts
git commit -m "feat(budget): query de gasto diario por conta e categoria"
```

---

### Task 8: Alinhar a convenção de sinal em getSpendingByCategory

**Files:**
- Modify: `apps/web/lib/finance/budget-queries.ts:139` (a expressão `SUM(ABS(...))` dentro de `getSpendingByCategory`)

**Interfaces:**
- Consumes: nada
- Produces: nenhuma mudança de assinatura. `getSpendingByCategory` continua retornando `{ categoryId, spent }[]`.

Mudança de uma linha, descrita na spec em "Dívida corrigida no caminho". O ganho é evitar que `/budgets/spending` e `/budgets/pacing` divirjam quando o subsistema 1 importar um estorno como `expense` positivo.

**Pré-condição:** a Task 7, Step 3 já confirmou que `despesas_com_sinal_positivo` é `0`. Só nessa condição a mudança é neutra para os dados existentes. Se aquela contagem tiver dado maior que zero, **parar e falar com o usuário antes de commitar** — a troca passa a alterar números já exibidos em `/budgets/spending`, e isso é decisão dele, não da implementação.

- [ ] **Step 1: Trocar a expressão**

Em `apps/web/lib/finance/budget-queries.ts`, dentro de `getSpendingByCategory`, trocar:

```ts
          spent: sql<number>`SUM(ABS(${transactions.amountCents}))`.as('spent'),
```

por:

```ts
          spent: sql<number>`SUM(-${transactions.amountCents})`.as('spent'),
```

- [ ] **Step 2: Verificar que a tela existente não mudou**

Run: `pnpm --filter @floow/web typecheck`
Expected: sem erros

Run: `pnpm --filter @floow/web test`
Expected: PASS — nenhum teste pré-existente quebrado

Abrir `/budgets/spending` no mês corrente e confirmar que os valores exibidos são os mesmos de antes da mudança.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/finance/budget-queries.ts
git commit -m "fix(budget): alinha convencao de sinal em getSpendingByCategory"
```

---

## Fora do escopo deste plano

As fatias seguintes da spec ficam para planos próprios:

- **2.3 — Tela `/budgets/pacing`**: exige carregar a skill `dataviz` antes da primeira linha de código de gráfico.
- **2.4 — Analyzer CFO**: liga `computeBudgetPacing` ao cron diário que já roda, gravando em `cfo_insights.metric`.
