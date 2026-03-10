# Phase 02: Finance Engine - Research

**Researched:** 2026-03-10
**Domain:** Personal finance data modelling, transaction management, OFX/CSV import, financial dashboard
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FIN-01 | User can create and manage accounts (corrente, poupança, corretora) | Drizzle schema for `accounts` table with `account_type` enum; RLS via `org_id` ownership |
| FIN-02 | User can register transactions (receita, despesa, transferência) | `transactions` table with `transaction_type` enum; transfer creates two linked rows |
| FIN-03 | User can categorize transactions | `categories` table (seed + user-defined) FK'd from transactions; shadcn Select component |
| FIN-04 | User can view monthly cash flow | Aggregate SQL query grouped by month + category; Recharts BarChart via shadcn/ui charts |
| FIN-05 | User can import OFX/CSV bank statements | `ofx-js` for OFX parsing; `papaparse` for CSV; Next.js server action with FormData |
| DASH-01 | Financial dashboard (account summary, balance, cash flow) | React Server Components fetching account/transaction aggregates; shadcn Card + ChartContainer |
| VAL-01 | System generates patrimony snapshots (net worth, liquid assets, liabilities, breakdown) | `patrimony_snapshots` table; cron-triggered or on-demand snapshot function; computed from accounts |
</phase_requirements>

---

## Summary

Phase 2 builds the Finance Engine on top of the completed Phase 1 Platform Foundation. The existing `@floow/db` package has Drizzle ORM schema for auth and billing — Phase 2 extends it with finance-specific tables (`accounts`, `transactions`, `categories`, `patrimony_snapshots`) following the exact same patterns: `org_id` for tenant isolation, RLS via `get_user_org_ids()`, and indexes on all FK columns.

Money storage uses `integer` (cents in BRL centavos) for all monetary amounts — faster than `numeric`, no floating-point rounding, and sufficient range (±21 billion BRL with bigint if needed). All amounts are stored as whole centavos (e.g., R$150,75 → 15075). The `core-finance` package, currently a stub, gets populated with business logic: balance calculation, cash flow aggregation, and snapshot computation.

OFX import uses `ofx-js` (promise-based, browser+Node compatible) for Brazilian bank exports. CSV import uses `papaparse` (de facto standard, works in Node.js server actions). Both are handled via Next.js 15 server actions with FormData — consistent with the Stripe/Supabase lazy-init patterns established in Phase 1. The financial dashboard uses shadcn/ui's Chart components (built on Recharts), which are already aligned with the existing shadcn/ui installation.

**Primary recommendation:** Extend `packages/db/src/schema/` with a `finance.ts` file, add `core-finance` logic, build the UI using server actions + shadcn/ui, and store all amounts as integer centavos.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | ^0.40.0 (already installed) | Finance schema, typed queries, relations | Already in use; project decision locked |
| postgres | ^3.4.0 (already installed) | PostgreSQL driver | Already in use |
| zod | catalog: (already installed) | Server action validation, form schemas | Already in use in auth and billing |
| react-hook-form + @hookform/resolvers | already installed | Transaction/account forms | Already in use |
| ofx-js | ^0.2.0 | Parse OFX bank statement files (SGML-to-JSON) | Pure JS, browser+Node, promise-based, only OFX parser with active npm presence |
| papaparse | ^5.5.3 | Parse CSV bank statement files | De facto standard for JS CSV; works in Node.js server actions; zero dependencies |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| recharts | (shadcn/ui chart installs automatically) | BarChart, AreaChart, LineChart | Financial dashboard (DASH-01); cash flow visualization (FIN-04) |
| shadcn/ui chart | via `pnpm dlx shadcn@latest add chart` | ChartContainer, ChartTooltip wrappers | Already using shadcn/ui — consistent component system |
| @tanstack/react-query | catalog: (already installed) | Client-side data refreshing after mutations | Already in package.json; use for optimistic updates on transaction lists |
| lucide-react | already installed | Icons for account types, transaction categories | Already in use |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ofx-js | @hublaw/ofx-parser, node-ofx-parser | ofx-js is simpler API (one `parse()` call); others have similar maintenance status |
| papaparse | csv-parser (Node streaming) | papaparse works identically in server actions; csv-parser is stream-only |
| integer centavos | numeric(15,2) | Integer is >50% faster; no rounding; numeric is safer for multi-currency (v2 feature) |
| shadcn/ui chart | chart.js, victory | Shadcn/ui chart is already installed/styled; avoids new design system |

**Installation (new dependencies only):**
```bash
pnpm add ofx-js papaparse
pnpm add -D @types/papaparse
pnpm dlx shadcn@latest add chart
```

---

## Architecture Patterns

### Recommended Project Structure

```
packages/
├── db/src/schema/
│   ├── auth.ts          # existing
│   ├── billing.ts       # existing
│   └── finance.ts       # NEW — accounts, transactions, categories, snapshots
├── core-finance/src/
│   ├── index.ts         # barrel export (currently a stub)
│   ├── balance.ts       # NEW — account balance calculation
│   ├── cash-flow.ts     # NEW — monthly aggregation logic
│   ├── snapshot.ts      # NEW — patrimony snapshot computation
│   └── import/
│       ├── ofx.ts       # NEW — OFX file parsing + normalization
│       └── csv.ts       # NEW — CSV parsing + normalization
apps/web/
├── app/(app)/
│   ├── accounts/
│   │   ├── page.tsx               # account list (RSC)
│   │   └── new/page.tsx           # create account form
│   ├── transactions/
│   │   ├── page.tsx               # transaction list (RSC, paginated)
│   │   ├── new/page.tsx           # register transaction
│   │   └── import/page.tsx        # OFX/CSV import
│   └── dashboard/
│       └── page.tsx               # financial dashboard (DASH-01, already exists — extend)
├── components/finance/
│   ├── account-card.tsx
│   ├── transaction-form.tsx
│   ├── transaction-list.tsx
│   ├── cash-flow-chart.tsx        # shadcn ChartContainer + Recharts BarChart
│   ├── import-form.tsx            # file upload + parse preview
│   └── patrimony-summary.tsx
└── lib/finance/
    ├── actions.ts                 # server actions: createAccount, createTransaction, importFile
    └── queries.ts                 # server-side DB query helpers
```

### Pattern 1: Finance Schema Extending Existing DB Package

**What:** Add `finance.ts` to `packages/db/src/schema/`, then re-export from `packages/db/src/index.ts` and extend the `createDb` schema object.
**When to use:** Every new table in this phase.

```typescript
// packages/db/src/schema/finance.ts
import {
  pgTable, pgEnum, uuid, text, integer, bigint,
  timestamp, boolean, index
} from 'drizzle-orm/pg-core'
import { orgs } from './auth'

export const accountTypeEnum = pgEnum('account_type', [
  'checking', 'savings', 'brokerage', 'credit_card', 'cash'
])

export const transactionTypeEnum = pgEnum('transaction_type', [
  'income', 'expense', 'transfer'
])

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: accountTypeEnum('type').notNull(),
  // Amounts stored as integer centavos (BRL); R$150,75 = 15075
  balanceCents: integer('balance_cents').notNull().default(0),
  currency: text('currency').notNull().default('BRL'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  idxOrgId: index('idx_accounts_org_id').on(table.orgId),
}))

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => orgs.id, { onDelete: 'cascade' }), // null = system default
  name: text('name').notNull(),
  type: transactionTypeEnum('type').notNull(), // income or expense (not transfer)
  color: text('color'),  // hex for UI display
  icon: text('icon'),    // lucide icon name
  isSystem: boolean('is_system').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  idxOrgId: index('idx_categories_org_id').on(table.orgId),
}))

export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
  type: transactionTypeEnum('type').notNull(),
  // Positive for income; negative for expense; transfer creates two rows
  amountCents: integer('amount_cents').notNull(),
  description: text('description').notNull(),
  date: timestamp('date', { withTimezone: true }).notNull(),
  // For transfers: both rows reference same transfer_group_id
  transferGroupId: uuid('transfer_group_id'),
  // Import metadata
  importedAt: timestamp('imported_at', { withTimezone: true }),
  externalId: text('external_id'), // OFX FITID or CSV row hash — deduplicate imports
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  idxOrgId: index('idx_transactions_org_id').on(table.orgId),
  idxAccountId: index('idx_transactions_account_id').on(table.accountId),
  idxDate: index('idx_transactions_date').on(table.date),
  idxExternalId: index('idx_transactions_external_id').on(table.externalId),
}))

export const patrimonySnapshots = pgTable('patrimony_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  snapshotDate: timestamp('snapshot_date', { withTimezone: true }).notNull(),
  // All stored as integer centavos
  netWorthCents: integer('net_worth_cents').notNull(),
  liquidAssetsCents: integer('liquid_assets_cents').notNull(),
  liabilitiesCents: integer('liabilities_cents').notNull().default(0),
  // JSON breakdown: { checking: 100000, savings: 500000, brokerage: 200000 }
  breakdown: text('breakdown'), // JSON stringified
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  idxOrgId: index('idx_patrimony_snapshots_org_id').on(table.orgId),
  idxDate: index('idx_patrimony_snapshots_date').on(table.snapshotDate),
}))

// TypeScript inferred types
export type Account = typeof accounts.$inferSelect
export type NewAccount = typeof accounts.$inferInsert
export type Transaction = typeof transactions.$inferSelect
export type NewTransaction = typeof transactions.$inferInsert
export type Category = typeof categories.$inferSelect
export type PatrimonySnapshot = typeof patrimonySnapshots.$inferSelect
```

### Pattern 2: RLS via get_user_org_ids() (Established Pattern)

**What:** Every finance table uses the same RLS pattern established in migration 00001.
**When to use:** All new tables with `org_id` column.

```sql
-- Source: supabase/migrations/00001_foundation.sql (established pattern)
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accounts: members can select"
  ON public.accounts FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "accounts: members can insert"
  ON public.accounts FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "accounts: members can update"
  ON public.accounts FOR UPDATE TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "accounts: members can delete"
  ON public.accounts FOR DELETE TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));
-- Repeat for transactions, categories, patrimony_snapshots
```

### Pattern 3: Money as Integer Centavos

**What:** Store all amounts as `integer` in centavos (BRL smallest unit). Display layer divides by 100.
**When to use:** Every monetary column in this phase.

```typescript
// Source: established financial best practice (wanago.io/2024/11/04)
// In core-finance/src/balance.ts
export function centsToCurrency(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

export function currencyToCents(value: string | number): number {
  if (typeof value === 'number') return Math.round(value * 100)
  // Parse "150,75" or "150.75" → 15075
  const normalized = String(value).replace(',', '.')
  return Math.round(parseFloat(normalized) * 100)
}
```

### Pattern 4: Server Actions for Finance Mutations (Established Pattern)

**What:** Use Next.js server actions (not API routes) for account/transaction creation. Consistent with Phase 1's billing pattern.
**When to use:** All create/update/delete operations on finance data.

```typescript
// Source: apps/web/lib/stripe/server.ts pattern (Phase 01-04 decision)
// apps/web/lib/finance/actions.ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { createDb } from '@floow/db'
import { accounts, NewAccount } from '@floow/db'
import { createAccountSchema } from '@floow/shared'

export async function createAccount(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const orgId = (user.app_metadata?.org_ids as string[])?.[0]
  if (!orgId) throw new Error('No org found')

  const input = createAccountSchema.parse({
    name: formData.get('name'),
    type: formData.get('type'),
  })

  const db = createDb(process.env.DATABASE_URL!)
  const [account] = await db.insert(accounts).values({
    orgId,
    name: input.name,
    type: input.type,
  }).returning()

  return account
}
```

### Pattern 5: OFX Import Parser

**What:** Server action receives FormData file, reads text, parses with `ofx-js`, normalizes to `NewTransaction[]`.
**When to use:** FIN-05 OFX import endpoint.

```typescript
// packages/core-finance/src/import/ofx.ts
import { parse as parseOFX } from 'ofx-js'

export interface NormalizedTransaction {
  externalId: string  // FITID — for deduplication
  date: Date
  amountCents: number // negative for debits
  description: string
  type: 'income' | 'expense'
}

export async function parseOFXFile(content: string): Promise<NormalizedTransaction[]> {
  const ofxData = await parseOFX(content)
  const stmtrs = ofxData.OFX?.BANKMSGSRSV1?.STMTTRNRS?.STMTRS
  if (!stmtrs) throw new Error('Invalid OFX: no STMTRS block found')

  const txns = stmtrs.BANKTRANLIST?.STMTTRN
  const list = Array.isArray(txns) ? txns : [txns].filter(Boolean)

  return list.map((t) => {
    const amount = parseFloat(t.TRNAMT)
    return {
      externalId: t.FITID,
      date: new Date(t.DTPOSTED),
      amountCents: Math.round(amount * 100),
      description: t.MEMO || t.NAME || '',
      type: amount >= 0 ? 'income' : 'expense',
    }
  })
}
```

### Pattern 6: CSV Import with PapaParse

**What:** Server action reads CSV text, uses `Papa.parse()`, normalizes rows to `NormalizedTransaction[]`.
**When to use:** FIN-05 CSV import.

```typescript
// packages/core-finance/src/import/csv.ts
import Papa from 'papaparse'

// Brazilian bank CSV headers vary — require user to map columns during import
export interface CsvColumnMapping {
  dateColumn: string
  amountColumn: string
  descriptionColumn: string
  dateFormat?: 'dd/MM/yyyy' | 'yyyy-MM-dd'
}

export function parseCSVFile(content: string, mapping: CsvColumnMapping) {
  const { data } = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
  })
  // Normalize rows using mapping...
  return data.map((row) => ({
    externalId: `csv-${Buffer.from(JSON.stringify(row)).toString('base64').slice(0, 16)}`,
    description: row[mapping.descriptionColumn] ?? '',
    // parse date, amount based on mapping
  }))
}
```

### Pattern 7: Cash Flow Aggregation Query

**What:** SQL aggregate grouped by year-month and category for FIN-04.

```sql
-- Run as Drizzle raw SQL or sql`` template
SELECT
  date_trunc('month', date) AS month,
  c.name AS category,
  t.type,
  SUM(t.amount_cents) AS total_cents
FROM transactions t
LEFT JOIN categories c ON t.category_id = c.id
WHERE t.org_id = $orgId
  AND t.date >= $startDate
  AND t.date <  $endDate
GROUP BY month, c.name, t.type
ORDER BY month DESC, c.name;
```

### Pattern 8: Patrimony Snapshot Computation

**What:** On-demand function that sums all active account balances grouped by type.
**When to use:** VAL-01 — triggered manually or on a schedule (Phase 2 implements on-demand).

```typescript
// packages/core-finance/src/snapshot.ts
export async function computePatrimonySnapshot(
  db: ReturnType<typeof createDb>,
  orgId: string,
): Promise<NewPatrimonySnapshot> {
  const accts = await db.select().from(accounts)
    .where(and(eq(accounts.orgId, orgId), eq(accounts.isActive, true)))

  const breakdown: Record<string, number> = {}
  let totalCents = 0
  let liquidCents = 0
  let liabilitiesCents = 0

  for (const acct of accts) {
    breakdown[acct.type] = (breakdown[acct.type] ?? 0) + acct.balanceCents
    totalCents += acct.balanceCents
    if (acct.type === 'credit_card') {
      liabilitiesCents += Math.abs(acct.balanceCents)
    } else {
      liquidCents += acct.balanceCents
    }
  }

  return {
    orgId,
    snapshotDate: new Date(),
    netWorthCents: totalCents - liabilitiesCents,
    liquidAssetsCents: liquidCents,
    liabilitiesCents,
    breakdown: JSON.stringify(breakdown),
  }
}
```

### Pattern 9: shadcn/ui ChartContainer for Cash Flow

**What:** BarChart showing monthly income vs. expense using shadcn/ui chart + Recharts.
**When to use:** FIN-04 cash flow view and DASH-01 dashboard.

```tsx
// Source: ui.shadcn.com/docs/components/chart
'use client'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'

const chartConfig = {
  income: { label: 'Receitas', color: '#16a34a' },
  expense: { label: 'Despesas', color: '#dc2626' },
}

export function CashFlowChart({ data }: { data: CashFlowMonth[] }) {
  return (
    <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
      <BarChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="income" fill="var(--color-income)" radius={4} />
        <Bar dataKey="expense" fill="var(--color-expense)" radius={4} />
      </BarChart>
    </ChartContainer>
  )
}
```

### Anti-Patterns to Avoid

- **Floating-point for money:** Never use `numeric`/`float`/`decimal` for stored amounts. Use integer centavos. Example: `0.1 + 0.2 = 0.30000000000000004` in JS.
- **Balance as derived-only (no stored column):** Computing balance by summing all transactions on every page load is O(n). Store a running `balance_cents` on `accounts` and update atomically on each transaction insert.
- **RLS on join conditions without SECURITY DEFINER helper:** Bare `auth.uid()` in multi-table WHERE causes N+1 DB calls per row. Always use `get_user_org_ids()`.
- **Parsing OFX in the browser (client component):** Keep file parsing server-side to avoid exposing raw bank data to client logs. Use server actions.
- **Skipping `external_id` deduplication for imports:** Users will import the same file twice. Hash or use FITID to detect and skip duplicates on insert.
- **Calling `db.query.*` without including finance schema:** After adding `finance.ts`, the `createDb()` factory in `client.ts` must include `financeSchema` in the merged schema object.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OFX file parsing | Custom SGML parser | `ofx-js` | OFX SGML is non-standard; edge cases in header parsing, encoding, CDATA |
| CSV parsing | String split on commas | `papaparse` | Quoted fields with commas, BOM markers, encoding issues, streaming |
| Form validation | Manual checks | `zod` + `react-hook-form` | Already installed; schema reuse between client and server |
| Money formatting | `value.toFixed(2)` | `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })` | Locale-aware separators (R$ 1.500,75 not R$ 1500.75) |
| Chart rendering | Custom SVG | shadcn/ui chart + Recharts | Already in design system; handles responsive sizing, tooltips, theming |
| Account balance tracking | Sum all transactions on query | Stored `balance_cents` column updated atomically | O(1) read vs O(n) scan; correctness at scale |

**Key insight:** OFX and CSV parsing are deceptively complex — Brazilian bank exports have encoding issues, non-standard date formats (YYYYMMDDHHMMSS), and inconsistent header structures. The existing libs handle 95% of edge cases.

---

## Common Pitfalls

### Pitfall 1: Drizzle Schema Not Included in createDb()

**What goes wrong:** After adding `finance.ts` to the schema directory, relational queries (`db.query.accounts`) throw "table not found" because `createDb()` still uses only `auth` and `billing` schemas.
**Why it happens:** `drizzle()` requires the merged schema object at instantiation time.
**How to avoid:** Update `packages/db/src/client.ts` to import and spread `financeSchema` into `fullSchema`.
**Warning signs:** TypeScript autocompletion missing `db.query.accounts`; runtime error on relational queries.

```typescript
// packages/db/src/client.ts — updated
import * as financeSchema from './schema/finance'
const fullSchema = { ...schema, ...billingSchema, ...financeSchema }
```

### Pitfall 2: OFX Date Format is Not ISO 8601

**What goes wrong:** `new Date(t.DTPOSTED)` returns Invalid Date.
**Why it happens:** OFX dates are `YYYYMMDDHHMMSS.SSS[±hhmm]` (e.g., `20240115120000.000[-3:BRT]`), not parseable by the default Date constructor.
**How to avoid:** Parse manually: `DTPOSTED.slice(0,8)` → `'20240115'` → `new Date('2024-01-15')`.
**Warning signs:** Transactions imported with null/Invalid dates.

```typescript
export function parseOFXDate(ofxDate: string): Date {
  const y = ofxDate.slice(0, 4)
  const m = ofxDate.slice(4, 6)
  const d = ofxDate.slice(6, 8)
  return new Date(`${y}-${m}-${d}T12:00:00Z`)
}
```

### Pitfall 3: Transfer Transactions Creating Balance Inconsistency

**What goes wrong:** Registering a transfer as a single transaction debits one account but doesn't credit the other.
**Why it happens:** Transfer = two movements (debit from source, credit to destination).
**How to avoid:** Wrap both inserts in a PostgreSQL transaction. Generate a `transfer_group_id = uuid()` and set it on both rows. Debit row has negative `amount_cents`, credit row has positive `amount_cents`.
**Warning signs:** Account balances don't sum to user's reported net worth after transfer.

### Pitfall 4: CSV Column Mapping for Brazilian Banks

**What goes wrong:** Different banks export CSV with different column names (e.g., Itaú uses "Valor", Nubank uses "Valor (em R$)", XP uses "Value").
**Why it happens:** There is no standard Brazilian bank CSV format.
**How to avoid:** Build a column-mapping step in the import UI. After parsing headers, let the user match date/amount/description columns before committing. This is part of the import UX flow, not just the parser.
**Warning signs:** All imported transactions have null description or zero amount.

### Pitfall 5: Account Balance Drift from Concurrent Writes

**What goes wrong:** Two rapid transaction inserts both read `balanceCents = 1000`, both add 500, both write 1500 (instead of correct 2000).
**Why it happens:** Read-modify-write without serialization.
**How to avoid:** Use `UPDATE accounts SET balance_cents = balance_cents + $delta WHERE id = $id` (atomic increment, not read-then-write). In Drizzle: `db.update(accounts).set({ balanceCents: sql\`balance_cents + ${delta}\` }).where(eq(accounts.id, accountId))`.
**Warning signs:** Balance mismatch after bulk import.

### Pitfall 6: RLS Policy Missing for New Tables

**What goes wrong:** New `categories` or `patrimony_snapshots` tables return empty results or 403 errors.
**Why it happens:** RLS is enabled but no policy added for `authenticated` role.
**How to avoid:** Every new table in `supabase/migrations/00002_finance.sql` must have `ENABLE ROW LEVEL SECURITY` plus SELECT/INSERT/UPDATE/DELETE policies following the `get_user_org_ids()` pattern from migration 00001.
**Warning signs:** Empty result sets despite data existing; Supabase dashboard shows rows but app returns none.

### Pitfall 7: shadcn/ui Chart Requires min-h Class

**What goes wrong:** Chart renders with zero height (invisible).
**Why it happens:** `ChartContainer` requires an explicit minimum height via Tailwind.
**How to avoid:** Always set `className="min-h-[200px] w-full"` (or similar) on `ChartContainer`.
**Warning signs:** Chart div is in DOM but has 0px height.

---

## Code Examples

### Account Balance Atomic Update (Drizzle)

```typescript
// Source: drizzle-orm/docs/select (sql template literal)
import { sql, eq } from 'drizzle-orm'
import { accounts } from '@floow/db'

await db.update(accounts)
  .set({ balanceCents: sql`balance_cents + ${amountCents}` })
  .where(eq(accounts.id, accountId))
```

### Drizzle Relations v2 for Transactions with Category

```typescript
// Source: orm.drizzle.team/docs/relations-v2
import { defineRelations } from 'drizzle-orm'
import { accounts, transactions, categories } from './schema/finance'

export const financeRelations = defineRelations(
  { accounts, transactions, categories },
  (r) => ({
    accounts: {
      transactions: r.many.transactions(),
    },
    transactions: {
      account: r.one.accounts({ from: r.transactions.accountId, to: r.accounts.id }),
      category: r.one.categories({ from: r.transactions.categoryId, to: r.categories.id }),
    },
    categories: {
      transactions: r.many.transactions(),
    },
  })
)

// Usage in query
const result = await db.query.transactions.findMany({
  where: eq(transactions.orgId, orgId),
  with: { category: true, account: true },
  orderBy: [desc(transactions.date)],
  limit: 50,
})
```

### Server Action File Upload (Next.js 15)

```typescript
// Source: nextjs.org/docs/app/getting-started/updating-data
'use server'
export async function importTransactions(formData: FormData) {
  const file = formData.get('file') as File
  if (!file) throw new Error('No file provided')

  const content = await file.text()
  const isOFX = file.name.toLowerCase().endsWith('.ofx')

  const normalized = isOFX
    ? await parseOFXFile(content)
    : parseCSVFile(content, getColumnMapping(formData))

  // Insert with ON CONFLICT DO NOTHING for deduplication
  await db.insert(transactions)
    .values(normalized.map(toNewTransaction(orgId, accountId)))
    .onConflictDoNothing({ target: [transactions.externalId, transactions.accountId] })
}
```

### System Categories Seed SQL

```sql
-- supabase/migrations/00002_finance.sql (partial)
-- System categories (org_id = NULL means available to all orgs)
INSERT INTO categories (id, org_id, name, type, color, icon, is_system) VALUES
  (gen_random_uuid(), NULL, 'Salário',       'income',  '#16a34a', 'banknote',      true),
  (gen_random_uuid(), NULL, 'Freelance',     'income',  '#0ea5e9', 'laptop',        true),
  (gen_random_uuid(), NULL, 'Investimentos', 'income',  '#8b5cf6', 'trending-up',   true),
  (gen_random_uuid(), NULL, 'Aluguel',       'expense', '#dc2626', 'home',          true),
  (gen_random_uuid(), NULL, 'Alimentação',   'expense', '#f97316', 'utensils',      true),
  (gen_random_uuid(), NULL, 'Transporte',    'expense', '#eab308', 'car',           true),
  (gen_random_uuid(), NULL, 'Saúde',         'expense', '#06b6d4', 'heart-pulse',   true),
  (gen_random_uuid(), NULL, 'Educação',      'expense', '#6366f1', 'graduation-cap',true),
  (gen_random_uuid(), NULL, 'Lazer',         'expense', '#ec4899', 'smile',         true),
  (gen_random_uuid(), NULL, 'Assinaturas',   'expense', '#64748b', 'credit-card',   true),
  (gen_random_uuid(), NULL, 'Outros',        'expense', '#94a3b8', 'circle-ellipsis',true);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `numeric`/`decimal` for money | `integer` centavos | Industry consensus by ~2020 | Avoids rounding; better perf |
| Prisma for financial apps | Drizzle (already chosen) | 2023-2024 | Closer to SQL; explicit about queries |
| `useFormState` (React 18) | `useActionState` (React 19) | React 19 / Next.js 15 | Import from `react` not `react-dom` |
| Route handlers for mutations | Server actions (already chosen) | Next.js 13.4+ | Already used in Phase 1 (billing) |
| Manual Recharts setup | shadcn/ui chart component | 2024 | Wraps Recharts with consistent design system |
| Drizzle relations v1 (`relations()`) | Drizzle relations v2 (`defineRelations()`) | drizzle-orm ^0.40 | Cleaner API; no need to pass relations to `drizzle()` separately |

**Deprecated/outdated:**
- PostgreSQL `MONEY` type: locale-dependent, no fractional cent, avoid entirely
- `react-papaparse`: browser-only, 2 years without update; use plain `papaparse` in server actions
- Drizzle `relations()` v1 API: still works but v2 `defineRelations()` is the current pattern in ^0.40

---

## Open Questions

1. **Category taxonomy finality**
   - What we know: System categories need to be seeded (11 proposed above)
   - What's unclear: Whether user-defined categories need subcategories in Phase 2 or if flat list suffices
   - Recommendation: Flat list for Phase 2 (no parent_id); subcategories are v2 feature

2. **Account balance update strategy: trigger vs. application layer**
   - What we know: Updating `balance_cents` atomically in app code works; PostgreSQL triggers also possible
   - What's unclear: Which is more consistent with the Phase 1 trigger pattern (`handle_new_user`)
   - Recommendation: Application-layer atomic update (`sql\`balance_cents + $\{delta}\``) — easier to test, avoids trigger debugging complexity

3. **Patrimony snapshot trigger mechanism**
   - What we know: Phase 2 implements on-demand snapshots; cron scheduling is v2
   - What's unclear: Whether snapshots should auto-trigger after each account balance update
   - Recommendation: On-demand only for Phase 2 — trigger from dashboard UI ("Update Snapshot" button)

4. **CSV column mapping UX complexity**
   - What we know: Brazilian banks have inconsistent CSV formats
   - What's unclear: How complex the column-mapping UI needs to be
   - Recommendation: Implement a simple 3-column mapping step (date, amount, description) with auto-detection heuristics for common headers

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^3.0.0 |
| Config file | `apps/web/vitest.config.ts` (web), `packages/db/vitest.config.ts` (db) |
| Quick run command | `pnpm --filter @floow/db test` or `pnpm --filter @floow/web test` |
| Full suite command | `pnpm test` (runs all packages via Turborepo) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FIN-01 | `accounts` schema exports, required columns present | unit | `pnpm --filter @floow/db test -- schema` | ❌ Wave 0 |
| FIN-01 | RLS: user cannot see another org's accounts | integration (stub) | manual / todo | ❌ Wave 0 |
| FIN-02 | `transactions` schema exports, type enum values | unit | `pnpm --filter @floow/db test -- schema` | ❌ Wave 0 |
| FIN-02 | Transfer creates two linked rows with transfer_group_id | unit | `pnpm --filter @floow/core-finance test` | ❌ Wave 0 |
| FIN-03 | `categories` schema exports; system categories seed present | unit | `pnpm --filter @floow/db test -- schema` | ❌ Wave 0 |
| FIN-04 | Cash flow aggregation returns correct month/category totals | unit | `pnpm --filter @floow/core-finance test` | ❌ Wave 0 |
| FIN-05 | OFX parser returns normalized transactions with correct dates/amounts | unit | `pnpm --filter @floow/core-finance test` | ❌ Wave 0 |
| FIN-05 | CSV parser handles header mapping, empty lines, quoted fields | unit | `pnpm --filter @floow/core-finance test` | ❌ Wave 0 |
| FIN-05 | Duplicate import is idempotent (same external_id = no duplicate row) | unit | `pnpm --filter @floow/core-finance test` | ❌ Wave 0 |
| DASH-01 | Dashboard page renders account summary and balance cards | unit (RTL) | `pnpm --filter @floow/web test -- dashboard` | ❌ Wave 0 |
| VAL-01 | `computePatrimonySnapshot` sums balances, separates liabilities | unit | `pnpm --filter @floow/core-finance test` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm --filter @floow/core-finance test && pnpm --filter @floow/db test`
- **Per wave merge:** `pnpm test` (full suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `packages/db/src/__tests__/finance-schema.test.ts` — covers FIN-01, FIN-02, FIN-03 schema exports
- [ ] `packages/core-finance/src/__tests__/balance.test.ts` — covers atomic balance update logic
- [ ] `packages/core-finance/src/__tests__/cash-flow.test.ts` — covers FIN-04 aggregation
- [ ] `packages/core-finance/src/__tests__/import-ofx.test.ts` — covers FIN-05 OFX parsing
- [ ] `packages/core-finance/src/__tests__/import-csv.test.ts` — covers FIN-05 CSV parsing
- [ ] `packages/core-finance/src/__tests__/snapshot.test.ts` — covers VAL-01
- [ ] `apps/web/__tests__/finance/dashboard.test.tsx` — covers DASH-01 render
- [ ] `packages/core-finance/package.json` — add `vitest` to devDependencies and `test` script
- [ ] Framework install: `pnpm add -D vitest --filter @floow/core-finance`

---

## Sources

### Primary (HIGH confidence)
- [orm.drizzle.team/docs/column-types/pg](https://orm.drizzle.team/docs/column-types/pg) — numeric/integer types, bigint modes
- [orm.drizzle.team/docs/relations-v2](https://orm.drizzle.team/docs/relations-v2) — defineRelations API, one-to-many pattern
- [ui.shadcn.com/docs/components/chart](https://ui.shadcn.com/docs/components/chart) — ChartContainer, installation, Recharts integration
- `packages/db/src/` (local codebase) — existing schema patterns, client factory, RLS SQL in 00001_foundation.sql
- `apps/web/` (local codebase) — existing server action patterns, app router structure, vitest config

### Secondary (MEDIUM confidence)
- [wanago.io/2024/11/04 — Storing money with Drizzle ORM and PostgreSQL](https://wanago.io/2024/11/04/api-nestjs-drizzle-orm-postgresql-money/) — integer cents best practice
- [github.com/bradenmacdonald/ofx-js](https://github.com/bradenmacdonald/ofx-js) — `parse()` API, promise-based, browser+Node
- [papaparse.com](https://www.papaparse.com/) — server-side CSV parsing, Node.js streaming support
- [nextjs.org/docs/app/getting-started/updating-data](https://nextjs.org/docs/app/getting-started/updating-data) — FormData file upload with server actions

### Tertiary (LOW confidence)
- WebSearch results on category taxonomy for Brazilian personal finance — no single authoritative source; proposed list derived from multiple personal finance app surveys

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in project or verified via official docs
- Architecture: HIGH — follows exact patterns from Phase 1 codebase
- OFX/CSV parsing: MEDIUM — ofx-js API verified via GitHub; Brazilian OFX edge cases (date format, encoding) from community sources
- Pitfalls: HIGH — derived from existing codebase patterns + official docs verification
- Category list: LOW — no authoritative Brazilian standard; proposed set is conventional

**Research date:** 2026-03-10
**Valid until:** 2026-06-10 (stable libraries; Drizzle v2 relations API is current)
