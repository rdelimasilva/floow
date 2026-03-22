# UI Redesign — Sana AI Inspired

**Date:** 2026-03-18
**Status:** Approved

## Overview

Redesign the Floow web app UI/UX inspired by Sana AI's clean, minimal aesthetic. The goal is a lighter, more spacious interface with clear visual hierarchy — not a copy, but an evolution of the current design using the same tech stack (Tailwind CSS + shadcn/ui).

## Design Decisions

| Decision | Choice |
|----------|--------|
| Sidebar style | Minimalista flat — white bg, no section group headers, spacing-only separation, subtle hover, active item with `bg-gray-100` |
| Dashboard layout | Grid of cards — stats row (3 cols) + chart/accounts grid (2 cols) + patrimony card |
| Content background | Light gray (`#fafafa` / `bg-gray-50`) — white cards float on gray background |
| Page headers | Title + description + action buttons aligned right |
| Button strategy | Outline by default, filled (`bg-primary`) only for primary actions (create, save) |

## Architecture — What Changes

### 1. CSS Variables (`globals.css`)

- Do NOT change `--background` — keep it white (`0 0% 100%`). The gray background is already applied via `bg-gray-50` on the app layout wrapper in `app/(app)/layout.tsx`.
- Change `--border` to a softer value: `0 0% 94%` (`#f0f0f0`)
- Increase `--radius` from `0.5rem` to `0.75rem` for rounder cards

### 2. Sidebar (`components/layout/sidebar.tsx`)

**Current:** Grouped nav sections with uppercase section titles (`Principal`, `Finanças`, etc.), `bg-primary/10` active state, `w-56` width, uses `bg-background`.

**New:**
- Remove section group titles — use `mt-4` spacing between groups instead
- Active state: `bg-gray-100 text-foreground` (subtle gray, not primary tinted)
- Inactive: `text-muted-foreground` with `hover:bg-gray-50`
- **Change sidebar `<aside>` from `bg-background` to `bg-white`** to keep it white regardless of `--background` value
- Border-right: change to `border-gray-100`
- Logo area: remove border-bottom, use spacing only
- User menu trigger: simplify — just avatar + name, no email visible in trigger
- Keep collapse/expand functionality unchanged

### 3. Sidebar Layout (`components/layout/sidebar-layout.tsx`)

No change needed — background is inherited from the parent `div` in `app/(app)/layout.tsx` which already has `bg-gray-50`.

### 4. Card Component (`components/ui/card.tsx`)

**Current:** `rounded-xl border bg-card shadow`

**New:** `rounded-xl border border-border bg-card` — remove default `shadow`, rely on border + white-on-gray contrast.

### 5. Button Component (`components/ui/button.tsx`)

**Migration strategy (safe order):**

1. Add new `primary` variant: `bg-primary text-primary-foreground shadow-sm hover:bg-primary/90`
2. Batch-update ALL implicit-default call sites that are primary actions → add `variant="primary"` (see complete list below)
3. Then change default variant to outline: `border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground`
4. Remove duplicate `outline` variant (now identical to default) or keep as alias

**Complete call-site audit — files needing `variant="primary"`:**

| File | Button(s) | Context |
|------|-----------|---------|
| `components/auth/login-form.tsx` | Submit | Sign in |
| `components/auth/signup-form.tsx` | Submit | Sign up |
| `components/auth/forgot-password-form.tsx` | Submit | Reset password |
| `components/auth/magic-link-form.tsx` | Submit | Magic link |
| `app/(auth)/auth/reset-password/page.tsx` | Submit | New password |
| `components/finance/transaction-form.tsx` | Submit | Create/edit transaction |
| `components/finance/import-form.tsx` | Submit, Confirm | Import flow |
| `components/finance/import-preview.tsx` | Confirm | Confirm import |
| `components/finance/category-list.tsx` | Create, Save | Category CRUD |
| `components/finance/account-card.tsx` | Save | Inline edit save |
| `components/finance/account-summary-row.tsx` | "Criar primeira conta" | Empty state CTA |
| `components/investments/asset-form.tsx` | Submit | Create asset |
| `components/investments/asset-edit-form.tsx` | Submit | Edit asset |
| `components/investments/portfolio-event-form.tsx` | Submit | Create event |
| `components/investments/portfolio-event-edit-form.tsx` | Submit | Edit event |
| `components/planning/withdrawal-form.tsx` | Submit | Save strategy |
| `components/planning/simulation-form.tsx` | Submit | Run simulation |
| `components/planning/succession-form.tsx` | Submit | Save succession plan |
| `components/planning/heir-list.tsx` | Add/Save | Heir management |
| `components/billing/plan-card.tsx` | "Fazer Upgrade" | Billing CTA |
| `components/billing/subscription-status.tsx` | Manage | Subscription action |
| `components/finance/patrimony-summary.tsx` | "Atualizar" | Refresh snapshot (explicit `variant="default"`) |
| `app/(app)/accounts/page.tsx` | "Nova conta" | Create account |
| `app/(app)/accounts/new/page.tsx` | Submit | Account form |
| `app/(app)/transactions/page.tsx` | "Nova transação" | Create transaction |
| `app/(app)/investments/page.tsx` | "Novo ativo" | Create investment |
| `app/(app)/billing/success/page.tsx` | "Voltar" | Return button |

**Call sites that stay as default (outline):**
- Filter toggles and "Filtrar" apply button in `transaction-filters.tsx`
- "Ver todas" links
- Secondary actions (cancel, back, close)
- Refresh/update buttons (except patrimony CTA)
- `confirm-dialog.tsx` cancel button (confirm button → `variant="primary"`)

### 6. Dashboard Page (`app/(app)/dashboard/page.tsx`)

**Current:** Vertical stack (`space-y-6`) with section headers like `<h2>Contas</h2>`.

**New:**
- Page header: `<h1>` title + `<p>` description (reduce from `text-2xl` to `text-xl`)
- Stats row: 3-column grid (`grid grid-cols-1 sm:grid-cols-3 gap-4`)
- Content grid: 2-column layout (`grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4`) — chart card (wider) + accounts summary card
- Patrimony card: full-width at bottom
- Remove `<h2>` section sub-headers — card titles serve that purpose
- Responsive: stacks to single column on mobile

### 7. Page Headers (all pages)

Create a reusable `PageHeader` component at `components/ui/page-header.tsx`:

```tsx
interface PageHeaderProps {
  title: string
  description?: string
  children?: React.ReactNode // action buttons slot
}

export function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children && <div className="flex gap-2">{children}</div>}
    </div>
  )
}
```

Heading size reduced from `text-2xl` to `text-xl` for a more refined feel.

Apply to: Dashboard, Transactions, Accounts, Categories, Investments, Planning.

### 8. Tables (`components/ui/table.tsx`)

Update `TableHead`:
- Add `uppercase text-xs tracking-wider` to match spec
- Row borders inherit from `--border` CSS variable (already updated to softer value)
- No outer shadow on wrapping card (handled by Card change)

### 9. Filter pills

Standardize filter/select triggers in `components/finance/transaction-filters.tsx`:
- Replace native `<select>` elements with styled outline triggers
- Style: `border border-input rounded-lg px-3 py-1.5 text-sm bg-white`
- Consistent across Transactions, Investments filter bars

## Files Affected

| File | Change |
|------|--------|
| `apps/web/app/globals.css` | Update `--border`, `--radius` CSS variables |
| `apps/web/components/layout/sidebar.tsx` | Remove section titles, `bg-white`, update active/hover styles |
| `apps/web/components/ui/card.tsx` | Remove default `shadow` |
| `apps/web/components/ui/button.tsx` | Add `primary` variant, swap default to outline |
| `apps/web/components/ui/table.tsx` | Add `uppercase text-xs` to table headers |
| `apps/web/components/ui/page-header.tsx` | **New file** — reusable page header component |
| `apps/web/app/(app)/dashboard/page.tsx` | Restructure to grid layout |
| `apps/web/components/finance/account-summary-row.tsx` | Adapt to new card grid |
| `apps/web/components/finance/quick-stats-row.tsx` | Adapt to stat cards style |
| `apps/web/components/finance/patrimony-summary.tsx` | Adapt card style, `variant="primary"` |
| `apps/web/components/finance/transaction-filters.tsx` | Style as outline pills |
| 27 files with `<Button>` (see Section 5) | Add `variant="primary"` to primary action buttons |
| All page files with headers | Replace inline headers with `<PageHeader>` |

## What Does NOT Change

- `apps/web/app/(app)/layout.tsx` — already has `bg-gray-50`, no changes needed
- `apps/web/components/layout/sidebar-layout.tsx` — no changes needed
- `--background` CSS variable — stays white
- Sidebar collapse/expand behavior
- Mobile hamburger overlay pattern
- Data fetching / Suspense streaming
- Chart library (Recharts)
- Dark mode CSS variables (not in scope — can be adapted later)
- Route structure

## Notes

- **Hardcoded grays:** The codebase has ~86 occurrences of hardcoded Tailwind grays (`text-gray-500`, `bg-gray-100`, etc.) alongside semantic tokens (`text-muted-foreground`). This redesign does NOT standardize them — a follow-up task can address this for dark mode support.
- **`--border` change is global:** The `* { @apply border-border; }` rule means all bordered elements get the softer color. Visual regression check required across all pages.

## Success Criteria

- Sidebar feels clean and flat — no heavy visual grouping
- Cards float on gray background with subtle borders, no shadows
- Primary actions (create, save) are visually filled; secondary actions are outline
- Dashboard shows key financial data in a scannable grid
- Consistent `<PageHeader>` component across all internal pages
- No regressions in functionality — all buttons remain correctly categorized
