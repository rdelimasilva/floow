'use server'

import { revalidatePath } from 'next/cache'
import { getDb, budgetGoals, budgetCategoryLimits, budgetAdjustments } from '@floow/db'
import { eq, and } from 'drizzle-orm'
import { getOrgId } from './queries'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Verifies that a budget goal belongs to the authenticated user's org.
 * Returns the goal row if valid, throws otherwise.
 */
async function assertGoalOwnership(db: ReturnType<typeof getDb>, goalId: string, orgId: string) {
  const [goal] = await db
    .select()
    .from(budgetGoals)
    .where(and(eq(budgetGoals.id, goalId), eq(budgetGoals.orgId, orgId)))
    .limit(1)

  if (!goal) {
    throw new Error(`Budget goal ${goalId} not found or does not belong to this organization`)
  }

  return goal
}

/**
 * Revalidates all budget-related paths so UI stays in sync.
 */
function revalidateBudgetPaths() {
  revalidatePath('/budget/spending')
  revalidatePath('/budget/investing')
  revalidatePath('/dashboard')
}

// ---------------------------------------------------------------------------
// Budget Goal CRUD
// ---------------------------------------------------------------------------

/**
 * Server action: create or update a budget goal.
 * If `id` is provided in the form data, updates the existing goal; otherwise inserts a new one.
 */
export async function upsertBudgetGoal(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const id = formData.get('id') as string | null
  const type = formData.get('type') as 'spending' | 'investing'
  const name = formData.get('name') as string
  const targetCents = parseInt(formData.get('targetCents') as string, 10)
  const period = formData.get('period') as 'monthly' | 'quarterly' | 'semiannual' | 'annual'

  const patrimonyTargetCentsRaw = formData.get('patrimonyTargetCents') as string | null
  const patrimonyTargetCents = patrimonyTargetCentsRaw ? parseInt(patrimonyTargetCentsRaw, 10) : null

  const patrimonyDeadlineRaw = formData.get('patrimonyDeadline') as string | null
  const patrimonyDeadline = patrimonyDeadlineRaw ? new Date(patrimonyDeadlineRaw) : null

  if (id) {
    // Update — verify ownership first
    await assertGoalOwnership(db, id, orgId)

    await db
      .update(budgetGoals)
      .set({
        name,
        targetCents,
        period,
        patrimonyTargetCents,
        patrimonyDeadline,
      })
      .where(eq(budgetGoals.id, id))
  } else {
    // Insert
    await db.insert(budgetGoals).values({
      orgId,
      type,
      name,
      targetCents,
      period,
      patrimonyTargetCents,
      patrimonyDeadline,
    })
  }

  revalidateBudgetPaths()
}

/**
 * Server action: delete a budget goal by id.
 * Verifies ownership before deletion.
 */
export async function deleteBudgetGoal(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const id = formData.get('id') as string

  await assertGoalOwnership(db, id, orgId)

  await db.delete(budgetGoals).where(eq(budgetGoals.id, id))

  revalidateBudgetPaths()
}

// ---------------------------------------------------------------------------
// Category Limits
// ---------------------------------------------------------------------------

/**
 * Server action: save category limits for a budget goal.
 * Reads goalId and a JSON string of `{categoryId, limitCents}[]` from FormData.
 * Deletes all existing limits for the goal and re-inserts the new set.
 */
export async function saveCategoryLimits(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const goalId = formData.get('goalId') as string
  const limitsJson = formData.get('limits') as string

  // Verify goal belongs to org
  await assertGoalOwnership(db, goalId, orgId)

  const limits: { categoryId: string; limitCents: number }[] = JSON.parse(limitsJson)

  // Delete existing limits and re-insert
  await db.delete(budgetCategoryLimits).where(eq(budgetCategoryLimits.budgetGoalId, goalId))

  if (limits.length > 0) {
    await db.insert(budgetCategoryLimits).values(
      limits.map((l) => ({
        budgetGoalId: goalId,
        categoryId: l.categoryId,
        limitCents: l.limitCents,
      })),
    )
  }

  revalidateBudgetPaths()
}

// ---------------------------------------------------------------------------
// Budget Adjustments
// ---------------------------------------------------------------------------

/**
 * Server action: create a budget adjustment.
 * Verifies goal ownership before inserting.
 */
export async function createAdjustment(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const goalId = formData.get('goalId') as string
  const amountCents = parseInt(formData.get('amountCents') as string, 10)
  const description = formData.get('description') as string
  const dateStr = formData.get('date') as string

  // Verify goal belongs to org
  await assertGoalOwnership(db, goalId, orgId)

  await db.insert(budgetAdjustments).values({
    budgetGoalId: goalId,
    amountCents,
    description,
    date: new Date(dateStr),
  })

  revalidateBudgetPaths()
}

/**
 * Server action: delete a budget adjustment by id.
 * Verifies goal ownership through the adjustment's budgetGoalId.
 */
export async function deleteAdjustment(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const id = formData.get('id') as string

  // Look up the adjustment to find its goal, then verify ownership
  const [adjustment] = await db
    .select()
    .from(budgetAdjustments)
    .where(eq(budgetAdjustments.id, id))
    .limit(1)

  if (!adjustment) {
    throw new Error(`Adjustment ${id} not found`)
  }

  await assertGoalOwnership(db, adjustment.budgetGoalId, orgId)

  await db.delete(budgetAdjustments).where(eq(budgetAdjustments.id, id))

  revalidateBudgetPaths()
}
