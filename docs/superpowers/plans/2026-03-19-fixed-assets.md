# Ativos Imobilizados — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CRUD de ativos imobilizados (imóveis, veículos) com valorização/depreciação automática e impacto no patrimônio líquido.

**Architecture:** Nova tabela `fixed_assets` + `fixed_asset_types`, função pura de estimativa de valor em `core-finance`, integração com `computeSnapshot()`, páginas CRUD no app. Segue os mesmos padrões de RLS, Drizzle schema, Zod validation e server actions do resto do codebase.

**Tech Stack:** Next.js 15, Drizzle ORM, Supabase (PostgreSQL), Tailwind + shadcn/ui, Zod

**Spec:** `docs/superpowers/specs/2026-03-19-fixed-assets-design.md`

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/00010_fixed_assets.sql`

- [ ] **Step 1: Write the migration**

```sql
-- =============================================================================
-- Fixed Assets Module — Types + Assets tables with RLS
-- =============================================================================

-- fixed_asset_types: configurable asset types (like categories)
CREATE TABLE public.fixed_asset_types (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid REFERENCES public.orgs(id) ON DELETE CASCADE,
  name       text NOT NULL,
  is_system  boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fixed_asset_types_org_id ON public.fixed_asset_types(org_id);

ALTER TABLE public.fixed_asset_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fixed_asset_types: members can select own and system"
  ON public.fixed_asset_types FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()) OR org_id IS NULL);

CREATE POLICY "fixed_asset_types: members can insert"
  ON public.fixed_asset_types FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "fixed_asset_types: members can update"
  ON public.fixed_asset_types FOR UPDATE
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()) OR org_id IS NULL);

CREATE POLICY "fixed_asset_types: members can delete"
  ON public.fixed_asset_types FOR DELETE
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

-- Seed system types
INSERT INTO public.fixed_asset_types (id, org_id, name, is_system)
VALUES
  (gen_random_uuid(), NULL, 'Imóvel',   true),
  (gen_random_uuid(), NULL, 'Veículo',  true),
  (gen_random_uuid(), NULL, 'Outro',    true);

-- fixed_assets: the actual assets
CREATE TABLE public.fixed_assets (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  type_id              uuid NOT NULL REFERENCES public.fixed_asset_types(id),
  name                 text NOT NULL,
  purchase_value_cents integer NOT NULL,
  purchase_date        date NOT NULL,
  current_value_cents  integer NOT NULL,
  current_value_date   date NOT NULL,
  annual_rate          numeric(7,4) NOT NULL,
  address              text,
  license_plate        text,
  model                text,
  is_active            boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fixed_assets_org_id ON public.fixed_assets(org_id);

ALTER TABLE public.fixed_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fixed_assets: members can select"
  ON public.fixed_assets FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "fixed_assets: members can insert"
  ON public.fixed_assets FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "fixed_assets: members can update"
  ON public.fixed_assets FOR UPDATE
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "fixed_assets: members can delete"
  ON public.fixed_assets FOR DELETE
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/00010_fixed_assets.sql
git commit -m "feat: add fixed_assets and fixed_asset_types migration"
```

---

### Task 2: Drizzle Schema + DB Exports

**Files:**
- Create: `packages/db/src/schema/fixed-assets.ts`
- Modify: `packages/db/src/index.ts`

- [ ] **Step 1: Create the Drizzle schema**

```typescript
import { pgTable, uuid, text, integer, date, boolean, timestamp, numeric, index } from 'drizzle-orm/pg-core'
import { orgs } from './auth'

export const fixedAssetTypes = pgTable(
  'fixed_asset_types',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').references(() => orgs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    isSystem: boolean('is_system').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxOrgId: index('idx_fixed_asset_types_org_id').on(table.orgId),
  })
)

export const fixedAssets = pgTable(
  'fixed_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    typeId: uuid('type_id')
      .notNull()
      .references(() => fixedAssetTypes.id),
    name: text('name').notNull(),
    purchaseValueCents: integer('purchase_value_cents').notNull(),
    purchaseDate: date('purchase_date', { mode: 'date' }).notNull(),
    currentValueCents: integer('current_value_cents').notNull(),
    currentValueDate: date('current_value_date', { mode: 'date' }).notNull(),
    annualRate: numeric('annual_rate', { precision: 7, scale: 4 }).notNull(),
    address: text('address'),
    licensePlate: text('license_plate'),
    model: text('model'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxOrgId: index('idx_fixed_assets_org_id').on(table.orgId),
  })
)

export type FixedAssetType = typeof fixedAssetTypes.$inferSelect
export type NewFixedAssetType = typeof fixedAssetTypes.$inferInsert
export type FixedAsset = typeof fixedAssets.$inferSelect
export type NewFixedAsset = typeof fixedAssets.$inferInsert
```

- [ ] **Step 2: Add export to `packages/db/src/index.ts`**

Add this line after the `automation` export:
```typescript
export * from './schema/fixed-assets'
```

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema/fixed-assets.ts packages/db/src/index.ts
git commit -m "feat: add Drizzle schema for fixed assets"
```

---

### Task 3: Zod Validation Schemas

**Files:**
- Create: `packages/shared/src/schemas/fixed-assets.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create Zod schemas**

```typescript
import { z } from 'zod'

export const createFixedAssetSchema = z.object({
  name: z.string().min(1).max(200),
  typeId: z.string().uuid(),
  purchaseValueCents: z.number().int().positive(),
  purchaseDate: z.coerce.date(),
  annualRate: z.number().min(-1).max(1), // -100% to +100%
  address: z.string().max(500).optional(),
  licensePlate: z.string().max(20).optional(),
  model: z.string().max(200).optional(),
})

export const updateFixedAssetSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  typeId: z.string().uuid(),
  purchaseValueCents: z.number().int().positive(),
  purchaseDate: z.coerce.date(),
  annualRate: z.number().min(-1).max(1),
  address: z.string().max(500).optional(),
  licensePlate: z.string().max(20).optional(),
  model: z.string().max(200).optional(),
})

export const updateAssetValueSchema = z.object({
  id: z.string().uuid(),
  currentValueCents: z.number().int().positive(),
  currentValueDate: z.coerce.date(),
})

export type CreateFixedAssetInput = z.infer<typeof createFixedAssetSchema>
export type UpdateFixedAssetInput = z.infer<typeof updateFixedAssetSchema>
export type UpdateAssetValueInput = z.infer<typeof updateAssetValueSchema>
```

- [ ] **Step 2: Add export to `packages/shared/src/index.ts`**

Add after the planning export:
```typescript
export * from './schemas/fixed-assets'
```

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/schemas/fixed-assets.ts packages/shared/src/index.ts
git commit -m "feat: add Zod schemas for fixed assets"
```

---

### Task 4: Asset Valuation Function

**Files:**
- Create: `packages/core-finance/src/asset-valuation.ts`
- Modify: `packages/core-finance/src/index.ts`

- [ ] **Step 1: Create the valuation function**

```typescript
/**
 * Estimates the current value of a fixed asset based on its annual rate.
 *
 * Formula: baseValue × (1 + annualRate) ^ (daysElapsed / 365)
 *
 * @param baseValueCents - Last known value in cents (current_value_cents)
 * @param baseDate - Date of last known value (current_value_date)
 * @param annualRate - Annual rate as decimal (0.03 = +3%, -0.10 = -10%)
 * @param referenceDate - Date to estimate for (defaults to today)
 * @returns Estimated value in cents, rounded to integer
 */
export function estimateAssetValue(
  baseValueCents: number,
  baseDate: Date,
  annualRate: number,
  referenceDate: Date = new Date(),
): number {
  const msPerDay = 86_400_000
  const daysElapsed = (referenceDate.getTime() - baseDate.getTime()) / msPerDay

  if (daysElapsed <= 0) return baseValueCents

  const yearsElapsed = daysElapsed / 365
  const factor = Math.pow(1 + annualRate, yearsElapsed)

  return Math.round(baseValueCents * factor)
}
```

- [ ] **Step 2: Add export to `packages/core-finance/src/index.ts`**

Add at the end:
```typescript
// Phase 7 — Fixed assets
export * from './asset-valuation'
```

- [ ] **Step 3: Commit**

```bash
git add packages/core-finance/src/asset-valuation.ts packages/core-finance/src/index.ts
git commit -m "feat: add estimateAssetValue function for fixed assets"
```

---

### Task 5: Integrate Fixed Assets into Patrimony Snapshot

**Files:**
- Modify: `packages/core-finance/src/snapshot.ts:28-70`
- Modify: `apps/web/lib/finance/actions.ts:219-248` (refreshSnapshot)

- [ ] **Step 1: Add fixedAssetValueCents parameter to computeSnapshot**

In `packages/core-finance/src/snapshot.ts`, change the function signature from:
```typescript
export function computeSnapshot(
  accountList: Account[],
  orgId: string,
  investmentValueCents: number = 0,
): NewPatrimonySnapshot {
```
to:
```typescript
export function computeSnapshot(
  accountList: Account[],
  orgId: string,
  investmentValueCents: number = 0,
  fixedAssetValueCents: number = 0,
): NewPatrimonySnapshot {
```

After the investment block (after line 58 `breakdown['investments'] = investmentValueCents`), add:

```typescript
  // Include fixed asset values in liquid assets and breakdown
  if (fixedAssetValueCents > 0) {
    liquidAssetsCents += fixedAssetValueCents
    breakdown['fixed_assets'] = fixedAssetValueCents
  }
```

- [ ] **Step 2: Update refreshSnapshot in actions.ts**

In `apps/web/lib/finance/actions.ts`, in the `refreshSnapshot` function, after the investment value calculation block, add:

```typescript
  // Include fixed assets estimated value in net worth (Phase 7)
  let fixedAssetValueCents = 0
  try {
    const { getFixedAssets } = await import('@/lib/fixed-assets/queries')
    const assets = await getFixedAssets(orgId)
    const { estimateAssetValue } = await import('@floow/core-finance')
    const now = new Date()
    fixedAssetValueCents = assets.reduce((sum, a) => {
      const baseDate = a.currentValueDate instanceof Date ? a.currentValueDate : new Date(a.currentValueDate)
      return sum + estimateAssetValue(a.currentValueCents, baseDate, Number(a.annualRate), now)
    }, 0)
  } catch {
    fixedAssetValueCents = 0
  }
```

Then change the `computeSnapshot` call from:
```typescript
  const snapshot = computeSnapshot(activeAccounts, orgId, investmentValueCents)
```
to:
```typescript
  const snapshot = computeSnapshot(activeAccounts, orgId, investmentValueCents, fixedAssetValueCents)
```

- [ ] **Step 3: Update patrimony-summary.tsx label**

In `apps/web/components/finance/patrimony-summary.tsx`, in the `accountTypeLabels` object, add:
```typescript
    fixed_assets: 'Imobilizado',
```

- [ ] **Step 4: Commit**

```bash
git add packages/core-finance/src/snapshot.ts apps/web/lib/finance/actions.ts apps/web/components/finance/patrimony-summary.tsx
git commit -m "feat: include fixed assets in patrimony snapshot"
```

---

### Task 6: Server Queries + Actions

**Files:**
- Create: `apps/web/lib/fixed-assets/queries.ts`
- Create: `apps/web/lib/fixed-assets/actions.ts`

- [ ] **Step 1: Create queries**

```typescript
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getDb, fixedAssets, fixedAssetTypes } from '@floow/db'
import { eq, and, or, isNull, desc } from 'drizzle-orm'

/**
 * Returns the authenticated user's org ID.
 */
async function getOrgId(): Promise<string> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  const db = getDb()
  const [row] = await db
    .select({ orgId: (await import('@floow/db')).then(m => m.orgMembers).orgId })
    // Simpler: reuse the finance getOrgId
  throw new Error('Use getOrgId from finance/queries')
}
```

Actually — let me check how `getOrgId` is exported:

```typescript
import { cache } from 'react'
import { getDb, fixedAssets, fixedAssetTypes } from '@floow/db'
import { eq, and, or, isNull, desc } from 'drizzle-orm'
import { getOrgId } from '@/lib/finance/queries'

export const getFixedAssetTypes = cache(async (orgId: string) => {
  const db = getDb()
  return db
    .select()
    .from(fixedAssetTypes)
    .where(or(eq(fixedAssetTypes.orgId, orgId), isNull(fixedAssetTypes.orgId)))
    .orderBy(fixedAssetTypes.name)
})

export const getFixedAssets = cache(async (orgId: string) => {
  const db = getDb()
  return db
    .select()
    .from(fixedAssets)
    .where(and(eq(fixedAssets.orgId, orgId), eq(fixedAssets.isActive, true)))
    .orderBy(desc(fixedAssets.createdAt))
})

export const getFixedAssetById = cache(async (orgId: string, id: string) => {
  const db = getDb()
  const [asset] = await db
    .select()
    .from(fixedAssets)
    .where(and(eq(fixedAssets.id, id), eq(fixedAssets.orgId, orgId)))
    .limit(1)
  return asset ?? null
})

export { getOrgId }
```

- [ ] **Step 2: Create actions**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { getDb, fixedAssets, fixedAssetTypes } from '@floow/db'
import { createFixedAssetSchema, updateFixedAssetSchema, updateAssetValueSchema } from '@floow/shared'
import { eq, and, or, isNull, ilike } from 'drizzle-orm'
import { getOrgId } from '@/lib/finance/queries'

// -- Asset Type CRUD --

export async function createFixedAssetType(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()
  const name = formData.get('name') as string
  if (!name?.trim()) throw new Error('Nome é obrigatório')

  // Duplicate check
  const [dup] = await db
    .select({ id: fixedAssetTypes.id })
    .from(fixedAssetTypes)
    .where(and(
      ilike(fixedAssetTypes.name, name.trim()),
      or(eq(fixedAssetTypes.orgId, orgId), isNull(fixedAssetTypes.orgId)),
    ))
    .limit(1)
  if (dup) throw new Error('Já existe um tipo com esse nome')

  const [type] = await db
    .insert(fixedAssetTypes)
    .values({ orgId, name: name.trim() })
    .returning()

  revalidatePath('/fixed-assets')
  return type
}

export async function updateFixedAssetType(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()
  const id = formData.get('id') as string
  const name = formData.get('name') as string
  if (!id || !name?.trim()) throw new Error('ID e nome são obrigatórios')

  const [dup] = await db
    .select({ id: fixedAssetTypes.id })
    .from(fixedAssetTypes)
    .where(and(
      ilike(fixedAssetTypes.name, name.trim()),
      or(eq(fixedAssetTypes.orgId, orgId), isNull(fixedAssetTypes.orgId)),
    ))
    .limit(1)
  if (dup && dup.id !== id) throw new Error('Já existe um tipo com esse nome')

  await db
    .update(fixedAssetTypes)
    .set({ name: name.trim() })
    .where(and(eq(fixedAssetTypes.id, id), or(eq(fixedAssetTypes.orgId, orgId), isNull(fixedAssetTypes.orgId))))

  revalidatePath('/fixed-assets')
}

export async function deleteFixedAssetType(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()
  const id = formData.get('id') as string
  if (!id) throw new Error('ID é obrigatório')

  await db
    .delete(fixedAssetTypes)
    .where(and(eq(fixedAssetTypes.id, id), eq(fixedAssetTypes.orgId, orgId)))

  revalidatePath('/fixed-assets')
}

// -- Fixed Asset CRUD --

export async function createFixedAsset(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const input = createFixedAssetSchema.parse({
    name: formData.get('name'),
    typeId: formData.get('typeId'),
    purchaseValueCents: Number(formData.get('purchaseValueCents')),
    purchaseDate: formData.get('purchaseDate'),
    annualRate: Number(formData.get('annualRate')),
    address: formData.get('address') || undefined,
    licensePlate: formData.get('licensePlate') || undefined,
    model: formData.get('model') || undefined,
  })

  const [asset] = await db
    .insert(fixedAssets)
    .values({
      orgId,
      typeId: input.typeId,
      name: input.name,
      purchaseValueCents: input.purchaseValueCents,
      purchaseDate: input.purchaseDate,
      currentValueCents: input.purchaseValueCents,
      currentValueDate: input.purchaseDate,
      annualRate: String(input.annualRate),
      address: input.address ?? null,
      licensePlate: input.licensePlate ?? null,
      model: input.model ?? null,
    })
    .returning()

  revalidatePath('/fixed-assets')
  revalidatePath('/dashboard')
  return asset
}

export async function updateFixedAsset(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const input = updateFixedAssetSchema.parse({
    id: formData.get('id'),
    name: formData.get('name'),
    typeId: formData.get('typeId'),
    purchaseValueCents: Number(formData.get('purchaseValueCents')),
    purchaseDate: formData.get('purchaseDate'),
    annualRate: Number(formData.get('annualRate')),
    address: formData.get('address') || undefined,
    licensePlate: formData.get('licensePlate') || undefined,
    model: formData.get('model') || undefined,
  })

  await db
    .update(fixedAssets)
    .set({
      typeId: input.typeId,
      name: input.name,
      purchaseValueCents: input.purchaseValueCents,
      purchaseDate: input.purchaseDate,
      annualRate: String(input.annualRate),
      address: input.address ?? null,
      licensePlate: input.licensePlate ?? null,
      model: input.model ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(fixedAssets.id, input.id), eq(fixedAssets.orgId, orgId)))

  revalidatePath('/fixed-assets')
  revalidatePath('/dashboard')
}

export async function updateAssetValue(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const input = updateAssetValueSchema.parse({
    id: formData.get('id'),
    currentValueCents: Number(formData.get('currentValueCents')),
    currentValueDate: formData.get('currentValueDate'),
  })

  await db
    .update(fixedAssets)
    .set({
      currentValueCents: input.currentValueCents,
      currentValueDate: input.currentValueDate,
      updatedAt: new Date(),
    })
    .where(and(eq(fixedAssets.id, input.id), eq(fixedAssets.orgId, orgId)))

  revalidatePath('/fixed-assets')
  revalidatePath('/dashboard')
}

export async function deleteFixedAsset(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()
  const id = formData.get('id') as string
  if (!id) throw new Error('ID é obrigatório')

  await db
    .update(fixedAssets)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(fixedAssets.id, id), eq(fixedAssets.orgId, orgId)))

  revalidatePath('/fixed-assets')
  revalidatePath('/dashboard')
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/fixed-assets/
git commit -m "feat: add fixed assets server queries and actions"
```

---

### Task 7: Sidebar — Add "Ativos Imobilizados" Section

**Files:**
- Modify: `apps/web/components/layout/sidebar.tsx:7-74`

- [ ] **Step 1: Add Building2 icon import**

Add `Building2` to the lucide-react import list (line 7-22).

- [ ] **Step 2: Add nav section**

In `NAV_SECTIONS` array, add after the Investimentos section and before Planejamento:

```typescript
  {
    title: 'Ativos Imobilizados',
    items: [
      { href: '/fixed-assets', label: 'Ativos Imobilizados', icon: Building2 },
    ],
  },
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/layout/sidebar.tsx
git commit -m "feat: add fixed assets section to sidebar"
```

---

### Task 8: List Page + Asset Type Management

**Files:**
- Create: `apps/web/app/(app)/fixed-assets/page.tsx`
- Create: `apps/web/components/fixed-assets/asset-type-list.tsx`

- [ ] **Step 1: Create the asset type list component**

A client component similar to `category-list.tsx` — CRUD for asset types with inline editing. Types with `isSystem=true` can be edited but not deleted.

Include:
- List of types with color dot + name + Edit/Delete buttons
- Inline edit form (just name field)
- Create new type form
- Duplicate name validation shown via toast

- [ ] **Step 2: Create the list page**

Server component with `Tabs` — two tabs: "Ativos" and "Tipos".

"Ativos" tab:
- Table with columns: Nome, Tipo, Valor Compra, Valor Atual (estimated), Taxa Anual, Ações
- Valor Atual calculated client-side via `estimateAssetValue()`
- "Novo Ativo" button → links to `/fixed-assets/new`
- Empty state with CTA
- Each row links to `/fixed-assets/[id]`

"Tipos" tab:
- Renders `<AssetTypeList>`

Use `PageHeader` component with title "Ativos Imobilizados" and description "Gerencie seus imóveis, veículos e outros bens".

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(app\)/fixed-assets/page.tsx apps/web/components/fixed-assets/
git commit -m "feat: add fixed assets list page with type management"
```

---

### Task 9: Create Asset Page

**Files:**
- Create: `apps/web/app/(app)/fixed-assets/new/page.tsx`

- [ ] **Step 1: Create the form page**

Client component with react-hook-form + Zod. Fields:
- Nome (text, required)
- Tipo (select from fixedAssetTypes, required)
- Valor de Compra (monetary input, required) — user types in R$, convert to cents
- Data de Compra (date, required)
- Taxa Anual % (number, required) — user types percentage, convert to decimal (e.g., 3 → 0.03, -10 → -0.10)
- Endereço (text, optional)
- Placa (text, optional)
- Modelo (text, optional)

On submit: call `createFixedAsset()`, redirect to `/fixed-assets`.

Needs to receive asset types as props — since this is a client component, fetch types via a server wrapper or pass from layout. Simplest: make a thin server component wrapper that fetches types and renders the client form.

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/\(app\)/fixed-assets/new/
git commit -m "feat: add fixed asset creation page"
```

---

### Task 10: Asset Detail Page + Update Value

**Files:**
- Create: `apps/web/app/(app)/fixed-assets/[id]/page.tsx`

- [ ] **Step 1: Create the detail page**

Server component that fetches asset by ID. Shows:
- Asset name, type, purchase info
- Estimated current value (calculated server-side)
- Optional fields (address, plate, model) if present
- "Atualizar Valor de Mercado" button → inline form: new value (R$) + date
- "Editar" link → `/fixed-assets/[id]/edit`
- "Excluir" with confirm dialog (soft delete)

The value update form is a client component embedded in the page. On submit calls `updateAssetValue()`.

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/\(app\)/fixed-assets/\[id\]/
git commit -m "feat: add fixed asset detail page with value update"
```

---

### Task 11: Edit Asset Page

**Files:**
- Create: `apps/web/app/(app)/fixed-assets/[id]/edit/page.tsx`

- [ ] **Step 1: Create the edit page**

Same form as the create page but pre-filled with existing values. On submit calls `updateFixedAsset()`, redirects to `/fixed-assets/[id]`.

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/\(app\)/fixed-assets/\[id\]/edit/
git commit -m "feat: add fixed asset edit page"
```

---

### Task 12: Build Verification + Visual QA

- [ ] **Step 1: Verify build**

Run: `cd apps/web && npx next build --no-lint 2>&1 | tail -10`
Expected: Build succeeds with all new routes listed.

- [ ] **Step 2: Run migration on Supabase**

Provide SQL to user to run in Supabase Dashboard SQL Editor.

- [ ] **Step 3: Visual QA**

Check:
- Sidebar shows "Ativos Imobilizados" section
- `/fixed-assets` — list page with tabs (Ativos / Tipos)
- `/fixed-assets/new` — create form works
- `/fixed-assets/[id]` — detail with value update
- `/fixed-assets/[id]/edit` — edit form works
- Dashboard patrimony snapshot includes fixed assets after refresh

- [ ] **Step 4: Final commit with any fixes**

```bash
git add apps/web/
git commit -m "fix: visual QA fixes for fixed assets module"
```
