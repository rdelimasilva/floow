import { z } from 'zod'

export const createFixedAssetSchema = z.object({
  name: z.string().min(1).max(200),
  typeId: z.string().uuid(),
  purchaseValueCents: z.number().int().positive(),
  purchaseDate: z.coerce.date(),
  annualRate: z.number().min(-1).max(1),
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
