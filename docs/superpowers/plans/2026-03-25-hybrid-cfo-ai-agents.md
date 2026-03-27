# Hybrid CFO — AI Agents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a hybrid CFO that delivers daily financial insights via deterministic rules + LLM synthesis, with dashboard cards and a dedicated /cfo page.

**Architecture:** 3-layer system — deterministic analyzers (pure functions in core-finance) produce structured insights, an optional LLM layer synthesizes/correlates them, and the UI renders prioritized cards with drill-down and actionable suggestions. Rollout in 3 phases: rules engine, LLM integration, event triggers.

**Tech Stack:** Next.js 15 (App Router, RSC), Drizzle ORM, Supabase (PostgreSQL + Auth + pg_cron), Vitest, shadcn/ui, Anthropic/OpenAI SDK (Phase 2).

**Spec:** `docs/superpowers/specs/2026-03-25-hybrid-cfo-ai-agents-design.md`

---

## Phase 1 — Rules Engine + UI (sem LLM)

---

### Task 1: CFO Types and Shared Interfaces

**Files:**
- Create: `packages/core-finance/src/cfo/types.ts`

- [ ] **Step 1: Create CFO types file**

```typescript
// packages/core-finance/src/cfo/types.ts

/** Insight categories matching the 7 analyzers */
export type InsightCategory =
  | 'cash_flow'
  | 'budget'
  | 'debt'
  | 'investment'
  | 'patrimony'
  | 'retirement'
  | 'behavior'

/** Severity levels ordered by priority */
export type InsightSeverity = 'critical' | 'warning' | 'info' | 'positive'

/** Output of a single analyzer rule */
export interface InsightResult {
  type: string
  category: InsightCategory
  severity: InsightSeverity
  title: string
  body: string
  metric: Record<string, number>
  suggestedAction?: {
    type: string
    params: Record<string, unknown>
  }
}

// -- Analyzer Inputs (one per analyzer, pure function contracts) --

export interface CashFlowAnalyzerInput {
  monthlyTotals: { month: string; income: number; expense: number }[]
  accountBalances: { accountId: string; name: string; balance: number }[]
}

export interface BudgetAnalyzerInput {
  goals: { category: string; limit: number; spent: number; period: string }[]
  historicalUsage: { category: string; month: string; spent: number }[]
}

export interface DebtAnalyzerInput {
  debts: {
    name: string
    balance: number
    monthlyPayment: number
    interestRate: number
    isOverdraft: boolean
  }[]
  monthlyIncome: number
}

export interface InvestmentAnalyzerInput {
  positions: { asset: string; class: string; allocation: number; pnlPercent: number }[]
  totalInvested: number
  dividendsReceived: number
  dividendsExpected: number
}

export interface PatrimonyAnalyzerInput {
  snapshots: { month: string; netWorth: number; liquidAssets: number }[]
  fixedAssets: { name: string; currentValue: number; previousValue: number }[]
}

export interface RetirementAnalyzerInput {
  plan: {
    targetAge: number
    currentAge: number
    monthlyContribution: number
    desiredIncome: number
  } | null
  currentSavingsRate: number
  netWorth: number
}

export interface BehaviorAnalyzerInput {
  transactions: { date: string; amount: number; category: string; dayOfWeek: number }[]
  averageTransactionAmount: { current: number; previous: number }
}

// -- LLM Layer Types (used in Phase 2, defined now for forward-compatibility) --

export interface SynthesisInput {
  insights: InsightResult[]
  financialContext: {
    monthlyIncome: number
    monthlyExpenses: number
    netWorth: number
    debtTotal: number
    investmentTotal: number
    savingsRate: number
    topCategories: { name: string; amount: number }[]
  }
  locale: string
}

export interface SynthesisOutput {
  prioritizedInsights: {
    title: string
    body: string
    detailMarkdown: string
    correlatedWith?: string[]
  }[]
  dailySummary: string
}

export interface LLMProvider {
  synthesize(input: SynthesisInput): Promise<SynthesisOutput>
}
```

- [ ] **Step 2: Export from core-finance index**

Add to `packages/core-finance/src/index.ts`:

```typescript
// Phase 8 — CFO AI Agents
export * from './cfo/types'
```

- [ ] **Step 3: Verify build**

Run: `cd packages/core-finance && pnpm tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/core-finance/src/cfo/types.ts packages/core-finance/src/index.ts
git commit -m "feat(cfo): add shared types and analyzer input interfaces"
```

---

### Task 2: Cash Flow Analyzer

**Files:**
- Create: `packages/core-finance/src/cfo/analyzers/cash-flow.ts`
- Test: `packages/core-finance/src/__tests__/cfo/cash-flow-analyzer.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// packages/core-finance/src/__tests__/cfo/cash-flow-analyzer.test.ts
import { describe, it, expect } from 'vitest'
import { analyzeCashFlow } from '../../cfo/analyzers/cash-flow'
import type { CashFlowAnalyzerInput } from '../../cfo/types'

describe('analyzeCashFlow', () => {
  it('returns empty array when no data', () => {
    const input: CashFlowAnalyzerInput = { monthlyTotals: [], accountBalances: [] }
    expect(analyzeCashFlow(input)).toEqual([])
  })

  it('returns critical when expenses > income', () => {
    const input: CashFlowAnalyzerInput = {
      monthlyTotals: [{ month: '2026-03', income: 400000, expense: -450000 }],
      accountBalances: [],
    }
    const results = analyzeCashFlow(input)
    const found = results.find((r) => r.type === 'cash_flow_expenses_exceed_income')
    expect(found).toBeDefined()
    expect(found!.severity).toBe('critical')
  })

  it('returns warning when expenses > 90% of income', () => {
    const input: CashFlowAnalyzerInput = {
      monthlyTotals: [{ month: '2026-03', income: 500000, expense: -460000 }],
      accountBalances: [],
    }
    const results = analyzeCashFlow(input)
    const found = results.find((r) => r.type === 'cash_flow_high_expense_ratio')
    expect(found).toBeDefined()
    expect(found!.severity).toBe('warning')
  })

  it('returns warning for 3 consecutive months of growing expenses', () => {
    const input: CashFlowAnalyzerInput = {
      monthlyTotals: [
        { month: '2026-03', income: 500000, expense: -350000 },
        { month: '2026-02', income: 500000, expense: -300000 },
        { month: '2026-01', income: 500000, expense: -250000 },
      ],
      accountBalances: [],
    }
    const results = analyzeCashFlow(input)
    const found = results.find((r) => r.type === 'cash_flow_expense_trend_rising')
    expect(found).toBeDefined()
    expect(found!.severity).toBe('warning')
  })

  it('does not flag rising trend with only 2 months', () => {
    const input: CashFlowAnalyzerInput = {
      monthlyTotals: [
        { month: '2026-02', income: 500000, expense: -300000 },
        { month: '2026-01', income: 500000, expense: -250000 },
      ],
      accountBalances: [],
    }
    const results = analyzeCashFlow(input)
    expect(results.find((r) => r.type === 'cash_flow_expense_trend_rising')).toBeUndefined()
  })

  it('returns critical when account balance is negative', () => {
    const input: CashFlowAnalyzerInput = {
      monthlyTotals: [],
      accountBalances: [{ accountId: 'a1', name: 'Conta Corrente', balance: -5000 }],
    }
    const results = analyzeCashFlow(input)
    const found = results.find((r) => r.type === 'cash_flow_negative_balance')
    expect(found).toBeDefined()
    expect(found!.severity).toBe('critical')
  })

  it('returns no insights when finances are healthy', () => {
    const input: CashFlowAnalyzerInput = {
      monthlyTotals: [{ month: '2026-03', income: 500000, expense: -200000 }],
      accountBalances: [{ accountId: 'a1', name: 'Conta Corrente', balance: 100000 }],
    }
    expect(analyzeCashFlow(input)).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core-finance && pnpm vitest run src/__tests__/cfo/cash-flow-analyzer.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement analyzer**

```typescript
// packages/core-finance/src/cfo/analyzers/cash-flow.ts
import type { CashFlowAnalyzerInput, InsightResult } from '../types'

export function analyzeCashFlow(input: CashFlowAnalyzerInput): InsightResult[] {
  const insights: InsightResult[] = []
  const { monthlyTotals, accountBalances } = input

  if (monthlyTotals.length === 0 && accountBalances.length === 0) return []

  // Most recent month analysis
  const sorted = [...monthlyTotals].sort((a, b) => b.month.localeCompare(a.month))
  const current = sorted[0]

  if (current) {
    const absExpense = Math.abs(current.expense)
    const ratio = current.income > 0 ? absExpense / current.income : 0

    // Expenses exceed income
    if (current.income > 0 && absExpense > current.income) {
      insights.push({
        type: 'cash_flow_expenses_exceed_income',
        category: 'cash_flow',
        severity: 'critical',
        title: 'Gastos maiores que a receita',
        body: `Em ${current.month}, seus gastos (R$${(absExpense / 100).toFixed(0)}) superaram a receita (R$${(current.income / 100).toFixed(0)}).`,
        metric: { income: current.income, expense: current.expense, ratio: Math.round(ratio * 100) },
        suggestedAction: {
          type: 'view_transactions',
          params: { period: current.month },
        },
      })
    } else if (ratio > 0.9) {
      // Expenses > 90% of income
      insights.push({
        type: 'cash_flow_high_expense_ratio',
        category: 'cash_flow',
        severity: 'warning',
        title: 'Gastos próximos do limite da receita',
        body: `Seus gastos representam ${Math.round(ratio * 100)}% da receita em ${current.month}.`,
        metric: { income: current.income, expense: current.expense, ratio: Math.round(ratio * 100) },
        suggestedAction: {
          type: 'create_budget',
          params: {},
        },
      })
    }
  }

  // 3-month rising expense trend
  if (sorted.length >= 3) {
    const [m1, m2, m3] = sorted
    const e1 = Math.abs(m1.expense)
    const e2 = Math.abs(m2.expense)
    const e3 = Math.abs(m3.expense)

    if (e1 > e2 && e2 > e3) {
      const growthRate = e2 > 0 ? Math.round(((e1 - e2) / e2) * 100) : 0
      insights.push({
        type: 'cash_flow_expense_trend_rising',
        category: 'cash_flow',
        severity: 'warning',
        title: 'Tendência de gastos crescentes',
        body: `Seus gastos cresceram por 3 meses consecutivos. Último mês: +${growthRate}%.`,
        metric: {
          month1_expense: m1.expense,
          month2_expense: m2.expense,
          month3_expense: m3.expense,
          growthRate,
        },
      })
    }
  }

  // Negative account balances
  for (const account of accountBalances) {
    if (account.balance < 0) {
      insights.push({
        type: 'cash_flow_negative_balance',
        category: 'cash_flow',
        severity: 'critical',
        title: `Saldo negativo: ${account.name}`,
        body: `A conta "${account.name}" está com saldo negativo de R$${(Math.abs(account.balance) / 100).toFixed(2)}.`,
        metric: { balance: account.balance },
        suggestedAction: {
          type: 'view_account',
          params: { accountId: account.accountId },
        },
      })
    }
  }

  return insights
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/core-finance && pnpm vitest run src/__tests__/cfo/cash-flow-analyzer.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core-finance/src/cfo/analyzers/cash-flow.ts packages/core-finance/src/__tests__/cfo/cash-flow-analyzer.test.ts
git commit -m "feat(cfo): add cash flow analyzer with tests"
```

---

### Task 3: Budget Analyzer

**Files:**
- Create: `packages/core-finance/src/cfo/analyzers/budget.ts`
- Test: `packages/core-finance/src/__tests__/cfo/budget-analyzer.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// packages/core-finance/src/__tests__/cfo/budget-analyzer.test.ts
import { describe, it, expect } from 'vitest'
import { analyzeBudget } from '../../cfo/analyzers/budget'
import type { BudgetAnalyzerInput } from '../../cfo/types'

describe('analyzeBudget', () => {
  it('returns empty array when no goals', () => {
    expect(analyzeBudget({ goals: [], historicalUsage: [] })).toEqual([])
  })

  it('returns critical when budget is exceeded (>100%)', () => {
    const input: BudgetAnalyzerInput = {
      goals: [{ category: 'Alimentação', limit: 50000, spent: 55000, period: 'monthly' }],
      historicalUsage: [],
    }
    const results = analyzeBudget(input)
    const found = results.find((r) => r.type === 'budget_exceeded')
    expect(found).toBeDefined()
    expect(found!.severity).toBe('critical')
  })

  it('returns critical when spending > 120% of budget', () => {
    const input: BudgetAnalyzerInput = {
      goals: [{ category: 'Delivery', limit: 30000, spent: 37000, period: 'monthly' }],
      historicalUsage: [],
    }
    const results = analyzeBudget(input)
    const found = results.find((r) => r.type === 'budget_exceeded')
    expect(found).toBeDefined()
    expect(found!.severity).toBe('critical')
  })

  it('returns info when budget has consistent slack (<60% for 3 months)', () => {
    const input: BudgetAnalyzerInput = {
      goals: [{ category: 'Transporte', limit: 50000, spent: 20000, period: 'monthly' }],
      historicalUsage: [
        { category: 'Transporte', month: '2026-01', spent: 25000 },
        { category: 'Transporte', month: '2026-02', spent: 22000 },
        { category: 'Transporte', month: '2026-03', spent: 20000 },
      ],
    }
    const results = analyzeBudget(input)
    const found = results.find((r) => r.type === 'budget_consistent_slack')
    expect(found).toBeDefined()
    expect(found!.severity).toBe('info')
  })

  it('does not flag slack with only 2 months of history', () => {
    const input: BudgetAnalyzerInput = {
      goals: [{ category: 'Transporte', limit: 50000, spent: 20000, period: 'monthly' }],
      historicalUsage: [
        { category: 'Transporte', month: '2026-02', spent: 22000 },
        { category: 'Transporte', month: '2026-03', spent: 20000 },
      ],
    }
    const results = analyzeBudget(input)
    expect(results.find((r) => r.type === 'budget_consistent_slack')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core-finance && pnpm vitest run src/__tests__/cfo/budget-analyzer.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement analyzer**

```typescript
// packages/core-finance/src/cfo/analyzers/budget.ts
import type { BudgetAnalyzerInput, InsightResult } from '../types'

export function analyzeBudget(input: BudgetAnalyzerInput): InsightResult[] {
  const insights: InsightResult[] = []
  const { goals, historicalUsage } = input

  if (goals.length === 0) return []

  for (const goal of goals) {
    const pct = goal.limit > 0 ? goal.spent / goal.limit : 0

    // Budget exceeded
    if (pct > 1) {
      insights.push({
        type: 'budget_exceeded',
        category: 'budget',
        severity: pct > 1.2 ? 'critical' : 'warning',
        title: `Orçamento estourado: ${goal.category}`,
        body: `Você gastou R$${(goal.spent / 100).toFixed(0)} de um limite de R$${(goal.limit / 100).toFixed(0)} (${Math.round(pct * 100)}%).`,
        metric: { limit: goal.limit, spent: goal.spent, pct: Math.round(pct * 100) },
        suggestedAction: {
          type: 'adjust_budget',
          params: { category: goal.category },
        },
      })
    }

    // Consistent slack: 3 months under 60%
    const catHistory = historicalUsage.filter((h) => h.category === goal.category)
    if (catHistory.length >= 3 && goal.limit > 0) {
      const allUnder60 = catHistory.every((h) => h.spent / goal.limit < 0.6)
      if (allUnder60) {
        const avgSpent = Math.round(catHistory.reduce((s, h) => s + h.spent, 0) / catHistory.length)
        insights.push({
          type: 'budget_consistent_slack',
          category: 'budget',
          severity: 'info',
          title: `Orçamento com folga: ${goal.category}`,
          body: `Nos últimos ${catHistory.length} meses, você gastou em média R$${(avgSpent / 100).toFixed(0)} de R$${(goal.limit / 100).toFixed(0)}. Considere realocar.`,
          metric: { limit: goal.limit, avgSpent, months: catHistory.length },
          suggestedAction: {
            type: 'adjust_budget',
            params: { category: goal.category },
          },
        })
      }
    }
  }

  return insights
}
```

- [ ] **Step 4: Run tests**

Run: `cd packages/core-finance && pnpm vitest run src/__tests__/cfo/budget-analyzer.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core-finance/src/cfo/analyzers/budget.ts packages/core-finance/src/__tests__/cfo/budget-analyzer.test.ts
git commit -m "feat(cfo): add budget analyzer with tests"
```

---

### Task 4: Debt Analyzer

**Files:**
- Create: `packages/core-finance/src/cfo/analyzers/debt.ts`
- Test: `packages/core-finance/src/__tests__/cfo/debt-analyzer.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// packages/core-finance/src/__tests__/cfo/debt-analyzer.test.ts
import { describe, it, expect } from 'vitest'
import { analyzeDebt } from '../../cfo/analyzers/debt'
import type { DebtAnalyzerInput } from '../../cfo/types'

describe('analyzeDebt', () => {
  it('returns empty array when no debts', () => {
    expect(analyzeDebt({ debts: [], monthlyIncome: 500000 })).toEqual([])
  })

  it('returns critical when interest cost > 30% of income', () => {
    const input: DebtAnalyzerInput = {
      debts: [
        { name: 'Empréstimo', balance: 10000000, monthlyPayment: 200000, interestRate: 0.12, isOverdraft: false },
      ],
      monthlyIncome: 500000,
    }
    const results = analyzeDebt(input)
    // Monthly interest = 10000000 * 0.12 / 12 = 100000 => 100000/500000 = 20% — not triggered
    expect(results.find((r) => r.type === 'debt_high_interest_cost')).toBeUndefined()
  })

  it('returns critical for active overdraft', () => {
    const input: DebtAnalyzerInput = {
      debts: [
        { name: 'Cheque Especial', balance: 200000, monthlyPayment: 50000, interestRate: 0.15, isOverdraft: true },
      ],
      monthlyIncome: 500000,
    }
    const results = analyzeDebt(input)
    const found = results.find((r) => r.type === 'debt_overdraft_active')
    expect(found).toBeDefined()
    expect(found!.severity).toBe('critical')
  })

  it('returns critical when total interest > 30% of income', () => {
    const input: DebtAnalyzerInput = {
      debts: [
        { name: 'Empréstimo A', balance: 5000000, monthlyPayment: 100000, interestRate: 0.24, isOverdraft: false },
        { name: 'Empréstimo B', balance: 3000000, monthlyPayment: 80000, interestRate: 0.36, isOverdraft: false },
      ],
      monthlyIncome: 500000,
    }
    // A: 5000000 * 0.24 / 12 = 100000
    // B: 3000000 * 0.36 / 12 = 90000
    // Total: 190000 / 500000 = 38% > 30%
    const results = analyzeDebt(input)
    expect(results.find((r) => r.type === 'debt_high_interest_cost')).toBeDefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core-finance && pnpm vitest run src/__tests__/cfo/debt-analyzer.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement analyzer**

```typescript
// packages/core-finance/src/cfo/analyzers/debt.ts
import type { DebtAnalyzerInput, InsightResult } from '../types'

export function analyzeDebt(input: DebtAnalyzerInput): InsightResult[] {
  const insights: InsightResult[] = []
  const { debts, monthlyIncome } = input

  if (debts.length === 0) return []

  // Overdraft check
  for (const debt of debts) {
    if (debt.isOverdraft && debt.balance > 0) {
      insights.push({
        type: 'debt_overdraft_active',
        category: 'debt',
        severity: 'critical',
        title: 'Cheque especial ativo',
        body: `Você está usando R$${(debt.balance / 100).toFixed(2)} do cheque especial "${debt.name}". Juros de cheque especial são os mais caros do mercado.`,
        metric: { balance: debt.balance, interestRate: debt.interestRate },
        suggestedAction: { type: 'view_debts', params: {} },
      })
    }
  }

  // Total interest cost vs income
  if (monthlyIncome > 0) {
    let totalMonthlyInterest = 0
    for (const debt of debts) {
      totalMonthlyInterest += (debt.balance * debt.interestRate) / 12
    }
    const interestRatio = totalMonthlyInterest / monthlyIncome

    if (interestRatio > 0.3) {
      insights.push({
        type: 'debt_high_interest_cost',
        category: 'debt',
        severity: 'critical',
        title: 'Juros consumindo mais de 30% da renda',
        body: `Você paga R$${(totalMonthlyInterest / 100).toFixed(0)}/mês em juros (${Math.round(interestRatio * 100)}% da receita).`,
        metric: {
          totalMonthlyInterest: Math.round(totalMonthlyInterest),
          monthlyIncome,
          ratio: Math.round(interestRatio * 100),
        },
        suggestedAction: { type: 'view_debts', params: {} },
      })
    }
  }

  return insights
}
```

- [ ] **Step 4: Run tests**

Run: `cd packages/core-finance && pnpm vitest run src/__tests__/cfo/debt-analyzer.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core-finance/src/cfo/analyzers/debt.ts packages/core-finance/src/__tests__/cfo/debt-analyzer.test.ts
git commit -m "feat(cfo): add debt analyzer with tests"
```

---

### Task 5: Investment Analyzer

**Files:**
- Create: `packages/core-finance/src/cfo/analyzers/investment.ts`
- Test: `packages/core-finance/src/__tests__/cfo/investment-analyzer.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// packages/core-finance/src/__tests__/cfo/investment-analyzer.test.ts
import { describe, it, expect } from 'vitest'
import { analyzeInvestment } from '../../cfo/analyzers/investment'
import type { InvestmentAnalyzerInput } from '../../cfo/types'

describe('analyzeInvestment', () => {
  it('returns empty when no positions', () => {
    expect(analyzeInvestment({
      positions: [], totalInvested: 0, dividendsReceived: 0, dividendsExpected: 0,
    })).toEqual([])
  })

  it('returns warning for concentration > 40%', () => {
    const input: InvestmentAnalyzerInput = {
      positions: [
        { asset: 'PETR4', class: 'br_equity', allocation: 45, pnlPercent: 10 },
        { asset: 'VALE3', class: 'br_equity', allocation: 55, pnlPercent: 5 },
      ],
      totalInvested: 100000, dividendsReceived: 0, dividendsExpected: 0,
    }
    const results = analyzeInvestment(input)
    expect(results.find((r) => r.type === 'investment_concentration')).toBeDefined()
  })

  it('returns info for position with loss > 20%', () => {
    const input: InvestmentAnalyzerInput = {
      positions: [
        { asset: 'MGLU3', class: 'br_equity', allocation: 10, pnlPercent: -25 },
      ],
      totalInvested: 100000, dividendsReceived: 0, dividendsExpected: 0,
    }
    const results = analyzeInvestment(input)
    const found = results.find((r) => r.type === 'investment_large_loss')
    expect(found).toBeDefined()
    expect(found!.severity).toBe('info')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core-finance && pnpm vitest run src/__tests__/cfo/investment-analyzer.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement analyzer**

```typescript
// packages/core-finance/src/cfo/analyzers/investment.ts
import type { InvestmentAnalyzerInput, InsightResult } from '../types'

export function analyzeInvestment(input: InvestmentAnalyzerInput): InsightResult[] {
  const insights: InsightResult[] = []
  const { positions } = input

  if (positions.length === 0) return []

  // Concentration check
  for (const pos of positions) {
    if (pos.allocation > 40) {
      insights.push({
        type: 'investment_concentration',
        category: 'investment',
        severity: 'warning',
        title: `Concentração alta: ${pos.asset}`,
        body: `${pos.asset} representa ${pos.allocation}% da sua carteira. Considere diversificar.`,
        metric: { allocation: pos.allocation },
        suggestedAction: { type: 'view_investments', params: {} },
      })
    }
  }

  // Large loss positions
  for (const pos of positions) {
    if (pos.pnlPercent < -20) {
      insights.push({
        type: 'investment_large_loss',
        category: 'investment',
        severity: 'info',
        title: `Prejuízo em ${pos.asset}: ${pos.pnlPercent}%`,
        body: `${pos.asset} acumula ${pos.pnlPercent}% de prejuízo. Avalie se faz sentido manter.`,
        metric: { pnlPercent: pos.pnlPercent, allocation: pos.allocation },
      })
    }
  }

  return insights
}
```

- [ ] **Step 4: Run tests**

Run: `cd packages/core-finance && pnpm vitest run src/__tests__/cfo/investment-analyzer.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core-finance/src/cfo/analyzers/investment.ts packages/core-finance/src/__tests__/cfo/investment-analyzer.test.ts
git commit -m "feat(cfo): add investment analyzer with tests"
```

---

### Task 6: Patrimony Analyzer

**Files:**
- Create: `packages/core-finance/src/cfo/analyzers/patrimony.ts`
- Test: `packages/core-finance/src/__tests__/cfo/patrimony-analyzer.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// packages/core-finance/src/__tests__/cfo/patrimony-analyzer.test.ts
import { describe, it, expect } from 'vitest'
import { analyzePatrimony } from '../../cfo/analyzers/patrimony'
import type { PatrimonyAnalyzerInput } from '../../cfo/types'

describe('analyzePatrimony', () => {
  it('returns empty when no snapshots', () => {
    expect(analyzePatrimony({ snapshots: [], fixedAssets: [] })).toEqual([])
  })

  it('returns positive when milestone is reached (R$100k)', () => {
    const input: PatrimonyAnalyzerInput = {
      snapshots: [
        { month: '2026-03', netWorth: 10500000, liquidAssets: 8000000 },
        { month: '2026-02', netWorth: 9800000, liquidAssets: 7500000 },
      ],
      fixedAssets: [],
    }
    const results = analyzePatrimony(input)
    const found = results.find((r) => r.type === 'patrimony_milestone')
    expect(found).toBeDefined()
    expect(found!.severity).toBe('positive')
  })

  it('detects net worth decrease', () => {
    const input: PatrimonyAnalyzerInput = {
      snapshots: [
        { month: '2026-03', netWorth: 8000000, liquidAssets: 6000000 },
        { month: '2026-02', netWorth: 9000000, liquidAssets: 7000000 },
      ],
      fixedAssets: [],
    }
    const results = analyzePatrimony(input)
    expect(results.find((r) => r.type === 'patrimony_decreased')).toBeDefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core-finance && pnpm vitest run src/__tests__/cfo/patrimony-analyzer.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement analyzer**

```typescript
// packages/core-finance/src/cfo/analyzers/patrimony.ts
import type { PatrimonyAnalyzerInput, InsightResult } from '../types'

const MILESTONES = [5000000, 10000000, 15000000, 20000000, 25000000, 50000000, 100000000]

export function analyzePatrimony(input: PatrimonyAnalyzerInput): InsightResult[] {
  const insights: InsightResult[] = []
  const { snapshots, fixedAssets } = input

  if (snapshots.length === 0) return []

  const sorted = [...snapshots].sort((a, b) => b.month.localeCompare(a.month))
  const current = sorted[0]
  const previous = sorted[1]

  if (previous) {
    const change = current.netWorth - previous.netWorth
    const changePct = previous.netWorth > 0 ? Math.round((change / previous.netWorth) * 100) : 0

    // Milestone check
    for (const milestone of MILESTONES) {
      if (current.netWorth >= milestone && previous.netWorth < milestone) {
        insights.push({
          type: 'patrimony_milestone',
          category: 'patrimony',
          severity: 'positive',
          title: `Patrimônio atingiu R$${(milestone / 100).toLocaleString('pt-BR')}!`,
          body: `Seu patrimônio líquido ultrapassou a marca de R$${(milestone / 100).toLocaleString('pt-BR')}.`,
          metric: { netWorth: current.netWorth, milestone },
        })
        break
      }
    }

    // Net worth decreased
    if (change < 0) {
      insights.push({
        type: 'patrimony_decreased',
        category: 'patrimony',
        severity: Math.abs(changePct) > 10 ? 'warning' : 'info',
        title: 'Patrimônio diminuiu',
        body: `Seu patrimônio caiu ${Math.abs(changePct)}% (R$${(Math.abs(change) / 100).toFixed(0)}) em relação ao mês anterior.`,
        metric: { current: current.netWorth, previous: previous.netWorth, changePct },
      })
    }
  }

  // Fixed asset valuation changes
  for (const asset of fixedAssets) {
    if (asset.previousValue > 0) {
      const changePct = Math.round(((asset.currentValue - asset.previousValue) / asset.previousValue) * 100)
      if (Math.abs(changePct) > 10) {
        insights.push({
          type: 'patrimony_fixed_asset_change',
          category: 'patrimony',
          severity: changePct > 0 ? 'positive' : 'warning',
          title: `${asset.name}: variação de ${changePct}%`,
          body: `O valor de "${asset.name}" ${changePct > 0 ? 'subiu' : 'caiu'} ${Math.abs(changePct)}%.`,
          metric: { currentValue: asset.currentValue, previousValue: asset.previousValue, changePct },
        })
      }
    }
  }

  return insights
}
```

- [ ] **Step 4: Run tests**

Run: `cd packages/core-finance && pnpm vitest run src/__tests__/cfo/patrimony-analyzer.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core-finance/src/cfo/analyzers/patrimony.ts packages/core-finance/src/__tests__/cfo/patrimony-analyzer.test.ts
git commit -m "feat(cfo): add patrimony analyzer with tests"
```

---

### Task 7: Retirement Analyzer

**Files:**
- Create: `packages/core-finance/src/cfo/analyzers/retirement.ts`
- Test: `packages/core-finance/src/__tests__/cfo/retirement-analyzer.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// packages/core-finance/src/__tests__/cfo/retirement-analyzer.test.ts
import { describe, it, expect } from 'vitest'
import { analyzeRetirement } from '../../cfo/analyzers/retirement'
import type { RetirementAnalyzerInput } from '../../cfo/types'

describe('analyzeRetirement', () => {
  it('returns empty when no plan', () => {
    expect(analyzeRetirement({ plan: null, currentSavingsRate: 0, netWorth: 0 })).toEqual([])
  })

  it('returns warning when savings rate is below required', () => {
    const input: RetirementAnalyzerInput = {
      plan: { targetAge: 55, currentAge: 30, monthlyContribution: 100000, desiredIncome: 1000000 },
      currentSavingsRate: 10,
      netWorth: 5000000,
    }
    const results = analyzeRetirement(input)
    // With 25 years to go, needing 1M/mo, savings rate of 10% is likely low
    expect(results.some((r) => r.category === 'retirement')).toBe(true)
  })

  it('returns positive when on track', () => {
    const input: RetirementAnalyzerInput = {
      plan: { targetAge: 55, currentAge: 30, monthlyContribution: 500000, desiredIncome: 500000 },
      currentSavingsRate: 50,
      netWorth: 50000000,
    }
    const results = analyzeRetirement(input)
    const found = results.find((r) => r.type === 'retirement_on_track')
    expect(found).toBeDefined()
    expect(found!.severity).toBe('positive')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core-finance && pnpm vitest run src/__tests__/cfo/retirement-analyzer.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement analyzer**

```typescript
// packages/core-finance/src/cfo/analyzers/retirement.ts
import type { RetirementAnalyzerInput, InsightResult } from '../types'

export function analyzeRetirement(input: RetirementAnalyzerInput): InsightResult[] {
  const insights: InsightResult[] = []
  const { plan, currentSavingsRate, netWorth } = input

  if (!plan) return []

  const yearsToGo = plan.targetAge - plan.currentAge
  if (yearsToGo <= 0) return []

  // Simple required nest egg: desiredIncome * 12 * 25 (4% rule)
  const requiredNestEgg = plan.desiredIncome * 12 * 25
  const monthsToGo = yearsToGo * 12
  const projectedSavings = netWorth + plan.monthlyContribution * monthsToGo
  const progressPct = requiredNestEgg > 0 ? Math.round((projectedSavings / requiredNestEgg) * 100) : 0

  if (progressPct >= 100) {
    insights.push({
      type: 'retirement_on_track',
      category: 'retirement',
      severity: 'positive',
      title: 'Aposentadoria no caminho certo',
      body: `Mantendo a contribuição atual, você atingirá ${progressPct}% da meta aos ${plan.targetAge} anos.`,
      metric: { progressPct, yearsToGo, projectedSavings, requiredNestEgg },
    })
  } else {
    const gap = requiredNestEgg - projectedSavings
    const extraMonthly = monthsToGo > 0 ? Math.round(gap / monthsToGo) : 0

    insights.push({
      type: 'retirement_behind',
      category: 'retirement',
      severity: progressPct < 50 ? 'warning' : 'info',
      title: 'Aposentadoria abaixo da meta',
      body: `Projeção cobre ${progressPct}% da meta. Aumente R$${(extraMonthly / 100).toFixed(0)}/mês para fechar o gap.`,
      metric: { progressPct, gap, extraMonthly, yearsToGo },
      suggestedAction: { type: 'view_planning', params: {} },
    })
  }

  return insights
}
```

- [ ] **Step 4: Run tests**

Run: `cd packages/core-finance && pnpm vitest run src/__tests__/cfo/retirement-analyzer.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core-finance/src/cfo/analyzers/retirement.ts packages/core-finance/src/__tests__/cfo/retirement-analyzer.test.ts
git commit -m "feat(cfo): add retirement analyzer with tests"
```

---

### Task 8: Behavior Analyzer

**Files:**
- Create: `packages/core-finance/src/cfo/analyzers/behavior.ts`
- Test: `packages/core-finance/src/__tests__/cfo/behavior-analyzer.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// packages/core-finance/src/__tests__/cfo/behavior-analyzer.test.ts
import { describe, it, expect } from 'vitest'
import { analyzeBehavior } from '../../cfo/analyzers/behavior'
import type { BehaviorAnalyzerInput } from '../../cfo/types'

describe('analyzeBehavior', () => {
  it('returns empty when no transactions', () => {
    expect(analyzeBehavior({
      transactions: [],
      averageTransactionAmount: { current: 0, previous: 0 },
    })).toEqual([])
  })

  it('detects weekend spending dominance (>40% on weekends)', () => {
    const transactions = [
      // Saturday (6) and Sunday (0) heavy spending
      { date: '2026-03-01', amount: -5000, category: 'Lazer', dayOfWeek: 0 },
      { date: '2026-03-07', amount: -8000, category: 'Alimentação', dayOfWeek: 6 },
      { date: '2026-03-08', amount: -6000, category: 'Lazer', dayOfWeek: 0 },
      { date: '2026-03-14', amount: -7000, category: 'Alimentação', dayOfWeek: 6 },
      // Weekday minimal spending
      { date: '2026-03-02', amount: -1000, category: 'Transporte', dayOfWeek: 1 },
      { date: '2026-03-03', amount: -1000, category: 'Transporte', dayOfWeek: 2 },
    ]
    const results = analyzeBehavior({
      transactions,
      averageTransactionAmount: { current: 4000, previous: 4000 },
    })
    expect(results.find((r) => r.type === 'behavior_weekend_heavy')).toBeDefined()
  })

  it('detects rising average transaction amount (>20% increase)', () => {
    const results = analyzeBehavior({
      transactions: [{ date: '2026-03-01', amount: -5000, category: 'Test', dayOfWeek: 1 }],
      averageTransactionAmount: { current: 6000, previous: 4000 },
    })
    expect(results.find((r) => r.type === 'behavior_avg_amount_rising')).toBeDefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core-finance && pnpm vitest run src/__tests__/cfo/behavior-analyzer.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement analyzer**

```typescript
// packages/core-finance/src/cfo/analyzers/behavior.ts
import type { BehaviorAnalyzerInput, InsightResult } from '../types'

export function analyzeBehavior(input: BehaviorAnalyzerInput): InsightResult[] {
  const insights: InsightResult[] = []
  const { transactions, averageTransactionAmount } = input

  if (transactions.length === 0) return []

  // Weekend vs weekday spending
  let weekendSpend = 0
  let weekdaySpend = 0
  for (const tx of transactions) {
    const amount = Math.abs(tx.amount)
    if (tx.dayOfWeek === 0 || tx.dayOfWeek === 6) {
      weekendSpend += amount
    } else {
      weekdaySpend += amount
    }
  }
  const totalSpend = weekendSpend + weekdaySpend
  const weekendPct = totalSpend > 0 ? Math.round((weekendSpend / totalSpend) * 100) : 0

  if (weekendPct > 40) {
    insights.push({
      type: 'behavior_weekend_heavy',
      category: 'behavior',
      severity: 'info',
      title: 'Gastos concentrados no fim de semana',
      body: `${weekendPct}% dos seus gastos acontecem no sábado e domingo.`,
      metric: { weekendPct, weekendSpend, weekdaySpend },
    })
  }

  // Rising average transaction amount
  const { current, previous } = averageTransactionAmount
  if (previous > 0) {
    const increase = Math.round(((current - previous) / previous) * 100)
    if (increase > 20) {
      insights.push({
        type: 'behavior_avg_amount_rising',
        category: 'behavior',
        severity: 'info',
        title: 'Valor médio por transação subindo',
        body: `O valor médio das suas transações subiu ${increase}% em relação ao período anterior.`,
        metric: { current, previous, increase },
      })
    }
  }

  return insights
}
```

- [ ] **Step 4: Run tests**

Run: `cd packages/core-finance && pnpm vitest run src/__tests__/cfo/behavior-analyzer.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core-finance/src/cfo/analyzers/behavior.ts packages/core-finance/src/__tests__/cfo/behavior-analyzer.test.ts
git commit -m "feat(cfo): add behavior analyzer with tests"
```

---

### Task 9: Analyzer Index + Core-Finance Exports

**Files:**
- Create: `packages/core-finance/src/cfo/analyzers/index.ts`
- Modify: `packages/core-finance/src/index.ts`

- [ ] **Step 1: Create analyzer index**

```typescript
// packages/core-finance/src/cfo/analyzers/index.ts
import type { InsightCategory, InsightResult } from '../types'
import type {
  CashFlowAnalyzerInput,
  BudgetAnalyzerInput,
  DebtAnalyzerInput,
  InvestmentAnalyzerInput,
  PatrimonyAnalyzerInput,
  RetirementAnalyzerInput,
  BehaviorAnalyzerInput,
} from '../types'
import { analyzeCashFlow } from './cash-flow'
import { analyzeBudget } from './budget'
import { analyzeDebt } from './debt'
import { analyzeInvestment } from './investment'
import { analyzePatrimony } from './patrimony'
import { analyzeRetirement } from './retirement'
import { analyzeBehavior } from './behavior'

export interface AllAnalyzerInputs {
  cashFlow?: CashFlowAnalyzerInput
  budget?: BudgetAnalyzerInput
  debt?: DebtAnalyzerInput
  investment?: InvestmentAnalyzerInput
  patrimony?: PatrimonyAnalyzerInput
  retirement?: RetirementAnalyzerInput
  behavior?: BehaviorAnalyzerInput
}

/**
 * Run selected analyzers and return all insights.
 * If `categories` is provided, only those analyzers run.
 */
export function runAnalyzers(
  inputs: AllAnalyzerInputs,
  categories?: InsightCategory[],
): InsightResult[] {
  const insights: InsightResult[] = []
  const shouldRun = (cat: InsightCategory) => !categories || categories.includes(cat)

  if (shouldRun('cash_flow') && inputs.cashFlow) {
    insights.push(...analyzeCashFlow(inputs.cashFlow))
  }
  if (shouldRun('budget') && inputs.budget) {
    insights.push(...analyzeBudget(inputs.budget))
  }
  if (shouldRun('debt') && inputs.debt) {
    insights.push(...analyzeDebt(inputs.debt))
  }
  if (shouldRun('investment') && inputs.investment) {
    insights.push(...analyzeInvestment(inputs.investment))
  }
  if (shouldRun('patrimony') && inputs.patrimony) {
    insights.push(...analyzePatrimony(inputs.patrimony))
  }
  if (shouldRun('retirement') && inputs.retirement) {
    insights.push(...analyzeRetirement(inputs.retirement))
  }
  if (shouldRun('behavior') && inputs.behavior) {
    insights.push(...analyzeBehavior(inputs.behavior))
  }

  return insights
}

export {
  analyzeCashFlow,
  analyzeBudget,
  analyzeDebt,
  analyzeInvestment,
  analyzePatrimony,
  analyzeRetirement,
  analyzeBehavior,
}
```

- [ ] **Step 2: Update core-finance exports**

Add to `packages/core-finance/src/index.ts` (replace the line added in Task 1):

```typescript
// Phase 8 — CFO AI Agents
export * from './cfo/types'
export * from './cfo/analyzers'
```

- [ ] **Step 3: Verify build**

Run: `cd packages/core-finance && pnpm tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/core-finance/src/cfo/analyzers/index.ts packages/core-finance/src/index.ts
git commit -m "feat(cfo): add analyzer orchestrator and exports"
```

---

### Task 10: Database Schema + Migration

**Files:**
- Create: `packages/db/src/schema/cfo.ts`
- Modify: `packages/db/src/index.ts`
- Create: `supabase/migrations/00021_cfo_insights.sql`

- [ ] **Step 1: Create Drizzle schema**

```typescript
// packages/db/src/schema/cfo.ts
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  boolean,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { orgs } from './auth'

// NOTE: Import sql for jsonb default

export const cfoInsights = pgTable(
  'cfo_insights',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    category: text('category').notNull(),
    severity: text('severity').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    detailMarkdown: text('detail_markdown'),
    metric: jsonb('metric').notNull().default(sql`'{}'`),
    correlatedWith: text('correlated_with').array(),
    suggestedActionType: text('suggested_action_type'),
    suggestedActionParams: jsonb('suggested_action_params'),
    source: text('source').notNull().default('cron'),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    actedOnAt: timestamp('acted_on_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxOrgActive: index('idx_cfo_insights_org_active').on(
      table.orgId,
      table.severity,
      table.generatedAt,
    ),
  })
)

export const cfoRuns = pgTable(
  'cfo_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    runType: text('run_type').notNull(),
    triggerEvent: text('trigger_event').notNull().default('cron_daily'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    analyzersRun: text('analyzers_run').array().notNull(),
    insightsGenerated: integer('insights_generated').default(0),
    llmCalled: boolean('llm_called').default(false),
    llmTokensUsed: integer('llm_tokens_used'),
    dailySummary: text('daily_summary'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxOrgLatest: index('idx_cfo_runs_org_latest').on(
      table.orgId,
      table.runType,
      table.startedAt,
    ),
  })
)

export type CfoInsight = typeof cfoInsights.$inferSelect
export type NewCfoInsight = typeof cfoInsights.$inferInsert
export type CfoRun = typeof cfoRuns.$inferSelect
export type NewCfoRun = typeof cfoRuns.$inferInsert
```

- [ ] **Step 2: Export from DB index**

Add to `packages/db/src/index.ts`:

```typescript
export * from './schema/cfo'
```

- [ ] **Step 3: Create SQL migration**

Copy the full SQL from the spec into `supabase/migrations/00021_cfo_insights.sql` — includes both tables, RLS policies, indexes, and debounce unique index. Refer to spec section "Modelo de Dados" for exact SQL.

- [ ] **Step 4: Verify build**

Run: `cd packages/db && pnpm tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/cfo.ts packages/db/src/index.ts supabase/migrations/00021_cfo_insights.sql
git commit -m "feat(cfo): add database schema and migration for CFO insights"
```

---

### Task 11: Cache Tags + Queries

**Files:**
- Modify: `apps/web/lib/cache-tags.ts`
- Create: `apps/web/lib/cfo/queries.ts`

- [ ] **Step 1: Add cache tags**

Add to `apps/web/lib/cache-tags.ts`:

```typescript
export function cfoInsightsTag(orgId: string) {
  return `cfo-insights:${orgId}`
}

export function cfoRunsTag(orgId: string) {
  return `cfo-runs:${orgId}`
}
```

- [ ] **Step 2: Create queries**

```typescript
// apps/web/lib/cfo/queries.ts
import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { getDb, cfoInsights, cfoRuns } from '@floow/db'
import { eq, and, isNull, gt, desc, sql } from 'drizzle-orm'
import { cfoInsightsTag } from '../cache-tags'

const SEVERITY_ORDER = sql`CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 WHEN 'info' THEN 2 WHEN 'positive' THEN 3 END`

/** Active (non-dismissed, non-expired) insights for an org, ordered by severity priority. */
export const getActiveInsights = cache(function getActiveInsights(orgId: string) {
  return unstable_cache(
    async () => {
      const db = getDb()
      return db
        .select()
        .from(cfoInsights)
        .where(
          and(
            eq(cfoInsights.orgId, orgId),
            isNull(cfoInsights.dismissedAt),
            gt(cfoInsights.expiresAt, sql`now()`),
          )
        )
        .orderBy(SEVERITY_ORDER, desc(cfoInsights.generatedAt))
    },
    [`cfo-insights-active-${orgId}`],
    { tags: [cfoInsightsTag(orgId)], revalidate: 300 },
  )()
})

/** Top N insights for dashboard strip. */
export const getTopInsights = cache(function getTopInsights(orgId: string, limit = 3) {
  return unstable_cache(
    async () => {
      const db = getDb()
      return db
        .select()
        .from(cfoInsights)
        .where(
          and(
            eq(cfoInsights.orgId, orgId),
            isNull(cfoInsights.dismissedAt),
            gt(cfoInsights.expiresAt, sql`now()`),
          )
        )
        .orderBy(SEVERITY_ORDER, desc(cfoInsights.generatedAt))
        .limit(limit)
    },
    [`cfo-insights-top-${orgId}-${limit}`],
    { tags: [cfoInsightsTag(orgId)], revalidate: 300 },
  )()
})

/** Latest run for an org. */
export const getLatestRun = cache(function getLatestRun(orgId: string) {
  return unstable_cache(
    async () => {
      const db = getDb()
      const [run] = await db
        .select()
        .from(cfoRuns)
        .where(eq(cfoRuns.orgId, orgId))
        .orderBy(desc(cfoRuns.startedAt))
        .limit(1)
      return run ?? null
    },
    [`cfo-runs-latest-${orgId}`],
    { tags: [cfoInsightsTag(orgId)], revalidate: 300 },
  )()
})

/** Count of active critical + warning insights (for sidebar badge). */
export const getInsightBadgeCount = cache(function getInsightBadgeCount(orgId: string) {
  return unstable_cache(
    async () => {
      const db = getDb()
      const [row] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(cfoInsights)
        .where(
          and(
            eq(cfoInsights.orgId, orgId),
            isNull(cfoInsights.dismissedAt),
            gt(cfoInsights.expiresAt, sql`now()`),
            sql`severity IN ('critical', 'warning')`,
          )
        )
      return Number(row.count)
    },
    [`cfo-badge-${orgId}`],
    { tags: [cfoInsightsTag(orgId)], revalidate: 300 },
  )()
})
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/cache-tags.ts apps/web/lib/cfo/queries.ts
git commit -m "feat(cfo): add cache tags and query functions"
```

---

### Task 12: Server Actions (dismiss, markActedOn)

**Files:**
- Create: `apps/web/lib/cfo/actions.ts`

- [ ] **Step 1: Create actions**

```typescript
// apps/web/lib/cfo/actions.ts
'use server'

import { revalidateTag } from 'next/cache'
import { getDb, cfoInsights } from '@floow/db'
import { eq, and } from 'drizzle-orm'
import { getOrgId } from '@/lib/finance/queries'
import { cfoInsightsTag } from '../cache-tags'

export async function dismissInsight(insightId: string) {
  const orgId = await getOrgId()
  const db = getDb()

  await db
    .update(cfoInsights)
    .set({ dismissedAt: new Date() })
    .where(and(eq(cfoInsights.id, insightId), eq(cfoInsights.orgId, orgId)))

  revalidateTag(cfoInsightsTag(orgId))
}

export async function markInsightActedOn(insightId: string) {
  const orgId = await getOrgId()
  const db = getDb()

  await db
    .update(cfoInsights)
    .set({ actedOnAt: new Date() })
    .where(and(eq(cfoInsights.id, insightId), eq(cfoInsights.orgId, orgId)))

  revalidateTag(cfoInsightsTag(orgId))
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/lib/cfo/actions.ts
git commit -m "feat(cfo): add dismiss and markActedOn server actions"
```

---

### Task 13: CFO Engine (orchestrator that fetches data + runs analyzers)

**Files:**
- Create: `apps/web/lib/cfo/engine.ts`

This is the bridge between DB data and pure analyzers. It lives in `apps/web` (not core-finance) because it accesses the database.

- [ ] **Step 1: Create engine**

```typescript
// apps/web/lib/cfo/engine.ts
import {
  getDb, cfoInsights, cfoRuns, transactions, accounts, debts,
  budgetGoals, budgetEntries, patrimonySnapshots, assets, portfolioEvents,
} from '@floow/db'
import { eq, and, gte, desc, sql, inArray } from 'drizzle-orm'
import { runAnalyzers, aggregateCashFlow } from '@floow/core-finance'
import type { InsightCategory, InsightResult, AllAnalyzerInputs } from '@floow/core-finance'
import type { NewCfoInsight } from '@floow/db'

// NOTE: This engine uses direct DB queries (not RSC-cached queries)
// because it runs from API routes, not React Server Components.

/** Run the CFO analysis for an org. Returns number of insights generated. */
export async function runCfoEngine(
  orgId: string,
  options: {
    triggerEvent?: string
    categories?: InsightCategory[]
  } = {},
): Promise<number> {
  const db = getDb()
  const triggerEvent = options.triggerEvent ?? 'cron_daily'
  const categories = options.categories

  // Record the run (debounce via ON CONFLICT)
  const analyzersToRun = categories ?? [
    'cash_flow', 'budget', 'debt', 'investment', 'patrimony', 'retirement', 'behavior',
  ] as InsightCategory[]

  const [run] = await db
    .insert(cfoRuns)
    .values({
      orgId,
      runType: triggerEvent === 'cron_daily' ? 'daily' : 'event',
      triggerEvent,
      analyzersRun: analyzersToRun,
    })
    .onConflictDoNothing()
    .returning()

  // Debounce hit — another run is in progress
  if (!run) return 0

  try {
    // Fetch data for analyzers
    const inputs = await fetchAnalyzerInputs(orgId, analyzersToRun)

    // Run pure analyzers
    const insights = runAnalyzers(inputs, analyzersToRun)

    if (insights.length > 0) {
      // Save insights to DB
      const now = new Date()
      const insightRows: NewCfoInsight[] = insights.map((insight) => ({
        orgId,
        type: insight.type,
        category: insight.category,
        severity: insight.severity,
        title: insight.title,
        body: insight.body,
        metric: insight.metric,
        suggestedActionType: insight.suggestedAction?.type ?? null,
        suggestedActionParams: insight.suggestedAction?.params ?? null,
        source: triggerEvent === 'cron_daily' ? 'cron' : 'event',
        generatedAt: now,
        expiresAt: getExpiresAt(now, insight.severity, triggerEvent),
      }))

      await db.insert(cfoInsights).values(insightRows)
    }

    // Mark run complete
    await db
      .update(cfoRuns)
      .set({ completedAt: new Date(), insightsGenerated: insights.length })
      .where(eq(cfoRuns.id, run.id))

    return insights.length
  } catch (err) {
    await db
      .update(cfoRuns)
      .set({ completedAt: new Date(), error: String(err) })
      .where(eq(cfoRuns.id, run.id))
    throw err
  }
}

function getExpiresAt(now: Date, severity: string, trigger: string): Date {
  const expires = new Date(now)
  if (severity === 'positive') {
    expires.setDate(expires.getDate() + 7)
  } else if (trigger !== 'cron_daily' && severity === 'critical') {
    expires.setHours(expires.getHours() + 12)
  } else {
    expires.setHours(expires.getHours() + 24)
  }
  return expires
}

async function fetchAnalyzerInputs(
  orgId: string,
  categories: InsightCategory[],
): Promise<AllAnalyzerInputs> {
  const inputs: AllAnalyzerInputs = {}
  const db = getDb()

  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  // Shared: fetch recent transactions (used by cash_flow, behavior, and income calc)
  let recentTx: { date: Date; amountCents: number; type: string }[] = []
  if (categories.some((c) => ['cash_flow', 'behavior', 'debt', 'retirement'].includes(c))) {
    recentTx = await db
      .select({ date: transactions.date, amountCents: transactions.amountCents, type: transactions.type })
      .from(transactions)
      .where(and(eq(transactions.orgId, orgId), gte(transactions.date, sixMonthsAgo)))
  }

  // Shared: compute monthly totals (reused by cash_flow, debt, retirement)
  let monthlyTotals: { month: string; income: number; expense: number }[] = []
  if (recentTx.length > 0) {
    monthlyTotals = aggregateCashFlow(recentTx).map((m) => ({
      month: m.month, income: m.income, expense: m.expense,
    }))
  }

  // -- Cash Flow --
  if (categories.includes('cash_flow')) {
    const accts = await db.select().from(accounts).where(eq(accounts.orgId, orgId))
    inputs.cashFlow = {
      monthlyTotals,
      accountBalances: accts.map((a) => ({
        accountId: a.id, name: a.name, balance: a.balanceCents,
      })),
    }
  }

  // -- Behavior --
  if (categories.includes('behavior')) {
    const txForBehavior = recentTx
      .filter((t) => t.type === 'expense')
      .map((t) => ({
        date: t.date.toISOString().slice(0, 10),
        amount: t.amountCents,
        category: '',
        dayOfWeek: t.date.getDay(),
      }))

    const threeMonthsAgo = new Date()
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
    const cutoff = threeMonthsAgo.toISOString().slice(0, 10)

    const currentTx = txForBehavior.filter((t) => t.date >= cutoff)
    const previousTx = txForBehavior.filter((t) => t.date < cutoff)

    const avgCurrent = currentTx.length > 0
      ? Math.round(currentTx.reduce((s, t) => s + Math.abs(t.amount), 0) / currentTx.length) : 0
    const avgPrevious = previousTx.length > 0
      ? Math.round(previousTx.reduce((s, t) => s + Math.abs(t.amount), 0) / previousTx.length) : 0

    inputs.behavior = {
      transactions: currentTx,
      averageTransactionAmount: { current: avgCurrent, previous: avgPrevious },
    }
  }

  // -- Debt --
  if (categories.includes('debt')) {
    const debtList = await db.select().from(debts)
      .where(and(eq(debts.orgId, orgId), eq(debts.isActive, true)))
    const latestIncome = monthlyTotals[0]?.income ?? 0

    inputs.debt = {
      debts: debtList.map((d) => ({
        name: d.name,
        balance: d.totalCents,
        monthlyPayment: d.installmentCents,
        interestRate: d.interestRate ? parseFloat(d.interestRate) : 0,
        isOverdraft: false, // Overdraft detected via negative account balance in cash_flow analyzer
      })),
      monthlyIncome: latestIncome,
    }
  }

  // -- Budget --
  if (categories.includes('budget')) {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

    const goals = await db.select().from(budgetGoals)
      .where(and(eq(budgetGoals.orgId, orgId), eq(budgetGoals.type, 'spending')))

    // Current month spending by category
    const spendingRows = await db
      .select({
        categoryId: transactions.categoryId,
        spent: sql<number>`COALESCE(SUM(ABS(${transactions.amountCents})), 0)`,
      })
      .from(transactions)
      .where(and(
        eq(transactions.orgId, orgId),
        eq(transactions.type, 'expense'),
        gte(transactions.date, monthStart),
      ))
      .groupBy(transactions.categoryId)

    const spendingMap = new Map(spendingRows.map((r) => [r.categoryId, Number(r.spent)]))

    // Get budget entries for each goal to map category spending
    const entries = goals.length > 0
      ? await db.select().from(budgetEntries)
          .where(inArray(budgetEntries.goalId, goals.map((g) => g.id)))
      : []

    const goalInputs = entries.map((entry) => ({
      category: entry.categoryId ?? 'other',
      limit: entry.plannedCents,
      spent: spendingMap.get(entry.categoryId ?? '') ?? 0,
      period: 'monthly',
    }))

    inputs.budget = { goals: goalInputs, historicalUsage: [] }
  }

  // -- Investment --
  if (categories.includes('investment')) {
    const positions = await db
      .select({
        assetId: portfolioEvents.assetId,
        totalQty: sql<number>`SUM(CASE WHEN ${portfolioEvents.type} = 'buy' THEN ${portfolioEvents.quantity} WHEN ${portfolioEvents.type} = 'sell' THEN -${portfolioEvents.quantity} ELSE 0 END)`,
        totalCost: sql<number>`SUM(CASE WHEN ${portfolioEvents.type} = 'buy' THEN ${portfolioEvents.totalCents} WHEN ${portfolioEvents.type} = 'sell' THEN -${portfolioEvents.totalCents} ELSE 0 END)`,
      })
      .from(portfolioEvents)
      .where(eq(portfolioEvents.orgId, orgId))
      .groupBy(portfolioEvents.assetId)

    const assetIds = positions.map((p) => p.assetId)
    const assetList = assetIds.length > 0
      ? await db.select().from(assets).where(inArray(assets.id, assetIds))
      : []
    const assetMap = new Map(assetList.map((a) => [a.id, a]))

    const totalInvested = positions.reduce((s, p) => s + Number(p.totalCost), 0)
    const positionInputs = positions
      .filter((p) => Number(p.totalQty) > 0)
      .map((p) => {
        const asset = assetMap.get(p.assetId)
        const cost = Number(p.totalCost)
        const allocation = totalInvested > 0 ? Math.round((cost / totalInvested) * 100) : 0
        return {
          asset: asset?.ticker ?? p.assetId,
          class: asset?.assetClass ?? 'unknown',
          allocation,
          pnlPercent: 0, // Would need current price for real PnL
        }
      })

    inputs.investment = {
      positions: positionInputs,
      totalInvested,
      dividendsReceived: 0,
      dividendsExpected: 0,
    }
  }

  // -- Patrimony --
  if (categories.includes('patrimony')) {
    const snapshots = await db.select().from(patrimonySnapshots)
      .where(eq(patrimonySnapshots.orgId, orgId))
      .orderBy(desc(patrimonySnapshots.createdAt))
      .limit(2)

    inputs.patrimony = {
      snapshots: snapshots.map((s) => ({
        month: s.createdAt.toISOString().slice(0, 7),
        netWorth: s.netWorthCents,
        liquidAssets: s.liquidAssetsCents,
      })),
      fixedAssets: [],
    }
  }

  // -- Retirement --
  if (categories.includes('retirement')) {
    const latestIncome = monthlyTotals[0]?.income ?? 0
    const latestExpense = Math.abs(monthlyTotals[0]?.expense ?? 0)
    const savingsRate = latestIncome > 0 ? Math.round(((latestIncome - latestExpense) / latestIncome) * 100) : 0

    // Fetch latest snapshot for netWorth
    const snapshots = inputs.patrimony?.snapshots ?? []
    const netWorth = snapshots[0]?.netWorth ?? 0

    // NOTE: Retirement plan data would need a direct query to planning tables.
    // For now, set plan to null — retirement analyzer returns [] when no plan.
    inputs.retirement = { plan: null, currentSavingsRate: savingsRate, netWorth }
  }

  return inputs
}
```

- [ ] **Step 2: Verify build**

Run: `cd apps/web && pnpm tsc --noEmit`
Expected: No errors (may need minor type adjustments)

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/cfo/engine.ts
git commit -m "feat(cfo): add CFO engine orchestrator"
```

---

### Task 14: API Routes

**Files:**
- Create: `apps/web/app/api/cfo/run-daily/route.ts`
- Create: `apps/web/app/api/cfo/run-event/route.ts`

- [ ] **Step 1: Create daily route**

```typescript
// apps/web/app/api/cfo/run-daily/route.ts
import { NextResponse } from 'next/server'
import { getDb, transactions } from '@floow/db'
import { sql, gte } from 'drizzle-orm'
import { runCfoEngine } from '@/lib/cfo/engine'

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${SERVICE_ROLE_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const db = getDb()
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    // Active orgs: at least 1 transaction in the last 30 days
    const activeOrgs = await db
      .selectDistinct({ orgId: transactions.orgId })
      .from(transactions)
      .where(gte(transactions.date, thirtyDaysAgo))

    let totalInsights = 0
    const batchSize = 10

    for (let i = 0; i < activeOrgs.length; i += batchSize) {
      const batch = activeOrgs.slice(i, i + batchSize)
      const results = await Promise.all(
        batch.map((row) =>
          runCfoEngine(row.orgId).catch((err) => {
            console.error(`[CFO] Daily run failed for org=${row.orgId}:`, err)
            return 0
          })
        )
      )
      totalInsights += results.reduce((s, n) => s + n, 0)
    }

    return NextResponse.json({ ok: true, orgs: activeOrgs.length, insights: totalInsights })
  } catch (err) {
    console.error('[CFO] Daily run failed:', err)
    return NextResponse.json({ error: 'Daily run failed' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create event route**

```typescript
// apps/web/app/api/cfo/run-event/route.ts
import { NextResponse } from 'next/server'
import { runCfoEngine } from '@/lib/cfo/engine'
import type { InsightCategory } from '@floow/core-finance'

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${SERVICE_ROLE_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { orgId, event, analyzers } = (await request.json()) as {
      orgId: string
      event: string
      analyzers: InsightCategory[]
    }

    const count = await runCfoEngine(orgId, {
      triggerEvent: event,
      categories: analyzers,
    })

    return NextResponse.json({ ok: true, insights: count })
  } catch (err) {
    console.error('[CFO] Event run failed:', err)
    return NextResponse.json({ error: 'Event run failed' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/cfo/run-daily/route.ts apps/web/app/api/cfo/run-event/route.ts
git commit -m "feat(cfo): add API routes for daily and event triggers"
```

---

### Task 15: UI — Insight Card Component

**Files:**
- Create: `apps/web/components/cfo/insight-card.tsx`

- [ ] **Step 1: Create component**

```typescript
// apps/web/components/cfo/insight-card.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronUp, X, AlertTriangle, AlertCircle, Info, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { dismissInsight, markInsightActedOn } from '@/lib/cfo/actions'
import type { CfoInsight } from '@floow/db'

const SEVERITY_CONFIG = {
  critical: {
    icon: AlertTriangle,
    border: 'border-l-4 border-l-red-500',
    badge: 'bg-red-100 text-red-700',
    label: 'Crítico',
  },
  warning: {
    icon: AlertCircle,
    border: 'border-l-4 border-l-yellow-500',
    badge: 'bg-yellow-100 text-yellow-700',
    label: 'Atenção',
  },
  info: {
    icon: Info,
    border: 'border-l-4 border-l-blue-500',
    badge: 'bg-blue-100 text-blue-700',
    label: 'Info',
  },
  positive: {
    icon: CheckCircle2,
    border: 'border-l-4 border-l-green-500',
    badge: 'bg-green-100 text-green-700',
    label: 'Positivo',
  },
} as const

const ACTION_ROUTES: Record<string, (params: Record<string, unknown>) => string> = {
  view_transactions: (p) => `/transactions${p.period ? `?period=${p.period}` : ''}${p.category ? `&category=${p.category}` : ''}`,
  view_account: (p) => `/accounts/${p.accountId}`,
  view_debts: () => '/debts',
  view_investments: () => '/investments',
  view_planning: () => '/planning',
  create_budget: () => '/budgets/spending',
  adjust_budget: (p) => `/budgets/spending${p.category ? `?highlight=${p.category}` : ''}`,
}

interface InsightCardProps {
  insight: CfoInsight
  compact?: boolean
}

export function InsightCard({ insight, compact = false }: InsightCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const router = useRouter()

  const config = SEVERITY_CONFIG[insight.severity as keyof typeof SEVERITY_CONFIG] ?? SEVERITY_CONFIG.info
  const Icon = config.icon

  if (dismissed) return null

  async function handleDismiss() {
    setDismissed(true)
    await dismissInsight(insight.id)
  }

  async function handleAction() {
    if (insight.suggestedActionType) {
      await markInsightActedOn(insight.id)
      const routeFn = ACTION_ROUTES[insight.suggestedActionType]
      if (routeFn) {
        const params = (insight.suggestedActionParams ?? {}) as Record<string, unknown>
        router.push(routeFn(params))
      }
    }
  }

  return (
    <Card className={cn(config.border, 'transition-all')}>
      <CardContent className={cn('pt-4', compact ? 'pb-3' : 'pb-4')}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <Icon className="h-5 w-5 mt-0.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="font-medium text-sm leading-tight">{insight.title}</p>
              <p className="text-sm text-muted-foreground mt-1">{insight.body}</p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {!compact && (
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="p-1 rounded hover:bg-accent text-muted-foreground"
                aria-label={expanded ? 'Recolher' : 'Expandir'}
              >
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            )}
            <button
              type="button"
              onClick={handleDismiss}
              className="p-1 rounded hover:bg-accent text-muted-foreground"
              aria-label="Descartar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Drill-down */}
        {expanded && insight.detailMarkdown && (
          <div className="mt-3 pt-3 border-t text-sm text-muted-foreground whitespace-pre-line">
            {insight.detailMarkdown}
          </div>
        )}

        {/* Action button */}
        {!compact && insight.suggestedActionType && (
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={handleAction}>
              {getActionLabel(insight.suggestedActionType)}
            </Button>
          </div>
        )}

        {compact && insight.suggestedActionType && (
          <Button
            size="sm"
            variant="link"
            className="mt-1 h-auto p-0 text-xs"
            onClick={handleAction}
          >
            {getActionLabel(insight.suggestedActionType)} &rarr;
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function getActionLabel(actionType: string): string {
  const labels: Record<string, string> = {
    view_transactions: 'Ver transações',
    view_account: 'Ver conta',
    view_debts: 'Ver dívidas',
    view_investments: 'Ver investimentos',
    view_planning: 'Ver planejamento',
    create_budget: 'Criar orçamento',
    adjust_budget: 'Ajustar orçamento',
  }
  return labels[actionType] ?? 'Ver detalhes'
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/cfo/insight-card.tsx
git commit -m "feat(cfo): add InsightCard UI component"
```

---

### Task 16: UI — Dashboard CFO Strip

**Files:**
- Create: `apps/web/components/cfo/cfo-dashboard-strip.tsx`
- Modify: `apps/web/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Create strip component**

```typescript
// apps/web/components/cfo/cfo-dashboard-strip.tsx
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { CheckCircle2 } from 'lucide-react'
import { getTopInsights } from '@/lib/cfo/queries'
import { InsightCard } from './insight-card'

interface CfoDashboardStripProps {
  orgId: string
}

export async function CfoDashboardStrip({ orgId }: CfoDashboardStripProps) {
  const insights = await getTopInsights(orgId, 3)

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          CFO Pessoal
        </h2>
        <Link
          href="/cfo"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          ver tudo &rarr;
        </Link>
      </div>

      {insights.length === 0 ? (
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-4 pb-3 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
            <div>
              <p className="font-medium text-sm">Tudo sob controle hoje</p>
              <p className="text-sm text-muted-foreground">Nenhum alerta financeiro no momento.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {insights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} compact />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add strip to dashboard**

In `apps/web/app/(app)/dashboard/page.tsx`, add import and Suspense section after the BudgetAlertSection:

```typescript
// Add import at top
import { CfoDashboardStrip } from '@/components/cfo/cfo-dashboard-strip'

// Add after BudgetAlertSection Suspense block (after line ~167):
{/* CFO Insights */}
<Suspense fallback={<SectionSkeleton />}>
  <CfoDashboardStrip orgId={orgId} />
</Suspense>
```

- [ ] **Step 3: Verify build**

Run: `cd apps/web && pnpm tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/cfo/cfo-dashboard-strip.tsx apps/web/app/\(app\)/dashboard/page.tsx
git commit -m "feat(cfo): add CFO dashboard strip with insight cards"
```

---

### Task 17: UI — Dedicated /cfo Page

**Files:**
- Create: `apps/web/app/(app)/cfo/page.tsx`
- Create: `apps/web/app/(app)/cfo/client.tsx`

- [ ] **Step 1: Create server page**

```typescript
// apps/web/app/(app)/cfo/page.tsx
import { Suspense } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { getOrgId } from '@/lib/finance/queries'
import { getActiveInsights, getLatestRun } from '@/lib/cfo/queries'
import { CfoClient } from './client'

async function CfoContent({ orgId }: { orgId: string }) {
  const [insights, latestRun] = await Promise.all([
    getActiveInsights(orgId),
    getLatestRun(orgId),
  ])

  return <CfoClient insights={insights} latestRun={latestRun} />
}

function CfoSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100" />
      ))}
    </div>
  )
}

export default async function CfoPage() {
  const orgId = await getOrgId()

  return (
    <div className="space-y-6">
      <PageHeader
        title="CFO Pessoal"
        description="Insights diários sobre sua estratégia financeira"
      />

      <Suspense fallback={<CfoSkeleton />}>
        <CfoContent orgId={orgId} />
      </Suspense>
    </div>
  )
}
```

- [ ] **Step 2: Create client component**

```typescript
// apps/web/app/(app)/cfo/client.tsx
'use client'

import { InsightCard } from '@/components/cfo/insight-card'
import type { CfoInsight, CfoRun } from '@floow/db'

interface CfoClientProps {
  insights: CfoInsight[]
  latestRun: CfoRun | null
}

export function CfoClient({ insights, latestRun }: CfoClientProps) {
  const critical = insights.filter((i) => i.severity === 'critical')
  const warning = insights.filter((i) => i.severity === 'warning')
  const info = insights.filter((i) => i.severity === 'info')
  const positive = insights.filter((i) => i.severity === 'positive')

  const lastUpdated = latestRun?.completedAt
    ? new Date(latestRun.completedAt).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      })
    : null

  return (
    <div className="space-y-6">
      {/* Daily summary from LLM */}
      {latestRun?.dailySummary && (
        <div className="rounded-lg bg-muted/50 border p-4">
          <p className="text-sm italic text-foreground">{latestRun.dailySummary}</p>
        </div>
      )}

      {/* Last updated */}
      {lastUpdated && (
        <p className="text-xs text-muted-foreground">
          Última análise: {lastUpdated}
        </p>
      )}

      {insights.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Nenhum insight no momento. Os insights são gerados diariamente com base nos seus dados financeiros.
        </div>
      )}

      {critical.length > 0 && (
        <InsightSection title="Crítico" insights={critical} />
      )}
      {warning.length > 0 && (
        <InsightSection title="Atenção" insights={warning} />
      )}
      {info.length > 0 && (
        <InsightSection title="Informativo" insights={info} />
      )}
      {positive.length > 0 && (
        <InsightSection title="Positivo" insights={positive} />
      )}
    </div>
  )
}

function InsightSection({ title, insights }: { title: string; insights: CfoInsight[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        {title} ({insights.length})
      </h3>
      <div className="space-y-3">
        {insights.map((insight) => (
          <InsightCard key={insight.id} insight={insight} />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(app\)/cfo/page.tsx apps/web/app/\(app\)/cfo/client.tsx
git commit -m "feat(cfo): add dedicated /cfo page with insight sections"
```

---

### Task 18: Sidebar — Add CFO Navigation Item with Badge

**Files:**
- Modify: `apps/web/components/layout/sidebar.tsx`
- Modify: `apps/web/app/(app)/layout.tsx` (pass badge count as prop)

The sidebar is a `'use client'` component, so the badge count must be passed from the server layout.

- [ ] **Step 1: Add import and nav item**

In `apps/web/components/layout/sidebar.tsx`:

1. Add `Bot` to the lucide-react import (line 27 area)
2. Add a `cfoBadgeCount` optional prop to `SidebarProps`
3. Add a new nav section before "Cadastros":

```typescript
{
  title: 'Inteligência',
  items: [
    { href: '/cfo', label: 'CFO Pessoal', icon: Bot },
  ],
},
```

4. In the `NavLink` component, add badge rendering for `/cfo` when `cfoBadgeCount > 0`:

```typescript
// Inside NavLink, after the label span:
{item.href === '/cfo' && cfoBadgeCount > 0 && (
  <span className={cn(
    'ml-auto rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700',
    collapsed && 'lg:hidden',
  )}>
    {cfoBadgeCount}
  </span>
)}
```

- [ ] **Step 2: Pass badge count from layout**

In `apps/web/app/(app)/layout.tsx`, import `getInsightBadgeCount` and pass to `Sidebar`:

```typescript
import { getInsightBadgeCount } from '@/lib/cfo/queries'

// Inside the layout:
const cfoBadgeCount = await getInsightBadgeCount(orgId)

<Sidebar userEmail={email} userName={name} avatarUrl={avatarUrl} cfoBadgeCount={cfoBadgeCount} />
```

- [ ] **Step 3: Verify build**

Run: `cd apps/web && pnpm tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/layout/sidebar.tsx apps/web/app/\(app\)/layout.tsx
git commit -m "feat(cfo): add CFO Pessoal to sidebar with alert badge"
```

---

## Phase 2 — LLM Integration

---

### Task 19: LLM Provider Interface + Anthropic Implementation

**Files:**
- Create: `packages/core-finance/src/cfo/llm/provider.ts` (already in types, just re-export)
- Create: `packages/core-finance/src/cfo/llm/anthropic.ts`
- Create: `packages/core-finance/src/cfo/llm/prompts.ts`
- Create: `packages/core-finance/src/cfo/llm/synthesizer.ts`

- [ ] **Step 1: Create prompts**

```typescript
// packages/core-finance/src/cfo/llm/prompts.ts

export const CFO_SYSTEM_PROMPT = `Você é um CFO pessoal. Seu papel é analisar dados financeiros e gerar insights acionáveis.

Regras:
- Seja direto e objetivo. Nada de jargão financeiro desnecessário.
- Use tom firme mas empático — como um amigo que entende de finanças.
- Nunca invente dados. Trabalhe apenas com os números fornecidos.
- Priorize insights por impacto real na vida financeira.
- Quando correlacionar insights, explique a conexão de forma clara.
- Textos curtos: título em até 60 caracteres, body em 2-3 frases, detail em até 200 palavras.
- Responda SEMPRE em português brasileiro.
- Retorne JSON válido no formato especificado.`

export function buildSynthesisPrompt(insightsJson: string, contextJson: string): string {
  return `Analise os insights financeiros abaixo e gere uma síntese humanizada.

## Insights (da análise determinística):
${insightsJson}

## Contexto financeiro:
${contextJson}

## Formato de resposta (JSON):
{
  "prioritizedInsights": [
    {
      "title": "Título humanizado (max 60 chars)",
      "body": "Explicação em 2-3 frases diretas",
      "detailMarkdown": "Análise detalhada com dados, tendências e recomendações",
      "correlatedWith": ["type_de_outro_insight_relacionado"]
    }
  ],
  "dailySummary": "Resumo geral em 1-2 frases"
}

IMPORTANTE:
- Retorne EXATAMENTE o mesmo número de itens em prioritizedInsights que os insights de entrada, NA MESMA ORDEM.
- Não altere severity, metric ou suggestedAction — apenas title, body e detailMarkdown.
- correlatedWith pode referenciar types de outros insights para indicar conexão.`
}
```

- [ ] **Step 2: Create Anthropic provider**

```typescript
// packages/core-finance/src/cfo/llm/anthropic.ts
import type { LLMProvider, SynthesisInput, SynthesisOutput } from '../types'
import { CFO_SYSTEM_PROMPT, buildSynthesisPrompt } from './prompts'

interface AnthropicConfig {
  apiKey: string
  model?: string
  maxTokens?: number
  timeoutMs?: number
}

export function createAnthropicProvider(config: AnthropicConfig): LLMProvider {
  const model = config.model ?? 'claude-sonnet-4-20250514'
  const maxTokens = config.maxTokens ?? 2000
  const timeoutMs = config.timeoutMs ?? 15000

  return {
    async synthesize(input: SynthesisInput): Promise<SynthesisOutput> {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)

      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            system: CFO_SYSTEM_PROMPT,
            messages: [
              {
                role: 'user',
                content: buildSynthesisPrompt(
                  JSON.stringify(input.insights),
                  JSON.stringify(input.financialContext),
                ),
              },
            ],
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`Anthropic API error: ${response.status}`)
        }

        const data = await response.json()
        const text = data.content?.[0]?.text ?? ''
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (!jsonMatch) throw new Error('No JSON in response')

        return JSON.parse(jsonMatch[0]) as SynthesisOutput
      } finally {
        clearTimeout(timer)
      }
    },
  }
}
```

- [ ] **Step 3: Create synthesizer orchestrator**

```typescript
// packages/core-finance/src/cfo/llm/synthesizer.ts
import type { InsightResult, LLMProvider, SynthesisInput, SynthesisOutput } from '../types'

/**
 * Synthesize insights using an LLM provider.
 * Returns merged results: LLM text overwrites template text,
 * but severity/metric/suggestedAction stay from Layer 1.
 *
 * If LLM fails, returns null (caller should use template text).
 */
export async function synthesizeInsights(
  provider: LLMProvider,
  insights: InsightResult[],
  financialContext: SynthesisInput['financialContext'],
  locale = 'pt-BR',
): Promise<{ synthesized: SynthesisOutput } | null> {
  if (insights.length === 0) return null

  try {
    const output = await provider.synthesize({
      insights,
      financialContext,
      locale,
    })

    // Validate output shape
    if (
      !output.prioritizedInsights ||
      !Array.isArray(output.prioritizedInsights) ||
      output.prioritizedInsights.length !== insights.length
    ) {
      console.error('[CFO/LLM] Output mismatch: expected', insights.length, 'got', output.prioritizedInsights?.length)
      return null
    }

    return { synthesized: output }
  } catch (err) {
    console.error('[CFO/LLM] Synthesis failed:', err)
    return null
  }
}
```

- [ ] **Step 4: Export LLM modules**

Add to `packages/core-finance/src/index.ts`:

```typescript
export { createAnthropicProvider } from './cfo/llm/anthropic'
export { synthesizeInsights } from './cfo/llm/synthesizer'
```

- [ ] **Step 5: Commit**

```bash
git add packages/core-finance/src/cfo/llm/
git commit -m "feat(cfo): add LLM provider abstraction with Anthropic implementation"
```

---

### Task 20: Integrate LLM into Engine

**Files:**
- Modify: `apps/web/lib/cfo/engine.ts`

- [ ] **Step 1: Add LLM synthesis to engine**

Update `runCfoEngine` in `apps/web/lib/cfo/engine.ts` to optionally call LLM after Layer 1:

1. Import `synthesizeInsights` and `createAnthropicProvider` from `@floow/core-finance`
2. After running analyzers and getting insights, call `synthesizeInsights` if `ANTHROPIC_API_KEY` is set
3. Merge LLM output into insight rows (overwrite title/body/detailMarkdown)
4. Update `cfo_runs.llm_called` and `llm_tokens_used`

The key logic:

```typescript
// After: const insights = runAnalyzers(inputs, analyzersToRun)
// Before: saving to DB

let dailySummary: string | null = null

if (insights.length > 0 && process.env.ANTHROPIC_API_KEY) {
  const provider = createAnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY })
  const context = buildFinancialContext(inputs)
  const result = await synthesizeInsights(provider, insights, context)

  if (result) {
    // Merge LLM text into insights (1:1 by index)
    for (let i = 0; i < insights.length; i++) {
      const llmInsight = result.synthesized.prioritizedInsights[i]
      if (llmInsight) {
        insights[i].title = llmInsight.title
        insights[i].body = llmInsight.body
      }
    }
    dailySummary = result.synthesized.dailySummary

    await db
      .update(cfoRuns)
      .set({ llmCalled: true, dailySummary })
      .where(eq(cfoRuns.id, run.id))
  }
}
```

- [ ] **Step 2: Verify build**

Run: `cd apps/web && pnpm tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/cfo/engine.ts
git commit -m "feat(cfo): integrate LLM synthesis into engine"
```

---

## Phase 3 — Event Triggers

---

### Task 21: Trigger Helper Function

**Files:**
- Create: `apps/web/lib/cfo/trigger.ts`

- [ ] **Step 1: Create trigger helper**

```typescript
// apps/web/lib/cfo/trigger.ts
import type { InsightCategory } from '@floow/core-finance'

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * Fire-and-forget CFO analysis trigger.
 * Called from server actions after mutations.
 */
export function triggerCfoAnalysis(
  orgId: string,
  event: string,
  analyzers: InsightCategory[],
) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  fetch(`${baseUrl}/api/cfo/run-event`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ orgId, event, analyzers }),
  }).catch((err) => {
    console.error(`[CFO] Event trigger failed for org=${orgId} event=${event}:`, err)
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/lib/cfo/trigger.ts
git commit -m "feat(cfo): add fire-and-forget trigger helper"
```

---

### Task 22: Wire Triggers into Existing Server Actions

**Files:**
- Modify: `apps/web/lib/finance/actions.ts` (transaction mutations)
- Modify: `apps/web/lib/finance/debt-actions.ts` (debt mutations)
- Modify: `apps/web/lib/finance/budget-actions.ts` (budget mutations)
- Modify: `apps/web/lib/investments/actions.ts` (portfolio events)

- [ ] **Step 1: Add triggers to transaction actions**

In `apps/web/lib/finance/actions.ts`, after each transaction create/import function's `revalidateTag` call, add:

```typescript
import { triggerCfoAnalysis } from '@/lib/cfo/trigger'

// After revalidateTag in createTransaction / importTransactions:
triggerCfoAnalysis(orgId, 'transaction_created', ['cash_flow', 'budget', 'behavior'])
```

- [ ] **Step 2: Add triggers to debt actions**

In `apps/web/lib/finance/debt-actions.ts`, after `createDebt` and `updateDebt`:

```typescript
import { triggerCfoAnalysis } from '@/lib/cfo/trigger'

// After revalidatePath in createDebt/updateDebt:
triggerCfoAnalysis(orgId, 'debt_changed', ['debt', 'retirement'])
```

- [ ] **Step 3: Add triggers to budget actions**

In `apps/web/lib/finance/budget-actions.ts`, after budget goal mutations:

```typescript
import { triggerCfoAnalysis } from '@/lib/cfo/trigger'

// After revalidateTag:
triggerCfoAnalysis(orgId, 'budget_changed', ['budget'])
```

- [ ] **Step 4: Add triggers to investment actions**

In `apps/web/lib/investments/actions.ts`, after portfolio event creation:

```typescript
import { triggerCfoAnalysis } from '@/lib/cfo/trigger'

// After revalidateTag:
triggerCfoAnalysis(orgId, 'portfolio_event_created', ['investment'])
```

- [ ] **Step 5: Verify build**

Run: `cd apps/web && pnpm tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/finance/actions.ts apps/web/lib/finance/debt-actions.ts apps/web/lib/finance/budget-actions.ts apps/web/lib/investments/actions.ts
git commit -m "feat(cfo): wire event triggers into existing server actions"
```

---

## Final — Run All Tests

### Task 23: Run Full Test Suite

- [ ] **Step 1: Run all CFO analyzer tests**

Run: `cd packages/core-finance && pnpm vitest run src/__tests__/cfo/`
Expected: All tests pass

- [ ] **Step 2: Run existing test suite to verify no regressions**

Run: `cd packages/core-finance && pnpm vitest run`
Expected: All existing tests still pass

- [ ] **Step 3: Type-check the full monorepo**

Run: `pnpm -r tsc --noEmit`
Expected: No errors across all packages
