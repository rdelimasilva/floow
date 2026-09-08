'use server'
import { getDb, fixedAssets, fixedAssetTypes, transactions } from '@floow/db'
import { createFixedAssetSchema, updateFixedAssetSchema, updateAssetValueSchema } from '@floow/shared'
import { eq, and, or, isNull, ilike } from 'drizzle-orm'
import { getOrgId } from '@/lib/finance/queries'
import { fixedAssetsTag, fixedAssetTypesTag, snapshotsTag, invalidateTag } from '@/lib/cache-tags'

function revalidateFixedAssetData(orgId: string) {
  invalidateTag(fixedAssetsTag(orgId))
  invalidateTag(snapshotsTag(orgId))
}

function revalidateFixedAssetTypeData(orgId: string) {
  invalidateTag(fixedAssetTypesTag(orgId))
}

type Db = ReturnType<typeof getDb>

/**
 * Mesma cerca de `assertAccountOwnership` em `lib/finance/actions.ts`: sem
 * ela um `acquisitionTransactionId` de outra org gravaria referência
 * cross-tenant, e a tela do bem exibiria o lançamento de outro cliente.
 *
 * Devolve `null` quando não há vínculo, para o insert/update gravar NULL em
 * vez de deixar o valor antigo.
 */
async function resolveAcquisitionTransactionId(
  db: Db,
  orgId: string,
  transactionId: string | undefined,
): Promise<string | null> {
  if (!transactionId) return null

  const [row] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.id, transactionId), eq(transactions.orgId, orgId)))
    .limit(1)

  if (!row) throw new Error('Lançamento de aquisição não encontrado nesta organização.')

  return row.id
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
    acquisitionTransactionId: formData.get('acquisitionTransactionId') || undefined,
  })

  const acquisitionTransactionId = await resolveAcquisitionTransactionId(
    db,
    orgId,
    input.acquisitionTransactionId,
  )

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
      acquisitionTransactionId,
    })
    .returning()

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
    acquisitionTransactionId: formData.get('acquisitionTransactionId') || undefined,
  })

  const acquisitionTransactionId = await resolveAcquisitionTransactionId(
    db,
    orgId,
    input.acquisitionTransactionId,
  )

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
      acquisitionTransactionId,
      updatedAt: new Date(),
    })
    .where(and(eq(fixedAssets.id, input.id), eq(fixedAssets.orgId, orgId)))

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

  revalidateFixedAssetData(orgId)
}
