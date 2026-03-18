# Phase 4: Planning Engine - Research

**Researched:** 2026-03-17
**Domain:** Financial simulation engine, retirement projections, succession planning (Brazilian market)
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- Three scenarios (conservative, base, aggressive) start as **system presets with user override** — sensible defaults but advanced users can adjust return rates, inflation, and contribution growth per scenario
- User inputs: current age, target retirement age, life expectancy (default 85), monthly contribution (auto-suggested from recent transaction average), desired monthly income in retirement (today's money)
- **Auto-fill from existing data**: current portfolio value from investments engine, current passive income from `estimateMonthlyIncome()`, net worth from latest patrimony snapshot. User confirms or adjusts
- Inflation handling: **both views** — calculate in real terms internally, offer toggle to show nominal projections with user-defined inflation rate
- **Separate dedicated page** for FI calculator from retirement simulation — own page with focused inputs (target passive income, current portfolio, growth rate)
- **Both**: card on planning dashboard showing current passive income estimate, AND detailed breakdown within retirement simulation showing projected future passive income at retirement age
- **Planning hub page** at `/planning` with summary cards: current passive income, FI progress, retirement readiness, succession plan status
- Each card links to its detailed page (simulation, FI calculator, withdrawal, succession)
- Pattern follows `/investments/dashboard`
- **Multi-line Recharts LineChart** with 3 scenario lines (conservative, base, aggressive), vertical marker at retirement age
- Reuses existing ChartContainer/Recharts pattern from NetWorthEvolution
- **Yearly granularity** — one data point per year (retirement planning is 10-40 year horizon)
- User can choose **either** fixed monthly amount OR percentage-based (4% rule) — toggle between modes
- Fixed amount: system shows how long portfolio lasts under each scenario
- Percentage-based: system calculates resulting monthly income
- Asset liquidation order: **presets with manual override**
- **Depletion chart**: line chart showing portfolio value declining over time, clear marker when it hits zero
- **Saved to database** — withdrawal strategy appears on planning dashboard, can be revisited and edited
- **Simple heir distribution**: user adds heirs (name, relationship), assigns percentage of total estate to each
- System shows estimated value per heir based on current portfolio
- **Basic ITCMD tax estimation**: user selects their state, system calculates approximate inheritance tax per heir (4-8% range by Brazilian state)
- **Liquidity needs estimation**: calculate liquid cash needed to settle estate (ITCMD, funeral costs, legal fees, debts). Show "liquidity gap" if liquid assets don't cover settlement costs
- **Saved and editable** — persisted to DB, appears on planning dashboard, values update as portfolio changes

### Claude's Discretion

- Exact preset values for conservative/base/aggressive scenarios (return rates, inflation defaults)
- Planning dashboard card layout and visual design
- Chart tooltips, colors, and styling details
- Form layout and step-by-step flow for simulation inputs
- DB schema design for saved plans (withdrawal strategy, succession plan)
- Loading states and empty states for planning pages
- Disclaimer/legal text around tax estimates and financial projections

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PLAN-01 | User can simulate retirement (conservative, base, aggressive scenarios) | `simulateRetirement()` pure function in `packages/core-finance/src/simulation.ts`; compound growth formula over yearly granularity; three scenario lines in Recharts LineChart |
| PLAN-02 | User can calculate financial independence timeline | `calculateFIDate()` pure function; FI number = target annual passive income / safe withdrawal rate; binary search or year-by-year loop to find crossing year |
| PLAN-03 | User can view estimated passive income | `estimateMonthlyIncome()` already exists in `income.ts`; surface as card on planning dashboard and within simulation output |
| PLAN-04 | User can plan withdrawal strategy | `simulateWithdrawal()` pure function; two modes (fixed-amount vs percentage-based); depletion chart via Recharts; saved to new DB table |
| PLAN-05 | User can create estate/succession plan | Heir table, ITCMD rate table per state, liquidity gap computation; saved to new DB tables; disclaimer copy required |
</phase_requirements>

---

## Summary

Phase 4 is purely a computation and visualization phase — no new financial instruments, no external API integrations, no auth changes. All required source data (portfolio value, passive income, net worth, accounts, asset class breakdown) already exists in the database from Phases 2 and 3. The work is: (1) build pure computation functions in `packages/core-finance/src/`, (2) create new DB tables for persisted plans, (3) build four new route pages under `apps/web/app/(app)/planning/`, and (4) wire Recharts charts using the exact same pattern as `NetWorthEvolution`.

The most technically complex part is the retirement simulation engine itself — compound growth with inflation adjustment, three independent scenario paths, and contribution growth. The math is well-understood (Future Value formula with periodic contributions) but must be implemented with integer-cents convention throughout, rounding at each yearly step to avoid drift. The succession/ITCMD piece is the most domain-specific — Brazilian ITCMD rates vary by state (4-8%) and are set annually by state laws; the feature requires a hardcoded rate table with a clear disclaimer.

The established codebase pattern — pure computation functions in `core-finance/` with no DB I/O, thin DB wrappers in `-db.ts` files, Server Actions for mutations, RSC + Suspense for data fetching, and `getOrgId()` for all tenant isolation — applies uniformly to every part of Phase 4.

**Primary recommendation:** Build `simulation.ts`, `withdrawal.ts`, and `succession.ts` as pure function modules in `packages/core-finance/src/`, following the exact pattern of `snapshot.ts` + `snapshot-db.ts`. Then build pages bottom-up: planning hub last (it aggregates cards from all sub-pages).

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| recharts | (already installed) | Multi-line LineChart for scenario and depletion charts | Established pattern — `NetWorthEvolution` and `IncomeChart` already use it |
| @shadcn/ui ChartContainer | (already installed) | Chart wrapper, required for correct sizing | Project standard — all charts use it |
| drizzle-orm | ^0.40.0 | New planning tables schema + queries | Established ORM for this project |
| zod | catalog: | Input validation schemas for planning forms | Established — all forms use zod + `@floow/shared` schemas |
| react-hook-form | (already installed) | Forms for simulation inputs, withdrawal config, heir management | Established pattern for all Phase 2-3 forms |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@floow/core-finance/src/income` | internal | `estimateMonthlyIncome()` for PLAN-03 | Import via submodule path (not barrel) in client components |
| `@floow/core-finance/src/snapshot` | internal | `computeSnapshot()` for current net worth baseline | Server-side only — already used by snapshot-db.ts |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pure function engine in core-finance | Server Action inline logic | Pure function is testable, reusable, consistent with project pattern |
| Hardcoded ITCMD table | External tax API | No reliable free API; rates change slowly; hardcoded + disclaimer is appropriate for MVP |
| Database-persisted simulation params | Session/localStorage | DB is required — plans must appear on dashboard, survive sessions |

**Installation:**

No new packages required — all necessary libraries are already installed.

---

## Architecture Patterns

### Recommended Project Structure

```
packages/core-finance/src/
├── simulation.ts          # Pure: simulateRetirement(), calculateFIDate()
├── withdrawal.ts          # Pure: simulateWithdrawal(), depletion projection
├── succession.ts          # Pure: calcItcmd(), calcLiquidityGap()
├── planning-db.ts         # DB wrappers: saveRetirementPlan(), getRetirementPlan(), etc.
└── __tests__/
    ├── simulation.test.ts
    ├── withdrawal.test.ts
    └── succession.test.ts

packages/db/src/schema/
└── planning.ts            # retirementPlans, withdrawalStrategies, successionPlans, heirs tables

apps/web/app/(app)/planning/
├── page.tsx               # Planning hub (summary cards, links to sub-pages)
├── simulation/
│   └── page.tsx           # Retirement simulation (3-scenario chart)
├── fi-calculator/
│   └── page.tsx           # Financial independence calculator
├── withdrawal/
│   └── page.tsx           # Withdrawal strategy builder + depletion chart
└── succession/
    └── page.tsx           # Succession plan + heir management + ITCMD

apps/web/lib/planning/
├── queries.ts             # Server queries for planning data
└── actions.ts             # Server actions: saveRetirementPlan, saveWithdrawalStrategy, saveSuccessionPlan

apps/web/components/planning/
├── planning-summary-row.tsx       # Hub summary cards (passive income, FI progress, etc.)
├── retirement-simulation-chart.tsx  # Multi-line chart (3 scenarios)
├── depletion-chart.tsx            # Withdrawal depletion line chart
├── fi-calculator-form.tsx         # FI inputs form
├── simulation-form.tsx            # Retirement simulation inputs form
├── withdrawal-form.tsx            # Withdrawal strategy form
├── succession-form.tsx            # Heir management form
└── heir-list.tsx                  # Heir rows with percentage inputs
```

### Pattern 1: Pure Simulation Function

**What:** Each computation lives in a pure TypeScript function with no DB or framework dependency, accepting plain numeric inputs and returning a plain numeric/array output.

**When to use:** All simulation, projection, and tax calculation logic — anything that needs to be unit-tested in isolation.

**Example (simulation.ts):**
```typescript
// Source: established project pattern (snapshot.ts, portfolio.ts, income.ts)

export interface RetirementScenarioParams {
  currentPortfolioCents: number        // integer cents
  monthlyContributionCents: number     // integer cents
  currentAge: number
  retirementAge: number
  lifeExpectancy: number
  desiredMonthlyIncomeCents: number    // in today's money (real terms)
  annualRealReturnRate: number         // e.g. 0.06 for 6% real
  annualContributionGrowthRate: number // e.g. 0.03 for 3% real growth
}

export interface RetirementYearPoint {
  year: number
  age: number
  portfolioCents: number  // integer cents, rounded each step
}

export function simulateRetirementScenario(
  params: RetirementScenarioParams
): RetirementYearPoint[] {
  const { currentPortfolioCents, monthlyContributionCents, currentAge,
          retirementAge, lifeExpectancy, annualRealReturnRate,
          annualContributionGrowthRate } = params

  const points: RetirementYearPoint[] = []
  let portfolioCents = currentPortfolioCents
  let annualContributionCents = monthlyContributionCents * 12
  const currentYear = new Date().getFullYear()

  for (let age = currentAge; age <= lifeExpectancy; age++) {
    points.push({ year: currentYear + (age - currentAge), age, portfolioCents })

    if (age < retirementAge) {
      // Accumulation phase: apply growth + add contributions
      portfolioCents = Math.round(portfolioCents * (1 + annualRealReturnRate))
      portfolioCents += Math.round(annualContributionCents)
      annualContributionCents = Math.round(annualContributionCents * (1 + annualContributionGrowthRate))
    } else {
      // Withdrawal phase: apply growth, subtract desired income
      portfolioCents = Math.round(portfolioCents * (1 + annualRealReturnRate))
      portfolioCents -= params.desiredMonthlyIncomeCents * 12
      if (portfolioCents < 0) portfolioCents = 0
    }
  }

  return points
}
```

### Pattern 2: Three-Scenario Chart

**What:** A single `LineChart` with three `<Line>` components (one per scenario) plus a `ReferenceLine` for retirement age.

**When to use:** PLAN-01 retirement simulation chart.

**Example (retirement-simulation-chart.tsx):**
```typescript
// Source: established pattern from NetWorthEvolution
'use client'

import { LineChart, Line, XAxis, CartesianGrid, ReferenceLine } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { formatBRL } from '@floow/core-finance'
import type { RetirementYearPoint } from '@floow/core-finance/src/simulation'

const chartConfig = {
  conservative: { label: 'Conservador', color: '#dc2626' },
  base:         { label: 'Base',        color: '#2563eb' },
  aggressive:   { label: 'Arrojado',    color: '#16a34a' },
}

interface RetirementSimulationChartProps {
  conservative: RetirementYearPoint[]
  base: RetirementYearPoint[]
  aggressive: RetirementYearPoint[]
  retirementAge: number
  currentAge: number
}

export function RetirementSimulationChart({
  conservative, base, aggressive, retirementAge, currentAge
}: RetirementSimulationChartProps) {
  // Merge three series into one data array keyed by year
  const data = base.map((b, i) => ({
    age: b.age,
    conservative: conservative[i]?.portfolioCents ?? 0,
    base: b.portfolioCents,
    aggressive: aggressive[i]?.portfolioCents ?? 0,
  }))

  const retirementYear = new Date().getFullYear() + (retirementAge - currentAge)

  return (
    <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
      <LineChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="age" tickLine={false} axisLine={false} tickMargin={8} />
        <ReferenceLine x={retirementAge} stroke="#94a3b8" strokeDasharray="4 4"
                       label={{ value: `Aposentadoria (${retirementYear})`, position: 'top' }} />
        <ChartTooltip
          content={<ChartTooltipContent formatter={(v) => formatBRL(v as number)} />}
        />
        <Line type="monotone" dataKey="conservative" stroke="#dc2626" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="base"         stroke="#2563eb" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="aggressive"   stroke="#16a34a" strokeWidth={2} dot={false} />
      </LineChart>
    </ChartContainer>
  )
}
```

### Pattern 3: DB Schema for Saved Plans

**What:** New planning tables in `packages/db/src/schema/planning.ts`, following existing `finance.ts` / `investments.ts` conventions.

**When to use:** Persisting withdrawal strategies and succession plans.

```typescript
// Source: established pattern from finance.ts and investments.ts
import { pgTable, pgEnum, uuid, text, integer, boolean, timestamp, numeric } from 'drizzle-orm/pg-core'
import { orgs } from './auth'

// Withdrawal strategy: one per org (upsert pattern)
export const withdrawalStrategies = pgTable('withdrawal_strategies', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  mode: text('mode').notNull(),            // 'fixed' | 'percentage'
  fixedMonthlyAmountCents: integer('fixed_monthly_amount_cents'),
  percentageRate: numeric('percentage_rate', { precision: 5, scale: 4 }),
  liquidationPreset: text('liquidation_preset').notNull().default('income_preserving'),
  customLiquidationOrder: text('custom_liquidation_order'), // JSON array of asset classes
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// Succession plan: one per org
export const successionPlans = pgTable('succession_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  brazilianState: text('brazilian_state'),  // e.g. 'SP', 'RJ' — for ITCMD rate lookup
  estimatedFuneralCostsCents: integer('estimated_funeral_costs_cents').notNull().default(1500000),
  estimatedLegalFeesCents: integer('estimated_legal_fees_cents').notNull().default(500000),
  additionalLiabilitiesCents: integer('additional_liabilities_cents').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// Heirs: many per succession plan
export const heirs = pgTable('heirs', {
  id: uuid('id').primaryKey().defaultRandom(),
  successionPlanId: uuid('succession_plan_id').notNull()
    .references(() => successionPlans.id, { onDelete: 'cascade' }),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  relationship: text('relationship').notNull(),  // e.g. 'filho', 'cônjuge', 'outro'
  percentageShare: numeric('percentage_share', { precision: 5, scale: 2 }).notNull(), // 0-100
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// Retirement simulation params: one per org (saved for dashboard display)
export const retirementPlans = pgTable('retirement_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  currentAge: integer('current_age').notNull(),
  retirementAge: integer('retirement_age').notNull(),
  lifeExpectancy: integer('life_expectancy').notNull().default(85),
  monthlyContributionCents: integer('monthly_contribution_cents').notNull(),
  desiredMonthlyIncomeCents: integer('desired_monthly_income_cents').notNull(),
  inflationRate: numeric('inflation_rate', { precision: 5, scale: 4 }).notNull().default('0.04'),
  // Scenario overrides (null = use system preset)
  conservativeReturnRate: numeric('conservative_return_rate', { precision: 5, scale: 4 }),
  baseReturnRate: numeric('base_return_rate', { precision: 5, scale: 4 }),
  aggressiveReturnRate: numeric('aggressive_return_rate', { precision: 5, scale: 4 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
```

### Pattern 4: Planning Page (RSC + Suspense)

**What:** Server Component page that reads orgId, passes to async sub-component wrapped in Suspense. Follows the exact `investments/dashboard/page.tsx` pattern.

**When to use:** Every planning page.

### Anti-Patterns to Avoid

- **Computing projections in a Server Action or API route triggered by page load**: projections are stateless pure math — compute them synchronously in the RSC (or in a Client Component for interactive re-computation on input changes). No DB write on page load for projections.
- **Storing computed projection series in DB**: only store *inputs* (scenario params, withdrawal config, heir data). Recompute projections on demand from inputs.
- **Importing from barrel `@floow/core-finance`** in client components: use submodule paths (`@floow/core-finance/src/simulation`) to avoid bundling Node-only code (ofx-js). This is the established project pattern.
- **Floating-point math for projections**: always keep intermediate values as integer cents, round at each yearly step with `Math.round()`.
- **Percentage fields as floats in DB**: use `numeric` (stored as string in Drizzle) for rates and percentages — consistent with `splitRatio` pattern.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Chart rendering | Custom SVG projection chart | Recharts (already installed) | Already proven for NetWorthEvolution — same API |
| Form validation | Manual field checks | zod + react-hook-form (already installed) | Established pattern, all forms in the app use it |
| Org scoping | Custom middleware | `getOrgId()` from `@/lib/finance/queries` | Established function reads JWT app_metadata |
| Currency formatting | Custom formatter | `formatBRL()` from `@floow/core-finance` | Already used everywhere |
| Depletion "runs out" logic | Complex conditional rendering | Simple `portfolioCents === 0` check at each yearly step | Store depletion year in the projection output |

**Key insight:** This entire phase is data transformation + visualization. No new infrastructure. The simulation engine is self-contained math that maps inputs → typed output arrays consumed directly by Recharts.

---

## Common Pitfalls

### Pitfall 1: Real vs Nominal Confusion

**What goes wrong:** Simulation outputs a portfolio value in "today's money" when the chart label implies future nominal value — users misread the projection as pessimistic.

**Why it happens:** Mixing real-term computation (inflation-adjusted) with nominal display without labeling.

**How to avoid:** Calculate in real terms (constant today's money) as the default; the nominal toggle multiplies each data point by `(1 + inflationRate)^years` for display only. Label charts clearly: "valores em reais de hoje" vs "valores nominais".

**Warning signs:** Chart shows retirement portfolio of R$500k but user has R$2M current net worth with strong trajectory.

### Pitfall 2: Integer Cents Drift in Multi-Year Loops

**What goes wrong:** Each yearly compounding step introduces a rounding error; over 40 years this compounds to a materially wrong final value.

**Why it happens:** Using `Math.floor` (too conservative) or not rounding at each step.

**How to avoid:** Use `Math.round()` at every step. The error per step is at most R$0.005 (half a cent); over 40 years worst-case drift is 40 × R$0.005 = R$0.20 — negligible. Do NOT accumulate in floats and round only at display.

**Warning signs:** Two independent implementations of the same scenario produce results differing by more than R$1.

### Pitfall 3: ITCMD Rate Hardcoding Goes Stale

**What goes wrong:** Brazilian states update ITCMD rates; hardcoded rates become outdated and the feature becomes legally problematic.

**Why it happens:** Tax rates are treated as permanent constants.

**How to avoid:** (1) Add prominent disclaimer on succession page: "estimativa aproximada, consulte um advogado ou contador. Alíquotas sujeitas a alteração." (2) Store the ITCMD rate table in a `const` with a clear comment showing the source and year. (3) The `brazilianState` field in `successionPlans` allows future dynamic lookup.

**Warning signs:** User from a state that recently changed rates contacts support about incorrect tax estimate.

### Pitfall 4: Heir Percentages Don't Sum to 100

**What goes wrong:** User adds heirs with percentages that sum to 120% or 80% — estate distribution is invalid.

**Why it happens:** No sum validation across the heir list (each row validates individually).

**How to avoid:** Validate sum in the Server Action before insert/update; also show a running total in the form UI. Throw a descriptive error if total != 100. Consider "auto-normalize" as a UX convenience.

**Warning signs:** `successionPlans` queries return heirs summing to != 100.

### Pitfall 5: "One per org" Plan Records

**What goes wrong:** Multiple `retirementPlans` rows inserted for the same org when user saves repeatedly — dashboard shows stale data from old rows.

**Why it happens:** INSERT instead of UPSERT for "one plan per org" entities.

**How to avoid:** Use Drizzle's `.onConflictDoUpdate()` with a unique index on `orgId` for `retirementPlans`, `withdrawalStrategies`, and `successionPlans`. The unique constraint enforces the one-per-org invariant at the DB level.

### Pitfall 6: Client Component Importing from Barrel

**What goes wrong:** `import { simulateRetirement } from '@floow/core-finance'` — webpack bundles ofx-js (Node-only) into the browser bundle; build crashes.

**Why it happens:** The barrel `index.ts` re-exports everything including `import/ofx` which requires Node.js `Buffer`.

**How to avoid:** Always import from submodule path: `import { simulateRetirement } from '@floow/core-finance/src/simulation'`. This is an established pattern (see Phase 02-04 decision note).

---

## Code Examples

Verified patterns from official sources (project codebase):

### FI Calculator Formula

```typescript
// Source: standard financial math — FI Number = Annual Target Income / Safe Withdrawal Rate
// Project convention: integer cents throughout

export interface FIResult {
  fiNumberCents: number     // Required portfolio size to sustain target income forever
  fiYear: number | null     // Year when portfolio crosses FI number (null if unreachable)
  yearsToFI: number | null
}

export function calculateFI(params: {
  currentPortfolioCents: number
  monthlyContributionCents: number
  targetMonthlyPassiveIncomeCents: number
  annualRealReturnRate: number
  currentAge: number
  maxSearchYears?: number
}): FIResult {
  const { currentPortfolioCents, monthlyContributionCents,
          targetMonthlyPassiveIncomeCents, annualRealReturnRate,
          currentAge, maxSearchYears = 60 } = params

  // FI Number = annual target / rate (4% rule: rate = 0.04)
  // Using the user's actual growth rate as withdrawal rate for consistency
  const safeWithdrawalRate = annualRealReturnRate > 0 ? annualRealReturnRate : 0.04
  const fiNumberCents = Math.round((targetMonthlyPassiveIncomeCents * 12) / safeWithdrawalRate)

  let portfolioCents = currentPortfolioCents
  const currentYear = new Date().getFullYear()

  for (let yearsElapsed = 0; yearsElapsed <= maxSearchYears; yearsElapsed++) {
    if (portfolioCents >= fiNumberCents) {
      return {
        fiNumberCents,
        fiYear: currentYear + yearsElapsed,
        yearsToFI: yearsElapsed,
      }
    }
    portfolioCents = Math.round(portfolioCents * (1 + annualRealReturnRate))
    portfolioCents += monthlyContributionCents * 12
  }

  return { fiNumberCents, fiYear: null, yearsToFI: null }
}
```

### Withdrawal Depletion Simulation

```typescript
// Source: project pattern (simulation.ts will follow same structure)
export interface WithdrawalYearPoint {
  year: number
  age: number
  portfolioCents: number
  withdrawalCents: number
  depleted: boolean
}

export function simulateWithdrawal(params: {
  initialPortfolioCents: number
  mode: 'fixed' | 'percentage'
  fixedMonthlyWithdrawalCents?: number
  percentageRate?: number             // e.g. 0.04 for 4%
  annualRealReturnRate: number
  startAge: number
  endAge: number
}): WithdrawalYearPoint[] {
  const points: WithdrawalYearPoint[] = []
  let portfolioCents = params.initialPortfolioCents
  const currentYear = new Date().getFullYear()

  for (let age = params.startAge; age <= params.endAge; age++) {
    const withdrawalCents = params.mode === 'fixed'
      ? (params.fixedMonthlyWithdrawalCents ?? 0) * 12
      : Math.round(portfolioCents * (params.percentageRate ?? 0.04))

    const depleted = portfolioCents <= 0

    points.push({
      year: currentYear + (age - params.startAge),
      age,
      portfolioCents: Math.max(0, portfolioCents),
      withdrawalCents: depleted ? 0 : withdrawalCents,
      depleted,
    })

    if (!depleted) {
      portfolioCents = Math.round(portfolioCents * (1 + params.annualRealReturnRate))
      portfolioCents -= withdrawalCents
    }
  }

  return points
}
```

### ITCMD Rate Table (Brazilian States)

```typescript
// Source: Receita Federal / state law reference — rates current as of 2025
// DISCLAIMER: These are approximate rates. Actual rates may vary. Always consult a tax advisor.
// Rates represent the maximum marginal aliquot; many states use progressive tables.

export const ITCMD_RATES_BY_STATE: Record<string, number> = {
  AC: 0.04, AL: 0.04, AP: 0.04, AM: 0.04, BA: 0.08,
  CE: 0.08, DF: 0.06, ES: 0.04, GO: 0.04, MA: 0.04,
  MT: 0.08, MS: 0.06, MG: 0.05, PA: 0.04, PB: 0.08,
  PR: 0.04, PE: 0.08, PI: 0.04, RJ: 0.08, RN: 0.06,
  RS: 0.06, RO: 0.04, RR: 0.04, SC: 0.08, SP: 0.04,
  SE: 0.08, TO: 0.04,
}

export function calcItcmd(estateCents: number, state: string): number {
  const rate = ITCMD_RATES_BY_STATE[state.toUpperCase()] ?? 0.05
  return Math.round(estateCents * rate)
}

export function calcLiquidityGap(params: {
  totalEstateCents: number
  liquidAssetsCents: number       // from computeSnapshot()
  brazilianState: string
  heirCount: number
  estimatedFuneralCostsCents?: number
  estimatedLegalFeesCents?: number
  additionalLiabilitiesCents?: number
}): { requiredLiquidityCents: number; liquidityGapCents: number; itcmdTotalCents: number } {
  const itcmdTotalCents = calcItcmd(params.totalEstateCents, params.brazilianState)
  const funeralCosts = params.estimatedFuneralCostsCents ?? 1500000      // R$15k default
  const legalFees = params.estimatedLegalFeesCents ?? 500000              // R$5k default
  const additionalLiabilities = params.additionalLiabilitiesCents ?? 0

  const requiredLiquidityCents = itcmdTotalCents + funeralCosts + legalFees + additionalLiabilities
  const liquidityGapCents = Math.max(0, requiredLiquidityCents - params.liquidAssetsCents)

  return { requiredLiquidityCents, liquidityGapCents, itcmdTotalCents }
}
```

### Server Action Pattern (planning)

```typescript
// Source: established pattern from apps/web/lib/investments/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { getDb, withdrawalStrategies } from '@floow/db'
import { eq } from 'drizzle-orm'
import { getOrgId } from '@/lib/finance/queries'

export async function saveWithdrawalStrategy(input: WithdrawalStrategyInput) {
  const orgId = await getOrgId()
  const db = getDb()

  // Upsert — one strategy per org
  await db
    .insert(withdrawalStrategies)
    .values({ orgId, ...input })
    .onConflictDoUpdate({
      target: withdrawalStrategies.orgId,
      set: { ...input, updatedAt: new Date() },
    })

  revalidatePath('/planning')
  revalidatePath('/planning/withdrawal')
}
```

---

## Scenario Preset Values (Claude's Discretion)

Based on Brazilian market context and standard financial planning conventions:

| Scenario | Real Annual Return | Annual Contribution Growth | Rationale |
|----------|--------------------|---------------------------|-----------|
| Conservative | 4.0% real | 2.0% real | CDI-like returns in real terms; modest contribution growth |
| Base | 6.0% real | 3.0% real | Mixed equity + fixed income portfolio; moderate growth |
| Aggressive | 9.0% real | 4.0% real | Equity-heavy (IBOV historical ~10% real minus fees); higher contribution growth |

Default inflation rate: **4.0%** (Brazil IPCA long-term target range).

These are reasonable baselines for the Brazilian market. Users with advanced knowledge can override all four parameters per scenario.

**Confidence:** MEDIUM — Based on historical Brazilian market data and standard FP practices. No single authoritative source dictates these values; they reflect community consensus.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| API route for mutations | Server Actions | Phase 1-2 | Simpler, co-located, no extra endpoint |
| Prisma ORM | Drizzle ORM | Phase 1 | SQL-closer, better for financial domain |
| Barrel imports for all packages | Submodule imports for client components | Phase 2-04 | Prevents Node-only code bundling into browser |

**Deprecated/outdated in this project:**

- Two-separate-SQL-calls for atomic mutations: replaced by `db.transaction()` since Phase 02-04
- `getUser()` from Supabase in layouts: replaced by `getSession()` to avoid network call (Phase 01-03)

---

## Open Questions

1. **Retirement plan persistence: one-per-org or version history?**
   - What we know: CONTEXT.md says "saved and editable" but doesn't specify if old versions are kept
   - What's unclear: Whether the user expects to see "last saved simulation" or a full history
   - Recommendation: One-per-org (upsert) for MVP — matches withdrawal strategy and succession plan behavior; simpler DB schema; history is v2+

2. **FI calculator: separate saved state or always computed live?**
   - What we know: CONTEXT.md specifies a separate dedicated page; doesn't explicitly say "save" the FI params
   - What's unclear: Whether FI inputs should be persisted to DB or always re-entered
   - Recommendation: Persist FI params in `retirementPlans` table (reuse the same table — retirement simulation and FI calculator share the core inputs: current age, portfolio, contribution, growth rate). FI page pre-fills from saved retirement plan if it exists.

3. **Nominal toggle: client-side or server-side?**
   - What we know: User can toggle between real and nominal views; inflation rate is user-defined
   - What's unclear: Whether to pre-compute both series server-side or apply the transform client-side
   - Recommendation: Apply nominal transform client-side (multiply each `portfolioCents` by `(1 + inflationRate)^year` in a `useMemo`). The base projection data stays in real terms in state; nominal is a display-time transform. No server round-trip needed.

4. **ITCMD progressive tables vs flat rates**
   - What we know: Several states (SP, RJ, RS) use progressive ITCMD tables, not flat rates; the current hardcoded table uses maximum marginal rates
   - What's unclear: Whether to implement progressive tables for accuracy
   - Recommendation: Use maximum flat rate for MVP with clear disclaimer "alíquota máxima estimada — consulte um especialista". Progressive tables are complex and change annually; feature is advisory not precise.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.x |
| Config file | `packages/core-finance/vitest.config.ts` |
| Quick run command | `pnpm --filter @floow/core-finance test` |
| Full suite command | `pnpm test` (turbo — all packages) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PLAN-01 | `simulateRetirementScenario()` returns correct yearly data | unit | `pnpm --filter @floow/core-finance test` (simulation.test.ts) | ❌ Wave 0 |
| PLAN-01 | Three scenarios produce different trajectories | unit | same | ❌ Wave 0 |
| PLAN-02 | `calculateFI()` returns correct FI number and year | unit | `pnpm --filter @floow/core-finance test` (simulation.test.ts) | ❌ Wave 0 |
| PLAN-02 | FI returns null when target unreachable in 60 years | unit | same | ❌ Wave 0 |
| PLAN-03 | `estimateMonthlyIncome()` already tested | unit | `pnpm --filter @floow/core-finance test` (income.test.ts) | ✅ |
| PLAN-04 | `simulateWithdrawal()` fixed-amount mode depletes correctly | unit | `pnpm --filter @floow/core-finance test` (withdrawal.test.ts) | ❌ Wave 0 |
| PLAN-04 | `simulateWithdrawal()` percentage mode stays solvent | unit | same | ❌ Wave 0 |
| PLAN-05 | `calcItcmd()` returns correct rate for known states | unit | `pnpm --filter @floow/core-finance test` (succession.test.ts) | ❌ Wave 0 |
| PLAN-05 | `calcLiquidityGap()` returns zero gap when liquid assets cover costs | unit | same | ❌ Wave 0 |
| PLAN-05 | Heir percentage sum validation rejects != 100 | unit | same | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm --filter @floow/core-finance test`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `packages/core-finance/src/__tests__/simulation.test.ts` — covers PLAN-01, PLAN-02
- [ ] `packages/core-finance/src/__tests__/withdrawal.test.ts` — covers PLAN-04
- [ ] `packages/core-finance/src/__tests__/succession.test.ts` — covers PLAN-05

*(No framework install needed — vitest is already configured and working)*

---

## Sources

### Primary (HIGH confidence)

- Project codebase (direct inspection): `packages/core-finance/src/` — all existing pure function patterns confirmed
- Project codebase: `apps/web/components/investments/net-worth-evolution.tsx` — Recharts pattern confirmed
- Project codebase: `packages/db/src/schema/investments.ts` — Drizzle schema conventions confirmed
- Project codebase: `apps/web/lib/investments/actions.ts` — Server Action pattern confirmed
- Project codebase: `packages/core-finance/vitest.config.ts` — test infrastructure confirmed

### Secondary (MEDIUM confidence)

- Brazilian ITCMD rates: compiled from state revenue secretariat sources (Receita Estadual); rates reflect 2024-2025 maximums. States included: all 26 states + DF.
- Standard FP scenario presets: based on Brazilian market historical data (CDI ~12% nominal ~6% real; IBOV ~15% nominal ~9% real historically) adjusted for real-term planning conventions.

### Tertiary (LOW confidence)

- Default funeral/legal cost estimates (R$15k + R$5k): based on general Brazilian market estimates. These are pre-filled defaults the user can override; accuracy is secondary.

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all libraries already installed and in active use in the project
- Architecture: HIGH — directly derived from established Phase 2-3 patterns in the codebase
- Simulation math: HIGH — standard compound growth formulas, integer-cents convention documented
- ITCMD rates: MEDIUM — hardcoded table based on 2024-2025 state laws; states may update rates
- Scenario presets: MEDIUM — reasonable for Brazilian market but not sourced from a single authoritative document

**Research date:** 2026-03-17
**Valid until:** 2026-06-17 (stable — no external API dependencies; ITCMD rates worth re-checking annually)
