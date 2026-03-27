'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { getDb, fixedAssets, fixedAssetTypes } from '@floow/db'
import { createFixedAssetSchema, updateFixedAssetSchema, updateAssetValueSchema } from '@floow/shared'
import { eq, and, or, isNull, ilike } from 'drizzle-orm'
import { getOrgId } from '@/lib/finance/queries'
import { fixedAssetsTag, fixedAssetTypesTag, snapshotsTag } from '@/lib/cache-tags'

function revalidateFixedAssetData(orgId: string) {
  revalidateTag(fixedAssetsTag(orgId))
  revalidateTag(snapshotsTag(orgId))
}

function revalidateFixedAssetTypeData(orgId: string) {
  revalidateTag(fixedAssetTypesTag(orgId))
}

// -- Asset Type CRUD --

export async function createFixedAssetType(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()
  const name = formData.get('name') as string
  if (!name?.trim()) throw new Error('Nome é obrigatório')

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
  revalidateFixedAssetTypeData(orgId)
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
  revalidateFixedAssetTypeData(orgId)
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
  revalidateFixedAssetTypeData(orgId)
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
  revalidateFixedAssetData(orgId)
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
  revalidateFixedAssetData(orgId)
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
  revalidateFixedAssetData(orgId)
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
  revalidateFixedAssetData(orgId)
}
