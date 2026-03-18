# Phase 4: Planning Engine - Context

**Gathered:** 2026-03-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can simulate retirement scenarios, calculate their financial independence timeline, view estimated passive income, plan withdrawal strategies, and create succession plans. This phase transforms accumulated financial and investment data into forward-looking projections and estate planning. No new financial instruments or investment features — this consumes data from Phases 2 and 3.

</domain>

<decisions>
## Implementation Decisions

### Simulation scenarios & assumptions
- Three scenarios (conservative, base, aggressive) start as **system presets with user override** — sensible defaults but advanced users can adjust return rates, inflation, and contribution growth per scenario
- User inputs: current age, target retirement age, life expectancy (default 85), monthly contribution (auto-suggested from recent transaction average), desired monthly income in retirement (today's money)
- **Auto-fill from existing data**: current portfolio value from investments engine, current passive income from `estimateMonthlyIncome()`, net worth from latest patrimony snapshot. User confirms or adjusts
- Inflation handling: **both views** — calculate in real terms internally, offer toggle to show nominal projections with user-defined inflation rate

### Financial independence calculator
- **Separate dedicated page** from retirement simulation — own page with focused inputs (target passive income, current portfolio, growth rate)
- FI date and required portfolio size are the key outputs

### Passive income estimate (PLAN-03)
- **Both**: card on planning dashboard showing current estimate, AND detailed breakdown within retirement simulation showing projected future passive income at retirement age
- Leverages existing `estimateMonthlyIncome()` from core-finance

### Planning dashboard
- **Planning hub page** at `/planning` with summary cards: current passive income, FI progress, retirement readiness, succession plan status
- Each card links to its detailed page (simulation, FI calculator, withdrawal, succession)
- Pattern follows `/investments/dashboard`

### Projection visualization
- **Multi-line Recharts LineChart** with 3 scenario lines (conservative, base, aggressive), vertical marker at retirement age
- Reuses existing ChartContainer/Recharts pattern from NetWorthEvolution
- **Yearly granularity** — one data point per year (retirement planning is 10-40 year horizon)

### Withdrawal strategy
- User can choose **either** fixed monthly amount OR percentage-based (4% rule) — toggle between modes
- Fixed amount: system shows how long portfolio lasts under each scenario
- Percentage-based: system calculates resulting monthly income
- Asset liquidation order: **presets with manual override** — system offers preset strategies (conservative, tax-efficient, income-preserving), user can customize the order
- **Depletion chart**: line chart showing portfolio value declining over time, clear marker when it hits zero
- **Saved to database** — appears on planning dashboard, can be revisited and edited

### Succession plan
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

</decisions>

<specifics>
## Specific Ideas

- Auto-fill from existing data is key — the user already has portfolio value, passive income, and net worth computed. Don't ask them to re-enter what the system already knows
- Depletion chart is a powerful visual — "your money runs out in 2052" is the kind of insight that drives action
- Liquidity gap in succession planning is a real pain point for Brazilian investors — many have illiquid portfolios (real estate, FIIs) but don't realize estate settlement requires cash upfront
- ITCMD rates vary by state and change over time — include a disclaimer that this is an estimate, not tax advice

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `computeSnapshot()` in `core-finance/snapshot.ts`: pure function for net worth calculation — provides current portfolio value baseline for projections
- `computePosition()` in `core-finance/portfolio.ts`: position calculation engine — can feed current holdings into withdrawal simulations
- `aggregateIncome()` / `estimateMonthlyIncome()` in `core-finance/income.ts`: income aggregation — directly provides PLAN-03 passive income estimate
- `formatBRL()`: currency formatting utility already in use everywhere
- `NetWorthEvolution` component: Recharts LineChart pattern to replicate for projection charts
- `PatrimonySummary` component: Card-based summary pattern to replicate for planning dashboard cards
- `ChartContainer` / `ChartTooltip` from shadcn/ui: chart wrapper components already configured

### Established Patterns
- Pure function pattern: computation in `core-finance/` (no DB), DB wrapper in separate `-db.ts` file — apply same pattern for simulation engine
- Integer cents for all monetary values — projections must maintain this convention
- Server actions for mutations (not API routes) — established in Phase 1-3
- Client components import from submodules (e.g., `@floow/core-finance/src/balance`) to avoid bundling Node-only code
- `getOrgId()` for tenant isolation — all planning data must be org-scoped

### Integration Points
- Planning pages under `apps/web/app/(app)/planning/` — new route group
- Navigation: add "Planejamento" to sidebar/nav alongside Finanças and Investimentos
- Planning engine functions in `packages/core-finance/src/` (new files: simulation.ts, withdrawal.ts, succession.ts)
- New DB tables in `packages/db/src/schema/` for saved plans (retirement params, withdrawal strategy, succession plan, heirs)
- Planning dashboard reads from investments queries (`getPortfolioSummary`, `getPatrimonySnapshots`) and income queries

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-planning-engine*
*Context gathered: 2026-03-17*
