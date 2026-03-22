'use server'

import { revalidatePath } from 'next/cache'
import { getDb, debts, categories } from '@floow/db'
import { eq, and } from 'drizzle-orm'
import { getOrgId } from './queries'

export async function createDebt(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const name = formData.get('name') as string
  const type = formData.get('type') as string
  const totalCents = parseInt(formData.get('totalCents') as string, 10)
  const installments = parseInt(formData.get('installments') as string, 10)
  const installmentCents = parseInt(formData.get('installmentCents') as string, 10)
  const interestRate = formData.get('interestRate') as string | null
  const startDate = new Date(formData.get('startDate') as string)
  let categoryId = formData.get('categoryId') as string | null

  // Auto-create category if not provided
  if (!categoryId || categoryId === '__new__') {
    const categoryName = `Dívidas: ${name}`
    const [newCat] = await db.insert(categories).values({
      orgId,
      name: categoryName,
      type: 'expense',
    }).returning()
    categoryId = newCat.id
  }

  await db.insert(debts).values({
    orgId,
    name,
    type,
    totalCents,
    installments,
    installmentCents,
    interestRate: interestRate || null,
    startDate,
    categoryId,
  })

  revalidatePath('/debts')
  revalidatePath('/dashboard')
}

export async function updateDebt(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const id = formData.get('id') as string
  const name = formData.get('name') as string
  const type = formData.get('type') as string
  const totalCents = parseInt(formData.get('totalCents') as string, 10)
  const installments = parseInt(formData.get('installments') as string, 10)
  const installmentCents = parseInt(formData.get('installmentCents') as string, 10)
  const interestRate = formData.get('interestRate') as string | null

  await db
    .update(debts)
    .set({ name, type, totalCents, installments, installmentCents, interestRate: interestRate || null })
    .where(and(eq(debts.id, id), eq(debts.orgId, orgId)))

  revalidatePath('/debts')
}

export async function deleteDebt(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()
  const id = formData.get('id') as string

  await db.delete(debts).where(and(eq(debts.id, id), eq(debts.orgId, orgId)))

  revalidatePath('/debts')
  revalidatePath('/dashboard')
}
