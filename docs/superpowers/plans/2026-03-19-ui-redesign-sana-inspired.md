# UI Redesign — Sana AI Inspired — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Floow web app with a clean, minimal Sana AI-inspired aesthetic — flat sidebar, gray background with floating white cards, outline-by-default buttons.

**Architecture:** CSS variable tweaks + component-level styling changes. No data/logic changes. Safe migration order: add `primary` button variant first, migrate call sites, then swap default. New `PageHeader` component for consistency.

**Tech Stack:** Next.js 15, Tailwind CSS, shadcn/ui (Radix), Lucide icons

**Spec:** `docs/superpowers/specs/2026-03-18-ui-redesign-sana-inspired-design.md`

---

### Task 1: Update CSS Variables

**Files:**
- Modify: `apps/web/app/globals.css:1-59`

- [ ] **Step 1: Update border and radius variables**

In `globals.css`, update the `:root` block:

```css
--border: 0 0% 94%;
--radius: 0.75rem;
```

Keep `--background: 0 0% 100%;` unchanged (white). The gray background comes from `bg-gray-50` on the app layout wrapper.

- [ ] **Step 2: Verify the app builds**

Run: `cd apps/web && npx next build --no-lint 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/globals.css
git commit -m "style: soften border color and increase border radius"
```

---

### Task 2: Remove Card Shadow

**Files:**
- Modify: `apps/web/components/ui/card.tsx:12`

- [ ] **Step 1: Remove shadow from Card base class**

Change line 12 from:
```tsx
'rounded-xl border bg-card text-card-foreground shadow',
```
to:
```tsx
'rounded-xl border bg-card text-card-foreground',
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/ui/card.tsx
git commit -m "style: remove default shadow from Card component"
```

---

### Task 3: Update Table Header Styling

**Files:**
- Modify: `apps/web/components/ui/table.tsx:76`

- [ ] **Step 1: Add uppercase and smaller text to TableHead**

Change line 76 from:
```tsx
"h-10 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
```
to:
```tsx
"h-10 px-2 text-left align-middle text-xs font-medium uppercase tracking-wider text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/ui/table.tsx
git commit -m "style: make table headers uppercase and smaller"
```

---

### Task 4: Add Primary Button Variant (keep default unchanged)

**Files:**
- Modify: `apps/web/components/ui/button.tsx:7-35`

- [ ] **Step 1: Add `primary` variant only — do NOT change default yet**

Add the `primary` variant to the existing variants object. Leave `default` as-is (filled) so nothing breaks:

```tsx
variant: {
  default:
    'bg-primary text-primary-foreground shadow hover:bg-primary/90',
  primary:
    'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90',
  destructive:
    'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
  outline:
    'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground',
  secondary:
    'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
  ghost: 'hover:bg-accent hover:text-accent-foreground',
  link: 'text-primary underline-offset-4 hover:underline',
},
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/ui/button.tsx
git commit -m "style: add primary button variant (default unchanged)"
```

---

### Task 5: Migrate All Primary Action Buttons

**Files (31 buttons across 25 files):**

- [ ] **Step 1: Add `variant="primary"` to all primary action buttons**

Add `variant="primary"` to `<Button>` in each file below. For buttons that already have no variant (implicit default), add the prop. For buttons with `variant="default"`, change to `variant="primary"`.

**Note:** `confirm-dialog.tsx` confirm button should NOT get `variant="primary"` — it may use destructive styling contextually. Leave it as implicit default for now; it will become outline after the swap, which is appropriate since the dialog's confirm label/styling is controlled by the caller.

**Auth forms:**
- `apps/web/components/auth/login-form.tsx` — line ~76, submit button
- `apps/web/components/auth/signup-form.tsx` — line ~95, submit button
- `apps/web/components/auth/forgot-password-form.tsx` — line ~78, submit button
- `apps/web/components/auth/magic-link-form.tsx` — line ~70, submit button
- `apps/web/app/(auth)/auth/reset-password/page.tsx` — line ~117, submit button

**Finance:**
- `apps/web/components/finance/transaction-form.tsx` — line ~268, submit
- `apps/web/components/finance/import-form.tsx` — lines ~437, ~489, submit/navigate buttons
- `apps/web/components/finance/import-preview.tsx` — line ~169, confirm import
- `apps/web/components/finance/category-list.tsx` — lines ~121, ~183, ~188, save/create buttons
- `apps/web/components/finance/account-card.tsx` — line ~101, save button
- `apps/web/components/finance/account-summary-row.tsx` — line ~27, "Criar primeira conta"
- `apps/web/components/finance/transaction-list.tsx` — line ~186, save button
- `apps/web/components/finance/patrimony-summary.tsx` — line ~42, change `variant="default"` to `variant="primary"` (empty state CTA)
- `apps/web/app/(app)/accounts/page.tsx` — lines ~33, ~45, "Nova Conta" / "Criar Conta"
- `apps/web/app/(app)/accounts/new/page.tsx` — line ~107, submit
- `apps/web/app/(app)/transactions/page.tsx` — line ~56, "Nova Transação"

**Investments:**
- `apps/web/components/investments/asset-form.tsx` — line ~166, submit
- `apps/web/components/investments/asset-edit-form.tsx` — line ~81, submit
- `apps/web/components/investments/portfolio-event-form.tsx` — line ~333, submit
- `apps/web/components/investments/portfolio-event-edit-form.tsx` — line ~351, submit
- `apps/web/components/investments/position-table.tsx` — line ~174, save
- `apps/web/app/(app)/investments/page.tsx` — lines ~25, ~39, create buttons

**Planning:**
- `apps/web/components/planning/withdrawal-form.tsx` — line ~347, submit
- `apps/web/components/planning/simulation-form.tsx` — line ~423, submit
- `apps/web/components/planning/succession-form.tsx` — line ~379, submit
- `apps/web/components/planning/heir-list.tsx` — line ~139, add heir

**Billing:**
- `apps/web/components/billing/plan-card.tsx` — line ~123, "Fazer Upgrade"
- `apps/web/app/(app)/billing/success/page.tsx` — line ~49, "Ir para o Dashboard"

**Note:** `confirm-dialog.tsx` is intentionally excluded — see Step 1 note above.
**Note:** `patrimony-summary.tsx` — only the empty-state CTA (line ~42, `variant="default"`) gets `variant="primary"`. The bottom refresh button (line ~128, `variant="outline"`) stays as-is.
**Note:** `subscription-status.tsx` is intentionally excluded — "Gerenciar Assinatura" is a secondary action (already `variant="outline"`).

- [ ] **Step 2: Verify build**

Run: `cd apps/web && npx next build --no-lint 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/ apps/web/app/
git commit -m "style: migrate all primary action buttons to variant=primary"
```

---

### Task 5b: Swap Default Button Variant to Outline

**Files:**
- Modify: `apps/web/components/ui/button.tsx`

Now that all primary buttons explicitly use `variant="primary"`, it's safe to swap the default.

- [ ] **Step 1: Change default variant to outline**

Change the `default` variant from:
```tsx
default:
  'bg-primary text-primary-foreground shadow hover:bg-primary/90',
```
to:
```tsx
default:
  'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground',
```

- [ ] **Step 2: Verify build and spot-check**

Run: `cd apps/web && npx next build --no-lint 2>&1 | tail -5`
Expected: Build succeeds. Any button without explicit `variant` now renders as outline.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/ui/button.tsx
git commit -m "style: swap default button variant to outline"
```

---

### Task 6: Redesign Sidebar

**Files:**
- Modify: `apps/web/components/layout/sidebar.tsx:1-461`

- [ ] **Step 1: Update sidebar styles**

**In `NavLink` component (line ~91-109):** Change the className logic:

Replace active state `'bg-primary/10 text-primary'` with `'bg-gray-100 text-foreground'`.
Replace inactive state `'text-muted-foreground hover:bg-accent hover:text-accent-foreground'` with `'text-muted-foreground hover:bg-gray-50 hover:text-foreground'`.

**In the `<aside>` element (line ~372-377):** Change `bg-background` to `bg-white`. Change `border-r` (implicit) to explicit `border-r border-gray-100`.

**In the header div (line ~380):** Remove `border-b` class. Add `mb-2` to the container for spacing-only separation.

**In nav sections (lines ~421-444):** Remove the section title `<p>` elements and the collapsed divider `<div>`. Keep only the `mt-4` spacing between groups via the `idx > 0 && 'mt-4'` logic.

**In user footer (line ~448):** Remove `border-t`. Add `mt-auto` for bottom positioning.

**In `UserMenu` trigger button (lines ~276-299):** Hide the email line — remove the `<p>` with `text-[11px]` that shows `userEmail`.

**In `UserMenu` dropdown active states (lines ~234-250):** Update Billing and Settings link active states from `'bg-primary/10 text-primary'` to `'bg-gray-100 text-foreground'` to match the new NavLink style.

- [ ] **Step 2: Verify sidebar renders**

Run: `cd apps/web && npx next build --no-lint 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/layout/sidebar.tsx
git commit -m "style: redesign sidebar — flat minimal style, no section titles"
```

---

### Task 7: Create PageHeader Component

**Files:**
- Create: `apps/web/components/ui/page-header.tsx`

- [ ] **Step 1: Create the PageHeader component**

```tsx
interface PageHeaderProps {
  title: string
  description?: string
  children?: React.ReactNode
}

export function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/ui/page-header.tsx
git commit -m "feat: add reusable PageHeader component"
```

---

### Task 8: Apply PageHeader to All App Pages

**Files (16 pages in `app/(app)/`):**

- [ ] **Step 1: Replace inline headers with `<PageHeader>`**

In each file below, replace the inline `<h1 className="text-2xl font-semibold tracking-tight text-gray-900">` + surrounding `<div>` + optional `<p>` description with `<PageHeader>`. Add `import { PageHeader } from '@/components/ui/page-header'`.

Move action buttons (like "Nova Conta", "Nova Transação") into `<PageHeader>` as children.

Pages to update:
- `app/(app)/dashboard/page.tsx` — "Dashboard Financeiro"
- `app/(app)/accounts/page.tsx` — "Contas"
- `app/(app)/accounts/[accountId]/page.tsx` — dynamic account name
- `app/(app)/accounts/new/page.tsx` — (skip: form page, keep inline)
- `app/(app)/transactions/page.tsx` — "Transações"
- `app/(app)/categories/page.tsx` — "Categorias"
- `app/(app)/investments/page.tsx` — "Investimentos"
- `app/(app)/investments/dashboard/page.tsx` — "Dashboard de Investimentos"
- `app/(app)/investments/new/page.tsx` — "Novo Ativo / Evento"
- `app/(app)/investments/[assetId]/page.tsx` — dynamic asset name
- `app/(app)/investments/[assetId]/edit/page.tsx` — "Editar Ativo"
- `app/(app)/investments/income/page.tsx` — "Rendimentos"
- `app/(app)/investments/events/[eventId]/edit/page.tsx` — "Editar Evento"
- `app/(app)/planning/page.tsx` — "Planejamento Financeiro"
- `app/(app)/planning/fi-calculator/page.tsx` — "Calculadora FI"
- `app/(app)/planning/simulation/page.tsx` — "Simulação de Aposentadoria"
- `app/(app)/planning/withdrawal/page.tsx` — "Estratégia de Retirada"
- `app/(app)/planning/succession/page.tsx` — "Planejamento Sucessório"
- `app/(app)/billing/page.tsx` — "Plano e Assinatura"
- `app/(app)/billing/success/page.tsx` — (skip: special layout)

- [ ] **Step 2: Verify build**

Run: `cd apps/web && npx next build --no-lint 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/ui/page-header.tsx apps/web/app/
git commit -m "style: apply PageHeader component across all app pages"
```

---

### Task 9: Restructure Dashboard to Grid Layout

**Files:**
- Modify: `apps/web/app/(app)/dashboard/page.tsx`
- Modify: `apps/web/components/finance/quick-stats-row.tsx`
- Modify: `apps/web/components/finance/account-summary-row.tsx`
- Modify: `apps/web/components/finance/patrimony-summary.tsx`

- [ ] **Step 1: Update QuickStatsRow**

In `quick-stats-row.tsx`, update the stat cards to use simpler styling — remove `CardHeader`/`CardContent` wrappers, use plain divs inside `Card`:

```tsx
import { formatBRL } from '@floow/core-finance'
import { Card } from '@/components/ui/card'

interface QuickStatsRowProps {
  incomeCents: number
  expenseCents: number
  netCents: number
}

export function QuickStatsRow({ incomeCents, expenseCents, netCents }: QuickStatsRowProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Card className="p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Receitas do Mês
        </p>
        <p className="mt-2 text-xl font-bold text-green-700">{formatBRL(incomeCents)}</p>
      </Card>
      <Card className="p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Despesas do Mês
        </p>
        <p className="mt-2 text-xl font-bold text-red-600">{formatBRL(Math.abs(expenseCents))}</p>
      </Card>
      <Card className="p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Saldo do Mês
        </p>
        <p className={`mt-2 text-xl font-bold ${netCents >= 0 ? 'text-green-700' : 'text-red-600'}`}>
          {formatBRL(netCents)}
        </p>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Split StatsAndChartSection into two async components**

Currently `StatsAndChartSection` returns both `<QuickStatsRow>` and the `<CashFlowChart>` card in a fragment. Split it into:

**`StatsSection`** — fetches data and renders `<QuickStatsRow>` only.
**`ChartSection`** — fetches data and renders the `<CashFlowChart>` card only.

Both can share the same data fetch (duplicate is fine — Next.js deduplicates identical fetches within the same render).

```tsx
async function StatsSection({ orgId }: { orgId: string }) {
  const recentTransactions = await getRecentTransactions(orgId, 6)
  const cashFlowData = aggregateCashFlow(recentTransactions)
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const currentMonthData = cashFlowData.find((d) => d.month === currentMonth)
  return (
    <QuickStatsRow
      incomeCents={currentMonthData?.income ?? 0}
      expenseCents={currentMonthData?.expense ?? 0}
      netCents={currentMonthData?.net ?? 0}
    />
  )
}

async function ChartSection({ orgId }: { orgId: string }) {
  const recentTransactions = await getRecentTransactions(orgId, 6)
  const cashFlowData = aggregateCashFlow(recentTransactions)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Fluxo de Caixa — Últimos 6 Meses</CardTitle>
      </CardHeader>
      <CardContent>
        {cashFlowData.length === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
            Nenhuma transação encontrada.
          </div>
        ) : (
          <CashFlowChart data={cashFlowData} />
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: Update dashboard page layout**

Replace the DashboardPage return with the new grid structure:

```tsx
export default async function DashboardPage() {
  const orgId = await getOrgId()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard Financeiro"
        description="Visão geral do seu patrimônio e fluxo de caixa"
      />

      {/* Stats Row */}
      <Suspense fallback={<SectionSkeleton />}>
        <StatsSection orgId={orgId} />
      </Suspense>

      {/* Chart + Accounts Grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Suspense fallback={<SectionSkeleton />}>
          <ChartSection orgId={orgId} />
        </Suspense>
        <Suspense fallback={<SectionSkeleton />}>
          <AccountSection orgId={orgId} />
        </Suspense>
      </div>

      {/* Patrimony */}
      <Suspense fallback={<SectionSkeleton />}>
        <PatrimonySection orgId={orgId} />
      </Suspense>
    </div>
  )
}
```

Remove the old `StatsAndChartSection` and the inline `<h2>` sub-headers (`"Contas"`, `"Resumo do Mês"`).

- [ ] **Step 3: Update AccountSummaryRow for dashboard context**

In `account-summary-row.tsx`, remove the "Saldo Total" overview card (line 40-50) — this data now lives in the patrimony section. Keep the per-account list but render it as a compact list (not a grid of cards) suitable for the sidebar column in the dashboard grid.

- [ ] **Step 4: Verify build**

Run: `cd apps/web && npx next build --no-lint 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/(app)/dashboard/ apps/web/components/finance/quick-stats-row.tsx apps/web/components/finance/account-summary-row.tsx apps/web/components/finance/patrimony-summary.tsx
git commit -m "style: restructure dashboard to grid layout with stat cards"
```

---

### Task 10: Visual QA Pass

- [ ] **Step 1: Run dev server and check all pages**

Run: `cd apps/web && npx next dev`

Manually verify each page:
- `/dashboard` — grid layout, stats row, chart + accounts, patrimony card
- `/accounts` — PageHeader, outline buttons for secondary, primary for create
- `/transactions` — PageHeader, filter pills, table with uppercase headers
- `/categories` — PageHeader, primary buttons for create/save
- `/investments` — PageHeader, primary buttons
- `/planning` — PageHeader, primary buttons
- `/billing` — PageHeader, outline for manage
- Sidebar — flat, no section titles, gray active state, white background

Check:
- No shadows on cards (all pages)
- Gray background visible behind white cards
- Buttons correctly categorized (primary filled, secondary outline)
- Sidebar active state is subtle gray
- Page headers consistent across all pages

- [ ] **Step 2: Fix any visual regressions found**

- [ ] **Step 3: Final commit with any fixes**

```bash
git add apps/web/
git commit -m "style: visual QA fixes for UI redesign"
```
